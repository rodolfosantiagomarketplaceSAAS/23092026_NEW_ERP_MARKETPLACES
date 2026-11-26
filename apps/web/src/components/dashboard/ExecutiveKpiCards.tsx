"use client";

import React from "react";
import {
  Activity,
  DollarSign,
  MousePointerClick,
  Receipt,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import type { ExecutiveKpisPayload } from "@/types/executive-dashboard";
import { formatBRL, formatPct } from "@/components/vendas/formatters";

interface ExecutiveKpiCardsProps {
  kpis: ExecutiveKpisPayload;
}

function DeltaBadge({
  deltaPct,
  suffix = "%",
  invertColors = false,
}: {
  deltaPct: number | null;
  suffix?: string;
  invertColors?: boolean;
}) {
  if (deltaPct === null || !Number.isFinite(deltaPct)) {
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-slate-100 text-slate-500">
        — vs. ant.
      </span>
    );
  }

  const isPositive = deltaPct >= 0;
  const isGood = invertColors ? !isPositive : isPositive;

  return (
    <span
      className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold border ${
        isGood
          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
          : "bg-rose-50 text-rose-700 border-rose-200"
      }`}
    >
      {isPositive ? (
        <TrendingUp className="w-2.5 h-2.5" />
      ) : (
        <TrendingDown className="w-2.5 h-2.5" />
      )}
      {isPositive ? "+" : ""}
      {deltaPct.toFixed(1).replace(".", ",")}
      {suffix}
    </span>
  );
}

/**
 * Lightweight pure SVG sparkline so KPI cards stay instant with zero chart resize overhead.
 */
function MiniSparkline({
  data,
  strokeColor,
  fillColor,
}: {
  data: number[];
  strokeColor: string;
  fillColor: string;
}) {
  if (!data || data.length < 2) {
    return <div className="h-7 w-full" />;
  }

  const width = 120;
  const height = 28;
  const padding = 2;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const coords = data.map((val, idx) => {
    const x = padding + (idx / (data.length - 1)) * (width - padding * 2);
    const y = height - padding - ((val - min) / range) * (height - padding * 2);
    return { x, y };
  });

  const linePath = coords
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(" ");

  const areaPath = `${linePath} L${coords[coords.length - 1].x.toFixed(1)},${height} L${coords[0].x.toFixed(1)},${height} Z`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full h-7 overflow-visible"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path d={areaPath} fill={fillColor} />
      <path
        d={linePath}
        fill="none"
        stroke={strokeColor}
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function getReputationVisual(levelId: string | null) {
  switch (levelId) {
    case "5_green":
      return {
        label: "Verde Escuro",
        badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200",
        barIndex: 5,
      };
    case "4_light_green":
      return {
        label: "Verde Claro",
        badgeClass: "bg-lime-50 text-lime-700 border-lime-200",
        barIndex: 4,
      };
    case "3_yellow":
      return {
        label: "Amarelo (Atenção)",
        badgeClass: "bg-amber-50 text-amber-800 border-amber-200",
        barIndex: 3,
      };
    case "2_orange":
      return {
        label: "Laranja (Risco)",
        badgeClass: "bg-orange-50 text-orange-800 border-orange-200",
        barIndex: 2,
      };
    case "1_red":
      return {
        label: "Vermelho (Crítico)",
        badgeClass: "bg-rose-50 text-rose-700 border-rose-200",
        barIndex: 1,
      };
    default:
      return {
        label: "Sem termômetro",
        badgeClass: "bg-slate-100 text-slate-600 border-slate-200",
        barIndex: 0,
      };
  }
}

function formatPowerSeller(status: string | null): string | null {
  if (!status) return null;
  const s = status.toLowerCase();
  if (s === "platinum") return "MercadoLíder Platinum";
  if (s === "gold") return "MercadoLíder Gold";
  if (s === "silver") return "MercadoLíder";
  return status;
}

export function ExecutiveKpiCards({ kpis }: ExecutiveKpiCardsProps) {
  const repVisual = getReputationVisual(kpis.reputation.levelId);
  const medalLabel = formatPowerSeller(kpis.reputation.powerSellerStatus);
  const thermometerColors = [
    "bg-rose-500",
    "bg-orange-500",
    "bg-amber-400",
    "bg-lime-500",
    "bg-emerald-500",
  ];

  return (
    <section aria-label="Indicadores Principais" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
      {/* 1. Faturamento Bruto */}
      <div className="bg-white border border-[#E2E8F0] rounded p-3.5 shadow-2xs flex flex-col justify-between hover:border-slate-300 transition-colors">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Faturamento Bruto
          </span>
          <div className="w-7 h-7 rounded bg-sky-50 border border-sky-100 flex items-center justify-center">
            <DollarSign className="w-3.5 h-3.5 text-sky-600" />
          </div>
        </div>

        <div className="mt-2">
          <div className="text-xl font-black text-slate-900 font-mono tabular-nums tracking-tight">
            {formatBRL(kpis.grossSales.value)}
          </div>
          <div className="mt-1 flex items-center justify-between gap-1.5">
            <DeltaBadge deltaPct={kpis.grossSales.deltaPct} />
            <span className="text-[10px] text-slate-500 font-mono">
              <strong className="text-slate-700">{kpis.grossSales.validOrdersCount}</strong>{" "}
              {kpis.grossSales.validOrdersCount === 1 ? "pedido" : "pedidos"}
            </span>
          </div>
        </div>

        <div className="mt-2.5 pt-2 border-t border-slate-100">
          <MiniSparkline
            data={kpis.grossSales.sparkline}
            strokeColor="#0284C7"
            fillColor="rgba(2, 132, 199, 0.08)"
          />
          <div className="mt-1 flex items-center justify-between text-[10px] text-slate-400 font-mono">
            <span>{kpis.grossSales.unitsSold} unid. vendidas</span>
            {kpis.grossSales.cancelledOrdersCount > 0 && (
              <span className="text-rose-600 font-semibold">
                {kpis.grossSales.cancelledOrdersCount} cancel.
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 2. Margem de Contribuição / Lucro Líquido (Destaque Executivo) */}
      <div className="bg-[#0F172A] text-white border border-slate-800 rounded p-3.5 shadow-2xs flex flex-col justify-between">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-300">
            Lucro Líquido Real
          </span>
          <div className="w-7 h-7 rounded bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
            <Wallet className="w-3.5 h-3.5 text-emerald-400" />
          </div>
        </div>

        <div className="mt-2">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span
              className={`text-xl font-black font-mono tabular-nums tracking-tight ${
                kpis.netProfit.value >= 0 ? "text-white" : "text-rose-400"
              }`}
            >
              {formatBRL(kpis.netProfit.value)}
            </span>
            <span
              className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border ${
                kpis.netProfit.marginPct >= 15
                  ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                  : kpis.netProfit.marginPct >= 10
                  ? "bg-amber-500/20 text-amber-300 border-amber-500/30"
                  : "bg-rose-500/20 text-rose-300 border-rose-500/30"
              }`}
            >
              {formatPct(kpis.netProfit.marginPct)}
            </span>
          </div>
          <div className="mt-1 flex items-center justify-between gap-1.5">
            <DeltaBadge deltaPct={kpis.netProfit.deltaPct} />
            <span className="text-[10px] text-slate-400 font-mono">
              Ant: {formatPct(kpis.netProfit.previousMarginPct)}
            </span>
          </div>
        </div>

        <div className="mt-2.5 pt-2 border-t border-slate-800">
          <MiniSparkline
            data={kpis.netProfit.sparkline}
            strokeColor="#10B981"
            fillColor="rgba(16, 185, 129, 0.14)"
          />
          <div className="mt-1 flex items-center justify-between text-[10px] text-slate-400 font-mono">
            <span title="Comissão + Frete Vendedor - Estornos ML">
              ML: -{formatBRL(kpis.netProfit.mlFeesAndShippingTotal)}
            </span>
            <span title="Impostos + Custos Operacionais">
              ERP: -{formatBRL(kpis.netProfit.taxTotal + kpis.netProfit.operationalCostsTotal)}
            </span>
          </div>
        </div>
      </div>

      {/* 3. Ticket Médio */}
      <div className="bg-white border border-[#E2E8F0] rounded p-3.5 shadow-2xs flex flex-col justify-between hover:border-slate-300 transition-colors">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Ticket Médio
          </span>
          <div className="w-7 h-7 rounded bg-amber-50 border border-amber-100 flex items-center justify-center">
            <Receipt className="w-3.5 h-3.5 text-amber-600" />
          </div>
        </div>

        <div className="mt-2">
          <div className="text-xl font-black text-slate-900 font-mono tabular-nums tracking-tight">
            {formatBRL(kpis.averageTicket.value)}
          </div>
          <div className="mt-1 flex items-center justify-between gap-1.5">
            <DeltaBadge deltaPct={kpis.averageTicket.deltaPct} />
            <span className="text-[10px] text-slate-500 font-mono">
              Ant: {formatBRL(kpis.averageTicket.previousValue)}
            </span>
          </div>
        </div>

        <div className="mt-2.5 pt-2 border-t border-slate-100">
          <MiniSparkline
            data={kpis.averageTicket.sparkline}
            strokeColor="#D97706"
            fillColor="rgba(217, 119, 6, 0.08)"
          />
          <div className="mt-1 flex items-center justify-between text-[10px] text-slate-400 font-mono">
            <span>Faturamento ÷ Pedidos</span>
            <span>
              {kpis.grossSales.validOrdersCount > 0
                ? `${(kpis.grossSales.unitsSold / kpis.grossSales.validOrdersCount).toFixed(1).replace(".", ",")} un/ped`
                : "0,0 un/ped"}
            </span>
          </div>
        </div>
      </div>

      {/* 4. Taxa de Conversão Geral */}
      <div className="bg-white border border-[#E2E8F0] rounded p-3.5 shadow-2xs flex flex-col justify-between hover:border-slate-300 transition-colors">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Conversão Geral
          </span>
          <div className="w-7 h-7 rounded bg-teal-50 border border-teal-100 flex items-center justify-center">
            <MousePointerClick className="w-3.5 h-3.5 text-teal-600" />
          </div>
        </div>

        <div className="mt-2">
          <div className="text-xl font-black text-slate-900 font-mono tabular-nums tracking-tight">
            {kpis.conversionRate.totalVisits > 0
              ? `${kpis.conversionRate.value.toFixed(2).replace(".", ",")}%`
              : "—"}
          </div>
          <div className="mt-1 flex items-center justify-between gap-1.5">
            <DeltaBadge deltaPct={kpis.conversionRate.deltaPct} />
            <span className="text-[10px] text-slate-500 font-mono">
              {kpis.conversionRate.totalVisits.toLocaleString("pt-BR")} visitas
            </span>
          </div>
        </div>

        <div className="mt-2.5 pt-2 border-t border-slate-100">
          <MiniSparkline
            data={kpis.conversionRate.sparkline}
            strokeColor="#0D9488"
            fillColor="rgba(13, 148, 136, 0.08)"
          />
          <div className="mt-1 flex items-center justify-between text-[10px] text-slate-400 font-mono">
            <span>Pedidos ÷ Visitas</span>
            <span>
              {kpis.conversionRate.visitsSource === "ml_live"
                ? "API ML (período)"
                : "Catálogo (base)"}
            </span>
          </div>
        </div>
      </div>

      {/* 5. Reputação & Saúde da Conta */}
      <div className="bg-white border border-[#E2E8F0] rounded p-3.5 shadow-2xs flex flex-col justify-between hover:border-slate-300 transition-colors sm:col-span-2 lg:col-span-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Reputação & Saúde
          </span>
          <div className="w-7 h-7 rounded bg-emerald-50 border border-emerald-100 flex items-center justify-center">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
          </div>
        </div>

        <div className="mt-2">
          <div className="flex items-center justify-between gap-1.5">
            <span
              className={`text-[11px] font-bold px-2 py-0.5 rounded border ${repVisual.badgeClass}`}
            >
              {repVisual.label}
            </span>
            {medalLabel && (
              <span className="text-[10px] font-semibold text-amber-700 truncate">
                {medalLabel}
              </span>
            )}
          </div>

          {/* Termômetro ML de 5 cores */}
          <div className="mt-2.5 grid grid-cols-5 gap-1" aria-label="Termômetro de Reputação">
            {thermometerColors.map((color, idx) => {
              const active = repVisual.barIndex === idx + 1;
              return (
                <div
                  key={color}
                  className={`h-2 rounded-xs transition-all ${color} ${
                    active
                      ? "opacity-100 ring-1 ring-slate-900 ring-offset-1 scale-y-110"
                      : "opacity-25"
                  }`}
                />
              );
            })}
          </div>
        </div>

        <div className="mt-2.5 pt-2 border-t border-slate-100 grid grid-cols-3 gap-1 text-center font-mono">
          <div className="bg-[#F8FAFC] rounded py-1 px-1 border border-slate-100">
            <div className="text-[9px] font-sans uppercase text-slate-400 font-semibold">
              Reclam.
            </div>
            <div
              className={`text-[11px] font-bold ${
                (kpis.reputation.claimsRatePct ?? 0) > 2 ? "text-rose-600" : "text-slate-800"
              }`}
            >
              {kpis.reputation.claimsRatePct !== null
                ? `${kpis.reputation.claimsRatePct.toFixed(1).replace(".", ",")}%`
                : "—"}
            </div>
          </div>
          <div className="bg-[#F8FAFC] rounded py-1 px-1 border border-slate-100">
            <div className="text-[9px] font-sans uppercase text-slate-400 font-semibold">
              Atrasos
            </div>
            <div
              className={`text-[11px] font-bold ${
                (kpis.reputation.delayedRatePct ?? 0) > 10 ? "text-rose-600" : "text-slate-800"
              }`}
            >
              {kpis.reputation.delayedRatePct !== null
                ? `${kpis.reputation.delayedRatePct.toFixed(1).replace(".", ",")}%`
                : "—"}
            </div>
          </div>
          <div className="bg-[#F8FAFC] rounded py-1 px-1 border border-slate-100">
            <div className="text-[9px] font-sans uppercase text-slate-400 font-semibold">
              Cancel.
            </div>
            <div
              className={`text-[11px] font-bold ${
                (kpis.reputation.cancellationsRatePct ?? 0) > 2
                  ? "text-rose-600"
                  : "text-slate-800"
              }`}
            >
              {kpis.reputation.cancellationsRatePct !== null
                ? `${kpis.reputation.cancellationsRatePct.toFixed(1).replace(".", ",")}%`
                : "—"}
            </div>
          </div>
        </div>

        <div className="mt-1.5 flex items-center justify-between text-[10px] text-slate-400">
          <span className="truncate flex items-center gap-1">
            <Activity className="w-3 h-3 text-slate-400 shrink-0" />
            {kpis.reputation.accountName || "Conecte sua conta ML"}
          </span>
          {kpis.reputation.unansweredQuestionsCount > 0 && (
            <span className="font-mono font-bold text-amber-700 shrink-0">
              {kpis.reputation.unansweredQuestionsCount} perg.
            </span>
          )}
        </div>
      </div>
    </section>
  );
}
