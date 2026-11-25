-- ==============================================================================
-- SAAS DE GESTÃO DE MARKETPLACES E ERP
-- Migration: 20261125170000_create_ml_catalog_3_level_hierarchy.sql
-- Módulo: Anúncios & Catálogo — Arquitetura Oficial Mercado Livre (User Products)
-- Descrição:
--   1. Nível 1: `ml_families` (Anúncio Principal / Família)
--   2. Nível 2: `ml_variations` (Sub-anúncio / User Product / SKU / Estoque único)
--   3. Nível 3: `ml_sale_options` (Opções de Venda / Anúncios MLB individuais)
--   4. View agregada `ml_families_aggregated` (estoque somado APENAS do Nível 2)
--   5. RPC transacional `sync_ml_catalog_hierarchy` (upsert atômico + inativação)
--   6. Índices otimizados e RLS Multi-Tenant (`organization_id` / `user_id`)
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE OR REPLACE FUNCTION public.trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ==============================================================================
-- 1. NÍVEL 1: ml_families (Anúncio Principal / Família no Mercado Livre)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.ml_families (
    family_id TEXT PRIMARY KEY CHECK (char_length(trim(family_id)) >= 1),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    seller_id TEXT NOT NULL CHECK (char_length(trim(seller_id)) >= 1),
    is_official_family_id BOOLEAN NOT NULL DEFAULT true,
    title TEXT NOT NULL CHECK (char_length(trim(title)) >= 1),
    thumbnail_url TEXT,
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'paused', 'closed')),
    last_synced_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_ml_families_org_seller_status
    ON public.ml_families (organization_id, seller_id, status)
    WHERE organization_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ml_families_user_seller_status
    ON public.ml_families (user_id, seller_id, status)
    WHERE organization_id IS NULL;

DROP TRIGGER IF EXISTS trg_ml_families_updated_at ON public.ml_families;
CREATE TRIGGER trg_ml_families_updated_at
    BEFORE UPDATE ON public.ml_families
    FOR EACH ROW
    EXECUTE FUNCTION public.trigger_set_timestamp();

-- ==============================================================================
-- 2. NÍVEL 2: ml_variations (Sub-anúncio / User Product / SKU / Estoque Unificado)
-- ==============================================================================
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

CREATE INDEX IF NOT EXISTS idx_ml_variations_family_id
    ON public.ml_variations (family_id);

CREATE INDEX IF NOT EXISTS idx_ml_variations_org_seller
    ON public.ml_variations (organization_id, seller_id)
    WHERE organization_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ml_variations_user_seller
    ON public.ml_variations (user_id, seller_id)
    WHERE organization_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_ml_variations_sku
    ON public.ml_variations (sku)
    WHERE sku IS NOT NULL;

DROP TRIGGER IF EXISTS trg_ml_variations_updated_at ON public.ml_variations;
CREATE TRIGGER trg_ml_variations_updated_at
    BEFORE UPDATE ON public.ml_variations
    FOR EACH ROW
    EXECUTE FUNCTION public.trigger_set_timestamp();

-- ==============================================================================
-- 3. NÍVEL 3: ml_sale_options (Opções de Venda / Anúncios MLB individuais)
-- ==============================================================================
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

CREATE INDEX IF NOT EXISTS idx_ml_sale_options_user_product_id
    ON public.ml_sale_options (user_product_id);

CREATE INDEX IF NOT EXISTS idx_ml_sale_options_family_id
    ON public.ml_sale_options (family_id);

CREATE INDEX IF NOT EXISTS idx_ml_sale_options_org_seller_status
    ON public.ml_sale_options (organization_id, seller_id, status)
    WHERE organization_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ml_sale_options_user_seller_status
    ON public.ml_sale_options (user_id, seller_id, status)
    WHERE organization_id IS NULL;

DROP TRIGGER IF EXISTS trg_ml_sale_options_updated_at ON public.ml_sale_options;
CREATE TRIGGER trg_ml_sale_options_updated_at
    BEFORE UPDATE ON public.ml_sale_options
    FOR EACH ROW
    EXECUTE FUNCTION public.trigger_set_timestamp();

-- ==============================================================================
-- 4. VIEW AGREGADA: ml_families_aggregated
--    Regra de integridade: `total_stock` soma EXCLUSIVAMENTE do Nível 2
--    (`ml_variations.available_quantity`), nunca do Nível 3 (`ml_sale_options`).
-- ==============================================================================
CREATE OR REPLACE VIEW public.ml_families_aggregated AS
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

-- ==============================================================================
-- 5. RPC TRANSACIONAL ATÔMICA: sync_ml_catalog_hierarchy
--    Realiza UPSERT atômico nos 3 níveis e inativa/remove registros obsoletos
--    que não existem mais na conta do vendedor.
-- ==============================================================================
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
    -- 1. Upsert Nível 1: ml_families
    INSERT INTO public.ml_families (
        family_id,
        organization_id,
        user_id,
        seller_id,
        is_official_family_id,
        title,
        thumbnail_url,
        status,
        last_synced_at
    )
    SELECT
        x.family_id,
        p_organization_id,
        p_user_id,
        p_seller_id,
        COALESCE(x.is_official_family_id, true),
        x.title,
        x.thumbnail_url,
        CASE WHEN x.status IN ('active', 'paused', 'closed') THEN x.status ELSE 'active' END,
        v_now
    FROM jsonb_to_recordset(COALESCE(p_families, '[]'::jsonb)) AS x(
        family_id TEXT,
        is_official_family_id BOOLEAN,
        title TEXT,
        thumbnail_url TEXT,
        status TEXT
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

    -- 2. Upsert Nível 2: ml_variations
    INSERT INTO public.ml_variations (
        user_product_id,
        family_id,
        organization_id,
        user_id,
        seller_id,
        variation_name,
        sku,
        thumbnail_url,
        available_quantity,
        mlbs_list,
        last_synced_at
    )
    SELECT
        x.user_product_id,
        x.family_id,
        p_organization_id,
        p_user_id,
        p_seller_id,
        x.variation_name,
        x.sku,
        x.thumbnail_url,
        GREATEST(0, COALESCE(x.available_quantity, 0)),
        COALESCE(x.mlbs_list, '[]'::jsonb),
        v_now
    FROM jsonb_to_recordset(COALESCE(p_variations, '[]'::jsonb)) AS x(
        user_product_id TEXT,
        family_id TEXT,
        variation_name TEXT,
        sku TEXT,
        thumbnail_url TEXT,
        available_quantity INTEGER,
        mlbs_list JSONB
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

    -- 3. Upsert Nível 3: ml_sale_options
    INSERT INTO public.ml_sale_options (
        item_id,
        user_product_id,
        family_id,
        organization_id,
        user_id,
        seller_id,
        title,
        category_id,
        listing_type_id,
        catalog_listing,
        catalog_product_id,
        has_wholesale,
        base_price,
        promo_price,
        sale_fee_amount,
        sale_fee_pct,
        shipping_cost_amount,
        free_shipping,
        shipping_mode_label,
        shipping_logistic_type,
        net_receive_amount,
        visits_7d,
        sales_7d,
        sales_30d,
        sold_quantity,
        conversion_rate_7d,
        health_score,
        pending_goals_count,
        recommendation_title,
        recommendation_action,
        status,
        sub_status,
        permalink,
        thumbnail_url,
        last_synced_at
    )
    SELECT
        x.item_id,
        x.user_product_id,
        x.family_id,
        p_organization_id,
        p_user_id,
        p_seller_id,
        x.title,
        x.category_id,
        COALESCE(x.listing_type_id, 'gold_special'),
        COALESCE(x.catalog_listing, false),
        x.catalog_product_id,
        COALESCE(x.has_wholesale, false),
        GREATEST(0, COALESCE(x.base_price, 0)),
        CASE WHEN x.promo_price IS NOT NULL AND x.promo_price >= 0 THEN x.promo_price ELSE NULL END,
        GREATEST(0, COALESCE(x.sale_fee_amount, 0)),
        GREATEST(0, COALESCE(x.sale_fee_pct, 0)),
        GREATEST(0, COALESCE(x.shipping_cost_amount, 0)),
        COALESCE(x.free_shipping, false),
        COALESCE(x.shipping_mode_label, 'Envio por conta do comprador'),
        COALESCE(x.shipping_logistic_type, 'padrao'),
        COALESCE(x.net_receive_amount, 0),
        GREATEST(0, COALESCE(x.visits_7d, 0)),
        GREATEST(0, COALESCE(x.sales_7d, 0)),
        GREATEST(0, COALESCE(x.sales_30d, 0)),
        GREATEST(0, COALESCE(x.sold_quantity, 0)),
        GREATEST(0, COALESCE(x.conversion_rate_7d, 0)),
        CASE
            WHEN x.health_score IS NOT NULL AND x.health_score >= 0 AND x.health_score <= 100
            THEN x.health_score
            ELSE NULL
        END,
        GREATEST(0, COALESCE(x.pending_goals_count, 0)),
        x.recommendation_title,
        x.recommendation_action,
        CASE
            WHEN x.status IN ('active', 'paused', 'under_review', 'closed') THEN x.status
            ELSE 'paused'
        END,
        x.sub_status,
        x.permalink,
        x.thumbnail_url,
        v_now
    FROM jsonb_to_recordset(COALESCE(p_sale_options, '[]'::jsonb)) AS x(
        item_id TEXT,
        user_product_id TEXT,
        family_id TEXT,
        title TEXT,
        category_id TEXT,
        listing_type_id TEXT,
        catalog_listing BOOLEAN,
        catalog_product_id TEXT,
        has_wholesale BOOLEAN,
        base_price NUMERIC,
        promo_price NUMERIC,
        sale_fee_amount NUMERIC,
        sale_fee_pct NUMERIC,
        shipping_cost_amount NUMERIC,
        free_shipping BOOLEAN,
        shipping_mode_label TEXT,
        shipping_logistic_type TEXT,
        net_receive_amount NUMERIC,
        visits_7d INTEGER,
        sales_7d INTEGER,
        sales_30d INTEGER,
        sold_quantity INTEGER,
        conversion_rate_7d NUMERIC,
        health_score INTEGER,
        pending_goals_count INTEGER,
        recommendation_title TEXT,
        recommendation_action TEXT,
        status TEXT,
        sub_status TEXT,
        permalink TEXT,
        thumbnail_url TEXT
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

    -- 4. Inativar opções de venda obsoletas (não existem mais na conta do vendedor)
    UPDATE public.ml_sale_options
    SET status = 'closed', updated_at = v_now
    WHERE seller_id = p_seller_id
      AND (
          (p_organization_id IS NOT NULL AND organization_id = p_organization_id)
          OR (p_organization_id IS NULL AND organization_id IS NULL AND user_id = p_user_id)
      )
      AND status <> 'closed'
      AND last_synced_at < v_now;

    GET DIAGNOSTICS v_options_closed = ROW_COUNT;

    -- 5. Remover variações órfãs que não possuem nenhuma opção ativa/pausada/em revisão
    DELETE FROM public.ml_variations v
    WHERE v.seller_id = p_seller_id
      AND (
          (p_organization_id IS NOT NULL AND v.organization_id = p_organization_id)
          OR (p_organization_id IS NULL AND v.organization_id IS NULL AND v.user_id = p_user_id)
      )
      AND v.last_synced_at < v_now
      AND NOT EXISTS (
          SELECT 1
          FROM public.ml_sale_options o
          WHERE o.user_product_id = v.user_product_id
            AND o.status <> 'closed'
      );

    -- 6. Inativar famílias obsoletas que não vieram no sync atual
    UPDATE public.ml_families f
    SET status = 'closed', updated_at = v_now
    WHERE f.seller_id = p_seller_id
      AND (
          (p_organization_id IS NOT NULL AND f.organization_id = p_organization_id)
          OR (p_organization_id IS NULL AND f.organization_id IS NULL AND f.user_id = p_user_id)
      )
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
-- 6. ROW LEVEL SECURITY (RLS) E PERMISSÕES MULTI-TENANT
-- ==============================================================================
ALTER TABLE public.ml_families ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ml_variations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ml_sale_options ENABLE ROW LEVEL SECURITY;

-- Políticas: ml_families
DROP POLICY IF EXISTS "Tenant members can select ml_families" ON public.ml_families;
CREATE POLICY "Tenant members can select ml_families"
    ON public.ml_families FOR SELECT
    USING (
        organization_id = public.get_current_user_org_id()
        OR (organization_id IS NULL AND user_id = auth.uid())
    );

DROP POLICY IF EXISTS "Tenant members can insert ml_families" ON public.ml_families;
CREATE POLICY "Tenant members can insert ml_families"
    ON public.ml_families FOR INSERT
    WITH CHECK (
        organization_id = public.get_current_user_org_id()
        OR (organization_id IS NULL AND user_id = auth.uid())
    );

DROP POLICY IF EXISTS "Tenant members can update ml_families" ON public.ml_families;
CREATE POLICY "Tenant members can update ml_families"
    ON public.ml_families FOR UPDATE
    USING (
        organization_id = public.get_current_user_org_id()
        OR (organization_id IS NULL AND user_id = auth.uid())
    );

DROP POLICY IF EXISTS "Tenant members can delete ml_families" ON public.ml_families;
CREATE POLICY "Tenant members can delete ml_families"
    ON public.ml_families FOR DELETE
    USING (
        organization_id = public.get_current_user_org_id()
        OR (organization_id IS NULL AND user_id = auth.uid())
    );

-- Políticas: ml_variations
DROP POLICY IF EXISTS "Tenant members can select ml_variations" ON public.ml_variations;
CREATE POLICY "Tenant members can select ml_variations"
    ON public.ml_variations FOR SELECT
    USING (
        organization_id = public.get_current_user_org_id()
        OR (organization_id IS NULL AND user_id = auth.uid())
    );

DROP POLICY IF EXISTS "Tenant members can insert ml_variations" ON public.ml_variations;
CREATE POLICY "Tenant members can insert ml_variations"
    ON public.ml_variations FOR INSERT
    WITH CHECK (
        organization_id = public.get_current_user_org_id()
        OR (organization_id IS NULL AND user_id = auth.uid())
    );

DROP POLICY IF EXISTS "Tenant members can update ml_variations" ON public.ml_variations;
CREATE POLICY "Tenant members can update ml_variations"
    ON public.ml_variations FOR UPDATE
    USING (
        organization_id = public.get_current_user_org_id()
        OR (organization_id IS NULL AND user_id = auth.uid())
    );

DROP POLICY IF EXISTS "Tenant members can delete ml_variations" ON public.ml_variations;
CREATE POLICY "Tenant members can delete ml_variations"
    ON public.ml_variations FOR DELETE
    USING (
        organization_id = public.get_current_user_org_id()
        OR (organization_id IS NULL AND user_id = auth.uid())
    );

-- Políticas: ml_sale_options
DROP POLICY IF EXISTS "Tenant members can select ml_sale_options" ON public.ml_sale_options;
CREATE POLICY "Tenant members can select ml_sale_options"
    ON public.ml_sale_options FOR SELECT
    USING (
        organization_id = public.get_current_user_org_id()
        OR (organization_id IS NULL AND user_id = auth.uid())
    );

DROP POLICY IF EXISTS "Tenant members can insert ml_sale_options" ON public.ml_sale_options;
CREATE POLICY "Tenant members can insert ml_sale_options"
    ON public.ml_sale_options FOR INSERT
    WITH CHECK (
        organization_id = public.get_current_user_org_id()
        OR (organization_id IS NULL AND user_id = auth.uid())
    );

DROP POLICY IF EXISTS "Tenant members can update ml_sale_options" ON public.ml_sale_options;
CREATE POLICY "Tenant members can update ml_sale_options"
    ON public.ml_sale_options FOR UPDATE
    USING (
        organization_id = public.get_current_user_org_id()
        OR (organization_id IS NULL AND user_id = auth.uid())
    );

DROP POLICY IF EXISTS "Tenant members can delete ml_sale_options" ON public.ml_sale_options;
CREATE POLICY "Tenant members can delete ml_sale_options"
    ON public.ml_sale_options FOR DELETE
    USING (
        organization_id = public.get_current_user_org_id()
        OR (organization_id IS NULL AND user_id = auth.uid())
    );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ml_families TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ml_variations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ml_sale_options TO authenticated;
GRANT SELECT ON public.ml_families_aggregated TO authenticated;

COMMENT ON TABLE public.ml_families IS 'Nível 1 (User Products ML): Anúncio Principal / Família de anúncios';
COMMENT ON TABLE public.ml_variations IS 'Nível 2 (User Products ML): Sub-anúncio / User Product / SKU com estoque físico unificado';
COMMENT ON TABLE public.ml_sale_options IS 'Nível 3 (User Products ML): Opções de venda individuais (MLB Clássico, Premium, Catálogo, Atacado)';
COMMENT ON VIEW public.ml_families_aggregated IS 'Agregação dinâmica do Nível 1 com estoque somado exclusivamente do Nível 2 (sem duplicidade)';
