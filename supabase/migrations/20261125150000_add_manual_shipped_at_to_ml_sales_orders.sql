-- ==============================================================================
-- SAAS DE GESTÃO DE MARKETPLACES E ERP (PADRÃO TINY & BLING)
-- Migration: 20261125150000_add_manual_shipped_at_to_ml_sales_orders.sql
-- Módulo: Gestão de Vendas & Repasses — Data de Envio Manual Protegida vs API ML
-- Descrição:
--   1. Adiciona `shipped_at_manual` (trava booleana que impede sobrescrita da data manual durante sync/webhook)
--   2. Adiciona `api_shipped_at` (preserva o timestamp oficial do Mercado Livre para permitir reversão em 1 clique)
--   3. Backfill inicial de `api_shipped_at` com os valores atuais de `shipped_at`
-- ==============================================================================

ALTER TABLE public.ml_sales_orders
    ADD COLUMN IF NOT EXISTS shipped_at_manual BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS api_shipped_at TIMESTAMPTZ;

-- Preserva nos pedidos já sincronizados o espelho oficial da API do Mercado Livre
UPDATE public.ml_sales_orders
SET api_shipped_at = shipped_at
WHERE shipped_at IS NOT NULL
  AND api_shipped_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_ml_sales_orders_manual_shipped_at
    ON public.ml_sales_orders(organization_id, shipped_at DESC)
    WHERE shipped_at_manual = TRUE;

COMMENT ON COLUMN public.ml_sales_orders.shipped_at_manual IS
    'Indica se shipped_at foi definido manualmente pelo gestor (true = protegido contra sobrescrita em futuros syncs da API ML)';

COMMENT ON COLUMN public.ml_sales_orders.api_shipped_at IS
    'Timestamp original de postagem/coleta retornado pela API oficial do Mercado Livre, preservado mesmo quando há override manual';

-- Recarrega o cache de schema do PostgREST / Supabase API imediatamente
NOTIFY pgrst, 'reload schema';
