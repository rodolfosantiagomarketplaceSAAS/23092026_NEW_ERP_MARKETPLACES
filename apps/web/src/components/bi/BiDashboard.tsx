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
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Carrega dados da API comparativa
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("platform", activePlatform);
      if (search) params.set("search", search);
      if (statusFilter !== "all") params.set("status", statusFilter);

      const res = await fetch(`/api/bi/comparative?${params.toString()}`, {
        cache: "no-store",
      });
      if (res.ok) {
        const json: BiComparativeResponse = await res.json();
        setData(json);
      }
    } catch (e) {
      console.error("Falha ao carregar dados de BI:", e);
    } finally {
      setLoading(false);
    }
  }, [activePlatform, search, statusFilter]);

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

  // Atualização local de preço quando usuário reprecifica no modal
  const handlePriceUpdated = (listingId: string, newPrice: number) => {
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
        const updatedItems = prev.items.map((group) => {
          if (group.my_listing.id === myListingId) {
            const updatedCompetitors = group.competitors.filter((c) => c.id !== competitorId);
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
        });

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

  const summary = data?.summary || {
    total_listings: 0,
    winning_count: 0,
    tied_count: 0,
    losing_count: 0,
    unmatched_count: 0,
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

        {/* Indicador de Realtime e Botão de Teste */}
        <div className="flex items-center space-x-2 pb-1">
          {lastEventTime && (
            <span className="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
              ⚡ Último evento Realtime: {lastEventTime}
            </span>
          )}

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

      {/* Cards de Métricas e KPIs de Competitividade Estilo Tiny ERP */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-white border border-[#E2E8F0] p-3 rounded shadow-xs">
          <div className="text-[11px] font-medium text-slate-500">Catálogo Monitorado</div>
          <div className="text-xl font-bold text-slate-900 mt-1">{summary.total_listings}</div>
          <div className="text-[10px] text-slate-400 mt-0.5">Anúncios ativos no canal</div>
        </div>

        <div className="bg-white border border-emerald-200 bg-emerald-50/20 p-3 rounded shadow-xs">
          <div className="text-[11px] font-semibold text-emerald-700 flex items-center gap-1">
            <TrendingDown className="w-3.5 h-3.5" /> Ganhando Buybox
          </div>
          <div className="text-xl font-bold text-emerald-800 mt-1">{summary.winning_count}</div>
          <div className="text-[10px] text-emerald-600 mt-0.5">Preço menor que concorrentes</div>
        </div>

        <div className="bg-white border border-amber-200 bg-amber-50/20 p-3 rounded shadow-xs">
          <div className="text-[11px] font-semibold text-amber-700 flex items-center gap-1">
            <MinusCircle className="w-3.5 h-3.5" /> Empatados no Menor Preço
          </div>
          <div className="text-xl font-bold text-amber-800 mt-1">{summary.tied_count}</div>
          <div className="text-[10px] text-amber-600 mt-0.5">Mesmo valor de mercado</div>
        </div>

        <div className="bg-white border border-red-200 bg-red-50/20 p-3 rounded shadow-xs">
          <div className="text-[11px] font-semibold text-red-700 flex items-center gap-1">
            <TrendingUp className="w-3.5 h-3.5" /> Perdendo Buybox
          </div>
          <div className="text-xl font-bold text-red-800 mt-1">{summary.losing_count}</div>
          <div className="text-[10px] text-red-600 mt-0.5">Atenção: Concorrente mais barato</div>
        </div>

        <div className="bg-white border border-slate-200 p-3 rounded shadow-xs">
          <div className="text-[11px] font-medium text-slate-500 flex items-center gap-1">
            <AlertCircle className="w-3.5 h-3.5" /> Sem Concorrentes
          </div>
          <div className="text-xl font-bold text-slate-700 mt-1">{summary.unmatched_count}</div>
          <div className="text-[10px] text-slate-400 mt-0.5">Parear via extensão ou ID</div>
        </div>

        <div className="bg-white border border-sky-200 bg-sky-50/30 p-3 rounded shadow-xs">
          <div className="text-[11px] font-semibold text-sky-700 flex items-center gap-1">
            <Radio className="w-3.5 h-3.5 text-sky-600" /> Radar de Mercado
          </div>
          <div className="text-xl font-bold text-sky-800 mt-1">{summary.radar_count || 0}</div>
          <div className="text-[10px] text-sky-600 mt-0.5">Espionando via Extensão</div>
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
          <span className="text-[11px] font-semibold text-slate-600">Filtrar Status:</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="border border-[#CBD5E1] rounded py-1 px-2 text-xs bg-white text-slate-800 outline-none focus:border-sky-600"
          >
            <option value="all">Todos os Anúncios ({summary.total_listings})</option>
            <option value="RADAR">📡 Radar de Mercado ({summary.radar_count || 0})</option>
            <option value="LOSING">Perdendo Buybox ({summary.losing_count})</option>
            <option value="WINNING">Ganhando Buybox ({summary.winning_count})</option>
            <option value="TIED">Empatado no menor preço ({summary.tied_count})</option>
            <option value="UNMATCHED">Sem Concorrentes ({summary.unmatched_count})</option>
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

      {/* Tabela de Comparação de Alta Densidade */}
      <ComparativeTable
        groups={data?.items || []}
        highlightedIds={highlightedIds}
        onPriceUpdated={handlePriceUpdated}
        onDeleteCompetitor={handleDeleteCompetitor}
        onDeleteMyListing={handleDeleteMyListing}
        onOpenPairModal={(id) => {
          alert(`Para vincular novos concorrentes ao anúncio [${id}], utilize a extensão no Chrome ou o botão 'Capturar Concorrente (ERP)' diretamente no anúncio do concorrente.`);
        }}
      />
    </div>
  );
}
