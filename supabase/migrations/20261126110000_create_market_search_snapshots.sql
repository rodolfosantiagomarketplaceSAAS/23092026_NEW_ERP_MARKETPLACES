-- ==============================================================================
-- SAAS DE GESTÃO DE MARKETPLACES E ERP (PADRÃO TINY & BLING)
-- Migration: 20261126110000_create_market_search_snapshots.sql
-- Módulo: Inteligência de Negócios — Pesquisa de Mercado (Cache Persistente Serverless)
-- Descrição:
--   Persiste snapshots de pesquisas de mercado (API Oficial ML, Scraper ou
--   Extensão Chrome) com TTL de 6 horas por (tenant, platform, normalized_query).
--   Resolve o problema de memória efêmera em instâncias Serverless (Vercel) e
--   protege as cotas gratuitas do Supabase e da API do Mercado Livre.
-- ==============================================================================

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

ALTER TABLE public.market_search_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant members can select market_search_snapshots" ON public.market_search_snapshots;
CREATE POLICY "Tenant members can select market_search_snapshots"
    ON public.market_search_snapshots FOR SELECT
    USING (
        organization_id = public.get_current_user_org_id()
        OR (organization_id IS NULL AND user_id = auth.uid())
    );

DROP POLICY IF EXISTS "Tenant members can insert market_search_snapshots" ON public.market_search_snapshots;
CREATE POLICY "Tenant members can insert market_search_snapshots"
    ON public.market_search_snapshots FOR INSERT
    WITH CHECK (
        organization_id = public.get_current_user_org_id()
        OR (organization_id IS NULL AND user_id = auth.uid())
    );

DROP POLICY IF EXISTS "Tenant members can update market_search_snapshots" ON public.market_search_snapshots;
CREATE POLICY "Tenant members can update market_search_snapshots"
    ON public.market_search_snapshots FOR UPDATE
    USING (
        organization_id = public.get_current_user_org_id()
        OR (organization_id IS NULL AND user_id = auth.uid())
    );

DROP POLICY IF EXISTS "Tenant members can delete market_search_snapshots" ON public.market_search_snapshots;
CREATE POLICY "Tenant members can delete market_search_snapshots"
    ON public.market_search_snapshots FOR DELETE
    USING (
        organization_id = public.get_current_user_org_id()
        OR (organization_id IS NULL AND user_id = auth.uid())
    );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.market_search_snapshots TO authenticated, service_role;

COMMENT ON TABLE public.market_search_snapshots IS
    'Cache persistente de pesquisas de mercado (TTL 6h) sincronizadas pela API do Mercado Livre ou Extensão Chrome.';
