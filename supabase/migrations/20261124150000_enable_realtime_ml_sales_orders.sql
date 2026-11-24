-- ==============================================================================
-- SAAS DE GESTÃO DE MARKETPLACES E ERP (PADRÃO TINY & BLING)
-- Migration: 20261124150000_enable_realtime_ml_sales_orders.sql
-- Módulo: Sincronização Automática em Tempo Real de Vendas ML (Free Tier Safe)
-- Descrição:
--   1. Ativa REPLICA IDENTITY FULL em `public.ml_sales_orders` para envio completo de linha no Realtime.
--   2. Adiciona `public.ml_sales_orders` e `public.my_listings` de forma idempotente à publicação `supabase_realtime`.
--   Rollback: ALTER PUBLICATION supabase_realtime DROP TABLE public.ml_sales_orders;
-- ==============================================================================

DO $$
BEGIN
    -- 1. Configura REPLICA IDENTITY FULL na tabela de vendas ML (se existir)
    IF to_regclass('public.ml_sales_orders') IS NOT NULL THEN
        ALTER TABLE public.ml_sales_orders REPLICA IDENTITY FULL;

        IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
           AND NOT EXISTS (
               SELECT 1
               FROM pg_publication_tables
               WHERE pubname = 'supabase_realtime'
                 AND schemaname = 'public'
                 AND tablename = 'ml_sales_orders'
           )
        THEN
            ALTER PUBLICATION supabase_realtime ADD TABLE public.ml_sales_orders;
        END IF;
    END IF;

    -- 2. Garante publicação Realtime também em `my_listings` para refletir baixa de estoque
    IF to_regclass('public.my_listings') IS NOT NULL THEN
        ALTER TABLE public.my_listings REPLICA IDENTITY FULL;

        IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
           AND NOT EXISTS (
               SELECT 1
               FROM pg_publication_tables
               WHERE pubname = 'supabase_realtime'
                 AND schemaname = 'public'
                 AND tablename = 'my_listings'
           )
        THEN
            ALTER PUBLICATION supabase_realtime ADD TABLE public.my_listings;
        END IF;
    END IF;
END $$;
