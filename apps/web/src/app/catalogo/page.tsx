import React from "react";
import { Header } from "@/components/layout/Header";
import Link from "next/link";
import {
  Boxes,
  Zap,
  TrendingUp,
  ArrowRight,
  Eye,
  Flame,
  Percent,
  Layers,
  Database,
} from "lucide-react";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth/context";
import { applyTenantFilter, isMissingTableError } from "@/lib/mercadolivre/tenant-scope";
import { SyncMyListingsButton } from "@/components/catalogo/SyncMyListingsButton";
import { MyListingsTable, type MyListingItem } from "@/components/catalogo/MyListingsTable";
import {
  buildMercadoLivreHierarchy,
  type GroupedFamilyProduct,
} from "@/lib/catalogo/mlGroupingEngine";
import { buildHierarchyFromNormalizedTables } from "@/lib/catalogo/mlCatalogRepository";
import type {
  MlCatalogKpis,
  MlFamilyDbRow,
  MlSaleOptionDbRow,
  MlVariationDbRow,
} from "@/types/ml-catalog";

export const dynamic = "force-dynamic";

export default async function CatalogoPage() {
  const ctx = await getAuthContext();
  const supabase = createSupabaseAdminClient();

  let families: GroupedFamilyProduct[] = [];
  let kpis: MlCatalogKpis = {
    totalFamilies: 0,
    totalVariations: 0,
    totalSaleOptions: 0,
    totalStock: 0,
    totalVisits7d: 0,
    totalSales7d: 0,
    totalSales30d: 0,
    overallConversion7d: 0,
    avgNetReceive: 0,
  };
  let usingNormalizedTables = false;
  let migrationRequired = false;

  if (ctx) {
    // 1. Consulta prioritária nas 3 tabelas normalizadas (Nível 1 -> Nível 2 -> Nível 3)
    const [familiesRes, variationsRes, optionsRes] = await Promise.all([
      applyTenantFilter(
        supabase
          .from("ml_families")
          .select("family_id, seller_id, is_official_family_id, title, thumbnail_url, status, last_synced_at")
          .neq("status", "closed")
          .order("title", { ascending: true }),
        ctx
      ),
      applyTenantFilter(
        supabase
          .from("ml_variations")
          .select(
            "user_product_id, family_id, seller_id, variation_name, sku, thumbnail_url, available_quantity, mlbs_list, last_synced_at"
          ),
        ctx
      ),
      applyTenantFilter(
        supabase
          .from("ml_sale_options")
          .select(
            "item_id, user_product_id, family_id, seller_id, title, category_id, listing_type_id, catalog_listing, catalog_product_id, has_wholesale, base_price, promo_price, active_price, sale_fee_amount, sale_fee_pct, shipping_cost_amount, free_shipping, shipping_mode_label, shipping_logistic_type, net_receive_amount, visits_7d, sales_7d, sales_30d, sold_quantity, conversion_rate_7d, health_score, pending_goals_count, recommendation_title, recommendation_action, status, sub_status, permalink, thumbnail_url, last_synced_at"
          )
          .neq("status", "closed"),
        ctx
      ),
    ]);

    if (
      isMissingTableError(familiesRes.error) ||
      isMissingTableError(variationsRes.error) ||
      isMissingTableError(optionsRes.error)
    ) {
      migrationRequired = true;
    } else if (
      !familiesRes.error &&
      !variationsRes.error &&
      !optionsRes.error &&
      (familiesRes.data?.length || 0) > 0
    ) {
      const normalizedView = buildHierarchyFromNormalizedTables(
        (familiesRes.data || []) as MlFamilyDbRow[],
        (variationsRes.data || []) as MlVariationDbRow[],
        (optionsRes.data || []) as MlSaleOptionDbRow[]
      );
      families = normalizedView.families;
      kpis = normalizedView.kpis;
      usingNormalizedTables = true;
    }

    // 2. Fallback temporário para `my_listings` (filtrado por user_id) caso as 3 tabelas ainda estejam vazias/sem migration
    if (!usingNormalizedTables) {
      const { data: dbMyListings } = await supabase
        .from("my_listings")
        .select("*, products (sku, cost_price)")
        .eq("user_id", ctx.userId)
        .neq("status", "closed")
        .order("created_at", { ascending: false });

      if (dbMyListings && dbMyListings.length > 0) {
        const legacyItems: MyListingItem[] = dbMyListings.map((m: Record<string, unknown>) => {
          const productsField = m.products as
            | { sku?: string; cost_price?: number }
            | Array<{ sku?: string; cost_price?: number }>
            | null;
          const prod = Array.isArray(productsField) ? productsField[0] : productsField;
          const raw =
            m.raw_data && typeof m.raw_data === "object"
              ? (m.raw_data as Record<string, unknown>)
              : {};

          const externalId = String(m.external_id || "");
          return {
            id: String(m.id || externalId),
            sku: prod?.sku || String(raw.sku || "SEM-SKU"),
            title: String(m.title || ""),
            price: Number(m.current_price || 0),
            original_price: m.original_price ? Number(m.original_price) : null,
            cost: prod?.cost_price ? Number(prod.cost_price) : 0,
            external_id: externalId,
            platform: String(m.platform || "mercadolivre"),
            shipping: String(m.shipping_type || "padrao"),
            listing_type: String(m.listing_type || "gold_special"),
            thumbnail: (m.thumbnail_url as string | null) || null,
            permalink:
              String(m.permalink || "") ||
              (externalId
                ? `https://produto.mercadolivre.com.br/${externalId.replace(/^MLB(\d+)/i, "MLB-$1")}`
                : ""),
            status: String(m.status || "active"),
            sold_quantity: Number(m.sold_quantity || 0),
            available_quantity: Number(m.available_quantity || 0),
            visits: Number(m.visits || 0),
            sales_last_7_days: Number(m.sales_last_7_days || 0),
            sales_last_30_days: Number(m.sales_last_30_days || 0),
            variations: Array.isArray(m.variations) ? (m.variations as MyListingItem["variations"]) : [],
            family_id: (m.family_id as string | null) || (raw.family_id as string | null) || null,
            family_name:
              (m.family_name as string | null) || (raw.family_name as string | null) || null,
            user_product_id:
              (m.user_product_id as string | null) ||
              (raw.user_product_id as string | null) ||
              null,
            parent_item_id:
              (m.parent_item_id as string | null) || (raw.parent_item_id as string | null) || null,
            catalog_product_id:
              (m.catalog_product_id as string | null) ||
              (raw.catalog_product_id as string | null) ||
              null,
            is_catalog: Boolean(m.is_catalog ?? raw.is_catalog ?? false),
            variation_label: (raw.variation_label as string | null) || null,
            sale_fee_amount:
              m.sale_fee_amount !== undefined && m.sale_fee_amount !== null
                ? Number(m.sale_fee_amount)
                : raw.sale_fee_amount !== undefined
                ? Number(raw.sale_fee_amount)
                : null,
            sale_fee_pct:
              m.sale_fee_pct !== undefined && m.sale_fee_pct !== null
                ? Number(m.sale_fee_pct)
                : raw.sale_fee_pct !== undefined
                ? Number(raw.sale_fee_pct)
                : null,
            shipping_cost:
              m.shipping_cost !== undefined && m.shipping_cost !== null
                ? Number(m.shipping_cost)
                : raw.shipping_cost !== undefined
                ? Number(raw.shipping_cost)
                : null,
            free_shipping:
              typeof m.free_shipping === "boolean"
                ? m.free_shipping
                : typeof raw.free_shipping === "boolean"
                ? raw.free_shipping
                : null,
            net_amount:
              m.net_amount !== undefined && m.net_amount !== null
                ? Number(m.net_amount)
                : raw.net_amount !== undefined
                ? Number(raw.net_amount)
                : null,
            quality_score:
              m.quality_score !== undefined && m.quality_score !== null
                ? Number(m.quality_score)
                : raw.quality_score !== undefined
                ? Number(raw.quality_score)
                : null,
            sub_status: (m.sub_status as string | null) || (raw.sub_status as string | null) || null,
            has_wholesale: Boolean(raw.has_wholesale),
            raw_data: raw,
          };
        });

        families = buildMercadoLivreHierarchy(legacyItems);
        const allOptions = families.flatMap((f) => f.variations.flatMap((v) => v.sellingOptions));
        const totalVisits7d = allOptions.reduce((acc, o) => acc + o.visits, 0);
        const totalSales7d = allOptions.reduce((acc, o) => acc + o.sales7d, 0);
        const totalSales30d = allOptions.reduce((acc, o) => acc + o.sales30d, 0);

        kpis = {
          totalFamilies: families.length,
          totalVariations: families.reduce((acc, f) => acc + f.variations.length, 0),
          totalSaleOptions: allOptions.length,
          totalStock: families.reduce((acc, f) => acc + f.totalStock, 0),
          totalVisits7d,
          totalSales7d,
          totalSales30d,
          overallConversion7d:
            totalVisits7d > 0 ? Number(((totalSales7d / totalVisits7d) * 100).toFixed(1)) : 0,
          avgNetReceive:
            allOptions.length > 0
              ? allOptions.reduce((acc, o) => acc + o.netAmount, 0) / allOptions.length
              : 0,
        };
      }
    }
  }

  return (
    <>
      <Header platformName="Anúncios & Catálogo (Padrão Mercado Livre)" />
      <main className="p-4 flex-1 min-w-0">
        <div className="max-w-[1650px] mx-auto space-y-5">
          {/* Header e Ações */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h1 className="text-base font-bold text-slate-900 tracking-tight flex items-center gap-2">
                <Boxes className="w-5 h-5 text-sky-600" />
                Gestão de Anúncios & Catálogo (Arquitetura Oficial Mercado Livre)
              </h1>
              <p className="text-xs text-slate-500">
                Organização normalizada em 3 níveis: Anúncio Principal (Família) → Sub-anúncios (User Product / SKU / Estoque único) → Opções de Venda (Clássico, Premium, Catálogo e Atacado).
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <SyncMyListingsButton />
              <Link
                href="/inteligencia"
                className="px-3 py-1.5 text-xs font-semibold bg-sky-600 hover:bg-sky-700 text-white rounded flex items-center gap-1.5 shadow-2xs transition-colors"
              >
                <Zap className="w-3.5 h-3.5" />
                Inteligência de Negócios & Concorrentes →
              </Link>
            </div>
          </div>

          {/* Aviso caso a migration SQL ainda não tenha sido aplicada */}
          {migrationRequired && (
            <div className="bg-amber-50 border border-amber-300 rounded p-3 flex items-start gap-2.5 text-xs text-amber-900">
              <Database className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">Migration SQL pendente no Supabase: </span>
                <span>
                  Execute{" "}
                  <code className="px-1 py-0.5 bg-amber-100 rounded font-mono text-[11px]">
                    20261125170000_create_ml_catalog_3_level_hierarchy.sql
                  </code>{" "}
                  no Supabase e clique em <strong>Sincronizar Anúncios do ML</strong> para ativar as 3 tabelas normalizadas com tarifas, frete e métricas reais.
                </span>
              </div>
            </div>
          )}

          {/* Cards de Métricas do Catálogo Próprio (calculados das tabelas normalizadas sem duplicar estoque/visitas) */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="bg-white border border-[#E2E8F0] p-3 rounded shadow-2xs">
              <div className="text-[11px] font-medium text-slate-500 flex items-center gap-1">
                <Boxes className="w-3.5 h-3.5 text-sky-600" />
                Anúncios Principais
              </div>
              <div className="text-xl font-bold text-slate-900 mt-1">{kpis.totalFamilies}</div>
              <div className="text-[10px] text-slate-500 mt-0.5">
                {kpis.totalVariations} variações • {kpis.totalSaleOptions} opções MLB
              </div>
            </div>

            <div className="bg-white border border-[#E2E8F0] p-3 rounded shadow-2xs">
              <div className="text-[11px] font-medium text-slate-500 flex items-center gap-1">
                <Layers className="w-3.5 h-3.5 text-amber-600" />
                Variações & Estoque
              </div>
              <div className="text-xl font-bold text-slate-900 mt-1">
                {kpis.totalVariations}{" "}
                <span className="text-xs font-normal text-slate-500">var.</span>
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">
                Estoque real: {kpis.totalStock.toLocaleString("pt-BR")} un.
              </div>
            </div>

            <div className="bg-white border border-[#E2E8F0] p-3 rounded shadow-2xs">
              <div className="text-[11px] font-medium text-slate-500 flex items-center gap-1">
                <Eye className="w-3.5 h-3.5 text-slate-600" />
                Visitas (Últimos 7d)
              </div>
              <div className="text-xl font-bold text-slate-900 mt-1">
                {kpis.totalVisits7d.toLocaleString("pt-BR")}
              </div>
              <div className="text-[10px] text-emerald-600 font-semibold mt-0.5">
                Tráfego real por MLB (7d)
              </div>
            </div>

            <div className="bg-white border border-[#E2E8F0] p-3 rounded shadow-2xs">
              <div className="text-[11px] font-medium text-slate-500 flex items-center gap-1">
                <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
                Vendas Últimos 7d / 30d
              </div>
              <div className="text-xl font-bold text-slate-900 mt-1">
                {kpis.totalSales7d.toLocaleString("pt-BR")}{" "}
                <span className="text-xs font-medium text-slate-400">
                  / {kpis.totalSales30d.toLocaleString("pt-BR")} un.
                </span>
              </div>
              <div className="text-[10px] text-emerald-700 font-semibold mt-0.5">
                Pedidos pagos agrupados por MLB
              </div>
            </div>

            <div className="bg-white border border-emerald-200 bg-emerald-50/20 p-3 rounded shadow-2xs">
              <div className="text-[11px] font-medium text-emerald-800 flex items-center gap-1">
                <Percent className="w-3.5 h-3.5 text-emerald-600" />
                Conversão Média (7d)
              </div>
              <div className="text-xl font-bold text-emerald-900 mt-1">
                {kpis.overallConversion7d.toFixed(1).replace(".", ",")}%
              </div>
              <div className="text-[10px] text-emerald-700 font-semibold mt-0.5">
                Vendas 7d ÷ Visitas 7d
              </div>
            </div>

            <div className="bg-white border border-[#E2E8F0] p-3 rounded shadow-2xs">
              <div className="text-[11px] font-medium text-slate-500 flex items-center gap-1">
                <Flame className="w-3.5 h-3.5 text-sky-600" />
                Você Recebe (Médio)
              </div>
              <div className="text-xl font-bold text-slate-900 mt-1">
                R$ {kpis.avgNetReceive.toFixed(2).replace(".", ",")}
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">
                Líquido real pós-tarifas e envio
              </div>
            </div>
          </div>

          {/* Banner Informativo sobre Inteligência Competitiva */}
          <div className="bg-sky-50/60 border border-sky-200 rounded p-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2.5">
              <span className="p-1.5 bg-sky-100 rounded text-sky-700 shrink-0">
                <Zap className="w-4 h-4" />
              </span>
              <div>
                <span className="font-bold text-sky-900">
                  Arquitetura User Products (Família → Variações → Opções MLB):
                </span>
                <span className="text-sky-700 ml-1">
                  Clique em <strong>Sincronizar Anúncios do ML</strong> para atualizar preços promocionais, tarifas oficiais, frete do vendedor, visitas 7d, pedidos pagos e objetivos de qualidade.
                </span>
              </div>
            </div>
            <Link
              href="/inteligencia"
              className="text-xs font-semibold text-sky-700 hover:text-sky-900 bg-white border border-sky-300 px-3 py-1 rounded shrink-0 flex items-center gap-1 hover:bg-sky-50 transition-colors"
            >
              Abrir Inteligência de Negócios <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {/* TABELA HIERÁRQUICA PADRÃO MERCADO LIVRE */}
          <div className="bg-white border border-[#E2E8F0] rounded shadow-2xs overflow-hidden">
            <MyListingsTable
              families={families}
              totalSaleOptions={kpis.totalSaleOptions}
            />
          </div>
        </div>
      </main>
    </>
  );
}
