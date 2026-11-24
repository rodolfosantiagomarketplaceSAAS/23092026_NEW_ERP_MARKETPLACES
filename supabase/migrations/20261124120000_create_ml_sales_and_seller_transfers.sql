-- ==============================================================================
-- SAAS DE GESTÃO DE MARKETPLACES E ERP (PADRÃO TINY & BLING)
-- Migration: 20261124120000_create_ml_sales_and_seller_transfers.sql
-- Módulo: Gestão de Vendas & Repasse por Vendedor (Mercado Livre Read-Only)
-- Descrição:
--   1. Tabela `sellers` (Vendedores / Sócios / Parceiros de Repasse)
--   2. Tabela `product_cost_templates` (Custos Padrão e Vendedor Padrão por MLB/SKU)
--   3. Tabela `ml_sales_orders` (Pedidos ML, Taxas, Frete, Estornos Promo e Repasse)
--   4. Trigger automático de apuração financeira (`seller_transfer_profit` e `net_operational_profit`)
--   5. Índices otimizados e Row Level Security (RLS) Multi-Tenant (`organization_id` / `user_id`)
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Garante existência da função auxiliar de timestamp
CREATE OR REPLACE FUNCTION public.trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ==============================================================================
-- 1. TABELA: sellers (Vendedores / Parceiros de Repasse)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.sellers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    name TEXT NOT NULL CHECK (char_length(trim(name)) >= 1),
    color_hex TEXT NOT NULL DEFAULT '#0284C7',
    commission_pct NUMERIC(6, 2) NOT NULL DEFAULT 100.00
        CHECK (commission_pct >= 0 AND commission_pct <= 100),
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_sellers_org_active
    ON public.sellers(organization_id, active)
    WHERE organization_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sellers_user_active
    ON public.sellers(user_id, active)
    WHERE organization_id IS NULL;

DROP TRIGGER IF EXISTS trg_sellers_updated_at ON public.sellers;
CREATE TRIGGER trg_sellers_updated_at
    BEFORE UPDATE ON public.sellers
    FOR EACH ROW
    EXECUTE FUNCTION public.trigger_set_timestamp();

-- ==============================================================================
-- 2. TABELA: product_cost_templates (Custos Padrão e Regra Automática por MLB)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.product_cost_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    mlb_id TEXT NOT NULL CHECK (char_length(trim(mlb_id)) >= 3),
    sku TEXT,
    material_cost NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (material_cost >= 0),
    packaging_cost NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (packaging_cost >= 0),
    logistics_cost NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (logistics_cost >= 0),
    printing_cost NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (printing_cost >= 0),
    accessories_kit_cost NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (accessories_kit_cost >= 0),
    default_tax_pct NUMERIC(6, 2) NOT NULL DEFAULT 4.00 CHECK (default_tax_pct >= 0 AND default_tax_pct <= 100),
    default_seller_id UUID REFERENCES public.sellers(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_product_cost_templates_org_mlb
    ON public.product_cost_templates(organization_id, mlb_id)
    WHERE organization_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_product_cost_templates_user_mlb
    ON public.product_cost_templates(user_id, mlb_id)
    WHERE organization_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_product_cost_templates_mlb
    ON public.product_cost_templates(mlb_id);

DROP TRIGGER IF EXISTS trg_product_cost_templates_updated_at ON public.product_cost_templates;
CREATE TRIGGER trg_product_cost_templates_updated_at
    BEFORE UPDATE ON public.product_cost_templates
    FOR EACH ROW
    EXECUTE FUNCTION public.trigger_set_timestamp();

-- ==============================================================================
-- 3. TABELA: ml_sales_orders (Pedidos do Mercado Livre & Apuração de Repasse)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.ml_sales_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,

    -- Identificação e Datas
    ml_order_id BIGINT NOT NULL UNIQUE,
    ml_pack_id BIGINT,
    ml_shipment_id BIGINT,
    ml_seller_id TEXT,
    store_name TEXT NOT NULL DEFAULT 'Mercado Livre',
    order_date TIMESTAMPTZ NOT NULL,
    shipping_deadline TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'paid'
        CHECK (status IN ('paid', 'shipped', 'delivered', 'cancelled', 'returned')),
    cancellation_reason TEXT,

    -- Produto e Comprador
    mlb_id TEXT NOT NULL,
    sku TEXT,
    product_title TEXT NOT NULL,
    product_thumbnail TEXT,
    permalink TEXT,
    quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity >= 1),
    buyer_name TEXT NOT NULL DEFAULT 'Comprador Mercado Livre',
    buyer_document TEXT,
    is_business_buyer BOOLEAN NOT NULL DEFAULT false,

    -- Atribuição Gerencial & Conferência
    assigned_seller_id UUID REFERENCES public.sellers(id) ON DELETE SET NULL,
    verified_at TIMESTAMPTZ,
    costs_manually_edited BOOLEAN NOT NULL DEFAULT false,

    -- Componentes Financeiros Extraídos da API do ML (Read-Only)
    gross_sale_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    ml_commission_pct NUMERIC(6, 2) NOT NULL DEFAULT 0.00,
    ml_commission_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    ml_shipping_cost NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    ml_promo_rebate NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    mp_net_released NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    mp_release_date TIMESTAMPTZ,
    mp_release_status TEXT DEFAULT 'pending',

    -- Custos Operacionais Internos (Editáveis por pedido)
    tax_pct NUMERIC(6, 2) NOT NULL DEFAULT 0.00 CHECK (tax_pct >= 0 AND tax_pct <= 100),
    tax_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (tax_amount >= 0),
    cost_material NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (cost_material >= 0),
    cost_packaging NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (cost_packaging >= 0),
    cost_logistics NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (cost_logistics >= 0),
    cost_printing NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (cost_printing >= 0),
    cost_accessories_kit NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (cost_accessories_kit >= 0),

    -- Colunas Calculadas Automaticamente via Trigger BEFORE INSERT OR UPDATE
    seller_transfer_profit NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    net_operational_profit NUMERIC(12, 2) NOT NULL DEFAULT 0.00,

    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Índices B-Tree para filtros diários, fechamento, busca por anúncio e conciliação de pacotes
CREATE INDEX IF NOT EXISTS idx_ml_sales_orders_org_date
    ON public.ml_sales_orders(organization_id, order_date DESC);

CREATE INDEX IF NOT EXISTS idx_ml_sales_orders_user_date
    ON public.ml_sales_orders(user_id, order_date DESC)
    WHERE organization_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_ml_sales_orders_org_seller_date
    ON public.ml_sales_orders(organization_id, assigned_seller_id, order_date DESC);

CREATE INDEX IF NOT EXISTS idx_ml_sales_orders_org_status_date
    ON public.ml_sales_orders(organization_id, status, order_date DESC);

CREATE INDEX IF NOT EXISTS idx_ml_sales_orders_mlb
    ON public.ml_sales_orders(organization_id, mlb_id);

CREATE INDEX IF NOT EXISTS idx_ml_sales_orders_pack
    ON public.ml_sales_orders(ml_pack_id)
    WHERE ml_pack_id IS NOT NULL;

-- ==============================================================================
-- 4. TRIGGER DE CÁLCULO FINANCEIRO AUTOMÁTICO (BASE DE REPASSE & LUCRO LIMPO)
-- Regras de Negócio:
--   * Se status IN ('cancelled', 'returned'):
--       tax_amount = 0, seller_transfer_profit = 0, net_operational_profit = 0
--   * Caso contrário:
--       tax_amount = ROUND(gross_sale_amount * (tax_pct / 100), 2)
--       seller_transfer_profit = gross_sale_amount - ml_commission_amount - ml_shipping_cost + ml_promo_rebate
--       net_operational_profit = seller_transfer_profit - tax_amount - soma_custos_operacionais
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.fn_calculate_ml_sales_order_profits()
RETURNS TRIGGER AS $$
DECLARE
    v_gross NUMERIC(12, 2);
    v_comm NUMERIC(12, 2);
    v_ship NUMERIC(12, 2);
    v_rebate NUMERIC(12, 2);
    v_tax_pct NUMERIC(6, 2);
    v_operational_costs NUMERIC(12, 2);
BEGIN
    NEW.updated_at := timezone('utc'::text, now());

    IF NEW.mlb_id IS NOT NULL THEN
        NEW.mlb_id := upper(trim(NEW.mlb_id));
    END IF;

    IF NEW.status IN ('cancelled', 'returned') THEN
        NEW.tax_amount := 0.00;
        NEW.seller_transfer_profit := 0.00;
        NEW.net_operational_profit := 0.00;
        RETURN NEW;
    END IF;

    v_gross := COALESCE(NEW.gross_sale_amount, 0.00);
    v_comm := COALESCE(NEW.ml_commission_amount, 0.00);
    v_ship := COALESCE(NEW.ml_shipping_cost, 0.00);
    v_rebate := COALESCE(NEW.ml_promo_rebate, 0.00);
    v_tax_pct := COALESCE(NEW.tax_pct, 0.00);

    -- Atualiza imposto automaticamente a partir da alíquota % sobre o faturamento bruto da venda
    NEW.tax_amount := ROUND(v_gross * (v_tax_pct / 100.0), 2);

    -- Base Limpa de Repasse ao Vendedor (desconta comissão ML e frete vendedor, soma estorno/subsídio ML)
    NEW.seller_transfer_profit := ROUND(v_gross - v_comm - v_ship + v_rebate, 2);

    -- Soma dos custos operacionais internos unitários/totais do pedido
    v_operational_costs :=
        COALESCE(NEW.cost_material, 0.00) +
        COALESCE(NEW.cost_packaging, 0.00) +
        COALESCE(NEW.cost_logistics, 0.00) +
        COALESCE(NEW.cost_printing, 0.00) +
        COALESCE(NEW.cost_accessories_kit, 0.00);

    -- Lucro Líquido Real ("Limpo")
    NEW.net_operational_profit := ROUND(
        NEW.seller_transfer_profit - NEW.tax_amount - v_operational_costs,
        2
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ml_sales_orders_calculate_profits ON public.ml_sales_orders;
CREATE TRIGGER trg_ml_sales_orders_calculate_profits
    BEFORE INSERT OR UPDATE ON public.ml_sales_orders
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_calculate_ml_sales_order_profits();

-- ==============================================================================
-- 5. ROW LEVEL SECURITY (RLS) MULTI-TENANT (ISOLAMENTO POR ORGANIZAÇÃO / USUÁRIO)
-- ==============================================================================
ALTER TABLE public.sellers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_cost_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ml_sales_orders ENABLE ROW LEVEL SECURITY;

-- Políticas: sellers
DROP POLICY IF EXISTS "Tenant members can select sellers" ON public.sellers;
CREATE POLICY "Tenant members can select sellers"
    ON public.sellers FOR SELECT
    USING (
        organization_id = public.get_current_user_org_id()
        OR (organization_id IS NULL AND user_id = auth.uid())
    );

DROP POLICY IF EXISTS "Tenant members can insert sellers" ON public.sellers;
CREATE POLICY "Tenant members can insert sellers"
    ON public.sellers FOR INSERT
    WITH CHECK (
        organization_id = public.get_current_user_org_id()
        OR (organization_id IS NULL AND user_id = auth.uid())
    );

DROP POLICY IF EXISTS "Tenant members can update sellers" ON public.sellers;
CREATE POLICY "Tenant members can update sellers"
    ON public.sellers FOR UPDATE
    USING (
        organization_id = public.get_current_user_org_id()
        OR (organization_id IS NULL AND user_id = auth.uid())
    );

DROP POLICY IF EXISTS "Tenant members can delete sellers" ON public.sellers;
CREATE POLICY "Tenant members can delete sellers"
    ON public.sellers FOR DELETE
    USING (
        organization_id = public.get_current_user_org_id()
        OR (organization_id IS NULL AND user_id = auth.uid())
    );

-- Políticas: product_cost_templates
DROP POLICY IF EXISTS "Tenant members can select product_cost_templates" ON public.product_cost_templates;
CREATE POLICY "Tenant members can select product_cost_templates"
    ON public.product_cost_templates FOR SELECT
    USING (
        organization_id = public.get_current_user_org_id()
        OR (organization_id IS NULL AND user_id = auth.uid())
    );

DROP POLICY IF EXISTS "Tenant members can insert product_cost_templates" ON public.product_cost_templates;
CREATE POLICY "Tenant members can insert product_cost_templates"
    ON public.product_cost_templates FOR INSERT
    WITH CHECK (
        organization_id = public.get_current_user_org_id()
        OR (organization_id IS NULL AND user_id = auth.uid())
    );

DROP POLICY IF EXISTS "Tenant members can update product_cost_templates" ON public.product_cost_templates;
CREATE POLICY "Tenant members can update product_cost_templates"
    ON public.product_cost_templates FOR UPDATE
    USING (
        organization_id = public.get_current_user_org_id()
        OR (organization_id IS NULL AND user_id = auth.uid())
    );

DROP POLICY IF EXISTS "Tenant members can delete product_cost_templates" ON public.product_cost_templates;
CREATE POLICY "Tenant members can delete product_cost_templates"
    ON public.product_cost_templates FOR DELETE
    USING (
        organization_id = public.get_current_user_org_id()
        OR (organization_id IS NULL AND user_id = auth.uid())
    );

-- Políticas: ml_sales_orders
DROP POLICY IF EXISTS "Tenant members can select ml_sales_orders" ON public.ml_sales_orders;
CREATE POLICY "Tenant members can select ml_sales_orders"
    ON public.ml_sales_orders FOR SELECT
    USING (
        organization_id = public.get_current_user_org_id()
        OR (organization_id IS NULL AND user_id = auth.uid())
    );

DROP POLICY IF EXISTS "Tenant members can insert ml_sales_orders" ON public.ml_sales_orders;
CREATE POLICY "Tenant members can insert ml_sales_orders"
    ON public.ml_sales_orders FOR INSERT
    WITH CHECK (
        organization_id = public.get_current_user_org_id()
        OR (organization_id IS NULL AND user_id = auth.uid())
    );

DROP POLICY IF EXISTS "Tenant members can update ml_sales_orders" ON public.ml_sales_orders;
CREATE POLICY "Tenant members can update ml_sales_orders"
    ON public.ml_sales_orders FOR UPDATE
    USING (
        organization_id = public.get_current_user_org_id()
        OR (organization_id IS NULL AND user_id = auth.uid())
    );

DROP POLICY IF EXISTS "Tenant members can delete ml_sales_orders" ON public.ml_sales_orders;
CREATE POLICY "Tenant members can delete ml_sales_orders"
    ON public.ml_sales_orders FOR DELETE
    USING (
        organization_id = public.get_current_user_org_id()
        OR (organization_id IS NULL AND user_id = auth.uid())
    );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sellers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_cost_templates TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ml_sales_orders TO authenticated;

COMMENT ON TABLE public.sellers IS 'Vendedores ou sócios internos que operam anúncios e recebem repasse líquido das vendas ML';
COMMENT ON TABLE public.product_cost_templates IS 'Custos operacionais padrão e vendedor default configurados por anúncio MLB';
COMMENT ON TABLE public.ml_sales_orders IS 'Pedidos sincronizados em modo Read-Only da API do Mercado Livre com conciliação de repasse e lucro limpo';
COMMENT ON COLUMN public.ml_sales_orders.seller_transfer_profit IS 'Base limpa de repasse: gross_sale_amount - ml_commission_amount - ml_shipping_cost + ml_promo_rebate (0 quando cancelada/devolvida)';
COMMENT ON COLUMN public.ml_sales_orders.net_operational_profit IS 'Lucro líquido final limpo após imposto e custos operacionais unitários (0 quando cancelada/devolvida)';

