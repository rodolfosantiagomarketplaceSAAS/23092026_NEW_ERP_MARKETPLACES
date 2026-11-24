"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Header } from "@/components/layout/Header";
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Download,
  ListChecks,
  Loader2,
  RefreshCw,
  Search,
  Settings2,
  ShieldAlert,
  Store,
  Table2,
} from "lucide-react";
import type { MlSalesDashboardResponse } from "@/types/ml-sales";
import {
  computeDatePresetRange,
  exportDetailedOrdersToCsv,
  getTodayBrazilISO,
} from "@/components/vendas/formatters";
import { SalesKpiSection } from "@/components/vendas/SalesKpiSection";
import { DailySalesTable } from "@/components/vendas/DailySalesTable";
import { DailyClosingTable } from "@/components/vendas/DailyClosingTable";
import { ManageSellersAndTemplatesDrawer } from "@/components/vendas/ManageSellersAndTemplatesDrawer";

type DatePreset = "today" | "yesterday" | "last7" | "thisMonth" | "lastMonth" | "custom";
type StatusFilter = "all" | "valid" | "cancelled" | "unverified";
type SubTab = "operational" | "closing";

const EMPTY_DASHBOARD: MlSalesDashboardResponse = {
  success: true,
  schemaReady: true,
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
  const initialRange = computeDatePresetRange("last7");

  const [preset, setPreset] = useState<DatePreset>("last7");
  const [fromDate, setFromDate] = useState<string>(initialRange.from);
  const [toDate, setToDate] = useState<string>(initialRange.to);
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

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchInput.trim());
    }, 280);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({
        from: fromDate,
        to: toDate,
        seller: sellerFilter,
        status: statusFilter,
        store: storeFilter,
      });
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
      setFeedback({
        type: "error",
        message:
          err instanceof Error ? err.message : "Erro ao carregar vendas do período.",
      });
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate, sellerFilter, statusFilter, storeFilter, debouncedQuery]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  function handleSelectPreset(nextPreset: Exclude<DatePreset, "custom">) {
    const range = computeDatePresetRange(nextPreset);
    setPreset(nextPreset);
    setFromDate(range.from);
    setToDate(range.to);
  }

  async function handleSyncMercadoLivre() {
    setSyncing(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/ml/sales/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          from: fromDate || getTodayBrazilISO(),
          to: toDate || getTodayBrazilISO(),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(
          json.error || "Não foi possível sincronizar os pedidos com o Mercado Livre."
        );
      }

      const warnSuffix =
        Array.isArray(json.errors) && json.errors.length > 0
          ? ` (${json.errors.length} alerta: ${json.errors[0].message})`
          : "";

      setFeedback({
        type: "success",
        message: `Sincronização Read-Only concluída: ${json.ordersUpserted} pedidos processados em ${json.accountsSynced} conta(s) ML${warnSuffix}.`,
      });

      await loadDashboard();
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

  const totalOrdersInPills =
    data.unassignedCount +
    Object.values(data.sellerOrderCounts).reduce((a, b) => a + b, 0);

  return (
    <>
      <Header platformName="Gestão de Vendas & Repasse por Vendedor" />

      <main className="p-4 flex-1 pb-20">
        <div className="max-w-[1680px] mx-auto space-y-3.5">
          {/* Cabeçalho Principal + Botões de Ação */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-black text-slate-900 tracking-tight">
                  Gestão de Vendas & Repasse por Vendedor
                </h1>
                <span className="px-2 py-0.5 rounded-xs bg-emerald-50 border border-emerald-200 text-emerald-800 text-[10px] font-mono font-bold">
                  ML API READ-ONLY (GET)
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Conciliação diária de repasse limpo (pós-taxas ML, frete + estornos promocionais),
                custos operacionais e fechamento por sócio/operador.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setDrawerOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded bg-white hover:bg-slate-50 border border-slate-300 text-slate-800 text-xs font-bold transition-colors shadow-2xs"
              >
                <Settings2 className="w-3.5 h-3.5 text-slate-600" />
                Gerenciar Vendedores & Custos Padrão
              </button>

              <button
                type="button"
                disabled={syncing}
                onClick={handleSyncMercadoLivre}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded bg-[#0F172A] hover:bg-slate-800 disabled:opacity-60 text-white text-xs font-bold transition-colors shadow-2xs"
              >
                {syncing ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-sky-400" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5 text-sky-400" />
                )}
                {syncing ? "Sincronizando ML..." : "Sincronizar Vendas ML"}
              </button>
            </div>
          </div>

          {/* Alerta se a migration SQL ainda não foi executada no Supabase */}
          {!data.schemaReady && (
            <div className="p-3.5 rounded bg-amber-50 border border-amber-300 text-amber-950 flex items-start gap-2.5 text-xs">
              <ShieldAlert className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <div>
                <div className="font-bold">
                  Tabelas do módulo ainda não encontradas no Supabase
                </div>
                <p className="text-[11px] text-amber-900 mt-0.5">
                  Execute o arquivo de migration{" "}
                  <code className="font-mono bg-amber-100 px-1 py-0.5 rounded">
                    supabase/migrations/20261124120000_create_ml_sales_and_seller_transfers.sql
                  </code>{" "}
                  no <strong>SQL Editor</strong> do seu painel Supabase para ativar a persistência
                  de vendedores, custos padrão e pedidos sincronizados.
                </p>
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

          {/* Barra Superior de Filtros (Datas, Loja, Status, Busca e Pills de Vendedor) */}
          <div className="bg-white border border-[#E2E8F0] rounded p-3 shadow-2xs space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              {/* Atalhos de Datas + Intervalo Customizado */}
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-600 mr-1">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  Período:
                </span>

                {(
                  [
                    { id: "today", label: "Hoje" },
                    { id: "yesterday", label: "Ontem" },
                    { id: "last7", label: "Últimos 7 dias" },
                    { id: "thisMonth", label: "Este Mês" },
                    { id: "lastMonth", label: "Mês Passado" },
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

                <div className="flex items-center gap-1 ml-1">
                  <input
                    type="date"
                    aria-label="Data inicial"
                    value={fromDate}
                    onChange={(e) => {
                      setPreset("custom");
                      setFromDate(e.target.value);
                    }}
                    className="px-2 py-1 border border-slate-300 rounded-xs text-[11px] font-mono text-slate-800 focus:outline-none focus:border-sky-600"
                  />
                  <span className="text-[11px] text-slate-400">até</span>
                  <input
                    type="date"
                    aria-label="Data final"
                    value={toDate}
                    onChange={(e) => {
                      setPreset("custom");
                      setToDate(e.target.value);
                    }}
                    className="px-2 py-1 border border-slate-300 rounded-xs text-[11px] font-mono text-slate-800 focus:outline-none focus:border-sky-600"
                  />
                </div>
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

            {/* Pills de Vendedor com Contadores Dinâmicos */}
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
                  {data.unassignedCount}
                </span>
              </button>

              {data.sellers
                .filter((s) => s.active || (data.sellerOrderCounts[s.id] ?? 0) > 0)
                .map((seller) => {
                  const count = data.sellerOrderCounts[seller.id] ?? 0;
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
                      {!active && (
                        <span
                          className="w-2 h-2 rounded-xs shrink-0"
                          style={{ backgroundColor: seller.color_hex }}
                        />
                      )}
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

          {/* KPIs Financeiros & Cards Lado a Lado por Vendedor */}
          <SalesKpiSection
            kpis={data.kpis}
            sellerSummaries={data.sellerSummaries}
            selectedSellerId={sellerFilter}
            onSelectSeller={(id) => setSellerFilter(id)}
          />

          {/* Navegação entre Sub-Abas: Operacional vs Consolidado Dia a Dia */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pt-1">
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
                Visão Operacional Dia a Dia ({data.orders.length})
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
                Consolidado Dia a Dia (Fechamento) ({data.dailyClosing.length})
              </button>
            </div>

            {activeSubTab === "operational" && data.orders.length > 0 && (
              <button
                type="button"
                onClick={() =>
                  exportDetailedOrdersToCsv({
                    orders: data.orders,
                    sellers: data.sellers,
                    from: fromDate,
                    to: toDate,
                  })
                }
                className="inline-flex items-center gap-1.5 px-2.5 py-1 mb-1 rounded-xs border border-slate-300 bg-white hover:bg-slate-50 text-[11px] font-semibold text-slate-700"
              >
                <Download className="w-3 h-3 text-emerald-700" />
                Exportar Pedidos Filtrados (CSV)
              </button>
            )}
          </div>

          {/* Conteúdo da Sub-Aba Ativa */}
          {loading ? (
            <div className="bg-white border border-[#E2E8F0] rounded p-12 flex items-center justify-center gap-2 text-xs text-slate-500">
              <Loader2 className="w-4 h-4 animate-spin text-sky-600" />
              <span>Calculando repasses, taxas ML e fechamento do período...</span>
            </div>
          ) : activeSubTab === "operational" ? (
            <DailySalesTable
              orders={data.orders}
              sellers={data.sellers}
              templates={data.templates}
              onRefresh={loadDashboard}
            />
          ) : (
            <DailyClosingTable
              rows={data.dailyClosing}
              sellers={data.sellers}
              from={fromDate}
              to={toDate}
            />
          )}
        </div>
      </main>

      {/* Drawer de Gestão de Vendedores e Templates MLB */}
      <ManageSellersAndTemplatesDrawer
        open={drawerOpen}
        sellers={data.sellers}
        templates={data.templates}
        onClose={() => setDrawerOpen(false)}
        onRefresh={loadDashboard}
      />
    </>
  );
}

