-- ============================================================================
-- MIGRATION: TABELA DE ANÚNCIOS SALVOS PARA ANALISAR & CRIAR (OPPORTUNITY LIST)
-- Permite salvar anúncios interessantes de concorrentes (via Raio-X, Pesquisa de
-- Mercado, Extensão ou Webscraping direto por Link), marcar como "OK / Criado"
-- (destaque em verde) e excluir para liberar espaço.
-- ============================================================================

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
  last_scraped_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_competitor_saved_listings_user_ext
  ON public.competitor_saved_listings (user_id, external_id);

CREATE INDEX IF NOT EXISTS idx_competitor_saved_listings_status
  ON public.competitor_saved_listings (status);

CREATE INDEX IF NOT EXISTS idx_competitor_saved_listings_created_at
  ON public.competitor_saved_listings (created_at DESC);

ALTER TABLE public.competitor_saved_listings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'competitor_saved_listings'
      AND policyname = 'Allow full access to competitor_saved_listings'
  ) THEN
    CREATE POLICY "Allow full access to competitor_saved_listings"
      ON public.competitor_saved_listings
      FOR ALL
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;
