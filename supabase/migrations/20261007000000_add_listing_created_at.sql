-- ==============================================================================
-- Migration: 20261007000000_add_listing_created_at.sql
-- Descrição: Adiciona colunas para data original de criação do anúncio no marketplace
--            e quantidade de vendas aproximadas tanto para concorrentes quanto próprios.
-- ==============================================================================

-- 1. Coluna listing_created_at na tabela competitor_listings
ALTER TABLE public.competitor_listings 
ADD COLUMN IF NOT EXISTS listing_created_at TIMESTAMPTZ;

-- 2. Coluna sales_count_approx e listing_created_at na tabela my_listings (caso não existam)
ALTER TABLE public.my_listings 
ADD COLUMN IF NOT EXISTS sales_count_approx INTEGER DEFAULT 0;

ALTER TABLE public.my_listings 
ADD COLUMN IF NOT EXISTS listing_created_at TIMESTAMPTZ;

COMMENT ON COLUMN public.competitor_listings.listing_created_at IS 'Data original de criação do anúncio no marketplace (ex: Mercado Livre / Shopee)';
COMMENT ON COLUMN public.competitor_listings.sales_count_approx IS 'Quantidade acumulada estimada de vendas do anúncio do concorrente';
