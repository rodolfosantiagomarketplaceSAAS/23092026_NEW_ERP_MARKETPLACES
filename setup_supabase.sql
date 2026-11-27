-- ==============================================================================
-- ERP MARKETPLACES & INTELIGÊNCIA COMPETITIVA (MERCADO LIVRE & SHOPEE)
-- Arquivo: setup_supabase.sql (Script Definitivo para Nova Instância Zerada)
-- Compatível com: Supabase PostgreSQL 15+ (Free Tier & Pro)
-- Características:
--   * 100% Idempotente e em ordem exata de dependências (Zero erros de FK)
--   * 20 Tabelas + 1 View (security_invoker) + 9 Funções/RPCs + Triggers + Índices
--   * Isolamento Multi-Tenant com RLS rigoroso e proteção de Tokens OAuth
--   * Pronto para copiar, colar no SQL Editor do Supabase e clicar em RUN
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. EXTENSÕES E TIPOS ENUM DE DOMÍNIO
-- ------------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$ BEGIN
    CREATE TYPE public.platform_type AS ENUM ('mercadolivre', 'shopee');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE public.listing_status_type AS ENUM ('active', 'paused', 'closed');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE public.shipping_badge_type AS ENUM (
        'ml_full', 'ml_flex', 'ml_coleta', 'ml_correios',
        'shopee_xpress', 'shopee_padrao', 'shopee_frete_gratis', 'outros'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- ------------------------------------------------------------------------------
-- 2. FUNÇÃO UTILITÁRIA GLOBAL DE TIMESTAMP (updated_at em UTC)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trigger_set_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at := timezone('utc'::text, now());
    RETURN NEW;
END;
$$;

-- ==============================================================================
-- 3. MÓDULO MULTI-TENANT, CONTA MESTRA, PERFIS E AUDITORIA (LGPD)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(16) NOT NULL UNIQUE,
    trade_name VARCHAR(255) NOT NULL,
    corporate_name VARCHAR(255),
    document_type VARCHAR(10) NOT NULL CHECK (document_type IN ('cnpj', 'cpf')),
    document_number VARCHAR(18) NOT NULL,
    state_registration VARCHAR(32) DEFAULT 'ISENTO',
    phone VARCHAR(24) NOT NULL,
    plan_tier VARCHAR(32) NOT NULL DEFAULT 'trial'
        CHECK (plan_tier IN ('trial', 'starter', 'pro', 'enterprise')),
    plan_status VARCHAR(32) NOT NULL DEFAULT 'active'
        CHECK (plan_status IN ('active', 'past_due', 'suspended', 'cancelled')),
    trial_ends_at TIMESTAMPTZ NOT NULL DEFAULT (timezone('utc'::text, now()) + INTERVAL '30 days'),
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

DROP TRIGGER IF EXISTS trg_organizations_updated_at ON public.organizations;
CREATE TRIGGER trg_organizations_updated_at
    BEFORE UPDATE ON public.organizations
    FOR EACH ROW EXECUTE FUNCTION public.trigger_set_timestamp();

CREATE TABLE IF NOT EXISTS public.user_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    full_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(24),
    role VARCHAR(32) NOT NULL DEFAULT 'master_admin'
        CHECK (role IN ('master_admin', 'admin', 'operator', 'finance', 'read_only')),
    is_master BOOLEAN NOT NULL DEFAULT false,
    status VARCHAR(24) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'pending_confirmation', 'suspended')),
    avatar_url TEXT,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_user_profiles_email UNIQUE (email)
);

CREATE INDEX IF NOT EXISTS idx_user_profiles_organization_id ON public.user_profiles(organization_id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_email ON public.user_profiles(email);
CREATE INDEX IF NOT EXISTS idx_user_profiles_role ON public.user_profiles(role);

DROP TRIGGER IF EXISTS trg_user_profiles_updated_at ON public.user_profiles;
CREATE TRIGGER trg_user_profiles_updated_at
    BEFORE UPDATE ON public.user_profiles
    FOR EACH ROW EXECUTE FUNCTION public.trigger_set_timestamp();

CREATE TABLE IF NOT EXISTS public.auth_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    event_type VARCHAR(64) NOT NULL,
    ip_address VARCHAR(45),
    user_agent TEXT,
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_auth_audit_logs_org_created
    ON public.auth_audit_logs(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_auth_audit_logs_user_created
    ON public.auth_audit_logs(user_id, created_at DESC);

-- Funções auxiliares Multi-Tenant (usadas nas políticas de RLS de todo o sistema)
CREATE OR REPLACE FUNCTION public.get_current_user_org_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT organization_id FROM public.user_profiles WHERE id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_current_user_master()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COALESCE(is_master, false) FROM public.user_profiles WHERE id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.generate_unique_account_code()
RETURNS TEXT
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    new_code TEXT;
    code_exists BOOLEAN;
    attempt_count INT := 0;
BEGIN
    LOOP
        attempt_count := attempt_count + 1;
        new_code := 'EMP-' || lpad((floor(random() * 900000 + 100000)::int)::text, 6, '0');
        SELECT EXISTS(SELECT 1 FROM public.organizations WHERE code = new_code) INTO code_exists;
        IF NOT code_exists THEN
            RETURN new_code;
        END IF;
        IF attempt_count > 50 THEN
            RETURN 'EMP-' || to_char(now(), 'SSMS');
        END IF;
    END LOOP;
END;
$$;

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
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_org_id UUID;
    v_account_code TEXT;
    v_clean_doc TEXT;
    v_result JSONB;
BEGIN
    v_clean_doc := regexp_replace(p_document_number, '\D', '', 'g');

    IF length(v_clean_doc) < 11 THEN
        RAISE EXCEPTION 'Documento informado inválido. Deve possuir 11 dígitos (CPF) ou 14 dígitos (CNPJ).';
    END IF;

    IF EXISTS (SELECT 1 FROM public.organizations WHERE document_number = v_clean_doc) THEN
        RAISE EXCEPTION 'O documento informado (%) já está cadastrado em outra conta do ERP.', p_document_number;
    END IF;

    IF EXISTS (SELECT 1 FROM public.user_profiles WHERE id = p_user_id) THEN
        RAISE EXCEPTION 'O usuário informado já possui um perfil associado.';
    END IF;

    v_account_code := public.generate_unique_account_code();

    INSERT INTO public.organizations (
        code, trade_name, corporate_name, document_type, document_number,
        state_registration, phone, plan_tier, plan_status, trial_ends_at
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
        (timezone('utc'::text, now()) + INTERVAL '30 days')
    )
    RETURNING id INTO v_org_id;

    INSERT INTO public.user_profiles (
        id, organization_id, full_name, email, phone, role, is_master, status
    ) VALUES (
        p_user_id, v_org_id, trim(p_full_name), lower(trim(p_email)),
        trim(p_phone), 'master_admin', true, 'active'
    );

    INSERT INTO public.auth_audit_logs (
        organization_id, user_id, event_type, ip_address, user_agent, details
    ) VALUES (
        v_org_id, p_user_id, 'signup_master', p_ip_address, p_user_agent,
        jsonb_build_object(
            'account_code', v_account_code,
            'trade_name', p_trade_name,
            'document_type', p_document_type,
            'trial_period_days', 30
        )
    );

    SELECT jsonb_build_object(
        'success', true,
        'organization', jsonb_build_object(
            'id', o.id, 'code', o.code, 'trade_name', o.trade_name,
            'corporate_name', o.corporate_name, 'document_type', o.document_type,
            'document_number', o.document_number, 'state_registration', o.state_registration,
            'plan_tier', o.plan_tier, 'plan_status', o.plan_status,
            'trial_ends_at', o.trial_ends_at
        ),
        'user_profile', jsonb_build_object(
            'id', u.id, 'full_name', u.full_name, 'email', u.email,
            'role', u.role, 'is_master', u.is_master
        )
    ) INTO v_result
    FROM public.organizations o
    JOIN public.user_profiles u ON u.organization_id = o.id
    WHERE o.id = v_org_id;

    RETURN v_result;
END;
$$;

-- ==============================================================================
-- 4. INTEGRAÇÕES DE MARKETPLACES (OAUTH 2.0 CRIPTOGRAFADO AES-256-GCM)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.marketplace_integrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    platform public.platform_type NOT NULL,
    account_name VARCHAR(128) NOT NULL,
    seller_id VARCHAR(64) NOT NULL,
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    token_expires_at TIMESTAMPTZ,
    is_active BOOLEAN NOT NULL DEFAULT true,
    status VARCHAR(24) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'reauth_required')),
    scopes TEXT,
    last_refreshed_at TIMESTAMPTZ,
    refresh_lock_until TIMESTAMPTZ,
    last_error TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_marketplace_integrations_org_platform_seller
    ON public.marketplace_integrations(organization_id, platform, seller_id)
    WHERE organization_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_marketplace_integrations_user_platform_seller
    ON public.marketplace_integrations(user_id, platform, seller_id)
    WHERE organization_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_marketplace_integrations_user_active
    ON public.marketplace_integrations(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_marketplace_integrations_org_active
    ON public.marketplace_integrations(organization_id, platform, is_active);
CREATE INDEX IF NOT EXISTS idx_marketplace_integrations_platform
    ON public.marketplace_integrations(platform, is_active);
CREATE INDEX IF NOT EXISTS idx_marketplace_integrations_expiry
    ON public.marketplace_integrations(platform, token_expires_at)
    WHERE is_active = true;

DROP TRIGGER IF EXISTS trg_marketplace_integrations_timestamp ON public.marketplace_integrations;
CREATE TRIGGER trg_marketplace_integrations_timestamp
    BEFORE UPDATE ON public.marketplace_integrations
    FOR EACH ROW EXECUTE FUNCTION public.trigger_set_timestamp();

-- ==============================================================================
-- 5. CATÁLOGO MESTRE, ANÚNCIOS PRÓPRIOS, CONCORRENTES, PAREAMENTO E REPRICING
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    sku VARCHAR(64) NOT NULL,
    title VARCHAR(255) NOT NULL,
    cost_price NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (cost_price >= 0),
    min_selling_price NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (min_selling_price >= 0),
    packaging_cost NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    tax_rate_pct NUMERIC(5, 2) NOT NULL DEFAULT 6.00,
    target_margin_pct NUMERIC(5, 2) NOT NULL DEFAULT 15.00,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_products_user_sku UNIQUE (user_id, sku)
);

CREATE INDEX IF NOT EXISTS idx_products_user_sku ON public.products(user_id, sku);

DROP TRIGGER IF EXISTS trg_products_updated_at ON public.products;
CREATE TRIGGER trg_products_updated_at
    BEFORE UPDATE ON public.products
    FOR EACH ROW EXECUTE FUNCTION public.trigger_set_timestamp();

CREATE TABLE IF NOT EXISTS public.my_listings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
    platform public.platform_type NOT NULL,
    external_id VARCHAR(64) NOT NULL,
    title VARCHAR(255) NOT NULL,
    current_price NUMERIC(12, 2) NOT NULL CHECK (current_price >= 0),
    original_price NUMERIC(12, 2),
    permalink TEXT NOT NULL,
    thumbnail_url TEXT,
    shipping_type VARCHAR(64) NOT NULL DEFAULT 'padrao',
    listing_type VARCHAR(64) NOT NULL DEFAULT 'classico',
    status public.listing_status_type NOT NULL DEFAULT 'active',
    sub_status VARCHAR(64),
    -- Métricas de vendas, estoque e visitas
    sold_quantity INTEGER DEFAULT 0,
    available_quantity INTEGER DEFAULT 0,
    sales_count_approx INTEGER DEFAULT 0,
    visits INTEGER DEFAULT 0,
    sales_last_7_days INTEGER DEFAULT 0,
    sales_last_30_days INTEGER DEFAULT 0,
    sales_trend VARCHAR(20) DEFAULT 'stable',
    sales_history JSONB DEFAULT '[]'::jsonb,
    listing_created_at TIMESTAMPTZ,
    -- Tarifas, frete e precificação
    marketplace_commission_pct NUMERIC(5, 2) NOT NULL DEFAULT 12.00,
    fixed_fee NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    average_shipping_cost NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    sale_fee_amount NUMERIC(12, 2) DEFAULT 0.00,
    sale_fee_pct NUMERIC(6, 2) DEFAULT 0.00,
    shipping_cost NUMERIC(12, 2) DEFAULT 0.00,
    free_shipping BOOLEAN DEFAULT false,
    net_amount NUMERIC(12, 2) DEFAULT 0.00,
    quality_score INTEGER,
    -- Hierarquia User Products ML
    family_id VARCHAR(64),
    family_name VARCHAR(255),
    user_product_id VARCHAR(64),
    parent_item_id VARCHAR(64),
    catalog_product_id VARCHAR(64),
    is_catalog BOOLEAN DEFAULT false,
    -- Metadados ricos JSONB
    variations JSONB DEFAULT '[]'::jsonb,
    sale_terms JSONB DEFAULT '[]'::jsonb,
    channels JSONB DEFAULT '[]'::jsonb,
    raw_data JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_my_listings_platform_external UNIQUE (user_id, platform, external_id)
);

CREATE INDEX IF NOT EXISTS idx_my_listings_user_platform ON public.my_listings(user_id, platform);
CREATE INDEX IF NOT EXISTS idx_my_listings_ext_id ON public.my_listings(external_id);
CREATE INDEX IF NOT EXISTS idx_my_listings_product_id ON public.my_listings(product_id);
CREATE INDEX IF NOT EXISTS idx_my_listings_status ON public.my_listings(user_id, status);
CREATE INDEX IF NOT EXISTS idx_my_listings_family_id ON public.my_listings(user_id, platform, family_id);
CREATE INDEX IF NOT EXISTS idx_my_listings_user_product_id ON public.my_listings(user_id, platform, user_product_id);

DROP TRIGGER IF EXISTS trg_my_listings_updated_at ON public.my_listings;
CREATE TRIGGER trg_my_listings_updated_at
    BEFORE UPDATE ON public.my_listings
    FOR EACH ROW EXECUTE FUNCTION public.trigger_set_timestamp();

CREATE TABLE IF NOT EXISTS public.competitor_listings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    platform public.platform_type NOT NULL,
    external_id VARCHAR(64) NOT NULL,
    seller_name VARCHAR(128) NOT NULL DEFAULT 'Vendedor Desconhecido',
    seller_reputation VARCHAR(64),
    title VARCHAR(255) NOT NULL,
    current_price NUMERIC(12, 2) NOT NULL CHECK (current_price >= 0),
    original_price NUMERIC(12, 2) CHECK (original_price IS NULL OR original_price >= current_price),
    shipping_type VARCHAR(64) NOT NULL DEFAULT 'padrao',
    promo_badge VARCHAR(128),
    permalink TEXT NOT NULL,
    thumbnail_url TEXT,
    sales_count_approx INTEGER DEFAULT 0,
    rating NUMERIC(3, 2) DEFAULT 5.0,
    listing_created_at TIMESTAMPTZ,
    last_scraped_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_competitor_listings_platform_external UNIQUE (user_id, platform, external_id)
);

CREATE INDEX IF NOT EXISTS idx_competitor_listings_user_platform ON public.competitor_listings(user_id, platform);
CREATE INDEX IF NOT EXISTS idx_competitor_listings_ext_id ON public.competitor_listings(external_id);
CREATE INDEX IF NOT EXISTS idx_competitor_listings_last_scraped ON public.competitor_listings(last_scraped_at DESC);

DROP TRIGGER IF EXISTS trg_competitor_listings_updated_at ON public.competitor_listings;
CREATE TRIGGER trg_competitor_listings_updated_at
    BEFORE UPDATE ON public.competitor_listings
    FOR EACH ROW EXECUTE FUNCTION public.trigger_set_timestamp();

CREATE TABLE IF NOT EXISTS public.listing_matches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    my_listing_id UUID NOT NULL REFERENCES public.my_listings(id) ON DELETE CASCADE,
    competitor_listing_id UUID NOT NULL REFERENCES public.competitor_listings(id) ON DELETE CASCADE,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_listing_matches_pair UNIQUE (my_listing_id, competitor_listing_id)
);

CREATE INDEX IF NOT EXISTS idx_listing_matches_user_id ON public.listing_matches(user_id);
CREATE INDEX IF NOT EXISTS idx_listing_matches_my_listing ON public.listing_matches(my_listing_id);
CREATE INDEX IF NOT EXISTS idx_listing_matches_competitor ON public.listing_matches(competitor_listing_id);

CREATE TABLE IF NOT EXISTS public.price_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    competitor_listing_id UUID NOT NULL REFERENCES public.competitor_listings(id) ON DELETE CASCADE,
    price NUMERIC(12, 2) NOT NULL CHECK (price >= 0),
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_price_history_competitor_date
    ON public.price_history(competitor_listing_id, recorded_at DESC);

-- Trigger que registra histórico de preços SOMENTE quando há INSERT ou alteração real de preço
CREATE OR REPLACE FUNCTION public.trg_record_competitor_price_history()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF (TG_OP = 'INSERT') OR (TG_OP = 'UPDATE' AND OLD.current_price IS DISTINCT FROM NEW.current_price) THEN
        INSERT INTO public.price_history (competitor_listing_id, price, recorded_at)
        VALUES (NEW.id, NEW.current_price, NEW.last_scraped_at);
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_competitor_price_history_log ON public.competitor_listings;
CREATE TRIGGER trg_competitor_price_history_log
    AFTER INSERT OR UPDATE ON public.competitor_listings
    FOR EACH ROW EXECUTE FUNCTION public.trg_record_competitor_price_history();

CREATE TABLE IF NOT EXISTS public.repricing_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    my_listing_id UUID NOT NULL REFERENCES public.my_listings(id) ON DELETE CASCADE,
    strategy VARCHAR(32) NOT NULL DEFAULT 'undercut',
    difference_value NUMERIC(12, 2) NOT NULL DEFAULT 0.10,
    max_price NUMERIC(12, 2),
    min_price NUMERIC(12, 2),
    respect_min_margin BOOLEAN NOT NULL DEFAULT true,
    on_unviable VARCHAR(32) NOT NULL DEFAULT 'alert_only',
    is_auto_apply BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_repricing_rules_my_listing UNIQUE (my_listing_id)
);

CREATE INDEX IF NOT EXISTS idx_repricing_rules_user ON public.repricing_rules(user_id);
CREATE INDEX IF NOT EXISTS idx_repricing_rules_listing ON public.repricing_rules(my_listing_id);

DROP TRIGGER IF EXISTS trg_repricing_rules_updated_at ON public.repricing_rules;
CREATE TRIGGER trg_repricing_rules_updated_at
    BEFORE UPDATE ON public.repricing_rules
    FOR EACH ROW EXECUTE FUNCTION public.trigger_set_timestamp();

-- ==============================================================================
-- 6. INTELIGÊNCIA DE NEGÓCIOS: ESPIÃO DE LOJAS, SALVOS E CACHE DE PESQUISA
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.competitor_stores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    platform public.platform_type NOT NULL DEFAULT 'mercadolivre',
    store_name VARCHAR(255) NOT NULL,
    seller_id VARCHAR(100),
    seller_nickname VARCHAR(100),
    store_url TEXT NOT NULL,
    segment VARCHAR(100) NOT NULL DEFAULT 'Geral',
    is_following BOOLEAN NOT NULL DEFAULT true,
    seller_reputation VARCHAR(64) DEFAULT 'platinum',
    notes TEXT,
    total_listings INTEGER DEFAULT 0,
    total_sales_approx INTEGER DEFAULT 0,
    avg_ticket NUMERIC(12, 2) DEFAULT 0,
    last_scraped_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_competitor_stores_user_platform_url UNIQUE (user_id, platform, store_url)
);

CREATE INDEX IF NOT EXISTS idx_competitor_stores_user_following ON public.competitor_stores(user_id, is_following);
CREATE INDEX IF NOT EXISTS idx_competitor_stores_segment ON public.competitor_stores(user_id, segment);

DROP TRIGGER IF EXISTS trg_competitor_stores_updated_at ON public.competitor_stores;
CREATE TRIGGER trg_competitor_stores_updated_at
    BEFORE UPDATE ON public.competitor_stores
    FOR EACH ROW EXECUTE FUNCTION public.trigger_set_timestamp();

CREATE TABLE IF NOT EXISTS public.competitor_store_listings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.competitor_stores(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    platform public.platform_type NOT NULL DEFAULT 'mercadolivre',
    external_id VARCHAR(64) NOT NULL,
    title VARCHAR(255) NOT NULL,
    current_price NUMERIC(12, 2) NOT NULL CHECK (current_price >= 0),
    original_price NUMERIC(12, 2),
    discount_pct INTEGER,
    sales_count_approx INTEGER DEFAULT 0,
    listing_created_at TIMESTAMPTZ,
    shipping_type VARCHAR(64) NOT NULL DEFAULT 'padrao',
    is_full BOOLEAN NOT NULL DEFAULT false,
    is_free_shipping BOOLEAN NOT NULL DEFAULT false,
    promo_badge VARCHAR(128),
    permalink TEXT NOT NULL,
    thumbnail_url TEXT,
    rating NUMERIC(3, 2) DEFAULT 5.0,
    reviews_count INTEGER DEFAULT 0,
    estimated_sale_fee NUMERIC(12, 2) DEFAULT 0,
    estimated_net NUMERIC(12, 2) DEFAULT 0,
    last_scraped_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_competitor_store_listings UNIQUE (user_id, store_id, external_id)
);

CREATE INDEX IF NOT EXISTS idx_competitor_store_listings_store_id ON public.competitor_store_listings(store_id);
CREATE INDEX IF NOT EXISTS idx_competitor_store_listings_sales ON public.competitor_store_listings(sales_count_approx DESC);
CREATE INDEX IF NOT EXISTS idx_competitor_store_listings_created_at ON public.competitor_store_listings(listing_created_at DESC);
CREATE INDEX IF NOT EXISTS idx_competitor_store_listings_ext_id ON public.competitor_store_listings(external_id);

DROP TRIGGER IF EXISTS trg_competitor_store_listings_updated_at ON public.competitor_store_listings;
CREATE TRIGGER trg_competitor_store_listings_updated_at
    BEFORE UPDATE ON public.competitor_store_listings
    FOR EACH ROW EXECUTE FUNCTION public.trigger_set_timestamp();

CREATE TABLE IF NOT EXISTS public.competitor_saved_listings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
    platform TEXT NOT NULL DEFAULT 'mercadolivre' CHECK (platform IN ('mercadolivre', 'shopee')),
    external_id TEXT NOT NULL,
    title TEXT NOT NULL,
    current_price NUMERIC(12, 2) NOT NULL DEFAULT 0,
    original_price NUMERIC(12, 2),
    discount_pct INTEGER,
    promo_badge TEXT,
    sales_count_approx INTEGER NOT NULL DEFAULT 0,
    listing_created_at TIMESTAMPTZ,
    shipping_type TEXT NOT NULL DEFAULT 'padrao',
    is_full BOOLEAN NOT NULL DEFAULT false,
    is_free_shipping BOOLEAN NOT NULL DEFAULT false,
    listing_type TEXT DEFAULT 'gold_pro',
    is_catalog BOOLEAN NOT NULL DEFAULT false,
    estimated_sale_fee NUMERIC(12, 2) DEFAULT 0,
    estimated_shipping NUMERIC(12, 2) DEFAULT 0,
    estimated_net NUMERIC(12, 2) DEFAULT 0,
    seller_name TEXT NOT NULL DEFAULT 'Concorrente',
    seller_location TEXT,
    seller_reputation TEXT DEFAULT 'platinum',
    store_segment TEXT DEFAULT 'Geral',
    permalink TEXT NOT NULL,
    thumbnail_url TEXT,
    rating NUMERIC(3, 2) DEFAULT 5.0,
    reviews_count INTEGER DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'created')),
    notes TEXT,
    my_created_sku TEXT,
    created_in_store_at TIMESTAMPTZ,
    last_scraped_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_competitor_saved_listings_user_ext
    ON public.competitor_saved_listings(user_id, external_id);
CREATE INDEX IF NOT EXISTS idx_competitor_saved_listings_status
    ON public.competitor_saved_listings(status);
CREATE INDEX IF NOT EXISTS idx_competitor_saved_listings_created_at
    ON public.competitor_saved_listings(created_at DESC);

DROP TRIGGER IF EXISTS trg_competitor_saved_listings_updated_at ON public.competitor_saved_listings;
CREATE TRIGGER trg_competitor_saved_listings_updated_at
    BEFORE UPDATE ON public.competitor_saved_listings
    FOR EACH ROW EXECUTE FUNCTION public.trigger_set_timestamp();

CREATE TABLE IF NOT EXISTS public.market_search_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    tenant_key TEXT NOT NULL,
    platform TEXT NOT NULL DEFAULT 'mercadolivre'
        CHECK (platform IN ('mercadolivre', 'shopee', 'all')),
    normalized_query TEXT NOT NULL,
    original_query TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'ml_official_api',
    total_found INTEGER NOT NULL DEFAULT 0,
    items JSONB NOT NULL DEFAULT '[]'::jsonb,
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (timezone('utc'::text, now()) + INTERVAL '6 hours'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_market_search_snapshots_tenant_plat_query
        UNIQUE (tenant_key, platform, normalized_query)
);

CREATE INDEX IF NOT EXISTS idx_market_search_snapshots_lookup
    ON public.market_search_snapshots(tenant_key, platform, normalized_query, expires_at DESC);
CREATE INDEX IF NOT EXISTS idx_market_search_snapshots_expires
    ON public.market_search_snapshots(expires_at);

-- ==============================================================================
-- 7. MÓDULO DE GESTÃO DE VENDAS, REPASSE POR VENDEDOR E CUSTOS
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.sellers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    name TEXT NOT NULL CHECK (char_length(trim(name)) >= 1),
    color_hex TEXT NOT NULL DEFAULT '#0284C7',
    commission_pct NUMERIC(6, 2) NOT NULL DEFAULT 100.00
        CHECK (commission_pct >= 0 AND commission_pct <= 100),
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_sellers_org_active
    ON public.sellers(organization_id, active) WHERE organization_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sellers_user_active
    ON public.sellers(user_id, active) WHERE organization_id IS NULL;

DROP TRIGGER IF EXISTS trg_sellers_updated_at ON public.sellers;
CREATE TRIGGER trg_sellers_updated_at
    BEFORE UPDATE ON public.sellers
    FOR EACH ROW EXECUTE FUNCTION public.trigger_set_timestamp();

CREATE TABLE IF NOT EXISTS public.product_cost_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    mlb_id TEXT NOT NULL CHECK (char_length(trim(mlb_id)) >= 3),
    sku TEXT,
    material_cost NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (material_cost >= 0),
    packaging_cost NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (packaging_cost >= 0),
    logistics_cost NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (logistics_cost >= 0),
    printing_cost NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (printing_cost >= 0),
    accessories_kit_cost NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (accessories_kit_cost >= 0),
    default_tax_pct NUMERIC(6, 2) NOT NULL DEFAULT 4.00 CHECK (default_tax_pct >= 0 AND default_tax_pct <= 100),
    default_seller_id UUID REFERENCES public.sellers(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_product_cost_templates_org_mlb
    ON public.product_cost_templates(organization_id, mlb_id) WHERE organization_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_product_cost_templates_user_mlb
    ON public.product_cost_templates(user_id, mlb_id) WHERE organization_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_product_cost_templates_mlb
    ON public.product_cost_templates(mlb_id);

DROP TRIGGER IF EXISTS trg_product_cost_templates_updated_at ON public.product_cost_templates;
CREATE TRIGGER trg_product_cost_templates_updated_at
    BEFORE UPDATE ON public.product_cost_templates
    FOR EACH ROW EXECUTE FUNCTION public.trigger_set_timestamp();

CREATE TABLE IF NOT EXISTS public.ml_sales_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    -- Identificação e Datas
    ml_order_id BIGINT NOT NULL UNIQUE,
    ml_pack_id BIGINT,
    ml_shipment_id BIGINT,
    ml_seller_id TEXT,
    store_name TEXT NOT NULL DEFAULT 'Mercado Livre',
    order_date TIMESTAMPTZ NOT NULL,
    shipping_deadline TIMESTAMPTZ,
    shipped_at TIMESTAMPTZ,
    api_shipped_at TIMESTAMPTZ,
    shipped_at_manual BOOLEAN NOT NULL DEFAULT false,
    delivered_at TIMESTAMPTZ,
    logistic_type TEXT,
    status TEXT NOT NULL DEFAULT 'paid'
        CHECK (status IN ('paid', 'shipped', 'delivered', 'cancelled', 'returned')),
    cancellation_reason TEXT,
    -- Produto e Comprador
    mlb_id TEXT NOT NULL,
    sku TEXT,
    product_title TEXT NOT NULL,
    product_thumbnail TEXT,
    permalink TEXT,
    quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity >= 1),
    buyer_name TEXT NOT NULL DEFAULT 'Comprador Mercado Livre',
    buyer_document TEXT,
    is_business_buyer BOOLEAN NOT NULL DEFAULT false,
    -- Atribuição Gerencial & Conferência
    assigned_seller_id UUID REFERENCES public.sellers(id) ON DELETE SET NULL,
    verified_at TIMESTAMPTZ,
    costs_manually_edited BOOLEAN NOT NULL DEFAULT false,
    -- Financeiro ML (Read-Only)
    gross_sale_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    ml_commission_pct NUMERIC(6, 2) NOT NULL DEFAULT 0.00,
    ml_commission_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    ml_shipping_cost NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    ml_promo_rebate NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    mp_net_released NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    mp_release_date TIMESTAMPTZ,
    mp_release_status TEXT DEFAULT 'pending',
    -- Custos Operacionais Internos
    tax_pct NUMERIC(6, 2) NOT NULL DEFAULT 0.00 CHECK (tax_pct >= 0 AND tax_pct <= 100),
    tax_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (tax_amount >= 0),
    cost_material NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (cost_material >= 0),
    cost_packaging NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (cost_packaging >= 0),
    cost_logistics NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (cost_logistics >= 0),
    cost_printing NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (cost_printing >= 0),
    cost_accessories_kit NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (cost_accessories_kit >= 0),
    -- Colunas Calculadas Automaticamente via Trigger
    seller_transfer_profit NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    net_operational_profit NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_ml_sales_orders_org_date
    ON public.ml_sales_orders(organization_id, order_date DESC);
CREATE INDEX IF NOT EXISTS idx_ml_sales_orders_user_date
    ON public.ml_sales_orders(user_id, order_date DESC) WHERE organization_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_ml_sales_orders_org_seller_date
    ON public.ml_sales_orders(organization_id, assigned_seller_id, order_date DESC);
CREATE INDEX IF NOT EXISTS idx_ml_sales_orders_org_status_date
    ON public.ml_sales_orders(organization_id, status, order_date DESC);
CREATE INDEX IF NOT EXISTS idx_ml_sales_orders_org_store_date
    ON public.ml_sales_orders(organization_id, store_name, order_date DESC);
CREATE INDEX IF NOT EXISTS idx_ml_sales_orders_paid_deadline
    ON public.ml_sales_orders(organization_id, status, shipping_deadline) WHERE status = 'paid';
CREATE INDEX IF NOT EXISTS idx_ml_sales_orders_mlb
    ON public.ml_sales_orders(organization_id, mlb_id);
CREATE INDEX IF NOT EXISTS idx_ml_sales_orders_pack
    ON public.ml_sales_orders(ml_pack_id) WHERE ml_pack_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ml_sales_orders_org_shipped_at
    ON public.ml_sales_orders(organization_id, shipped_at DESC)
    WHERE organization_id IS NOT NULL AND shipped_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ml_sales_orders_user_shipped_at
    ON public.ml_sales_orders(user_id, shipped_at DESC)
    WHERE organization_id IS NULL AND shipped_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ml_sales_orders_org_seller_shipped_at
    ON public.ml_sales_orders(organization_id, assigned_seller_id, shipped_at DESC)
    WHERE shipped_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ml_sales_orders_org_logistic_type
    ON public.ml_sales_orders(organization_id, logistic_type);
CREATE INDEX IF NOT EXISTS idx_ml_sales_orders_pending_shipment_sync
    ON public.ml_sales_orders(ml_seller_id, order_date DESC)
    WHERE shipped_at IS NULL AND status IN ('paid', 'shipped', 'delivered');
CREATE INDEX IF NOT EXISTS idx_ml_sales_orders_manual_shipped_at
    ON public.ml_sales_orders(organization_id, shipped_at DESC)
    WHERE shipped_at_manual = TRUE;

-- Trigger financeiro automático em ml_sales_orders
CREATE OR REPLACE FUNCTION public.fn_calculate_ml_sales_order_profits()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_gross NUMERIC(12, 2);
    v_comm NUMERIC(12, 2);
    v_ship NUMERIC(12, 2);
    v_rebate NUMERIC(12, 2);
    v_tax_pct NUMERIC(6, 2);
    v_operational_costs NUMERIC(12, 2);
BEGIN
    NEW.updated_at := timezone('utc'::text, now());

    IF NEW.mlb_id IS NOT NULL THEN
        NEW.mlb_id := upper(trim(NEW.mlb_id));
    END IF;

    IF NEW.status IN ('cancelled', 'returned') THEN
        NEW.tax_amount := 0.00;
        NEW.seller_transfer_profit := 0.00;
        NEW.net_operational_profit := 0.00;
        RETURN NEW;
    END IF;

    v_gross := COALESCE(NEW.gross_sale_amount, 0.00);
    v_comm := COALESCE(NEW.ml_commission_amount, 0.00);
    v_ship := COALESCE(NEW.ml_shipping_cost, 0.00);
    v_rebate := COALESCE(NEW.ml_promo_rebate, 0.00);
    v_tax_pct := COALESCE(NEW.tax_pct, 0.00);

    NEW.tax_amount := ROUND(v_gross * (v_tax_pct / 100.0), 2);
    NEW.seller_transfer_profit := ROUND(v_gross - v_comm - v_ship + v_rebate, 2);

    v_operational_costs :=
        COALESCE(NEW.cost_material, 0.00) +
        COALESCE(NEW.cost_packaging, 0.00) +
        COALESCE(NEW.cost_logistics, 0.00) +
        COALESCE(NEW.cost_printing, 0.00) +
        COALESCE(NEW.cost_accessories_kit, 0.00);

    NEW.net_operational_profit := ROUND(
        NEW.seller_transfer_profit - NEW.tax_amount - v_operational_costs,
        2
    );

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ml_sales_orders_calculate_profits ON public.ml_sales_orders;
CREATE TRIGGER trg_ml_sales_orders_calculate_profits
    BEFORE INSERT OR UPDATE ON public.ml_sales_orders
    FOR EACH ROW EXECUTE FUNCTION public.fn_calculate_ml_sales_order_profits();

-- ==============================================================================
-- 8. CATÁLOGO MERCADO LIVRE 3 NÍVEIS (USER PRODUCTS) + VIEW + RPC ATÔMICA
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.ml_families (
    family_id TEXT PRIMARY KEY CHECK (char_length(trim(family_id)) >= 1),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    seller_id TEXT NOT NULL CHECK (char_length(trim(seller_id)) >= 1),
    is_official_family_id BOOLEAN NOT NULL DEFAULT true,
    title TEXT NOT NULL CHECK (char_length(trim(title)) >= 1),
    thumbnail_url TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'closed')),
    last_synced_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_ml_families_org_seller_status
    ON public.ml_families(organization_id, seller_id, status) WHERE organization_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ml_families_user_seller_status
    ON public.ml_families(user_id, seller_id, status) WHERE organization_id IS NULL;

DROP TRIGGER IF EXISTS trg_ml_families_updated_at ON public.ml_families;
CREATE TRIGGER trg_ml_families_updated_at
    BEFORE UPDATE ON public.ml_families
    FOR EACH ROW EXECUTE FUNCTION public.trigger_set_timestamp();

CREATE TABLE IF NOT EXISTS public.ml_variations (
    user_product_id TEXT PRIMARY KEY CHECK (char_length(trim(user_product_id)) >= 1),
    family_id TEXT NOT NULL REFERENCES public.ml_families(family_id) ON DELETE CASCADE,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    seller_id TEXT NOT NULL CHECK (char_length(trim(seller_id)) >= 1),
    variation_name TEXT NOT NULL CHECK (char_length(trim(variation_name)) >= 1),
    sku TEXT,
    thumbnail_url TEXT,
    available_quantity INTEGER NOT NULL DEFAULT 0 CHECK (available_quantity >= 0),
    mlbs_list JSONB NOT NULL DEFAULT '[]'::jsonb,
    last_synced_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_ml_variations_family_id ON public.ml_variations(family_id);
CREATE INDEX IF NOT EXISTS idx_ml_variations_org_seller
    ON public.ml_variations(organization_id, seller_id) WHERE organization_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ml_variations_user_seller
    ON public.ml_variations(user_id, seller_id) WHERE organization_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_ml_variations_sku
    ON public.ml_variations(sku) WHERE sku IS NOT NULL;

DROP TRIGGER IF EXISTS trg_ml_variations_updated_at ON public.ml_variations;
CREATE TRIGGER trg_ml_variations_updated_at
    BEFORE UPDATE ON public.ml_variations
    FOR EACH ROW EXECUTE FUNCTION public.trigger_set_timestamp();

CREATE TABLE IF NOT EXISTS public.ml_sale_options (
    item_id TEXT PRIMARY KEY CHECK (char_length(trim(item_id)) >= 3),
    user_product_id TEXT NOT NULL REFERENCES public.ml_variations(user_product_id) ON DELETE CASCADE,
    family_id TEXT NOT NULL REFERENCES public.ml_families(family_id) ON DELETE CASCADE,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    seller_id TEXT NOT NULL CHECK (char_length(trim(seller_id)) >= 1),
    title TEXT NOT NULL,
    category_id TEXT,
    listing_type_id TEXT NOT NULL DEFAULT 'gold_special',
    catalog_listing BOOLEAN NOT NULL DEFAULT false,
    catalog_product_id TEXT,
    has_wholesale BOOLEAN NOT NULL DEFAULT false,
    base_price NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (base_price >= 0),
    promo_price NUMERIC(12, 2) CHECK (promo_price IS NULL OR promo_price >= 0),
    active_price NUMERIC(12, 2) GENERATED ALWAYS AS (COALESCE(promo_price, base_price)) STORED,
    sale_fee_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (sale_fee_amount >= 0),
    sale_fee_pct NUMERIC(6, 2) NOT NULL DEFAULT 0.00 CHECK (sale_fee_pct >= 0),
    shipping_cost_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (shipping_cost_amount >= 0),
    free_shipping BOOLEAN NOT NULL DEFAULT false,
    shipping_mode_label TEXT NOT NULL DEFAULT 'Envio por conta do comprador',
    shipping_logistic_type TEXT NOT NULL DEFAULT 'padrao',
    net_receive_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    visits_7d INTEGER NOT NULL DEFAULT 0 CHECK (visits_7d >= 0),
    sales_7d INTEGER NOT NULL DEFAULT 0 CHECK (sales_7d >= 0),
    sales_30d INTEGER NOT NULL DEFAULT 0 CHECK (sales_30d >= 0),
    sold_quantity INTEGER NOT NULL DEFAULT 0 CHECK (sold_quantity >= 0),
    conversion_rate_7d NUMERIC(6, 2) NOT NULL DEFAULT 0.00 CHECK (conversion_rate_7d >= 0),
    health_score INTEGER CHECK (health_score IS NULL OR (health_score >= 0 AND health_score <= 100)),
    pending_goals_count INTEGER NOT NULL DEFAULT 0 CHECK (pending_goals_count >= 0),
    recommendation_title TEXT,
    recommendation_action TEXT,
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'paused', 'under_review', 'closed')),
    sub_status TEXT,
    permalink TEXT NOT NULL,
    thumbnail_url TEXT,
    last_synced_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_ml_sale_options_user_product_id ON public.ml_sale_options(user_product_id);
CREATE INDEX IF NOT EXISTS idx_ml_sale_options_family_id ON public.ml_sale_options(family_id);
CREATE INDEX IF NOT EXISTS idx_ml_sale_options_org_seller_status
    ON public.ml_sale_options(organization_id, seller_id, status) WHERE organization_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ml_sale_options_user_seller_status
    ON public.ml_sale_options(user_id, seller_id, status) WHERE organization_id IS NULL;

DROP TRIGGER IF EXISTS trg_ml_sale_options_updated_at ON public.ml_sale_options;
CREATE TRIGGER trg_ml_sale_options_updated_at
    BEFORE UPDATE ON public.ml_sale_options
    FOR EACH ROW EXECUTE FUNCTION public.trigger_set_timestamp();

-- View agregada com security_invoker = true (respeita RLS das tabelas subjacentes)
CREATE OR REPLACE VIEW public.ml_families_aggregated
WITH (security_invoker = true) AS
WITH variation_agg AS (
    SELECT
        v.family_id,
        COUNT(*)::INTEGER AS variations_count,
        COALESCE(SUM(v.available_quantity), 0)::INTEGER AS total_stock
    FROM public.ml_variations v
    GROUP BY v.family_id
),
option_agg AS (
    SELECT
        o.family_id,
        COUNT(*)::INTEGER AS options_count,
        COALESCE(MIN(o.base_price), 0)::NUMERIC(12, 2) AS min_price,
        COALESCE(MAX(o.base_price), 0)::NUMERIC(12, 2) AS max_price,
        MIN(o.promo_price)::NUMERIC(12, 2) AS min_promo_price,
        MAX(o.promo_price)::NUMERIC(12, 2) AS max_promo_price,
        COALESCE(MIN(o.net_receive_amount), 0)::NUMERIC(12, 2) AS min_net_receive,
        COALESCE(MAX(o.net_receive_amount), 0)::NUMERIC(12, 2) AS max_net_receive,
        COALESCE(SUM(o.visits_7d), 0)::INTEGER AS total_visits_7d,
        COALESCE(SUM(o.sales_7d), 0)::INTEGER AS total_sales_7d,
        COALESCE(SUM(o.sales_30d), 0)::INTEGER AS total_sales_30d
    FROM public.ml_sale_options o
    WHERE o.status <> 'closed'
    GROUP BY o.family_id
)
SELECT
    f.family_id,
    f.organization_id,
    f.user_id,
    f.seller_id,
    f.is_official_family_id,
    f.title,
    f.thumbnail_url,
    f.status,
    COALESCE(va.variations_count, 0) AS variations_count,
    COALESCE(oa.options_count, 0) AS options_count,
    COALESCE(va.total_stock, 0) AS total_stock,
    COALESCE(oa.min_price, 0)::NUMERIC(12, 2) AS min_price,
    COALESCE(oa.max_price, 0)::NUMERIC(12, 2) AS max_price,
    oa.min_promo_price,
    oa.max_promo_price,
    COALESCE(oa.min_net_receive, 0)::NUMERIC(12, 2) AS min_net_receive,
    COALESCE(oa.max_net_receive, 0)::NUMERIC(12, 2) AS max_net_receive,
    COALESCE(oa.total_visits_7d, 0) AS total_visits_7d,
    COALESCE(oa.total_sales_7d, 0) AS total_sales_7d,
    COALESCE(oa.total_sales_30d, 0) AS total_sales_30d,
    f.last_synced_at
FROM public.ml_families f
LEFT JOIN variation_agg va ON va.family_id = f.family_id
LEFT JOIN option_agg oa ON oa.family_id = f.family_id
WHERE f.status <> 'closed';

-- RPC Atômica de sincronização de catálogo ML 3 níveis
CREATE OR REPLACE FUNCTION public.sync_ml_catalog_hierarchy(
    p_organization_id UUID,
    p_user_id UUID,
    p_seller_id TEXT,
    p_families JSONB,
    p_variations JSONB,
    p_sale_options JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_now TIMESTAMPTZ := timezone('utc'::text, now());
    v_families_upserted INTEGER := 0;
    v_variations_upserted INTEGER := 0;
    v_options_upserted INTEGER := 0;
    v_options_closed INTEGER := 0;
    v_families_closed INTEGER := 0;
BEGIN
    INSERT INTO public.ml_families (
        family_id, organization_id, user_id, seller_id,
        is_official_family_id, title, thumbnail_url, status, last_synced_at
    )
    SELECT
        x.family_id, p_organization_id, p_user_id, p_seller_id,
        COALESCE(x.is_official_family_id, true), x.title, x.thumbnail_url,
        CASE WHEN x.status IN ('active', 'paused', 'closed') THEN x.status ELSE 'active' END,
        v_now
    FROM jsonb_to_recordset(COALESCE(p_families, '[]'::jsonb)) AS x(
        family_id TEXT, is_official_family_id BOOLEAN, title TEXT, thumbnail_url TEXT, status TEXT
    )
    ON CONFLICT (family_id) DO UPDATE SET
        organization_id = EXCLUDED.organization_id,
        user_id = EXCLUDED.user_id,
        seller_id = EXCLUDED.seller_id,
        is_official_family_id = EXCLUDED.is_official_family_id,
        title = EXCLUDED.title,
        thumbnail_url = EXCLUDED.thumbnail_url,
        status = EXCLUDED.status,
        last_synced_at = v_now,
        updated_at = v_now;
    GET DIAGNOSTICS v_families_upserted = ROW_COUNT;

    INSERT INTO public.ml_variations (
        user_product_id, family_id, organization_id, user_id, seller_id,
        variation_name, sku, thumbnail_url, available_quantity, mlbs_list, last_synced_at
    )
    SELECT
        x.user_product_id, x.family_id, p_organization_id, p_user_id, p_seller_id,
        x.variation_name, x.sku, x.thumbnail_url,
        GREATEST(0, COALESCE(x.available_quantity, 0)),
        COALESCE(x.mlbs_list, '[]'::jsonb), v_now
    FROM jsonb_to_recordset(COALESCE(p_variations, '[]'::jsonb)) AS x(
        user_product_id TEXT, family_id TEXT, variation_name TEXT, sku TEXT,
        thumbnail_url TEXT, available_quantity INTEGER, mlbs_list JSONB
    )
    ON CONFLICT (user_product_id) DO UPDATE SET
        family_id = EXCLUDED.family_id,
        organization_id = EXCLUDED.organization_id,
        user_id = EXCLUDED.user_id,
        seller_id = EXCLUDED.seller_id,
        variation_name = EXCLUDED.variation_name,
        sku = EXCLUDED.sku,
        thumbnail_url = EXCLUDED.thumbnail_url,
        available_quantity = EXCLUDED.available_quantity,
        mlbs_list = EXCLUDED.mlbs_list,
        last_synced_at = v_now,
        updated_at = v_now;
    GET DIAGNOSTICS v_variations_upserted = ROW_COUNT;

    INSERT INTO public.ml_sale_options (
        item_id, user_product_id, family_id, organization_id, user_id, seller_id,
        title, category_id, listing_type_id, catalog_listing, catalog_product_id,
        has_wholesale, base_price, promo_price, sale_fee_amount, sale_fee_pct,
        shipping_cost_amount, free_shipping, shipping_mode_label, shipping_logistic_type,
        net_receive_amount, visits_7d, sales_7d, sales_30d, sold_quantity,
        conversion_rate_7d, health_score, pending_goals_count,
        recommendation_title, recommendation_action, status, sub_status,
        permalink, thumbnail_url, last_synced_at
    )
    SELECT
        x.item_id, x.user_product_id, x.family_id, p_organization_id, p_user_id, p_seller_id,
        x.title, x.category_id, COALESCE(x.listing_type_id, 'gold_special'),
        COALESCE(x.catalog_listing, false), x.catalog_product_id,
        COALESCE(x.has_wholesale, false), GREATEST(0, COALESCE(x.base_price, 0)),
        CASE WHEN x.promo_price IS NOT NULL AND x.promo_price >= 0 THEN x.promo_price ELSE NULL END,
        GREATEST(0, COALESCE(x.sale_fee_amount, 0)), GREATEST(0, COALESCE(x.sale_fee_pct, 0)),
        GREATEST(0, COALESCE(x.shipping_cost_amount, 0)), COALESCE(x.free_shipping, false),
        COALESCE(x.shipping_mode_label, 'Envio por conta do comprador'),
        COALESCE(x.shipping_logistic_type, 'padrao'), COALESCE(x.net_receive_amount, 0),
        GREATEST(0, COALESCE(x.visits_7d, 0)), GREATEST(0, COALESCE(x.sales_7d, 0)),
        GREATEST(0, COALESCE(x.sales_30d, 0)), GREATEST(0, COALESCE(x.sold_quantity, 0)),
        GREATEST(0, COALESCE(x.conversion_rate_7d, 0)),
        CASE WHEN x.health_score IS NOT NULL AND x.health_score >= 0 AND x.health_score <= 100 THEN x.health_score ELSE NULL END,
        GREATEST(0, COALESCE(x.pending_goals_count, 0)),
        x.recommendation_title, x.recommendation_action,
        CASE WHEN x.status IN ('active', 'paused', 'under_review', 'closed') THEN x.status ELSE 'paused' END,
        x.sub_status, x.permalink, x.thumbnail_url, v_now
    FROM jsonb_to_recordset(COALESCE(p_sale_options, '[]'::jsonb)) AS x(
        item_id TEXT, user_product_id TEXT, family_id TEXT, title TEXT, category_id TEXT,
        listing_type_id TEXT, catalog_listing BOOLEAN, catalog_product_id TEXT,
        has_wholesale BOOLEAN, base_price NUMERIC, promo_price NUMERIC, sale_fee_amount NUMERIC,
        sale_fee_pct NUMERIC, shipping_cost_amount NUMERIC, free_shipping BOOLEAN,
        shipping_mode_label TEXT, shipping_logistic_type TEXT, net_receive_amount NUMERIC,
        visits_7d INTEGER, sales_7d INTEGER, sales_30d INTEGER, sold_quantity INTEGER,
        conversion_rate_7d NUMERIC, health_score INTEGER, pending_goals_count INTEGER,
        recommendation_title TEXT, recommendation_action TEXT, status TEXT,
        sub_status TEXT, permalink TEXT, thumbnail_url TEXT
    )
    ON CONFLICT (item_id) DO UPDATE SET
        user_product_id = EXCLUDED.user_product_id,
        family_id = EXCLUDED.family_id,
        organization_id = EXCLUDED.organization_id,
        user_id = EXCLUDED.user_id,
        seller_id = EXCLUDED.seller_id,
        title = EXCLUDED.title,
        category_id = EXCLUDED.category_id,
        listing_type_id = EXCLUDED.listing_type_id,
        catalog_listing = EXCLUDED.catalog_listing,
        catalog_product_id = EXCLUDED.catalog_product_id,
        has_wholesale = EXCLUDED.has_wholesale,
        base_price = EXCLUDED.base_price,
        promo_price = EXCLUDED.promo_price,
        sale_fee_amount = EXCLUDED.sale_fee_amount,
        sale_fee_pct = EXCLUDED.sale_fee_pct,
        shipping_cost_amount = EXCLUDED.shipping_cost_amount,
        free_shipping = EXCLUDED.free_shipping,
        shipping_mode_label = EXCLUDED.shipping_mode_label,
        shipping_logistic_type = EXCLUDED.shipping_logistic_type,
        net_receive_amount = EXCLUDED.net_receive_amount,
        visits_7d = EXCLUDED.visits_7d,
        sales_7d = EXCLUDED.sales_7d,
        sales_30d = EXCLUDED.sales_30d,
        sold_quantity = EXCLUDED.sold_quantity,
        conversion_rate_7d = EXCLUDED.conversion_rate_7d,
        health_score = EXCLUDED.health_score,
        pending_goals_count = EXCLUDED.pending_goals_count,
        recommendation_title = EXCLUDED.recommendation_title,
        recommendation_action = EXCLUDED.recommendation_action,
        status = EXCLUDED.status,
        sub_status = EXCLUDED.sub_status,
        permalink = EXCLUDED.permalink,
        thumbnail_url = EXCLUDED.thumbnail_url,
        last_synced_at = v_now,
        updated_at = v_now;
    GET DIAGNOSTICS v_options_upserted = ROW_COUNT;

    UPDATE public.ml_sale_options
    SET status = 'closed', updated_at = v_now
    WHERE seller_id = p_seller_id
      AND ((p_organization_id IS NOT NULL AND organization_id = p_organization_id)
           OR (p_organization_id IS NULL AND organization_id IS NULL AND user_id = p_user_id))
      AND status <> 'closed'
      AND last_synced_at < v_now;
    GET DIAGNOSTICS v_options_closed = ROW_COUNT;

    DELETE FROM public.ml_variations v
    WHERE v.seller_id = p_seller_id
      AND ((p_organization_id IS NOT NULL AND v.organization_id = p_organization_id)
           OR (p_organization_id IS NULL AND v.organization_id IS NULL AND v.user_id = p_user_id))
      AND v.last_synced_at < v_now
      AND NOT EXISTS (
          SELECT 1 FROM public.ml_sale_options o
          WHERE o.user_product_id = v.user_product_id AND o.status <> 'closed'
      );

    UPDATE public.ml_families f
    SET status = 'closed', updated_at = v_now
    WHERE f.seller_id = p_seller_id
      AND ((p_organization_id IS NOT NULL AND f.organization_id = p_organization_id)
           OR (p_organization_id IS NULL AND f.organization_id IS NULL AND f.user_id = p_user_id))
      AND f.status <> 'closed'
      AND f.last_synced_at < v_now;
    GET DIAGNOSTICS v_families_closed = ROW_COUNT;

    RETURN jsonb_build_object(
        'families_upserted', v_families_upserted,
        'variations_upserted', v_variations_upserted,
        'options_upserted', v_options_upserted,
        'options_closed', v_options_closed,
        'families_closed', v_families_closed,
        'synced_at', v_now
    );
END;
$$;

-- ==============================================================================
-- 9. RPC EXECUTIVA DO DASHBOARD GERAL (AGREGAÇÃO NO POSTGRESQL)
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.fn_get_executive_dashboard_metrics(
    p_organization_id UUID,
    p_user_id UUID,
    p_from_date DATE,
    p_to_date DATE,
    p_store_name TEXT DEFAULT NULL,
    p_critical_margin_pct NUMERIC DEFAULT 10.0
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
    v_days_span INTEGER;
    v_prev_from_date DATE;
    v_prev_to_date DATE;
    v_curr_start TIMESTAMPTZ;
    v_curr_end TIMESTAMPTZ;
    v_prev_start TIMESTAMPTZ;
    v_prev_end TIMESTAMPTZ;
    v_result JSONB;
BEGIN
    v_days_span := GREATEST((p_to_date - p_from_date) + 1, 1);
    v_prev_to_date := p_from_date - INTERVAL '1 day';
    v_prev_from_date := v_prev_to_date - ((v_days_span - 1) * INTERVAL '1 day');

    v_curr_start := (p_from_date::TEXT || ' 00:00:00 America/Sao_Paulo')::TIMESTAMPTZ;
    v_curr_end   := (p_to_date::TEXT   || ' 23:59:59.999 America/Sao_Paulo')::TIMESTAMPTZ;
    v_prev_start := (v_prev_from_date::TEXT || ' 00:00:00 America/Sao_Paulo')::TIMESTAMPTZ;
    v_prev_end   := (v_prev_to_date::TEXT   || ' 23:59:59.999 America/Sao_Paulo')::TIMESTAMPTZ;

    WITH tenant_orders AS (
        SELECT
            o.ml_order_id, o.ml_pack_id, o.store_name, o.order_date,
            (o.order_date AT TIME ZONE 'America/Sao_Paulo')::DATE AS br_date,
            o.shipping_deadline, o.logistic_type, o.status,
            UPPER(TRIM(o.mlb_id)) AS mlb_id, o.sku, o.product_title,
            o.product_thumbnail, o.permalink,
            COALESCE(o.quantity, 1) AS quantity,
            COALESCE(o.gross_sale_amount, 0)::NUMERIC AS gross_sale_amount,
            COALESCE(o.net_operational_profit, 0)::NUMERIC AS net_operational_profit
        FROM public.ml_sales_orders o
        WHERE
            ((p_organization_id IS NOT NULL AND o.organization_id = p_organization_id)
             OR (p_organization_id IS NULL AND o.organization_id IS NULL AND o.user_id = p_user_id))
            AND o.order_date >= v_prev_start
            AND o.order_date <= v_curr_end
            AND o.status NOT IN ('cancelled', 'returned')
            AND (p_store_name IS NULL OR p_store_name = '' OR p_store_name = 'all' OR o.store_name = p_store_name)
    ),
    curr_valid AS (SELECT * FROM tenant_orders WHERE order_date >= v_curr_start AND order_date <= v_curr_end),
    prev_valid AS (SELECT * FROM tenant_orders WHERE order_date >= v_prev_start AND order_date <= v_prev_end),
    date_spine AS (
        SELECT gs::DATE AS curr_day, (gs::DATE - (v_days_span * INTERVAL '1 day'))::DATE AS prev_day
        FROM generate_series(p_from_date::TIMESTAMP, p_to_date::TIMESTAMP, INTERVAL '1 day') gs
    ),
    curr_daily AS (
        SELECT br_date, COUNT(*)::INTEGER AS orders, COALESCE(SUM(quantity), 0)::INTEGER AS units,
               ROUND(COALESCE(SUM(gross_sale_amount), 0), 2) AS gross,
               ROUND(COALESCE(SUM(net_operational_profit), 0), 2) AS net_profit
        FROM curr_valid GROUP BY br_date
    ),
    prev_daily AS (
        SELECT br_date, COUNT(*)::INTEGER AS orders, COALESCE(SUM(quantity), 0)::INTEGER AS units,
               ROUND(COALESCE(SUM(gross_sale_amount), 0), 2) AS gross,
               ROUND(COALESCE(SUM(net_operational_profit), 0), 2) AS net_profit
        FROM prev_valid GROUP BY br_date
    ),
    daily_series AS (
        SELECT
            to_char(s.curr_day, 'YYYY-MM-DD') AS date_key,
            to_char(s.curr_day, 'DD/MM') AS date_label,
            COALESCE(c.gross, 0) AS gross_sales,
            COALESCE(c.net_profit, 0) AS net_profit,
            COALESCE(c.orders, 0) AS orders_count,
            COALESCE(c.units, 0) AS units_sold,
            COALESCE(p.gross, 0) AS prev_gross_sales,
            COALESCE(p.net_profit, 0) AS prev_net_profit,
            COALESCE(p.orders, 0) AS prev_orders_count
        FROM date_spine s
        LEFT JOIN curr_daily c ON c.br_date = s.curr_day
        LEFT JOIN prev_daily p ON p.br_date = s.prev_day
        ORDER BY s.curr_day ASC
    ),
    tenant_listings AS (
        SELECT DISTINCT ON (UPPER(TRIM(l.external_id)))
            UPPER(TRIM(l.external_id)) AS mlb_id, l.title, l.thumbnail_url, l.permalink,
            l.status::TEXT AS listing_status,
            COALESCE(l.available_quantity, 0)::INTEGER AS available_quantity,
            COALESCE(l.visits, 0)::INTEGER AS visits
        FROM public.my_listings l
        WHERE l.platform = 'mercadolivre'
          AND (l.user_id = p_user_id
               OR (p_organization_id IS NOT NULL AND EXISTS (
                   SELECT 1 FROM public.user_profiles up
                   WHERE up.id = l.user_id AND up.organization_id = p_organization_id
               )))
        ORDER BY UPPER(TRIM(l.external_id)), l.updated_at DESC
    ),
    curr_by_mlb AS (
        SELECT mlb_id, MAX(sku) AS sku, MAX(product_title) AS product_title,
               MAX(product_thumbnail) AS product_thumbnail, MAX(permalink) AS permalink,
               COUNT(*)::INTEGER AS orders_count, COALESCE(SUM(quantity), 0)::INTEGER AS units_sold,
               ROUND(COALESCE(SUM(gross_sale_amount), 0), 2) AS gross_sales,
               ROUND(COALESCE(SUM(net_operational_profit), 0), 2) AS net_profit
        FROM curr_valid GROUP BY mlb_id
    ),
    prev_by_mlb AS (
        SELECT mlb_id, MAX(sku) AS sku, MAX(product_title) AS product_title,
               MAX(product_thumbnail) AS product_thumbnail, MAX(permalink) AS permalink,
               COUNT(*)::INTEGER AS orders_count, COALESCE(SUM(quantity), 0)::INTEGER AS units_sold,
               ROUND(COALESCE(SUM(gross_sale_amount), 0), 2) AS gross_sales,
               ROUND(COALESCE(SUM(net_operational_profit), 0), 2) AS net_profit
        FROM prev_valid GROUP BY mlb_id
    ),
    combined_products AS (
        SELECT
            COALESCE(c.mlb_id, p.mlb_id) AS mlb_id,
            COALESCE(c.sku, p.sku) AS sku,
            COALESCE(c.product_title, p.product_title, l.title, COALESCE(c.mlb_id, p.mlb_id)) AS product_title,
            COALESCE(c.product_thumbnail, p.product_thumbnail, l.thumbnail_url) AS product_thumbnail,
            COALESCE(c.permalink, p.permalink, l.permalink) AS permalink,
            COALESCE(c.orders_count, 0) AS orders_count,
            COALESCE(c.units_sold, 0) AS units_sold,
            COALESCE(c.gross_sales, 0) AS gross_sales,
            COALESCE(c.net_profit, 0) AS net_profit,
            CASE WHEN COALESCE(c.gross_sales, 0) > 0
                 THEN ROUND((COALESCE(c.net_profit, 0) / c.gross_sales) * 100.0, 1) ELSE 0 END AS margin_pct,
            COALESCE(p.orders_count, 0) AS prev_orders_count,
            COALESCE(p.units_sold, 0) AS prev_units_sold,
            COALESCE(p.gross_sales, 0) AS prev_gross_sales,
            COALESCE(p.net_profit, 0) AS prev_net_profit,
            CASE WHEN COALESCE(p.gross_sales, 0) > 0
                 THEN ROUND(((COALESCE(c.gross_sales, 0) - p.gross_sales) / p.gross_sales) * 100.0, 1) ELSE NULL END AS revenue_delta_pct,
            CASE WHEN COALESCE(p.units_sold, 0) > 0
                 THEN ROUND(((COALESCE(c.units_sold, 0) - p.units_sold)::NUMERIC / p.units_sold::NUMERIC) * 100.0, 1) ELSE NULL END AS units_delta_pct,
            l.available_quantity, l.listing_status, COALESCE(l.visits, 0) AS listing_visits,
            ROUND(COALESCE(c.units_sold, 0)::NUMERIC / v_days_span::NUMERIC, 2) AS daily_velocity,
            CASE WHEN COALESCE(c.units_sold, 0) > 0 AND l.available_quantity IS NOT NULL
                 THEN ROUND(l.available_quantity::NUMERIC / (c.units_sold::NUMERIC / v_days_span::NUMERIC), 1) ELSE NULL END AS days_of_stock
        FROM curr_by_mlb c
        FULL OUTER JOIN prev_by_mlb p ON p.mlb_id = c.mlb_id
        LEFT JOIN tenant_listings l ON l.mlb_id = COALESCE(c.mlb_id, p.mlb_id)
    ),
    top_by_revenue AS (SELECT * FROM combined_products WHERE gross_sales > 0 ORDER BY gross_sales DESC, units_sold DESC LIMIT 8),
    top_by_profit AS (SELECT * FROM combined_products WHERE gross_sales > 0 ORDER BY net_profit DESC, margin_pct DESC LIMIT 8),
    declining_products AS (SELECT * FROM combined_products WHERE prev_units_sold >= 2 AND units_sold < prev_units_sold ORDER BY (prev_gross_sales - gross_sales) DESC, units_delta_pct ASC NULLS LAST LIMIT 8),
    stockout_alerts AS (
        SELECT mlb_id, sku, product_title, product_thumbnail, permalink, available_quantity, daily_velocity, days_of_stock, gross_sales
        FROM combined_products
        WHERE units_sold >= 2 AND available_quantity IS NOT NULL AND days_of_stock IS NOT NULL
          AND days_of_stock < 7.0 AND COALESCE(listing_status, 'active') = 'active'
        ORDER BY days_of_stock ASC, gross_sales DESC LIMIT 6
    ),
    critical_margin_alerts AS (
        SELECT mlb_id, sku, product_title, product_thumbnail, permalink, units_sold, gross_sales, net_profit, margin_pct
        FROM combined_products
        WHERE gross_sales > 0 AND margin_pct < p_critical_margin_pct
        ORDER BY net_profit ASC, margin_pct ASC LIMIT 6
    ),
    conversion_alerts AS (
        SELECT l.mlb_id, NULL::TEXT AS sku, l.title AS product_title, l.thumbnail_url AS product_thumbnail,
               l.permalink, l.visits AS listing_visits, COALESCE(c.orders_count, 0) AS orders_count, l.available_quantity
        FROM tenant_listings l
        LEFT JOIN curr_by_mlb c ON c.mlb_id = l.mlb_id
        WHERE l.listing_status = 'active' AND l.visits >= 80
          AND (COALESCE(c.orders_count, 0) = 0 OR ((COALESCE(c.orders_count, 0)::NUMERIC / GREATEST(l.visits, 1)::NUMERIC) * 100.0) < 0.6)
        ORDER BY l.visits DESC LIMIT 6
    ),
    urgent_shipments AS (
        SELECT o.ml_order_id, o.ml_pack_id, o.mlb_id, o.product_title, o.shipping_deadline, o.logistic_type, o.store_name
        FROM public.ml_sales_orders o
        WHERE ((p_organization_id IS NOT NULL AND o.organization_id = p_organization_id)
               OR (p_organization_id IS NULL AND o.organization_id IS NULL AND o.user_id = p_user_id))
          AND o.status = 'paid' AND o.shipping_deadline IS NOT NULL
          AND o.shipping_deadline <= (NOW() + INTERVAL '24 hours')
          AND (p_store_name IS NULL OR p_store_name = '' OR p_store_name = 'all' OR o.store_name = p_store_name)
        ORDER BY o.shipping_deadline ASC LIMIT 8
    ),
    distinct_stores AS (
        SELECT DISTINCT o.store_name
        FROM public.ml_sales_orders o
        WHERE ((p_organization_id IS NOT NULL AND o.organization_id = p_organization_id)
               OR (p_organization_id IS NULL AND o.organization_id IS NULL AND o.user_id = p_user_id))
          AND o.store_name IS NOT NULL AND o.store_name <> ''
        ORDER BY o.store_name ASC
    )
    SELECT jsonb_build_object(
        'days_span', v_days_span,
        'prev_from_date', to_char(v_prev_from_date, 'YYYY-MM-DD'),
        'prev_to_date', to_char(v_prev_to_date, 'YYYY-MM-DD'),
        'daily_series', COALESCE((SELECT jsonb_agg(to_jsonb(daily_series.*)) FROM daily_series), '[]'::jsonb),
        'top_by_revenue', COALESCE((SELECT jsonb_agg(to_jsonb(top_by_revenue.*)) FROM top_by_revenue), '[]'::jsonb),
        'top_by_profit', COALESCE((SELECT jsonb_agg(to_jsonb(top_by_profit.*)) FROM top_by_profit), '[]'::jsonb),
        'declining_products', COALESCE((SELECT jsonb_agg(to_jsonb(declining_products.*)) FROM declining_products), '[]'::jsonb),
        'stockout_alerts', COALESCE((SELECT jsonb_agg(to_jsonb(stockout_alerts.*)) FROM stockout_alerts), '[]'::jsonb),
        'critical_margin_alerts', COALESCE((SELECT jsonb_agg(to_jsonb(critical_margin_alerts.*)) FROM critical_margin_alerts), '[]'::jsonb),
        'conversion_alerts', COALESCE((SELECT jsonb_agg(to_jsonb(conversion_alerts.*)) FROM conversion_alerts), '[]'::jsonb),
        'urgent_shipments', COALESCE((SELECT jsonb_agg(to_jsonb(urgent_shipments.*)) FROM urgent_shipments), '[]'::jsonb),
        'stores', COALESCE((SELECT jsonb_agg(store_name) FROM distinct_stores), '[]'::jsonb)
    ) INTO v_result;

    RETURN v_result;
END;
$$;

-- ==============================================================================
-- 10. SEGURANÇA: ROW LEVEL SECURITY (RLS) E PERMISSÕES DE ACESSO
-- ==============================================================================

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auth_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.my_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.competitor_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.listing_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.repricing_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.competitor_stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.competitor_store_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.competitor_saved_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_search_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sellers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_cost_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ml_sales_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ml_families ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ml_variations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ml_sale_options ENABLE ROW LEVEL SECURITY;

-- Organizations
DROP POLICY IF EXISTS "org_select_own" ON public.organizations;
CREATE POLICY "org_select_own" ON public.organizations FOR SELECT TO authenticated
    USING (id = public.get_current_user_org_id());

DROP POLICY IF EXISTS "org_update_admin" ON public.organizations;
CREATE POLICY "org_update_admin" ON public.organizations FOR UPDATE TO authenticated
    USING (
        id = public.get_current_user_org_id()
        AND (public.is_current_user_master() = true
             OR EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role IN ('master_admin', 'admin')))
    );

-- User Profiles
DROP POLICY IF EXISTS "profiles_select_org" ON public.user_profiles;
CREATE POLICY "profiles_select_org" ON public.user_profiles FOR SELECT TO authenticated
    USING (organization_id = public.get_current_user_org_id() OR id = auth.uid());

DROP POLICY IF EXISTS "profiles_update_own" ON public.user_profiles;
CREATE POLICY "profiles_update_own" ON public.user_profiles FOR UPDATE TO authenticated
    USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- Auth Audit Logs
DROP POLICY IF EXISTS "audit_select_admin" ON public.auth_audit_logs;
CREATE POLICY "audit_select_admin" ON public.auth_audit_logs FOR SELECT TO authenticated
    USING (
        organization_id = public.get_current_user_org_id()
        AND (public.is_current_user_master() = true
             OR EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role IN ('master_admin', 'admin')))
    );

-- Marketplace Integrations (Tokens OAuth NUNCA expostos ao cliente — apenas colunas públicas via GRANT)
DROP POLICY IF EXISTS "integrations_select_org" ON public.marketplace_integrations;
CREATE POLICY "integrations_select_org" ON public.marketplace_integrations FOR SELECT TO authenticated
    USING (organization_id = public.get_current_user_org_id() OR (organization_id IS NULL AND user_id = auth.uid()));

REVOKE ALL ON public.marketplace_integrations FROM anon, authenticated;
GRANT SELECT (
    id, organization_id, user_id, platform, account_name, seller_id, token_expires_at,
    is_active, status, scopes, metadata, last_refreshed_at, created_at, updated_at
) ON public.marketplace_integrations TO authenticated;

-- Tabelas isoladas por user_id
DROP POLICY IF EXISTS "products_user_all" ON public.products;
CREATE POLICY "products_user_all" ON public.products FOR ALL TO authenticated
    USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "my_listings_user_all" ON public.my_listings;
CREATE POLICY "my_listings_user_all" ON public.my_listings FOR ALL TO authenticated
    USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "competitor_listings_user_all" ON public.competitor_listings;
CREATE POLICY "competitor_listings_user_all" ON public.competitor_listings FOR ALL TO authenticated
    USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "listing_matches_user_all" ON public.listing_matches;
CREATE POLICY "listing_matches_user_all" ON public.listing_matches FOR ALL TO authenticated
    USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "price_history_user_select" ON public.price_history;
CREATE POLICY "price_history_user_select" ON public.price_history FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.competitor_listings cl WHERE cl.id = price_history.competitor_listing_id AND cl.user_id = auth.uid()));

DROP POLICY IF EXISTS "price_history_user_insert" ON public.price_history;
CREATE POLICY "price_history_user_insert" ON public.price_history FOR INSERT TO authenticated
    WITH CHECK (EXISTS (SELECT 1 FROM public.competitor_listings cl WHERE cl.id = price_history.competitor_listing_id AND cl.user_id = auth.uid()));

DROP POLICY IF EXISTS "repricing_rules_user_all" ON public.repricing_rules;
CREATE POLICY "repricing_rules_user_all" ON public.repricing_rules FOR ALL TO authenticated
    USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "competitor_stores_user_all" ON public.competitor_stores;
CREATE POLICY "competitor_stores_user_all" ON public.competitor_stores FOR ALL TO authenticated
    USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "competitor_store_listings_user_all" ON public.competitor_store_listings;
CREATE POLICY "competitor_store_listings_user_all" ON public.competitor_store_listings FOR ALL TO authenticated
    USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "competitor_saved_listings_auth_all" ON public.competitor_saved_listings;
DROP POLICY IF EXISTS "competitor_saved_listings_tenant_all" ON public.competitor_saved_listings;
CREATE POLICY "competitor_saved_listings_tenant_all" ON public.competitor_saved_listings FOR ALL TO authenticated
    USING (user_id::text = auth.uid()::text)
    WITH CHECK (user_id::text = auth.uid()::text);

-- Tabelas Multi-Tenant (organization_id com fallback user_id)
DROP POLICY IF EXISTS "market_search_snapshots_tenant_all" ON public.market_search_snapshots;
CREATE POLICY "market_search_snapshots_tenant_all" ON public.market_search_snapshots FOR ALL TO authenticated
    USING (organization_id = public.get_current_user_org_id() OR (organization_id IS NULL AND user_id = auth.uid()))
    WITH CHECK (organization_id = public.get_current_user_org_id() OR (organization_id IS NULL AND user_id = auth.uid()));

DROP POLICY IF EXISTS "sellers_tenant_all" ON public.sellers;
CREATE POLICY "sellers_tenant_all" ON public.sellers FOR ALL TO authenticated
    USING (organization_id = public.get_current_user_org_id() OR (organization_id IS NULL AND user_id = auth.uid()))
    WITH CHECK (organization_id = public.get_current_user_org_id() OR (organization_id IS NULL AND user_id = auth.uid()));

DROP POLICY IF EXISTS "product_cost_templates_tenant_all" ON public.product_cost_templates;
CREATE POLICY "product_cost_templates_tenant_all" ON public.product_cost_templates FOR ALL TO authenticated
    USING (organization_id = public.get_current_user_org_id() OR (organization_id IS NULL AND user_id = auth.uid()))
    WITH CHECK (organization_id = public.get_current_user_org_id() OR (organization_id IS NULL AND user_id = auth.uid()));

DROP POLICY IF EXISTS "ml_sales_orders_tenant_all" ON public.ml_sales_orders;
CREATE POLICY "ml_sales_orders_tenant_all" ON public.ml_sales_orders FOR ALL TO authenticated
    USING (organization_id = public.get_current_user_org_id() OR (organization_id IS NULL AND user_id = auth.uid()))
    WITH CHECK (organization_id = public.get_current_user_org_id() OR (organization_id IS NULL AND user_id = auth.uid()));

DROP POLICY IF EXISTS "ml_families_tenant_all" ON public.ml_families;
CREATE POLICY "ml_families_tenant_all" ON public.ml_families FOR ALL TO authenticated
    USING (organization_id = public.get_current_user_org_id() OR (organization_id IS NULL AND user_id = auth.uid()))
    WITH CHECK (organization_id = public.get_current_user_org_id() OR (organization_id IS NULL AND user_id = auth.uid()));

DROP POLICY IF EXISTS "ml_variations_tenant_all" ON public.ml_variations;
CREATE POLICY "ml_variations_tenant_all" ON public.ml_variations FOR ALL TO authenticated
    USING (organization_id = public.get_current_user_org_id() OR (organization_id IS NULL AND user_id = auth.uid()))
    WITH CHECK (organization_id = public.get_current_user_org_id() OR (organization_id IS NULL AND user_id = auth.uid()));

DROP POLICY IF EXISTS "ml_sale_options_tenant_all" ON public.ml_sale_options;
CREATE POLICY "ml_sale_options_tenant_all" ON public.ml_sale_options FOR ALL TO authenticated
    USING (organization_id = public.get_current_user_org_id() OR (organization_id IS NULL AND user_id = auth.uid()))
    WITH CHECK (organization_id = public.get_current_user_org_id() OR (organization_id IS NULL AND user_id = auth.uid()));

-- Grants explícitos para authenticated e service_role
GRANT SELECT, INSERT, UPDATE, DELETE ON
    public.organizations,
    public.user_profiles,
    public.auth_audit_logs,
    public.products,
    public.my_listings,
    public.competitor_listings,
    public.listing_matches,
    public.price_history,
    public.repricing_rules,
    public.competitor_stores,
    public.competitor_store_listings,
    public.competitor_saved_listings,
    public.market_search_snapshots,
    public.sellers,
    public.product_cost_templates,
    public.ml_sales_orders,
    public.ml_families,
    public.ml_variations,
    public.ml_sale_options
TO authenticated, service_role;

GRANT SELECT ON public.ml_families_aggregated TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.get_current_user_org_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_current_user_master() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.register_master_account(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.sync_ml_catalog_hierarchy(UUID, UUID, TEXT, JSONB, JSONB, JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_get_executive_dashboard_metrics(UUID, UUID, DATE, DATE, TEXT, NUMERIC) TO authenticated, service_role;

-- ==============================================================================
-- 11. SUPABASE REALTIME (APENAS TABELAS DE VENDAS & ESTOQUE — FREE-TIER SAFE)
-- ==============================================================================
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        ALTER TABLE public.ml_sales_orders REPLICA IDENTITY FULL;
        IF NOT EXISTS (
            SELECT 1 FROM pg_publication_tables
            WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'ml_sales_orders'
        ) THEN
            ALTER PUBLICATION supabase_realtime ADD TABLE public.ml_sales_orders;
        END IF;

        ALTER TABLE public.my_listings REPLICA IDENTITY FULL;
        IF NOT EXISTS (
            SELECT 1 FROM pg_publication_tables
            WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'my_listings'
        ) THEN
            ALTER PUBLICATION supabase_realtime ADD TABLE public.my_listings;
        END IF;
    END IF;
END $$;

-- Recarrega imediatamente o cache de schema da API PostgREST do Supabase
NOTIFY pgrst, 'reload schema';
