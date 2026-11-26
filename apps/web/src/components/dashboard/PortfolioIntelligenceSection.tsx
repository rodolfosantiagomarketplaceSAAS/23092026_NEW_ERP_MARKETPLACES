"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  ArrowDownRight,
  ArrowUpRight,
  ExternalLink,
  Package,
  TrendingDown,
  Trophy,
} from "lucide-react";
import type { PortfolioProductRow } from "@/types/executive-dashboard";
import {
  formatBRL,
  formatPct,
  upgradeMlThumbnailUrl,
} from "@/components/vendas/formatters";

interface PortfolioIntelligenceSectionProps {
  topByRevenue: PortfolioProductRow[];
  topByProfit: PortfolioProductRow[];
  decliningProducts: PortfolioProductRow[];
}

function ProductThumb({ src, alt }: { src: string | null; alt: string }) {
  const upgraded = upgradeMlThumbnailUrl(src);
  if (!upgraded) {
    return (
      <div className="w-9 h-9 rounded border border-slate-200 bg-slate-100 flex items-center justify-center shrink-0">
        <Package className="w-4 h-4 text-slate-400" />
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={upgraded}
      alt={alt}
      loading="lazy"
      className="w-9 h-9 rounded border border-slate-200 object-cover bg-white shrink-0"
    />
  );
}

export function PortfolioIntelligenceSection({
  topByRevenue,
  topByProfit,
  decliningProducts,
}: PortfolioIntelligenceSectionProps) {
  const [rankingMode, setRankingMode] = useState<"revenue" | "profit">("revenue");
  const topList = rankingMode === "revenue" ? topByRevenue : topByProfit;

  return (
    <section
      aria-label="Inteligência de Portfólio"
      className="grid grid-cols-1 xl:grid-cols-2 gap-4"
    >
      {/* 1. TOP Produtos (Curva A) */}
      <div className="bg-white border border-[#E2E8F0] rounded shadow-2xs flex flex-col overflow-hidden">
        <div className="px-4 py-3 border-b border-[#E2E8F0] bg-[#F8FAFC] flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Trophy className="w-4 h-4 text-amber-500" />
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                TOP Produtos (Curva A)
              </h2>
              <p className="text-[10px] text-slate-500">
                Campeões de venda com margem real, estoque e giro diário
              </p>
            </div>
          </div>

          <div className="inline-flex items-center bg-white border border-[#E2E8F0] rounded p-0.5">
            <button
              type="button"
              onClick={() => setRankingMode("revenue")}
              className={`px-2 py-1 rounded text-[10px] font-semibold transition-colors ${
                rankingMode === "revenue"
                  ? "bg-[#0F172A] text-white"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Por Receita
            </button>
            <button
              type="button"
              onClick={() => setRankingMode("profit")}
              className={`px-2 py-1 rounded text-[10px] font-semibold transition-colors ${
                rankingMode === "profit"
                  ? "bg-emerald-700 text-white"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Por Lucro
            </button>
          </div>
        </div>

        <div className="divide-y divide-slate-100 flex-1">
          {topList.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400">
              Nenhuma venda válida registrada neste período.
            </div>
          ) : (
            topList.map((item, idx) => {
              const lowStock =
                item.daysOfStock !== null && item.daysOfStock < 7;
              return (
                <div
                  key={item.mlbId}
                  className="px-3.5 py-2.5 flex items-center gap-3 hover:bg-[#F8FAFC] transition-colors"
                >
                  <span className="w-5 text-[11px] font-mono font-bold text-slate-400 text-center shrink-0">
                    {idx + 1}º
                  </span>

                  <ProductThumb src={item.thumbnail} alt={item.title} />

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p
                        className="text-xs font-semibold text-slate-900 truncate"
                        title={item.title}
                      >
                        {item.title}
                      </p>
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] font-mono text-slate-500">
                      <span>{item.sku || item.mlbId}</span>
                      <span>•</span>
                      <span>
                        <strong className="text-slate-700">{item.unitsSold}</strong> un ({item.dailyVelocity.toFixed(1).replace(".", ",")}/dia)
                      </span>
                      {item.availableQuantity !== null && (
                        <>
                          <span>•</span>
                          <span
                            className={
                              lowStock ? "text-rose-600 font-bold" : "text-slate-600"
                            }
                          >
                            Est: {item.availableQuantity}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="text-right shrink-0 font-mono tabular-nums">
                    <div className="text-xs font-black text-slate-900">
                      {rankingMode === "revenue"
                        ? formatBRL(item.grossSales)
                        : formatBRL(item.netProfit)}
                    </div>
                    <div className="mt-0.5 flex items-center justify-end gap-1">
                      <span
                        className={`text-[10px] font-bold px-1 py-0.2 rounded border ${
                          item.marginPct >= 15
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : item.marginPct >= 10
                            ? "bg-amber-50 text-amber-800 border-amber-200"
                            : "bg-rose-50 text-rose-700 border-rose-200"
                        }`}
                      >
                        {formatPct(item.marginPct)}
                      </span>
                      {item.revenueDeltaPct !== null && (
                        <span
                          className={`text-[10px] font-semibold inline-flex items-center ${
                            item.revenueDeltaPct >= 0
                              ? "text-emerald-600"
                              : "text-rose-600"
                          }`}
                        >
                          {item.revenueDeltaPct >= 0 ? (
                            <ArrowUpRight className="w-2.5 h-2.5" />
                          ) : (
                            <ArrowDownRight className="w-2.5 h-2.5" />
                          )}
                          {Math.abs(item.revenueDeltaPct).toFixed(0)}%
                        </span>
                      )}
                    </div>
                  </div>

                  {item.permalink ? (
                    <a
                      href={item.permalink}
                      target="_blank"
                      rel="noreferrer"
                      className="p-1.5 rounded border border-slate-200 text-slate-400 hover:text-sky-600 hover:border-sky-300 transition-colors shrink-0"
                      title="Abrir anúncio no Mercado Livre"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  ) : (
                    <Link
                      href="/catalogo"
                      className="p-1.5 rounded border border-slate-200 text-slate-400 hover:text-sky-600 hover:border-sky-300 transition-colors shrink-0"
                      title="Ver no Catálogo"
                    >
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </Link>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* 2. Produtos em Queda de Venda (Alerta de Desaceleração) */}
      <div className="bg-white border border-[#E2E8F0] rounded shadow-2xs flex flex-col overflow-hidden">
        <div className="px-4 py-3 border-b border-[#E2E8F0] bg-[#F8FAFC] flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <TrendingDown className="w-4 h-4 text-rose-600" />
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                Produtos em Queda de Venda
              </h2>
              <p className="text-[10px] text-slate-500">
                Maior retração vs. período anterior com diagnóstico automático
              </p>
            </div>
          </div>

          <Link
            href="/inteligencia"
            className="text-[10px] font-semibold text-sky-700 hover:text-sky-800 inline-flex items-center gap-0.5"
          >
            <span>Radar BuyBox</span>
            <ArrowUpRight className="w-3 h-3" />
          </Link>
        </div>

        <div className="divide-y divide-slate-100 flex-1">
          {decliningProducts.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400">
              Nenhum produto apresentou retração relevante em relação ao período anterior.
            </div>
          ) : (
            decliningProducts.map((item) => {
              const diagClass =
                item.diagnosisTone === "danger"
                  ? "bg-rose-50 text-rose-700 border-rose-200"
                  : item.diagnosisTone === "warning"
                  ? "bg-amber-50 text-amber-800 border-amber-200"
                  : "bg-slate-100 text-slate-600 border-slate-200";

              return (
                <div
                  key={item.mlbId}
                  className="px-3.5 py-2.5 flex items-center gap-3 hover:bg-[#F8FAFC] transition-colors"
                >
                  <ProductThumb src={item.thumbnail} alt={item.title} />

                  <div className="min-w-0 flex-1">
                    <p
                      className="text-xs font-semibold text-slate-900 truncate"
                      title={item.title}
                    >
                      {item.title}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <span className="text-[10px] font-mono text-slate-500">
                        {item.sku || item.mlbId}
                      </span>
                      {item.diagnosis && (
                        <span
                          className={`text-[10px] font-semibold px-1.5 py-0.2 rounded border ${diagClass}`}
                        >
                          {item.diagnosis}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="text-right shrink-0 font-mono tabular-nums">
                    <div className="inline-flex items-center gap-0.5 text-xs font-black text-rose-600">
                      <ArrowDownRight className="w-3.5 h-3.5" />
                      {item.unitsDeltaPct !== null
                        ? `${item.unitsDeltaPct.toFixed(0)}%`
                        : "—"}
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5">
                      {item.prevUnitsSold} → <strong className="text-slate-800">{item.unitsSold}</strong> un
                    </div>
                  </div>

                  <Link
                    href="/inteligencia"
                    className="p-1.5 rounded border border-slate-200 text-slate-400 hover:text-sky-600 hover:border-sky-300 transition-colors shrink-0"
                    title="Investigar competitividade no Radar"
                  >
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              );
            })
          )}
        </div>
      </div>
    </section>
  );
}
