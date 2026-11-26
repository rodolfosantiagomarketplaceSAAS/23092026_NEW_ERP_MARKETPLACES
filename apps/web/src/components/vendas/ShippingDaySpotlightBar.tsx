"use client";

import React, { useMemo } from "react";
import {
  ArrowDown,
  CalendarCheck2,
  CheckCircle2,
  RotateCcw,
  Sparkles,
  Truck,
  Wallet,
} from "lucide-react";
import type { DailyClosingRow, SalesAnalysisMode, Seller } from "@/types/ml-sales";
import { formatBRL } from "./formatters";

interface ShippingDaySpotlightBarProps {
  dailyClosing: DailyClosingRow[];
  sellers: Seller[];
  analysisMode: SalesAnalysisMode;
  selectedDayKey: string | null;
  onSelectDayKey: (dayKey: string | null) => void;
  filteredDayOrdersCount?: number;
  totalPeriodOrdersCount?: number;
  onScrollToProducts?: () => void;
}

/**
 * Faixa interativa que permite selecionar qualquer dia específico para:
 * 1) Consultar imediatamente Faturamento Bruto, Repasse Pós-ML, Lucro Limpo e divisão por vendedor.
 * 2) Filtrar instantaneamente a tabela inferior para exibir SOMENTE os produtos daquele dia selecionado,
 *    preservando todos os botões dos demais dias visíveis para navegação rápida em 1 clique.
 */
export function ShippingDaySpotlightBar({
  dailyClosing,
  sellers,
  analysisMode,
  selectedDayKey,
  onSelectDayKey,
  filteredDayOrdersCount,
  totalPeriodOrdersCount,
  onScrollToProducts,
}: ShippingDaySpotlightBarProps) {
  const isShippingMode = analysisMode === "shipping_date";

  const activeDayRow = useMemo(() => {
    if (!selectedDayKey) return null;
    return dailyClosing.find((r) => r.date_key === selectedDayKey) ?? null;
  }, [dailyClosing, selectedDayKey]);

  const activeDayLabel = useMemo(() => {
    if (activeDayRow) return activeDayRow.date_label;
    if (!selectedDayKey || selectedDayKey.length < 10) return "";
    const [y, m, d] = selectedDayKey.split("-");
    return `${d}/${m}/${y}`;
  }, [activeDayRow, selectedDayKey]);

  const activeDayBaseTransfer = useMemo(() => {
    if (!activeDayRow) return 0;
    if (typeof activeDayRow.effective_transfer_total === "number") {
      return activeDayRow.effective_transfer_total;
    }
    const sellerSum = Object.values(activeDayRow.seller_transfers).reduce(
      (sum, v) => sum + Number(v || 0),
      0
    );
    return sellerSum + Number(activeDayRow.unassigned_transfer_total || 0);
  }, [activeDayRow]);

  const sellerBreakdown = useMemo(() => {
    if (!activeDayRow) return [];
    return sellers
      .map((s) => ({
        seller: s,
        amount: activeDayRow.seller_transfers[s.id] ?? 0,
      }))
      .filter((entry) => entry.amount > 0);
  }, [activeDayRow, sellers]);

  if (dailyClosing.length === 0 && !selectedDayKey) {
    return null;
  }

  return (
    <div className="bg-white border border-emerald-300/90 rounded-xs p-3 shadow-2xs space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-xs bg-emerald-950 text-emerald-200 text-[10px] font-bold uppercase tracking-wider">
            <Truck className="w-3 h-3 text-emerald-400" />
            {isShippingMode
              ? "Valor Obtido por Data de Envio"
              : "Valor Obtido por Data da Venda"}
          </span>
          <span className="text-[11px] text-slate-600">
            Clique em qualquer dia abaixo para <strong>exibir na tabela somente os produtos daquela data</strong> (clique novamente para limpar):
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <label className="text-[11px] font-bold text-slate-700">
            Consultar Dia Exato:
          </label>
          <input
            type="date"
            aria-label="Filtrar produtos e valores de uma data específica"
            value={selectedDayKey || ""}
            onChange={(e) => {
              const val = e.target.value;
              onSelectDayKey(val || null);
            }}
            className="px-2 py-1 border border-emerald-400 bg-emerald-50/40 rounded-xs text-[11px] font-mono font-bold text-slate-900 focus:outline-none focus:border-emerald-700"
          />

          {selectedDayKey && (
            <button
              type="button"
              onClick={() => onSelectDayKey(null)}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-xs border border-slate-300 bg-slate-50 hover:bg-slate-100 text-[10px] font-bold text-slate-700 cursor-pointer"
            >
              <RotateCcw className="w-2.5 h-2.5" />
              Limpar seleção
            </button>
          )}
        </div>
      </div>

      {/* Faixa horizontal de dias com envios/vendas registrados no período */}
      {dailyClosing.length > 0 && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {dailyClosing.slice(0, 90).map((day) => {
            const isSelected = selectedDayKey === day.date_key;
            const dayTransfer =
              day.effective_transfer_total ??
              Object.values(day.seller_transfers).reduce((a, b) => a + b, 0) +
                day.unassigned_transfer_total;

            return (
              <button
                key={day.date_key}
                type="button"
                onClick={() =>
                  onSelectDayKey(isSelected ? null : day.date_key)
                }
                title={
                  isSelected
                    ? `Mostrando somente os produtos de ${day.date_label}. Clique para voltar a todos os dias.`
                    : `Clique para exibir abaixo somente os ${day.valid_orders_count} pedido(s) de ${day.date_label}`
                }
                className={`shrink-0 inline-flex items-center gap-2 px-2.5 py-1.5 rounded-xs border text-[11px] font-mono transition-all cursor-pointer ${
                  isSelected
                    ? "bg-emerald-900 text-white border-emerald-950 shadow-xs ring-2 ring-emerald-500/30"
                    : "bg-slate-50 hover:bg-emerald-50/70 text-slate-800 border-slate-200 hover:border-emerald-300"
                }`}
              >
                <span className="font-bold">{day.date_label.slice(0, 5)}</span>
                <span
                  className={`px-1 py-0.2 rounded-xs text-[10px] ${
                    isSelected
                      ? "bg-emerald-800 text-emerald-100"
                      : "bg-white text-slate-600 border border-slate-200"
                  }`}
                >
                  {day.valid_orders_count} {isShippingMode ? "env." : "ped."}
                </span>
                <span
                  className={`font-black ${
                    isSelected ? "text-emerald-300" : "text-emerald-700"
                  }`}
                >
                  {formatBRL(dayTransfer)}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Card de Resultado Detalhado da Data Específica Selecionada */}
      {selectedDayKey && (
        <div className="p-3 rounded-xs bg-slate-900 text-white border border-slate-800 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <CalendarCheck2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span className="text-xs font-black tracking-tight">
                {isShippingMode
                  ? `Resultado Obtido na Data de Envio: ${activeDayLabel}`
                  : `Resultado Obtido na Data da Venda: ${activeDayLabel}`}
              </span>
              {activeDayRow ? (
                <span className="px-2 py-0.5 rounded-xs bg-emerald-950 border border-emerald-700 text-emerald-300 font-mono text-[10px] font-bold">
                  {activeDayRow.valid_orders_count}{" "}
                  {isShippingMode
                    ? activeDayRow.valid_orders_count === 1
                      ? "pedido enviado válido"
                      : "pedidos enviados válidos"
                    : activeDayRow.valid_orders_count === 1
                    ? "pedido válido"
                    : "pedidos válidos"}
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-xs bg-slate-800 text-slate-300 font-mono text-[10px]">
                  0 registros válidos nesta data
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => onScrollToProducts?.()}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xs bg-emerald-950/90 hover:bg-emerald-900 border border-emerald-700 text-emerald-200 text-[11px] font-bold transition-colors cursor-pointer"
                title="Rolar até a tabela filtrada com os produtos deste dia"
              >
                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                <span>
                  Exibindo somente {activeDayLabel}
                  {typeof filteredDayOrdersCount === "number"
                    ? ` (${filteredDayOrdersCount} na tabela)`
                    : ""}
                </span>
                <ArrowDown className="w-3 h-3 text-emerald-400" />
              </button>

              <button
                type="button"
                onClick={() => onSelectDayKey(null)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xs bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-200 text-[11px] font-bold transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                <span>
                  Mostrar período completo
                  {typeof totalPeriodOrdersCount === "number"
                    ? ` (${totalPeriodOrdersCount})`
                    : ""}
                </span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 font-mono tabular-nums">
            <div className="p-2.5 rounded-xs bg-slate-800/80 border border-slate-700">
              <div className="font-sans text-[10px] uppercase tracking-wider text-slate-400 font-bold">
                Faturamento Bruto do Dia
              </div>
              <div className="text-base font-black text-white mt-0.5">
                {formatBRL(activeDayRow?.gross_sale_total ?? 0)}
              </div>
              <div className="font-sans text-[10px] text-rose-300 mt-0.5">
                Taxas/Frete ML: -{formatBRL(activeDayRow?.net_ml_fees_and_shipping ?? 0)}
              </div>
            </div>

            <div className="p-2.5 rounded-xs bg-emerald-950/90 border border-emerald-700">
              <div className="font-sans text-[10px] uppercase tracking-wider text-emerald-300 font-bold flex items-center gap-1">
                <Wallet className="w-3 h-3" /> Valor Obtido Pós-ML (Repasse)
              </div>
              <div className="text-base font-black text-emerald-200 mt-0.5">
                {formatBRL(activeDayBaseTransfer)}
              </div>
              <div className="font-sans text-[10px] text-emerald-300/80 mt-0.5">
                Líquido deixado pelo Mercado Livre no dia
              </div>
            </div>

            <div className="p-2.5 rounded-xs bg-slate-800/80 border border-slate-700">
              <div className="font-sans text-[10px] uppercase tracking-wider text-sky-300 font-bold flex items-center gap-1">
                <Sparkles className="w-3 h-3" /> Lucro Limpo Real no Dia
              </div>
              <div
                className={`text-base font-black mt-0.5 ${
                  (activeDayRow?.net_operational_profit_total ?? 0) >= 0
                    ? "text-white"
                    : "text-rose-400"
                }`}
              >
                {formatBRL(activeDayRow?.net_operational_profit_total ?? 0)}
              </div>
              <div className="font-sans text-[10px] text-slate-400 mt-0.5">
                Custos + Imp.: -{formatBRL(activeDayRow?.operational_costs_and_tax_total ?? 0)}
              </div>
            </div>
          </div>

          {(sellerBreakdown.length > 0 ||
            (activeDayRow?.unassigned_transfer_total ?? 0) > 0) && (
            <div className="pt-2 border-t border-slate-800 flex flex-wrap items-center gap-2 text-[11px]">
              <span className="text-slate-400 font-semibold">
                Divisão por Vendedor em {activeDayLabel}:
              </span>
              {sellerBreakdown.map(({ seller, amount }) => (
                <span
                  key={seller.id}
                  className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-xs bg-slate-800 border border-slate-700 font-mono"
                >
                  <span
                    className="w-2 h-2 rounded-xs shrink-0"
                    style={{ backgroundColor: seller.color_hex }}
                  />
                  <span className="font-sans font-semibold text-slate-200">
                    {seller.name}:
                  </span>
                  <span className="font-bold text-emerald-300">
                    {formatBRL(amount)}
                  </span>
                </span>
              ))}
              {(activeDayRow?.unassigned_transfer_total ?? 0) > 0 && (
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-xs bg-amber-950/70 border border-amber-800 text-amber-200 font-mono">
                  <span className="font-sans font-semibold">Sem Vendedor:</span>
                  <span className="font-bold">
                    {formatBRL(activeDayRow?.unassigned_transfer_total ?? 0)}
                  </span>
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
