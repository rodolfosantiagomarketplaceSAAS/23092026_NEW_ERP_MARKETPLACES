-- ==============================================================================
-- Migration: 20261030000000_create_competitor_stores_and_store_listings.sql
-- Descrição: Espião de Lojas de Concorrentes (Mercado Livre) e Coleta em Massa de Anúncios
-- ==============================================================================

-- 1. TABELA: competitor_stores (Lojas e Vendedores Concorrentes Rastreados)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.competitor_stores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    platform platform_type NOT NULL DEFAULT 'mercadolivre',
    store_name VARCHAR(255) NOT NULL,
    seller_id VARCHAR(100), -- CustId ou ID numérico oficial do vendedor
    seller_nickname VARCHAR(100),
    store_url TEXT NOT NULL, -- Link salvo da loja no ERP
    segment VARCHAR(100) NOT NULL DEFAULT 'Geral', -- Nicho/Seguimento editável
    is_following BOOLEAN NOT NULL DEFAULT true, -- Seguir concorrente
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

-- 2. TABELA: competitor_store_listings (Todos os Anúncios Coletados da Loja)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.competitor_store_listings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.competitor_stores(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    platform platform_type NOT NULL DEFAULT 'mercadolivre',
    external_id VARCHAR(64) NOT NULL, -- Ex: MLB34928192
    title VARCHAR(255) NOT NULL,
    current_price NUMERIC(12, 2) NOT NULL CHECK (current_price >= 0),
    original_price NUMERIC(12, 2),
    discount_pct INTEGER,
    sales_count_approx INTEGER DEFAULT 0,
    listing_created_at TIMESTAMPTZ, -- Data de criação do anúncio
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

-- Índices de Alta Performance
CREATE INDEX IF NOT EXISTS idx_competitor_stores_user_following ON public.competitor_stores (user_id, is_following);
CREATE INDEX IF NOT EXISTS idx_competitor_stores_segment ON public.competitor_stores (user_id, segment);
CREATE INDEX IF NOT EXISTS idx_competitor_store_listings_store_id ON public.competitor_store_listings (store_id);
CREATE INDEX IF NOT EXISTS idx_competitor_store_listings_sales ON public.competitor_store_listings (sales_count_approx DESC);
CREATE INDEX IF NOT EXISTS idx_competitor_store_listings_created_at ON public.competitor_store_listings (listing_created_at DESC);
CREATE INDEX IF NOT EXISTS idx_competitor_store_listings_ext_id ON public.competitor_store_listings (external_id);

-- Triggers de timestamp
DROP TRIGGER IF EXISTS trg_competitor_stores_updated_at ON public.competitor_stores;
CREATE TRIGGER trg_competitor_stores_updated_at
BEFORE UPDATE ON public.competitor_stores
FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

DROP TRIGGER IF EXISTS trg_competitor_store_listings_updated_at ON public.competitor_store_listings;
CREATE TRIGGER trg_competitor_store_listings_updated_at
BEFORE UPDATE ON public.competitor_store_listings
FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

-- RLS (Row Level Security)
ALTER TABLE public.competitor_stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.competitor_store_listings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "competitor_stores_user_all" ON public.competitor_stores;
CREATE POLICY "competitor_stores_user_all" ON public.competitor_stores
    FOR ALL
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "competitor_store_listings_user_all" ON public.competitor_store_listings;
CREATE POLICY "competitor_store_listings_user_all" ON public.competitor_store_listings
    FOR ALL
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

