-- ==============================================================================
-- SAAS DE GESTÃO DE MARKETPLACES E ERP (PADRÃO TINY & BLING)
-- Migration: 20261008000000_create_master_account_and_multitenancy.sql
-- Descrição: Estrutura completa de Conta Mestra, Organizações (Tenants),
--            Perfis de Acesso (RBAC), Auditoria e Funções Transacionais.
-- ==============================================================================

-- 1. Habilitar extensões de segurança e UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- 2. TABELA: organizations (Contas da Empresa / Tenants do ERP)
-- Modelo idêntico aos ERPs Tiny e Bling (Identificador amigável de Conta + Documento)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(16) NOT NULL UNIQUE, -- Ex: 'EMP-98241', identificador amigável da conta ERP
    trade_name VARCHAR(255) NOT NULL, -- Nome Fantasia / Loja
    corporate_name VARCHAR(255), -- Razão Social Oficial
    document_type VARCHAR(10) NOT NULL CHECK (document_type IN ('cnpj', 'cpf')),
    document_number VARCHAR(18) NOT NULL, -- Documento limpo (apenas dígitos)
    state_registration VARCHAR(32) DEFAULT 'ISENTO', -- Inscrição Estadual
    phone VARCHAR(24) NOT NULL, -- Telefone / WhatsApp Corporativo
    plan_tier VARCHAR(32) NOT NULL DEFAULT 'trial' CHECK (plan_tier IN ('trial', 'starter', 'pro', 'enterprise')),
    plan_status VARCHAR(32) NOT NULL DEFAULT 'active' CHECK (plan_status IN ('active', 'past_due', 'suspended', 'cancelled')),
    trial_ends_at TIMESTAMPTZ NOT NULL DEFAULT (timezone('utc'::text, now()) + interval '30 days'),
    settings JSONB NOT NULL DEFAULT '{
        "tax_regime": "simples_nacional",
        "notifications_email": true,
        "notifications_whatsapp": false,
        "auto_sync_catalog": true
    }'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_organizations_document UNIQUE (document_number)
);

CREATE INDEX IF NOT EXISTS idx_organizations_code ON public.organizations(code);
CREATE INDEX IF NOT EXISTS idx_organizations_document ON public.organizations(document_number);

-- ==============================================================================
-- 3. TABELA: user_profiles (Perfis de Usuários & Vínculo Multi-Tenant)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.user_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    full_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(24),
    role VARCHAR(32) NOT NULL DEFAULT 'master_admin' CHECK (role IN ('master_admin', 'admin', 'operator', 'finance', 'read_only')),
    is_master BOOLEAN NOT NULL DEFAULT false, -- Define o titular da Conta Mestra (como no Tiny/Bling)
    status VARCHAR(24) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'pending_confirmation', 'suspended')),
    avatar_url TEXT,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_user_profiles_email UNIQUE (email)
);

CREATE INDEX IF NOT EXISTS idx_user_profiles_organization_id ON public.user_profiles(organization_id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_email ON public.user_profiles(email);
CREATE INDEX IF NOT EXISTS idx_user_profiles_role ON public.user_profiles(role);

-- ==============================================================================
-- 4. TABELA: auth_audit_logs (Auditoria de Segurança e Conformidade LGPD)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.auth_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    event_type VARCHAR(64) NOT NULL, -- 'signup_master', 'login_success', 'login_failed', 'password_reset_request', etc.
    ip_address VARCHAR(45),
    user_agent TEXT,
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_auth_audit_logs_org_created ON public.auth_audit_logs(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_auth_audit_logs_user_created ON public.auth_audit_logs(user_id, created_at DESC);

-- ==============================================================================
-- 5. TRIGGERS DE ATUALIZAÇÃO AUTOMÁTICA updated_at
-- ==============================================================================
DROP TRIGGER IF EXISTS trg_organizations_updated_at ON public.organizations;
CREATE TRIGGER trg_organizations_updated_at
    BEFORE UPDATE ON public.organizations
    FOR EACH ROW
    EXECUTE FUNCTION trigger_set_timestamp();

DROP TRIGGER IF EXISTS trg_user_profiles_updated_at ON public.user_profiles;
CREATE TRIGGER trg_user_profiles_updated_at
    BEFORE UPDATE ON public.user_profiles
    FOR EACH ROW
    EXECUTE FUNCTION trigger_set_timestamp();

-- ==============================================================================
-- 6. FUNÇÃO AUXILIAR: Geração de Código Amigável de Conta Tiny/Bling (Ex: EMP-18492)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.generate_unique_account_code()
RETURNS TEXT AS $$
DECLARE
    new_code TEXT;
    code_exists BOOLEAN;
    attempt_count INT := 0;
BEGIN
    LOOP
        attempt_count := attempt_count + 1;
        -- Gera código de 5 a 6 dígitos precedido de 'EMP-'
        new_code := 'EMP-' || lpad((floor(random() * 900000 + 100000)::int)::text, 6, '0');
        
        SELECT EXISTS(SELECT 1 FROM public.organizations WHERE code = new_code) INTO code_exists;
        
        IF NOT code_exists THEN
            RETURN new_code;
        END IF;

        IF attempt_count > 50 THEN
            -- Fallback com milissegundos
            RETURN 'EMP-' || to_char(now(), 'SSMS');
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- ==============================================================================
-- 7. STORED PROCEDURE: Cadastro Atômico e Seguro da Conta Mestra (Tiny & Bling Pattern)
-- Cria simultaneamente a Empresa (Tenant) e o Perfil do Titular Mestre
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.register_master_account(
    p_user_id UUID,
    p_full_name TEXT,
    p_email TEXT,
    p_phone TEXT,
    p_trade_name TEXT,
    p_corporate_name TEXT,
    p_document_type TEXT,
    p_document_number TEXT,
    p_state_registration TEXT DEFAULT 'ISENTO',
    p_ip_address TEXT DEFAULT NULL,
    p_user_agent TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_org_id UUID;
    v_account_code TEXT;
    v_clean_doc TEXT;
    v_result JSONB;
BEGIN
    -- 1. Sanitização do documento (remove pontuações)
    v_clean_doc := regexp_replace(p_document_number, '\D', '', 'g');

    IF length(v_clean_doc) < 11 THEN
        RAISE EXCEPTION 'Documento informado inválido. Deve possuir 11 dígitos (CPF) ou 14 dígitos (CNPJ)';
    END IF;

    -- 2. Verifica se o documento já está cadastrado em outra organização
    IF EXISTS (SELECT 1 FROM public.organizations WHERE document_number = v_clean_doc) THEN
        RAISE EXCEPTION 'O documento informado (%s) já está cadastrado em outra conta do ERP.', p_document_number;
    END IF;

    -- 3. Verifica se o perfil de usuário já existe
    IF EXISTS (SELECT 1 FROM public.user_profiles WHERE id = p_user_id) THEN
        RAISE EXCEPTION 'O usuário informado já possui um perfil associado.';
    END IF;

    -- 4. Gera código exclusivo da conta
    v_account_code := public.generate_unique_account_code();

    -- 5. Cria a Organização (Tenant) com 30 dias de trial
    INSERT INTO public.organizations (
        code,
        trade_name,
        corporate_name,
        document_type,
        document_number,
        state_registration,
        phone,
        plan_tier,
        plan_status,
        trial_ends_at
    ) VALUES (
        v_account_code,
        trim(p_trade_name),
        trim(COALESCE(p_corporate_name, p_trade_name)),
        lower(trim(p_document_type)),
        v_clean_doc,
        COALESCE(trim(p_state_registration), 'ISENTO'),
        trim(p_phone),
        'trial',
        'active',
        (timezone('utc'::text, now()) + interval '30 days')
    )
    RETURNING id INTO v_org_id;

    -- 6. Cria o Perfil do Administrador Mestre da Conta
    INSERT INTO public.user_profiles (
        id,
        organization_id,
        full_name,
        email,
        phone,
        role,
        is_master,
        status
    ) VALUES (
        p_user_id,
        v_org_id,
        trim(p_full_name),
        lower(trim(p_email)),
        trim(p_phone),
        'master_admin',
        true,
        'active'
    );

    -- 7. Registra Log de Auditoria do Cadastro da Conta Mestra
    INSERT INTO public.auth_audit_logs (
        organization_id,
        user_id,
        event_type,
        ip_address,
        user_agent,
        details
    ) VALUES (
        v_org_id,
        p_user_id,
        'signup_master',
        p_ip_address,
        p_user_agent,
        json_build_object(
            'account_code', v_account_code,
            'trade_name', p_trade_name,
            'document_type', p_document_type,
            'trial_period_days', 30
        )::jsonb
    );

    -- 8. Constrói e retorna o objeto consolidado
    SELECT json_build_object(
        'success', true,
        'organization', json_build_object(
            'id', o.id,
            'code', o.code,
            'trade_name', o.trade_name,
            'corporate_name', o.corporate_name,
            'document_type', o.document_type,
            'document_number', o.document_number,
            'state_registration', o.state_registration,
            'plan_tier', o.plan_tier,
            'plan_status', o.plan_status,
            'trial_ends_at', o.trial_ends_at
        ),
        'user_profile', json_build_object(
            'id', u.id,
            'full_name', u.full_name,
            'email', u.email,
            'role', u.role,
            'is_master', u.is_master
        )
    )::jsonb INTO v_result
    FROM public.organizations o
    JOIN public.user_profiles u ON u.organization_id = o.id
    WHERE o.id = v_org_id;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==============================================================================
-- 8. FUNÇÕES AUXILIARES DE RLS (CONTEXTO MULTI-TENANT)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.get_current_user_org_id()
RETURNS UUID AS $$
    SELECT organization_id FROM public.user_profiles WHERE id = auth.uid() LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.is_current_user_master()
RETURNS BOOLEAN AS $$
    SELECT COALESCE(is_master, false) FROM public.user_profiles WHERE id = auth.uid() LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ==============================================================================
-- 9. HABILITAÇÃO DE ROW LEVEL SECURITY (RLS)
-- ==============================================================================
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auth_audit_logs ENABLE ROW LEVEL SECURITY;

-- Políticas para organizations
DROP POLICY IF EXISTS "Usuários podem ver a própria organização" ON public.organizations;
CREATE POLICY "Usuários podem ver a própria organização"
    ON public.organizations
    FOR SELECT
    USING (id = public.get_current_user_org_id());

DROP POLICY IF EXISTS "Apenas Administradores Mestres podem atualizar dados da organização" ON public.organizations;
CREATE POLICY "Apenas Administradores Mestres podem atualizar dados da organização"
    ON public.organizations
    FOR UPDATE
    USING (
        id = public.get_current_user_org_id()
        AND (
            public.is_current_user_master() = true
            OR EXISTS (
                SELECT 1 FROM public.user_profiles
                WHERE id = auth.uid() AND role IN ('master_admin', 'admin')
            )
        )
    );

-- Políticas para user_profiles
DROP POLICY IF EXISTS "Usuários podem ver perfis da sua organização" ON public.user_profiles;
CREATE POLICY "Usuários podem ver perfis da sua organização"
    ON public.user_profiles
    FOR SELECT
    USING (organization_id = public.get_current_user_org_id());

DROP POLICY IF EXISTS "Usuários podem atualizar o próprio perfil" ON public.user_profiles;
CREATE POLICY "Usuários podem atualizar o próprio perfil"
    ON public.user_profiles
    FOR UPDATE
    USING (id = auth.uid());

-- Políticas para auth_audit_logs
DROP POLICY IF EXISTS "Administradores podem visualizar logs de auditoria da organização" ON public.auth_audit_logs;
CREATE POLICY "Administradores podem visualizar logs de auditoria da organização"
    ON public.auth_audit_logs
    FOR SELECT
    USING (
        organization_id = public.get_current_user_org_id()
        AND (
            public.is_current_user_master() = true
            OR EXISTS (
                SELECT 1 FROM public.user_profiles
                WHERE id = auth.uid() AND role IN ('master_admin', 'admin')
            )
        )
    );

-- ==============================================================================
-- 10. COMPATIBILIDADE COM O USUÁRIO DEMO EXISTENTE
-- Vincula o usuário padrão existente '00000000-0000-0000-0000-000000000001'
-- ==============================================================================
DO $$
DECLARE
    demo_user_id CONSTANT UUID := '00000000-0000-0000-0000-000000000001';
    demo_org_id UUID;
BEGIN
    IF EXISTS (SELECT 1 FROM auth.users WHERE id = demo_user_id) THEN
        -- Cria organização demo se não existir
        INSERT INTO public.organizations (
            code,
            trade_name,
            corporate_name,
            document_type,
            document_number,
            phone,
            plan_tier,
            plan_status
        ) VALUES (
            'EMP-100001',
            'Empresa Demonstração ERP',
            'Demonstração Marketplaces SAAS Ltda',
            'cnpj',
            '12345678000195',
            '(11) 98765-4321',
            'pro',
            'active'
        )
        ON CONFLICT (document_number) DO UPDATE SET trade_name = EXCLUDED.trade_name
        RETURNING id INTO demo_org_id;

        -- Vincula o perfil do usuário demo
        INSERT INTO public.user_profiles (
            id,
            organization_id,
            full_name,
            email,
            role,
            is_master,
            status
        ) VALUES (
            demo_user_id,
            demo_org_id,
            'Administrador Mestre (Demo)',
            'admin@crmmarketplaces.com',
            'master_admin',
            true,
            'active'
        )
        ON CONFLICT (id) DO UPDATE SET organization_id = EXCLUDED.organization_id;
    END IF;
END $$;
