-- ==============================================================================
-- SAAS DE GESTÃO DE MARKETPLACES E INTELIGÊNCIA COMPETITIVA (MERCADO LIVRE & SHOPEE)
-- Migration: 20261021000000_competitive_intelligence_repricing.sql
-- Descrição: Evolução do motor de Inteligência Competitiva: Custos operacionais,
--            Regras de Repricing Dinâmico, Histórico de Séries Temporais e RLS.
-- ==============================================================================

-- 1. Evolução da Tabela: products (Custos e Margem Alvo)
ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS packaging_cost NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS tax_rate_pct NUMERIC(5, 2) NOT NULL DEFAULT 6.00,
ADD COLUMN IF NOT EXISTS target_margin_pct NUMERIC(5, 2) NOT NULL DEFAULT 15.00;

-- 2. Evolução da Tabela: my_listings (Taxas de Marketplace e Frete Médio)
ALTER TABLE public.my_listings
ADD COLUMN IF NOT EXISTS marketplace_commission_pct NUMERIC(5, 2) NOT NULL DEFAULT 12.00,
ADD COLUMN IF NOT EXISTS fixed_fee NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS average_shipping_cost NUMERIC(12, 2) NOT NULL DEFAULT 0.00;

-- 3. Nova Tabela: repricing_rules (Regras de Repricing Dinâmico por Anúncio)
CREATE TABLE IF NOT EXISTS public.repricing_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    my_listing_id UUID NOT NULL REFERENCES public.my_listings(id) ON DELETE CASCADE,
    strategy VARCHAR(32) NOT NULL DEFAULT 'undercut', -- 'undercut' | 'match' | 'target_margin'
    difference_value NUMERIC(12, 2) NOT NULL DEFAULT 0.10,
    max_price NUMERIC(12, 2),
    min_price NUMERIC(12, 2),
    respect_min_margin BOOLEAN NOT NULL DEFAULT true,
    on_unviable VARCHAR(32) NOT NULL DEFAULT 'alert_only', -- 'alert_only' | 'set_floor'
    is_auto_apply BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_repricing_rules_my_listing UNIQUE (my_listing_id)
);

-- 4. Índices para Otimização de Performance
CREATE INDEX IF NOT EXISTS idx_repricing_rules_user ON public.repricing_rules(user_id);
CREATE INDEX IF NOT EXISTS idx_repricing_rules_listing ON public.repricing_rules(my_listing_id);
CREATE INDEX IF NOT EXISTS idx_price_history_recorded_at ON public.price_history(competitor_listing_id, recorded_at DESC);

-- 5. Trigger de Atualização Automática de updated_at em repricing_rules
DROP TRIGGER IF EXISTS trg_repricing_rules_updated_at ON public.repricing_rules;
CREATE OR REPLACE TRIGGER trg_repricing_rules_updated_at
BEFORE UPDATE ON public.repricing_rules
FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

-- 6. Habilitação de RLS (Row Level Security)
ALTER TABLE public.repricing_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuários podem gerenciar suas próprias regras de repricing"
ON public.repricing_rules
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- 7. Comentários para documentação do schema
COMMENT ON TABLE public.repricing_rules IS 'Regras automatizadas de precificação dinâmica para anúncios próprios';
COMMENT ON COLUMN public.products.tax_rate_pct IS 'Alíquota de imposto (ex: Simples Nacional) estimada para cálculo de margem líquida';
COMMENT ON COLUMN public.my_listings.marketplace_commission_pct IS 'Comissão cobrada pelo canal (ex: 12% clássico, 17% premium)';
