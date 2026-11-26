"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  Search,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  MinusCircle,
  Radio,
  Target,
  Trash2,
  ShieldCheck,
  Clock,
  CheckCircle2,
  PlugZap,
} from "lucide-react";
import type {
  BiComparativeResponse,
  ComparativeListingGroup,
  MarketplacePlatform,
} from "@crm/types";
import { ComparativeTable } from "./ComparativeTable";

type SyncScopeOption = "monitored" | "all";

interface SyncStatsSummary {
  myListingsChecked: number;
  myListingsChanged: number;
  competitorsChecked: number;
  competitorsChanged: number;
  followedStoresSynced: number;
  priceDropsDetected: number;
  priceIncreasesDetected: number;
  durationMs: number;
  syncedAt: string;
  extPreVerifiedCount: number;
}

function formatLastSyncLabel(isoDate: string | null): string {
  if (!isoDate) return "Ainda não sincronizado";
  const parsed = new Date(isoDate);
  if (isNaN(parsed.getTime())) return "Ainda não sincronizado";
  const datePart = parsed.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  });
  const timePart = parsed.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${datePart} às ${timePart}`;
}

export function BiDashboard() {
  const [activePlatform, setActivePlatform] = useState<MarketplacePlatform>("mercadolivre");
  const [data, setData] = useState<BiComparativeResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [search, setSearch] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("MONITORED");
  const [syncScope, setSyncScope] = useState<SyncScopeOption>("monitored");
  const [syncingBatch, setSyncingBatch] = useState<boolean>(false);
  const [syncStepText, setSyncStepText] = useState<string | null>(null);
  const [purgingUnlinked, setPurgingUnlinked] = useState<boolean>(false);
  const [syncSuccessMsg, setSyncSuccessMsg] = useState<string | null>(null);
  const [lastSyncStats, setLastSyncStats] = useState<SyncStatsSummary | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [extensionActive, setExtensionActive] = useState<boolean>(false);
  const [highlightedIds, setHighlightedIds] = useState<Record<string, boolean>>({});
  const highlightTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // Detecta presença da extensão Chrome apenas localmente no DOM (zero rede)
  useEffect(() => {
    const checkExt = () => {
      const installed =
        Boolean((window as any).__CRM_MARKETPLACES_EXTENSION_ACTIVE__) ||
        document.documentElement.getAttribute("data-crm-extension-installed") === "true";
      setExtensionActive(installed);
    };
    checkExt();
    window.addEventListener("CRM_EXTENSION_DETECTED", checkExt);
    return () => {
      window.removeEventListener("CRM_EXTENSION_DETECTED", checkExt);
      Object.values(highlightTimersRef.current).forEach((t) => clearTimeout(t));
    };
  }, []);

  const triggerHighlight = useCallback((ids: string[]) => {
    if (!ids.length) return;
    setHighlightedIds((prev) => {
      const next = { ...prev };
      for (const id of ids) next[id] = true;
      return next;
    });

    for (const id of ids) {
      if (highlightTimersRef.current[id]) {
        clearTimeout(highlightTimersRef.current[id]);
      }
      highlightTimersRef.current[id] = setTimeout(() => {
        setHighlightedIds((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
        delete highlightTimersRef.current[id];
      }, 4500);
    }
  }, []);

  /**
   * Carrega os dados consolidados do banco APENAS ao abrir a aba ou trocar de marketplace (ML/Shopee).
   * Filtros de status e busca textual rodam 100% em memória no cliente (zero chamadas extras na Vercel/Supabase).
   */
  const fetchData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const params = new URLSearchParams();
      params.set("platform", activePlatform);
      params.set("status", "all");

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
  }, [activePlatform]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  /**
   * Extrai em lote via Extensão Chrome (se instalada) usando o IP residencial do usuário,
   * sem disparar múltiplas chamadas ao servidor.
   */
  const collectVerifiedCompetitorsViaExtension = async (
    groups: ComparativeListingGroup[]
  ): Promise<Record<string, Record<string, any>>> => {
    const isInstalled =
      typeof window !== "undefined" &&
      (Boolean((window as any).__CRM_MARKETPLACES_EXTENSION_ACTIVE__) ||
        document.documentElement.getAttribute("data-crm-extension-installed") === "true");

    if (!isInstalled) return {};

    const uniqueMap = new Map<
      string,
      { id: string; external_id: string; permalink: string; platform: string }
    >();

    for (const g of groups) {
      for (const c of g.competitors) {
        if (!c.id || uniqueMap.has(c.id)) continue;
        uniqueMap.set(c.id, {
          id: c.id,
          external_id: c.external_id,
          permalink: c.permalink,
          platform: activePlatform,
        });
      }
    }

    const competitorsList = Array.from(uniqueMap.values());
    if (competitorsList.length === 0) return {};

    return new Promise((resolve) => {
      const timeoutMs = Math.min(22000, Math.max(7000, competitorsList.length * 900));
      const timer = setTimeout(() => {
        window.removeEventListener("message", handleMsg);
        resolve({});
      }, timeoutMs);

      const reqId = `batch_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const handleMsg = (e: MessageEvent) => {
        if (e.data?.type === "CRM_BATCH_INSPECT_RESULT" && e.data?.requestId === reqId) {
          clearTimeout(timer);
          window.removeEventListener("message", handleMsg);
          resolve(e.data?.result?.verifiedMap || {});
        }
      };

      window.addEventListener("message", handleMsg);
      window.postMessage(
        {
          type: "CRM_BATCH_INSPECT_COMPETITORS",
          requestId: reqId,
          payload: { competitors: competitorsList },
        },
        "*"
      );
    });
  };

  /**
   * Botão Único Sob Demanda: atualiza Meus Anúncios + Concorrentes Pareados e Seguidos
   * em um fluxo enxuto, híbrido e sem polling automático.
   */
  const handleManualUnifiedSync = async () => {
    setSyncingBatch(true);
    setSyncSuccessMsg(null);
    setLoadError(null);

    try {
      let verifiedCompetitors: Record<string, Record<string, any>> = {};
      let extPreVerifiedCount = 0;

      // Etapa 1 (Opcional/Automática se Extensão v1.6+ estiver ativa): pré-coleta páginas dos concorrentes no navegador
      const currentGroups = data?.items || [];
      if (extensionActive && currentGroups.length > 0) {
        setSyncStepText(
          "Etapa 1/2: Conferindo links dos concorrentes seguidos via Extensão (IP local)..."
        );
        verifiedCompetitors = await collectVerifiedCompetitorsViaExtension(currentGroups);
        extPreVerifiedCount = Object.keys(verifiedCompetitors).length;
      }

      // Etapa 2: Consolida na API Oficial do Mercado Livre (Multiget + Promoções + Scraper Estruturado + Banco)
      setSyncStepText(
        syncScope === "all"
          ? "Sincronizando catálogo completo + concorrentes seguidos na API do Mercado Livre..."
          : "Sincronizando meus anúncios monitorados + concorrentes seguidos na API do Mercado Livre..."
      );

      if (syncScope === "all") {
        // Se o usuário escolheu sincronizar novos itens do catálogo completo, importa anúncios novos primeiro
        const catRes = await fetch("/api/my-listings/sync", { method: "POST" });
        const catJson = await catRes.json().catch(() => null);
        if (!catRes.ok && (catJson?.reauthRequired || catRes.status === 401)) {
          alert(
            "⚠️ Conexão do Mercado Livre Expirada!\n\n" +
              "Acesse 'Configurações & APIs' no menu lateral e clique em 'Reconectar' para renovar sua autorização."
          );
          return;
        }
      }

      const res = await fetch("/api/bi/sync-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform: activePlatform,
          scope: syncScope,
          verifiedCompetitors,
        }),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        throw new Error(
          json?.details || json?.error || "Não foi possível concluir a atualização em lote."
        );
      }

      // Atualiza toda a tela imediatamente com o payload já retornado (zero GET extra!)
      if (json.comparative) {
        setData(json.comparative as BiComparativeResponse);
      } else {
        await fetchData();
      }

      if (json.stats) {
        setLastSyncStats({
          ...json.stats,
          extPreVerifiedCount,
        });
        if (Array.isArray(json.stats.changedIds) && json.stats.changedIds.length > 0) {
          triggerHighlight(json.stats.changedIds);
        }
      }

      setSyncSuccessMsg(
        json.message ||
          "Meus anúncios e concorrentes seguidos foram atualizados com sucesso!"
      );
    } catch (err) {
      console.error("Erro na atualização manual unificada:", err);
      setLoadError(
        err instanceof Error
          ? err.message
          : "Falha na comunicação com o servidor durante a atualização."
      );
    } finally {
      setSyncStepText(null);
      setSyncingBatch(false);
    }
  };

  // Atualização local de preço quando usuário reprecifica no modal ou sincroniza preço individual
  const handlePriceUpdated = (
    listingId: string,
    newPrice: number,
    newOriginalPrice?: number | null
  ) => {
    setData((prev) => {
      if (!prev) return prev;
      const updatedItems = prev.items.map((group) => {
        if (group.my_listing.id === listingId) {
          const lowest = group.lowest_competitor_price;
          const diffBrl = lowest ? Number((newPrice - lowest).toFixed(2)) : null;
          const diffPct =
            lowest && lowest > 0 && diffBrl !== null
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
            my_listing: {
              ...group.my_listing,
              current_price: newPrice,
              original_price:
                newOriginalPrice !== undefined
                  ? newOriginalPrice
                  : group.my_listing.original_price,
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

  // Atualização local quando usuário clica em "Atualizar Dados" em uma linha individual
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
              const diffBrl =
                updatedMyListing.current_price - resultData.competitor.current_price;
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
            lowest !== null
              ? Number((updatedMyListing.current_price - lowest).toFixed(2))
              : null;
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

      return { ...prev, items: updatedItems };
    });

    if (resultData.competitor?.id) {
      triggerHighlight([resultData.competitor.id]);
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
              const updatedCompetitors = group.competitors.filter(
                (c) => c.id !== competitorId
              );

              if (
                group.my_listing.listing_type === "radar" &&
                updatedCompetitors.length === 0
              ) {
                return null;
              }

              const lowest =
                updatedCompetitors.length > 0
                  ? Math.min(...updatedCompetitors.map((c) => c.current_price))
                  : null;
              const diffBrl =
                lowest !== null
                  ? Number((group.my_listing.current_price - lowest).toFixed(2))
                  : null;
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

        return { ...prev, items: updatedItems };
      });
    } catch (e) {
      console.error("Erro ao remover concorrente:", e);
      alert("Não foi possível excluir o concorrente. Tente novamente.");
    }
  };

  // Exclusão de Anúncio Próprio do Monitoramento com Atualização Otimista
  const handleDeleteMyListing = async (myListingId: string) => {
    try {
      const res = await fetch(
        `/api/competitors/matches?my_listing_id=${myListingId}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        throw new Error("Falha ao excluir anúncio no servidor");
      }

      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          items: prev.items.filter((g) => g.my_listing.id !== myListingId),
        };
      });
    } catch (e) {
      console.error("Erro ao remover anúncio do monitoramento:", e);
      alert("Não foi possível remover o anúncio do monitoramento. Tente novamente.");
    }
  };

  const handlePurgeUnlinked = async () => {
    if (
      !confirm(
        "Deseja limpar todos os anúncios avulsos do radar de mercado que NÃO estão vinculados a nenhum anúncio seu?"
      )
    ) {
      return;
    }
    setPurgingUnlinked(true);
    try {
      const res = await fetch("/api/competitors/matches?purge_unlinked=true", {
        method: "DELETE",
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setSyncSuccessMsg(
          json.message || "Anúncios avulsos do radar removidos com sucesso!"
        );
        await fetchData();
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

  // Sumário recalculado em tempo real no cliente a partir de `data.items` (sempre consistente após mutações locais)
  const summary = useMemo(() => {
    const allGroups = data?.items || [];
    const isOwn = (g: ComparativeListingGroup) => g.my_listing.listing_type !== "radar";
    return {
      total_listings: allGroups.length,
      monitored_count: allGroups.filter((g) => isOwn(g) && g.competitors.length > 0).length,
      winning_count: allGroups.filter((g) => isOwn(g) && g.status === "WINNING").length,
      tied_count: allGroups.filter((g) => isOwn(g) && g.status === "TIED").length,
      losing_count: allGroups.filter((g) => isOwn(g) && g.status === "LOSING").length,
      unmatched_count: allGroups.filter((g) => isOwn(g) && g.status === "UNMATCHED").length,
      radar_count: allGroups.filter((g) => !isOwn(g)).length,
    };
  }, [data]);

  // Último timestamp real de varredura encontrado nos dados carregados
  const latestScrapedAt = useMemo(() => {
    if (lastSyncStats?.syncedAt) return lastSyncStats.syncedAt;
    let latestMs = 0;
    for (const g of data?.items || []) {
      for (const c of g.competitors) {
        const ms = c.last_scraped_at ? Date.parse(c.last_scraped_at) : 0;
        if (!isNaN(ms) && ms > latestMs) latestMs = ms;
      }
    }
    return latestMs > 0 ? new Date(latestMs).toISOString() : null;
  }, [data, lastSyncStats]);

  // Filtragem 100% em memória no cliente (zero consumo de Vercel/Supabase ao trocar abas/filtros/busca)
  const filteredGroups = useMemo(() => {
    let list = data?.items || [];
    const cleanSearch = search.trim().toLowerCase();

    if (cleanSearch) {
      list = list.filter((g) => {
        const l = g.my_listing;
        return (
          l.title.toLowerCase().includes(cleanSearch) ||
          (l.product_sku?.toLowerCase().includes(cleanSearch) ?? false) ||
          l.external_id.toLowerCase().includes(cleanSearch) ||
          g.competitors.some(
            (c) =>
              c.title.toLowerCase().includes(cleanSearch) ||
              (c.seller_name || "").toLowerCase().includes(cleanSearch) ||
              c.external_id.toLowerCase().includes(cleanSearch)
          )
        );
      });
    }

    if (statusFilter === "MONITORED" || statusFilter === "PAIRED") {
      return list.filter(
        (g) => g.competitors.length > 0 && g.my_listing.listing_type !== "radar"
      );
    }
    if (statusFilter === "RADAR") {
      return list.filter((g) => g.my_listing.listing_type === "radar");
    }
    if (statusFilter !== "all") {
      return list.filter(
        (g) => g.status === statusFilter && g.my_listing.listing_type !== "radar"
      );
    }
    return list;
  }, [data, search, statusFilter]);

  return (
    <div className="space-y-4">
      {/* Barra Superior: Seleção de Canal + Central de Atualização Manual Sob Demanda */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-[#E2E8F0] pb-2">
        <div className="flex items-center space-x-1">
          <button
            type="button"
            onClick={() => setActivePlatform("mercadolivre")}
            className={`px-4 py-2 text-xs font-bold border-b-2 flex items-center space-x-2 transition-colors cursor-pointer ${
              activePlatform === "mercadolivre"
                ? "border-sky-600 text-sky-700 bg-white rounded-t"
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
            type="button"
            onClick={() => setActivePlatform("shopee")}
            className={`px-4 py-2 text-xs font-bold border-b-2 flex items-center space-x-2 transition-colors cursor-pointer ${
              activePlatform === "shopee"
                ? "border-[#EE4D2D] text-[#EE4D2D] bg-white rounded-t"
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

        {/* Painel de Controle de Atualização Manual Econômica */}
        <div className="flex flex-wrap items-center gap-2">
          <div
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-50 border border-slate-200 text-[11px] text-slate-600"
            title="Atualização automática desativada para economizar sua cota gratuita do Supabase e Vercel. Os dados só são consultados quando você clicar no botão."
          >
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span className="font-semibold text-slate-700">Modo Manual Econômico</span>
            <span className="text-slate-300">•</span>
            <Clock className="w-3 h-3 text-slate-400 shrink-0" />
            <span>{formatLastSyncLabel(latestScrapedAt)}</span>
          </div>

          {extensionActive && (
            <span
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-sky-50 border border-sky-200 text-[10.5px] font-semibold text-sky-800"
              title="Extensão Chrome detectada: a atualização usará extração híbrida (IP local + API Oficial ML)"
            >
              <PlugZap className="w-3 h-3 text-sky-600" />
              Extração Híbrida Ativa
            </span>
          )}

          <select
            value={syncScope}
            onChange={(e) => setSyncScope(e.target.value as SyncScopeOption)}
            disabled={syncingBatch}
            aria-label="Escopo da atualização manual"
            className="border border-slate-300 rounded-md py-1.5 px-2.5 text-[11px] font-semibold bg-white text-slate-700 outline-none focus:border-sky-600 cursor-pointer disabled:opacity-60"
            title="Escolha se deseja atualizar apenas os anúncios monitorados e concorrentes seguidos (mais rápido e econômico) ou também buscar novos anúncios do seu catálogo completo"
          >
            <option value="monitored">
              Escopo: Monitorados & Seguindo (Rápido)
            </option>
            <option value="all">
              Escopo: Catálogo Completo + Seguindo
            </option>
          </select>

          <button
            type="button"
            onClick={handleManualUnifiedSync}
            disabled={syncingBatch}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-white bg-sky-600 hover:bg-sky-700 active:scale-[0.99] border border-sky-700 rounded-md shadow-xs transition-all disabled:opacity-60 cursor-pointer"
            title="Atualiza em 1 clique os preços/promoções dos seus anúncios e os dados reais dos concorrentes que você segue"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncingBatch ? "animate-spin" : ""}`} />
            <span>
              {syncingBatch
                ? "Atualizando Anúncios & Concorrentes..."
                : "Atualizar Meus Anúncios e Concorrentes"}
            </span>
          </button>
        </div>
      </div>

      {/* Progresso em Tempo Real durante a Atualização Manual */}
      {syncingBatch && syncStepText && (
        <div className="bg-sky-50 border border-sky-200 text-sky-900 px-3.5 py-2.5 rounded-lg text-xs flex items-center justify-between gap-3 shadow-2xs">
          <div className="flex items-center gap-2 font-medium">
            <RefreshCw className="w-4 h-4 animate-spin text-sky-600 shrink-0" />
            <span>{syncStepText}</span>
          </div>
          <span className="text-[10.5px] font-semibold text-sky-700 whitespace-nowrap">
            API Oficial Multiget + Scraper Estruturado
          </span>
        </div>
      )}

      {/* Relatório Executivo Pós-Sincronização */}
      {syncSuccessMsg && (
        <div className="bg-emerald-50 border border-emerald-300 text-emerald-950 px-3.5 py-2.5 rounded-lg text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-2xs">
          <div className="flex items-start sm:items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5 sm:mt-0" />
            <div>
              <span className="font-bold">{syncSuccessMsg}</span>
              {lastSyncStats && (
                <span className="block sm:inline sm:ml-2 text-[11px] text-emerald-800">
                  • Tempo: {(lastSyncStats.durationMs / 1000).toFixed(1)}s
                  {lastSyncStats.priceDropsDetected > 0 &&
                    ` • 📉 ${lastSyncStats.priceDropsDetected} queda(s) de preço`}
                  {lastSyncStats.priceIncreasesDetected > 0 &&
                    ` • 📈 ${lastSyncStats.priceIncreasesDetected} alta(s) de preço`}
                  {lastSyncStats.extPreVerifiedCount > 0 &&
                    ` • 🧩 ${lastSyncStats.extPreVerifiedCount} conferido(s) via extensão`}
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setSyncSuccessMsg(null)}
            className="text-emerald-700 font-bold hover:text-emerald-950 text-xs self-end sm:self-auto px-1 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Cards de Métricas e KPIs de Competitividade */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* 1. MONITORANDO ATIVAMENTE */}
        <div
          onClick={() => setStatusFilter("MONITORED")}
          className={`p-3 rounded shadow-xs border transition-all cursor-pointer ${
            statusFilter === "MONITORED"
              ? "bg-sky-50 border-sky-500 ring-2 ring-sky-500/20"
              : "bg-white border-sky-200 hover:border-sky-400"
          }`}
          title="Clique para filtrar apenas os anúncios vinculados e sob comparação ativa"
        >
          <div className="text-[11px] font-bold text-sky-800 flex items-center justify-between">
            <span className="flex items-center gap-1">
              <Target className="w-3.5 h-3.5 text-sky-600" /> Monitorando Ativo
            </span>
            {statusFilter === "MONITORED" && (
              <span className="text-[9px] bg-sky-600 text-white px-1.5 py-0.2 rounded-full font-bold">
                Ativo
              </span>
            )}
          </div>
          <div className="text-xl font-bold text-slate-900 mt-1">
            {summary.monitored_count || 0}
          </div>
          <div className="text-[10px] text-sky-700/80 mt-0.5">
            Anúncios sob comparação
          </div>
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
          <div className="text-xl font-bold text-emerald-800 mt-1">
            {summary.winning_count}
          </div>
          <div className="text-[10px] text-emerald-600 mt-0.5">
            Preço menor que concorrente
          </div>
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
          <div className="text-xl font-bold text-amber-800 mt-1">
            {summary.tied_count}
          </div>
          <div className="text-[10px] text-amber-600 mt-0.5">
            Mesmo valor de mercado
          </div>
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
          <div className="text-xl font-bold text-red-800 mt-1">
            {summary.losing_count}
          </div>
          <div className="text-[10px] text-red-600 mt-0.5">
            Atenção: Concorrente mais barato
          </div>
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
          <div className="text-xl font-bold text-slate-900 mt-1">
            {summary.total_listings}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">
            Total de produtos no canal
          </div>
        </div>

        {/* 6. RADAR AVULSO / SEGUINDO */}
        <div
          onClick={() => setStatusFilter("RADAR")}
          className={`p-3 rounded shadow-xs border transition-all cursor-pointer ${
            statusFilter === "RADAR"
              ? "bg-sky-100/60 border-sky-500 ring-2 ring-sky-500/20"
              : "bg-white border-sky-200 bg-sky-50/30 hover:border-sky-400"
          }`}
          title="Clique para ver concorrentes seguidos no radar sem vínculo direto"
        >
          <div className="text-[11px] font-semibold text-sky-700 flex items-center justify-between">
            <span className="flex items-center gap-1">
              <Radio className="w-3.5 h-3.5 text-sky-600" /> Seguindo (Avulsos)
            </span>
            {statusFilter === "RADAR" && (
              <span className="text-[9px] bg-sky-700 text-white px-1.5 py-0.2 rounded-full font-bold">
                Ativo
              </span>
            )}
          </div>
          <div className="text-xl font-bold text-sky-800 mt-1">
            {summary.radar_count || 0}
          </div>
          <div className="text-[10px] text-sky-600 mt-0.5">
            Concorrentes seguidos s/ par
          </div>
        </div>
      </div>

      {/* Barra de Filtros Locais Instantâneos (0 chamadas de rede) */}
      <div className="bg-white border border-[#E2E8F0] p-2.5 rounded flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs shadow-xs">
        <div className="flex items-center space-x-2 flex-1 max-w-md">
          <div className="relative w-full">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Filtrar por SKU, Título, Loja ou MLB..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 border border-[#CBD5E1] rounded text-xs outline-none focus:border-sky-600 focus:ring-1 focus:ring-sky-600"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {summary.radar_count > 0 && (
            <button
              type="button"
              onClick={handlePurgeUnlinked}
              disabled={purgingUnlinked}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold text-red-700 bg-red-50 hover:bg-red-100 border border-red-300 rounded shadow-2xs transition-colors disabled:opacity-50 cursor-pointer"
              title="Remove do banco todos os anúncios avulsos do radar que não possuem vínculo próprio"
            >
              <Trash2 className="w-3 h-3 text-red-600" />
              {purgingUnlinked
                ? "Limpando..."
                : `Limpar Avulsos (${summary.radar_count})`}
            </button>
          )}

          <span className="text-[11px] font-semibold text-slate-600">Filtrar:</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="border border-[#CBD5E1] rounded py-1 px-2 text-xs bg-white text-slate-800 outline-none focus:border-sky-600 font-medium cursor-pointer"
          >
            <option value="MONITORED">
              🎯 Monitorando Ativo ({summary.monitored_count || 0})
            </option>
            <option value="all">
              Catálogo Completo ({summary.total_listings})
            </option>
            <option value="LOSING">
              Perdendo Buybox ({summary.losing_count})
            </option>
            <option value="WINNING">
              Ganhando Buybox ({summary.winning_count})
            </option>
            <option value="TIED">
              Empatado no menor preço ({summary.tied_count})
            </option>
            <option value="UNMATCHED">
              Sem Concorrentes ({summary.unmatched_count})
            </option>
            <option value="RADAR">
              📡 Seguindo Avulso ({summary.radar_count || 0})
            </option>
          </select>

          <button
            type="button"
            onClick={fetchData}
            disabled={loading || syncingBatch}
            className="p-1.5 border border-slate-300 rounded text-slate-600 hover:bg-slate-100 transition-colors disabled:opacity-50 cursor-pointer"
            title="Recarregar leitura do banco de dados (sem consultar API externa)"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {loadError && (
        <div className="bg-red-50 border border-red-300 text-red-900 px-3.5 py-2 rounded-md text-xs flex items-center justify-between">
          <span>⚠️ Atenção: {loadError}</span>
          <button
            type="button"
            onClick={fetchData}
            className="font-bold underline ml-2 cursor-pointer"
          >
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
          groups={filteredGroups}
          highlightedIds={highlightedIds}
          onPriceUpdated={handlePriceUpdated}
          onComparisonRefreshed={handleComparisonRefreshed}
          onDeleteCompetitor={handleDeleteCompetitor}
          onDeleteMyListing={handleDeleteMyListing}
          onCompetitorAdded={fetchData}
          onOpenPairModal={() => {
            fetchData();
          }}
        />
      )}
    </div>
  );
}
