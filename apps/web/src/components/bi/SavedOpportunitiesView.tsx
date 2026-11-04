"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Bookmark,
  BookmarkCheck,
  CheckCircle2,
  Clock,
  ExternalLink,
  Flame,
  Sparkles,
  Trash2,
  Search,
  PlusCircle,
  RefreshCw,
  Zap,
  Truck,
  ShoppingBag,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Tag,
  Calendar,
  Store,
  Check,
  RotateCcw,
  Link2,
} from "lucide-react";
import type {
  SavedOpportunityListing,
  CompetitorStoreListing,
} from "@crm/types";
import { CloneListingModal } from "./CloneListingModal";

interface SavedOpportunitiesViewProps {
  onCountChange?: (counts: {
    total: number;
    pending: number;
    created: number;
    savedExternalIds: Set<string>;
  }) => void;
  externalToast?: (msg: string) => void;
}

type SavedSortColumn =
  | "status"
  | "title"
  | "store"
  | "date"
  | "sales"
  | "orig_price"
  | "promo_price"
  | "net";
type SortDirection = "asc" | "desc";

function getSafeUrl(item: SavedOpportunityListing): string {
  let url = (item.permalink || "").trim();
  if (url.includes("click1.mercadolivre.com.br") || url.includes("/mclics/")) {
    try {
      const u = new URL(url);
      const target = u.searchParams.get("url") || u.searchParams.get("tu");
      if (target) url = decodeURIComponent(target);
    } catch {}
  }
  if (!url.startsWith("http") && item.external_id) {
    return `https://produto.mercadolivre.com.br/${item.external_id}`;
  }
  return url || `https://produto.mercadolivre.com.br/${item.external_id}`;
}

export function SavedOpportunitiesView({
  onCountChange,
  externalToast,
}: SavedOpportunitiesViewProps) {
  const [items, setItems] = useState<SavedOpportunityListing[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [scrapingUrl, setScrapingUrl] = useState<string>("");
  const [scrapingLoading, setScrapingLoading] = useState<boolean>(false);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Filtros e Ordenação
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "created">("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [sortColumn, setSortColumn] = useState<SavedSortColumn>("date");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  // Modal de Clonagem/Criação
  const [itemToClone, setItemToClone] = useState<SavedOpportunityListing | null>(null);
  const [localToast, setLocalToast] = useState<string | null>(null);

  const notify = useCallback(
    (msg: string) => {
      if (externalToast) {
        externalToast(msg);
      } else {
        setLocalToast(msg);
        setTimeout(() => setLocalToast(null), 3500);
      }
    },
    [externalToast]
  );

  const syncParentCounts = useCallback(
    (list: SavedOpportunityListing[]) => {
      if (!onCountChange) return;
      const total = list.length;
      const pending = list.filter((i) => i.status === "pending").length;
      const created = list.filter((i) => i.status === "created").length;
      const savedExternalIds = new Set(list.map((i) => i.external_id));
      onCountChange({ total, pending, created, savedExternalIds });
    },
    [onCountChange]
  );

  const fetchSavedListings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/competitors/saved", { cache: "no-store" });
      const json = await res.json();
      if (res.ok && json.success) {
        const list: SavedOpportunityListing[] = json.data || [];
        setItems(list);
        syncParentCounts(list);
      }
    } catch (err) {
      console.error("Erro ao carregar anúncios salvos:", err);
    } finally {
      setLoading(false);
    }
  }, [syncParentCounts]);

  useEffect(() => {
    fetchSavedListings();
  }, [fetchSavedListings]);

  // Captura e salva anúncio via Webscraping por Link ou Código MLB
  const handleScrapeAndSaveUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = scrapingUrl.trim();
    if (!trimmed) return;

    setScrapingLoading(true);
    try {
      const res = await fetch("/api/competitors/saved", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: trimmed,
          scrapeNow: true,
        }),
      });
      const json = await res.json();
      if (res.ok && json.success && json.data) {
        setScrapingUrl("");
        notify(`✅ Anúncio "${json.data.title.slice(0, 45)}..." capturado e salvo para análise!`);
        fetchSavedListings();
      } else {
        notify(json.error || "Não foi possível capturar o anúncio informado.");
      }
    } catch (err) {
      console.error(err);
      notify("Erro de comunicação ao capturar anúncio.");
    } finally {
      setScrapingLoading(false);
    }
  };

  // Alterna status "OK / Criado" (Verde) <-> "Pendente"
  const handleToggleOkStatus = async (item: SavedOpportunityListing) => {
    const nextStatus = item.status === "created" ? "pending" : "created";
    setTogglingId(item.id);

    // Atualização otimista imediata
    const optimisticList = items.map((i) =>
      i.id === item.id
        ? {
            ...i,
            status: nextStatus as "pending" | "created",
            created_in_store_at:
              nextStatus === "created" ? new Date().toISOString() : null,
          }
        : i
    );
    setItems(optimisticList);
    syncParentCounts(optimisticList);

    try {
      const res = await fetch(`/api/competitors/saved/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        notify(
          nextStatus === "created"
            ? `✅ OK! Anúncio "${item.title.slice(0, 35)}..." marcado em VERDE como CRIADO na sua loja!`
            : `⏳ Anúncio "${item.title.slice(0, 35)}..." voltou para Pendente.`
        );
      } else {
        fetchSavedListings();
      }
    } catch {
      fetchSavedListings();
    } finally {
      setTogglingId(null);
    }
  };

  // Atualiza dados do anúncio via Webscraping
  const handleRefreshScrape = async (item: SavedOpportunityListing) => {
    setRefreshingId(item.id);
    try {
      const res = await fetch(`/api/competitors/saved/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "refresh" }),
      });
      const json = await res.json();
      if (res.ok && json.success && json.data) {
        setItems((prev) =>
          prev.map((i) => (i.id === item.id ? json.data : i))
        );
        notify(`🔄 Dados de "${item.title.slice(0, 35)}..." atualizados via Webscraping!`);
      } else {
        notify("Não foi possível atualizar os dados no momento.");
      }
    } catch {
      notify("Erro ao atualizar webscraping do anúncio.");
    } finally {
      setRefreshingId(null);
    }
  };

  // Exclui um anúncio salvo para liberar espaço
  const handleDeleteItem = async (item: SavedOpportunityListing) => {
    setDeletingId(item.id);
    const updatedList = items.filter((i) => i.id !== item.id);
    setItems(updatedList);
    syncParentCounts(updatedList);

    try {
      const res = await fetch(`/api/competitors/saved/${item.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        notify(`🗑️ Anúncio "${item.title.slice(0, 35)}..." excluído para liberar espaço.`);
      } else {
        fetchSavedListings();
      }
    } catch {
      fetchSavedListings();
    } finally {
      setDeletingId(null);
    }
  };

  // Exclui todos os anúncios já marcados como "Criado (OK)" para liberar espaço de uma vez
  const handleClearAllCreated = async () => {
    const createdItems = items.filter((i) => i.status === "created");
    if (createdItems.length === 0) return;
    if (
      !confirm(
        `Deseja excluir todos os ${createdItems.length} anúncio(s) já criados (marcados em verde) para liberar espaço na lista?`
      )
    ) {
      return;
    }

    const remaining = items.filter((i) => i.status !== "created");
    setItems(remaining);
    syncParentCounts(remaining);

    await Promise.all(
      createdItems.map((item) =>
        fetch(`/api/competitors/saved/${item.id}`, { method: "DELETE" }).catch(
          () => null
        )
      )
    );
    notify(`🧹 ${createdItems.length} anúncio(s) já criados foram removidos para liberar espaço!`);
  };

  // Ordenação clicável nas colunas
  const handleColumnSort = (col: SavedSortColumn) => {
    if (sortColumn === col) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(col);
      setSortDirection(col === "title" || col === "store" ? "asc" : "desc");
    }
  };

  const renderSortHeader = (
    col: SavedSortColumn,
    label: string,
    align: "left" | "center" | "right" = "left"
  ) => {
    const isActive = sortColumn === col;
    return (
      <button
        type="button"
        onClick={() => handleColumnSort(col)}
        title={`Ordenar por ${label}`}
        className={`group inline-flex items-center gap-1 py-1 px-2 rounded-lg transition-all text-xs font-bold cursor-pointer select-none ${
          align === "center"
            ? "justify-center mx-auto"
            : align === "right"
            ? "justify-end ml-auto"
            : "justify-start"
        } ${
          isActive
            ? "bg-indigo-100 text-indigo-900 shadow-2xs"
            : "text-slate-700 hover:text-indigo-600 hover:bg-slate-200/60"
        }`}
      >
        <span>{label}</span>
        {isActive ? (
          sortDirection === "asc" ? (
            <ArrowUp className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
          ) : (
            <ArrowDown className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
          )
        ) : (
          <ArrowUpDown className="w-3 h-3 text-slate-300 opacity-60 group-hover:opacity-100 group-hover:text-indigo-600 shrink-0 transition-all" />
        )}
      </button>
    );
  };

  // Lista filtrada e ordenada
  const processedItems = useMemo(() => {
    let list = [...items];

    if (statusFilter !== "all") {
      list = list.filter((i) => i.status === statusFilter);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(
        (i) =>
          (i.title || "").toLowerCase().includes(q) ||
          (i.external_id || "").toLowerCase().includes(q) ||
          (i.seller_name || "").toLowerCase().includes(q) ||
          (i.store_segment || "").toLowerCase().includes(q)
      );
    }

    return list.sort((a, b) => {
      let comp = 0;
      switch (sortColumn) {
        case "status":
          comp = (a.status === "created" ? 1 : 0) - (b.status === "created" ? 1 : 0);
          break;
        case "title":
          comp = (a.title || "").localeCompare(b.title || "", "pt-BR", {
            sensitivity: "base",
          });
          break;
        case "store":
          comp = (a.seller_name || "").localeCompare(
            b.seller_name || "",
            "pt-BR",
            { sensitivity: "base" }
          );
          break;
        case "date": {
          const tA = a.listing_created_at
            ? new Date(a.listing_created_at).getTime()
            : 0;
          const tB = b.listing_created_at
            ? new Date(b.listing_created_at).getTime()
            : 0;
          comp = tA - tB;
          break;
        }
        case "sales":
          comp = (a.sales_count_approx || 0) - (b.sales_count_approx || 0);
          break;
        case "orig_price": {
          const origA = a.original_price || a.current_price || 0;
          const origB = b.original_price || b.current_price || 0;
          comp = origA - origB;
          break;
        }
        case "promo_price":
          comp = (a.current_price || 0) - (b.current_price || 0);
          break;
        case "net":
          comp = (a.estimated_net || 0) - (b.estimated_net || 0);
          break;
      }
      return sortDirection === "asc" ? comp : -comp;
    });
  }, [items, statusFilter, searchQuery, sortColumn, sortDirection]);

  // Métricas
  const totalCount = items.length;
  const pendingCount = items.filter((i) => i.status === "pending").length;
  const createdCount = items.filter((i) => i.status === "created").length;
  const totalSalesPotential = items.reduce(
    (acc, i) => acc + (i.sales_count_approx || 0),
    0
  );

  // Converte SavedOpportunityListing para CompetitorStoreListing para o CloneListingModal
  const cloneModalListing: CompetitorStoreListing | null = useMemo(() => {
    if (!itemToClone) return null;
    return {
      id: itemToClone.id,
      store_id: "saved",
      user_id: itemToClone.user_id,
      platform: itemToClone.platform,
      external_id: itemToClone.external_id,
      title: itemToClone.title,
      current_price: itemToClone.current_price,
      original_price: itemToClone.original_price,
      discount_pct: itemToClone.discount_pct,
      sales_count_approx: itemToClone.sales_count_approx,
      listing_created_at: itemToClone.listing_created_at,
      shipping_type: itemToClone.shipping_type,
      is_full: itemToClone.is_full,
      is_free_shipping: itemToClone.is_free_shipping,
      promo_badge: itemToClone.promo_badge,
      permalink: itemToClone.permalink,
      thumbnail_url: itemToClone.thumbnail_url,
      rating: itemToClone.rating,
      reviews_count: itemToClone.reviews_count,
      estimated_sale_fee: itemToClone.estimated_sale_fee,
      estimated_shipping: itemToClone.estimated_shipping,
      estimated_net: itemToClone.estimated_net,
      listing_type: itemToClone.listing_type,
      is_catalog: itemToClone.is_catalog,
      store_name: itemToClone.seller_name,
      store_segment: itemToClone.store_segment || "Geral",
      last_scraped_at: itemToClone.last_scraped_at,
      created_at: itemToClone.created_at,
      updated_at: itemToClone.updated_at,
    };
  }, [itemToClone]);

  return (
    <div className="space-y-4">
      {localToast && (
        <div className="fixed top-5 right-5 z-50 bg-slate-900 text-white text-xs px-4 py-2.5 rounded-xl shadow-2xl border border-slate-700 flex items-center gap-2 animate-in slide-in-from-top-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{localToast}</span>
        </div>
      )}

      {/* Cards de Resumo da Fila de Anúncios Salvos */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="bg-white p-3.5 rounded-xl border border-slate-200/90 shadow-2xs flex items-center justify-between">
          <div>
            <div className="text-[11px] font-semibold text-slate-500">
              Total Salvos p/ Análise
            </div>
            <div className="text-xl font-black text-slate-900 mt-0.5">
              {totalCount}
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">
              Oportunidades garimpadas
            </div>
          </div>
          <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
            <Bookmark className="w-4 h-4" />
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-amber-200/90 shadow-2xs flex items-center justify-between">
          <div>
            <div className="text-[11px] font-semibold text-amber-700">
              ⏳ Pendentes para Criar
            </div>
            <div className="text-xl font-black text-amber-600 mt-0.5">
              {pendingCount}
            </div>
            <div className="text-[10px] text-amber-600/80 mt-0.5 font-medium">
              Aguardando criação na sua loja
            </div>
          </div>
          <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
            <Clock className="w-4 h-4" />
          </div>
        </div>

        <div className="bg-emerald-50/70 p-3.5 rounded-xl border border-emerald-300 shadow-2xs flex items-center justify-between">
          <div>
            <div className="text-[11px] font-bold text-emerald-800">
              ✅ Já Criados (OK em Verde)
            </div>
            <div className="text-xl font-black text-emerald-700 mt-0.5">
              {createdCount}
            </div>
            <div className="text-[10px] text-emerald-700 mt-0.5 font-semibold">
              Anúncios concluídos na sua loja
            </div>
          </div>
          <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-2xs">
            <CheckCircle2 className="w-4 h-4" />
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200/90 shadow-2xs flex items-center justify-between">
          <div>
            <div className="text-[11px] font-semibold text-slate-500">
              Potencial Acumulado de Vendas
            </div>
            <div className="text-xl font-black text-slate-900 mt-0.5">
              +{totalSalesPotential.toLocaleString("pt-BR")}
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">
              Soma de vendas dos anúncios salvos
            </div>
          </div>
          <div className="w-9 h-9 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
            <Flame className="w-4 h-4" />
          </div>
        </div>
      </div>

      {/* Barra de Captura Instantânea via Webscraping (Colar Link do Mercado Livre ou Shopee) */}
      <form
        onSubmit={handleScrapeAndSaveUrl}
        className="bg-gradient-to-r from-indigo-950 via-slate-900 to-indigo-950 p-4 rounded-xl border border-indigo-800/60 shadow-sm text-white"
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="space-y-0.5">
            <div className="text-xs font-bold flex items-center gap-2 text-indigo-200">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span>Capturar Anúncio por Link ou Código MLB (Webscraping Automático)</span>
            </div>
            <p className="text-[11px] text-slate-300">
              Achou um anúncio interessante no Mercado Livre ou Shopee? Cole o link abaixo (ou salve com 1 clique direto do Raio-X / Pesquisa de Mercado).
            </p>
          </div>

          <div className="flex items-center gap-2 flex-1 max-w-2xl">
            <div className="relative flex-1">
              <Link2 className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={scrapingUrl}
                onChange={(e) => setScrapingUrl(e.target.value)}
                placeholder="Cole o link do anúncio (https://produto.mercadolivre.com.br/MLB-...) ou código MLB..."
                className="w-full pl-9 pr-3 py-2 bg-white/10 border border-white/20 rounded-lg text-xs text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:bg-white/15"
              />
            </div>
            <button
              type="submit"
              disabled={scrapingLoading || !scrapingUrl.trim()}
              className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white font-bold text-xs rounded-lg shadow-xs transition-all flex items-center gap-1.5 shrink-0 cursor-pointer"
            >
              {scrapingLoading ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Capturando...</span>
                </>
              ) : (
                <>
                  <PlusCircle className="w-3.5 h-3.5" />
                  <span>Capturar & Salvar</span>
                </>
              )}
            </button>
          </div>
        </div>
      </form>

      {/* Barra de Filtros, Status (Pendentes vs Criados em Verde) e Busca */}
      <div className="bg-white p-3.5 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setStatusFilter("all")}
            className={`px-3 py-1.5 rounded-lg font-bold transition-all flex items-center gap-1.5 ${
              statusFilter === "all"
                ? "bg-slate-900 text-white shadow-2xs"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            <span>Todos ({totalCount})</span>
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter("pending")}
            className={`px-3 py-1.5 rounded-lg font-bold transition-all flex items-center gap-1.5 ${
              statusFilter === "pending"
                ? "bg-amber-500 text-white shadow-2xs"
                : "bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100"
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>⏳ Pendentes p/ Criar ({pendingCount})</span>
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter("created")}
            className={`px-3 py-1.5 rounded-lg font-bold transition-all flex items-center gap-1.5 ${
              statusFilter === "created"
                ? "bg-emerald-600 text-white shadow-2xs"
                : "bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100"
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>✅ Já Criados em Verde ({createdCount})</span>
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 flex-1 max-w-md justify-end">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filtrar por título, código MLB ou loja..."
              className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>

          {createdCount > 0 && (
            <button
              type="button"
              onClick={handleClearAllCreated}
              className="px-2.5 py-1.5 text-[11px] font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition-colors flex items-center gap-1"
              title="Excluir todos os anúncios que já foram criados para liberar espaço"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Limpar Já Criados ({createdCount})</span>
            </button>
          )}

          <button
            type="button"
            onClick={fetchSavedListings}
            disabled={loading}
            className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
            title="Recarregar lista"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-indigo-600" : ""}`} />
          </button>
        </div>
      </div>

      {/* Tabela Completa de Anúncios Salvos para Analisar & Criar */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400 text-xs">
            Carregando seus anúncios salvos para análise...
          </div>
        ) : processedItems.length === 0 ? (
          <div className="p-12 text-center space-y-2.5">
            <Bookmark className="w-9 h-9 text-slate-300 mx-auto" />
            <div className="text-sm font-bold text-slate-800">
              Nenhum anúncio salvo nesta visualização
            </div>
            <p className="text-xs text-slate-500 max-w-lg mx-auto">
              Você pode salvar anúncios clicando no botão <strong>&ldquo;Salvar p/ Criar&rdquo;</strong> na aba{" "}
              <strong>Raio-X de Anúncios</strong> ou <strong>Pesquisa de Mercado</strong>, ou colar qualquer link de anúncio na barra acima.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50/95 border-b border-slate-200 text-slate-600 font-semibold select-none">
                  <th className="py-2.5 px-2.5 w-28 text-center">
                    {renderSortHeader("status", "Status / OK", "center")}
                  </th>
                  <th className="py-2.5 px-2 w-14 text-center text-slate-400">Foto</th>
                  <th className="py-2 px-2 min-w-[260px]">
                    {renderSortHeader("title", "Título & Dados Capturados", "left")}
                  </th>
                  <th className="py-2 px-2 w-40">
                    {renderSortHeader("store", "Loja Concorrente", "left")}
                  </th>
                  <th className="py-2 px-2 w-32 text-center">
                    {renderSortHeader("date", "Data de Criação", "center")}
                  </th>
                  <th className="py-2 px-2 w-28 text-center">
                    {renderSortHeader("sales", "Nº de Vendas", "center")}
                  </th>
                  <th className="py-2 px-2 w-28 text-right">
                    {renderSortHeader("orig_price", "Preço Tabelado", "right")}
                  </th>
                  <th className="py-2 px-2 w-32 text-right">
                    {renderSortHeader("promo_price", "Preço Promo / Atual", "right")}
                  </th>
                  <th className="py-2 px-2 w-36 text-right">
                    {renderSortHeader("net", "Líquido & Taxas", "right")}
                  </th>
                  <th className="py-2.5 px-3 w-48 text-center text-slate-600 font-bold">
                    Ações (Dar OK / Criar / Excluir)
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {processedItems.map((item) => {
                  const isCreated = item.status === "created";
                  const safeUrl = getSafeUrl(item);

                  // Formata data de criação e calcula idade + velocidade de vendas/dia
                  let createdDateText = "—";
                  let ageDays = 0;
                  let isRecent = false;
                  if (item.listing_created_at) {
                    const d = new Date(item.listing_created_at);
                    if (!isNaN(d.getTime())) {
                      createdDateText = d.toLocaleDateString("pt-BR");
                      ageDays = Math.max(
                        1,
                        Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24))
                      );
                      isRecent = ageDays <= 30;
                    }
                  }

                  const salesPerDay =
                    ageDays > 0 && item.sales_count_approx > 0
                      ? (item.sales_count_approx / ageDays).toFixed(1).replace(".", ",")
                      : null;

                  const hasPromo =
                    Boolean(item.original_price && item.original_price > item.current_price) ||
                    Boolean(item.discount_pct && item.discount_pct > 0) ||
                    Boolean(item.promo_badge);

                  const discountPct =
                    item.discount_pct ||
                    (item.original_price && item.original_price > item.current_price
                      ? Math.round(
                          ((item.original_price - item.current_price) /
                            item.original_price) *
                            100
                        )
                      : null);

                  const fee =
                    item.estimated_sale_fee ||
                    Number((item.current_price * 0.165).toFixed(2));
                  const shipping =
                    item.estimated_shipping !== undefined &&
                    item.estimated_shipping !== null
                      ? item.estimated_shipping
                      : item.is_free_shipping || item.current_price >= 79
                      ? 18.65
                      : 0;
                  const net =
                    item.estimated_net && item.estimated_net > 0
                      ? item.estimated_net
                      : Math.max(
                          0,
                          Number((item.current_price - fee - shipping).toFixed(2))
                        );

                  return (
                    <tr
                      key={item.id}
                      className={`transition-all group ${
                        isCreated
                          ? "bg-emerald-50/90 hover:bg-emerald-100/80 border-l-4 border-l-emerald-500"
                          : "hover:bg-slate-50/90"
                      }`}
                    >
                      {/* Coluna 1: Botão Dar OK / Status em Verde */}
                      <td className="py-3 px-2.5 text-center">
                        <button
                          type="button"
                          disabled={togglingId === item.id}
                          onClick={() => handleToggleOkStatus(item)}
                          title={
                            isCreated
                              ? "Anúncio já criado! Clique se quiser voltar para Pendente"
                              : "Dar um OK: Marcar em VERDE mostrando que o anúncio já foi criado na sua loja"
                          }
                          className={`w-full py-1.5 px-2 rounded-lg font-extrabold text-[11px] transition-all flex items-center justify-center gap-1 shadow-2xs cursor-pointer ${
                            isCreated
                              ? "bg-emerald-600 text-white hover:bg-emerald-700 ring-2 ring-emerald-300"
                              : "bg-slate-100 text-slate-700 hover:bg-emerald-600 hover:text-white border border-slate-300"
                          }`}
                        >
                          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                          <span>{isCreated ? "CRIADO (OK)" : "Dar OK"}</span>
                        </button>
                        {isCreated && item.created_in_store_at && (
                          <div className="text-[9px] font-bold text-emerald-800 mt-1">
                            Criado em{" "}
                            {new Date(item.created_in_store_at).toLocaleDateString("pt-BR")}
                          </div>
                        )}
                        {isCreated && item.my_created_sku && (
                          <div className="text-[9px] font-mono font-bold text-emerald-900 bg-emerald-200/70 rounded px-1 mt-0.5 truncate">
                            {item.my_created_sku}
                          </div>
                        )}
                      </td>

                      {/* Coluna 2: Foto */}
                      <td className="py-3 px-2 text-center">
                        <a
                          href={safeUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`w-12 h-12 rounded-lg bg-white border overflow-hidden flex items-center justify-center shrink-0 mx-auto shadow-2xs ${
                            isCreated ? "border-emerald-400 ring-2 ring-emerald-200" : "border-slate-200"
                          }`}
                          title="Abrir anúncio original"
                        >
                          {item.thumbnail_url ? (
                            <img
                              src={item.thumbnail_url}
                              alt={item.title}
                              className="w-full h-full object-contain group-hover:scale-110 transition-transform"
                            />
                          ) : (
                            <ShoppingBag className="w-5 h-5 text-slate-300" />
                          )}
                        </a>
                      </td>

                      {/* Coluna 3: Título & Dados Capturados */}
                      <td className="py-3 px-2.5">
                        <div className="flex items-start gap-1.5">
                          <a
                            href={safeUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`font-bold transition-colors line-clamp-2 leading-snug inline-flex items-center gap-1 ${
                              isCreated
                                ? "text-emerald-950 hover:text-emerald-700"
                                : "text-slate-900 hover:text-indigo-600"
                            }`}
                          >
                            <span>{item.title}</span>
                            <ExternalLink className="w-3.5 h-3.5 shrink-0 opacity-60" />
                          </a>
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                          <span className="font-mono text-[10px] font-semibold bg-white/80 border border-slate-200 text-slate-600 px-1.5 py-0.2 rounded">
                            {item.external_id}
                          </span>

                          <span
                            className={`text-[9px] font-bold px-1.5 py-0.2 rounded ${
                              item.listing_type === "gold_special"
                                ? "bg-slate-200 text-slate-700"
                                : "bg-indigo-100 text-indigo-800"
                            }`}
                          >
                            {item.listing_type === "gold_special" ? "Clássico" : "Premium"}
                          </span>

                          {item.is_full && (
                            <span className="bg-emerald-100 text-emerald-800 text-[9px] font-bold px-1.5 py-0.2 rounded flex items-center gap-0.5">
                              <Zap className="w-2.5 h-2.5 fill-emerald-600 text-emerald-600" />
                              FULL
                            </span>
                          )}

                          {item.is_free_shipping && (
                            <span className="bg-blue-100 text-blue-800 text-[9px] font-bold px-1.5 py-0.2 rounded flex items-center gap-0.5">
                              <Truck className="w-2.5 h-2.5 text-blue-600" />
                              Frete Grátis
                            </span>
                          )}

                          {item.is_catalog && (
                            <span className="bg-purple-100 text-purple-800 text-[9px] font-bold px-1.5 py-0.2 rounded">
                              📦 Catálogo
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Coluna 4: Loja / Vendedor */}
                      <td className="py-3 px-2.5">
                        <div
                          className="font-bold text-slate-800 truncate max-w-[155px]"
                          title={item.seller_name}
                        >
                          {item.seller_name || "Concorrente"}
                        </div>
                        <div className="flex flex-wrap items-center gap-1 mt-0.5">
                          <span className="text-[9px] font-bold uppercase px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 border border-slate-200">
                            {item.seller_reputation || "Platinum"}
                          </span>
                          {item.store_segment && (
                            <span className="text-[9px] font-semibold text-indigo-700 bg-indigo-50 px-1.5 py-0.2 rounded">
                              {item.store_segment}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Coluna 5: Data de Criação & Idade */}
                      <td className="py-3 px-2 text-center">
                        <div className="font-bold text-slate-800">{createdDateText}</div>
                        {ageDays > 0 && (
                          <div className="mt-0.5">
                            {isRecent ? (
                              <span className="inline-flex items-center gap-0.5 text-[9px] font-bold bg-amber-100 text-amber-800 px-1.5 py-0.2 rounded">
                                <Sparkles className="w-2.5 h-2.5 text-amber-600" />
                                NOVO ({ageDays}d)
                              </span>
                            ) : (
                              <span className="text-[10px] text-slate-500">
                                há {ageDays} dias
                              </span>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Coluna 6: Número de Vendas */}
                      <td className="py-3 px-2 text-center">
                        <div className="font-black text-slate-900 text-xs">
                          {item.sales_count_approx > 0
                            ? `+${item.sales_count_approx.toLocaleString("pt-BR")}`
                            : "0"}
                        </div>
                        {salesPerDay && (
                          <div
                            className="text-[10px] font-semibold text-emerald-700 mt-0.5"
                            title="Média aproximada de vendas por dia desde a criação"
                          >
                            ~{salesPerDay}/dia
                          </div>
                        )}
                      </td>

                      {/* Coluna 7: Preço Original / Tabelado */}
                      <td className="py-3 px-2 text-right">
                        {item.original_price && item.original_price > item.current_price ? (
                          <div>
                            <div className="text-xs font-semibold text-slate-500 line-through">
                              R$ {item.original_price.toFixed(2).replace(".", ",")}
                            </div>
                            <span className="text-[9px] text-slate-400 font-medium">
                              Preço s/ desc.
                            </span>
                          </div>
                        ) : (
                          <div className="text-xs font-medium text-slate-500">
                            R$ {item.current_price.toFixed(2).replace(".", ",")}
                          </div>
                        )}
                      </td>

                      {/* Coluna 8: Preço Promocional / Atual */}
                      <td className="py-3 px-2.5 text-right">
                        <div
                          className={`font-black text-sm ${
                            hasPromo ? "text-emerald-700" : "text-slate-900"
                          }`}
                        >
                          R$ {item.current_price.toFixed(2).replace(".", ",")}
                        </div>
                        <div className="flex flex-wrap items-center justify-end gap-1 mt-0.5">
                          {discountPct && discountPct > 0 ? (
                            <span className="text-[9px] font-extrabold bg-rose-100 text-rose-700 px-1.5 py-0.2 rounded">
                              -{discountPct}% OFF
                            </span>
                          ) : null}
                          {item.promo_badge &&
                          !item.promo_badge.includes("% OFF") ? (
                            <span className="text-[9px] font-bold bg-amber-100 text-amber-800 px-1.5 py-0.2 rounded">
                              {item.promo_badge}
                            </span>
                          ) : null}
                          {!hasPromo && (
                            <span className="text-[9px] text-slate-400">
                              Preço cheio
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Coluna 9: Líquido & Taxas Capturadas */}
                      <td className="py-3 px-2.5 text-right">
                        <div className="font-bold text-emerald-700">
                          R$ {net.toFixed(2).replace(".", ",")}
                        </div>
                        <div className="text-[10px] text-slate-500 flex flex-col items-end leading-tight mt-0.5">
                          <span>Tarifa: -R$ {fee.toFixed(2).replace(".", ",")}</span>
                          {shipping > 0 && (
                            <span className="text-blue-600 font-medium">
                              Frete: -R$ {shipping.toFixed(2).replace(".", ",")}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Coluna 10: Ações (Criar Meu Anúncio / Atualizar / Excluir) */}
                      <td className="py-3 px-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setItemToClone(item)}
                            className={`py-1.5 px-2.5 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1 shadow-2xs cursor-pointer ${
                              isCreated
                                ? "bg-white text-emerald-800 border border-emerald-300 hover:bg-emerald-50"
                                : "bg-indigo-600 text-white hover:bg-indigo-700"
                            }`}
                            title="Abrir criador de anúncio com os dados deste concorrente e marcar automaticamente como OK"
                          >
                            <Sparkles className="w-3.5 h-3.5 shrink-0" />
                            <span>{isCreated ? "Recriar" : "Criar Anúncio"}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleRefreshScrape(item)}
                            disabled={refreshingId === item.id}
                            className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-white rounded-lg border border-transparent hover:border-slate-200 transition-colors cursor-pointer"
                            title="Atualizar dados (preço, promoção e vendas) via Webscraping"
                          >
                            <RefreshCw
                              className={`w-3.5 h-3.5 ${
                                refreshingId === item.id
                                  ? "animate-spin text-indigo-600"
                                  : ""
                              }`}
                            />
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDeleteItem(item)}
                            disabled={deletingId === item.id}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg border border-transparent hover:border-rose-200 transition-colors cursor-pointer"
                            title="Excluir este anúncio da lista para não ocupar espaço"
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

      {/* Modal para Criar Meu Anúncio diretamente a partir da fila */}
      <CloneListingModal
        listing={cloneModalListing}
        isOpen={!!itemToClone}
        onClose={() => setItemToClone(null)}
        onSuccess={(msg) => {
          notify(msg);
          setItemToClone(null);
          fetchSavedListings();
        }}
      />
    </div>
  );
}
