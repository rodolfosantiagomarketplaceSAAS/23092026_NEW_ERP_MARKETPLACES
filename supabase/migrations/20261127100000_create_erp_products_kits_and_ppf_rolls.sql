-- ==============================================================================
-- SAAS DE GESTÃO DE MARKETPLACES E ERP (PADRÃO TINY & BLING)
-- Migration: 20261127100000_create_erp_products_kits_and_ppf_rolls.sql
-- Módulo: Cadastro Mestre de Produtos, Kits (BOM), Bobinas PPF & Vínculo Anúncios/Vendas
-- Descrição:
--   1. Tabela `erp_ppf_rolls` (Bobinas de Película PPF - ex: 12m x 1,52m a R$ 220/m)
--   2. Tabela `erp_products` (Produtos Simples, Peças PPF e Kits/Compostos)
--   3. Tabela `erp_kit_items` (Composição BOM de Kits com múltiplos produtos)
--   4. Tabela `erp_listing_links` (Vínculo Anúncio MLB/Shopee <-> Produto ou Kit ERP)
--   5. Tabela `erp_stock_movements` (Kardex de estoque de produtos e consumo de bobinas)
--   6. Bucket Supabase Storage `erp-product-images` com políticas RLS para upload de fotos
--   7. Índices B-Tree, Triggers `updated_at` e Row Level Security (RLS) Multi-Tenant
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Garante existência da função auxiliar de timestamp
CREATE OR REPLACE FUNCTION public.trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ==============================================================================
-- 1. TABELA: erp_ppf_rolls (Bobinas / Rolos de Película PPF)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.erp_ppf_rolls (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,

    code TEXT NOT NULL CHECK (char_length(trim(code)) >= 1),
    name TEXT NOT NULL CHECK (char_length(trim(name)) >= 1),
    brand TEXT,
    finish TEXT NOT NULL DEFAULT 'brilho', -- brilho, fosco, fume, carbono, outro
    thickness_microns INTEGER CHECK (thickness_microns IS NULL OR thickness_microns > 0),

    -- Dimensões e Custo da Bobina (Padrão: 12m x 1,52m | R$ 220,00 por metro linear)
    roll_width_cm NUMERIC(10, 2) NOT NULL DEFAULT 152.00 CHECK (roll_width_cm > 0),
    roll_length_m NUMERIC(10, 3) NOT NULL DEFAULT 12.000 CHECK (roll_length_m > 0),
    cost_per_linear_meter NUMERIC(12, 2) NOT NULL DEFAULT 220.00 CHECK (cost_per_linear_meter >= 0),
    default_waste_margin_pct NUMERIC(6, 2) NOT NULL DEFAULT 15.00 CHECK (default_waste_margin_pct >= 0 AND default_waste_margin_pct <= 200),

    -- Controle de Saldo da Bobina em Metros Lineares
    total_meters_purchased NUMERIC(12, 3) NOT NULL DEFAULT 12.000 CHECK (total_meters_purchased >= 0),
    remaining_meters NUMERIC(12, 3) NOT NULL DEFAULT 12.000,
    min_alert_meters NUMERIC(10, 3) NOT NULL DEFAULT 2.000 CHECK (min_alert_meters >= 0),

    supplier TEXT,
    lot_number TEXT,
    notes TEXT,
    active BOOLEAN NOT NULL DEFAULT true,

    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_erp_ppf_rolls_org_code
    ON public.erp_ppf_rolls(organization_id, upper(code))
    WHERE organization_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_erp_ppf_rolls_user_code
    ON public.erp_ppf_rolls(user_id, upper(code))
    WHERE organization_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_erp_ppf_rolls_org_active
    ON public.erp_ppf_rolls(organization_id, active)
    WHERE organization_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_erp_ppf_rolls_user_active
    ON public.erp_ppf_rolls(user_id, active)
    WHERE organization_id IS NULL;

DROP TRIGGER IF EXISTS trg_erp_ppf_rolls_updated_at ON public.erp_ppf_rolls;
CREATE TRIGGER trg_erp_ppf_rolls_updated_at
    BEFORE UPDATE ON public.erp_ppf_rolls
    FOR EACH ROW
    EXECUTE FUNCTION public.trigger_set_timestamp();

-- ==============================================================================
-- 2. TABELA: erp_products (Cadastro Mestre de Produtos Simples, Peças PPF e Kits)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.erp_products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,

    product_type TEXT NOT NULL DEFAULT 'simple'
        CHECK (product_type IN ('simple', 'ppf_piece', 'kit')),
    code TEXT NOT NULL CHECK (char_length(trim(code)) >= 1),
    sku TEXT NOT NULL CHECK (char_length(trim(sku)) >= 1),
    ean TEXT,
    name TEXT NOT NULL CHECK (char_length(trim(name)) >= 1),
    description TEXT,

    category TEXT,
    brand TEXT,
    supplier TEXT,
    ncm TEXT,
    unit TEXT NOT NULL DEFAULT 'UN',
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'inactive', 'draft')),
    cost_category TEXT NOT NULL DEFAULT 'material'
        CHECK (cost_category IN ('material', 'packaging', 'accessories', 'printing', 'logistics')),

    -- Galeria de Fotos (Upload Supabase Storage ou URL externa)
    thumbnail_url TEXT,
    photos JSONB NOT NULL DEFAULT '[]'::jsonb,

    -- Dimensões e Peso (suporta mm ou cm)
    dimension_unit TEXT NOT NULL DEFAULT 'cm'
        CHECK (dimension_unit IN ('mm', 'cm')),
    width NUMERIC(10, 2) CHECK (width IS NULL OR width >= 0),
    height NUMERIC(10, 2) CHECK (height IS NULL OR height >= 0),
    depth NUMERIC(10, 2) CHECK (depth IS NULL OR depth >= 0),
    weight_grams NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (weight_grams >= 0),

    -- Configuração de Consumo de Película PPF (Bobina)
    uses_ppf_roll BOOLEAN NOT NULL DEFAULT false,
    ppf_roll_id UUID REFERENCES public.erp_ppf_rolls(id) ON DELETE SET NULL,
    ppf_calc_mode TEXT NOT NULL DEFAULT 'area'
        CHECK (ppf_calc_mode IN ('area', 'linear')),
    ppf_waste_margin_pct NUMERIC(6, 2) NOT NULL DEFAULT 15.00
        CHECK (ppf_waste_margin_pct >= 0 AND ppf_waste_margin_pct <= 200),
    ppf_piece_count INTEGER NOT NULL DEFAULT 1 CHECK (ppf_piece_count >= 1),
    ppf_area_m2 NUMERIC(12, 6) NOT NULL DEFAULT 0.000000 CHECK (ppf_area_m2 >= 0),
    ppf_linear_meters NUMERIC(12, 6) NOT NULL DEFAULT 0.000000 CHECK (ppf_linear_meters >= 0),
    ppf_calculated_cost NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (ppf_calculated_cost >= 0),

    -- Custos e Precificação
    manual_cost NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (manual_cost >= 0),
    extra_cost NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (extra_cost >= 0),
    total_cost NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (total_cost >= 0),
    suggested_price NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (suggested_price >= 0),
    min_price NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (min_price >= 0),

    -- Controle de Estoque
    stock_quantity NUMERIC(12, 3) NOT NULL DEFAULT 0.000,
    min_stock_quantity NUMERIC(12, 3) NOT NULL DEFAULT 0.000 CHECK (min_stock_quantity >= 0),
    storage_location TEXT,
    notes TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_erp_products_org_sku
    ON public.erp_products(organization_id, upper(sku))
    WHERE organization_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_erp_products_user_sku
    ON public.erp_products(user_id, upper(sku))
    WHERE organization_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_erp_products_org_type_status
    ON public.erp_products(organization_id, product_type, status)
    WHERE organization_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_erp_products_user_type_status
    ON public.erp_products(user_id, product_type, status)
    WHERE organization_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_erp_products_ppf_roll
    ON public.erp_products(ppf_roll_id)
    WHERE ppf_roll_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_erp_products_ean
    ON public.erp_products(ean)
    WHERE ean IS NOT NULL;

DROP TRIGGER IF EXISTS trg_erp_products_updated_at ON public.erp_products;
CREATE TRIGGER trg_erp_products_updated_at
    BEFORE UPDATE ON public.erp_products
    FOR EACH ROW
    EXECUTE FUNCTION public.trigger_set_timestamp();

-- ==============================================================================
-- 3. TABELA: erp_kit_items (Composição BOM de Kits)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.erp_kit_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,

    kit_product_id UUID NOT NULL REFERENCES public.erp_products(id) ON DELETE CASCADE,
    component_product_id UUID NOT NULL REFERENCES public.erp_products(id) ON DELETE CASCADE,
    quantity NUMERIC(10, 3) NOT NULL DEFAULT 1.000 CHECK (quantity > 0),
    sort_order INTEGER NOT NULL DEFAULT 0,
    notes TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),

    CONSTRAINT chk_erp_kit_items_no_self_ref CHECK (kit_product_id <> component_product_id),
    CONSTRAINT uq_erp_kit_items_pair UNIQUE (kit_product_id, component_product_id)
);

CREATE INDEX IF NOT EXISTS idx_erp_kit_items_kit
    ON public.erp_kit_items(kit_product_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_erp_kit_items_component
    ON public.erp_kit_items(component_product_id);

DROP TRIGGER IF EXISTS trg_erp_kit_items_updated_at ON public.erp_kit_items;
CREATE TRIGGER trg_erp_kit_items_updated_at
    BEFORE UPDATE ON public.erp_kit_items
    FOR EACH ROW
    EXECUTE FUNCTION public.trigger_set_timestamp();

-- ==============================================================================
-- 4. TABELA: erp_listing_links (Vínculo Anúncio MLB/Shopee <-> Produto ou Kit)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.erp_listing_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,

    platform TEXT NOT NULL DEFAULT 'mercadolivre'
        CHECK (platform IN ('mercadolivre', 'shopee', 'outros')),
    external_listing_id TEXT NOT NULL CHECK (char_length(trim(external_listing_id)) >= 3),
    listing_sku TEXT,
    listing_title TEXT,
    listing_thumbnail TEXT,

    product_id UUID NOT NULL REFERENCES public.erp_products(id) ON DELETE CASCADE,
    quantity_per_sale NUMERIC(10, 3) NOT NULL DEFAULT 1.000 CHECK (quantity_per_sale > 0),

    auto_sync_cost_template BOOLEAN NOT NULL DEFAULT false,
    last_cost_synced_at TIMESTAMPTZ,
    notes TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_erp_listing_links_org_ext
    ON public.erp_listing_links(organization_id, platform, upper(external_listing_id))
    WHERE organization_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_erp_listing_links_user_ext
    ON public.erp_listing_links(user_id, platform, upper(external_listing_id))
    WHERE organization_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_erp_listing_links_product
    ON public.erp_listing_links(product_id);

CREATE INDEX IF NOT EXISTS idx_erp_listing_links_ext_upper
    ON public.erp_listing_links(upper(external_listing_id));

DROP TRIGGER IF EXISTS trg_erp_listing_links_updated_at ON public.erp_listing_links;
CREATE TRIGGER trg_erp_listing_links_updated_at
    BEFORE UPDATE ON public.erp_listing_links
    FOR EACH ROW
    EXECUTE FUNCTION public.trigger_set_timestamp();

-- ==============================================================================
-- 5. TABELA: erp_stock_movements (Kardex de Estoque & Consumo de Bobinas PPF)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.erp_stock_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,

    entity_type TEXT NOT NULL CHECK (entity_type IN ('product', 'ppf_roll')),
    product_id UUID REFERENCES public.erp_products(id) ON DELETE CASCADE,
    ppf_roll_id UUID REFERENCES public.erp_ppf_rolls(id) ON DELETE CASCADE,

    movement_type TEXT NOT NULL
        CHECK (movement_type IN ('in', 'out', 'adjustment', 'sale_deduction', 'sale_return')),
    quantity_delta NUMERIC(12, 4) NOT NULL,
    balance_after NUMERIC(12, 4) NOT NULL,
    unit TEXT NOT NULL DEFAULT 'UN',

    reference_order_id BIGINT,
    reference_mlb_id TEXT,
    reason TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),

    CONSTRAINT chk_erp_stock_movements_target CHECK (
        (entity_type = 'product' AND product_id IS NOT NULL)
        OR (entity_type = 'ppf_roll' AND ppf_roll_id IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_erp_stock_movements_org_created
    ON public.erp_stock_movements(organization_id, created_at DESC)
    WHERE organization_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_erp_stock_movements_user_created
    ON public.erp_stock_movements(user_id, created_at DESC)
    WHERE organization_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_erp_stock_movements_product
    ON public.erp_stock_movements(product_id, created_at DESC)
    WHERE product_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_erp_stock_movements_roll
    ON public.erp_stock_movements(ppf_roll_id, created_at DESC)
    WHERE ppf_roll_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_erp_stock_movements_ref_order
    ON public.erp_stock_movements(reference_order_id)
    WHERE reference_order_id IS NOT NULL;

-- ==============================================================================
-- 6. ROW LEVEL SECURITY (RLS) MULTI-TENANT
-- ==============================================================================
ALTER TABLE public.erp_ppf_rolls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_kit_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_listing_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_stock_movements ENABLE ROW LEVEL SECURITY;

-- Helper inline policy: permite acesso se organization_id bater com user_profiles ou se user_id = auth.uid()
DROP POLICY IF EXISTS "erp_ppf_rolls_tenant_all" ON public.erp_ppf_rolls;
CREATE POLICY "erp_ppf_rolls_tenant_all" ON public.erp_ppf_rolls
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

DROP POLICY IF EXISTS "erp_products_tenant_all" ON public.erp_products;
CREATE POLICY "erp_products_tenant_all" ON public.erp_products
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

DROP POLICY IF EXISTS "erp_kit_items_tenant_all" ON public.erp_kit_items;
CREATE POLICY "erp_kit_items_tenant_all" ON public.erp_kit_items
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

DROP POLICY IF EXISTS "erp_listing_links_tenant_all" ON public.erp_listing_links;
CREATE POLICY "erp_listing_links_tenant_all" ON public.erp_listing_links
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

DROP POLICY IF EXISTS "erp_stock_movements_tenant_all" ON public.erp_stock_movements;
CREATE POLICY "erp_stock_movements_tenant_all" ON public.erp_stock_movements
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

-- ==============================================================================
-- 7. SUPABASE STORAGE BUCKET PARA FOTOS DE PRODUTOS (`erp-product-images`)
-- ==============================================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'erp-product-images',
    'erp-product-images',
    true,
    5242880, -- 5MB por foto
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "erp_product_images_public_read" ON storage.objects;
CREATE POLICY "erp_product_images_public_read"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'erp-product-images');

DROP POLICY IF EXISTS "erp_product_images_auth_insert" ON storage.objects;
CREATE POLICY "erp_product_images_auth_insert"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'erp-product-images');

DROP POLICY IF EXISTS "erp_product_images_auth_delete" ON storage.objects;
CREATE POLICY "erp_product_images_auth_delete"
    ON storage.objects FOR DELETE TO authenticated
    USING (bucket_id = 'erp-product-images');
