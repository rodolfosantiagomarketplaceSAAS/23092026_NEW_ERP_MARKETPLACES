-- ==============================================================================
-- SAAS DE GESTÃO DE MARKETPLACES E ERP (PADRÃO TINY & BLING)
-- Migration: 20261127180000_create_erp_ppf_roll_lots_and_cost_snapshots.sql
-- Módulo: Lotes de Compra de Bobinas PPF (PEPS / FIFO) + Snapshot Imutável de Custos nas Vendas
-- Descrição:
--   1. Tabela `erp_ppf_roll_lots` (Cada bobina comprada = 1 lote com fornecedor, data, valor pago,
--      custo/m, saldo em metros e status na fila PEPS: in_use, queued, exhausted, archived)
--   2. Tabela `erp_order_roll_consumptions` (Ledger imutável do consumo por pedido e lote,
--      suportando rateio PEPS exato quando uma venda vira de uma bobina antiga para a próxima)
--   3. Enriquecimento do Kardex (`erp_stock_movements`) com lote, fornecedor e custo histórico
--   4. Colunas de travamento/snapshot de custo em `ml_sales_orders` para que novas compras mais
--      caras NUNCA alterem métricas e custos de vendas antigas
--   5. Backfill automático de lotes iniciais para bobinas já cadastradas e proteção do histórico
--   6. Índices B-Tree, Triggers `updated_at` e Row Level Security (RLS) Multi-Tenant
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- 1. TABELA: erp_ppf_roll_lots (Lotes de Compra / Fila PEPS de Bobinas PPF)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.erp_ppf_roll_lots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,

    ppf_roll_id UUID NOT NULL REFERENCES public.erp_ppf_rolls(id) ON DELETE CASCADE,
    supplier_id UUID REFERENCES public.erp_suppliers(id) ON DELETE SET NULL,
    supplier_name TEXT, -- Snapshot do nome fantasia do fornecedor na data da compra

    lot_code TEXT NOT NULL CHECK (char_length(trim(lot_code)) >= 1),
    invoice_number TEXT, -- NF-e / Pedido de Compra
    purchase_date DATE NOT NULL DEFAULT CURRENT_DATE,

    -- Dimensões, Custo de Aquisição e Saldo deste Lote
    roll_width_cm NUMERIC(10, 2) NOT NULL DEFAULT 152.00 CHECK (roll_width_cm > 0),
    initial_meters NUMERIC(12, 3) NOT NULL CHECK (initial_meters > 0),
    remaining_meters NUMERIC(12, 3) NOT NULL CHECK (remaining_meters >= 0),

    total_purchase_cost NUMERIC(12, 2) NOT NULL CHECK (total_purchase_cost >= 0),
    cost_per_linear_meter NUMERIC(12, 4) NOT NULL CHECK (cost_per_linear_meter >= 0),
    cost_per_m2 NUMERIC(12, 4) NOT NULL DEFAULT 0.0000 CHECK (cost_per_m2 >= 0),

    -- Ciclo de Vida PEPS (FIFO)
    status TEXT NOT NULL DEFAULT 'queued'
        CHECK (status IN ('in_use', 'queued', 'exhausted', 'archived')),
    queue_order INTEGER NOT NULL DEFAULT 0,
    started_using_at TIMESTAMPTZ,
    exhausted_at TIMESTAMPTZ,
    notes TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_erp_ppf_roll_lots_roll_fifo
    ON public.erp_ppf_roll_lots(ppf_roll_id, status, queue_order ASC, purchase_date ASC, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_erp_ppf_roll_lots_org_roll
    ON public.erp_ppf_roll_lots(organization_id, ppf_roll_id)
    WHERE organization_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_erp_ppf_roll_lots_user_roll
    ON public.erp_ppf_roll_lots(user_id, ppf_roll_id)
    WHERE organization_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_erp_ppf_roll_lots_supplier
    ON public.erp_ppf_roll_lots(supplier_id)
    WHERE supplier_id IS NOT NULL;

-- Saneamento idempotente: garante no máximo 1 lote 'in_use' por bobina antes de criar o índice único parcial
WITH ranked_in_use AS (
    SELECT
        id,
        ROW_NUMBER() OVER (
            PARTITION BY ppf_roll_id
            ORDER BY queue_order ASC, purchase_date ASC, created_at ASC
        ) AS rn
    FROM public.erp_ppf_roll_lots
    WHERE status = 'in_use'
)
UPDATE public.erp_ppf_roll_lots l
SET status = 'queued'
FROM ranked_in_use r
WHERE l.id = r.id
  AND r.rn > 1;

-- Garantia ACID no PostgreSQL: impede fisicamente 2 lotes 'in_use' simultâneos na mesma bobina
CREATE UNIQUE INDEX IF NOT EXISTS uq_erp_ppf_roll_lots_single_in_use
    ON public.erp_ppf_roll_lots(ppf_roll_id)
    WHERE status = 'in_use';

DROP TRIGGER IF EXISTS trg_erp_ppf_roll_lots_updated_at ON public.erp_ppf_roll_lots;
CREATE TRIGGER trg_erp_ppf_roll_lots_updated_at
    BEFORE UPDATE ON public.erp_ppf_roll_lots
    FOR EACH ROW
    EXECUTE FUNCTION public.trigger_set_timestamp();

-- ==============================================================================
-- 2. TABELA: erp_order_roll_consumptions (Ledger Imutável de Consumo PEPS por Venda)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.erp_order_roll_consumptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,

    ml_order_id BIGINT NOT NULL,
    order_date TIMESTAMPTZ NOT NULL,
    mlb_id TEXT NOT NULL,
    product_id UUID REFERENCES public.erp_products(id) ON DELETE SET NULL,
    ppf_roll_id UUID REFERENCES public.erp_ppf_rolls(id) ON DELETE SET NULL,
    ppf_roll_lot_id UUID REFERENCES public.erp_ppf_roll_lots(id) ON DELETE SET NULL,
    supplier_id UUID REFERENCES public.erp_suppliers(id) ON DELETE SET NULL,

    -- Snapshots imutáveis da época da venda (preservados mesmo se cadastros forem editados)
    supplier_name_snapshot TEXT,
    lot_code_snapshot TEXT,
    roll_code_snapshot TEXT,
    roll_name_snapshot TEXT,

    meters_consumed NUMERIC(12, 6) NOT NULL CHECK (meters_consumed > 0),
    area_m2_consumed NUMERIC(12, 6) NOT NULL DEFAULT 0.000000 CHECK (area_m2_consumed >= 0),
    unit_cost_per_meter_snapshot NUMERIC(12, 4) NOT NULL CHECK (unit_cost_per_meter_snapshot >= 0),
    total_cost_snapshot NUMERIC(12, 2) NOT NULL CHECK (total_cost_snapshot >= 0),

    source_stage TEXT NOT NULL DEFAULT 'deduction'
        CHECK (source_stage IN ('sync_estimate', 'deduction')),

    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_erp_order_roll_consumptions_order
    ON public.erp_order_roll_consumptions(ml_order_id);

CREATE INDEX IF NOT EXISTS idx_erp_order_roll_consumptions_org_date
    ON public.erp_order_roll_consumptions(organization_id, order_date DESC)
    WHERE organization_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_erp_order_roll_consumptions_user_date
    ON public.erp_order_roll_consumptions(user_id, order_date DESC)
    WHERE organization_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_erp_order_roll_consumptions_lot
    ON public.erp_order_roll_consumptions(ppf_roll_lot_id)
    WHERE ppf_roll_lot_id IS NOT NULL;

-- Proteção idempotente contra duplo clique / race condition na baixa de estoque por pedido/bobina/lote
CREATE UNIQUE INDEX IF NOT EXISTS uq_erp_order_roll_consumptions_idempotent
    ON public.erp_order_roll_consumptions(
        COALESCE(organization_id, '00000000-0000-0000-0000-000000000000'::uuid),
        COALESCE(user_id, '00000000-0000-0000-0000-000000000000'::uuid),
        ml_order_id,
        COALESCE(ppf_roll_id, '00000000-0000-0000-0000-000000000000'::uuid),
        COALESCE(ppf_roll_lot_id, '00000000-0000-0000-0000-000000000000'::uuid),
        source_stage
    );

-- ==============================================================================
-- 3. ENRIQUECIMENTO DO KARDEX (erp_stock_movements) COM LOTE E CUSTO HISTÓRICO
-- ==============================================================================
ALTER TABLE public.erp_stock_movements
    ADD COLUMN IF NOT EXISTS ppf_roll_lot_id UUID REFERENCES public.erp_ppf_roll_lots(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES public.erp_suppliers(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS unit_cost NUMERIC(12, 4),
    ADD COLUMN IF NOT EXISTS total_cost NUMERIC(12, 2);

CREATE INDEX IF NOT EXISTS idx_erp_stock_movements_roll_lot
    ON public.erp_stock_movements(ppf_roll_lot_id, created_at DESC)
    WHERE ppf_roll_lot_id IS NOT NULL;

-- ==============================================================================
-- 4. CONGELAMENTO IMUTÁVEL DE CUSTO HISTÓRICO EM ml_sales_orders
-- ==============================================================================
ALTER TABLE public.ml_sales_orders
    ADD COLUMN IF NOT EXISTS cost_snapshot_locked BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS cost_snapshot_locked_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS cost_snapshot_source TEXT,
    ADD COLUMN IF NOT EXISTS cost_lot_summary JSONB;

CREATE INDEX IF NOT EXISTS idx_ml_sales_orders_cost_locked
    ON public.ml_sales_orders(organization_id, cost_snapshot_locked)
    WHERE organization_id IS NOT NULL;

-- ==============================================================================
-- 5. BACKFILL SEGURO:
--    (a) Cria Lote Inicial para bobinas já existentes sem lote
--    (b) Trava o snapshot de vendas antigas que já possuem custo apurado
-- ==============================================================================
INSERT INTO public.erp_ppf_roll_lots (
    organization_id,
    user_id,
    ppf_roll_id,
    supplier_id,
    supplier_name,
    lot_code,
    purchase_date,
    roll_width_cm,
    initial_meters,
    remaining_meters,
    total_purchase_cost,
    cost_per_linear_meter,
    cost_per_m2,
    status,
    queue_order,
    started_using_at,
    exhausted_at,
    notes
)
SELECT
    r.organization_id,
    r.user_id,
    r.id,
    r.supplier_id,
    COALESCE(s.trade_name, r.supplier),
    COALESCE(NULLIF(trim(r.lot_number), ''), 'LOTE-INICIAL'),
    COALESCE(r.created_at::date, CURRENT_DATE),
    GREATEST(r.roll_width_cm, 1.00),
    GREATEST(r.total_meters_purchased, r.roll_length_m, 0.001),
    GREATEST(r.remaining_meters, 0.000),
    ROUND(r.cost_per_linear_meter * GREATEST(r.total_meters_purchased, r.roll_length_m, 0.001), 2),
    r.cost_per_linear_meter,
    ROUND(r.cost_per_linear_meter / GREATEST(r.roll_width_cm / 100.0, 0.01), 4),
    CASE WHEN r.remaining_meters > 0 THEN 'in_use' ELSE 'exhausted' END,
    1,
    r.created_at,
    CASE WHEN r.remaining_meters <= 0 THEN r.updated_at ELSE NULL END,
    'Lote inicial migrado automaticamente do cadastro da bobina'
FROM public.erp_ppf_rolls r
LEFT JOIN public.erp_suppliers s ON s.id = r.supplier_id
WHERE NOT EXISTS (
    SELECT 1 FROM public.erp_ppf_roll_lots l WHERE l.ppf_roll_id = r.id
);

-- Protege imediatamente vendas antigas que já possuem custo gravado contra recálculos futuros
UPDATE public.ml_sales_orders
SET
    cost_snapshot_locked = true,
    cost_snapshot_locked_at = COALESCE(updated_at, created_at, timezone('utc'::text, now())),
    cost_snapshot_source = CASE
        WHEN costs_manually_edited THEN 'manual'
        ELSE 'legacy_snapshot'
    END
WHERE cost_snapshot_locked = false
  AND (
      costs_manually_edited = true
      OR cost_material > 0
      OR cost_packaging > 0
      OR cost_accessories_kit > 0
  );

-- ==============================================================================
-- 6. ROW LEVEL SECURITY (RLS) MULTI-TENANT
-- ==============================================================================
ALTER TABLE public.erp_ppf_roll_lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_order_roll_consumptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "erp_ppf_roll_lots_tenant_all" ON public.erp_ppf_roll_lots;
CREATE POLICY "erp_ppf_roll_lots_tenant_all" ON public.erp_ppf_roll_lots
    FOR ALL TO authenticated
    USING (
        (organization_id IS NOT NULL AND organization_id IN (
            SELECT organization_id FROM public.user_profiles WHERE id = auth.uid()
        ))
        OR (organization_id IS NULL AND user_id = auth.uid())
    )
    WITH CHECK (
        (organization_id IS NOT NULL AND organization_id IN (
            SELECT organization_id FROM public.user_profiles WHERE id = auth.uid()
        ))
        OR (organization_id IS NULL AND user_id = auth.uid())
    );

DROP POLICY IF EXISTS "erp_order_roll_consumptions_tenant_all" ON public.erp_order_roll_consumptions;
CREATE POLICY "erp_order_roll_consumptions_tenant_all" ON public.erp_order_roll_consumptions
    FOR ALL TO authenticated
    USING (
        (organization_id IS NOT NULL AND organization_id IN (
            SELECT organization_id FROM public.user_profiles WHERE id = auth.uid()
        ))
        OR (organization_id IS NULL AND user_id = auth.uid())
    )
    WITH CHECK (
        (organization_id IS NOT NULL AND organization_id IN (
            SELECT organization_id FROM public.user_profiles WHERE id = auth.uid()
        ))
        OR (organization_id IS NULL AND user_id = auth.uid())
    );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.erp_ppf_roll_lots TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.erp_order_roll_consumptions TO authenticated;

COMMENT ON TABLE public.erp_ppf_roll_lots IS 'Lotes de compra de bobinas PPF com controle PEPS (FIFO), fornecedor, valor pago e saldo independente por bobina física';
COMMENT ON TABLE public.erp_order_roll_consumptions IS 'Ledger imutável do consumo de bobinas PPF por venda/lote com custo histórico congelado (suporta rateio PEPS entre lotes)';
COMMENT ON COLUMN public.ml_sales_orders.cost_snapshot_locked IS 'Quando true, congela permanentemente os custos da venda na época em que ocorreu (imune a novas compras mais caras)';
