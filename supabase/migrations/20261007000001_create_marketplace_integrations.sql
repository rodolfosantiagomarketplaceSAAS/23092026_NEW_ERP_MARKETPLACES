-- ==============================================================================
-- SAAS DE GESTÃO DE MARKETPLACES E INTELIGÊNCIA COMPETITIVA
-- Migration: 20261007000001_create_marketplace_integrations.sql
-- Descrição: Tabela para conexões seguras de contas de Marketplaces (Mercado Livre e Shopee)
--            com suporte a OAuth 2.0, refresh tokens, RLS e auditoria (Padrão Tiny / Bling).
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.marketplace_integrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    platform platform_type NOT NULL, -- 'mercadolivre' ou 'shopee'
    account_name VARCHAR(128) NOT NULL, -- Nome fantasia / Nickname da loja
    seller_id VARCHAR(64) NOT NULL, -- ID numérico do vendedor no ML ou shop_id na Shopee
    access_token TEXT NOT NULL, -- Token de autenticação OAuth / API
    refresh_token TEXT, -- Token de renovação automática sem deslogar
    token_expires_at TIMESTAMPTZ, -- Data de expiração do access_token
    is_active BOOLEAN NOT NULL DEFAULT true,
    metadata JSONB DEFAULT '{}'::jsonb, -- Email, reputação, marketplace scopes, logo/avatar
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_marketplace_integrations_user_platform_seller UNIQUE (user_id, platform, seller_id)
);

-- Trigger para atualização automática de updated_at
CREATE OR REPLACE TRIGGER trg_marketplace_integrations_timestamp
    BEFORE UPDATE ON public.marketplace_integrations
    FOR EACH ROW
    EXECUTE FUNCTION trigger_set_timestamp();

-- Índices de busca rápida
CREATE INDEX IF NOT EXISTS idx_marketplace_integrations_user_active 
    ON public.marketplace_integrations(user_id, is_active);

CREATE INDEX IF NOT EXISTS idx_marketplace_integrations_platform 
    ON public.marketplace_integrations(platform, is_active);

-- Habilitar RLS (Row Level Security)
ALTER TABLE public.marketplace_integrations ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS: apenas o proprietário da conta acessa suas integrações
CREATE POLICY "Users can view own marketplace integrations"
    ON public.marketplace_integrations
    FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own marketplace integrations"
    ON public.marketplace_integrations
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own marketplace integrations"
    ON public.marketplace_integrations
    FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own marketplace integrations"
    ON public.marketplace_integrations
    FOR DELETE
    USING (auth.uid() = user_id);

COMMENT ON TABLE public.marketplace_integrations IS 'Armazena contas conectadas de Mercado Livre e Shopee com tokens de acesso OAuth';
