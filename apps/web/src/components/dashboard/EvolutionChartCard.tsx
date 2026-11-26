"use client";

import React, { useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DailyEvolutionPoint } from "@/types/executive-dashboard";
import { formatBRL } from "@/components/vendas/formatters";

interface EvolutionChartCardProps {
  series: DailyEvolutionPoint[];
}

type ChartMetric = "grossSales" | "netProfit" | "ordersCount";

const METRIC_CONFIG: Record<
  ChartMetric,
  {
    label: string;
    currKey: keyof DailyEvolutionPoint;
    prevKey: keyof DailyEvolutionPoint;
    stroke: string;
    fillId: string;
    isCurrency: boolean;
  }
> = {
  grossSales: {
    label: "Faturamento",
    currKey: "grossSales",
    prevKey: "prevGrossSales",
    stroke: "#0284C7",
    fillId: "gradGross",
    isCurrency: true,
  },
  netProfit: {
    label: "Lucro Líquido",
    currKey: "netProfit",
    prevKey: "prevNetProfit",
    stroke: "#10B981",
    fillId: "gradProfit",
    isCurrency: true,
  },
  ordersCount: {
    label: "Pedidos",
    currKey: "ordersCount",
    prevKey: "prevOrdersCount",
    stroke: "#0F172A",
    fillId: "gradOrders",
    isCurrency: false,
  },
};

function formatCompactAxis(value: number, isCurrency: boolean): string {
  if (!isCurrency) return String(Math.round(value));
  if (Math.abs(value) >= 1000) {
    return `R$${(value / 1000).toFixed(1).replace(".", ",")}k`;
  }
  return `R$${Math.round(value)}`;
}

export function EvolutionChartCard({ series }: EvolutionChartCardProps) {
  const [metric, setMetric] = useState<ChartMetric>("grossSales");
  const cfg = METRIC_CONFIG[metric];

  const hasData = series.some(
    (pt) => Number(pt[cfg.currKey] || 0) !== 0 || Number(pt[cfg.prevKey] || 0) !== 0
  );

  return (
    <section
      aria-label="Evolução de Vendas e Lucro"
      className="bg-white border border-[#E2E8F0] rounded p-4 shadow-2xs"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800">
            Evolução Diária — {cfg.label}
          </h2>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Linha sólida: período atual • Linha tracejada: período anterior equivalente
          </p>
        </div>

        {/* Toggle de Métrica */}
        <div className="inline-flex items-center bg-[#F4F6F8] border border-[#E2E8F0] rounded p-0.5">
          {(Object.keys(METRIC_CONFIG) as ChartMetric[]).map((key) => {
            const active = metric === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setMetric(key)}
                className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-all ${
                  active
                    ? "bg-white text-slate-900 shadow-2xs border border-[#E2E8F0]"
                    : "text-slate-500 hover:text-slate-900"
                }`}
              >
                {METRIC_CONFIG[key].label}
              </button>
            );
          })}
        </div>
      </div>

      {!hasData ? (
        <div className="h-[260px] flex flex-col items-center justify-center text-slate-400 border border-dashed border-slate-200 rounded bg-[#F8FAFC]">
          <p className="text-xs font-medium text-slate-500">
            Sem movimentação registrada no período selecionado.
          </p>
          <p className="text-[11px] text-slate-400 mt-1">
            Sincronize seus pedidos em Gestão de Vendas ou selecione outro período acima.
          </p>
        </div>
      ) : (
        <div className="h-[280px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={series} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
              <defs>
                <linearGradient id="gradGross" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#0284C7" stopOpacity={0.18} />
                  <stop offset="95%" stopColor="#0284C7" stopOpacity={0.01} />
                </linearGradient>
                <linearGradient id="gradProfit" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10B981" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#10B981" stopOpacity={0.01} />
                </linearGradient>
                <linearGradient id="gradOrders" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#0F172A" stopOpacity={0.14} />
                  <stop offset="95%" stopColor="#0F172A" stopOpacity={0.01} />
                </linearGradient>
              </defs>

              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />

              <XAxis
                dataKey="dateLabel"
                tick={{ fontSize: 10, fill: "#64748B" }}
                axisLine={{ stroke: "#E2E8F0" }}
                tickLine={false}
                minTickGap={18}
              />

              <YAxis
                tick={{ fontSize: 10, fill: "#64748B" }}
                axisLine={false}
                tickLine={false}
                width={58}
                tickFormatter={(v) => formatCompactAxis(Number(v), cfg.isCurrency)}
              />

              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload || payload.length === 0) return null;
                  const point = payload[0]?.payload as DailyEvolutionPoint | undefined;
                  if (!point) return null;

                  const currVal = Number(point[cfg.currKey] || 0);
                  const prevVal = Number(point[cfg.prevKey] || 0);
                  const formatVal = (v: number) =>
                    cfg.isCurrency ? formatBRL(v) : `${v} pedidos`;

                  return (
                    <div className="bg-[#0F172A] text-white rounded border border-slate-700 px-3 py-2 shadow-lg text-[11px] space-y-1">
                      <div className="font-bold text-slate-200 border-b border-slate-700 pb-1">
                        Dia {label}
                      </div>
                      <div className="flex items-center justify-between gap-4 font-mono">
                        <span className="text-slate-300 font-sans">Atual:</span>
                        <span className="font-bold text-white">{formatVal(currVal)}</span>
                      </div>
                      <div className="flex items-center justify-between gap-4 font-mono">
                        <span className="text-slate-400 font-sans">Anterior:</span>
                        <span className="text-slate-300">{formatVal(prevVal)}</span>
                      </div>
                      <div className="pt-1 border-t border-slate-800 flex items-center justify-between gap-4 font-mono text-[10px] text-slate-400">
                        <span>Pedidos: {point.ordersCount}</span>
                        <span>Lucro: {formatBRL(point.netProfit)}</span>
                      </div>
                    </div>
                  );
                }}
              />

              <Area
                type="monotone"
                dataKey={cfg.currKey}
                name={`${cfg.label} (Atual)`}
                stroke={cfg.stroke}
                strokeWidth={2.2}
                fill={`url(#${cfg.fillId})`}
                activeDot={{ r: 4, strokeWidth: 2, stroke: "#FFFFFF" }}
              />

              <Line
                type="monotone"
                dataKey={cfg.prevKey}
                name={`${cfg.label} (Período anterior)`}
                stroke="#94A3B8"
                strokeWidth={1.6}
                strokeDasharray="4 4"
                dot={false}
                activeDot={{ r: 3, fill: "#64748B" }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
