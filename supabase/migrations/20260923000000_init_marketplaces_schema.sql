-- ==============================================================================
-- SAAS DE GESTÃO DE MARKETPLACES E INTELIGÊNCIA COMPETITIVA (MERCADO LIVRE & SHOPEE)
-- Migration: 20260923000000_init_marketplaces_schema.sql
-- Descrição: Tabelas de Catálogo, Anúncios Próprios, Concorrentes, Pareamentos,
--            Histórico de Preços, Índices Otimizados, Triggers e RLS Políticas.
-- ==============================================================================

-- 1. Habilitar extensões necessárias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Enums de Domínio
DO $$ BEGIN
    CREATE TYPE platform_type AS ENUM ('mercadolivre', 'shopee');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE listing_status_type AS ENUM ('active', 'paused', 'closed');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE shipping_badge_type AS ENUM (
        'ml_full', 'ml_flex', 'ml_coleta', 'ml_correios',
        'shopee_xpress', 'shopee_padrao', 'shopee_frete_gratis', 'outros'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 3. Função auxiliar para atualização de updated_at
CREATE OR REPLACE FUNCTION trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ==============================================================================
-- 4. TABELA: products (Catálogo Mestre / ERP)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    sku VARCHAR(64) NOT NULL,
    title VARCHAR(255) NOT NULL,
    cost_price NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (cost_price >= 0),
    min_selling_price NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (min_selling_price >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_products_user_sku UNIQUE (user_id, sku)
);

-- ==============================================================================
-- 5. TABELA: my_listings (Anúncios Próprios nos Canais)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.my_listings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
    platform platform_type NOT NULL,
    external_id VARCHAR(64) NOT NULL, -- Ex: MLB123456789 ou 23412512.6312412
    title VARCHAR(255) NOT NULL,
    current_price NUMERIC(12, 2) NOT NULL CHECK (current_price >= 0),
    permalink TEXT NOT NULL,
    thumbnail_url TEXT,
    shipping_type VARCHAR(64) NOT NULL DEFAULT 'padrao',
    listing_type VARCHAR(64) NOT NULL DEFAULT 'classico', -- Ex: 'classico', 'premium', 'oficial'
    status listing_status_type NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_my_listings_platform_external UNIQUE (user_id, platform, external_id)
);

-- ==============================================================================
-- 6. TABELA: competitor_listings (Anúncios de Concorrentes Monitorados)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.competitor_listings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    platform platform_type NOT NULL,
    external_id VARCHAR(64) NOT NULL,
    seller_name VARCHAR(128) NOT NULL DEFAULT 'Vendedor Desconhecido',
    seller_reputation VARCHAR(64), -- 'gold', 'platinum', 'oficial', 'indicado'
    title VARCHAR(255) NOT NULL,
    current_price NUMERIC(12, 2) NOT NULL CHECK (current_price >= 0),
    original_price NUMERIC(12, 2) CHECK (original_price >= current_price),
    shipping_type VARCHAR(64) NOT NULL DEFAULT 'padrao', -- 'ml_full', 'ml_flex', 'shopee_xpress', etc.
    promo_badge VARCHAR(128), -- 'Oferta Relâmpago', 'Super Desconto', 'Cupom Ativo'
    permalink TEXT NOT NULL,
    thumbnail_url TEXT,
    sales_count_approx INTEGER DEFAULT 0,
    rating NUMERIC(3, 2) DEFAULT 5.0,
    last_scraped_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_competitor_listings_platform_external UNIQUE (user_id, platform, external_id)
);

-- ==============================================================================
-- 7. TABELA: listing_matches (Pareamento 1 Anúncio Próprio -> N Concorrentes)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.listing_matches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    my_listing_id UUID NOT NULL REFERENCES public.my_listings(id) ON DELETE CASCADE,
    competitor_listing_id UUID NOT NULL REFERENCES public.competitor_listings(id) ON DELETE CASCADE,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_listing_matches_pair UNIQUE (my_listing_id, competitor_listing_id)
);

-- ==============================================================================
-- 8. TABELA: price_history (Histórico Temporal de Preços do Concorrente)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.price_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    competitor_listing_id UUID NOT NULL REFERENCES public.competitor_listings(id) ON DELETE CASCADE,
    price NUMERIC(12, 2) NOT NULL CHECK (price >= 0),
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ==============================================================================
-- 9. ÍNDICES DE PERFORMANCE (B-TREE)
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_products_user_sku ON public.products (user_id, sku);

CREATE INDEX IF NOT EXISTS idx_my_listings_user_platform ON public.my_listings (user_id, platform);
CREATE INDEX IF NOT EXISTS idx_my_listings_ext_id ON public.my_listings (external_id);
CREATE INDEX IF NOT EXISTS idx_my_listings_product_id ON public.my_listings (product_id);

CREATE INDEX IF NOT EXISTS idx_competitor_listings_user_platform ON public.competitor_listings (user_id, platform);
CREATE INDEX IF NOT EXISTS idx_competitor_listings_ext_id ON public.competitor_listings (external_id);
CREATE INDEX IF NOT EXISTS idx_competitor_listings_last_scraped ON public.competitor_listings (last_scraped_at DESC);

CREATE INDEX IF NOT EXISTS idx_listing_matches_user_id ON public.listing_matches (user_id);
CREATE INDEX IF NOT EXISTS idx_listing_matches_my_listing ON public.listing_matches (my_listing_id);
CREATE INDEX IF NOT EXISTS idx_listing_matches_competitor ON public.listing_matches (competitor_listing_id);

CREATE INDEX IF NOT EXISTS idx_price_history_competitor_date ON public.price_history (competitor_listing_id, recorded_at DESC);

-- ==============================================================================
-- 10. TRIGGERS AUTOMÁTICOS
-- ==============================================================================

-- Trigger para updated_at
CREATE OR REPLACE TRIGGER trg_products_updated_at
BEFORE UPDATE ON public.products
FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

CREATE OR REPLACE TRIGGER trg_my_listings_updated_at
BEFORE UPDATE ON public.my_listings
FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

CREATE OR REPLACE TRIGGER trg_competitor_listings_updated_at
BEFORE UPDATE ON public.competitor_listings
FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

-- Trigger para registrar histórico sempre que houver alteração de preço do concorrente
CREATE OR REPLACE FUNCTION trg_record_competitor_price_history()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'INSERT') OR (TG_OP = 'UPDATE' AND OLD.current_price IS DISTINCT FROM NEW.current_price) THEN
        INSERT INTO public.price_history (competitor_listing_id, price, recorded_at)
        VALUES (NEW.id, NEW.current_price, NEW.last_scraped_at);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_competitor_price_history_log
AFTER INSERT OR UPDATE ON public.competitor_listings
FOR EACH ROW EXECUTE FUNCTION trg_record_competitor_price_history();

-- ==============================================================================
-- 11. HABILITAÇÃO DO SUPABASE REALTIME
-- ==============================================================================
-- Adiciona tabelas na publicação realtime para que o frontend escute updates sem reload
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'competitor_listings'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.competitor_listings;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'price_history'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.price_history;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'listing_matches'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.listing_matches;
  END IF;
END $$;

-- Configura replica identity completa para permitir payloads ricos com OLD e NEW no Realtime
ALTER TABLE public.competitor_listings REPLICA IDENTITY FULL;
ALTER TABLE public.price_history REPLICA IDENTITY FULL;

-- ==============================================================================
-- 12. ROW LEVEL SECURITY (RLS) - ISOLAMENTO MULTITENANT POR USER_ID
-- ==============================================================================
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.my_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.competitor_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.listing_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_history ENABLE ROW LEVEL SECURITY;

-- Products RLS
CREATE POLICY "products_user_all" ON public.products
    FOR ALL
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- My Listings RLS
CREATE POLICY "my_listings_user_all" ON public.my_listings
    FOR ALL
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Competitor Listings RLS
CREATE POLICY "competitor_listings_user_all" ON public.competitor_listings
    FOR ALL
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Listing Matches RLS
CREATE POLICY "listing_matches_user_all" ON public.listing_matches
    FOR ALL
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Price History RLS (Baseado no dono do competitor_listing)
CREATE POLICY "price_history_user_select" ON public.price_history
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.competitor_listings cl
            WHERE cl.id = price_history.competitor_listing_id
              AND cl.user_id = auth.uid()
        )
    );

CREATE POLICY "price_history_user_insert" ON public.price_history
    FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.competitor_listings cl
            WHERE cl.id = price_history.competitor_listing_id
              AND cl.user_id = auth.uid()
        )
    );

-- ==============================================================================
-- 13. SEED INICIAL DE DEMONSTRAÇÃO (Opcional - seguro para novos schemas)
-- ==============================================================================
-- Criação de função para popular dados simulados de desenvolvimento
CREATE OR REPLACE FUNCTION public.seed_demo_marketplaces_data(target_user_id UUID)
RETURNS VOID AS $$
DECLARE
    p1_id UUID;
    p2_id UUID;
    ml1_id UUID;
    ml2_id UUID;
    shp1_id UUID;
    comp_ml1 UUID;
    comp_ml2 UUID;
    comp_shp1 UUID;
BEGIN
    -- 1. Inserir Produtos Base
    INSERT INTO public.products (user_id, sku, title, cost_price, min_selling_price)
    VALUES (target_user_id, 'TECL-MECA-RGB', 'Teclado Mecânico Gamer RGB Switch Blue', 120.00, 169.90)
    ON CONFLICT (user_id, sku) DO UPDATE SET title = EXCLUDED.title RETURNING id INTO p1_id;

    INSERT INTO public.products (user_id, sku, title, cost_price, min_selling_price)
    VALUES (target_user_id, 'FONE-BT-ANC', 'Fone de Ouvido Bluetooth com Cancelamento Ruído', 85.00, 129.90)
    ON CONFLICT (user_id, sku) DO UPDATE SET title = EXCLUDED.title RETURNING id INTO p2_id;

    -- 2. Anúncios Próprios Mercado Livre
    INSERT INTO public.my_listings (user_id, product_id, platform, external_id, title, current_price, permalink, shipping_type, listing_type, status)
    VALUES (
        target_user_id, p1_id, 'mercadolivre', 'MLB3492817263',
        'Teclado Mecânico Gamer Led Rgb Switch Blue Anti-ghosting Pro', 199.90,
        'https://produto.mercadolivre.com.br/MLB-3492817263-teclado-mecanico-gamer',
        'ml_full', 'premium', 'active'
    ) ON CONFLICT (user_id, platform, external_id) DO UPDATE SET current_price = EXCLUDED.current_price RETURNING id INTO ml1_id;

    INSERT INTO public.my_listings (user_id, product_id, platform, external_id, title, current_price, permalink, shipping_type, listing_type, status)
    VALUES (
        target_user_id, p2_id, 'mercadolivre', 'MLB2819201948',
        'Fone Ouvido Sem Fio Bluetooth 5.3 Microfone Bateria 30h Top', 149.90,
        'https://produto.mercadolivre.com.br/MLB-2819201948-fone-ouvido-sem-fio',
        'ml_coleta', 'classico', 'active'
    ) ON CONFLICT (user_id, platform, external_id) DO UPDATE SET current_price = EXCLUDED.current_price RETURNING id INTO ml2_id;

    -- 3. Anúncios Próprios Shopee
    INSERT INTO public.my_listings (user_id, product_id, platform, external_id, title, current_price, permalink, shipping_type, listing_type, status)
    VALUES (
        target_user_id, p1_id, 'shopee', 'SHP98127391.129381',
        'Teclado Gamer Mecânico Led RGB Switch Blue Original ABNT2', 189.90,
        'https://shopee.com.br/product/98127391/129381',
        'shopee_xpress', 'oficial', 'active'
    ) ON CONFLICT (user_id, platform, external_id) DO UPDATE SET current_price = EXCLUDED.current_price RETURNING id INTO shp1_id;

    -- 4. Anúncios Concorrentes Mercado Livre
    INSERT INTO public.competitor_listings (
        user_id, platform, external_id, seller_name, seller_reputation,
        title, current_price, original_price, shipping_type, promo_badge, permalink
    ) VALUES (
        target_user_id, 'mercadolivre', 'MLB9988776655', 'Mega Informática Store', 'platinum',
        'Teclado Gamer Mecânico RGB Switch Blue Gamer Pro Brasil', 184.90, 219.90,
        'ml_full', 'Oferta do Dia', 'https://produto.mercadolivre.com.br/MLB-9988776655-teclado-gamer'
    ) ON CONFLICT (user_id, platform, external_id) DO UPDATE SET current_price = EXCLUDED.current_price RETURNING id INTO comp_ml1;

    INSERT INTO public.competitor_listings (
        user_id, platform, external_id, seller_name, seller_reputation,
        title, current_price, original_price, shipping_type, promo_badge, permalink
    ) VALUES (
        target_user_id, 'mercadolivre', 'MLB5544332211', 'Tech Prime Oficial', 'gold',
        'Teclado Mecânico RGB Switch Azul Promoção Queima Estoque', 209.00, 229.00,
        'ml_flex', 'Cupom 10%', 'https://produto.mercadolivre.com.br/MLB-5544332211-teclado-mecanico'
    ) ON CONFLICT (user_id, platform, external_id) DO UPDATE SET current_price = EXCLUDED.current_price RETURNING id INTO comp_ml2;

    -- 5. Anúncios Concorrentes Shopee
    INSERT INTO public.competitor_listings (
        user_id, platform, external_id, seller_name, seller_reputation,
        title, current_price, original_price, shipping_type, promo_badge, permalink
    ) VALUES (
        target_user_id, 'shopee', 'SHP77665544.887766', 'Gamer Zone Brasil', 'indicado',
        'Teclado Mecânico ABNT2 RGB Switch Blue Led Pronta Entrega', 178.50, 199.90,
        'shopee_frete_gratis', 'Oferta Relâmpago', 'https://shopee.com.br/product/77665544/887766'
    ) ON CONFLICT (user_id, platform, external_id) DO UPDATE SET current_price = EXCLUDED.current_price RETURNING id INTO comp_shp1;

    -- 6. Pareamento (Listing Matches)
    INSERT INTO public.listing_matches (user_id, my_listing_id, competitor_listing_id)
    VALUES 
        (target_user_id, ml1_id, comp_ml1),
        (target_user_id, ml1_id, comp_ml2),
        (target_user_id, shp1_id, comp_shp1)
    ON CONFLICT (my_listing_id, competitor_listing_id) DO NOTHING;

END;
$$ LANGUAGE plpgsql;
