"use client";

import React, { useMemo } from "react";
import {
  CalendarCheck2,
  Filter,
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
  onFilterTableToSingleDay: (dayKey: string) => void;
  isSingleDayFiltered: boolean;
  onRestorePreviousPeriod?: () => void;
}

/**
 * Faixa interativa que permite inspecionar imediatamente o valor obtido em um Dia Específico
 * (especialmente no modo "Por Dia do Envio"), exibindo Venda Bruta, Base de Repasse Pós-ML,
 * Lucro Limpo e divisão por vendedor daquela data exata.
 */
export function ShippingDaySpotlightBar({
  dailyClosing,
  sellers,
  analysisMode,
  selectedDayKey,
  onSelectDayKey,
  onFilterTableToSingleDay,
  isSingleDayFiltered,
  onRestorePreviousPeriod,
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

  if (!isShippingMode && !selectedDayKey) {
    return null;
  }

  return (
    <div className="bg-white border border-emerald-300/90 rounded-xs p-3 shadow-2xs space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-xs bg-emerald-950 text-emerald-200 text-[10px] font-bold uppercase tracking-wider">
            <Truck className="w-3 h-3 text-emerald-400" />
            Valor Obtido por Data de Envio
          </span>
          <span className="text-[11px] text-slate-600">
            Selecione qualquer data abaixo (ou escolha no calendário) para consultar quanto obteve nos envios daquele dia específico:
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <label className="text-[11px] font-bold text-slate-700">
            Consultar Dia Exato:
          </label>
          <input
            type="date"
            aria-label="Consultar valor obtido em uma data específica de envio"
            value={selectedDayKey || ""}
            onChange={(e) => {
              const val = e.target.value;
              if (!val) {
                onSelectDayKey(null);
              } else {
                const existsInLoaded = dailyClosing.some((r) => r.date_key === val);
                onSelectDayKey(val);
                if (!existsInLoaded) {
                  onFilterTableToSingleDay(val);
                }
              }
            }}
            className="px-2 py-1 border border-emerald-400 bg-emerald-50/40 rounded-xs text-[11px] font-mono font-bold text-slate-900 focus:outline-none focus:border-emerald-700"
          />

          {selectedDayKey && (
            <button
              type="button"
              onClick={() => onSelectDayKey(null)}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-xs border border-slate-200 bg-slate-50 hover:bg-slate-100 text-[10px] font-bold text-slate-600"
            >
              Limpar seleção
            </button>
          )}
        </div>
      </div>

      {/* Faixa horizontal de dias com envios registrados no período */}
      {dailyClosing.length > 0 && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {dailyClosing.slice(0, 31).map((day) => {
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
                className={`shrink-0 inline-flex items-center gap-2 px-2.5 py-1.5 rounded-xs border text-[11px] font-mono transition-all ${
                  isSelected
                    ? "bg-emerald-900 text-white border-emerald-950 shadow-2xs"
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
                  {day.valid_orders_count} env.
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
            <div className="flex items-center gap-2">
              <CalendarCheck2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span className="text-xs font-black tracking-tight">
                Resultado Obtido na Data de Envio: {activeDayLabel}
              </span>
              {activeDayRow ? (
                <span className="px-2 py-0.5 rounded-xs bg-emerald-950 border border-emerald-700 text-emerald-300 font-mono text-[10px] font-bold">
                  {activeDayRow.valid_orders_count}{" "}
                  {activeDayRow.valid_orders_count === 1
                    ? "pedido enviado válido"
                    : "pedidos enviados válidos"}
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-xs bg-slate-800 text-slate-300 font-mono text-[10px]">
                  0 envios registrados nesta data
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              {!isSingleDayFiltered ? (
                <button
                  type="button"
                  onClick={() => onFilterTableToSingleDay(selectedDayKey)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xs bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold transition-colors"
                >
                  <Filter className="w-3 h-3" />
                  Listar somente vendas enviadas em {activeDayLabel}
                </button>
              ) : (
                onRestorePreviousPeriod && (
                  <button
                    type="button"
                    onClick={onRestorePreviousPeriod}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xs bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-200 text-[11px] font-bold transition-colors"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Voltar ao período completo
                  </button>
                )
              )}
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
