-- ==============================================================================
-- SAAS DE GESTÃO DE MARKETPLACES E ERP (PADRÃO TINY & BLING)
-- Migration: 20261124180000_add_shipped_at_to_ml_sales_orders.sql
-- Módulo: Análise de Vendas por Data da Venda vs. Dia do Envio (Mercado Livre)
-- Descrição:
--   1. Adiciona `shipped_at` (data/hora real da postagem/coleta na API /shipments/{id})
--   2. Adiciona `delivered_at` (data/hora real da entrega) e `logistic_type` (Full, Agência, Coleta, Flex, Correios)
--   3. Cria índices compostos parciais B-Tree para filtragem instantânea por Dia do Envio e backfill de pendentes
-- ==============================================================================

ALTER TABLE public.ml_sales_orders
    ADD COLUMN IF NOT EXISTS shipped_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS logistic_type TEXT;

-- Índices B-Tree para consultas de Análise pelo Dia do Envio (Multi-Tenant)
CREATE INDEX IF NOT EXISTS idx_ml_sales_orders_org_shipped_at
    ON public.ml_sales_orders(organization_id, shipped_at DESC)
    WHERE organization_id IS NOT NULL AND shipped_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ml_sales_orders_user_shipped_at
    ON public.ml_sales_orders(user_id, shipped_at DESC)
    WHERE organization_id IS NULL AND shipped_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ml_sales_orders_org_seller_shipped_at
    ON public.ml_sales_orders(organization_id, assigned_seller_id, shipped_at DESC)
    WHERE shipped_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ml_sales_orders_org_logistic_type
    ON public.ml_sales_orders(organization_id, logistic_type);

-- Índice parcial para re-sincronização rápida de pedidos aguardando despacho ou backfill de shipped_at
CREATE INDEX IF NOT EXISTS idx_ml_sales_orders_pending_shipment_sync
    ON public.ml_sales_orders(ml_seller_id, order_date DESC)
    WHERE shipped_at IS NULL AND status IN ('paid', 'shipped', 'delivered');

COMMENT ON COLUMN public.ml_sales_orders.shipped_at IS
    'Timestamp real de postagem/coleta extraído da API oficial do Mercado Livre (status_history.date_shipped / tracking timeline)';
COMMENT ON COLUMN public.ml_sales_orders.delivered_at IS
    'Timestamp real de entrega ao comprador extraído da API oficial do Mercado Livre (status_history.date_delivered)';
COMMENT ON COLUMN public.ml_sales_orders.logistic_type IS
    'Modalidade logística oficial do envio no Mercado Livre (fulfillment, xd_drop_off, cross_docking, self_service, drop_off, custom)';

-- Recarrega o cache de schema do PostgREST / Supabase API imediatamente
NOTIFY pgrst, 'reload schema';
