"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Search,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  MinusCircle,
  AlertCircle,
  Sliders,
  Sparkles,
  Radio,
  Target,
  Trash2,
} from "lucide-react";
import type {
  BiComparativeResponse,
  ComparativeListingGroup,
  MarketplacePlatform,
} from "@crm/types";
import { ComparativeTable } from "./ComparativeTable";
import { useRealtimeCompetitors } from "@/hooks/useRealtimeCompetitors";

export function BiDashboard() {
  const [activePlatform, setActivePlatform] = useState<MarketplacePlatform>("mercadolivre");
  const [data, setData] = useState<BiComparativeResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [search, setSearch] = useState<string>("");
  const [debouncedSearch, setDebouncedSearch] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("MONITORED");
  const [syncingBatch, setSyncingBatch] = useState<boolean>(false);
  const [purgingUnlinked, setPurgingUnlinked] = useState<boolean>(false);
  const [syncSuccessMsg, setSyncSuccessMsg] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 400);
    return () => clearTimeout(t);
  }, [search]);

  // Carrega dados da API comparativa
  const fetchData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const params = new URLSearchParams();
      params.set("platform", activePlatform);
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (statusFilter !== "all") params.set("status", statusFilter);

      const res = await fetch(`/api/bi/comparative?${params.toString()}`, {
        cache: "no-store",
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json) {
        throw new Error(json?.details || json?.error || `HTTP ${res.status}`);
      }
      setData(json as BiComparativeResponse);
    } catch (e) {
      console.error("Falha ao carregar dados de BI:", e);
      setLoadError(e instanceof Error ? e.message : "Erro desconhecido");
    } finally {
      setLoading(false);
    }
  }, [activePlatform, debouncedSearch, statusFilter]);

  // Dispara sincronização e varredura em lote (anúncios próprios com promoções + concorrentes)
  const handleSyncBatch = async () => {
    setSyncingBatch(true);
    setSyncSuccessMsg(null);
    try {
      // 1. Sincroniza catálogo próprio e promoções ativas (Central de Promoções / Black Friday)
      try {
        const syncRes = await fetch("/api/my-listings/sync", { method: "POST" });
        const syncJson = await syncRes.json().catch(() => null);
        if (!syncRes.ok || !syncJson?.success) {
          if (syncJson?.reauthRequired || syncRes.status === 401 || syncRes.status === 403) {
            alert(
              "⚠️ Conexão do Mercado Livre Expirada!\n\n" +
                "A autorização da sua conta no Mercado Livre expirou ou foi revogada.\n" +
                "Acesse 'Configurações & APIs' no menu lateral e clique em 'Reconectar' para atualizar as campanhas e preços."
            );
            return;
          }
          if (syncJson?.error) {
            console.warn("Aviso ao sincronizar catálogo próprio:", syncJson.error);
          }
        }
      } catch (errSync) {
        console.warn("Aviso ao sincronizar catálogo próprio:", errSync);
      }

      // 2. Sincroniza histórico e varredura dos concorrentes
      const res = await fetch("/api/bi/sync-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform: activePlatform, forceAll: true }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setSyncSuccessMsg("Anúncios próprios (com promoções ativas) e concorrentes sincronizados com sucesso!");
        await fetchData();
        setTimeout(() => setSyncSuccessMsg(null), 5000);
      } else {
        alert(json.message || json.error || "Erro ao sincronizar anúncios.");
      }
    } catch (err) {
      console.error("Erro na sincronização em lote:", err);
      alert("Falha na comunicação com o servidor ao sincronizar.");
    } finally {
      setSyncingBatch(false);
    }
  };

  // Inscrição Realtime no canal Postgres via Hook
  const { highlightedIds, triggerHighlight, lastEventTime } = useRealtimeCompetitors({
    onPriceUpdate: ({ competitorId, newPrice }) => {
      setData((prev) => {
        if (!prev) return prev;
        const updatedItems = prev.items.map((group) => {
          let hasMatch = false;
          const updatedCompetitors = group.competitors.map((c) => {
            if (c.id === competitorId) {
              hasMatch = true;
              const diffBrl = group.my_listing.current_price - newPrice;
              const diffPct = newPrice > 0 ? (diffBrl / newPrice) * 100 : 0;
              return {
                ...c,
                current_price: newPrice,
                price_difference_brl: Number(diffBrl.toFixed(2)),
                price_difference_pct: Number(diffPct.toFixed(2)),
                last_scraped_at: new Date().toISOString(),
              };
            }
            return c;
          });

          if (!hasMatch) return group;

          // Recalcula menor preço e status daquele grupo
          const lowest = Math.min(...updatedCompetitors.map((c) => c.current_price));
          const diffBrl = Number((group.my_listing.current_price - lowest).toFixed(2));
          const diffPct = Number(((diffBrl / lowest) * 100).toFixed(2));
          const status = diffBrl < 0 ? "WINNING" : diffBrl === 0 ? "TIED" : "LOSING";

          return {
            ...group,
            competitors: updatedCompetitors,
            lowest_competitor_price: lowest,
            diff_brl: diffBrl,
            diff_pct: diffPct,
            status: status as any,
          };
        });

        return { ...prev, items: updatedItems };
      });
    },
    onCompetitorChange: () => {
      // Recarrega automaticamente quando a extensão ou webhook adiciona novo concorrente/radar
      fetchData();
    },
  });

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Atualização local de preço quando usuário reprecifica no modal ou sincroniza preço individual
  const handlePriceUpdated = (listingId: string, newPrice: number, newOriginalPrice?: number | null) => {
    setData((prev) => {
      if (!prev) return prev;
      const updatedItems = prev.items.map((group) => {
        if (group.my_listing.id === listingId) {
          const lowest = group.lowest_competitor_price;
          const diffBrl = lowest ? Number((newPrice - lowest).toFixed(2)) : null;
          const diffPct = lowest && lowest > 0 && diffBrl !== null ? Number(((diffBrl / lowest) * 100).toFixed(2)) : null;
          const status = lowest === null ? "UNMATCHED" : (diffBrl || 0) < 0 ? "WINNING" : diffBrl === 0 ? "TIED" : "LOSING";

          return {
            ...group,
            my_listing: {
              ...group.my_listing,
              current_price: newPrice,
              original_price: newOriginalPrice !== undefined ? newOriginalPrice : group.my_listing.original_price,
            },
            diff_brl: diffBrl,
            diff_pct: diffPct,
            status: status as any,
          };
        }
        return group;
      });
      return { ...prev, items: updatedItems };
    });
  };

  // Atualização em tempo real quando usuário clica em "Atualizar Dados" no comparativo
  const handleComparisonRefreshed = (myListingId: string, resultData: any) => {
    setData((prev) => {
      if (!prev) return prev;
      const updatedItems = prev.items.map((group) => {
        if (group.my_listing.id === myListingId) {
          const updatedMyListing = resultData.my_listing
            ? {
                ...group.my_listing,
                current_price: resultData.my_listing.current_price,
                original_price:
                  resultData.my_listing.original_price !== undefined
                    ? resultData.my_listing.original_price
                    : group.my_listing.original_price,
              }
            : group.my_listing;

          const updatedCompetitors = group.competitors.map((c) => {
            if (
              c.id === resultData.competitor?.id ||
              c.external_id === resultData.competitor?.external_id
            ) {
              const diffBrl = updatedMyListing.current_price - resultData.competitor.current_price;
              const diffPct =
                resultData.competitor.current_price > 0
                  ? (diffBrl / resultData.competitor.current_price) * 100
                  : 0;

              return {
                ...c,
                ...resultData.competitor,
                current_price: resultData.competitor.current_price,
                original_price: resultData.competitor.original_price,
                price_difference_brl: Number(diffBrl.toFixed(2)),
                price_difference_pct: Number(diffPct.toFixed(2)),
                last_scraped_at: new Date().toISOString(),
              };
            }
            return c;
          });

          const lowest =
            updatedCompetitors.length > 0
              ? Math.min(...updatedCompetitors.map((c) => c.current_price))
              : null;
          const diffBrl =
            lowest !== null ? Number((updatedMyListing.current_price - lowest).toFixed(2)) : null;
          const diffPct =
            lowest !== null && lowest > 0 && diffBrl !== null
              ? Number(((diffBrl / lowest) * 100).toFixed(2))
              : null;
          const status =
            lowest === null
              ? "UNMATCHED"
              : (diffBrl || 0) < 0
              ? "WINNING"
              : diffBrl === 0
              ? "TIED"
              : "LOSING";

          return {
            ...group,
            my_listing: updatedMyListing,
            competitors: updatedCompetitors,
            lowest_competitor_price: lowest,
            diff_brl: diffBrl,
            diff_pct: diffPct,
            status: status as any,
          };
        }
        return group;
      });

      const summary = {
        total_listings: updatedItems.length,
        winning_count: updatedItems.filter((g) => g.status === "WINNING").length,
        tied_count: updatedItems.filter((g) => g.status === "TIED").length,
        losing_count: updatedItems.filter((g) => g.status === "LOSING").length,
        unmatched_count: updatedItems.filter((g) => g.status === "UNMATCHED").length,
      };

      return { ...prev, items: updatedItems, summary: { ...prev.summary, ...summary } };
    });

    if (resultData.competitor?.id) {
      triggerHighlight(resultData.competitor.id);
    }
  };

  // Exclusão de Concorrente Pareado com Atualização Otimista
  const handleDeleteCompetitor = async (myListingId: string, competitorId: string) => {
    try {
      const res = await fetch(
        `/api/competitors/matches?my_listing_id=${myListingId}&competitor_id=${competitorId}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        throw new Error("Falha ao excluir no servidor");
      }

      setData((prev) => {
        if (!prev) return prev;
        const updatedItems = prev.items
          .map((group) => {
            if (group.my_listing.id === myListingId) {
              const updatedCompetitors = group.competitors.filter((c) => c.id !== competitorId);
              
              // Se for um item de radar e todos os concorrentes foram removidos, remove o grupo
              if (group.my_listing.listing_type === "radar" && updatedCompetitors.length === 0) {
                return null;
              }

              const lowest =
                updatedCompetitors.length > 0
                  ? Math.min(...updatedCompetitors.map((c) => c.current_price))
                  : null;
              const diffBrl =
                lowest !== null ? Number((group.my_listing.current_price - lowest).toFixed(2)) : null;
              const diffPct =
                lowest !== null && lowest > 0 && diffBrl !== null
                  ? Number(((diffBrl / lowest) * 100).toFixed(2))
                  : null;
              const status =
                lowest === null
                  ? "UNMATCHED"
                  : (diffBrl || 0) < 0
                  ? "WINNING"
                  : diffBrl === 0
                  ? "TIED"
                  : "LOSING";

              return {
                ...group,
                competitors: updatedCompetitors,
                lowest_competitor_price: lowest,
                diff_brl: diffBrl,
                diff_pct: diffPct,
                status: status as any,
              };
            }
            return group;
          })
          .filter(Boolean) as ComparativeListingGroup[];

        const summary = {
          total_listings: updatedItems.length,
          winning_count: updatedItems.filter((g) => g.status === "WINNING").length,
          tied_count: updatedItems.filter((g) => g.status === "TIED").length,
          losing_count: updatedItems.filter((g) => g.status === "LOSING").length,
          unmatched_count: updatedItems.filter((g) => g.status === "UNMATCHED").length,
        };

        return { ...prev, items: updatedItems, summary };
      });
    } catch (e) {
      console.error("Erro ao remover concorrente:", e);
      alert("Não foi possível excluir o concorrente. Tente novamente.");
    }
  };

  // Exclusão de Anúncio Próprio do Monitoramento com Atualização Otimista
  const handleDeleteMyListing = async (myListingId: string, title: string) => {
    try {
      const res = await fetch(`/api/competitors/matches?my_listing_id=${myListingId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        throw new Error("Falha ao excluir anúncio no servidor");
      }

      setData((prev) => {
        if (!prev) return prev;
        const updatedItems = prev.items.filter((g) => g.my_listing.id !== myListingId);
        const summary = {
          total_listings: updatedItems.length,
          winning_count: updatedItems.filter((g) => g.status === "WINNING").length,
          tied_count: updatedItems.filter((g) => g.status === "TIED").length,
          losing_count: updatedItems.filter((g) => g.status === "LOSING").length,
          unmatched_count: updatedItems.filter((g) => g.status === "UNMATCHED").length,
        };
        return { ...prev, items: updatedItems, summary };
      });
    } catch (e) {
      console.error("Erro ao remover anúncio do monitoramento:", e);
      alert("Não foi possível remover o anúncio do monitoramento. Tente novamente.");
    }
  };

  // Simulação interativa para demonstração visual do Supabase Realtime
  const simulateRealtimePriceDrop = () => {
    if (!data || data.items.length === 0) return;
    const targetGroup = data.items.find((g) => g.competitors.length > 0);
    if (!targetGroup || targetGroup.competitors.length === 0) return;

    const targetComp = targetGroup.competitors[0];
    const newPrice = Number((targetComp.current_price * 0.95).toFixed(2)); // Reduz 5%

    triggerHighlight(targetComp.id);

    // Simula atualização
    setTimeout(() => {
      setData((prev) => {
        if (!prev) return prev;
        const updated = prev.items.map((g) => {
          if (g.my_listing.id === targetGroup.my_listing.id) {
            const comps = g.competitors.map((c) =>
              c.id === targetComp.id
                ? {
                    ...c,
                    current_price: newPrice,
                    price_difference_brl: Number((g.my_listing.current_price - newPrice).toFixed(2)),
                    price_difference_pct: Number((((g.my_listing.current_price - newPrice) / newPrice) * 100).toFixed(2)),
                  }
                : c
            );
            const lowest = Math.min(...comps.map((c) => c.current_price));
            const diffBrl = Number((g.my_listing.current_price - lowest).toFixed(2));
            const diffPct = Number(((diffBrl / lowest) * 100).toFixed(2));
            const status = diffBrl < 0 ? "WINNING" : diffBrl === 0 ? "TIED" : "LOSING";
            return {
              ...g,
              competitors: comps,
              lowest_competitor_price: lowest,
              diff_brl: diffBrl,
              diff_pct: diffPct,
              status: status as any,
            };
          }
          return g;
        });
        return { ...prev, items: updated };
      });
    }, 100);
  };

  // Limpeza em lote de anúncios avulsos do radar (não vinculados a anúncios próprios)
  const handlePurgeUnlinked = async () => {
    if (!confirm("Deseja limpar todos os anúncios avulsos do radar de mercado que NÃO estão vinculados a nenhum anúncio seu?")) {
      return;
    }
    setPurgingUnlinked(true);
    try {
      const res = await fetch("/api/competitors/matches?purge_unlinked=true", {
        method: "DELETE",
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setSyncSuccessMsg(json.message || "Anúncios avulsos do radar removidos com sucesso!");
        await fetchData();
        setTimeout(() => setSyncSuccessMsg(null), 5000);
      } else {
        alert(json.error || "Não foi possível limpar os anúncios avulsos.");
      }
    } catch (err) {
      console.error("Erro ao limpar avulsos:", err);
      alert("Falha de conexão ao tentar limpar os anúncios avulsos.");
    } finally {
      setPurgingUnlinked(false);
    }
  };

  const summary = data?.summary || {
    total_listings: 0,
    monitored_count: 0,
    winning_count: 0,
    tied_count: 0,
    losing_count: 0,
    unmatched_count: 0,
    radar_count: 0,
  };

  return (
    <div className="space-y-4">
      {/* Sub-abas Independentes: Mercado Livre & Shopee */}
      <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-0">
        <div className="flex space-x-1">
          <button
            onClick={() => setActivePlatform("mercadolivre")}
            className={`px-4 py-2.5 text-xs font-bold border-b-2 flex items-center space-x-2 transition-colors ${
              activePlatform === "mercadolivre"
                ? "border-sky-600 text-sky-700 bg-white"
                : "border-transparent text-slate-500 hover:text-slate-900 hover:border-slate-300"
            }`}
          >
            <span className="w-2.5 h-2.5 rounded-full bg-[#FFE600] border border-amber-400"></span>
            <span>Mercado Livre</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-100 text-slate-600 font-semibold">
              {activePlatform === "mercadolivre" ? summary.total_listings : "ML"}
            </span>
          </button>

          <button
            onClick={() => setActivePlatform("shopee")}
            className={`px-4 py-2.5 text-xs font-bold border-b-2 flex items-center space-x-2 transition-colors ${
              activePlatform === "shopee"
                ? "border-[#EE4D2D] text-[#EE4D2D] bg-white"
                : "border-transparent text-slate-500 hover:text-slate-900 hover:border-slate-300"
            }`}
          >
            <span className="w-2.5 h-2.5 rounded-full bg-[#EE4D2D]"></span>
            <span>Shopee</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-100 text-slate-600 font-semibold">
              {activePlatform === "shopee" ? summary.total_listings : "SHP"}
            </span>
          </button>
        </div>

        {/* Indicador de Realtime e Botões de Ação */}
        <div className="flex items-center space-x-2 pb-1">
          {lastEventTime && (
            <span className="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
              ⚡ Último evento Realtime: {lastEventTime}
            </span>
          )}

          <button
            onClick={handleSyncBatch}
            disabled={syncingBatch}
            className="inline-flex items-center gap-1.5 px-3 py-1 text-[11px] font-semibold text-white bg-indigo-600 hover:bg-indigo-700 border border-indigo-700 rounded shadow-2xs transition-colors disabled:opacity-60"
            title="Força varredura e atualização de preços dos concorrentes vinculados"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncingBatch ? "animate-spin" : ""}`} />
            {syncingBatch ? "Sincronizando..." : "Sincronizar e Carregar Preços Agora"}
          </button>

          <button
            onClick={simulateRealtimePriceDrop}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-300 rounded shadow-2xs transition-colors"
            title="Simula queda de preço de concorrente para validar o Supabase Realtime flash effect"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-600" />
            Simular Realtime Drop
          </button>
        </div>
      </div>

      {syncSuccessMsg && (
        <div className="bg-emerald-50 border border-emerald-300 text-emerald-900 px-3.5 py-2 rounded-md text-xs flex items-center justify-between animate-in fade-in">
          <span>{syncSuccessMsg}</span>
          <button
            onClick={() => setSyncSuccessMsg(null)}
            className="text-emerald-700 font-bold hover:text-emerald-950 text-xs ml-2"
          >
            ✕
          </button>
        </div>
      )}

      {/* Cards de Métricas e KPIs de Competitividade Estilo Tiny ERP */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* 1. MONITORANDO ATIVAMENTE (Destaque Principal) */}
        <div
          onClick={() => setStatusFilter("MONITORED")}
          className={`p-3 rounded shadow-xs border transition-all cursor-pointer ${
            statusFilter === "MONITORED"
              ? "bg-indigo-50 border-indigo-500 ring-2 ring-indigo-500/20"
              : "bg-white border-indigo-200 hover:border-indigo-400"
          }`}
          title="Clique para filtrar apenas os anúncios vinculados e sob comparação ativa"
        >
          <div className="text-[11px] font-bold text-indigo-700 flex items-center justify-between">
            <span className="flex items-center gap-1">
              <Target className="w-3.5 h-3.5 text-indigo-600" /> Monitorando Ativo
            </span>
            {statusFilter === "MONITORED" && (
              <span className="text-[9px] bg-indigo-600 text-white px-1.5 py-0.2 rounded-full font-bold">
                Ativo
              </span>
            )}
          </div>
          <div className="text-xl font-bold text-indigo-950 mt-1">{summary.monitored_count || 0}</div>
          <div className="text-[10px] text-indigo-600/80 mt-0.5">Anúncios sob comparação</div>
        </div>

        {/* 2. GANHANDO BUYBOX */}
        <div
          onClick={() => setStatusFilter("WINNING")}
          className={`p-3 rounded shadow-xs border transition-all cursor-pointer ${
            statusFilter === "WINNING"
              ? "bg-emerald-100/60 border-emerald-500 ring-2 ring-emerald-500/20"
              : "bg-white border-emerald-200 bg-emerald-50/20 hover:border-emerald-400"
          }`}
          title="Clique para ver anúncios onde seu preço é menor que o do concorrente"
        >
          <div className="text-[11px] font-semibold text-emerald-700 flex items-center justify-between">
            <span className="flex items-center gap-1">
              <TrendingDown className="w-3.5 h-3.5" /> Ganhando Buybox
            </span>
            {statusFilter === "WINNING" && (
              <span className="text-[9px] bg-emerald-700 text-white px-1.5 py-0.2 rounded-full font-bold">
                Ativo
              </span>
            )}
          </div>
          <div className="text-xl font-bold text-emerald-800 mt-1">{summary.winning_count}</div>
          <div className="text-[10px] text-emerald-600 mt-0.5">Preço menor que concorrente</div>
        </div>

        {/* 3. EMPATADOS NO MENOR PREÇO */}
        <div
          onClick={() => setStatusFilter("TIED")}
          className={`p-3 rounded shadow-xs border transition-all cursor-pointer ${
            statusFilter === "TIED"
              ? "bg-amber-100/60 border-amber-500 ring-2 ring-amber-500/20"
              : "bg-white border-amber-200 bg-amber-50/20 hover:border-amber-400"
          }`}
          title="Clique para ver anúncios com preço rigorosamente empatado"
        >
          <div className="text-[11px] font-semibold text-amber-700 flex items-center justify-between">
            <span className="flex items-center gap-1">
              <MinusCircle className="w-3.5 h-3.5" /> Empatados
            </span>
            {statusFilter === "TIED" && (
              <span className="text-[9px] bg-amber-700 text-white px-1.5 py-0.2 rounded-full font-bold">
                Ativo
              </span>
            )}
          </div>
          <div className="text-xl font-bold text-amber-800 mt-1">{summary.tied_count}</div>
          <div className="text-[10px] text-amber-600 mt-0.5">Mesmo valor de mercado</div>
        </div>

        {/* 4. PERDENDO BUYBOX */}
        <div
          onClick={() => setStatusFilter("LOSING")}
          className={`p-3 rounded shadow-xs border transition-all cursor-pointer ${
            statusFilter === "LOSING"
              ? "bg-red-100/60 border-red-500 ring-2 ring-red-500/20"
              : "bg-white border-red-200 bg-red-50/20 hover:border-red-400"
          }`}
          title="Clique para ver anúncios onde o concorrente está vendendo mais barato"
        >
          <div className="text-[11px] font-semibold text-red-700 flex items-center justify-between">
            <span className="flex items-center gap-1">
              <TrendingUp className="w-3.5 h-3.5" /> Perdendo Buybox
            </span>
            {statusFilter === "LOSING" && (
              <span className="text-[9px] bg-red-700 text-white px-1.5 py-0.2 rounded-full font-bold">
                Ativo
              </span>
            )}
          </div>
          <div className="text-xl font-bold text-red-800 mt-1">{summary.losing_count}</div>
          <div className="text-[10px] text-red-600 mt-0.5">Atenção: Concorrente mais barato</div>
        </div>

        {/* 5. CATÁLOGO COMPLETO */}
        <div
          onClick={() => setStatusFilter("all")}
          className={`p-3 rounded shadow-xs border transition-all cursor-pointer ${
            statusFilter === "all"
              ? "bg-slate-100 border-slate-500 ring-2 ring-slate-500/20"
              : "bg-white border-[#E2E8F0] hover:border-slate-400"
          }`}
          title="Clique para ver todos os anúncios do catálogo"
        >
          <div className="text-[11px] font-medium text-slate-600 flex items-center justify-between">
            <span>Catálogo Completo</span>
            {statusFilter === "all" && (
              <span className="text-[9px] bg-slate-700 text-white px-1.5 py-0.2 rounded-full font-bold">
                Ativo
              </span>
            )}
          </div>
          <div className="text-xl font-bold text-slate-900 mt-1">{summary.total_listings}</div>
          <div className="text-[10px] text-slate-400 mt-0.5">Total de produtos no canal</div>
        </div>

        {/* 6. RADAR AVULSO */}
        <div
          onClick={() => setStatusFilter("RADAR")}
          className={`p-3 rounded shadow-xs border transition-all cursor-pointer ${
            statusFilter === "RADAR"
              ? "bg-sky-100/60 border-sky-500 ring-2 ring-sky-500/20"
              : "bg-white border-sky-200 bg-sky-50/30 hover:border-sky-400"
          }`}
          title="Clique para ver itens avulsos do radar sem vinculação direta"
        >
          <div className="text-[11px] font-semibold text-sky-700 flex items-center justify-between">
            <span className="flex items-center gap-1">
              <Radio className="w-3.5 h-3.5 text-sky-600" /> Radar Avulso
            </span>
            {statusFilter === "RADAR" && (
              <span className="text-[9px] bg-sky-700 text-white px-1.5 py-0.2 rounded-full font-bold">
                Ativo
              </span>
            )}
          </div>
          <div className="text-xl font-bold text-sky-800 mt-1">{summary.radar_count || 0}</div>
          <div className="text-[10px] text-sky-600 mt-0.5">Espionados sem vínculo</div>
        </div>
      </div>

      {/* Barra de Filtros e Busca Rápida */}
      <div className="bg-white border border-[#E2E8F0] p-2.5 rounded flex items-center justify-between gap-3 text-xs shadow-xs">
        <div className="flex items-center space-x-2 flex-1 max-w-md">
          <div className="relative w-full">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por SKU, Título ou ID do Anúncio (MLB... / Shopee)..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 border border-[#CBD5E1] rounded text-xs outline-none focus:border-sky-600 focus:ring-1 focus:ring-sky-600"
            />
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {/* Botão de Limpeza de Avulsos / Testes */}
          {summary.radar_count !== undefined && summary.radar_count > 0 && (
            <button
              onClick={handlePurgeUnlinked}
              disabled={purgingUnlinked}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold text-red-700 bg-red-50 hover:bg-red-100 border border-red-300 rounded shadow-2xs transition-colors disabled:opacity-50"
              title="Remove do banco todos os anúncios do radar de mercado que não possuem vínculo próprio"
            >
              <Trash2 className="w-3 h-3 text-red-600" />
              {purgingUnlinked ? "Limpando..." : `Limpar Avulsos (${summary.radar_count})`}
            </button>
          )}

          <span className="text-[11px] font-semibold text-slate-600">Filtrar:</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="border border-[#CBD5E1] rounded py-1 px-2 text-xs bg-white text-slate-800 outline-none focus:border-sky-600 font-medium"
          >
            <option value="MONITORED">🎯 Monitorando Ativo ({summary.monitored_count || 0})</option>
            <option value="all">Catálogo Completo ({summary.total_listings})</option>
            <option value="LOSING">Perdendo Buybox ({summary.losing_count})</option>
            <option value="WINNING">Ganhando Buybox ({summary.winning_count})</option>
            <option value="TIED">Empatado no menor preço ({summary.tied_count})</option>
            <option value="UNMATCHED">Sem Concorrentes ({summary.unmatched_count})</option>
            <option value="RADAR">📡 Radar Avulso ({summary.radar_count || 0})</option>
          </select>

          <button
            onClick={fetchData}
            disabled={loading}
            className="p-1.5 border border-slate-300 rounded text-slate-600 hover:bg-slate-100 transition-colors disabled:opacity-50"
            title="Recarregar dados"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {loadError && (
        <div className="bg-red-50 border border-red-300 text-red-900 px-3.5 py-2 rounded-md text-xs flex items-center justify-between">
          <span>⚠️ Não foi possível carregar o Radar: {loadError}</span>
          <button onClick={fetchData} className="font-bold underline ml-2">
            Tentar novamente
          </button>
        </div>
      )}

      {/* Tabela de Comparação de Alta Densidade */}
      {loading && !data ? (
        <div className="bg-white border border-[#E2E8F0] rounded p-10 flex items-center justify-center gap-2 text-xs text-slate-500">
          <RefreshCw className="w-4 h-4 animate-spin" /> Carregando anúncios monitorados...
        </div>
      ) : (
        <ComparativeTable
          groups={data?.items || []}
          highlightedIds={highlightedIds}
          onPriceUpdated={handlePriceUpdated}
          onComparisonRefreshed={handleComparisonRefreshed}
          onDeleteCompetitor={handleDeleteCompetitor}
          onDeleteMyListing={handleDeleteMyListing}
          onCompetitorAdded={fetchData}
          onOpenPairModal={(group) => {
            fetchData();
          }}
        />
      )}
    </div>
  );
}
