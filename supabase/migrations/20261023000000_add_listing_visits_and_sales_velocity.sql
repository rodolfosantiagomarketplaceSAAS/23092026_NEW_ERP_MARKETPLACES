-- ==============================================================================
-- Migration: 20261023000000_add_listing_visits_and_sales_velocity.sql
-- Adiciona suporte a métricas de visitas, vendas recentes (7d e 30d),
-- histórico diário de vendas e tendência de crescimento/queda de vendas.
-- ==============================================================================

ALTER TABLE public.my_listings
    ADD COLUMN IF NOT EXISTS visits INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS sales_last_7_days INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS sales_last_30_days INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS sales_trend VARCHAR(20) DEFAULT 'stable',
    ADD COLUMN IF NOT EXISTS sales_history JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.my_listings.visits IS 'Total de visitas acumuladas ou no período na plataforma';
COMMENT ON COLUMN public.my_listings.sales_last_7_days IS 'Quantidade de unidades vendidas nos últimos 7 dias';
COMMENT ON COLUMN public.my_listings.sales_last_30_days IS 'Quantidade de unidades vendidas nos últimos 30 dias';
COMMENT ON COLUMN public.my_listings.sales_trend IS 'Indicador de tendência de vendas: up (crescente), down (decrescente), stable (estável)';
COMMENT ON COLUMN public.my_listings.sales_history IS 'Série temporal dos pontos diários para renderização de gráfico sparkline';
