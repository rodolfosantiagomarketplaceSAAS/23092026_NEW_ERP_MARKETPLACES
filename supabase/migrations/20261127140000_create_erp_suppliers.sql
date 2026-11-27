-- ==============================================================================
-- SAAS DE GESTÃO DE MARKETPLACES E ERP (PADRÃO TINY & BLING)
-- Migration: 20261127140000_create_erp_suppliers.sql
-- Módulo: Cadastro de Fornecedores & Fabricantes + Vínculo em Produtos e Bobinas PPF
-- Descrição:
--   1. Tabela `erp_suppliers` (Fornecedores, Fabricantes, Distribuidores, Importadores)
--   2. Coluna `supplier_id` (FK opcional) em `erp_products` e `erp_ppf_rolls`
--   3. Índices B-Tree, Trigger `updated_at` e Row Level Security (RLS) Multi-Tenant
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. TABELA: erp_suppliers
CREATE TABLE IF NOT EXISTS public.erp_suppliers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,

    code TEXT NOT NULL CHECK (char_length(trim(code)) >= 1),
    supplier_type TEXT NOT NULL DEFAULT 'fornecedor'
        CHECK (supplier_type IN ('fornecedor', 'fabricante', 'distribuidor', 'importador')),

    trade_name TEXT NOT NULL CHECK (char_length(trim(trade_name)) >= 1), -- Nome Fantasia (Ex: R5 SC)
    legal_name TEXT, -- Razão Social (Ex: Brasil Film Comércio e Distribuição de Películas Ltda)
    document_number TEXT, -- CNPJ ou CPF
    state_registration TEXT, -- Inscrição Estadual
    logo_url TEXT,

    -- Contato
    contact_name TEXT, -- Representante / Vendedor
    phone TEXT,
    whatsapp TEXT,
    email TEXT,
    financial_email TEXT,
    website TEXT,

    -- Endereço completo
    zip_code TEXT,
    street TEXT,
    street_number TEXT,
    complement TEXT,
    neighborhood TEXT,
    city TEXT,
    state TEXT,

    -- Condições Comerciais & Pagamento
    payment_terms TEXT, -- Ex: PIX à vista, 30/60 dias
    lead_time_days INTEGER CHECK (lead_time_days IS NULL OR lead_time_days >= 0),
    min_order_value NUMERIC(12, 2) CHECK (min_order_value IS NULL OR min_order_value >= 0),
    pix_key TEXT,
    notes TEXT,
    active BOOLEAN NOT NULL DEFAULT true,

    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_erp_suppliers_org_code
    ON public.erp_suppliers(organization_id, upper(code))
    WHERE organization_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_erp_suppliers_user_code
    ON public.erp_suppliers(user_id, upper(code))
    WHERE organization_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_erp_suppliers_org_active
    ON public.erp_suppliers(organization_id, active)
    WHERE organization_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_erp_suppliers_user_active
    ON public.erp_suppliers(user_id, active)
    WHERE organization_id IS NULL;

DROP TRIGGER IF EXISTS trg_erp_suppliers_updated_at ON public.erp_suppliers;
CREATE TRIGGER trg_erp_suppliers_updated_at
    BEFORE UPDATE ON public.erp_suppliers
    FOR EACH ROW
    EXECUTE FUNCTION public.trigger_set_timestamp();

-- 2. VÍNCULO FK OPCIONAL EM `erp_products` E `erp_ppf_rolls` (sem quebrar dados existentes)
ALTER TABLE public.erp_products
    ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES public.erp_suppliers(id) ON DELETE SET NULL;

ALTER TABLE public.erp_ppf_rolls
    ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES public.erp_suppliers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_erp_products_supplier_id
    ON public.erp_products(supplier_id)
    WHERE supplier_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_erp_ppf_rolls_supplier_id
    ON public.erp_ppf_rolls(supplier_id)
    WHERE supplier_id IS NOT NULL;

-- 3. ROW LEVEL SECURITY (RLS) MULTI-TENANT
ALTER TABLE public.erp_suppliers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "erp_suppliers_tenant_all" ON public.erp_suppliers;
CREATE POLICY "erp_suppliers_tenant_all" ON public.erp_suppliers
    FOR ALL TO authenticated
    USING (
        (organization_id IS NOT NULL AND organization_id IN (
            SELECT organization_id FROM public.user_profiles WHERE id = auth.uid()
        ))
        OR (organization_id IS NULL AND user_id = auth.uid())
    )
    WITH CHECK (
        (organization_id IS NOT NULL AND organization_id IN (
            SELECT organization_id FROM public.user_profiles WHERE id = auth.uid()
        ))
        OR (organization_id IS NULL AND user_id = auth.uid())
    );
