"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Store,
  Search,
  ExternalLink,
  Flame,
  Sparkles,
  Bookmark,
  Calendar,
  DollarSign,
  TrendingUp,
  Tag,
  Zap,
  Truck,
  CheckCircle2,
  Filter,
  ArrowUpDown,
  PlusCircle,
  Eye,
  Edit3,
  Trash2,
  Star,
  RefreshCw,
  ShoppingBag,
  SlidersHorizontal,
  Layers,
  ChevronRight,
  Info,
} from "lucide-react";
import type { CompetitorStore, CompetitorStoreListing } from "@crm/types";
import { CloneListingModal } from "./CloneListingModal";
import { EditCompetitorModal } from "./EditCompetitorModal";
import { AddCompetitorStoreModal } from "./AddCompetitorStoreModal";
import { PairFromSearchModal } from "./PairFromSearchModal";


function getSafeListingUrl(item: CompetitorStoreListing): string {
  let url = (item.permalink || "").trim();

  // Desempacota URL de cliques patrocinados (Mercado Clics)
  if (url.includes("click1.mercadolivre.com.br") || url.includes("/mclics/")) {
    try {
      const u = new URL(url);
      const target = u.searchParams.get("url") || u.searchParams.get("tu");
      if (target) url = decodeURIComponent(target);
    } catch {}
  }

  // Se o link apontar erroneamente para a loja ou estiver quebrado, reconstrói pelo external_id
  const isStoreLink = url.includes("/pagina/") || url.includes("/loja/") || url.includes("/perfil/");
  if ((!url || isStoreLink || !url.startsWith("http")) && item.external_id) {
    if (item.external_id.startsWith("MLB")) {
      const numDigits = item.external_id.replace(/\D/g, "");
      if (item.is_catalog || numDigits.length <= 8) {
        url = "https://www.mercadolivre.com.br/p/" + item.external_id;
      } else {
        url = "https://produto.mercadolivre.com.br/" + item.external_id;
      }
    }
  }

  return url || ("https://produto.mercadolivre.com.br/" + item.external_id);
}

export function CompetitorStoresSubTab() {
  // Navegação Interna: Lojas vs Anúncios
  const [activeView, setActiveView] = useState<"stores" | "listings">("stores");
  const [selectedStoreId, setSelectedStoreId] = useState<string>("all");

  // Dados
  const [stores, setStores] = useState<CompetitorStore[]>([]);
  const [listings, setListings] = useState<CompetitorStoreListing[]>([]);
  const [loadingStores, setLoadingStores] = useState<boolean>(true);
  const [loadingListings, setLoadingListings] = useState<boolean>(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Filtros de Lojas
  const [storeSearch, setStoreSearch] = useState<string>("");
  const [selectedSegment, setSelectedSegment] = useState<string>("all");
  const [followingOnly, setFollowingOnly] = useState<boolean>(false);

  // Filtros de Anúncios
  const [listingSearch, setListingSearch] = useState<string>("");
  const [onlyNew, setOnlyNew] = useState<boolean>(false);
  const [onlyBestSellers, setOnlyBestSellers] = useState<boolean>(false);
  const [onlyFull, setOnlyFull] = useState<boolean>(false);
  const [onlyFreeShipping, setOnlyFreeShipping] = useState<boolean>(false);
  const [listingSort, setListingSort] = useState<string>("most_sold");

  // Modais
  const [storeToEdit, setStoreToEdit] = useState<CompetitorStore | null>(null);
  const [isAddStoreOpen, setIsAddStoreOpen] = useState<boolean>(false);
  const [listingToClone, setListingToClone] = useState<CompetitorStoreListing | null>(null);
  const [pairingListing, setPairingListing] = useState<any | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3500);
  };

  // Carrega Lojas
  const fetchStores = useCallback(async () => {
    setLoadingStores(true);
    try {
      const params = new URLSearchParams();
      if (storeSearch) params.set("search", storeSearch);
      if (selectedSegment !== "all") params.set("segment", selectedSegment);
      if (followingOnly) params.set("followingOnly", "true");

      const res = await fetch(`/api/competitors/stores?${params.toString()}`, { cache: "no-store" });
      const json = await res.json();
      if (res.ok && json.success) {
        setStores(json.data || []);
      }
    } catch (e) {
      console.error("Erro ao carregar lojas:", e);
    } finally {
      setLoadingStores(false);
    }
  }, [storeSearch, selectedSegment, followingOnly]);

  // Carrega Anúncios
  const fetchListings = useCallback(async () => {
    setLoadingListings(true);
    try {
      const params = new URLSearchParams();
      if (listingSearch) params.set("search", listingSearch);
      if (onlyNew) params.set("onlyNew", "true");
      if (onlyFull) params.set("onlyFull", "true");
      if (onlyFreeShipping) params.set("onlyFreeShipping", "true");
      if (onlyBestSellers) params.set("minSales", "1000");
      params.set("sort", listingSort);

      const res = await fetch(
        `/api/competitors/stores/${selectedStoreId}/listings?${params.toString()}`,
        { cache: "no-store" }
      );
      const json = await res.json();
      if (res.ok && json.success) {
        setListings(json.data || []);
      }
    } catch (e) {
      console.error("Erro ao carregar anúncios:", e);
    } finally {
      setLoadingListings(false);
    }
  }, [selectedStoreId, listingSearch, onlyNew, onlyFull, onlyFreeShipping, onlyBestSellers, listingSort]);

  useEffect(() => {
    fetchStores();
  }, [fetchStores]);

  useEffect(() => {
    if (activeView === "listings") {
      fetchListings();
    }
  }, [activeView, fetchListings]);

  // Alterna status de seguir
  const toggleFollow = async (store: CompetitorStore, e: React.MouseEvent) => {
    e.stopPropagation();
    const nextVal = !store.is_following;

    // Atualização otimista
    setStores((prev) =>
      prev.map((s) => (s.id === store.id ? { ...s, is_following: nextVal } : s))
    );

    try {
      const res = await fetch(`/api/competitors/stores/${store.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_following: nextVal }),
      });
      if (res.ok) {
        showToast(
          nextVal
            ? `⭐ Agora você está seguindo "${store.store_name}"!`
            : `Deixou de seguir "${store.store_name}".`
        );
      }
    } catch (err) {
      console.error(err);
      fetchStores();
    }
  };

  // Exclui loja
  const handleDeleteStore = async (store: CompetitorStore, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Deseja realmente remover o concorrente "${store.store_name}" e seus anúncios monitorados?`)) {
      return;
    }

    try {
      const res = await fetch(`/api/competitors/stores/${store.id}`, { method: "DELETE" });
      if (res.ok) {
        showToast(`Loja "${store.store_name}" removida com sucesso.`);
        fetchStores();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Abre visualização de anúncios filtrada para uma loja específica
  const handleInspectStore = (storeId: string) => {
    setSelectedStoreId(storeId);
    setActiveView("listings");
  };

  // Cálculo dos segmentos únicos disponíveis
  const availableSegments = useMemo(() => {
    const set = new Set<string>();
    stores.forEach((s) => {
      if (s.segment) set.add(s.segment);
    });
    return Array.from(set);
  }, [stores]);

  // Métricas Totais
  const totalStoresCount = stores.length;
  const followingCount = stores.filter((s) => s.is_following).length;
  const totalListingsCount = stores.reduce((acc, s) => acc + (s.total_listings || 0), 0);
  const totalSalesEstimate = stores.reduce((acc, s) => acc + (s.total_sales_approx || 0), 0);

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toastMsg && (
        <div className="fixed top-5 right-5 z-50 bg-slate-900 text-white text-xs px-4 py-2.5 rounded-xl shadow-2xl border border-slate-700 flex items-center gap-2 animate-in slide-in-from-top-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Cards de Métricas Principais */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold">Concorrentes Monitorados</span>
            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Store className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 tracking-tight">
            {totalStoresCount}
          </div>
          <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
            <span className="font-bold text-indigo-600">{followingCount}</span> lojas seguidas ativamente
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold">Anúncios Espionados</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <ShoppingBag className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 tracking-tight">
            {totalListingsCount.toLocaleString("pt-BR")}
          </div>
          <div className="text-[11px] text-emerald-600 mt-1 font-semibold flex items-center gap-1">
            <span>Extraídos via Extensão & Varredura</span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold">Vendas Estimadas Concorrentes</span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
              <Flame className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 tracking-tight">
            +{totalSalesEstimate.toLocaleString("pt-BR")}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">Volume acumulado capturado</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold">Captura Rápida via Extensão</span>
            <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
              <Zap className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xs text-slate-600 font-medium leading-relaxed">
            Abra a loja do concorrente no Mercado Livre e clique no botão flutuante da extensão para escanear todos os anúncios.
          </div>
        </div>
      </div>

      {/* Barra de Seleção de Visão: Lojas vs Anúncios */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white p-2 rounded-xl border border-slate-200 shadow-2xs">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveView("stores")}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
              activeView === "stores"
                ? "bg-indigo-600 text-white shadow-xs"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
            }`}
          >
            <Store className="w-4 h-4" />
            <span>Lojas & Concorrentes ({totalStoresCount})</span>
          </button>

          <button
            onClick={() => {
              setActiveView("listings");
            }}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
              activeView === "listings"
                ? "bg-indigo-600 text-white shadow-xs"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
            }`}
          >
            <Eye className="w-4 h-4" />
            <span>Raio-X de Anúncios & Oportunidades</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-emerald-500 text-white font-black">
              NOVO
            </span>
          </button>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <button
            onClick={() => setIsAddStoreOpen(true)}
            className="px-3.5 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors flex items-center gap-1.5"
          >
            <PlusCircle className="w-4 h-4 text-indigo-600" />
            <span>+ Adicionar Loja Manualmente</span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* VISÃO 1: LISTA DE LOJAS E CONCORRENTES */}
      {/* ========================================================================= */}
      {activeView === "stores" && (
        <div className="space-y-4">
          {/* Barra de Filtros de Lojas */}
          <div className="bg-white p-3 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[280px]">
              {/* Busca por Nome */}
              <div className="relative flex-1 min-w-[200px]">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={storeSearch}
                  onChange={(e) => setStoreSearch(e.target.value)}
                  placeholder="Buscar concorrente por nome, seller ou nicho..."
                  className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
                />
              </div>

              {/* Filtro por Seguimento */}
              <div className="flex items-center gap-1.5">
                <span className="text-slate-500 font-medium">Seguimento:</span>
                <select
                  value={selectedSegment}
                  onChange={(e) => setSelectedSegment(e.target.value)}
                  className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-700 focus:outline-none"
                >
                  <option value="all">Todos os Nichos</option>
                  {availableSegments.map((seg) => (
                    <option key={seg} value={seg}>
                      {seg}
                    </option>
                  ))}
                </select>
              </div>

              {/* Filtro Apenas Seguidos */}
              <button
                type="button"
                onClick={() => setFollowingOnly(!followingOnly)}
                className={`px-3 py-1.5 rounded-lg font-semibold transition-colors flex items-center gap-1.5 ${
                  followingOnly
                    ? "bg-amber-100 text-amber-800 border border-amber-300 font-bold"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                <Star className={`w-3.5 h-3.5 ${followingOnly ? "fill-amber-500 text-amber-500" : ""}`} />
                <span>Apenas Seguidos</span>
              </button>
            </div>

            <button
              onClick={fetchStores}
              disabled={loadingStores}
              className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
              title="Atualizar lista"
            >
              <RefreshCw className={`w-4 h-4 ${loadingStores ? "animate-spin text-indigo-600" : ""}`} />
            </button>
          </div>

          {/* Grid de Cards de Lojas */}
          {loadingStores ? (
            <div className="p-12 text-center text-slate-400 text-xs">Carregando lojas concorrentes...</div>
          ) : stores.length === 0 ? (
            <div className="bg-white p-12 text-center rounded-2xl border border-dashed border-slate-300 space-y-3">
              <Store className="w-10 h-10 text-slate-300 mx-auto" />
              <h4 className="font-bold text-slate-800 text-sm">Nenhum Concorrente Encontrado</h4>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Capture os anúncios abrindo a página de um concorrente no Mercado Livre com a extensão, ou adicione o link manualmente.
              </p>
              <button
                onClick={() => setIsAddStoreOpen(true)}
                className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg inline-flex items-center gap-1.5 shadow-xs"
              >
                <PlusCircle className="w-4 h-4" />
                <span>Cadastrar Concorrente Agora</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {stores.map((store) => (
                <div
                  key={store.id}
                  className="bg-white rounded-xl border border-slate-200/90 shadow-2xs hover:shadow-md hover:border-indigo-200 transition-all flex flex-col justify-between overflow-hidden group"
                >
                  <div className="p-4 space-y-3">
                    {/* Topo do Card */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div className="w-10 h-10 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-700 font-black text-sm group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-colors">
                          {store.store_name.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <h4 className="font-bold text-slate-900 text-sm tracking-tight leading-tight group-hover:text-indigo-600 transition-colors">
                            {store.store_name}
                          </h4>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                              {store.seller_reputation?.toUpperCase() || "PLATINUM"}
                            </span>
                            {store.seller_nickname && (
                              <span className="text-[10px] text-slate-400 font-mono">
                                @{store.seller_nickname}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Botão Seguir */}
                      <button
                        type="button"
                        onClick={(e) => toggleFollow(store, e)}
                        className={`p-1.5 rounded-lg border transition-all ${
                          store.is_following
                            ? "bg-amber-50 border-amber-200 text-amber-600 hover:bg-amber-100"
                            : "bg-slate-50 border-slate-200 text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                        }`}
                        title={store.is_following ? "Seguindo (Clique para deixar de seguir)" : "Clique para seguir"}
                      >
                        <Star className={`w-4 h-4 ${store.is_following ? "fill-amber-400" : ""}`} />
                      </button>
                    </div>

                    {/* Seguimento / Nicho Editável */}
                    <div className="flex items-center justify-between bg-slate-50 p-2 rounded-lg border border-slate-200/70">
                      <div className="flex items-center gap-1.5 text-xs">
                        <Tag className="w-3.5 h-3.5 text-indigo-600" />
                        <span className="text-slate-500 font-medium">Seguimento:</span>
                        <span className="font-bold text-slate-800">{store.segment || "Geral"}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setStoreToEdit(store)}
                        className="text-[10px] text-indigo-600 hover:text-indigo-800 font-bold hover:underline flex items-center gap-0.5"
                      >
                        <Edit3 className="w-3 h-3" />
                        <span>Editar</span>
                      </button>
                    </div>

                    {/* Estatísticas da Loja */}
                    <div className="grid grid-cols-3 gap-2 py-1 border-y border-slate-100 text-center text-xs">
                      <div>
                        <div className="text-[10px] text-slate-400 font-semibold uppercase">Anúncios</div>
                        <div className="font-bold text-slate-900 text-sm mt-0.5">
                          {store.total_listings || 0}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-400 font-semibold uppercase">Vendas Est.</div>
                        <div className="font-bold text-emerald-600 text-sm mt-0.5">
                          +{(store.total_sales_approx || 0).toLocaleString("pt-BR")}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-400 font-semibold uppercase">Ticket Médio</div>
                        <div className="font-bold text-slate-900 text-sm mt-0.5">
                          R$ {(store.avg_ticket || 0).toFixed(2).replace(".", ",")}
                        </div>
                      </div>
                    </div>

                    {/* Link Salvo da Loja no ERP */}
                    <div className="pt-0.5">
                      <a
                        href={store.store_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1 truncate hover:underline"
                        title={store.store_url}
                      >
                        <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">Abrir Loja no Mercado Livre</span>
                      </a>
                    </div>
                  </div>

                  {/* Ações do Rodapé */}
                  <div className="bg-slate-50 p-3 border-t border-slate-100 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => handleInspectStore(store.id)}
                      className="flex-1 py-1.5 px-3 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-2xs transition-colors flex items-center justify-center gap-1.5"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Ver Raio-X de Anúncios</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setStoreToEdit(store)}
                      className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-200/60 rounded-lg transition-colors"
                      title="Editar dados e anotações"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>

                    <button
                      type="button"
                      onClick={(e) => handleDeleteStore(store, e)}
                      className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="Excluir concorrente"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* VISÃO 2: RAIO-X COMPLETO DE ANÚNCIOS DO CONCORRENTE */}
      {/* ========================================================================= */}
      {activeView === "listings" && (
        <div className="space-y-4">
          {/* Barra de Filtros dos Anúncios */}
          <div className="bg-white p-3.5 rounded-xl border border-slate-200 space-y-3 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-3">
              {/* Seletor de Loja */}
              <div className="flex items-center gap-2">
                <span className="text-slate-600 font-bold">Concorrente:</span>
                <select
                  value={selectedStoreId}
                  onChange={(e) => setSelectedStoreId(e.target.value)}
                  className="bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                >
                  <option value="all">🏬 Todos os Concorrentes ({stores.length})</option>
                  {stores.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.store_name} ({s.segment})
                    </option>
                  ))}
                </select>
              </div>

              {/* Ordenação */}
              <div className="flex items-center gap-2">
                <span className="text-slate-500 font-medium">Ordenar por:</span>
                <select
                  value={listingSort}
                  onChange={(e) => setListingSort(e.target.value)}
                  className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-700 focus:outline-none"
                >
                  <option value="most_sold">🔥 Mais Vendidos (Best Sellers)</option>
                  <option value="newest">✨ Mais Recentes (Novos Anúncios)</option>
                  <option value="price_asc">Menor Preço</option>
                  <option value="price_desc">Maior Preço</option>
                  <option value="discount">Maior Desconto %</option>
                </select>
              </div>
            </div>

            {/* Linha 2: Busca e Filtros Rápidos */}
            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100">
              <div className="relative flex-1 min-w-[220px]">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={listingSearch}
                  onChange={(e) => setListingSearch(e.target.value)}
                  placeholder="Filtrar produtos por título ou código MLB..."
                  className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>

              {/* Chips Rápidos */}
              <button
                type="button"
                onClick={() => setOnlyBestSellers(!onlyBestSellers)}
                className={`px-3 py-1.5 rounded-lg font-semibold transition-colors flex items-center gap-1.5 ${
                  onlyBestSellers
                    ? "bg-amber-100 text-amber-800 border border-amber-300 font-bold"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                <Flame className="w-3.5 h-3.5 text-amber-600" />
                <span>Mais Vendidos (+1k)</span>
              </button>

              <button
                type="button"
                onClick={() => setOnlyNew(!onlyNew)}
                className={`px-3 py-1.5 rounded-lg font-semibold transition-colors flex items-center gap-1.5 ${
                  onlyNew
                    ? "bg-indigo-100 text-indigo-800 border border-indigo-300 font-bold"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                <span>Novos Anúncios (&le;30d)</span>
              </button>

              <button
                type="button"
                onClick={() => setOnlyFull(!onlyFull)}
                className={`px-3 py-1.5 rounded-lg font-semibold transition-colors flex items-center gap-1.5 ${
                  onlyFull
                    ? "bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                <Zap className="w-3.5 h-3.5 text-emerald-600" />
                <span>FULL</span>
              </button>

              <button
                type="button"
                onClick={() => setOnlyFreeShipping(!onlyFreeShipping)}
                className={`px-3 py-1.5 rounded-lg font-semibold transition-colors flex items-center gap-1.5 ${
                  onlyFreeShipping
                    ? "bg-blue-100 text-blue-800 border border-blue-300 font-bold"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                <Truck className="w-3.5 h-3.5 text-blue-600" />
                <span>Frete Grátis</span>
              </button>
            </div>
          </div>

          {/* Tabela Profissional de Anúncios Espionados */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
            {loadingListings ? (
              <div className="p-12 text-center text-slate-400 text-xs">Carregando anúncios do concorrente...</div>
            ) : listings.length === 0 ? (
              <div className="p-12 text-center space-y-2">
                <ShoppingBag className="w-8 h-8 text-slate-300 mx-auto" />
                <div className="text-xs font-bold text-slate-700">Nenhum anúncio localizado com os filtros ativos.</div>
                <div className="text-[11px] text-slate-500">Tente ajustar a busca ou limpar os filtros.</div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-semibold select-none">
                      <th className="py-3 px-3 w-12 text-center">Foto</th>
                      <th className="py-3 px-3 min-w-[280px]">Título & Anúncio</th>
                      <th className="py-3 px-3 w-40">Loja & Nicho</th>
                      <th className="py-3 px-3 w-36 text-center">Criação / Idade</th>
                      <th className="py-3 px-3 w-32 text-center">Vendas Est.</th>
                      <th className="py-3 px-3 w-32 text-right">Preço Atual</th>
                      <th className="py-3 px-3 w-32 text-right">Líquido Concorrente</th>
                      <th className="py-3 px-3 w-44 text-center">Ação Estratégica</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {// Deduplica anúncios na visualização
                    (() => {
                      const seen = new Set<string>();
                      const uniqueListings = listings.filter((item) => {
                        const key = (item.store_id || "") + "_" + (item.external_id || item.id);
                        if (seen.has(key)) return false;
                        seen.add(key);
                        return true;
                      });
                      return uniqueListings;
                    })().map((item) => {
                      const safeUrl = getSafeListingUrl(item);
                      // Formata data e calcula novidade
                      let createdDateText = "—";
                      let isRecent = false;
                      let ageDays = 0;

                      if (item.listing_created_at) {
                        const d = new Date(item.listing_created_at);
                        if (!isNaN(d.getTime())) {
                          createdDateText = d.toLocaleDateString("pt-BR");
                          ageDays = Math.max(0, Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24)));
                          isRecent = ageDays <= 30;
                        }
                      }

                      return (
                        <tr key={item.id} className="hover:bg-slate-50/80 transition-colors group">
                          {/* Foto com Zoom */}
                          <td className="py-2.5 px-3 text-center">
                            <div className="w-11 h-11 rounded-lg bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center shrink-0 mx-auto">
                              {item.thumbnail_url ? (
                                <img
                                  src={item.thumbnail_url}
                                  alt={item.title}
                                  className="w-full h-full object-contain group-hover:scale-110 transition-transform"
                                />
                              ) : (
                                <ShoppingBag className="w-5 h-5 text-slate-300" />
                              )}
                            </div>
                          </td>

                          {/* Título & Badges */}
                          <td className="py-2.5 px-3">
                            <a
                              href={safeUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-bold text-slate-900 hover:text-indigo-600 transition-colors line-clamp-2 leading-tight group/link inline-flex items-center gap-1.5"
                              title={`Abrir "${item.title}" no Mercado Livre (nova aba)`}
                            >
                              <span>{item.title}</span>
                              <ExternalLink className="w-3.5 h-3.5 text-slate-400 group-hover/link:text-indigo-600 shrink-0 opacity-70 group-hover/link:opacity-100 transition-opacity" />
                            </a>
                            <div className="flex flex-wrap items-center gap-1.5 mt-1">
                              <span className="font-mono text-[10px] text-slate-400">
                                {item.external_id}
                              </span>
                              {item.is_full && (
                                <span className="bg-emerald-100 text-emerald-800 text-[9px] font-bold px-1.5 py-0.2 rounded-md flex items-center gap-0.5">
                                  <Zap className="w-2.5 h-2.5 fill-emerald-600 text-emerald-600" />
                                  FULL
                                </span>
                              )}
                              {item.is_free_shipping && (
                                <span className="bg-blue-100 text-blue-800 text-[9px] font-bold px-1.5 py-0.2 rounded-md flex items-center gap-0.5">
                                  <Truck className="w-2.5 h-2.5 text-blue-600" />
                                  Frete Grátis
                                </span>
                              )}
                              {item.promo_badge && (
                                <span className="bg-amber-100 text-amber-800 text-[9px] font-bold px-1.5 py-0.2 rounded-md">
                                  {item.promo_badge}
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Loja & Nicho */}
                          <td className="py-2.5 px-3">
                            <div className="font-semibold text-slate-800 truncate" title={item.store_name}>
                              {item.store_name || "Loja Concorrente"}
                            </div>
                            <span className="text-[10px] text-indigo-700 bg-indigo-50 px-1.5 py-0.2 rounded-md font-bold mt-0.5 inline-block">
                              {item.store_segment || "Geral"}
                            </span>
                          </td>

                          {/* Data de Criação / Idade */}
                          <td className="py-2.5 px-3 text-center">
                            <div className="font-semibold text-slate-800">{createdDateText}</div>
                            {isRecent ? (
                              <span className="inline-flex items-center gap-0.5 text-[9px] font-bold bg-amber-100 text-amber-800 px-1.5 py-0.2 rounded-md mt-0.5">
                                <Sparkles className="w-2.5 h-2.5 text-amber-600" />
                                NOVO ({ageDays}d)
                              </span>
                            ) : (
                              <span className="text-[10px] text-slate-400">há {ageDays} dias</span>
                            )}
                          </td>

                          {/* Vendas Estimadas */}
                          <td className="py-2.5 px-3 text-center">
                            <div className="font-black text-slate-900">
                              {item.sales_count_approx > 0
                                ? `+${item.sales_count_approx.toLocaleString("pt-BR")}`
                                : "Sem vendas"}
                            </div>
                            {item.is_catalog ? (
                              <span
                                className="text-[9px] font-bold bg-purple-100 text-purple-800 px-1.5 py-0.2 rounded-md mt-0.5 inline-block"
                                title="Vendas acumuladas globais do catálogo do Mercado Livre (disputa de Buy Box)"
                              >
                                📦 Catálogo ML
                              </span>
                            ) : item.sales_count_approx >= 1000 ? (
                              <span className="text-[9px] font-bold bg-emerald-100 text-emerald-800 px-1.5 py-0.2 rounded-md mt-0.5 inline-block">
                                🔥 Best Seller
                              </span>
                            ) : null}
                          </td>

                          {/* Preço Atual */}
                          <td className="py-2.5 px-3 text-right">
                            <div className="font-bold text-slate-900 text-sm">
                              R$ {item.current_price.toFixed(2).replace(".", ",")}
                            </div>
                            {item.original_price && item.original_price > item.current_price && (
                              <div className="text-[10px] text-slate-400 line-through">
                                R$ {item.original_price.toFixed(2).replace(".", ",")}
                              </div>
                            )}
                          </td>

                          {/* Líquido Concorrente */}
                          <td className="py-2.5 px-3 text-right">
                            {(() => {
                              const fee = item.estimated_sale_fee || Number((item.current_price * 0.165).toFixed(2));
                              const hasFreeShip = item.is_free_shipping || item.current_price >= 79;
                              
                              let shipping = item.estimated_shipping !== undefined && item.estimated_shipping !== null
                                ? item.estimated_shipping
                                : null;

                              if ((shipping === null || shipping === 0) && hasFreeShip) {
                                if (item.current_price < 19) shipping = 5.65;
                                else if (item.current_price < 49) shipping = 6.85;
                                else if (item.current_price < 79) shipping = 10.25;
                                else if (item.current_price < 100) shipping = 13.65;
                                else if (item.current_price < 120) shipping = 16.85;
                                else if (item.current_price < 150) shipping = 18.65;
                                else if (item.current_price < 200) shipping = 20.45;
                                else shipping = 22.45;
                              } else if (shipping === null) {
                                shipping = Math.max(0, Number((item.current_price - fee - (item.estimated_net || 0)).toFixed(2)));
                              }

                              const net = Math.max(0, Number((item.current_price - fee - shipping).toFixed(2)));

                              return (
                                <div
                                  className="cursor-help"
                                  title={`Preço: R$ ${item.current_price.toFixed(2).replace(".", ",")} | (-) Tarifa ML: R$ ${fee.toFixed(2).replace(".", ",")}${shipping > 0 ? ` | (-) Frete: R$ ${shipping.toFixed(2).replace(".", ",")}` : ""} => Líquido Estimado: R$ ${net.toFixed(2).replace(".", ",")}`}
                                >
                                  <div className="font-bold text-emerald-700">
                                    R$ {net.toFixed(2).replace(".", ",")}
                                  </div>
                                  <div className="text-[10px] text-slate-500 flex flex-col items-end gap-0.5 mt-0.5 leading-tight">
                                    <span>Tarifa: -R$ {fee.toFixed(2).replace(".", ",")}</span>
                                    {shipping > 0 && (
                                      <span className="text-blue-600 font-medium">Frete: -R$ {shipping.toFixed(2).replace(".", ",")}</span>
                                    )}
                                  </div>
                                </div>
                              );
                            })()}
                          </td>

                          {/* Ação: Criar Meu Anúncio a partir Deste */}
                          <td className="py-2.5 px-3 text-center">
                            <div className="flex flex-col gap-1.5 items-center">
                              <button
                                type="button"
                                onClick={() => setListingToClone(item)}
                                className="w-full py-1.5 px-2.5 text-[11px] font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-2xs transition-colors flex items-center justify-center gap-1"
                                title="Criar meu anúncio no catálogo baseado nas fotos e dados deste concorrente"
                              >
                                <Sparkles className="w-3.5 h-3.5" />
                                <span>Criar Meu Anúncio</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  setPairingListing({
                                    id: item.external_id,
                                    platform: item.platform,
                                    external_id: item.external_id,
                                    title: item.title,
                                    current_price: item.current_price,
                                    original_price: item.original_price || null,
                                    shipping_type: item.shipping_type,
                                    promo_badge: item.promo_badge || null,
                                    permalink: item.permalink,
                                    thumbnail_url: item.thumbnail_url || null,
                                    seller_name: item.store_name || "Concorrente",
                                    seller_reputation: "platinum",
                                    sales_count_approx: item.sales_count_approx,
                                    rating: item.rating,
                                  });
                                }}
                                className="text-[10px] text-slate-500 hover:text-slate-800 font-semibold hover:underline"
                              >
                                Monitorar no Radar 1:N
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
        </div>
      )}

      {/* Modal de Criação / Clonagem do Anúncio */}
      <CloneListingModal
        listing={listingToClone}
        isOpen={!!listingToClone}
        onClose={() => setListingToClone(null)}
        onSuccess={(msg) => {
          showToast(msg);
          setListingToClone(null);
        }}
      />

      {/* Modal de Edição do Concorrente (Seguimento, Status de Seguir, Nome) */}
      <EditCompetitorModal
        store={storeToEdit}
        isOpen={!!storeToEdit}
        onClose={() => setStoreToEdit(null)}
        onSuccess={(msg) => {
          showToast(msg);
          fetchStores();
        }}
      />

      {/* Modal de Cadastro Manual de Loja */}
      <AddCompetitorStoreModal
        isOpen={isAddStoreOpen}
        onClose={() => setIsAddStoreOpen(false)}
        onSuccess={(msg) => {
          showToast(msg);
          fetchStores();
        }}
      />

      {/* Modal de Pareamento no Radar 1:N */}
      {pairingListing && (
        <PairFromSearchModal
          item={pairingListing}
          isOpen={!!pairingListing}
          onClose={() => setPairingListing(null)}
          onSuccess={(msg) => {
            showToast(msg);
            setPairingListing(null);
          }}
        />
      )}
    </div>
  );
}