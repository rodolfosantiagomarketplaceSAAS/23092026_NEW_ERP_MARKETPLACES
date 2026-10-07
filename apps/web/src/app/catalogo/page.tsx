import React from "react";
import { Header } from "@/components/layout/Header";
import Link from "next/link";
import {
  Boxes,
  ExternalLink,
  Plus,
  Search,
  Tag,
  Zap,
  Radio,
  TrendingDown,
  ShieldCheck,
  CheckCircle2,
} from "lucide-react";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function CatalogoPage() {
  const supabase = createSupabaseAdminClient();

  // 1. Meus Anúncios Próprios no Banco
  const { data: dbMyListings } = await supabase
    .from("my_listings")
    .select(`
      id,
      platform,
      external_id,
      title,
      current_price,
      shipping_type,
      thumbnail_url,
      permalink,
      status,
      created_at,
      products (sku, cost_price)
    `)
    .order("created_at", { ascending: false });

  // Fallback caso banco não tenha dados
  const myListings =
    dbMyListings && dbMyListings.length > 0
      ? dbMyListings.map((m: any) => {
          const prod = Array.isArray(m.products) ? m.products[0] : m.products;
          return {
            id: m.id,
            sku: prod?.sku || "SEM-SKU",
            title: m.title,
            price: Number(m.current_price),
            cost: prod?.cost_price ? Number(prod.cost_price) : 0,
            mlb: m.external_id,
            platform: m.platform,
            shipping: m.shipping_type || "Padrão",
            thumbnail: m.thumbnail_url,
            permalink: m.permalink,
          };
        })
      : [
          {
            id: "ml-001",
            sku: "TECL-MECA-RGB",
            title: "Teclado Mecânico Gamer Led RGB Switch Blue Anti-ghosting Pro",
            price: 199.9,
            cost: 120.0,
            mlb: "MLB3492817263",
            platform: "mercadolivre",
            shipping: "ml_full",
            thumbnail: null,
            permalink: "https://produto.mercadolivre.com.br/MLB-3492817263",
          },
          {
            id: "ml-002",
            sku: "FONE-BT-ANC",
            title: "Fone de Ouvido Bluetooth 5.3 Microfone Bateria 30h Top",
            price: 139.9,
            cost: 85.0,
            mlb: "MLB2819201948",
            platform: "mercadolivre",
            shipping: "ml_coleta",
            thumbnail: null,
            permalink: "https://produto.mercadolivre.com.br/MLB-2819201948",
          },
        ];

  // 2. Anúncios Concorrentes Capturados no Radar de Mercado
  const { data: dbRadarListings } = await supabase
    .from("competitor_listings")
    .select("*")
    .order("created_at", { ascending: false });

  const radarListings = dbRadarListings || [];

  return (
    <>
      <Header platformName="Catálogo de Anúncios & Radar de Mercado" />
      <main className="p-4 flex-1">
        <div className="max-w-[1600px] mx-auto space-y-6">
          {/* Header e Ações */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h1 className="text-base font-bold text-slate-900 tracking-tight">
                Anúncios Próprios & Radar de Mercado
              </h1>
              <p className="text-xs text-slate-500">
                Visualize seus produtos cadastrados e todos os anúncios concorrentes capturados via Extensão Chrome.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href="/inteligencia"
                className="px-3 py-1.5 text-xs font-semibold bg-sky-600 hover:bg-sky-700 text-white rounded flex items-center gap-1.5 shadow-2xs transition-colors"
              >
                <Zap className="w-3.5 h-3.5" />
                Abrir Inteligência Comparativa de Buybox
              </Link>
            </div>
          </div>

          {/* SEÇÃO 1: RADAR DE MERCADO (ANÚNCIOS CAPTURADOS VIA EXTENSÃO) */}
          <div className="bg-white border border-[#E2E8F0] rounded shadow-2xs overflow-hidden">
            <div className="p-3 border-b border-slate-200 flex items-center justify-between bg-sky-50/40">
              <div className="flex items-center gap-2">
                <span className="p-1.5 bg-sky-100 rounded text-sky-700">
                  <Radio className="w-4 h-4 animate-pulse" />
                </span>
                <div>
                  <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wide flex items-center gap-2">
                    Radar de Mercado — Concorrentes Capturados via Extensão
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-600 text-white">
                      {radarListings.length} {radarListings.length === 1 ? "anúncio" : "anúncios"}
                    </span>
                  </h2>
                  <p className="text-[11px] text-slate-500">
                    Estes são os anúncios enviados diretamente da extensão para espionagem e inteligência competitiva.
                  </p>
                </div>
              </div>
              <Link
                href="/inteligencia?status=RADAR"
                className="text-xs text-sky-700 hover:text-sky-900 font-semibold flex items-center gap-1 bg-white border border-sky-200 px-2.5 py-1 rounded hover:bg-sky-50 transition-colors"
              >
                Ver todos no Painel BI →
              </Link>
            </div>

            {radarListings.length === 0 ? (
              <div className="py-8 text-center text-slate-400 text-xs">
                Nenhum anúncio capturado no Radar ainda. Acesse o Mercado Livre ou Shopee e clique em{" "}
                <strong>&quot;Enviar para Radar de Mercado (ERP)&quot;</strong> na extensão.
              </div>
            ) : (
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase text-[11px]">
                    <th className="py-2.5 px-3 min-w-[280px]">Anúncio Capturado</th>
                    <th className="py-2.5 px-3">Vendedor / Loja</th>
                    <th className="py-2.5 px-3">Plataforma</th>
                    <th className="py-2.5 px-3 text-right">Preço Monitorado</th>
                    <th className="py-2.5 px-3 text-center">Status no ERP</th>
                    <th className="py-2.5 px-3 text-center">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {radarListings.map((radar: any) => (
                    <tr key={radar.id} className="hover:bg-sky-50/30 transition-colors">
                      <td className="py-2.5 px-3">
                        <div className="flex items-center space-x-2.5">
                          <div className="w-9 h-9 rounded border border-slate-200 bg-slate-50 shrink-0 flex items-center justify-center overflow-hidden">
                            {radar.thumbnail_url ? (
                              <img
                                src={radar.thumbnail_url}
                                alt={radar.title}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <Tag className="w-4 h-4 text-slate-400" />
                            )}
                          </div>
                          <div>
                            <div className="font-semibold text-slate-900 line-clamp-1">
                              {radar.title}
                            </div>
                            <div className="text-[11px] text-slate-500 flex items-center gap-1.5 mt-0.5">
                              <span>ID: <code>{radar.external_id}</code></span>
                              {radar.shipping_type === "ml_full" && (
                                <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-1 rounded">
                                  FULL
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="font-medium text-slate-800">{radar.seller_name || "Desconhecido"}</span>
                        {radar.seller_reputation === "platinum" && (
                          <div className="text-[10px] text-emerald-600 font-semibold flex items-center gap-0.5">
                            <ShieldCheck className="w-3 h-3" /> Platinum
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-3 capitalize text-slate-600 font-medium">
                        {radar.platform === "mercadolivre" ? "Mercado Livre" : "Shopee"}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <div className="font-bold text-slate-900 text-sm">
                          R$ {Number(radar.current_price).toFixed(2)}
                        </div>
                        {radar.original_price && Number(radar.original_price) > Number(radar.current_price) && (
                          <div className="text-[10px] text-slate-400 line-through">
                            R$ {Number(radar.original_price).toFixed(2)}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Sincronizado
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <Link
                            href="/inteligencia"
                            className="px-2.5 py-1 text-[11px] font-semibold bg-sky-50 text-sky-700 hover:bg-sky-100 border border-sky-200 rounded transition-colors"
                          >
                            Analisar no BI →
                          </Link>
                          {radar.permalink && (
                            <a
                              href={radar.permalink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1 text-slate-400 hover:text-slate-600"
                              title="Abrir no Marketplace"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* SEÇÃO 2: MEUS ANÚNCIOS PRÓPRIOS CADASTRADOS */}
          <div className="bg-white border border-[#E2E8F0] rounded shadow-2xs overflow-hidden">
            <div className="p-3 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-2">
                <span className="p-1.5 bg-slate-100 rounded text-slate-700">
                  <Boxes className="w-4 h-4" />
                </span>
                <div>
                  <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wide">
                    Meus Anúncios Próprios Cadastrados ({myListings.length})
                  </h2>
                  <p className="text-[11px] text-slate-500">
                    Anúncios da sua conta nos canais integrados para monitorar Buybox contra concorrentes.
                  </p>
                </div>
              </div>
            </div>

            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase text-[11px]">
                  <th className="py-2.5 px-3">SKU / Produto</th>
                  <th className="py-2.5 px-3">Canal</th>
                  <th className="py-2.5 px-3 text-right">Preço de Custo</th>
                  <th className="py-2.5 px-3 text-right">Preço de Venda</th>
                  <th className="py-2.5 px-3 text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {myListings.map((item: any) => (
                  <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-2.5 px-3">
                      <div className="font-semibold text-slate-900">{item.title}</div>
                      <div className="text-[11px] text-slate-500">
                        SKU: <code>{item.sku}</code> • ID: {item.mlb}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-slate-600 capitalize">
                      {item.platform === "mercadolivre" ? "Mercado Livre" : "Shopee"}
                    </td>
                    <td className="py-2.5 px-3 text-right text-slate-500">
                      R$ {item.cost ? item.cost.toFixed(2) : "0.00"}
                    </td>
                    <td className="py-2.5 px-3 text-right font-bold text-slate-900">
                      R$ {item.price.toFixed(2)}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <Link
                        href="/inteligencia"
                        className="text-sky-600 hover:text-sky-800 text-[11px] font-semibold"
                      >
                        Monitorar Buybox →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </>
  );
}
