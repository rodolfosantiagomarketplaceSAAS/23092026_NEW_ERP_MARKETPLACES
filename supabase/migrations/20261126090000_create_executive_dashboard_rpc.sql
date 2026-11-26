-- ==============================================================================
-- SAAS DE GESTÃO DE MARKETPLACES E ERP (PADRÃO TINY & BLING)
-- Migration: 20261126090000_create_executive_dashboard_rpc.sql
-- Módulo: Dashboard Geral Executivo (Alta Performance + Baixo Consumo de Egress)
-- Descrição:
--   1. Índices compostos para acelerar consolidação por período/loja/anúncio
--   2. Função RPC `fn_get_executive_dashboard_metrics` que agrega diretamente no
--      PostgreSQL (série diária comparada ao período anterior, Curva A,
--      produtos em queda e radar de alertas), retornando um JSONB compacto.
-- ==============================================================================

CREATE INDEX IF NOT EXISTS idx_ml_sales_orders_org_store_date
    ON public.ml_sales_orders(organization_id, store_name, order_date DESC);

CREATE INDEX IF NOT EXISTS idx_ml_sales_orders_paid_deadline
    ON public.ml_sales_orders(organization_id, status, shipping_deadline)
    WHERE status = 'paid';

CREATE INDEX IF NOT EXISTS idx_my_listings_external_id
    ON public.my_listings(external_id);

CREATE OR REPLACE FUNCTION public.fn_get_executive_dashboard_metrics(
    p_organization_id UUID,
    p_user_id UUID,
    p_from_date DATE,
    p_to_date DATE,
    p_store_name TEXT DEFAULT NULL,
    p_critical_margin_pct NUMERIC DEFAULT 10.0
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_days_span INTEGER;
    v_prev_from_date DATE;
    v_prev_to_date DATE;
    v_curr_start TIMESTAMPTZ;
    v_curr_end TIMESTAMPTZ;
    v_prev_start TIMESTAMPTZ;
    v_prev_end TIMESTAMPTZ;
    v_result JSONB;
BEGIN
    v_days_span := GREATEST((p_to_date - p_from_date) + 1, 1);
    v_prev_to_date := p_from_date - INTERVAL '1 day';
    v_prev_from_date := v_prev_to_date - ((v_days_span - 1) * INTERVAL '1 day');

    v_curr_start := (p_from_date::TEXT || ' 00:00:00 America/Sao_Paulo')::TIMESTAMPTZ;
    v_curr_end   := (p_to_date::TEXT   || ' 23:59:59.999 America/Sao_Paulo')::TIMESTAMPTZ;
    v_prev_start := (v_prev_from_date::TEXT || ' 00:00:00 America/Sao_Paulo')::TIMESTAMPTZ;
    v_prev_end   := (v_prev_to_date::TEXT   || ' 23:59:59.999 America/Sao_Paulo')::TIMESTAMPTZ;

    WITH tenant_orders AS (
        SELECT
            o.ml_order_id,
            o.ml_pack_id,
            o.store_name,
            o.order_date,
            (o.order_date AT TIME ZONE 'America/Sao_Paulo')::DATE AS br_date,
            o.shipping_deadline,
            o.logistic_type,
            o.status,
            UPPER(TRIM(o.mlb_id)) AS mlb_id,
            o.sku,
            o.product_title,
            o.product_thumbnail,
            o.permalink,
            COALESCE(o.quantity, 1) AS quantity,
            COALESCE(o.gross_sale_amount, 0)::NUMERIC AS gross_sale_amount,
            COALESCE(o.net_operational_profit, 0)::NUMERIC AS net_operational_profit
        FROM public.ml_sales_orders o
        WHERE
            (
                (p_organization_id IS NOT NULL AND o.organization_id = p_organization_id)
                OR (p_organization_id IS NULL AND o.organization_id IS NULL AND o.user_id = p_user_id)
            )
            AND o.order_date >= v_prev_start
            AND o.order_date <= v_curr_end
            AND o.status NOT IN ('cancelled', 'returned')
            AND (p_store_name IS NULL OR p_store_name = '' OR p_store_name = 'all' OR o.store_name = p_store_name)
    ),
    curr_valid AS (
        SELECT * FROM tenant_orders
        WHERE order_date >= v_curr_start AND order_date <= v_curr_end
    ),
    prev_valid AS (
        SELECT * FROM tenant_orders
        WHERE order_date >= v_prev_start AND order_date <= v_prev_end
    ),
    date_spine AS (
        SELECT
            gs::DATE AS curr_day,
            (gs::DATE - (v_days_span * INTERVAL '1 day'))::DATE AS prev_day
        FROM generate_series(p_from_date::TIMESTAMP, p_to_date::TIMESTAMP, INTERVAL '1 day') gs
    ),
    curr_daily AS (
        SELECT
            br_date,
            COUNT(*)::INTEGER AS orders,
            COALESCE(SUM(quantity), 0)::INTEGER AS units,
            ROUND(COALESCE(SUM(gross_sale_amount), 0), 2) AS gross,
            ROUND(COALESCE(SUM(net_operational_profit), 0), 2) AS net_profit
        FROM curr_valid
        GROUP BY br_date
    ),
    prev_daily AS (
        SELECT
            br_date,
            COUNT(*)::INTEGER AS orders,
            COALESCE(SUM(quantity), 0)::INTEGER AS units,
            ROUND(COALESCE(SUM(gross_sale_amount), 0), 2) AS gross,
            ROUND(COALESCE(SUM(net_operational_profit), 0), 2) AS net_profit
        FROM prev_valid
        GROUP BY br_date
    ),
    daily_series AS (
        SELECT
            to_char(s.curr_day, 'YYYY-MM-DD') AS date_key,
            to_char(s.curr_day, 'DD/MM') AS date_label,
            COALESCE(c.gross, 0) AS gross_sales,
            COALESCE(c.net_profit, 0) AS net_profit,
            COALESCE(c.orders, 0) AS orders_count,
            COALESCE(c.units, 0) AS units_sold,
            COALESCE(p.gross, 0) AS prev_gross_sales,
            COALESCE(p.net_profit, 0) AS prev_net_profit,
            COALESCE(p.orders, 0) AS prev_orders_count
        FROM date_spine s
        LEFT JOIN curr_daily c ON c.br_date = s.curr_day
        LEFT JOIN prev_daily p ON p.br_date = s.prev_day
        ORDER BY s.curr_day ASC
    ),
    tenant_listings AS (
        SELECT DISTINCT ON (UPPER(TRIM(l.external_id)))
            UPPER(TRIM(l.external_id)) AS mlb_id,
            l.title,
            l.thumbnail_url,
            l.permalink,
            l.status::TEXT AS listing_status,
            COALESCE(l.available_quantity, 0)::INTEGER AS available_quantity,
            COALESCE(l.visits, 0)::INTEGER AS visits
        FROM public.my_listings l
        WHERE
            l.platform = 'mercadolivre'
            AND (
                l.user_id = p_user_id
                OR (
                    p_organization_id IS NOT NULL
                    AND EXISTS (
                        SELECT 1 FROM public.user_profiles up
                        WHERE up.id = l.user_id AND up.organization_id = p_organization_id
                    )
                )
            )
        ORDER BY UPPER(TRIM(l.external_id)), l.updated_at DESC
    ),
    curr_by_mlb AS (
        SELECT
            mlb_id,
            MAX(sku) AS sku,
            MAX(product_title) AS product_title,
            MAX(product_thumbnail) AS product_thumbnail,
            MAX(permalink) AS permalink,
            COUNT(*)::INTEGER AS orders_count,
            COALESCE(SUM(quantity), 0)::INTEGER AS units_sold,
            ROUND(COALESCE(SUM(gross_sale_amount), 0), 2) AS gross_sales,
            ROUND(COALESCE(SUM(net_operational_profit), 0), 2) AS net_profit
        FROM curr_valid
        GROUP BY mlb_id
    ),
    prev_by_mlb AS (
        SELECT
            mlb_id,
            MAX(sku) AS sku,
            MAX(product_title) AS product_title,
            MAX(product_thumbnail) AS product_thumbnail,
            MAX(permalink) AS permalink,
            COUNT(*)::INTEGER AS orders_count,
            COALESCE(SUM(quantity), 0)::INTEGER AS units_sold,
            ROUND(COALESCE(SUM(gross_sale_amount), 0), 2) AS gross_sales,
            ROUND(COALESCE(SUM(net_operational_profit), 0), 2) AS net_profit
        FROM prev_valid
        GROUP BY mlb_id
    ),
    combined_products AS (
        SELECT
            COALESCE(c.mlb_id, p.mlb_id) AS mlb_id,
            COALESCE(c.sku, p.sku) AS sku,
            COALESCE(c.product_title, p.product_title, l.title, COALESCE(c.mlb_id, p.mlb_id)) AS product_title,
            COALESCE(c.product_thumbnail, p.product_thumbnail, l.thumbnail_url) AS product_thumbnail,
            COALESCE(c.permalink, p.permalink, l.permalink) AS permalink,
            COALESCE(c.orders_count, 0) AS orders_count,
            COALESCE(c.units_sold, 0) AS units_sold,
            COALESCE(c.gross_sales, 0) AS gross_sales,
            COALESCE(c.net_profit, 0) AS net_profit,
            CASE
                WHEN COALESCE(c.gross_sales, 0) > 0
                THEN ROUND((COALESCE(c.net_profit, 0) / c.gross_sales) * 100.0, 1)
                ELSE 0
            END AS margin_pct,
            COALESCE(p.orders_count, 0) AS prev_orders_count,
            COALESCE(p.units_sold, 0) AS prev_units_sold,
            COALESCE(p.gross_sales, 0) AS prev_gross_sales,
            COALESCE(p.net_profit, 0) AS prev_net_profit,
            CASE
                WHEN COALESCE(p.gross_sales, 0) > 0
                THEN ROUND(((COALESCE(c.gross_sales, 0) - p.gross_sales) / p.gross_sales) * 100.0, 1)
                ELSE NULL
            END AS revenue_delta_pct,
            CASE
                WHEN COALESCE(p.units_sold, 0) > 0
                THEN ROUND(((COALESCE(c.units_sold, 0) - p.units_sold)::NUMERIC / p.units_sold::NUMERIC) * 100.0, 1)
                ELSE NULL
            END AS units_delta_pct,
            l.available_quantity AS available_quantity,
            l.listing_status AS listing_status,
            COALESCE(l.visits, 0) AS listing_visits,
            ROUND(COALESCE(c.units_sold, 0)::NUMERIC / v_days_span::NUMERIC, 2) AS daily_velocity,
            CASE
                WHEN COALESCE(c.units_sold, 0) > 0 AND l.available_quantity IS NOT NULL
                THEN ROUND(l.available_quantity::NUMERIC / (c.units_sold::NUMERIC / v_days_span::NUMERIC), 1)
                ELSE NULL
            END AS days_of_stock
        FROM curr_by_mlb c
        FULL OUTER JOIN prev_by_mlb p ON p.mlb_id = c.mlb_id
        LEFT JOIN tenant_listings l ON l.mlb_id = COALESCE(c.mlb_id, p.mlb_id)
    ),
    top_by_revenue AS (
        SELECT * FROM combined_products
        WHERE gross_sales > 0
        ORDER BY gross_sales DESC, units_sold DESC
        LIMIT 8
    ),
    top_by_profit AS (
        SELECT * FROM combined_products
        WHERE gross_sales > 0
        ORDER BY net_profit DESC, margin_pct DESC
        LIMIT 8
    ),
    declining_products AS (
        SELECT * FROM combined_products
        WHERE prev_units_sold >= 2 AND units_sold < prev_units_sold
        ORDER BY (prev_gross_sales - gross_sales) DESC, units_delta_pct ASC NULLS LAST
        LIMIT 8
    ),
    stockout_alerts AS (
        SELECT
            mlb_id,
            sku,
            product_title,
            product_thumbnail,
            permalink,
            available_quantity,
            daily_velocity,
            days_of_stock,
            gross_sales
        FROM combined_products
        WHERE
            units_sold >= 2
            AND available_quantity IS NOT NULL
            AND days_of_stock IS NOT NULL
            AND days_of_stock < 7.0
            AND COALESCE(listing_status, 'active') = 'active'
        ORDER BY days_of_stock ASC, gross_sales DESC
        LIMIT 6
    ),
    critical_margin_alerts AS (
        SELECT
            mlb_id,
            sku,
            product_title,
            product_thumbnail,
            permalink,
            units_sold,
            gross_sales,
            net_profit,
            margin_pct
        FROM combined_products
        WHERE
            gross_sales > 0
            AND margin_pct < p_critical_margin_pct
        ORDER BY net_profit ASC, margin_pct ASC
        LIMIT 6
    ),
    conversion_alerts AS (
        SELECT
            l.mlb_id,
            NULL::TEXT AS sku,
            l.title AS product_title,
            l.thumbnail_url AS product_thumbnail,
            l.permalink,
            l.visits AS listing_visits,
            COALESCE(c.orders_count, 0) AS orders_count,
            l.available_quantity
        FROM tenant_listings l
        LEFT JOIN curr_by_mlb c ON c.mlb_id = l.mlb_id
        WHERE
            l.listing_status = 'active'
            AND l.visits >= 80
            AND (
                COALESCE(c.orders_count, 0) = 0
                OR ((COALESCE(c.orders_count, 0)::NUMERIC / GREATEST(l.visits, 1)::NUMERIC) * 100.0) < 0.6
            )
        ORDER BY l.visits DESC
        LIMIT 6
    ),
    urgent_shipments AS (
        SELECT
            o.ml_order_id,
            o.ml_pack_id,
            o.mlb_id,
            o.product_title,
            o.shipping_deadline,
            o.logistic_type,
            o.store_name
        FROM public.ml_sales_orders o
        WHERE
            (
                (p_organization_id IS NOT NULL AND o.organization_id = p_organization_id)
                OR (p_organization_id IS NULL AND o.organization_id IS NULL AND o.user_id = p_user_id)
            )
            AND o.status = 'paid'
            AND o.shipping_deadline IS NOT NULL
            AND o.shipping_deadline <= (NOW() + INTERVAL '24 hours')
            AND (p_store_name IS NULL OR p_store_name = '' OR p_store_name = 'all' OR o.store_name = p_store_name)
        ORDER BY o.shipping_deadline ASC
        LIMIT 8
    ),
    distinct_stores AS (
        SELECT DISTINCT o.store_name
        FROM public.ml_sales_orders o
        WHERE
            (
                (p_organization_id IS NOT NULL AND o.organization_id = p_organization_id)
                OR (p_organization_id IS NULL AND o.organization_id IS NULL AND o.user_id = p_user_id)
            )
            AND o.store_name IS NOT NULL
            AND o.store_name <> ''
        ORDER BY o.store_name ASC
    )
    SELECT jsonb_build_object(
        'days_span', v_days_span,
        'prev_from_date', to_char(v_prev_from_date, 'YYYY-MM-DD'),
        'prev_to_date', to_char(v_prev_to_date, 'YYYY-MM-DD'),
        'daily_series', COALESCE((SELECT jsonb_agg(to_jsonb(daily_series.*)) FROM daily_series), '[]'::jsonb),
        'top_by_revenue', COALESCE((SELECT jsonb_agg(to_jsonb(top_by_revenue.*)) FROM top_by_revenue), '[]'::jsonb),
        'top_by_profit', COALESCE((SELECT jsonb_agg(to_jsonb(top_by_profit.*)) FROM top_by_profit), '[]'::jsonb),
        'declining_products', COALESCE((SELECT jsonb_agg(to_jsonb(declining_products.*)) FROM declining_products), '[]'::jsonb),
        'stockout_alerts', COALESCE((SELECT jsonb_agg(to_jsonb(stockout_alerts.*)) FROM stockout_alerts), '[]'::jsonb),
        'critical_margin_alerts', COALESCE((SELECT jsonb_agg(to_jsonb(critical_margin_alerts.*)) FROM critical_margin_alerts), '[]'::jsonb),
        'conversion_alerts', COALESCE((SELECT jsonb_agg(to_jsonb(conversion_alerts.*)) FROM conversion_alerts), '[]'::jsonb),
        'urgent_shipments', COALESCE((SELECT jsonb_agg(to_jsonb(urgent_shipments.*)) FROM urgent_shipments), '[]'::jsonb),
        'stores', COALESCE((SELECT jsonb_agg(store_name) FROM distinct_stores), '[]'::jsonb)
    )
    INTO v_result;

    RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_get_executive_dashboard_metrics(UUID, UUID, DATE, DATE, TEXT, NUMERIC)
    TO authenticated, service_role;

COMMENT ON FUNCTION public.fn_get_executive_dashboard_metrics IS
    'Consolida série diária comparada ao período anterior, Curva A, quedas e alertas operacionais diretamente no PostgreSQL com mínimo egress.';
