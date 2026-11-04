-- ==============================================================================
-- Migration: 20261104170000_add_ml_family_and_user_product_hierarchy.sql
-- Descrição: Adiciona suporte nativo à arquitetura oficial "User Products" (UP)
--            e Famílias de Anúncios do Mercado Livre:
--            Nível 1: Anúncio Principal / Família (family_id, family_name)
--            Nível 2: Sub-anúncio / Variação (user_product_id, variation_attributes)
--            Nível 3: Opções de Venda Clássico/Premium/Catálogo (tarifas, frete, líquido)
-- ==============================================================================

ALTER TABLE public.my_listings
    ADD COLUMN IF NOT EXISTS family_id VARCHAR(64),
    ADD COLUMN IF NOT EXISTS family_name VARCHAR(255),
    ADD COLUMN IF NOT EXISTS user_product_id VARCHAR(64),
    ADD COLUMN IF NOT EXISTS parent_item_id VARCHAR(64),
    ADD COLUMN IF NOT EXISTS catalog_product_id VARCHAR(64),
    ADD COLUMN IF NOT EXISTS is_catalog BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS sale_fee_amount NUMERIC(12, 2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS sale_fee_pct NUMERIC(6, 2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS shipping_cost NUMERIC(12, 2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS free_shipping BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS net_amount NUMERIC(12, 2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS quality_score INTEGER,
    ADD COLUMN IF NOT EXISTS sub_status VARCHAR(64);

COMMENT ON COLUMN public.my_listings.family_id IS 'ID da família de anúncios no Mercado Livre (Ex: 60538049697027984)';
COMMENT ON COLUMN public.my_listings.family_name IS 'Título principal da família de anúncios no Mercado Livre';
COMMENT ON COLUMN public.my_listings.user_product_id IS 'ID do User Product (MLBU...) que une as opções Clássico e Premium de uma mesma variação';
COMMENT ON COLUMN public.my_listings.parent_item_id IS 'ID do item pai caso seja derivado ou republicado';
COMMENT ON COLUMN public.my_listings.catalog_product_id IS 'ID do produto de catálogo do Mercado Livre quando aplicável';
COMMENT ON COLUMN public.my_listings.is_catalog IS 'Indica se esta opção de venda pertence ao Catálogo (Buybox) do Mercado Livre';
COMMENT ON COLUMN public.my_listings.sale_fee_amount IS 'Tarifa de venda em R$ cobrada pelo Mercado Livre nesta modalidade (Clássico ou Premium)';
COMMENT ON COLUMN public.my_listings.sale_fee_pct IS 'Percentual estimado da tarifa de venda no canal';
COMMENT ON COLUMN public.my_listings.shipping_cost IS 'Custo de envio em R$ pago pelo vendedor ou comprador';
COMMENT ON COLUMN public.my_listings.free_shipping IS 'Indica se a opção de venda oferece frete grátis';
COMMENT ON COLUMN public.my_listings.net_amount IS 'Valor líquido estimado que o vendedor recebe por venda (Você recebe)';
COMMENT ON COLUMN public.my_listings.quality_score IS 'Pontuação de qualidade/objetivos do anúncio no Mercado Livre (0 a 100)';
COMMENT ON COLUMN public.my_listings.sub_status IS 'Substatus detalhado do anúncio no ML (ex: out_of_stock, waiting_for_patch, picture_download_pending)';

-- Índices B-Tree para agrupamento e busca instantânea por Família e User Product
CREATE INDEX IF NOT EXISTS idx_my_listings_family_id
    ON public.my_listings (user_id, platform, family_id);

CREATE INDEX IF NOT EXISTS idx_my_listings_user_product_id
    ON public.my_listings (user_id, platform, user_product_id);

