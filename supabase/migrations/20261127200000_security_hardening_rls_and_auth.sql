-- ==============================================================================
-- SAAS DE GESTÃO DE MARKETPLACES E ERP (BLINDAGEM APPSEC & ZERO-TRUST)
-- Migration: 20261127200000_security_hardening_rls_and_auth.sql
-- Descrição:
--   1. Neutraliza a conta demo legada (`admin@crmmarketplaces.com` / senha fraca) caso exista
--   2. Faz backfill de `auth.users.raw_app_meta_data` (somente gravável via Service Role)
--      a partir de `public.user_profiles.status`, eliminando dependência de `user_metadata`
--   3. Endurece políticas RLS do bucket `erp-product-images` no Supabase Storage com isolamento
--      estrito por pasta de tenant (`organization_id` ou `auth.uid()`)
--   4. Garante RLS Multi-Tenant ativo em `competitor_saved_listings`, `competitor_stores`
--      e `competitor_store_listings`
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- 1. NEUTRALIZAÇÃO DE CONTA DEMO COM SENHA PADRÃO (SE EXISTIR)
-- ==============================================================================
DO $$
BEGIN
    UPDATE auth.users
    SET
        encrypted_password = crypt(gen_random_uuid()::text || '-' || gen_random_uuid()::text, gen_salt('bf')),
        banned_until = '2099-12-31 23:59:59+00'::timestamptz,
        raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || '{"status":"suspended","is_approved":false}'::jsonb,
        updated_at = timezone('utc'::text, now())
    WHERE email = 'admin@crmmarketplaces.com'
       OR id::text = '69ee4850-318b-4d9e-83ab-6743f264b6aa';

    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'user_profiles'
    ) THEN
        UPDATE public.user_profiles
        SET status = 'suspended'
        WHERE email = 'admin@crmmarketplaces.com'
           OR id::text = '69ee4850-318b-4d9e-83ab-6743f264b6aa';
    END IF;
END $$;

-- ==============================================================================
-- 2. BACKFILL DE `app_metadata` A PARTIR DE `public.user_profiles`
--    Garante que contas já aprovadas mantenham acesso imediato sem confiar em `user_metadata`
-- ==============================================================================
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'user_profiles'
    ) THEN
        UPDATE auth.users u
        SET raw_app_meta_data = COALESCE(u.raw_app_meta_data, '{}'::jsonb) || jsonb_build_object(
            'status', up.status,
            'role', up.role,
            'is_approved', (up.status = 'active')
        )
        FROM public.user_profiles up
        WHERE u.id::text = up.id::text;
    END IF;
END $$;

-- ==============================================================================
-- 3. SUPABASE STORAGE RLS: ISOLAMENTO DE PASTA POR TENANT EM `erp-product-images`
--    Impede que um usuário autenticado sobrescreva ou delete fotos de outra empresa
-- ==============================================================================
DROP POLICY IF EXISTS "erp_product_images_auth_insert" ON storage.objects;
CREATE POLICY "erp_product_images_auth_insert"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'erp-product-images'
        AND (
            (storage.foldername(name))[1] = auth.uid()::text
            OR (storage.foldername(name))[1] IN (
                SELECT organization_id::text
                FROM public.user_profiles
                WHERE id::text = auth.uid()::text
                  AND organization_id IS NOT NULL
            )
        )
    );

DROP POLICY IF EXISTS "erp_product_images_auth_update" ON storage.objects;
CREATE POLICY "erp_product_images_auth_update"
    ON storage.objects FOR UPDATE TO authenticated
    USING (
        bucket_id = 'erp-product-images'
        AND (
            (storage.foldername(name))[1] = auth.uid()::text
            OR (storage.foldername(name))[1] IN (
                SELECT organization_id::text
                FROM public.user_profiles
                WHERE id::text = auth.uid()::text
                  AND organization_id IS NOT NULL
            )
        )
    );

DROP POLICY IF EXISTS "erp_product_images_auth_delete" ON storage.objects;
CREATE POLICY "erp_product_images_auth_delete"
    ON storage.objects FOR DELETE TO authenticated
    USING (
        bucket_id = 'erp-product-images'
        AND (
            (storage.foldername(name))[1] = auth.uid()::text
            OR (storage.foldername(name))[1] IN (
                SELECT organization_id::text
                FROM public.user_profiles
                WHERE id::text = auth.uid()::text
                  AND organization_id IS NOT NULL
            )
        )
    );

-- ==============================================================================
-- 4. REFORÇO DE RLS EM TABELAS DE INTELIGÊNCIA COMPETITIVA (COMPATÍVEL TEXT E UUID)
--    Detecta dinamicamente se `user_id` é UUID ou TEXT para evitar erro 42883
--    (`operator does not exist: text = uuid`) e remove políticas legadas permissivas.
-- ==============================================================================
DO $$
DECLARE
    v_col_type TEXT;
BEGIN
    -- 4.1 competitor_saved_listings (`user_id` pode ser TEXT ou UUID)
    SELECT data_type INTO v_col_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'competitor_saved_listings'
      AND column_name = 'user_id';

    IF v_col_type IS NOT NULL THEN
        ALTER TABLE public.competitor_saved_listings ENABLE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS "competitor_saved_listings_auth_all" ON public.competitor_saved_listings;
        DROP POLICY IF EXISTS "competitor_saved_listings_tenant_all" ON public.competitor_saved_listings;

        IF v_col_type = 'uuid' THEN
            EXECUTE $pol$
                CREATE POLICY "competitor_saved_listings_tenant_all"
                    ON public.competitor_saved_listings
                    FOR ALL TO authenticated
                    USING (user_id = auth.uid())
                    WITH CHECK (user_id = auth.uid())
            $pol$;
        ELSE
            EXECUTE $pol$
                CREATE POLICY "competitor_saved_listings_tenant_all"
                    ON public.competitor_saved_listings
                    FOR ALL TO authenticated
                    USING (user_id::text = auth.uid()::text)
                    WITH CHECK (user_id::text = auth.uid()::text)
            $pol$;
        END IF;
    END IF;

    -- 4.2 competitor_stores (`user_id` pode ser UUID ou TEXT)
    v_col_type := NULL;
    SELECT data_type INTO v_col_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'competitor_stores'
      AND column_name = 'user_id';

    IF v_col_type IS NOT NULL THEN
        ALTER TABLE public.competitor_stores ENABLE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS "competitor_stores_user_all" ON public.competitor_stores;
        DROP POLICY IF EXISTS "competitor_stores_tenant_all" ON public.competitor_stores;

        IF v_col_type = 'uuid' THEN
            EXECUTE $pol$
                CREATE POLICY "competitor_stores_tenant_all"
                    ON public.competitor_stores
                    FOR ALL TO authenticated
                    USING (user_id = auth.uid())
                    WITH CHECK (user_id = auth.uid())
            $pol$;
        ELSE
            EXECUTE $pol$
                CREATE POLICY "competitor_stores_tenant_all"
                    ON public.competitor_stores
                    FOR ALL TO authenticated
                    USING (user_id::text = auth.uid()::text)
                    WITH CHECK (user_id::text = auth.uid()::text)
            $pol$;
        END IF;
    END IF;

    -- 4.3 competitor_store_listings (`user_id` pode ser UUID ou TEXT)
    v_col_type := NULL;
    SELECT data_type INTO v_col_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'competitor_store_listings'
      AND column_name = 'user_id';

    IF v_col_type IS NOT NULL THEN
        ALTER TABLE public.competitor_store_listings ENABLE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS "competitor_store_listings_user_all" ON public.competitor_store_listings;
        DROP POLICY IF EXISTS "competitor_store_listings_tenant_all" ON public.competitor_store_listings;

        IF v_col_type = 'uuid' THEN
            EXECUTE $pol$
                CREATE POLICY "competitor_store_listings_tenant_all"
                    ON public.competitor_store_listings
                    FOR ALL TO authenticated
                    USING (user_id = auth.uid())
                    WITH CHECK (user_id = auth.uid())
            $pol$;
        ELSE
            EXECUTE $pol$
                CREATE POLICY "competitor_store_listings_tenant_all"
                    ON public.competitor_store_listings
                    FOR ALL TO authenticated
                    USING (user_id::text = auth.uid()::text)
                    WITH CHECK (user_id::text = auth.uid()::text)
            $pol$;
        END IF;
    END IF;
END $$;

NOTIFY pgrst, 'reload schema';
