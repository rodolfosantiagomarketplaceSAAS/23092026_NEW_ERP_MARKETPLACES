import React from "react";
import { Header } from "@/components/layout/Header";
import Link from "next/link";
import {
  Boxes,
  ExternalLink,
  Tag,
  Zap,
  TrendingUp,
  ShoppingBag,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
} from "lucide-react";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { SyncMyListingsButton } from "@/components/catalogo/SyncMyListingsButton";
import { MyListingsTable, type MyListingItem } from "@/components/catalogo/MyListingsTable";

export const dynamic = "force-dynamic";

export default async function CatalogoPage() {
  const supabase = createSupabaseAdminClient();

  // 1. Meus Anúncios Próprios no Banco de Dados com campos avançados
  const { data: dbMyListings } = await supabase
    .from("my_listings")
    .select(`
      id,
      platform,
      external_id,
      title,
      current_price,
      original_price,
      sold_quantity,
      available_quantity,
      shipping_type,
      listing_type,
      thumbnail_url,
      permalink,
      status,
      variations,
      created_at,
      products (sku, cost_price)
    `)
    .order("created_at", { ascending: false });

  // Mapeamento dos anúncios reais ou fallback
  const myListings: MyListingItem[] =
    dbMyListings && dbMyListings.length > 0
      ? dbMyListings.map((m: any) => {
          const prod = Array.isArray(m.products) ? m.products[0] : m.products;
          return {
            id: m.id,
            sku: prod?.sku || "SEM-SKU",
            title: m.title,
            price: Number(m.current_price),
            original_price: m.original_price ? Number(m.original_price) : null,
            cost: prod?.cost_price ? Number(prod.cost_price) : 0,
            external_id: m.external_id,
            platform: m.platform,
            shipping: m.shipping_type || "Padrão",
            listing_type: m.listing_type || "gold_special",
            thumbnail: m.thumbnail_url,
            permalink: m.permalink || (m.external_id ? `https://produto.mercadolivre.com.br/${m.external_id}` : ""),
            status: m.status || "active",
            sold_quantity: m.sold_quantity || 0,
            available_quantity: m.available_quantity || 0,
            variations: Array.isArray(m.variations) ? m.variations : [],
          };
        })
      : [
          {
            id: "ml-001",
            sku: "TECL-MECA-RGB",
            title: "Teclado Mecânico Gamer Led RGB Switch Blue Anti-ghosting Pro",
            price: 147.84,
            original_price: 168.0,
            cost: 120.0,
            external_id: "MLB3492817263",
            platform: "mercadolivre",
            shipping: "ml_full",
            listing_type: "gold_special",
            thumbnail: null,
            permalink: "https://produto.mercadolivre.com.br/MLB-3492817263",
            status: "active",
            sold_quantity: 520,
            available_quantity: 150,
          },
          {
            id: "ml-002",
            sku: "FONE-BT-ANC",
            title: "Fone de Ouvido Bluetooth 5.3 Microfone Bateria 30h Top",
            price: 139.9,
            original_price: 159.9,
            cost: 85.0,
            external_id: "MLB2819201948",
            platform: "mercadolivre",
            shipping: "ml_coleta",
            listing_type: "gold_pro",
            thumbnail: null,
            permalink: "https://produto.mercadolivre.com.br/MLB-2819201948",
            status: "active",
            sold_quantity: 128,
            available_quantity: 45,
          },
        ];

  // Métricas do Catálogo Próprio
  const totalListings = myListings.length;
  const mlCount = myListings.filter((i: any) => i.platform === "mercadolivre").length;
  const shopeeCount = myListings.filter((i: any) => i.platform === "shopee").length;
  const avgPrice =
    totalListings > 0
      ? myListings.reduce((acc: number, cur: any) => acc + cur.price, 0) / totalListings
      : 0;

  return (
    <>
      <Header platformName="Catálogo de Anúncios da Minha Loja" />
      <main className="p-4 flex-1">
        <div className="max-w-[1600px] mx-auto space-y-6">
          {/* Header e Ações */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h1 className="text-base font-bold text-slate-900 tracking-tight flex items-center gap-2">
                <Boxes className="w-5 h-5 text-sky-600" />
                Catálogo de Anúncios da Minha Loja
              </h1>
              <p className="text-xs text-slate-500">
                Gerencie exclusivamente os anúncios oficiais cadastrados da sua loja integrados nos marketplaces.
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

          {/* Cards de Métricas do Catálogo Próprio */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white border border-[#E2E8F0] p-3 rounded shadow-2xs">
              <div className="text-[11px] font-medium text-slate-500">Total de Anúncios Próprios</div>
              <div className="text-xl font-bold text-slate-900 mt-1">{totalListings}</div>
              <div className="text-[10px] text-slate-400 mt-0.5">Ativos na sua conta</div>
            </div>

            <div className="bg-white border border-[#E2E8F0] p-3 rounded shadow-2xs">
              <div className="text-[11px] font-medium text-slate-500 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#FFE600] border border-amber-400"></span>
                Mercado Livre
              </div>
              <div className="text-xl font-bold text-slate-900 mt-1">{mlCount}</div>
              <div className="text-[10px] text-slate-400 mt-0.5">Anúncios no ML</div>
            </div>

            <div className="bg-white border border-[#E2E8F0] p-3 rounded shadow-2xs">
              <div className="text-[11px] font-medium text-slate-500 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#EE4D2D]"></span>
                Shopee
              </div>
              <div className="text-xl font-bold text-slate-900 mt-1">{shopeeCount}</div>
              <div className="text-[10px] text-slate-400 mt-0.5">Anúncios na Shopee</div>
            </div>

            <div className="bg-white border border-[#E2E8F0] p-3 rounded shadow-2xs">
              <div className="text-[11px] font-medium text-slate-500">Ticket Médio de Venda</div>
              <div className="text-xl font-bold text-slate-900 mt-1">R$ {avgPrice.toFixed(2)}</div>
              <div className="text-[10px] text-slate-400 mt-0.5">Preço médio de catálogo</div>
            </div>
          </div>

          {/* Banner Informativo sobre Inteligência Competitiva */}
          <div className="bg-sky-50/60 border border-sky-200 rounded p-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2.5">
              <span className="p-1.5 bg-sky-100 rounded text-sky-700 shrink-0">
                <Zap className="w-4 h-4" />
              </span>
              <div>
                <span className="font-bold text-sky-900">Anúncios Concorrentes & Radar de Mercado:</span>
                <span className="text-sky-700 ml-1">
                  Todos os anúncios de concorrentes capturados via extensão são monitorados exclusivamente no módulo de{" "}
                  <strong>Inteligência de Negócios</strong>.
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

          {/* TABELA: MEUS ANÚNCIOS PRÓPRIOS CADASTRADOS */}
          <div className="bg-white border border-[#E2E8F0] rounded shadow-2xs overflow-hidden">
            <div className="p-3 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-2">
                <span className="p-1.5 bg-slate-100 rounded text-slate-700">
                  <Boxes className="w-4 h-4" />
                </span>
                <div>
                  <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wide">
                    Anúncios da Minha Loja ({myListings.length})
                  </h2>
                  <p className="text-[11px] text-slate-500">
                    Acompanhe preços de venda, custos e acesse a análise comparativa de cada anúncio.
                  </p>
                </div>
              </div>
            </div>

            <MyListingsTable items={myListings} />
          </div>
        </div>
      </main>
    </>
  );
}
