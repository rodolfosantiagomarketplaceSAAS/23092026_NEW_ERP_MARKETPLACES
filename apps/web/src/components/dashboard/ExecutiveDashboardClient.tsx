"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, Sparkles, Wallet } from "lucide-react";
import type {
  DashboardPeriodPreset,
  ExecutiveDashboardResponse,
} from "@/types/executive-dashboard";
import { getTodayBrazilISO } from "@/components/vendas/formatters";
import { DashboardFilterBar } from "./DashboardFilterBar";
import { ActionRadarPanel } from "./ActionRadarPanel";
import { EvolutionChartCard } from "./EvolutionChartCard";
import { PortfolioIntelligenceSection } from "./PortfolioIntelligenceSection";

const CLIENT_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutos no navegador (zero requests ao trocar de aba)
const CLIENT_CACHE_PREFIX = "erp_exec_dash_v2:";

interface ClientCacheRecord {
  data: ExecutiveDashboardResponse;
  expiresAt: number;
}

function addDaysIso(isoDate: string, delta: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + delta, 12, 0, 0));
  return dt.toISOString().slice(0, 10);
}

function resolvePresetDates(preset: Exclude<DashboardPeriodPreset, "custom">): {
  from: string;
  to: string;
} {
  const today = getTodayBrazilISO();
  switch (preset) {
    case "today":
      return { from: today, to: today };
    case "last7":
      return { from: addDaysIso(today, -6), to: today };
    case "last15":
      return { from: addDaysIso(today, -14), to: today };
    case "last30":
      return { from: addDaysIso(today, -29), to: today };
    case "thisMonth": {
      const [y, m] = today.split("-");
      return { from: `${y}-${m}-01`, to: today };
    }
  }
}

function readClientCache(key: string): ExecutiveDashboardResponse | null {
  try {
    const raw = window.sessionStorage.getItem(CLIENT_CACHE_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ClientCacheRecord;
    if (!parsed || typeof parsed.expiresAt !== "number" || parsed.expiresAt <= Date.now()) {
      window.sessionStorage.removeItem(CLIENT_CACHE_PREFIX + key);
      return null;
    }
    return parsed.data;
  } catch {
    return null;
  }
}

function writeClientCache(key: string, data: ExecutiveDashboardResponse): void {
  try {
    const record: ClientCacheRecord = {
      data,
      expiresAt: Date.now() + CLIENT_CACHE_TTL_MS,
    };
    window.sessionStorage.setItem(CLIENT_CACHE_PREFIX + key, JSON.stringify(record));
  } catch {
    // Ignore storage quota errors
  }
}

export function ExecutiveDashboardClient() {
  const initialRange = resolvePresetDates("last30");

  const [preset, setPreset] = useState<DashboardPeriodPreset>("last30");
  const [fromDate, setFromDate] = useState<string>(initialRange.from);
  const [toDate, setToDate] = useState<string>(initialRange.to);
  const [selectedStore, setSelectedStore] = useState<string>("all");

  const [data, setData] = useState<ExecutiveDashboardResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [cacheSource, setCacheSource] = useState<"browser" | "server" | "fresh">("fresh");

  const loadDashboard = useCallback(
    async (params: {
      from: string;
      to: string;
      store: string;
      force?: boolean;
    }) => {
      const { from, to, store, force = false } = params;
      const cacheKey = `${from}:${to}:${store}`;

      if (!force) {
        const cached = readClientCache(cacheKey);
        if (cached) {
          setData(cached);
          setCacheSource("browser");
          setLoading(false);
          setError(null);
          return;
        }
      }

      setLoading(true);
      setError(null);

      try {
        const qs = new URLSearchParams({
          from,
          to,
          store,
          ...(force ? { force: "true" } : {}),
        });
        const res = await fetch(`/api/dashboard/executive?${qs.toString()}`, {
          cache: force ? "no-store" : "default",
        });

        const json = (await res.json()) as ExecutiveDashboardResponse & { error?: string };
        if (!res.ok || !json.success) {
          throw new Error(json.error || "Falha ao carregar os indicadores do dashboard.");
        }

        setData(json);
        setCacheSource(json.cacheMeta.hit ? "server" : "fresh");
        writeClientCache(cacheKey, json);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Erro ao carregar o Dashboard Geral."
        );
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    loadDashboard({ from: fromDate, to: toDate, store: selectedStore, force: false });
  }, [fromDate, toDate, selectedStore, loadDashboard]);

  function handleSelectPreset(nextPreset: DashboardPeriodPreset) {
    setPreset(nextPreset);
    if (nextPreset !== "custom") {
      const range = resolvePresetDates(nextPreset);
      setFromDate(range.from);
      setToDate(range.to);
    }
  }

  function handleCustomRange(nextFrom: string, nextTo: string) {
    if (!nextFrom || !nextTo) return;
    setPreset("custom");
    setFromDate(nextFrom);
    setToDate(nextTo);
  }

  return (
    <div className="max-w-[1600px] mx-auto space-y-4">
      {/* Cabeçalho Executivo */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-base font-bold text-slate-900 tracking-tight">
            Central de Comando Executiva
          </h1>
          <p className="text-xs text-slate-500">
            Alertas acionáveis, evolução diária e inteligência de portfólio no Mercado Livre.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/vendas/gestao-diaria"
            className="px-3 py-1.5 text-xs font-semibold bg-white hover:bg-[#F8FAFC] text-slate-700 border border-[#E2E8F0] rounded flex items-center gap-1.5 shadow-2xs transition-colors"
          >
            <Wallet className="w-3.5 h-3.5 text-emerald-600" />
            Gestão de Vendas
          </Link>
          <Link
            href="/inteligencia"
            className="px-3 py-1.5 text-xs font-semibold bg-[#0284C7] hover:bg-sky-700 text-white rounded flex items-center gap-1.5 shadow-2xs transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Radar de BuyBox
          </Link>
        </div>
      </div>

      {/* Barra Global de Filtros */}
      <DashboardFilterBar
        preset={preset}
        fromDate={fromDate}
        toDate={toDate}
        prevFromDate={data?.period.prevFrom}
        prevToDate={data?.period.prevTo}
        stores={data?.stores ?? []}
        selectedStore={selectedStore}
        loading={loading}
        cacheInfo={
          data
            ? {
                source: cacheSource,
                generatedAt: data.cacheMeta.generatedAt,
                ttlMinutes: Math.round(data.cacheMeta.ttlSeconds / 60),
              }
            : null
        }
        onSelectPreset={handleSelectPreset}
        onChangeCustomRange={handleCustomRange}
        onChangeStore={setSelectedStore}
        onForceRefresh={() =>
          loadDashboard({ from: fromDate, to: toDate, store: selectedStore, force: true })
        }
      />

      {/* Erro */}
      {error && (
        <div className="bg-rose-50 border border-rose-200 rounded p-3 flex items-center justify-between gap-3 text-rose-800 text-xs">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() =>
              loadDashboard({ from: fromDate, to: toDate, store: selectedStore, force: true })
            }
            className="px-2.5 py-1 rounded bg-white border border-rose-200 text-rose-700 font-semibold hover:bg-rose-100 transition-colors"
          >
            Tentar novamente
          </button>
        </div>
      )}

      {/* Skeleton Inicial */}
      {loading && !data ? (
        <DashboardSkeleton />
      ) : data ? (
        <div className={`space-y-4 transition-opacity ${loading ? "opacity-60" : "opacity-100"}`}>
          {/* Radar de Ação Imediata */}
          <ActionRadarPanel radar={data.actionRadar} />

          {/* Gráfico Principal de Evolução */}
          <EvolutionChartCard series={data.dailySeries} />

          {/* Inteligência de Portfólio (Curva A vs. Produtos em Queda) */}
          <PortfolioIntelligenceSection
            topByRevenue={data.topProductsByRevenue}
            topByProfit={data.topProductsByProfit}
            decliningProducts={data.decliningProducts}
          />
        </div>
      ) : null}
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="bg-white border border-[#E2E8F0] rounded h-[160px]" />
      <div className="bg-white border border-[#E2E8F0] rounded h-[320px]" />
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="bg-white border border-[#E2E8F0] rounded h-[300px]" />
        <div className="bg-white border border-[#E2E8F0] rounded h-[300px]" />
      </div>
    </div>
  );
}
