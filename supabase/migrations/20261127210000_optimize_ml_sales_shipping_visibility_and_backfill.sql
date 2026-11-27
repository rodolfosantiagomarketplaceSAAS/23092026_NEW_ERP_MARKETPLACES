-- ==============================================================================
-- SAAS DE GESTÃO DE MARKETPLACES E ERP (PADRÃO TINY & BLING)
-- Migration: 20261127210000_optimize_ml_sales_shipping_visibility_and_backfill.sql
-- Módulo: Gestão de Vendas & Repasses — Datas Reais de Envio ML + Visibilidade Total
-- Descrição:
--   1. Garante de forma idempotente todas as colunas de envio (`shipped_at`, `delivered_at`,
--      `logistic_type`, `shipped_at_manual`, `api_shipped_at`) caso alguma migration anterior não tenha rodado.
--   2. Protege marcações manuais legadas (gravadas ao meio-dia BRT / 15:00:00Z) marcando `shipped_at_manual = TRUE`
--      para que o backfill automático da API do Mercado Livre preserve 100% do trabalho manual do gestor.
--   3. Cria índices compostos parciais B-Tree para listagem instantânea de vendas aguardando envio (`shipped_at IS NULL`)
--      por `order_date` e `shipping_deadline` na aba "Por Dia do Envio" e para reconciliação de `api_shipped_at`.
-- ==============================================================================

ALTER TABLE public.ml_sales_orders
    ADD COLUMN IF NOT EXISTS shipped_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS logistic_type TEXT,
    ADD COLUMN IF NOT EXISTS shipped_at_manual BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS api_shipped_at TIMESTAMPTZ;

-- 1. Protege marcações manuais feitas antes da coluna `shipped_at_manual` existir
-- (`normalizeManualShippedAtInput("YYYY-MM-DD")` grava exatamente 15:00:00.000 UTC / 12:00 BRT)
UPDATE public.ml_sales_orders
SET shipped_at_manual = TRUE
WHERE shipped_at IS NOT NULL
  AND shipped_at_manual = FALSE
  AND api_shipped_at IS NULL
  AND EXTRACT(HOUR FROM (shipped_at AT TIME ZONE 'UTC')) = 15
  AND EXTRACT(MINUTE FROM (shipped_at AT TIME ZONE 'UTC')) = 0
  AND EXTRACT(SECOND FROM (shipped_at AT TIME ZONE 'UTC')) = 0;

-- 2. Inicializa `api_shipped_at` apenas nos pedidos cujo `shipped_at` veio da API (não manuais)
UPDATE public.ml_sales_orders
SET api_shipped_at = shipped_at
WHERE shipped_at IS NOT NULL
  AND shipped_at_manual = FALSE
  AND api_shipped_at IS NULL;

-- 3. Índices compostos B-Tree para visibilidade completa na aba "Por Dia do Envio"
CREATE INDEX IF NOT EXISTS idx_ml_sales_orders_org_shipped_at
    ON public.ml_sales_orders(organization_id, shipped_at DESC)
    WHERE organization_id IS NOT NULL AND shipped_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ml_sales_orders_user_shipped_at
    ON public.ml_sales_orders(user_id, shipped_at DESC)
    WHERE organization_id IS NULL AND shipped_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ml_sales_orders_org_unshipped_order_date
    ON public.ml_sales_orders(organization_id, order_date DESC)
    WHERE organization_id IS NOT NULL AND shipped_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_ml_sales_orders_user_unshipped_order_date
    ON public.ml_sales_orders(user_id, order_date DESC)
    WHERE organization_id IS NULL AND shipped_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_ml_sales_orders_org_unshipped_deadline
    ON public.ml_sales_orders(organization_id, shipping_deadline ASC)
    WHERE organization_id IS NOT NULL AND shipped_at IS NULL AND status = 'paid';

CREATE INDEX IF NOT EXISTS idx_ml_sales_orders_backfill_api_shipped_at
    ON public.ml_sales_orders(ml_seller_id, order_date DESC)
    WHERE shipped_at_manual = FALSE AND (shipped_at IS NULL OR api_shipped_at IS NULL);

-- Recarrega o cache de schema do PostgREST / Supabase API imediatamente
NOTIFY pgrst, 'reload schema';
