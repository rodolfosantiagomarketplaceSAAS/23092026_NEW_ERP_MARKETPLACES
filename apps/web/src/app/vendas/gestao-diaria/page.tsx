"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Header } from "@/components/layout/Header";
import {
  AlertTriangle,
  Calendar,
  CalendarDays,
  CheckCircle2,
  Download,
  Filter,
  Infinity as InfinityIcon,
  ListChecks,
  Loader2,
  Radio,
  RefreshCw,
  RotateCcw,
  Search,
  Settings2,
  ShieldAlert,
  Store,
  Table2,
} from "lucide-react";
import type {
  MlSalesDashboardResponse,
  SalesAnalysisMode,
} from "@/types/ml-sales";
import {
  computeSalesDashboardAnalytics,
  filterOrdersByAnalysisMode,
} from "@/lib/mercadolivre/sales-analytics";
import {
  computeDatePresetRange,
  computeSpecificMonthRange,
  computeSpecificYearRange,
  exportDetailedOrdersToCsv,
  getTodayBrazilISO,
  MONTH_NAMES_PT,
  type QuickDatePreset,
} from "@/components/vendas/formatters";
import { AnalysisModeToggle } from "@/components/vendas/AnalysisModeToggle";
import { SalesKpiSection } from "@/components/vendas/SalesKpiSection";
import { ShippingDaySpotlightBar } from "@/components/vendas/ShippingDaySpotlightBar";
import { DailySalesTable } from "@/components/vendas/DailySalesTable";
import { DailyClosingTable } from "@/components/vendas/DailyClosingTable";
import { ManageSellersAndTemplatesDrawer } from "@/components/vendas/ManageSellersAndTemplatesDrawer";
import { SellerQuickColorPopover } from "@/components/vendas/SellerQuickColorPopover";
import {
  markSalesSyncedNow,
  useRealtimeSalesOrders,
} from "@/hooks/useRealtimeSalesOrders";

type DatePreset =
  | QuickDatePreset
  | "specificMonth"
  | "specificYear"
  | "specificDay"
  | "custom";

type StatusFilter = "all" | "valid" | "cancelled" | "unverified";
type SubTab = "operational" | "closing";

const EMPTY_DASHBOARD: MlSalesDashboardResponse = {
  success: true,
  schemaReady: true,
  shippingDateSchemaReady: true,
  manualShippingSchemaReady: true,
  analysisMode: "order_date",
  periodMode: "range",
  availableYears: [],
  pendingShipmentCount: 0,
  backfillMissingShippedAtCount: 0,
  orders: [],
  sellers: [],
  templates: [],
  accounts: [],
  stores: [],
  sellerOrderCounts: {},
  unassignedCount: 0,
  kpis: {
    valid_orders_count: 0,
    cancelled_orders_count: 0,
    unverified_orders_count: 0,
    unassigned_orders_count: 0,
    gross_valid_sales: 0,
    seller_transfer_base_total: 0,
    effective_seller_transfer_total: 0,
    ml_commission_total: 0,
    ml_shipping_total: 0,
    ml_promo_rebate_total: 0,
    ml_net_platform_discount: 0,
    tax_total: 0,
    operational_costs_total: 0,
    net_operational_profit_total: 0,
    net_margin_pct: 0,
  },
  sellerSummaries: [],
  dailyClosing: [],
};

export default function GestaoDiariaVendasPage() {
  const todayBr = getTodayBrazilISO();
  const currentYear = Number(todayBr.slice(0, 4));
  const currentMonth = Number(todayBr.slice(5, 7));
  const initialRange = computeDatePresetRange("thisMonth");

  const [analysisMode, setAnalysisMode] = useState<SalesAnalysisMode>("order_date");
  const [preset, setPreset] = useState<DatePreset>("thisMonth");
  const [fromDate, setFromDate] = useState<string>(initialRange.from);
  const [toDate, setToDate] = useState<string>(initialRange.to);

  // Seletores dedicados de Mês, Ano e Dia Específico
  const [selectedMonthNumber, setSelectedMonthNumber] = useState<number>(currentMonth);
  const [selectedYearNumber, setSelectedYearNumber] = useState<number>(currentYear);
  const [spotlightDayKey, setSpotlightDayKey] = useState<string | null>(null);
  const [previousRangeBeforeDay, setPreviousRangeBeforeDay] = useState<{
    preset: DatePreset;
    from: string;
    to: string;
  } | null>(null);

  const [sellerFilter, setSellerFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [storeFilter, setStoreFilter] = useState<string>("all");
  const [searchInput, setSearchInput] = useState<string>("");
  const [debouncedQuery, setDebouncedQuery] = useState<string>("");

  const [activeSubTab, setActiveSubTab] = useState<SubTab>("operational");
  const [drawerOpen, setDrawerOpen] = useState<boolean>(false);

  const [data, setData] = useState<MlSalesDashboardResponse>(EMPTY_DASHBOARD);
  const [loading, setLoading] = useState<boolean>(true);
  const [syncing, setSyncing] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const isAllSales = preset === "all";

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchInput.trim());
    }, 280);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const loadDashboard = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!options?.silent) setLoading(true);
      try {
        const qs = new URLSearchParams({
          seller: sellerFilter,
          status: statusFilter,
          store: storeFilter,
          analysisBy: analysisMode,
        });

        if (isAllSales) {
          qs.set("period", "all");
        } else {
          qs.set("from", fromDate);
          qs.set("to", toDate);
        }

        if (debouncedQuery) qs.set("q", debouncedQuery);

        const res = await fetch(`/api/ml/sales?${qs.toString()}`, {
          cache: "no-store",
        });
        const json = await res.json();
        if (!res.ok || !json.success) {
          throw new Error(json.error || "Falha ao carregar gestão diária de vendas.");
        }
        setData(json as MlSalesDashboardResponse);
      } catch (err) {
        if (!options?.silent) {
          setFeedback({
            type: "error",
            message:
              err instanceof Error ? err.message : "Erro ao carregar vendas do período.",
          });
        }
      } finally {
        if (!options?.silent) setLoading(false);
      }
    },
    [
      isAllSales,
      fromDate,
      toDate,
      sellerFilter,
      statusFilter,
      storeFilter,
      analysisMode,
      debouncedQuery,
    ]
  );

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const hasOnlineMlAccount =
    data.schemaReady && data.accounts.some((acc) => acc.status === "online");

  const { realtimeConnected, autoSyncing, lastLiveUpdateAt } = useRealtimeSalesOrders({
    onSalesChange: () => {
      loadDashboard({ silent: true });
    },
    enableAutoSync: hasOnlineMlAccount,
    onAutoSyncComplete: (upserted) => {
      if (upserted > 0) {
        loadDashboard({ silent: true });
      }
    },
  });

  function handleSelectPreset(nextPreset: QuickDatePreset) {
    setPreviousRangeBeforeDay(null);
    if (nextPreset === "all") {
      setPreset("all");
      return;
    }
    const range = computeDatePresetRange(nextPreset);
    setPreset(nextPreset);
    setFromDate(range.from);
    setToDate(range.to);
    if (nextPreset === "today" || nextPreset === "yesterday") {
      setSpotlightDayKey(range.from);
    } else {
      setSpotlightDayKey(null);
    }
  }

  function handleSelectMonth(monthOneBased: number, yearVal = selectedYearNumber) {
    setPreviousRangeBeforeDay(null);
    setSelectedMonthNumber(monthOneBased);
    setSelectedYearNumber(yearVal);
    const range = computeSpecificMonthRange(yearVal, monthOneBased);
    setPreset("specificMonth");
    setFromDate(range.from);
    setToDate(range.to);
    setSpotlightDayKey(null);
  }

  function handleSelectYear(yearVal: number) {
    setPreviousRangeBeforeDay(null);
    setSelectedYearNumber(yearVal);
    const range = computeSpecificYearRange(yearVal);
    setPreset("specificYear");
    setFromDate(range.from);
    setToDate(range.to);
    setSpotlightDayKey(null);
  }

  function handleFilterToSingleDay(dayKey: string) {
    if (!dayKey) return;
    if (preset !== "specificDay") {
      setPreviousRangeBeforeDay({ preset, from: fromDate, to: toDate });
    }
    setPreset("specificDay");
    setFromDate(dayKey);
    setToDate(dayKey);
    setSpotlightDayKey(dayKey);
  }

  function handleRestorePreviousPeriod() {
    setSpotlightDayKey(null);
    if (!previousRangeBeforeDay) {
      handleSelectPreset("thisMonth");
      return;
    }
    setPreset(previousRangeBeforeDay.preset);
    setFromDate(previousRangeBeforeDay.from);
    setToDate(previousRangeBeforeDay.to);
    setPreviousRangeBeforeDay(null);
  }

  /**
   * Seleciona um dia específico na barra superior ou na tabela de fechamento:
   * - Se o dia já faz parte do período carregado em memória, filtra instantaneamente a tabela inferior
   *   sem apagar os botões dos outros dias e sem gastar requisições ao servidor.
   * - Se o usuário digitou no calendário uma data fora do período atual, busca a data no servidor.
   */
  function handleSelectSpotlightDay(nextDayKey: string | null) {
    if (!nextDayKey) {
      if (preset === "specificDay") {
        handleRestorePreviousPeriod();
      } else {
        setSpotlightDayKey(null);
      }
      return;
    }

    setSpotlightDayKey(nextDayKey);
    setActiveSubTab("operational");

    const isOutOfLoadedRange =
      !isAllSales && (nextDayKey < fromDate || nextDayKey > toDate);
    if (isOutOfLoadedRange) {
      handleFilterToSingleDay(nextDayKey);
    }
  }

  async function handleSyncMercadoLivre() {
    setSyncing(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/ml/sales/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          from: isAllSales ? undefined : fromDate || todayBr,
          to: isAllSales ? undefined : toDate || todayBr,
          allSales: isAllSales,
          analysisMode,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(
          json.error || "Não foi possível sincronizar os pedidos com o Mercado Livre."
        );
      }

      markSalesSyncedNow();

      const warnSuffix =
        Array.isArray(json.errors) && json.errors.length > 0
          ? ` (${json.errors.length} alerta: ${json.errors[0].message})`
          : "";
      const modeNote = isAllSales
        ? " (extração fatiada por janelas mensais)"
        : analysisMode === "shipping_date"
        ? " (com lookback de 14 dias + pendentes)"
        : "";

      setFeedback({
        type: "success",
        message: `Sincronização Read-Only concluída${modeNote}: ${json.ordersUpserted} pedidos processados em ${json.accountsSynced} conta(s) ML${warnSuffix}.`,
      });

      await loadDashboard({ silent: true });
    } catch (err) {
      setFeedback({
        type: "error",
        message:
          err instanceof Error ? err.message : "Falha ao sincronizar vendas ML.",
      });
    } finally {
      setSyncing(false);
    }
  }

  const availableYears =
    data.availableYears && data.availableYears.length > 0
      ? data.availableYears
      : [currentYear, currentYear - 1, currentYear - 2];

  // Quando um dia específico está selecionado, filtra instantaneamente os produtos exibidos abaixo
  const displayedOrders = useMemo(() => {
    if (!spotlightDayKey) return data.orders;
    return filterOrdersByAnalysisMode({
      orders: data.orders,
      fromDate: spotlightDayKey,
      toDate: spotlightDayKey,
      analysisMode,
    });
  }, [data.orders, spotlightDayKey, analysisMode]);

  const activeDayLabel = useMemo(() => {
    if (!spotlightDayKey || spotlightDayKey.length < 10) return null;
    const [y, m, d] = spotlightDayKey.split("-");
    return `${d}/${m}/${y}`;
  }, [spotlightDayKey]);

  // Recalcula KPIs e resumos por vendedor para refletir exatamente o dia selecionado (quando ativo)
  const displayedAnalytics = useMemo(() => {
    if (!spotlightDayKey) {
      return {
        kpis: data.kpis,
        sellerSummaries: data.sellerSummaries,
      };
    }
    const computed = computeSalesDashboardAnalytics({
      filteredOrders: displayedOrders,
      sellers: data.sellers,
      analysisMode,
    });
    return {
      kpis: computed.kpis,
      sellerSummaries: computed.sellerSummaries,
    };
  }, [spotlightDayKey, displayedOrders, data.kpis, data.sellerSummaries, data.sellers, analysisMode]);

  const activeSellerCounts = useMemo(() => {
    if (!spotlightDayKey || sellerFilter !== "all") {
      return {
        sellerOrderCounts: data.sellerOrderCounts,
        unassignedCount: data.unassignedCount,
      };
    }
    const counts: Record<string, number> = {};
    let unassigned = 0;
    for (const o of displayedOrders) {
      if (!o.assigned_seller_id) unassigned += 1;
      else counts[o.assigned_seller_id] = (counts[o.assigned_seller_id] ?? 0) + 1;
    }
    return { sellerOrderCounts: counts, unassignedCount: unassigned };
  }, [spotlightDayKey, sellerFilter, displayedOrders, data.sellerOrderCounts, data.unassignedCount]);

  const totalOrdersInPills =
    activeSellerCounts.unassignedCount +
    Object.values(activeSellerCounts.sellerOrderCounts).reduce((a, b) => a + b, 0);

  const csvFromLabel = spotlightDayKey || (isAllSales ? "historico-completo" : fromDate);
  const csvToLabel = spotlightDayKey || (isAllSales ? todayBr : toDate);

  return (
    <>
      <Header platformName="Gestão de Vendas & Repasse por Vendedor" />

      <main className="p-4 flex-1 pb-24">
        <div className="max-w-[1680px] mx-auto space-y-3.5">
          {/* Cabeçalho Principal + Botões de Ação */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-base font-black text-slate-900 tracking-tight">
                  Gestão de Vendas & Repasse por Vendedor
                </h1>
                <span className="px-2 py-0.5 rounded-xs bg-emerald-50 border border-emerald-200 text-emerald-800 text-[10px] font-mono font-bold">
                  ML API READ-ONLY (GET)
                </span>
                <span
                  title={
                    realtimeConnected
                      ? "Conectado ao Supabase Realtime: novas vendas via Webhook entram automaticamente sem recarregar a página."
                      : "Aguardando canal Realtime..."
                  }
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-xs border text-[10px] font-bold ${
                    realtimeConnected
                      ? "bg-sky-50 border-sky-200 text-sky-800"
                      : "bg-slate-100 border-slate-200 text-slate-600"
                  }`}
                >
                  <Radio
                    className={`w-3 h-3 ${
                      realtimeConnected ? "text-emerald-600 animate-pulse" : "text-slate-400"
                    }`}
                  />
                  <span>
                    {autoSyncing
                      ? "Auto-Sync Ativo..."
                      : realtimeConnected
                      ? lastLiveUpdateAt
                        ? `Ao Vivo · ${lastLiveUpdateAt}`
                        : "Ao Vivo (Webhook + Realtime)"
                      : "Modo Local"}
                  </span>
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Conciliação financeira completa (pós-taxas ML, frete + estornos promocionais),
                filtros por <strong>Mês, Ano e Todas as Vendas</strong> e apuração exata por{" "}
                <strong>Data de Envio</strong>.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setDrawerOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded bg-white hover:bg-slate-50 border border-slate-300 text-slate-800 text-xs font-bold transition-colors shadow-2xs"
              >
                <Settings2 className="w-3.5 h-3.5 text-slate-600" />
                Gerenciar Vendedores, Cores & Custos
              </button>

              <button
                type="button"
                disabled={syncing || autoSyncing}
                onClick={handleSyncMercadoLivre}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded bg-[#0F172A] hover:bg-slate-800 disabled:opacity-60 text-white text-xs font-bold transition-colors shadow-2xs"
              >
                {syncing || autoSyncing ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-sky-400" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5 text-sky-400" />
                )}
                {syncing ? "Sincronizando Período..." : "Forçar Sincronização ML"}
              </button>
            </div>
          </div>

          {/* Alertas de Migrations SQL no Supabase */}
          {!data.schemaReady && (
            <div className="p-3.5 rounded bg-amber-50 border border-amber-300 text-amber-950 flex items-start gap-2.5 text-xs">
              <ShieldAlert className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <div>
                <div className="font-bold">
                  Tabelas do módulo ainda não encontradas no Supabase
                </div>
                <p className="text-[11px] text-amber-900 mt-0.5">
                  Execute as migrations de vendas em <code>supabase/migrations/</code> no{" "}
                  <strong>SQL Editor</strong> do painel Supabase.
                </p>
              </div>
            </div>
          )}

          {data.schemaReady && data.shippingDateSchemaReady === false && (
            <div className="p-3.5 rounded bg-amber-50 border border-amber-300 text-amber-950 flex items-start gap-2.5 text-xs">
              <ShieldAlert className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <div>
                <div className="font-bold">
                  Coluna de Data Real de Envio (<code>shipped_at</code>) pendente no Supabase
                </div>
                <p className="text-[11px] text-amber-900 mt-0.5">
                  Execute{" "}
                  <code className="font-mono bg-amber-100 px-1 py-0.5 rounded">
                    supabase/migrations/20261124180000_add_shipped_at_to_ml_sales_orders.sql
                  </code>{" "}
                  e{" "}
                  <code className="font-mono bg-amber-100 px-1 py-0.5 rounded">
                    supabase/migrations/20261125150000_add_manual_shipped_at_to_ml_sales_orders.sql
                  </code>{" "}
                  no <strong>SQL Editor</strong> do Supabase.
                </p>
              </div>
            </div>
          )}

          {data.schemaReady &&
            data.shippingDateSchemaReady !== false &&
            data.manualShippingSchemaReady === false && (
              <div className="p-3 rounded bg-sky-50 border border-sky-300 text-sky-950 flex items-start gap-2.5 text-xs">
                <ShieldAlert className="w-4 h-4 text-sky-700 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold">
                    Nova Migration SQL disponível (Trava de Data Manual vs. API ML):
                  </span>{" "}
                  Execute{" "}
                  <code className="font-mono bg-sky-100 px-1 py-0.5 rounded">
                    supabase/migrations/20261125150000_add_manual_shipped_at_to_ml_sales_orders.sql
                  </code>{" "}
                  no SQL Editor do Supabase para ativar a proteção permanente contra sobrescrita e o botão de reversão para a data oficial do ML.
                </div>
              </div>
            )}

          {/* Feedback de Sincronização / Erros */}
          {feedback && (
            <div
              className={`px-3.5 py-2.5 rounded border flex items-center justify-between text-xs ${
                feedback.type === "success"
                  ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                  : "bg-rose-50 border-rose-200 text-rose-900"
              }`}
            >
              <div className="flex items-center gap-2">
                {feedback.type === "success" ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                )}
                <span className="font-medium">{feedback.message}</span>
              </div>
              <button
                type="button"
                onClick={() => setFeedback(null)}
                className="text-[11px] underline opacity-75 hover:opacity-100"
              >
                Fechar
              </button>
            </div>
          )}

          {/* Barra Superior de Filtros (Modo Venda vs Envio, Atalhos Mês/Ano/Todas, Seletores e Vendedores) */}
          <div className="bg-white border border-[#E2E8F0] rounded p-3 shadow-2xs space-y-3">
            {/* Linha 1: Seletor de Tipo de Análise (Data da Venda vs Dia do Envio) */}
            <div className="flex flex-wrap items-center justify-between gap-2.5 pb-2.5 border-b border-slate-100">
              <AnalysisModeToggle
                value={analysisMode}
                onChange={setAnalysisMode}
                pendingShipmentCount={data.pendingShipmentCount ?? 0}
                backfillMissingCount={data.backfillMissingShippedAtCount ?? 0}
                syncing={syncing || autoSyncing}
                onRequestBackfillSync={handleSyncMercadoLivre}
              />

              <span className="text-[11px] text-slate-500">
                {isAllSales ? (
                  <>
                    Exibindo{" "}
                    <strong className="text-slate-900">
                      Todas as Vendas (Histórico Completo)
                    </strong>{" "}
                    {analysisMode === "shipping_date"
                      ? "com data de envio registrada"
                      : "sincronizadas"}
                  </>
                ) : analysisMode === "shipping_date" ? (
                  <>
                    Exibindo vendas <strong>enviadas</strong> entre{" "}
                    <span className="font-mono font-semibold text-slate-700">{fromDate}</span>{" "}
                    e <span className="font-mono font-semibold text-slate-700">{toDate}</span>
                  </>
                ) : (
                  <>
                    Exibindo vendas <strong>realizadas</strong> entre{" "}
                    <span className="font-mono font-semibold text-slate-700">{fromDate}</span>{" "}
                    e <span className="font-mono font-semibold text-slate-700">{toDate}</span>
                  </>
                )}
              </span>
            </div>

            {/* Linha 2: Atalhos Pré-definidos (Hoje, Ontem, 7 dias, Este Mês, Mês Passado, Este Ano, Todas as Vendas) */}
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-600 mr-1">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  {analysisMode === "shipping_date" ? "Filtro Envio:" : "Período:"}
                </span>

                {(
                  [
                    { id: "today", label: "Hoje" },
                    { id: "yesterday", label: "Ontem" },
                    { id: "last7", label: "Últimos 7 dias" },
                    { id: "thisMonth", label: "Este Mês" },
                    { id: "lastMonth", label: "Mês Passado" },
                    { id: "thisYear", label: "Este Ano" },
                  ] as const
                ).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleSelectPreset(p.id)}
                    className={`px-2.5 py-1 rounded-xs text-[11px] font-bold border transition-colors ${
                      preset === p.id
                        ? "bg-slate-900 text-white border-slate-900"
                        : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}

                <button
                  type="button"
                  onClick={() => handleSelectPreset("all")}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xs text-[11px] font-bold border transition-colors ${
                    preset === "all"
                      ? "bg-emerald-800 text-white border-emerald-900 shadow-2xs"
                      : "bg-emerald-50/70 text-emerald-900 border-emerald-300 hover:bg-emerald-100/80"
                  }`}
                  title="Exibe 100% do histórico de vendas sem limite de datas"
                >
                  <InfinityIcon className="w-3.5 h-3.5" />
                  Todas as Vendas
                </button>
              </div>

              {/* Filtro de Status, Loja ML e Busca */}
              <div className="flex flex-wrap items-center gap-2">
                {data.stores.length > 1 && (
                  <div className="flex items-center gap-1">
                    <Store className="w-3.5 h-3.5 text-slate-400" />
                    <select
                      aria-label="Filtrar por loja Mercado Livre"
                      value={storeFilter}
                      onChange={(e) => setStoreFilter(e.target.value)}
                      className="px-2 py-1 border border-slate-300 rounded-xs text-[11px] font-semibold text-slate-700 bg-white"
                    >
                      <option value="all">Todas as Lojas ML</option>
                      {data.stores.map((st) => (
                        <option key={st} value={st}>
                          {st}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <select
                  aria-label="Filtrar por status do pedido"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                  className="px-2.5 py-1 border border-slate-300 rounded-xs text-[11px] font-semibold text-slate-700 bg-white focus:outline-none focus:border-sky-600"
                >
                  <option value="all">Status: Todos</option>
                  <option value="valid">Válidos (Pagos/Enviados)</option>
                  <option value="cancelled">Cancelados / Devolvidos</option>
                  <option value="unverified">Não Verificados</option>
                </select>

                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1.5" />
                  <input
                    type="text"
                    placeholder="Pedido, MLB, SKU ou cliente..."
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    className="pl-7 pr-2.5 py-1 w-52 border border-slate-300 rounded-xs text-[11px] focus:outline-none focus:border-sky-600"
                  />
                </div>
              </div>
            </div>

            {/* Linha 2.5: Seletores Estruturados por Mês Específico, Ano Específico, Dia Exato e Intervalo Livre */}
            <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center gap-3 text-[11px]">
              {/* Seletor Por Mês */}
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-slate-600 inline-flex items-center gap-1">
                  <CalendarDays className="w-3.5 h-3.5 text-slate-400" />
                  Mês:
                </span>
                <select
                  aria-label="Selecionar mês específico"
                  value={preset === "specificMonth" ? String(selectedMonthNumber) : ""}
                  onChange={(e) => {
                    const m = Number(e.target.value);
                    if (m >= 1 && m <= 12) handleSelectMonth(m, selectedYearNumber);
                  }}
                  className={`px-2 py-1 border rounded-xs font-semibold focus:outline-none ${
                    preset === "specificMonth"
                      ? "bg-slate-900 text-white border-slate-900"
                      : "bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100"
                  }`}
                >
                  <option value="">Escolher Mês...</option>
                  {MONTH_NAMES_PT.map((label, idx) => (
                    <option
                      key={label}
                      value={String(idx + 1)}
                      className="bg-white text-slate-900"
                    >
                      {label} / {selectedYearNumber}
                    </option>
                  ))}
                </select>
              </div>

              {/* Seletor Por Ano */}
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-slate-600">Ano:</span>
                <select
                  aria-label="Filtrar por ano específico"
                  value={
                    preset === "specificYear" || preset === "specificMonth"
                      ? String(selectedYearNumber)
                      : ""
                  }
                  onChange={(e) => {
                    const yr = Number(e.target.value);
                    if (!yr) return;
                    if (preset === "specificMonth") {
                      handleSelectMonth(selectedMonthNumber, yr);
                    } else {
                      handleSelectYear(yr);
                    }
                  }}
                  className={`px-2 py-1 border rounded-xs font-mono font-bold focus:outline-none ${
                    preset === "specificYear"
                      ? "bg-slate-900 text-white border-slate-900"
                      : "bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100"
                  }`}
                >
                  <option value="">Escolher Ano...</option>
                  {availableYears.map((yr) => (
                    <option
                      key={yr}
                      value={String(yr)}
                      className="bg-white text-slate-900"
                    >
                      Ano {yr}
                    </option>
                  ))}
                </select>
              </div>

              <div className="h-4 w-px bg-slate-200 hidden sm:block" />

              {/* Atalho Dia Específico */}
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-emerald-800">Dia Específico:</span>
                <input
                  type="date"
                  aria-label="Filtrar um único dia específico"
                  value={preset === "specificDay" ? fromDate : spotlightDayKey || ""}
                  onChange={(e) => {
                    handleSelectSpotlightDay(e.target.value || null);
                  }}
                  className={`px-2 py-1 border rounded-xs font-mono focus:outline-none ${
                    preset === "specificDay"
                      ? "bg-emerald-900 text-white border-emerald-950 font-bold"
                      : "bg-emerald-50/40 text-slate-800 border-emerald-300 focus:border-emerald-700"
                  }`}
                />
              </div>

              <div className="h-4 w-px bg-slate-200 hidden sm:block" />

              {/* Intervalo Customizado */}
              <div className="flex items-center gap-1">
                <span className="font-semibold text-slate-500">Intervalo:</span>
                <input
                  type="date"
                  aria-label="Data inicial"
                  value={isAllSales ? "" : fromDate}
                  onChange={(e) => {
                    setPreset("custom");
                    setSpotlightDayKey(null);
                    setFromDate(e.target.value);
                  }}
                  className="px-2 py-1 border border-slate-300 rounded-xs font-mono text-slate-800 focus:outline-none focus:border-sky-600"
                />
                <span className="text-slate-400">até</span>
                <input
                  type="date"
                  aria-label="Data final"
                  value={isAllSales ? "" : toDate}
                  onChange={(e) => {
                    setPreset("custom");
                    setSpotlightDayKey(null);
                    setToDate(e.target.value);
                  }}
                  className="px-2 py-1 border border-slate-300 rounded-xs font-mono text-slate-800 focus:outline-none focus:border-sky-600"
                />
              </div>
            </div>

            {/* Linha 3: Pills de Vendedor com Contadores Dinâmicos + Troca Rápida de Cor */}
            <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-bold text-slate-500 mr-1">
                Vendedor:
              </span>

              <button
                type="button"
                onClick={() => setSellerFilter("all")}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xs text-[11px] font-bold border transition-colors ${
                  sellerFilter === "all"
                    ? "bg-sky-600 text-white border-sky-600"
                    : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                }`}
              >
                <span>Todos</span>
                <span
                  className={`px-1.5 py-0.2 rounded-xs font-mono text-[10px] ${
                    sellerFilter === "all"
                      ? "bg-sky-800 text-white"
                      : "bg-slate-200 text-slate-700"
                  }`}
                >
                  {totalOrdersInPills}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setSellerFilter("unassigned")}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xs text-[11px] font-bold border transition-colors ${
                  sellerFilter === "unassigned"
                    ? "bg-amber-600 text-white border-amber-600"
                    : "bg-amber-50/70 text-amber-900 border-amber-200 hover:bg-amber-100/70"
                }`}
              >
                <span>Sem Vendedor (Pendentes)</span>
                <span
                  className={`px-1.5 py-0.2 rounded-xs font-mono text-[10px] ${
                    sellerFilter === "unassigned"
                      ? "bg-amber-800 text-white"
                      : "bg-amber-200/80 text-amber-950"
                  }`}
                >
                  {activeSellerCounts.unassignedCount}
                </span>
              </button>

              {data.sellers
                .filter((s) => s.active || (data.sellerOrderCounts[s.id] ?? 0) > 0)
                .map((seller) => {
                  const count = activeSellerCounts.sellerOrderCounts[seller.id] ?? 0;
                  const active = sellerFilter === seller.id;
                  return (
                    <button
                      key={seller.id}
                      type="button"
                      onClick={() => setSellerFilter(seller.id)}
                      style={
                        active
                          ? {
                              backgroundColor: seller.color_hex,
                              borderColor: seller.color_hex,
                              color: "#FFFFFF",
                            }
                          : undefined
                      }
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xs text-[11px] font-bold border transition-colors ${
                        active
                          ? "shadow-2xs"
                          : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                      }`}
                    >
                      <SellerQuickColorPopover
                        seller={seller}
                        sizeClassName="w-2.5 h-2.5"
                        onColorSaved={() => loadDashboard({ silent: true })}
                      />
                      <span>{seller.name}</span>
                      <span
                        className={`px-1.5 py-0.2 rounded-xs font-mono text-[10px] ${
                          active ? "bg-black/25 text-white" : "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {count}
                      </span>
                    </button>
                  );
                })}
            </div>
          </div>

          {/* Painel Interativo de Resultado Obtido por Dia Específico (Filtra os produtos abaixo em 1 clique) */}
          <ShippingDaySpotlightBar
            dailyClosing={data.dailyClosing}
            sellers={data.sellers}
            analysisMode={analysisMode}
            selectedDayKey={spotlightDayKey}
            onSelectDayKey={handleSelectSpotlightDay}
            filteredDayOrdersCount={displayedOrders.length}
            totalPeriodOrdersCount={data.orders.length}
            onScrollToProducts={() => {
              setActiveSubTab("operational");
              document
                .getElementById("vendas-tabela-produtos")
                ?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
          />

          {/* KPIs Financeiros & Cards Lado a Lado por Vendedor */}
          <SalesKpiSection
            kpis={displayedAnalytics.kpis}
            sellerSummaries={displayedAnalytics.sellerSummaries}
            selectedSellerId={sellerFilter}
            analysisMode={analysisMode}
            selectedDayLabel={activeDayLabel}
            onSelectSeller={(id) => setSellerFilter(id)}
            onRefresh={() => loadDashboard({ silent: true })}
          />

          {/* Navegação entre Sub-Abas: Operacional vs Consolidado Dia a Dia */}
          <div
            id="vendas-tabela-produtos"
            className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pt-1"
          >
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setActiveSubTab("operational")}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold border-b-2 transition-colors ${
                    activeSubTab === "operational"
                      ? "border-slate-900 text-slate-900 bg-white rounded-t"
                      : "border-transparent text-slate-500 hover:text-slate-800"
                  }`}
                >
                  <ListChecks className="w-3.5 h-3.5" />
                  {activeDayLabel
                    ? analysisMode === "shipping_date"
                      ? `Produtos Enviados em ${activeDayLabel} (${displayedOrders.length})`
                      : `Produtos Vendidos em ${activeDayLabel} (${displayedOrders.length})`
                    : analysisMode === "shipping_date"
                    ? `Envios Operacionais Dia a Dia (${displayedOrders.length})`
                    : `Visão Operacional Dia a Dia (${displayedOrders.length})`}
                </button>

                <button
                  type="button"
                  onClick={() => setActiveSubTab("closing")}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold border-b-2 transition-colors ${
                    activeSubTab === "closing"
                      ? "border-slate-900 text-slate-900 bg-white rounded-t"
                      : "border-transparent text-slate-500 hover:text-slate-800"
                  }`}
                >
                  <Table2 className="w-3.5 h-3.5" />
                  {analysisMode === "shipping_date"
                    ? `Consolidado por Dia do Envio (${data.dailyClosing.length})`
                    : `Consolidado Dia a Dia (Fechamento) (${data.dailyClosing.length})`}
                </button>
              </div>

              {activeDayLabel && (
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 mb-1 rounded-xs bg-emerald-50 border border-emerald-300 text-emerald-950 text-[11px] font-bold">
                  <Filter className="w-3 h-3 text-emerald-700" />
                  <span>
                    Filtrando somente {activeDayLabel} ({displayedOrders.length} de{" "}
                    {data.orders.length} do período)
                  </span>
                  <button
                    type="button"
                    onClick={() => handleSelectSpotlightDay(null)}
                    className="ml-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-xs bg-white hover:bg-emerald-100 border border-emerald-300 text-[10px] font-bold text-emerald-900 cursor-pointer"
                    title="Voltar a mostrar os produtos de todos os dias do período"
                  >
                    <RotateCcw className="w-2.5 h-2.5" />
                    Ver todos
                  </button>
                </div>
              )}
            </div>

            {activeSubTab === "operational" && displayedOrders.length > 0 && (
              <button
                type="button"
                onClick={() =>
                  exportDetailedOrdersToCsv({
                    orders: displayedOrders,
                    sellers: data.sellers,
                    from: csvFromLabel,
                    to: csvToLabel,
                    analysisMode,
                  })
                }
                className="inline-flex items-center gap-1.5 px-2.5 py-1 mb-1 rounded-xs border border-slate-300 bg-white hover:bg-slate-50 text-[11px] font-semibold text-slate-700 cursor-pointer"
              >
                <Download className="w-3 h-3 text-emerald-700" />
                {activeDayLabel
                  ? `Exportar Dia ${activeDayLabel} (CSV)`
                  : "Exportar Pedidos Filtrados (CSV)"}
              </button>
            )}
          </div>

          {/* Conteúdo da Sub-Aba Ativa */}
          {loading ? (
            <div className="bg-white border border-[#E2E8F0] rounded p-12 flex items-center justify-center gap-2 text-xs text-slate-500">
              <Loader2 className="w-4 h-4 animate-spin text-sky-600" />
              <span>
                {analysisMode === "shipping_date"
                  ? "Calculando apuração por data de envio..."
                  : "Calculando repasses, taxas ML e fechamento do período..."}
              </span>
            </div>
          ) : activeSubTab === "operational" ? (
            <DailySalesTable
              orders={displayedOrders}
              sellers={data.sellers}
              templates={data.templates}
              analysisMode={analysisMode}
              onRefresh={() => loadDashboard({ silent: true })}
            />
          ) : (
            <DailyClosingTable
              rows={data.dailyClosing}
              sellers={data.sellers}
              from={csvFromLabel}
              to={csvToLabel}
              analysisMode={analysisMode}
              selectedDayKey={spotlightDayKey}
              onSelectDay={(dayKey) =>
                handleSelectSpotlightDay(spotlightDayKey === dayKey ? null : dayKey)
              }
            />
          )}
        </div>
      </main>

      {/* Drawer de Gestão de Vendedores, Cores e Templates MLB */}
      <ManageSellersAndTemplatesDrawer
        open={drawerOpen}
        sellers={data.sellers}
        templates={data.templates}
        onClose={() => setDrawerOpen(false)}
        onRefresh={() => loadDashboard({ silent: true })}
      />
    </>
  );
}
