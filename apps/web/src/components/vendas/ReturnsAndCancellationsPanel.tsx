"use client";

import React, { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDownUp,
  Ban,
  CheckCircle2,
  Download,
  ExternalLink,
  Filter,
  PackageX,
  RotateCcw,
  TrendingDown,
  X,
} from "lucide-react";
import type {
  MlProductReturnRankingRow,
  MlReturnsAnalyticsSummary,
  ProductCostTemplate,
  SalesAnalysisMode,
  Seller,
} from "@/types/ml-sales";
import {
  exportDetailedOrdersToCsv,
  exportReturnsRankingToCsv,
  formatBRL,
  formatPct,
} from "./formatters";
import { DailySalesTable } from "./DailySalesTable";
import { ProductThumbnailPreview } from "./ProductThumbnailPreview";

type LossScopeFilter = "all_losses" | "returned" | "cancelled_only";
type RankingSortKey = "occurrences" | "loss_rate" | "gross_lost" | "returns_only";

interface ReturnsAndCancellationsPanelProps {
  analytics: MlReturnsAnalyticsSummary;
  sellers: Seller[];
  templates: ProductCostTemplate[];
  analysisMode: SalesAnalysisMode;
  from: string;
  to: string;
  onSwitchToOrderDateMode?: () => void;
  onRefresh: () => void;
}

export function ReturnsAndCancellationsPanel({
  analytics,
  sellers,
  templates,
  analysisMode,
  from,
  to,
  onSwitchToOrderDateMode,
  onRefresh,
}: ReturnsAndCancellationsPanelProps) {
  const [lossScope, setLossScope] = useState<LossScopeFilter>("all_losses");
  const [sortBy, setSortBy] = useState<RankingSortKey>("occurrences");
  const [selectedMlbFilter, setSelectedMlbFilter] = useState<string | null>(null);

  const filteredRanking = useMemo(() => {
    const base = analytics.product_ranking.filter((row) => {
      if (lossScope === "returned") return row.returned_orders_count > 0;
      if (lossScope === "cancelled_only") return row.cancelled_orders_count > 0;
      return row.affected_orders_count > 0;
    });

    const copy = [...base];
    copy.sort((a, b) => {
      if (sortBy === "loss_rate") {
        const rateA =
          lossScope === "returned"
            ? a.return_rate_pct
            : lossScope === "cancelled_only"
            ? a.cancel_rate_pct
            : a.loss_rate_pct;
        const rateB =
          lossScope === "returned"
            ? b.return_rate_pct
            : lossScope === "cancelled_only"
            ? b.cancel_rate_pct
            : b.loss_rate_pct;
        return rateB - rateA || b.affected_orders_count - a.affected_orders_count;
      }
      if (sortBy === "gross_lost") {
        const valA =
          lossScope === "returned"
            ? a.gross_returned_amount
            : lossScope === "cancelled_only"
            ? a.gross_cancelled_amount
            : a.gross_affected_amount;
        const valB =
          lossScope === "returned"
            ? b.gross_returned_amount
            : lossScope === "cancelled_only"
            ? b.gross_cancelled_amount
            : b.gross_affected_amount;
        return valB - valA || b.affected_orders_count - a.affected_orders_count;
      }
      if (sortBy === "returns_only") {
        return (
          b.returned_orders_count - a.returned_orders_count ||
          b.return_rate_pct - a.return_rate_pct
        );
      }
      const countA =
        lossScope === "returned"
          ? a.returned_orders_count
          : lossScope === "cancelled_only"
          ? a.cancelled_orders_count
          : a.affected_orders_count;
      const countB =
        lossScope === "returned"
          ? b.returned_orders_count
          : lossScope === "cancelled_only"
          ? b.cancelled_orders_count
          : b.affected_orders_count;
      return countB - countA || b.gross_affected_amount - a.gross_affected_amount;
    });

    return copy;
  }, [analytics.product_ranking, lossScope, sortBy]);

  const filteredAffectedOrders = useMemo(() => {
    return analytics.affected_orders.filter((o) => {
      if (lossScope === "returned" && o.status !== "returned") return false;
      if (lossScope === "cancelled_only" && o.status !== "cancelled") return false;
      if (
        selectedMlbFilter &&
        o.mlb_id.toUpperCase() !== selectedMlbFilter.toUpperCase()
      ) {
        return false;
      }
      return true;
    });
  }, [analytics.affected_orders, lossScope, selectedMlbFilter]);

  const topProduct: MlProductReturnRankingRow | null =
    filteredRanking[0] ?? analytics.product_ranking[0] ?? null;
  const topReason = analytics.reasons_breakdown[0] ?? null;

  return (
    <div className="space-y-4">
      {/* Aviso Contextual no Modo Dia do Envio */}
      {analysisMode === "shipping_date" && (
        <div className="p-3 rounded-xs bg-amber-50 border border-amber-300 text-amber-950 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
            <span>
              Você está no modo <strong>Por Dia do Envio</strong>: aparecem aqui as{" "}
              <strong>Devoluções Pós-Envio</strong> e cancelamentos que chegaram a ter envio registrado.
              Para incluir vendas canceladas <em>antes</em> da postagem, alterne para Data da Venda.
            </span>
          </div>
          {onSwitchToOrderDateMode && (
            <button
              type="button"
              onClick={onSwitchToOrderDateMode}
              className="px-2.5 py-1 rounded-xs bg-amber-900 hover:bg-amber-950 text-white text-[11px] font-bold transition-colors shrink-0 cursor-pointer"
            >
              Ver por Data da Venda
            </button>
          )}
        </div>
      )}

      {/* Barra de Escopo da Análise + Exportação */}
      <div className="bg-white border border-[#E2E8F0] rounded p-3 shadow-2xs flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-bold text-slate-600 mr-1 inline-flex items-center gap-1">
            <Filter className="w-3.5 h-3.5 text-rose-600" />
            Escopo da Análise:
          </span>

          <button
            type="button"
            onClick={() => setLossScope("all_losses")}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xs text-[11px] font-bold border transition-colors cursor-pointer ${
              lossScope === "all_losses"
                ? "bg-slate-900 text-white border-slate-900"
                : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
            }`}
          >
            <span>Todos (Devoluções + Cancelamentos)</span>
            <span
              className={`px-1.5 py-0.2 rounded-xs font-mono text-[10px] ${
                lossScope === "all_losses"
                  ? "bg-white/20 text-white"
                  : "bg-slate-200 text-slate-800"
              }`}
            >
              {analytics.total_affected_count}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setLossScope("returned")}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xs text-[11px] font-bold border transition-colors cursor-pointer ${
              lossScope === "returned"
                ? "bg-rose-700 text-white border-rose-800"
                : "bg-rose-50/70 text-rose-900 border-rose-200 hover:bg-rose-100/80"
            }`}
          >
            <RotateCcw className="w-3 h-3" />
            <span>Só Devoluções (Pós-Envio)</span>
            <span
              className={`px-1.5 py-0.2 rounded-xs font-mono text-[10px] ${
                lossScope === "returned"
                  ? "bg-black/25 text-white"
                  : "bg-rose-200/80 text-rose-950"
              }`}
            >
              {analytics.returned_orders_count}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setLossScope("cancelled_only")}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xs text-[11px] font-bold border transition-colors cursor-pointer ${
              lossScope === "cancelled_only"
                ? "bg-amber-700 text-white border-amber-800"
                : "bg-amber-50/70 text-amber-950 border-amber-200 hover:bg-amber-100/80"
            }`}
          >
            <Ban className="w-3 h-3" />
            <span>Só Cancelamentos</span>
            <span
              className={`px-1.5 py-0.2 rounded-xs font-mono text-[10px] ${
                lossScope === "cancelled_only"
                  ? "bg-black/25 text-white"
                  : "bg-amber-200/80 text-amber-950"
              }`}
            >
              {analytics.cancelled_orders_count}
            </span>
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {filteredRanking.length > 0 && (
            <button
              type="button"
              onClick={() =>
                exportReturnsRankingToCsv({
                  rows: filteredRanking,
                  from,
                  to,
                  analysisMode,
                })
              }
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xs border border-slate-300 bg-white hover:bg-slate-50 text-[11px] font-semibold text-slate-800 cursor-pointer"
            >
              <Download className="w-3 h-3 text-rose-700" />
              Exportar Ranking por MLB (CSV)
            </button>
          )}

          {filteredAffectedOrders.length > 0 && (
            <button
              type="button"
              onClick={() =>
                exportDetailedOrdersToCsv({
                  orders: filteredAffectedOrders,
                  sellers,
                  from,
                  to,
                  analysisMode,
                })
              }
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xs border border-slate-300 bg-white hover:bg-slate-50 text-[11px] font-semibold text-slate-700 cursor-pointer"
            >
              <Download className="w-3 h-3 text-emerald-700" />
              Exportar Pedidos Afetados (CSV)
            </button>
          )}
        </div>
      </div>

      {/* 4 KPIs Executivos de Devoluções & Cancelamentos */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        {/* Card 1: Taxa Combinada sobre o Total do Período */}
        <div className="bg-slate-900 text-white border border-slate-800 rounded p-3.5 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-300">
              1. Taxa Geral de Perda
            </span>
            <TrendingDown className="w-4 h-4 text-rose-400" />
          </div>
          <div className="mt-2">
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-black font-mono tabular-nums text-white">
                {formatPct(analytics.combined_loss_rate_pct)}
              </span>
              <span className="text-[11px] font-mono text-rose-300 font-semibold">
                {formatBRL(analytics.gross_total_affected_amount)} estornados
              </span>
            </div>
            <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-300 font-mono">
              <span>
                <strong className="text-white">{analytics.total_affected_count}</strong> de{" "}
                {analytics.total_period_orders} pedidos
              </span>
              <span className="text-emerald-300">
                {analytics.valid_orders_count} válidos
              </span>
            </div>
          </div>
        </div>

        {/* Card 2: Devoluções Pós-Envio */}
        <div className="bg-white border border-rose-200 rounded p-3.5 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-rose-800">
              2. Devoluções (Pós-Envio)
            </span>
            <RotateCcw className="w-4 h-4 text-rose-600" />
          </div>
          <div className="mt-2">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-xl font-black font-mono tabular-nums text-rose-700">
                {formatBRL(analytics.gross_returned_amount)}
              </span>
              <span className="px-1.5 py-0.5 rounded-xs bg-rose-50 border border-rose-200 text-rose-800 font-mono text-[10px] font-bold">
                {analytics.returned_orders_count} dev. ({formatPct(analytics.return_rate_pct)})
              </span>
            </div>
            <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-500">
              <span>Pedidos enviados que retornaram</span>
              {analytics.retained_operational_cost_total > 0 && (
                <span
                  className="font-mono font-semibold text-rose-700"
                  title="Soma de custos operacionais internos cadastrados nos pedidos devolvidos"
                >
                  Custo op.: {formatBRL(analytics.retained_operational_cost_total)}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Card 3: Cancelamentos */}
        <div className="bg-white border border-amber-200 rounded p-3.5 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-amber-900">
              3. Cancelamentos ML
            </span>
            <Ban className="w-4 h-4 text-amber-600" />
          </div>
          <div className="mt-2">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-xl font-black font-mono tabular-nums text-slate-900">
                {formatBRL(analytics.gross_cancelled_amount)}
              </span>
              <span className="px-1.5 py-0.5 rounded-xs bg-amber-50 border border-amber-200 text-amber-900 font-mono text-[10px] font-bold">
                {analytics.cancelled_orders_count} canc. ({formatPct(analytics.cancel_rate_pct)})
              </span>
            </div>
            <div className="mt-1.5 text-[11px] text-slate-500">
              Vendas canceladas antes da conclusão da entrega
            </div>
          </div>
        </div>

        {/* Card 4: Produto Campeão de Ocorrências & Motivo Principal */}
        <div className="bg-white border border-[#E2E8F0] rounded p-3.5 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              4. Foco de Atenção (Top MLB)
            </span>
            <PackageX className="w-4 h-4 text-slate-700" />
          </div>
          {topProduct ? (
            <div className="mt-1.5 space-y-1">
              <div
                className="text-xs font-bold text-slate-900 truncate"
                title={topProduct.product_title}
              >
                {topProduct.product_title}
              </div>
              <div className="flex items-center justify-between text-[10px] font-mono">
                <span className="px-1.5 py-0.5 rounded-xs bg-slate-100 text-slate-800 font-bold">
                  {topProduct.mlb_id}
                </span>
                <span className="text-rose-700 font-bold">
                  {topProduct.affected_orders_count}/{topProduct.total_orders_count} ped. (
                  {formatPct(topProduct.loss_rate_pct)})
                </span>
              </div>
              {topReason && (
                <div
                  className="text-[10px] text-slate-500 truncate pt-0.5 border-t border-slate-100"
                  title={topReason.reason}
                >
                  Motivo #1: <strong className="text-slate-700">{topReason.reason}</strong> (
                  {topReason.count}x)
                </div>
              )}
            </div>
          ) : (
            <div className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>Zero devoluções ou cancelamentos!</span>
            </div>
          )}
        </div>
      </div>

      {/* Estado Vazio */}
      {analytics.total_affected_count === 0 ? (
        <div className="bg-white border border-[#E2E8F0] rounded p-10 text-center space-y-2">
          <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto" />
          <div className="text-sm font-bold text-slate-900">
            Nenhuma devolução ou cancelamento registrado neste filtro!
          </div>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Todos os {analytics.total_period_orders} pedidos apurados no período selecionado
            estão válidos. Amplie o período (ex: <strong>Este Mês</strong>,{" "}
            <strong>Este Ano</strong> ou <strong>Todas as Vendas</strong>) para analisar o
            histórico de incidência por anúncio.
          </p>
        </div>
      ) : (
        <>
          {/* Ranking de Produtos (MLB / SKU) com % sobre Vendas do Item */}
          <div className="bg-white border border-[#E2E8F0] rounded shadow-2xs overflow-hidden">
            <div className="px-3.5 py-2.5 bg-slate-50 border-b border-[#E2E8F0] flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-xs font-black uppercase tracking-wider text-slate-900">
                  Ranking de Produtos (MLB / SKU) — Incidência sobre Vendas do Item
                </h2>
                <p className="text-[11px] text-slate-500">
                  Compara devoluções e cancelamentos contra o volume total de pedidos de cada
                  anúncio no período selecionado ({filteredRanking.length}{" "}
                  {filteredRanking.length === 1 ? "anúncio afetado" : "anúncios afetados"}).
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                <ArrowDownUp className="w-3.5 h-3.5 text-slate-400" />
                <span className="font-bold text-slate-600">Ordenar:</span>
                {(
                  [
                    { id: "occurrences", label: "Mais Ocorrências" },
                    { id: "returns_only", label: "Mais Devoluções" },
                    { id: "loss_rate", label: "Maior % no Item" },
                    { id: "gross_lost", label: "Maior Valor (R$)" },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setSortBy(opt.id)}
                    className={`px-2 py-1 rounded-xs font-bold border transition-colors cursor-pointer ${
                      sortBy === opt.id
                        ? "bg-slate-900 text-white border-slate-900"
                        : "bg-white text-slate-700 border-slate-200 hover:bg-slate-100"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs min-w-[1120px]">
                <thead>
                  <tr className="bg-slate-900 text-slate-200 border-b border-slate-800 uppercase text-[10px] font-bold tracking-wider">
                    <th className="py-2.5 px-2.5 w-10 text-center">#</th>
                    <th className="py-2.5 px-2.5 min-w-[320px]">Anúncio / MLB / SKU</th>
                    <th className="py-2.5 px-2.5 text-center">Pedidos do Item</th>
                    <th className="py-2.5 px-2.5 text-center bg-rose-950/70 text-rose-200">
                      Devoluções
                    </th>
                    <th className="py-2.5 px-2.5 text-center">Cancelamentos</th>
                    <th className="py-2.5 px-2.5 min-w-[175px]">% sobre Vendas do Item</th>
                    <th className="py-2.5 px-2.5 text-right">Valor Bruto Perdido</th>
                    <th className="py-2.5 px-2.5 min-w-[210px]">Principal Motivo ML</th>
                    <th className="py-2.5 px-2.5 text-center">Inspecionar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredRanking.map((row, index) => {
                    const isMlbActive = selectedMlbFilter === row.mlb_id;
                    const activeRate =
                      lossScope === "returned"
                        ? row.return_rate_pct
                        : lossScope === "cancelled_only"
                        ? row.cancel_rate_pct
                        : row.loss_rate_pct;
                    const activeGross =
                      lossScope === "returned"
                        ? row.gross_returned_amount
                        : lossScope === "cancelled_only"
                        ? row.gross_cancelled_amount
                        : row.gross_affected_amount;

                    const severityBadge =
                      activeRate >= 20
                        ? "bg-rose-100 text-rose-900 border-rose-300"
                        : activeRate >= 8
                        ? "bg-amber-100 text-amber-900 border-amber-300"
                        : "bg-slate-100 text-slate-700 border-slate-200";

                    const barColor =
                      activeRate >= 20
                        ? "bg-rose-600"
                        : activeRate >= 8
                        ? "bg-amber-500"
                        : "bg-sky-600";

                    return (
                      <tr
                        key={row.mlb_id}
                        className={`transition-colors ${
                          isMlbActive
                            ? "bg-rose-50/70 hover:bg-rose-50"
                            : "hover:bg-slate-50/90"
                        }`}
                      >
                        <td className="py-2.5 px-2.5 text-center font-mono font-black text-slate-500">
                          {index + 1}º
                        </td>

                        <td className="py-2.5 px-2.5">
                          <div className="flex items-start gap-2.5">
                            <ProductThumbnailPreview
                              thumbnailUrl={row.product_thumbnail}
                              title={row.product_title}
                              permalink={row.permalink}
                              sizeClassName="w-12 h-12"
                            />
                            <div className="min-w-0 flex-1">
                              <div
                                className="font-semibold text-slate-900 leading-snug line-clamp-2"
                                title={row.product_title}
                              >
                                {row.product_title}
                              </div>
                              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] font-mono">
                                {row.permalink ? (
                                  <a
                                    href={row.permalink}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded-xs bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold"
                                  >
                                    {row.mlb_id}
                                    <ExternalLink className="w-2.5 h-2.5" />
                                  </a>
                                ) : (
                                  <span className="px-1.5 py-0.2 rounded-xs bg-slate-100 text-slate-700 font-bold">
                                    {row.mlb_id}
                                  </span>
                                )}
                                {row.sku && (
                                  <span className="px-1.5 py-0.2 rounded-xs bg-slate-50 border border-slate-200 text-slate-600">
                                    SKU: {row.sku}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>

                        <td className="py-2.5 px-2.5 text-center font-mono tabular-nums">
                          <div className="font-bold text-slate-900">
                            {row.total_orders_count} ped.
                          </div>
                          <div className="text-[10px] text-emerald-700 font-semibold">
                            {row.valid_orders_count} válidos ({row.total_units} un.)
                          </div>
                        </td>

                        <td className="py-2.5 px-2.5 text-center font-mono tabular-nums bg-rose-50/35">
                          {row.returned_orders_count > 0 ? (
                            <div>
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-xs bg-rose-100 text-rose-900 border border-rose-200 font-bold text-[11px]">
                                {row.returned_orders_count} dev.
                              </span>
                              <div className="text-[10px] text-rose-700 font-semibold mt-0.5">
                                {formatPct(row.return_rate_pct)}
                              </div>
                            </div>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>

                        <td className="py-2.5 px-2.5 text-center font-mono tabular-nums">
                          {row.cancelled_orders_count > 0 ? (
                            <div>
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-xs bg-amber-50 text-amber-900 border border-amber-200 font-bold text-[11px]">
                                {row.cancelled_orders_count} canc.
                              </span>
                              <div className="text-[10px] text-amber-800 font-semibold mt-0.5">
                                {formatPct(row.cancel_rate_pct)}
                              </div>
                            </div>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>

                        <td className="py-2.5 px-2.5 font-mono tabular-nums">
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <span
                              className={`px-1.5 py-0.5 rounded-xs border text-[11px] font-black ${severityBadge}`}
                            >
                              {formatPct(activeRate)}
                            </span>
                            <span className="text-[10px] text-slate-500">
                              {row.affected_orders_count} de {row.total_orders_count}
                            </span>
                          </div>
                          <div className="w-full h-1.5 rounded-xs bg-slate-100 overflow-hidden">
                            <div
                              className={`h-full ${barColor}`}
                              style={{ width: `${Math.min(100, Math.max(4, activeRate))}%` }}
                            />
                          </div>
                        </td>

                        <td className="py-2.5 px-2.5 text-right font-mono tabular-nums whitespace-nowrap">
                          <div className="font-black text-rose-700 text-xs">
                            {formatBRL(activeGross)}
                          </div>
                          {row.retained_operational_cost > 0 && (
                            <div
                              className="text-[10px] text-slate-500"
                              title="Custos internos registrados nos pedidos devolvidos deste MLB"
                            >
                              Custo op.: {formatBRL(row.retained_operational_cost)}
                            </div>
                          )}
                        </td>

                        <td className="py-2.5 px-2.5">
                          <div
                            className="text-[11px] text-slate-700 font-medium line-clamp-2"
                            title={row.top_reason || ""}
                          >
                            {row.top_reason || "—"}
                          </div>
                          {row.reasons.length > 1 && (
                            <div className="text-[10px] text-slate-400 mt-0.5">
                              +{row.reasons.length - 1} outro(s) motivo(s)
                            </div>
                          )}
                        </td>

                        <td className="py-2.5 px-2.5 text-center whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() =>
                              setSelectedMlbFilter(isMlbActive ? null : row.mlb_id)
                            }
                            className={`px-2.5 py-1 rounded-xs text-[11px] font-bold border transition-colors cursor-pointer ${
                              isMlbActive
                                ? "bg-rose-700 text-white border-rose-800"
                                : "bg-white hover:bg-slate-50 text-slate-800 border-slate-300"
                            }`}
                          >
                            {isMlbActive ? "Mostrando" : "Ver Pedidos"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Painel Duplo: Motivos ML & Distribuição por Vendedor */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {/* Motivos do ML */}
            <div className="bg-white border border-[#E2E8F0] rounded p-3.5 shadow-2xs space-y-2.5">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-800">
                  Motivos Reportados pelo Mercado Livre
                </h3>
                <span className="text-[10px] font-mono text-slate-500">
                  {analytics.reasons_breakdown.length} motivo(s)
                </span>
              </div>
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {analytics.reasons_breakdown.map((r) => (
                  <div
                    key={r.reason}
                    className="p-2 rounded-xs bg-slate-50 border border-slate-100 flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-slate-800 truncate" title={r.reason}>
                        {r.reason}
                      </div>
                      <div className="text-[10px] font-mono text-slate-500 mt-0.5">
                        {r.returned_count > 0 && (
                          <span className="text-rose-700 font-semibold mr-2">
                            {r.returned_count} dev.
                          </span>
                        )}
                        {r.cancelled_count > 0 && (
                          <span className="text-amber-800 font-semibold">
                            {r.cancelled_count} canc.
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right font-mono tabular-nums shrink-0">
                      <div className="font-bold text-slate-900">
                        {r.count}x ({formatPct(r.share_pct)})
                      </div>
                      <div className="text-[10px] text-rose-700 font-semibold">
                        {formatBRL(r.gross_amount)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Impacto por Vendedor */}
            <div className="bg-white border border-[#E2E8F0] rounded p-3.5 shadow-2xs space-y-2.5">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-800">
                  Incidência por Vendedor / Operação
                </h3>
                <span className="text-[10px] font-mono text-slate-500">
                  Taxa sobre pedidos do vendedor
                </span>
              </div>
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {analytics.seller_losses.map((s) => (
                  <div
                    key={s.seller_id}
                    className="p-2 rounded-xs bg-slate-50 border border-slate-100 flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-2.5 h-2.5 rounded-xs shrink-0"
                        style={{ backgroundColor: s.color_hex }}
                      />
                      <div className="min-w-0">
                        <div className="font-bold text-slate-900 truncate">
                          {s.seller_name}
                        </div>
                        <div className="text-[10px] font-mono text-slate-500">
                          {s.returned_count} dev. · {s.cancelled_count} canc. de{" "}
                          {s.total_orders_count} pedidos
                        </div>
                      </div>
                    </div>
                    <div className="text-right font-mono tabular-nums shrink-0">
                      <div className="font-bold text-rose-700">
                        {formatPct(s.loss_rate_pct)}
                      </div>
                      <div className="text-[10px] text-slate-600 font-semibold">
                        {formatBRL(s.gross_affected_amount)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Listagem Detalhada dos Pedidos Devolvidos / Cancelados */}
          <div className="space-y-2 pt-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-900">
                  Pedidos Afetados Detalhados ({filteredAffectedOrders.length})
                </h3>
                {selectedMlbFilter && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-xs bg-rose-100 border border-rose-300 text-rose-950 text-[11px] font-mono font-bold">
                    <span>Filtrando MLB: {selectedMlbFilter}</span>
                    <button
                      type="button"
                      onClick={() => setSelectedMlbFilter(null)}
                      className="p-0.5 rounded-xs hover:bg-rose-200 text-rose-800 cursor-pointer"
                      title="Remover filtro de MLB"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )}
              </div>
              <span className="text-[11px] text-slate-500">
                Inspecione comprador, código da venda ML, motivo exato e custos internos de cada ocorrência.
              </span>
            </div>

            <DailySalesTable
              orders={filteredAffectedOrders}
              sellers={sellers}
              templates={templates}
              analysisMode={analysisMode}
              emptyTitle="Nenhum pedido para o sub-filtro selecionado"
              emptyDescription="Altere o escopo acima (Todos, Só Devoluções ou Só Cancelamentos) ou limpe o filtro de MLB."
              onRefresh={onRefresh}
            />
          </div>
        </>
      )}
    </div>
  );
}
