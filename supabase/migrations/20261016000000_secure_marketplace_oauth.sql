-- ==============================================================================
-- Migration: 20261016000000_secure_marketplace_oauth.sql
-- Secure OAuth 2.0 storage for marketplace accounts (Bling / Tiny pattern):
--   * Accounts belong to the ORGANIZATION (tenant), not to a single user
--   * Multiple Mercado Livre accounts per organization
--   * Tokens are stored encrypted (AES-256-GCM, app-level) and never exposed to clients
--   * Refresh lock column to avoid concurrent refresh of single-use refresh tokens
-- ==============================================================================

ALTER TABLE public.marketplace_integrations
    ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS status VARCHAR(24) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'reauth_required')),
    ADD COLUMN IF NOT EXISTS scopes TEXT,
    ADD COLUMN IF NOT EXISTS last_refreshed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS refresh_lock_until TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS last_error TEXT;

-- Backfill organization from the profile of the user that connected the account
UPDATE public.marketplace_integrations mi
SET organization_id = up.organization_id
FROM public.user_profiles up
WHERE mi.user_id = up.id AND mi.organization_id IS NULL;

-- Legacy rows were stored in plain text: force re-authorization
UPDATE public.marketplace_integrations
SET status = 'reauth_required', is_active = false
WHERE access_token NOT LIKE 'v1.%';

-- Ownership scope: organization when available, otherwise the user (accounts without a company profile)
ALTER TABLE public.marketplace_integrations
    DROP CONSTRAINT IF EXISTS uq_marketplace_integrations_user_platform_seller;

CREATE UNIQUE INDEX IF NOT EXISTS uq_marketplace_integrations_org_platform_seller
    ON public.marketplace_integrations(organization_id, platform, seller_id)
    WHERE organization_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_marketplace_integrations_user_platform_seller
    ON public.marketplace_integrations(user_id, platform, seller_id)
    WHERE organization_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_marketplace_integrations_org_active
    ON public.marketplace_integrations(organization_id, platform, is_active);

CREATE INDEX IF NOT EXISTS idx_marketplace_integrations_expiry
    ON public.marketplace_integrations(platform, token_expires_at)
    WHERE is_active = true;

-- ------------------------------------------------------------------------------
-- RLS: clients may only READ non-sensitive columns of their own organization.
-- All writes and token reads happen server-side with the service role.
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view own marketplace integrations" ON public.marketplace_integrations;
DROP POLICY IF EXISTS "Users can insert own marketplace integrations" ON public.marketplace_integrations;
DROP POLICY IF EXISTS "Users can update own marketplace integrations" ON public.marketplace_integrations;
DROP POLICY IF EXISTS "Users can delete own marketplace integrations" ON public.marketplace_integrations;
DROP POLICY IF EXISTS "Org members can view marketplace integrations" ON public.marketplace_integrations;

CREATE POLICY "Org members can view marketplace integrations"
    ON public.marketplace_integrations
    FOR SELECT
    USING (
        organization_id = public.get_current_user_org_id()
        OR (organization_id IS NULL AND user_id = auth.uid())
    );

REVOKE ALL ON public.marketplace_integrations FROM anon, authenticated;
GRANT SELECT (
    id, organization_id, user_id, platform, account_name, seller_id, token_expires_at,
    is_active, status, scopes, metadata, last_refreshed_at, created_at, updated_at
) ON public.marketplace_integrations TO authenticated;

COMMENT ON COLUMN public.marketplace_integrations.access_token IS 'AES-256-GCM ciphertext (v1.iv.tag.data). Never store plain tokens.';
COMMENT ON COLUMN public.marketplace_integrations.refresh_token IS 'AES-256-GCM ciphertext (v1.iv.tag.data). Single-use on Mercado Livre.';
