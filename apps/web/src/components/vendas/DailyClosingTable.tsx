"use client";

import React, { useMemo } from "react";
import { CalendarDays, Download, Truck } from "lucide-react";
import type { DailyClosingRow, SalesAnalysisMode, Seller } from "@/types/ml-sales";
import { exportDailyClosingToCsv, formatBRL } from "./formatters";

interface DailyClosingTableProps {
  rows: DailyClosingRow[];
  sellers: Seller[];
  from: string;
  to: string;
  analysisMode?: SalesAnalysisMode;
  selectedDayKey?: string | null;
  onSelectDay?: (dateKey: string) => void;
}

export function DailyClosingTable({
  rows,
  sellers,
  from,
  to,
  analysisMode = "order_date",
  selectedDayKey,
  onSelectDay,
}: DailyClosingTableProps) {
  const isShippingMode = analysisMode === "shipping_date";

  const dynamicSellers = useMemo(
    () =>
      sellers.filter(
        (s) => s.active || rows.some((r) => (r.seller_transfers[s.id] ?? 0) > 0)
      ),
    [sellers, rows]
  );

  const showUnassignedCol = useMemo(
    () => rows.some((r) => r.unassigned_transfer_total > 0),
    [rows]
  );

  const totals = useMemo(() => {
    const sellerSums: Record<string, number> = {};
    for (const s of dynamicSellers) sellerSums[s.id] = 0;

    let validCount = 0;
    let cancelledCount = 0;
    let gross = 0;
    let netFees = 0;
    let unassigned = 0;
    let opCosts = 0;
    let cleanProfit = 0;

    for (const r of rows) {
      validCount += r.valid_orders_count;
      cancelledCount += r.cancelled_orders_count;
      gross += r.gross_sale_total;
      netFees += r.net_ml_fees_and_shipping;
      unassigned += r.unassigned_transfer_total;
      opCosts += r.operational_costs_and_tax_total;
      cleanProfit += r.net_operational_profit_total;

      for (const s of dynamicSellers) {
        sellerSums[s.id] = (sellerSums[s.id] ?? 0) + (r.seller_transfers[s.id] ?? 0);
      }
    }

    return {
      validCount,
      cancelledCount,
      gross,
      netFees,
      sellerSums,
      unassigned,
      opCosts,
      cleanProfit,
    };
  }, [rows, dynamicSellers]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 bg-white border border-[#E2E8F0] rounded px-4 py-3">
        <div className="flex items-center gap-2">
          {isShippingMode ? (
            <Truck className="w-4 h-4 text-emerald-700" />
          ) : (
            <CalendarDays className="w-4 h-4 text-sky-600" />
          )}
          <div>
            <h2 className="text-xs font-bold text-slate-900">
              {isShippingMode
                ? "Consolidado Dia a Dia por Data de Envio (Expedição & Repasses)"
                : "Consolidado Dia a Dia por Data da Venda (Fechamento de Caixa & Repasses)"}
            </h2>
            <p className="text-[11px] text-slate-500">
              {isShippingMode
                ? "Agrupamento diário baseado no dia real em que você despachou os produtos (fuso Brasília)."
                : "Agrupamento diário das vendas válidas pela data da compra com colunas dinâmicas por vendedor/sócio."}
            </p>
          </div>
        </div>

        <button
          type="button"
          disabled={rows.length === 0}
          onClick={() =>
            exportDailyClosingToCsv({ rows, sellers, from, to, analysisMode })
          }
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold transition-colors shadow-2xs"
        >
          <Download className="w-3.5 h-3.5" />
          Exportar Fechamento (CSV/Excel)
        </button>
      </div>

      {rows.length === 0 ? (
        <div className="bg-white border border-[#E2E8F0] rounded p-8 text-center text-xs text-slate-500">
          {isShippingMode
            ? "Nenhum envio registrado no período filtrado. Sincronize para buscar postagens recentes."
            : "Nenhum dado diário disponível no período filtrado."}
        </div>
      ) : (
        <div className="bg-white border border-[#E2E8F0] rounded shadow-2xs overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs min-w-[1000px]">
            <thead>
              <tr className="bg-slate-900 text-slate-200 border-b border-slate-800 uppercase text-[10px] font-bold tracking-wider">
                <th className="py-2.5 px-3">
                  {isShippingMode ? "Dia do Envio" : "Data da Venda"}
                </th>
                <th className="py-2.5 px-3 text-center">
                  {isShippingMode ? "Qtd Enviadas" : "Qtd Vendas"}
                </th>
                <th className="py-2.5 px-3 text-center">Canceladas</th>
                <th className="py-2.5 px-3 text-right">Faturamento Bruto</th>
                <th className="py-2.5 px-3 text-right">Taxas/Frete Líq. ML</th>
                {dynamicSellers.map((s) => (
                  <th
                    key={s.id}
                    className="py-2.5 px-3 text-right bg-slate-800/90"
                  >
                    <div className="inline-flex items-center justify-end gap-1.5">
                      <span
                        className="w-2 h-2 rounded-xs shrink-0"
                        style={{ backgroundColor: s.color_hex }}
                      />
                      <span>Repasse {s.name}</span>
                    </div>
                  </th>
                ))}
                {showUnassignedCol && (
                  <th className="py-2.5 px-3 text-right bg-amber-950/60 text-amber-200">
                    Sem Vendedor
                  </th>
                )}
                <th className="py-2.5 px-3 text-right">Custos Operac. + Imp.</th>
                <th className="py-2.5 px-3 text-right bg-emerald-950/70 text-emerald-200">
                  Lucro Limpo Total
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100 font-mono tabular-nums">
              {rows.map((r) => {
                const isDayHighlighted = selectedDayKey === r.date_key;
                return (
                <tr
                  key={r.date_key}
                  onClick={() => onSelectDay?.(r.date_key)}
                  className={`transition-colors ${
                    onSelectDay ? "cursor-pointer" : ""
                  } ${
                    isDayHighlighted
                      ? "bg-emerald-50 ring-1 ring-inset ring-emerald-400"
                      : "hover:bg-slate-50"
                  }`}
                  title={
                    onSelectDay
                      ? `Clique para destacar o resultado detalhado de ${r.date_label}`
                      : undefined
                  }
                >
                  <td className="py-2.5 px-3 font-bold text-slate-900">{r.date_label}</td>
                  <td className="py-2.5 px-3 text-center font-bold text-slate-800">
                    {r.valid_orders_count}
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    {r.cancelled_orders_count > 0 ? (
                      <span className="px-1.5 py-0.5 rounded-xs bg-rose-50 text-rose-700 border border-rose-200 text-[10px] font-bold">
                        {r.cancelled_orders_count}
                      </span>
                    ) : (
                      <span className="text-slate-300">0</span>
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-right font-bold text-slate-900">
                    {formatBRL(r.gross_sale_total)}
                  </td>
                  <td className="py-2.5 px-3 text-right text-rose-600 font-semibold">
                    -{formatBRL(r.net_ml_fees_and_shipping)}
                  </td>
                  {dynamicSellers.map((s) => {
                    const val = r.seller_transfers[s.id] ?? 0;
                    return (
                      <td
                        key={s.id}
                        className="py-2.5 px-3 text-right font-bold bg-slate-50/70 text-emerald-800"
                      >
                        {val > 0 ? formatBRL(val) : <span className="text-slate-300">—</span>}
                      </td>
                    );
                  })}
                  {showUnassignedCol && (
                    <td className="py-2.5 px-3 text-right font-semibold bg-amber-50/40 text-amber-800">
                      {r.unassigned_transfer_total > 0
                        ? formatBRL(r.unassigned_transfer_total)
                        : "—"}
                    </td>
                  )}
                  <td className="py-2.5 px-3 text-right text-slate-600">
                    -{formatBRL(r.operational_costs_and_tax_total)}
                  </td>
                  <td
                    className={`py-2.5 px-3 text-right font-black bg-emerald-50/40 ${
                      r.net_operational_profit_total >= 0 ? "text-emerald-900" : "text-rose-700"
                    }`}
                  >
                    {formatBRL(r.net_operational_profit_total)}
                  </td>
                </tr>
                );
              })}
            </tbody>

            <tfoot>
              <tr className="bg-slate-100 border-t-2 border-slate-300 font-mono tabular-nums font-black text-slate-900 text-xs">
                <td className="py-3 px-3 font-sans uppercase text-[11px]">
                  Totais do Período
                </td>
                <td className="py-3 px-3 text-center">{totals.validCount}</td>
                <td className="py-3 px-3 text-center text-rose-700">
                  {totals.cancelledCount}
                </td>
                <td className="py-3 px-3 text-right">{formatBRL(totals.gross)}</td>
                <td className="py-3 px-3 text-right text-rose-700">
                  -{formatBRL(totals.netFees)}
                </td>
                {dynamicSellers.map((s) => (
                  <td key={s.id} className="py-3 px-3 text-right text-emerald-800">
                    {formatBRL(totals.sellerSums[s.id] ?? 0)}
                  </td>
                ))}
                {showUnassignedCol && (
                  <td className="py-3 px-3 text-right text-amber-900">
                    {formatBRL(totals.unassigned)}
                  </td>
                )}
                <td className="py-3 px-3 text-right text-slate-700">
                  -{formatBRL(totals.opCosts)}
                </td>
                <td className="py-3 px-3 text-right text-emerald-900">
                  {formatBRL(totals.cleanProfit)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
