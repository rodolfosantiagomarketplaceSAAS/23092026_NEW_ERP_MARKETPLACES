-- ==============================================================================
-- Migration: 20261016000001_enhance_my_listings_ml_expert.sql
-- Adiciona suporte a variações completas, original_price (preço normal riscado),
-- total de vendas (sold_quantity), estoque disponível e metadados detalhados de anúncio ML
-- ==============================================================================

ALTER TABLE public.my_listings
    ADD COLUMN IF NOT EXISTS original_price NUMERIC(12, 2),
    ADD COLUMN IF NOT EXISTS sold_quantity INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS available_quantity INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS variations JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS sale_terms JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS channels JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS raw_data JSONB DEFAULT '{}'::jsonb;

-- Índice para consultas rápidas por status e data
CREATE INDEX IF NOT EXISTS idx_my_listings_status ON public.my_listings(user_id, status);
