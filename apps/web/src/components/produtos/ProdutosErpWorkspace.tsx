"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Header } from "@/components/layout/Header";
import {
  AlertTriangle,
  ArrowDownUp,
  Box,
  Building2,
  CheckCircle2,
  Database,
  Eye,
  Layers,
  Link2,
  Loader2,
  Mail,
  MapPin,
  Package,
  PackagePlus,
  Pencil,
  Phone,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  TrendingDown,
} from "lucide-react";
import type {
  ErpListingLink,
  ErpOverviewResponse,
  ErpPpfRoll,
  ErpProductType,
  ErpProductWithSummary,
  ErpRollConsumptionSummary,
  ErpSalesConsumptionItem,
  ErpSupplier,
} from "@/types/erp-products";
import { PpfRollFormModal } from "./PpfRollFormModal";
import { ProductFormModal } from "./ProductFormModal";
import { LinkListingModal } from "./LinkListingModal";
import { StockMovementModal } from "./StockMovementModal";
import { ProductDetailDrawer } from "./ProductDetailDrawer";
import { SupplierFormModal } from "./SupplierFormModal";

type SubTab = "produtos" | "bobinas" | "fornecedores" | "vinculos" | "consumo";

function formatBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function getDefaultDates() {
  const now = new Date();
  const to = now.toISOString().slice(0, 10);
  const from = new Date(now.getTime() - 29 * 86400000).toISOString().slice(0, 10);
  return { from, to };
}

export function ProdutosErpWorkspace() {
  const [activeTab, setActiveTab] = useState<SubTab>("produtos");
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<ErpOverviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Filtros de produtos
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | ErpProductType>("all");

  // Modais e Drawers
  const [rollModalOpen, setRollModalOpen] = useState(false);
  const [editingRoll, setEditingRoll] = useState<ErpPpfRoll | null>(null);

  const [supplierModalOpen, setSupplierModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<ErpSupplier | null>(null);
  const [supplierSearch, setSupplierSearch] = useState("");

  const [productModalOpen, setProductModalOpen] = useState(false);
  const [productDefaultType, setProductDefaultType] = useState<ErpProductType>("ppf_piece");
  const [editingProduct, setEditingProduct] = useState<ErpProductWithSummary | null>(null);

  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [editingLink, setEditingLink] = useState<ErpListingLink | null>(null);

  const [stockTarget, setStockTarget] = useState<
    | { type: "product"; product: ErpProductWithSummary }
    | { type: "ppf_roll"; roll: ErpPpfRoll }
    | null
  >(null);

  const [detailProduct, setDetailProduct] = useState<ErpProductWithSummary | null>(null);

  // Aba Consumo nas Vendas
  const defaultDates = useMemo(() => getDefaultDates(), []);
  const [dateFrom, setDateFrom] = useState(defaultDates.from);
  const [dateTo, setDateTo] = useState(defaultDates.to);
  const [consumptionLoading, setConsumptionLoading] = useState(false);
  const [consumptionData, setConsumptionData] = useState<{
    items: ErpSalesConsumptionItem[];
    rollsSummary: ErpRollConsumptionSummary[];
    totals: {
      linkedOrdersCount: number;
      unlinkedOrdersCount: number;
      pendingDeductionOrdersCount: number;
      totalProductCost: number;
      totalPpfMeters: number;
      totalPpfAreaM2: number;
    };
  } | null>(null);
  const [deductingBusy, setDeductingBusy] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 4000);
  }, []);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/erp/overview", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Erro ao carregar dados do ERP.");
      }
      setOverview(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar módulo de produtos.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadSalesConsumption = useCallback(async () => {
    setConsumptionLoading(true);
    try {
      const res = await fetch(
        `/api/erp/stock/sales-consumption?dateFrom=${encodeURIComponent(dateFrom)}&dateTo=${encodeURIComponent(dateTo)}`,
        { cache: "no-store" }
      );
      const data = await res.json();
      if (res.ok && data.success) {
        setConsumptionData({
          items: data.items ?? [],
          rollsSummary: data.rollsSummary ?? [],
          totals: data.totals,
        });
      }
    } finally {
      setConsumptionLoading(false);
    }
  }, [dateFrom, dateTo]);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  useEffect(() => {
    if (activeTab === "consumo" && overview?.schemaReady) {
      loadSalesConsumption();
    }
  }, [activeTab, overview?.schemaReady, loadSalesConsumption]);

  const filteredProducts = useMemo(() => {
    const list = overview?.products ?? [];
    const q = search.trim().toLowerCase();
    return list.filter((p) => {
      if (typeFilter !== "all" && p.product_type !== typeFilter) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        p.code.toLowerCase().includes(q) ||
        (p.ean || "").toLowerCase().includes(q) ||
        (p.category || "").toLowerCase().includes(q)
      );
    });
  }, [overview?.products, search, typeFilter]);

  const filteredSuppliers = useMemo(() => {
    const list = overview?.suppliers ?? [];
    const q = supplierSearch.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (s) =>
        s.trade_name.toLowerCase().includes(q) ||
        (s.legal_name || "").toLowerCase().includes(q) ||
        s.code.toLowerCase().includes(q) ||
        (s.document_number || "").toLowerCase().includes(q) ||
        (s.city || "").toLowerCase().includes(q)
    );
  }, [overview?.suppliers, supplierSearch]);

  async function handleDeleteSupplier(supplier: ErpSupplier) {
    if (!confirm(`Deseja excluir o fornecedor "${supplier.trade_name}" (${supplier.code})?`)) return;
    const res = await fetch(`/api/erp/suppliers?id=${supplier.id}`, { method: "DELETE" });
    const data = await res.json();
    if (res.ok && data.success) {
      showToast("Fornecedor excluído com sucesso.");
      loadOverview();
    } else {
      alert(data.error || "Erro ao excluir fornecedor.");
    }
  }

  async function handleDeleteProduct(product: ErpProductWithSummary) {
    if (!confirm(`Deseja excluir o produto "${product.name}" (${product.sku})?`)) return;
    const res = await fetch(`/api/erp/products?id=${product.id}`, { method: "DELETE" });
    const data = await res.json();
    if (res.ok && data.success) {
      showToast("Produto excluído com sucesso.");
      loadOverview();
    } else {
      alert(data.error || "Erro ao excluir produto.");
    }
  }

  async function handleDeleteRoll(roll: ErpPpfRoll) {
    if (!confirm(`Deseja excluir a bobina "${roll.name}" (${roll.code})?`)) return;
    const res = await fetch(`/api/erp/ppf-rolls?id=${roll.id}`, { method: "DELETE" });
    const data = await res.json();
    if (res.ok && data.success) {
      showToast("Bobina excluída com sucesso.");
      loadOverview();
    } else {
      alert(data.error || "Erro ao excluir bobina.");
    }
  }

  async function handleDeleteLink(link: ErpListingLink) {
    if (!confirm(`Remover vínculo do anúncio ${link.external_listing_id}?`)) return;
    const res = await fetch(`/api/erp/listing-links?id=${link.id}`, { method: "DELETE" });
    const data = await res.json();
    if (res.ok && data.success) {
      showToast("Vínculo removido.");
      loadOverview();
    }
  }

  async function handleSyncLinkCost(link: ErpListingLink) {
    const res = await fetch("/api/erp/listing-links", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: link.id,
        platform: link.platform,
        external_listing_id: link.external_listing_id,
        listing_sku: link.listing_sku,
        listing_title: link.listing_title,
        listing_thumbnail: link.listing_thumbnail,
        product_id: link.product_id,
        quantity_per_sale: link.quantity_per_sale,
        auto_sync_cost_template: true,
        sync_now: true,
        apply_to_unedited_orders: true,
        notes: link.notes,
      }),
    });
    const data = await res.json();
    if (res.ok && data.success) {
      showToast(
        `Custo sincronizado com ${link.external_listing_id} (${data.syncResult?.ordersUpdated ?? 0} pedidos atualizados).`
      );
      loadOverview();
    } else {
      alert(data.error || "Falha ao sincronizar custo.");
    }
  }

  async function handleDeductSalesBatch() {
    if (
      !confirm(
        `Dar baixa em lote no estoque e no saldo em metros das bobinas PPF para as vendas pendentes entre ${dateFrom} e ${dateTo}? (Pedidos já baixados não serão duplicados)`
      )
    ) {
      return;
    }
    setDeductingBusy(true);
    try {
      const res = await fetch("/api/erp/stock/sales-consumption", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dateFrom,
          dateTo,
          deductProducts: true,
          deductPpfRolls: true,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Erro ao baixar estoque das vendas.");
      }
      showToast(
        `Baixa concluída: ${data.processedOrders} pedidos processados, ${data.rollsUpdated} bobina(s) e ${data.productsUpdated} produto(s) atualizados.`
      );
      await Promise.all([loadOverview(), loadSalesConsumption()]);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Erro na baixa em lote.");
    } finally {
      setDeductingBusy(false);
    }
  }

  const kpis = overview?.kpis;

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col">
      <Header />

      <main className="flex-1 p-4 sm:p-6 max-w-[1600px] w-full mx-auto space-y-5">
        <div className="flex flex-col gap-0.5">
          <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">
            Cadastro Produtos, Kits e Fornecedores
          </h1>
          <p className="text-xs text-slate-500">
            Cadastro mestre ERP padrão Tiny/Bling • Produtos, Kits (BOM), Fornecedores/Fabricantes, Bobinas PPF e vínculo com Anúncios & Vendas
          </p>
        </div>

        {overview && overview.schemaReady && overview.suppliersSchemaReady === false && (
          <div className="p-4 rounded-2xl bg-amber-50 border border-amber-300 flex items-start gap-3">
            <Database className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-900">
              <strong>Migração SQL de Fornecedores pendente no Supabase:</strong> execute{" "}
              <code>supabase/migrations/20261127140000_create_erp_suppliers.sql</code> no SQL Editor
              do Supabase para ativar o cadastro de Fornecedores/Fabricantes e o vínculo nos produtos e bobinas.
            </div>
          </div>
        )}
        {toastMsg && (
          <div className="fixed bottom-5 right-5 z-50 bg-slate-900 text-white px-4 py-3 rounded-xl shadow-xl flex items-center gap-2 text-xs font-semibold">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            {toastMsg}
          </div>
        )}

        {/* Aviso caso a migração SQL ainda não tenha sido aplicada no Supabase */}
        {overview && !overview.schemaReady && (
          <div className="p-5 rounded-2xl bg-amber-50 border border-amber-300 flex items-start gap-3">
            <Database className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-1 text-xs text-amber-900">
              <h3 className="text-sm font-bold">
                Migração SQL pendente no Supabase para o módulo Produtos & Bobinas PPF
              </h3>
              <p>
                Para ativar as tabelas <code>erp_ppf_rolls</code>, <code>erp_products</code>,{" "}
                <code>erp_kit_items</code>, <code>erp_listing_links</code>,{" "}
                <code>erp_stock_movements</code> e o bucket de fotos <code>erp-product-images</code>,
                execute o arquivo{" "}
                <code>supabase/migrations/20261127100000_create_erp_products_kits_and_ppf_rolls.sql</code>{" "}
                no SQL Editor do seu Supabase e clique em Atualizar.
              </p>
            </div>
          </div>
        )}

        {error && (
          <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
            {error}
          </div>
        )}

        {/* Barra de Ações Rápidas */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5 bg-white p-1 rounded-xl border border-slate-200 shadow-2xs">
            {(
              [
                { id: "produtos", label: "Produtos & Kits", icon: Box, count: kpis?.totalProducts },
                { id: "bobinas", label: "Bobinas PPF", icon: Layers, count: kpis?.totalRolls },
                {
                  id: "fornecedores",
                  label: "Fornecedores",
                  icon: Building2,
                  count: kpis?.totalSuppliers,
                },
                {
                  id: "vinculos",
                  label: "Vínculos c/ Anúncios",
                  icon: Link2,
                  count: kpis?.totalLinkedListings,
                },
                { id: "consumo", label: "Consumo Vendas & Kardex", icon: TrendingDown },
              ] as const
            ).map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all ${
                    activeTab === tab.id
                      ? "bg-sky-600 text-white shadow-xs"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {tab.label}
                  {"count" in tab && tab.count !== undefined && (
                    <span
                      className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                        activeTab === tab.id
                          ? "bg-white/20 text-white"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {tab.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setEditingSupplier(null);
                setSupplierModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-amber-50 hover:border-amber-300 shadow-2xs"
            >
              <Building2 className="w-3.5 h-3.5 text-amber-600" />
              Novo Fornecedor
            </button>
            <button
              type="button"
              onClick={() => {
                setEditingRoll(null);
                setRollModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 shadow-2xs"
            >
              <Layers className="w-3.5 h-3.5 text-sky-600" />
              Nova Bobina PPF
            </button>
            <button
              type="button"
              onClick={() => {
                setEditingProduct(null);
                setProductDefaultType("kit");
                setProductModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-700 shadow-xs"
            >
              <Package className="w-3.5 h-3.5" />
              Novo Kit
            </button>
            <button
              type="button"
              onClick={() => {
                setEditingProduct(null);
                setProductDefaultType("ppf_piece");
                setProductModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-sky-600 text-white hover:bg-sky-700 shadow-xs"
            >
              <PackagePlus className="w-3.5 h-3.5" />
              Novo Produto
            </button>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-2xs">
            <span className="text-[11px] font-semibold text-slate-500 uppercase">
              Catálogo ERP
            </span>
            <p className="text-2xl font-extrabold text-slate-900 mt-1">
              {kpis?.totalProducts ?? 0}
            </p>
            <span className="text-[11px] text-slate-500">
              {kpis?.totalPpfPieces ?? 0} PPF • {kpis?.totalKits ?? 0} Kits •{" "}
              {kpis?.totalSimple ?? 0} Simples
            </span>
          </div>

          <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-2xs">
            <span className="text-[11px] font-semibold text-sky-700 uppercase">
              Saldo Bobinas PPF
            </span>
            <p className="text-2xl font-extrabold text-sky-700 mt-1">
              {(kpis?.totalRemainingRollMeters ?? 0).toFixed(2).replace(".", ",")} m
            </p>
            <span className="text-[11px] text-slate-500">
              {kpis?.totalRolls ?? 0} bobina(s) ativa(s)
            </span>
          </div>

          <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-2xs">
            <span className="text-[11px] font-semibold text-emerald-700 uppercase">
              Capital em Estoque
            </span>
            <p className="text-2xl font-extrabold text-emerald-700 mt-1">
              {formatBRL(kpis?.inventoryValue ?? 0)}
            </p>
            <span className="text-[11px] text-slate-500">Produtos + metros de bobina</span>
          </div>

          <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-2xs">
            <span className="text-[11px] font-semibold text-indigo-700 uppercase">
              Anúncios Vinculados
            </span>
            <p className="text-2xl font-extrabold text-indigo-700 mt-1">
              {kpis?.totalLinkedListings ?? 0}
            </p>
            <span className="text-[11px] text-slate-500">MLB / Shopee conectados</span>
          </div>

          <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-2xs col-span-2 md:col-span-1">
            <span className="text-[11px] font-semibold text-amber-700 uppercase">
              Alertas de Reposição
            </span>
            <p
              className={`text-2xl font-extrabold mt-1 ${
                (kpis?.lowStockCount ?? 0) + (kpis?.lowRollCount ?? 0) > 0
                  ? "text-amber-600"
                  : "text-slate-800"
              }`}
            >
              {(kpis?.lowStockCount ?? 0) + (kpis?.lowRollCount ?? 0)}
            </p>
            <span className="text-[11px] text-slate-500">
              {kpis?.lowRollCount ?? 0} bobina(s) • {kpis?.lowStockCount ?? 0} prod(s)
            </span>
          </div>
        </div>

        {/* CONTEÚDO DAS ABAS */}
        {loading && !overview ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-14 flex flex-col items-center justify-center gap-2 text-slate-400">
            <Loader2 className="w-7 h-7 animate-spin text-sky-600" />
            <span className="text-xs font-medium">Carregando cadastro de produtos ERP...</span>
          </div>
        ) : activeTab === "produtos" ? (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
            {/* Filter bar */}
            <div className="p-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
              <div className="relative flex-1 min-w-[240px] max-w-md">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar por nome, SKU, código, EAN ou categoria..."
                  className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div className="flex items-center gap-1.5">
                {(
                  [
                    { id: "all", label: "Todos" },
                    { id: "ppf_piece", label: "Peças PPF" },
                    { id: "kit", label: "Kits" },
                    { id: "simple", label: "Simples / Insumos" },
                  ] as const
                ).map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setTypeFilter(f.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                      typeFilter === f.id
                        ? "bg-slate-900 text-white"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {filteredProducts.length === 0 ? (
              <div className="p-12 text-center space-y-2">
                <Box className="w-10 h-10 text-slate-300 mx-auto" />
                <p className="text-sm font-bold text-slate-700">Nenhum produto encontrado</p>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  Comece cadastrando sua Bobina PPF (ex: 12m × 1,52m a R$ 220/m), depois suas Peças PPF e Kits para vincular aos anúncios.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase">
                      <th className="py-3 px-4">Produto / Código / SKU</th>
                      <th className="py-3 px-3">Tipo</th>
                      <th className="py-3 px-3">Medidas & Peso</th>
                      <th className="py-3 px-3">Consumo PPF</th>
                      <th className="py-3 px-3 text-right">Custo Real</th>
                      <th className="py-3 px-3 text-center">Estoque</th>
                      <th className="py-3 px-3 text-center">Anúncios</th>
                      <th className="py-3 px-4 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {filteredProducts.map((p) => {
                      const isLowStock =
                        p.product_type !== "kit" &&
                        Number(p.min_stock_quantity || 0) > 0 &&
                        Number(p.stock_quantity || 0) <= Number(p.min_stock_quantity || 0);
                      return (
                        <tr
                          key={p.id}
                          className="hover:bg-sky-50/30 transition-colors group"
                        >
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-3">
                              <div className="w-11 h-11 rounded-xl border border-slate-200 bg-slate-50 overflow-hidden shrink-0 flex items-center justify-center">
                                {p.thumbnail_url ? (
                                  <img
                                    src={p.thumbnail_url}
                                    alt={p.name}
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  <Box className="w-5 h-5 text-slate-300" />
                                )}
                              </div>
                              <div className="min-w-0">
                                <button
                                  type="button"
                                  onClick={() => setDetailProduct(p)}
                                  className="font-bold text-slate-900 hover:text-sky-700 text-left line-clamp-1"
                                >
                                  {p.name}
                                </button>
                                <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 mt-0.5">
                                  <span className="font-mono font-semibold text-slate-700">
                                    {p.sku}
                                  </span>
                                  <span>• Cód: {p.code}</span>
                                  {p.ean && <span>• EAN: {p.ean}</span>}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-3">
                            {p.product_type === "kit" ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-700">
                                KIT ({p.kit_items?.length || 0} itens)
                              </span>
                            ) : p.product_type === "ppf_piece" ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-100 text-sky-700">
                                PEÇA PPF
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">
                                SIMPLES
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-3 text-slate-600">
                            {p.width || p.height ? (
                              <div>
                                <span className="font-medium text-slate-800">
                                  {p.width || 0} × {p.height || 0} {p.dimension_unit}
                                </span>
                                <span className="block text-[10px] text-slate-400">
                                  {p.computed_total_weight_grams}g
                                </span>
                              </div>
                            ) : (
                              <span className="text-slate-400">
                                {p.computed_total_weight_grams > 0
                                  ? `${p.computed_total_weight_grams}g`
                                  : "—"}
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-3">
                            {p.computed_total_ppf_meters > 0 ? (
                              <div>
                                <span className="font-bold text-sky-700">
                                  {p.computed_total_ppf_meters.toFixed(4).replace(".", ",")} m
                                </span>
                                <span className="block text-[10px] text-slate-500">
                                  {p.computed_total_ppf_area_m2.toFixed(4).replace(".", ",")} m²
                                </span>
                              </div>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                          <td className="py-3 px-3 text-right">
                            <span className="font-extrabold text-emerald-700">
                              {formatBRL(p.computed_total_cost)}
                            </span>
                            {p.suggested_price > 0 && (
                              <span className="block text-[10px] text-slate-400">
                                Sug.: {formatBRL(p.suggested_price)}
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-3 text-center">
                            {p.product_type === "kit" ? (
                              <span className="text-[11px] text-slate-400">Por itens</span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setStockTarget({ type: "product", product: p })}
                                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg font-bold text-xs border transition-colors ${
                                  isLowStock
                                    ? "bg-amber-50 border-amber-300 text-amber-700"
                                    : "bg-slate-50 border-slate-200 text-slate-800 hover:bg-sky-50"
                                }`}
                                title="Clique para movimentar estoque"
                              >
                                {Number(p.stock_quantity || 0)} {p.unit}
                                <ArrowDownUp className="w-3 h-3 opacity-60" />
                              </button>
                            )}
                          </td>
                          <td className="py-3 px-3 text-center">
                            <span className="inline-flex items-center justify-center min-w-[26px] px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700">
                              {p.linked_listings_count || 0}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => setDetailProduct(p)}
                                className="p-1.5 rounded-lg text-slate-500 hover:text-sky-700 hover:bg-sky-50"
                                title="Ver ficha completa"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingProduct(p);
                                  setProductModalOpen(true);
                                }}
                                className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100"
                                title="Editar"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteProduct(p)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                                title="Excluir"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : activeTab === "bobinas" ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {(overview?.rolls ?? []).length === 0 ? (
              <div className="col-span-full bg-white rounded-2xl border border-slate-200 p-12 text-center space-y-3">
                <Layers className="w-10 h-10 text-sky-400 mx-auto" />
                <h3 className="text-sm font-bold text-slate-800">
                  Cadastre sua primeira Bobina de Película PPF
                </h3>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  Informe largura (ex: 152cm), comprimento (ex: 12m), custo por metro linear (ex: R$ 220,00) e margem padrão de borda/corte para calcular automaticamente o custo de cada peça e kit.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setEditingRoll(null);
                    setRollModalOpen(true);
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-sky-600 text-white hover:bg-sky-700"
                >
                  <Plus className="w-4 h-4" />
                  Cadastrar Bobina PPF
                </button>
              </div>
            ) : (
              (overview?.rolls ?? []).map((roll) => {
                const widthM = Math.max(0.01, Number(roll.roll_width_cm) / 100);
                const costPerM2 = Number(roll.cost_per_linear_meter) / widthM;
                const pctRemaining = Math.max(
                  0,
                  Math.min(
                    100,
                    (Number(roll.remaining_meters) / Math.max(0.01, Number(roll.roll_length_m))) *
                      100
                  )
                );
                const isLow = Number(roll.remaining_meters) <= Number(roll.min_alert_meters);

                return (
                  <div
                    key={roll.id}
                    className={`bg-white rounded-2xl border p-5 shadow-2xs flex flex-col justify-between space-y-4 ${
                      isLow ? "border-amber-300 ring-1 ring-amber-200" : "border-slate-200"
                    }`}
                  >
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded bg-sky-100 text-sky-800">
                              {roll.code}
                            </span>
                            <span className="text-[11px] uppercase font-semibold text-slate-500">
                              {roll.finish}
                              {roll.thickness_microns ? ` • ${roll.thickness_microns}µm` : ""}
                            </span>
                          </div>
                          <h3 className="text-sm font-bold text-slate-900 mt-1.5">{roll.name}</h3>
                        </div>
                        {isLow && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 shrink-0">
                            <AlertTriangle className="w-3 h-3" />
                            Repor
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-3 gap-2 p-3 rounded-xl bg-slate-50 border border-slate-100 text-xs">
                        <div>
                          <span className="text-[10px] text-slate-500 block">Custo / m</span>
                          <strong className="text-emerald-700">
                            {formatBRL(Number(roll.cost_per_linear_meter))}
                          </strong>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-500 block">Custo / m²</span>
                          <strong className="text-slate-800">{formatBRL(costPerM2)}</strong>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-500 block">Borda padrão</span>
                          <strong className="text-slate-800">+{roll.default_waste_margin_pct}%</strong>
                        </div>
                      </div>

                      {/* Medidor visual da bobina */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-slate-600">
                            Saldo da Bobina ({roll.roll_width_cm}cm × {roll.roll_length_m}m)
                          </span>
                          <span
                            className={`font-extrabold ${
                              isLow ? "text-amber-700" : "text-sky-700"
                            }`}
                          >
                            {Number(roll.remaining_meters).toFixed(2).replace(".", ",")} m
                          </span>
                        </div>
                        <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              isLow ? "bg-amber-500" : "bg-sky-600"
                            }`}
                            style={{ width: `${pctRemaining}%` }}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => setStockTarget({ type: "ppf_roll", roll })}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-sky-50 text-sky-700 hover:bg-sky-100"
                      >
                        <ArrowDownUp className="w-3.5 h-3.5" />
                        Repor / Ajustar Metros
                      </button>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingRoll(roll);
                            setRollModalOpen(true);
                          }}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteRoll(roll)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        ) : activeTab === "fornecedores" ? (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-wrap items-center justify-between gap-3">
              <div className="relative flex-1 min-w-[240px] max-w-md">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={supplierSearch}
                  onChange={(e) => setSupplierSearch(e.target.value)}
                  placeholder="Buscar por Nome Fantasia, Razão Social, CNPJ, código ou cidade..."
                  className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditingSupplier(null);
                  setSupplierModalOpen(true);
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-amber-600 text-white hover:bg-amber-700 shadow-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                Cadastrar Fornecedor / Fabricante
              </button>
            </div>

            {filteredSuppliers.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center space-y-3">
                <Building2 className="w-10 h-10 text-amber-400 mx-auto" />
                <h3 className="text-sm font-bold text-slate-800">
                  Nenhum fornecedor ou fabricante cadastrado
                </h3>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  Cadastre seus distribuidores de películas PPF e fabricantes (com logo, Razão Social, CNPJ, endereço, telefone e e-mail financeiro) para vincular diretamente aos produtos e bobinas.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredSuppliers.map((sup) => {
                  const fullAddress = [
                    sup.street,
                    sup.street_number ? `, ${sup.street_number}` : "",
                    sup.neighborhood ? ` - ${sup.neighborhood}` : "",
                  ]
                    .join("")
                    .trim();
                  const cityLine = [sup.zip_code, sup.city, sup.state]
                    .filter(Boolean)
                    .join(" - ");

                  return (
                    <div
                      key={sup.id}
                      className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs flex flex-col justify-between space-y-4 hover:border-sky-300 transition-colors"
                    >
                      <div className="space-y-3">
                        <div className="flex items-start gap-3">
                          <div className="w-16 h-16 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-center overflow-hidden shrink-0 p-1">
                            {sup.logo_url ? (
                              <img
                                src={sup.logo_url}
                                alt={sup.trade_name}
                                className="w-full h-full object-contain"
                              />
                            ) : (
                              <Building2 className="w-7 h-7 text-slate-300" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
                                {sup.code}
                              </span>
                              <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                                {sup.supplier_type}
                              </span>
                            </div>
                            <h3 className="text-sm font-extrabold text-slate-900 mt-1 truncate">
                              {sup.trade_name}
                            </h3>
                            {sup.legal_name && (
                              <p className="text-[11px] font-medium text-slate-600 line-clamp-2 leading-snug">
                                {sup.legal_name}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="space-y-1.5 text-[11px] text-slate-600 bg-slate-50/80 p-3 rounded-xl border border-slate-100">
                          {sup.document_number && (
                            <p className="font-mono text-slate-700">
                              <strong>CNPJ/CPF:</strong> {sup.document_number}
                            </p>
                          )}
                          {(fullAddress || cityLine) && (
                            <div className="flex items-start gap-1.5">
                              <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                              <div>
                                {fullAddress && <p>{fullAddress}</p>}
                                {cityLine && <p className="text-slate-500">{cityLine}</p>}
                              </div>
                            </div>
                          )}
                          {(sup.phone || sup.whatsapp) && (
                            <div className="flex items-center gap-1.5">
                              <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              <span>
                                {sup.phone || sup.whatsapp}
                                {sup.contact_name ? ` (${sup.contact_name})` : ""}
                              </span>
                            </div>
                          )}
                          {(sup.financial_email || sup.email) && (
                            <div className="flex items-center gap-1.5">
                              <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              <span className="truncate">
                                {sup.financial_email || sup.email}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-3 border-t border-slate-100 text-[11px]">
                        <div className="flex items-center gap-2 text-slate-500 font-semibold">
                          <span>{sup.linked_products_count ?? 0} prod.</span>
                          <span>•</span>
                          <span>{sup.linked_rolls_count ?? 0} bobina(s)</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingSupplier(sup);
                              setSupplierModalOpen(true);
                            }}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100"
                            title="Editar fornecedor"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteSupplier(sup)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                            title="Excluir fornecedor"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : activeTab === "vinculos" ? (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Vínculos Anúncios (MLB / Shopee) ↔ Produtos & Kits ERP
                </h3>
                <p className="text-xs text-slate-500">
                  Conecte qualquer anúncio para calcular o custo real e o consumo da bobina PPF em cada venda
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditingLink(null);
                  setLinkModalOpen(true);
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-sky-600 text-white hover:bg-sky-700"
              >
                <Link2 className="w-3.5 h-3.5" />
                Vincular Anúncio
              </button>
            </div>

            {(overview?.links ?? []).length === 0 ? (
              <div className="p-12 text-center text-xs text-slate-400">
                Nenhum anúncio vinculado ainda. Você pode vincular aqui ou diretamente pelas telas{" "}
                <strong>Anúncios & Catálogo</strong> e <strong>Gestão de Vendas</strong>.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase">
                      <th className="py-3 px-4">Anúncio (MLB / Canal)</th>
                      <th className="py-3 px-3">Produto / Kit ERP</th>
                      <th className="py-3 px-3 text-center">Qtd / Venda</th>
                      <th className="py-3 px-3">Consumo PPF / Venda</th>
                      <th className="py-3 px-3 text-right">Custo / Venda</th>
                      <th className="py-3 px-4 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {(overview?.links ?? []).map((lnk) => {
                      const prod = lnk.product;
                      const qty = Number(lnk.quantity_per_sale || 1);
                      const unitCost = prod ? prod.computed_total_cost * qty : 0;
                      const unitMeters = prod ? prod.computed_total_ppf_meters * qty : 0;

                      return (
                        <tr key={lnk.id} className="hover:bg-slate-50/70">
                          <td className="py-3 px-4">
                            <span className="font-mono font-bold text-sky-700">
                              {lnk.external_listing_id}
                            </span>
                            <p className="text-[11px] text-slate-600 line-clamp-1">
                              {lnk.listing_title || "—"}
                            </p>
                          </td>
                          <td className="py-3 px-3">
                            {prod ? (
                              <button
                                type="button"
                                onClick={() => setDetailProduct(prod)}
                                className="text-left hover:text-sky-700"
                              >
                                <span className="font-bold text-slate-800 block">{prod.name}</span>
                                <span className="text-[10px] font-mono text-slate-500">
                                  {prod.sku} • {prod.product_type.toUpperCase()}
                                </span>
                              </button>
                            ) : (
                              <span className="text-slate-400">Produto removido</span>
                            )}
                          </td>
                          <td className="py-3 px-3 text-center font-bold text-slate-700">{qty}×</td>
                          <td className="py-3 px-3">
                            {unitMeters > 0 ? (
                              <span className="font-bold text-sky-700">
                                {unitMeters.toFixed(4).replace(".", ",")} m
                              </span>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                          <td className="py-3 px-3 text-right font-extrabold text-emerald-700">
                            {formatBRL(unitCost)}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleSyncLinkCost(lnk)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                                title="Atualizar template de custo e pedidos não editados"
                              >
                                <RefreshCw className="w-3 h-3" />
                                Sincronizar Custo
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingLink(lnk);
                                  setLinkModalOpen(true);
                                }}
                                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteLink(lnk)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : (
          /* ABA 4: CONSUMO NAS VENDAS & KARDEX */
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-bold text-slate-700">Período de Vendas:</span>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="px-2.5 py-1.5 border border-slate-200 rounded-lg"
                />
                <span className="text-slate-400">até</span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="px-2.5 py-1.5 border border-slate-200 rounded-lg"
                />
                <button
                  type="button"
                  onClick={loadSalesConsumption}
                  className="px-3 py-1.5 rounded-lg bg-slate-900 text-white font-semibold hover:bg-slate-800"
                >
                  Apurar Consumo
                </button>
              </div>

              <button
                type="button"
                disabled={
                  deductingBusy ||
                  !consumptionData ||
                  consumptionData.totals.pendingDeductionOrdersCount === 0
                }
                onClick={handleDeductSalesBatch}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40"
              >
                {deductingBusy ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-3.5 h-3.5" />
                )}
                Baixar Estoque & Bobinas ({consumptionData?.totals.pendingDeductionOrdersCount ?? 0}{" "}
                pedidos pendentes)
              </button>
            </div>

            {consumptionLoading ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center text-xs text-slate-400">
                <Loader2 className="w-6 h-6 animate-spin text-sky-600 mx-auto mb-2" />
                Calculando metros de bobina PPF consumidos nas vendas do período...
              </div>
            ) : consumptionData ? (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Resumo por Bobina */}
                <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
                  <h3 className="text-xs font-bold uppercase text-slate-500">
                    Consumo por Bobina PPF no Período
                  </h3>
                  {consumptionData.rollsSummary.length === 0 ? (
                    <p className="text-xs text-slate-400 py-4">
                      Nenhum consumo de bobina apurado nas vendas vinculadas deste período.
                    </p>
                  ) : (
                    consumptionData.rollsSummary.map((rc) => (
                      <div
                        key={rc.roll_id}
                        className="p-3 rounded-xl bg-sky-50/70 border border-sky-200 text-xs space-y-1"
                      >
                        <div className="flex justify-between font-bold text-slate-900">
                          <span>{rc.roll_code}</span>
                          <span className="text-sky-700">
                            {rc.linear_meters.toFixed(3).replace(".", ",")} m
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-600">{rc.roll_name}</p>
                        <div className="flex justify-between text-[11px] text-slate-500 pt-1">
                          <span>
                            {(rc.rolls_fraction * 100).toFixed(1).replace(".", ",")}% de bobina{" "}
                            {rc.roll_length_m}m
                          </span>
                          <strong className="text-emerald-700">{formatBRL(rc.cost)}</strong>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Detalhamento por Anúncio/Produto */}
                <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                    <h3 className="text-xs font-bold uppercase text-slate-500">
                      Produtos & Kits Vendidos ({consumptionData.totals.linkedOrdersCount} pedidos vinculados)
                    </h3>
                    <span className="text-xs font-extrabold text-emerald-700">
                      Custo Total: {formatBRL(consumptionData.totals.totalProductCost)}
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold text-slate-500 uppercase">
                          <th className="py-2.5 px-3">Anúncio / Produto ERP</th>
                          <th className="py-2.5 px-3 text-center">Vendas / Unid.</th>
                          <th className="py-2.5 px-3 text-right">PPF Consumido</th>
                          <th className="py-2.5 px-3 text-right">Custo Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {consumptionData.items.map((item) => (
                          <tr key={item.mlb_id}>
                            <td className="py-2.5 px-3">
                              <span className="font-mono font-bold text-sky-700">{item.mlb_id}</span>
                              <p className="font-semibold text-slate-800">{item.product_name}</p>
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              <strong>{item.units_sold}</strong> un ({item.orders_count} ped.)
                            </td>
                            <td className="py-2.5 px-3 text-right font-bold text-sky-700">
                              {item.total_ppf_meters > 0
                                ? `${item.total_ppf_meters.toFixed(3).replace(".", ",")} m`
                                : "—"}
                            </td>
                            <td className="py-2.5 px-3 text-right font-bold text-emerald-700">
                              {formatBRL(item.total_product_cost)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ) : null}

            {/* Kardex */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100">
                <h3 className="text-xs font-bold uppercase text-slate-500">
                  Histórico de Movimentações (Kardex de Estoque & Bobinas)
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold text-slate-500 uppercase">
                      <th className="py-2.5 px-4">Data</th>
                      <th className="py-2.5 px-3">Item / Bobina</th>
                      <th className="py-2.5 px-3">Tipo</th>
                      <th className="py-2.5 px-3 text-right">Movimentação</th>
                      <th className="py-2.5 px-3 text-right">Saldo Após</th>
                      <th className="py-2.5 px-4">Motivo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(overview?.movements ?? []).slice(0, 30).map((mov) => (
                      <tr key={mov.id}>
                        <td className="py-2 px-4 text-slate-500 whitespace-nowrap">
                          {new Date(mov.created_at).toLocaleString("pt-BR")}
                        </td>
                        <td className="py-2 px-3 font-semibold text-slate-800">
                          {mov.entity_type === "ppf_roll"
                            ? `[BOBINA] ${mov.roll_code || ""} ${mov.roll_name || ""}`
                            : `${mov.product_sku || ""} — ${mov.product_name || ""}`}
                        </td>
                        <td className="py-2 px-3">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 uppercase">
                            {mov.movement_type}
                          </span>
                        </td>
                        <td
                          className={`py-2 px-3 text-right font-bold ${
                            Number(mov.quantity_delta) >= 0 ? "text-emerald-700" : "text-rose-600"
                          }`}
                        >
                          {Number(mov.quantity_delta) >= 0 ? "+" : ""}
                          {Number(mov.quantity_delta).toFixed(mov.unit === "M" ? 3 : 0)} {mov.unit}
                        </td>
                        <td className="py-2 px-3 text-right font-semibold text-slate-700">
                          {Number(mov.balance_after).toFixed(mov.unit === "M" ? 2 : 0)} {mov.unit}
                        </td>
                        <td className="py-2 px-4 text-slate-500">{mov.reason || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Modais e Drawers */}
      <SupplierFormModal
        open={supplierModalOpen}
        supplier={editingSupplier}
        onClose={() => setSupplierModalOpen(false)}
        onSaved={() => {
          showToast("Fornecedor salvo com sucesso!");
          loadOverview();
        }}
      />

      <PpfRollFormModal
        open={rollModalOpen}
        roll={editingRoll}
        suppliers={overview?.suppliers ?? []}
        onClose={() => setRollModalOpen(false)}
        onSaved={() => {
          showToast("Bobina PPF salva com sucesso!");
          loadOverview();
        }}
        onSupplierCreated={() => loadOverview()}
      />

      <ProductFormModal
        open={productModalOpen}
        product={editingProduct}
        defaultType={productDefaultType}
        rolls={overview?.rolls ?? []}
        suppliers={overview?.suppliers ?? []}
        allProducts={overview?.products ?? []}
        onClose={() => setProductModalOpen(false)}
        onSaved={() => {
          showToast("Produto / Kit salvo com sucesso!");
          loadOverview();
        }}
        onSupplierCreated={() => loadOverview()}
      />

      <LinkListingModal
        open={linkModalOpen}
        products={overview?.products ?? []}
        existingLink={editingLink}
        onClose={() => setLinkModalOpen(false)}
        onSaved={() => {
          showToast("Vínculo com anúncio salvo com sucesso!");
          loadOverview();
        }}
      />

      <StockMovementModal
        open={Boolean(stockTarget)}
        target={stockTarget}
        onClose={() => setStockTarget(null)}
        onSaved={() => {
          showToast("Movimentação registrada no Kardex!");
          loadOverview();
        }}
      />

      <ProductDetailDrawer
        open={Boolean(detailProduct)}
        product={detailProduct}
        links={overview?.links ?? []}
        onClose={() => setDetailProduct(null)}
        onEditProduct={(prod) => {
          setEditingProduct(prod);
          setProductModalOpen(true);
        }}
      />
    </div>
  );
}
