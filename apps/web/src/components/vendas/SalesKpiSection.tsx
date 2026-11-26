"use client";

import React from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  BadgeDollarSign,
  CheckCircle2,
  Clock,
  Receipt,
  Sparkles,
  Truck,
  Wallet,
} from "lucide-react";
import type {
  MlSalesSummaryKpis,
  SalesAnalysisMode,
  SellerTransferSummary,
} from "@/types/ml-sales";
import { formatBRL, formatPct } from "./formatters";
import { SellerQuickColorPopover } from "./SellerQuickColorPopover";

interface SalesKpiSectionProps {
  kpis: MlSalesSummaryKpis;
  sellerSummaries: SellerTransferSummary[];
  selectedSellerId: string;
  analysisMode?: SalesAnalysisMode;
  selectedDayLabel?: string | null;
  onSelectSeller: (sellerId: string) => void;
  onRefresh?: () => void;
}

export function SalesKpiSection({
  kpis,
  sellerSummaries,
  selectedSellerId,
  analysisMode = "order_date",
  selectedDayLabel = null,
  onSelectSeller,
  onRefresh,
}: SalesKpiSectionProps) {
  const isShippingMode = analysisMode === "shipping_date";
  const hasCotaAdjustment =
    Math.abs(kpis.seller_transfer_base_total - kpis.effective_seller_transfer_total) > 0.01;

  return (
    <div className="space-y-3">
      {/* 4 Cards Principais de Resumo Financeiro */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        {/* 1. Vendas Brutas Válidas / Enviadas */}
        <div className="bg-white border border-[#E2E8F0] rounded p-3.5 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              {selectedDayLabel
                ? isShippingMode
                  ? `1. Vendas Enviadas em ${selectedDayLabel}`
                  : `1. Vendas Brutas em ${selectedDayLabel}`
                : isShippingMode
                ? "1. Vendas Enviadas no Período"
                : "1. Vendas Brutas Válidas"}
            </span>
            {isShippingMode ? (
              <Truck className="w-4 h-4 text-emerald-700" />
            ) : (
              <BadgeDollarSign className="w-4 h-4 text-slate-700" />
            )}
          </div>
          <div className="mt-2">
            <div className="text-xl font-black text-slate-900 font-mono tabular-nums tracking-tight">
              {formatBRL(kpis.gross_valid_sales)}
            </div>
            <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-500">
              <span>
                <strong className="text-slate-800 font-mono">{kpis.valid_orders_count}</strong>{" "}
                {isShippingMode
                  ? kpis.valid_orders_count === 1
                    ? "pedido enviado válido"
                    : "pedidos enviados válidos"
                  : kpis.valid_orders_count === 1
                  ? "pedido válido"
                  : "pedidos válidos"}
              </span>
              {kpis.cancelled_orders_count > 0 && (
                <span className="px-1.5 py-0.5 rounded-xs bg-rose-50 text-rose-700 border border-rose-200 font-mono text-[10px] font-semibold">
                  {kpis.cancelled_orders_count} cancel./devolv. (R$ 0)
                </span>
              )}
            </div>
          </div>
        </div>

        {/* 2. Base de Repasse (Pós-Taxas, Frete + Estorno ML) */}
        <div className="bg-emerald-950 text-white border border-emerald-800 rounded p-3.5 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-300">
              2. Base Limpa de Repasse
            </span>
            <Wallet className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="mt-2">
            <div className="text-xl font-black text-white font-mono tabular-nums tracking-tight">
              {formatBRL(
                hasCotaAdjustment
                  ? kpis.effective_seller_transfer_total
                  : kpis.seller_transfer_base_total
              )}
            </div>
            <div className="mt-1.5 flex items-center justify-between text-[11px] text-emerald-200/90">
              <span>Pós-Taxas ML, Frete + Estornos</span>
              {hasCotaAdjustment && (
                <span className="font-mono text-[10px] px-1.5 py-0.5 rounded-xs bg-emerald-900 border border-emerald-700">
                  Base 100%: {formatBRL(kpis.seller_transfer_base_total)}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* 3. Detalhamento Taxas ML / Frete / Estornos */}
        <div className="bg-white border border-[#E2E8F0] rounded p-3.5 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              3. Taxas ML, Frete & Estornos
            </span>
            <Receipt className="w-4 h-4 text-rose-600" />
          </div>
          <div className="mt-2 space-y-1 text-[11px] font-mono tabular-nums">
            <div className="flex items-center justify-between text-slate-600">
              <span className="font-sans flex items-center gap-1">
                <ArrowDownRight className="w-3 h-3 text-rose-500" /> Comissão ML:
              </span>
              <span className="text-rose-600 font-semibold">
                -{formatBRL(kpis.ml_commission_total)}
              </span>
            </div>
            <div className="flex items-center justify-between text-slate-600">
              <span className="font-sans flex items-center gap-1">
                <ArrowDownRight className="w-3 h-3 text-rose-500" /> Frete Vendedor:
              </span>
              <span className="text-rose-600 font-semibold">
                -{formatBRL(kpis.ml_shipping_total)}
              </span>
            </div>
            <div className="flex items-center justify-between pt-1 border-t border-slate-100">
              <span className="font-sans flex items-center gap-1 text-emerald-700 font-semibold">
                <ArrowUpRight className="w-3 h-3 text-emerald-600" /> Estorno/Subsídio ML:
              </span>
              <span className="text-emerald-700 font-bold">
                +{formatBRL(kpis.ml_promo_rebate_total)}
              </span>
            </div>
          </div>
        </div>

        {/* 4. Lucro Líquido Final ("Limpo") */}
        <div className="bg-white border border-[#E2E8F0] rounded p-3.5 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              4. Lucro Líquido Real (&ldquo;Limpo&rdquo;)
            </span>
            <Sparkles className="w-4 h-4 text-sky-600" />
          </div>
          <div className="mt-2">
            <div className="flex items-baseline gap-2">
              <span
                className={`text-xl font-black font-mono tabular-nums tracking-tight ${
                  kpis.net_operational_profit_total >= 0 ? "text-slate-900" : "text-rose-700"
                }`}
              >
                {formatBRL(kpis.net_operational_profit_total)}
              </span>
              <span
                className={`text-[11px] font-mono font-bold px-1.5 py-0.5 rounded-xs border ${
                  kpis.net_margin_pct >= 15
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                    : kpis.net_margin_pct >= 0
                    ? "bg-amber-50 text-amber-800 border-amber-200"
                    : "bg-rose-50 text-rose-700 border-rose-200"
                }`}
              >
                {formatPct(kpis.net_margin_pct)} margem
              </span>
            </div>
            <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-500 font-mono">
              <span>Custos: -{formatBRL(kpis.operational_costs_total)}</span>
              <span>Imposto: -{formatBRL(kpis.tax_total)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* 5. Resumo Individual por Vendedor (Cards Lado a Lado) */}
      {sellerSummaries.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5">
          {sellerSummaries.map((s) => {
            const isSelected = selectedSellerId === s.seller_id;
            return (
              <button
                key={s.seller_id}
                type="button"
                onClick={() =>
                  onSelectSeller(isSelected ? "all" : s.seller_id)
                }
                className={`text-left bg-white rounded border p-3 transition-all hover:shadow-xs ${
                  isSelected
                    ? "border-slate-900 ring-1 ring-slate-900"
                    : "border-[#E2E8F0] hover:border-slate-300"
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2 min-w-0">
                    {onRefresh ? (
                      <SellerQuickColorPopover
                        seller={{
                          id: s.seller_id,
                          name: s.name,
                          color_hex: s.color_hex,
                        }}
                        sizeClassName="w-3 h-3"
                        onColorSaved={onRefresh}
                      />
                    ) : (
                      <span
                        className="w-2.5 h-2.5 rounded-xs shrink-0"
                        style={{ backgroundColor: s.color_hex }}
                      />
                    )}
                    <span className="text-xs font-bold text-slate-900 truncate">
                      {s.name}
                    </span>
                    {s.commission_pct < 100 && (
                      <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-xs bg-amber-50 text-amber-800 border border-amber-200 shrink-0">
                        Cota {s.commission_pct}%
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-xs bg-slate-100 text-slate-700 shrink-0">
                    {s.valid_orders_count}{" "}
                    {isShippingMode
                      ? s.valid_orders_count === 1
                        ? "envio"
                        : "envios"
                      : s.valid_orders_count === 1
                      ? "venda"
                      : "vendas"}
                  </span>
                </div>

                <div className="flex items-baseline justify-between">
                  <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
                    Total a Repassar
                  </span>
                  <span className="text-sm font-black font-mono tabular-nums text-emerald-700">
                    {formatBRL(s.effective_transfer_total)}
                  </span>
                </div>

                <div className="mt-2 pt-1.5 border-t border-slate-100 grid grid-cols-2 gap-2 text-[10px] font-mono tabular-nums">
                  <div className="flex items-center gap-1 text-emerald-700">
                    <CheckCircle2 className="w-3 h-3 shrink-0" />
                    <span className="truncate" title="Já Liberado no Mercado Pago">
                      Lib: {formatBRL(s.mp_released_amount)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 text-amber-700 justify-end">
                    <Clock className="w-3 h-3 shrink-0" />
                    <span className="truncate" title="A Liberar no Mercado Pago">
                      Pend: {formatBRL(s.mp_pending_amount)}
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
