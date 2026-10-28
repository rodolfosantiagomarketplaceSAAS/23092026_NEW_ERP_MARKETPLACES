"use client";

import React, { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  ExternalLink,
  SlidersHorizontal,
  Link as LinkIcon,
  PlusCircle,
  Truck,
  Zap,
  Tag,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  Minus,
  Trash2,
  Radio,
  Calendar,
  ShoppingBag,
  Store,
  RefreshCw,
  CheckCircle2,
} from "lucide-react";
import type { ComparativeListingGroup, CompetitorComparisonItem } from "@crm/types";
import { RepriceModal } from "./RepriceModal";
import { MarketplacePrice } from "./MarketplacePrice";
import { AddCompetitorModal } from "./AddCompetitorModal";

function formatDate(dateString?: string | null) {
  if (!dateString) return null;
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return null;
    const dateStr = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
    const diffDays = Math.max(0, Math.floor((Date.now() - d.getTime()) / 86400000));
    const ageLabel = diffDays === 0 ? "hoje" : diffDays === 1 ? "há 1 dia" : `há ${diffDays} dias`;
    return `${dateStr} • ${ageLabel}`;
  } catch {
    return null;
  }
}

function formatSales(sales?: number | null) {
  const count = sales === undefined || sales === null || sales < 0 ? 0 : sales;
  if (count >= 1000) {
    return `+${(count / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil vendas`;
  }
  return `${count.toLocaleString("pt-BR")} venda${count === 1 ? "" : "s"}`;
}

function estimateCompetitorFees(price: number, platform = "mercadolivre") {
  if (!price || price <= 0) return { fee: 0, pct: 0, shipping: 0 };
  if (platform === "shopee") {
    const pct = 20;
    const fixed = price >= 8 ? 4.0 : price * 0.5;
    return {
      fee: Number(((price * pct) / 100 + fixed).toFixed(2)),
      pct,
      shipping: 0,
    };
  }
  const pct = 11.5;
  const fee = Number(((price * pct) / 100).toFixed(2));
  let shipping = 19.85;
  if (price < 19) shipping = 6.25;
  else if (price < 49) shipping = 6.5;
  else if (price < 79) shipping = 10.25;
  return { fee, pct, shipping };
}

interface ComparativeTableProps {
  groups: ComparativeListingGroup[];
  highlightedIds?: Record<string, boolean>;
  onPriceUpdated?: (groupId: string, newPrice: number, newOriginalPrice?: number | null) => void;
  onComparisonRefreshed?: (myListingId: string, resultData: any) => void;
  onOpenPairModal?: (group: ComparativeListingGroup) => void;
  onDeleteCompetitor?: (myListingId: string, competitorId: string) => void;
  onDeleteMyListing?: (myListingId: string, title: string) => void;
  onCompetitorAdded?: () => void;
}

export function ComparativeTable({
  groups,
  highlightedIds = {},
  onPriceUpdated,
  onComparisonRefreshed,
  onOpenPairModal,
  onDeleteCompetitor,
  onDeleteMyListing,
  onCompetitorAdded,
}: ComparativeTableProps) {
  // Inicializa com as linhas que possuem concorrentes expandidas
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    groups.forEach((g) => {
      if (g.competitors && g.competitors.length > 0) {
        initial[g.my_listing.id] = true;
      }
    });
    return initial;
  });

  const [selectedGroupForReprice, setSelectedGroupForReprice] = useState<ComparativeListingGroup | null>(null);
  const [selectedGroupForAdd, setSelectedGroupForAdd] = useState<ComparativeListingGroup | null>(null);
  const [refreshingPriceId, setRefreshingPriceId] = useState<string | null>(null);
  const [refreshingCompId, setRefreshingCompId] = useState<string | null>(null);
  const [verifiedSuccessIds, setVerifiedSuccessIds] = useState<Record<string, boolean>>({});
  const [toastNotification, setToastNotification] = useState<{
    id: string;
    text: string;
    type: "success" | "info" | "error";
  } | null>(null);

  /**
   * Confere e atualiza os dados do anúncio concorrente através do link (via extensão ou API oficial)
   * e também atualiza o preço e promoções do anúncio próprio do Mercado Livre
   */
  const handleRefreshComparison = async (
    group: ComparativeListingGroup,
    competitor: CompetitorComparisonItem
  ) => {
    const targetCompId = competitor.id;
    setRefreshingCompId(targetCompId);
    setToastNotification({
      id: targetCompId,
      text: "Conferindo anúncio concorrente via link e sincronizando com Mercado Livre...",
      type: "info",
    });

    try {
      const cleanExtDigits = (competitor.external_id || "").replace(/^MLB-?/i, "");
      const compPermalink =
        competitor.permalink ||
        (cleanExtDigits ? `https://produto.mercadolivre.com.br/MLB-${cleanExtDigits}` : "");

      // 1. Tenta acionar a extensão primeiro (se estiver ativa no navegador)
      let extResponse: any = null;
      if (
        typeof window !== "undefined" &&
        ((window as any).__CRM_MARKETPLACES_EXTENSION_ACTIVE__ ||
          document.documentElement.getAttribute("data-crm-extension-installed") === "true")
      ) {
        try {
          extResponse = await new Promise((resolve) => {
            const timeout = setTimeout(() => resolve(null), 8000);
            const reqId = "req_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7);

            const handleMsg = (e: MessageEvent) => {
              if (e.data?.type === "CRM_COMPETITOR_CHECK_RESULT" && e.data?.requestId === reqId) {
                clearTimeout(timeout);
                window.removeEventListener("message", handleMsg);
                resolve(e.data.result);
              }
            };
            window.addEventListener("message", handleMsg);

            window.postMessage(
              {
                type: "CRM_CHECK_COMPETITOR_LINK",
                requestId: reqId,
                payload: {
                  erpUrl: window.location.origin,
                  my_listing_id: group.my_listing.id,
                  competitor_id: competitor.id,
                  permalink: compPermalink,
                  external_id: competitor.external_id,
                  platform: group.my_listing.platform || "mercadolivre",
                },
              },
              "*"
            );
          });
        } catch (extErr) {
          console.warn("Aviso ao comunicar com extensão:", extErr);
        }
      }

      // Se a extensão já processou e concluiu no ERP:
      if (extResponse && extResponse.success && extResponse.comparison) {
        if (onComparisonRefreshed) {
          onComparisonRefreshed(group.my_listing.id, extResponse);
        }
        setVerifiedSuccessIds((prev) => ({ ...prev, [targetCompId]: true }));
        setToastNotification({
          id: targetCompId,
          text: `✓ Dados conferidos pela extensão via link! Concorrente: R$ ${Number(extResponse.competitor?.current_price).toFixed(2)} | Meu Anúncio: R$ ${Number(extResponse.my_listing?.current_price).toFixed(2)}`,
          type: "success",
        });
        return;
      }

      // 2. Chamada direta ao endpoint de verificação profunda (/api/bi/refresh-comparison)
      const res = await fetch("/api/bi/refresh-comparison", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          my_listing_id: group.my_listing.id,
          competitor_id: competitor.id,
          competitor_permalink: compPermalink,
          competitor_external_id: competitor.external_id,
          platform: group.my_listing.platform || "mercadolivre",
          verified_data: extResponse?.verifiedData || extResponse?.competitor || null,
        }),
      });

      const json = await res.json();
      if (res.ok && json.success) {
        if (onComparisonRefreshed) {
          onComparisonRefreshed(group.my_listing.id, json);
        }
        setVerifiedSuccessIds((prev) => ({ ...prev, [targetCompId]: true }));
        setToastNotification({
          id: targetCompId,
          text: `✓ Dados conferidos e atualizados com sucesso! Concorrente: R$ ${Number(json.competitor?.current_price).toFixed(2)} | Meu Anúncio: R$ ${Number(json.my_listing?.current_price).toFixed(2)}`,
          type: "success",
        });
      } else {
        setToastNotification({
          id: targetCompId,
          text: json.error || "Não foi possível verificar os dados do concorrente.",
          type: "error",
        });
      }
    } catch (err: any) {
      console.error("Erro ao atualizar comparativo:", err);
      setToastNotification({
        id: targetCompId,
        text: "Falha de conexão ao conferir dados com o Mercado Livre.",
        type: "error",
      });
    } finally {
      setRefreshingCompId(null);
      setTimeout(() => {
        setToastNotification(null);
      }, 7000);
    }
  };

  const handleRefreshSinglePrice = async (myListingId: string) => {
    setRefreshingPriceId(myListingId);
    try {
      const res = await fetch("/api/my-listings/refresh-price", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ my_listing_id: myListingId }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        if (onPriceUpdated && json.current_price !== undefined) {
          onPriceUpdated(myListingId, json.current_price, json.original_price);
        }
      } else {
        alert(json.error || "Não foi possível atualizar o preço do anúncio.");
      }
    } catch (err) {
      console.error("Erro ao atualizar preço:", err);
      alert("Falha de conexão ao atualizar preço.");
    } finally {
      setRefreshingPriceId(null);
    }
  };

  const toggleRow = (id: string) => {
    setExpandedRows((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  /**
   * Renderiza Badge de Logística
   */
  const renderShippingBadge = (type: string) => {
    switch (type) {
      case "ml_full":
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#00A650]/15 text-[#00A650] border border-[#00A650]/30">
            <Zap className="w-2.5 h-2.5 fill-current" /> FULL
          </span>
        );
      case "ml_flex":
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-sky-100 text-sky-800 border border-sky-200">
            <Truck className="w-2.5 h-2.5" /> FLEX
          </span>
        );
      case "ml_coleta":
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-700">
            Coleta
          </span>
        );
      case "shopee_xpress":
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#EE4D2D]/15 text-[#EE4D2D] border border-[#EE4D2D]/30">
            <Zap className="w-2.5 h-2.5 fill-current" /> SPX Express
          </span>
        );
      case "shopee_frete_gratis":
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
            Frete Grátis
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] text-slate-500 bg-slate-100">
            Padrão
          </span>
        );
    }
  };

  /**
   * Renderiza Badge de Reputação e Tipo de Anúncio
   */
  const renderReputationBadge = (rep: string | null, listingType?: string) => {
    if (listingType === "radar") {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-sky-700 bg-sky-50 px-1.5 py-0.5 rounded border border-sky-200">
          <Radio className="w-2.5 h-2.5 text-sky-600 animate-pulse" /> Radar Mercado
        </span>
      );
    }
    const isPremium = listingType === "premium";
    return (
      <div className="flex flex-col gap-0.5 text-[10px]">
        {listingType && (
          <span className={`font-semibold capitalize ${isPremium ? "text-amber-700" : "text-slate-600"}`}>
            {isPremium ? "★ Premium" : "Clássico"}
          </span>
        )}
        {rep === "platinum" && (
          <span className="text-emerald-700 font-bold flex items-center gap-0.5">
            <ShieldCheck className="w-3 h-3 text-emerald-600" /> Líder Platinum
          </span>
        )}
        {rep === "gold" && (
          <span className="text-amber-600 font-bold flex items-center gap-0.5">
            <ShieldCheck className="w-3 h-3 text-amber-500" /> Líder Gold
          </span>
        )}
        {rep === "oficial" && (
          <span className="text-sky-700 font-bold flex items-center gap-0.5">
            <ShieldCheck className="w-3 h-3 text-sky-600" /> Loja Oficial
          </span>
        )}
        {rep === "indicado" && (
          <span className="text-[#EE4D2D] font-bold flex items-center gap-0.5">
            <ShieldCheck className="w-3 h-3 text-[#EE4D2D]" /> Indicado Shopee
          </span>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-2">
      {toastNotification && (
        <div
          className={`px-3.5 py-2 rounded-lg text-xs font-medium flex items-center justify-between border shadow-2xs transition-all ${
            toastNotification.type === "success"
              ? "bg-emerald-50 border-emerald-300 text-emerald-900"
              : toastNotification.type === "error"
              ? "bg-red-50 border-red-300 text-red-900"
              : "bg-indigo-50 border-indigo-300 text-indigo-900"
          }`}
        >
          <div className="flex items-center gap-2">
            <RefreshCw
              className={`w-3.5 h-3.5 shrink-0 ${
                toastNotification.type === "info" ? "animate-spin text-indigo-600" : "text-emerald-600"
              }`}
            />
            <span>{toastNotification.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setToastNotification(null)}
            className="text-slate-400 hover:text-slate-700 font-bold ml-2 text-xs"
          >
            ✕
          </button>
        </div>
      )}

      <div className="bg-white border border-[#E2E8F0] rounded-md shadow-xs overflow-hidden">
      {/* Tabela de Alta Densidade 100% Responsiva com Scroll Suave */}
      <div className="overflow-x-auto w-full">
        <table className="w-full text-left border-collapse text-xs min-w-[880px]">
          <thead>
            {/* Linha 1 de Cabeçalho: Agrupamento Visual */}
            <tr className="bg-slate-100/90 border-b border-slate-200 text-slate-700 font-bold text-[10.5px] uppercase tracking-wider">
              <th className="py-2 px-1.5 w-8 text-center"></th>
              <th colSpan={3} className="py-2 px-2.5 border-r border-slate-200 bg-slate-100 text-slate-800">
                📦 MEU ANÚNCIO (DADOS PRÓPRIOS NO CANAL)
              </th>
              <th colSpan={4} className="py-2 px-2.5 bg-amber-50/70 text-amber-900 border-r border-slate-200">
                🎯 ANÚNCIO DO CONCORRENTE & DISCREPÂNCIA (1:N)
              </th>
              <th className="py-2 px-2 text-center bg-slate-100">
                AÇÕES
              </th>
            </tr>
            {/* Linha 2 de Cabeçalho: Colunas Específicas com Larguras Balanceadas */}
            <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[#475569] font-bold text-[10.5px] uppercase tracking-wider">
              <th className="py-2 px-1.5 w-8 text-center"></th>
              <th className="py-2 px-2.5 w-[25%] min-w-[190px]">Produto / SKU Próprio</th>
              <th className="py-2 px-2 w-[8%] min-w-[75px] text-right">Meu Preço</th>
              <th className="py-2 px-2 w-[7%] min-w-[70px] border-r border-slate-200">Logística</th>
              <th className="py-2 px-2.5 w-[26%] min-w-[200px] text-left bg-amber-50/30">Concorrente Vinculado</th>
              <th className="py-2 px-2 w-[9%] min-w-[80px] text-right bg-amber-50/30">Preço Concorrente</th>
              <th className="py-2 px-2 w-[9%] min-w-[85px] text-center bg-amber-50/30">Discrepância</th>
              <th className="py-2 px-2 w-[8%] min-w-[75px] border-r border-slate-200 bg-amber-50/30">Logística / Selo</th>
              <th className="py-2 px-2 w-[8%] min-w-[75px] text-center">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E2E8F0]">
            {groups.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-12 text-center">
                  <div className="max-w-md mx-auto flex flex-col items-center justify-center space-y-2">
                    <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                      <Radio className="w-5 h-5 text-slate-400" />
                    </div>
                    <p className="text-xs font-semibold text-slate-700">
                      Nenhum anúncio nesta visualização
                    </p>
                    <p className="text-[11px] text-slate-500 text-center leading-relaxed">
                      Utilize a extensão web diretamente no anúncio do concorrente para vinculá-lo ao seu anúncio ou clique em "+ Vincular Concorrente" na tabela.
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              groups.map((group) => {
                const isExpanded = expandedRows[group.my_listing.id] !== false;
                const hasCompetitors = group.competitors.length > 0;
                const isRadar = group.my_listing.listing_type === "radar";
                const hasMultipleCompetitors = !isRadar && group.competitors.length > 1;
                const topComp = hasCompetitors ? group.competitors[0] : null;
                const compUrl = topComp
                  ? topComp.permalink || `https://produto.mercadolivre.com.br/MLB-${(topComp.external_id || "").replace(/^MLB-?/i, "")}`
                  : null;

                return (
                  <React.Fragment key={group.my_listing.id}>
                    {/* Linha Principal: Anúncio Próprio e Concorrente lado a lado */}
                    <tr className={`hover:bg-[#F8FAFC]/80 transition-colors group ${isRadar ? "bg-sky-50/20" : ""}`}>
                      {/* Accordion Toggle: só aparece se houver 2 ou mais concorrentes */}
                      <td className="py-2 px-1 text-center">
                        {hasMultipleCompetitors ? (
                          <button
                            onClick={() => toggleRow(group.my_listing.id)}
                            className="p-1 rounded hover:bg-slate-200 text-slate-500 transition-colors"
                            title={isExpanded ? "Recolher concorrentes adicionais" : `Expandir +${group.competitors.length - 1} concorrente(s)`}
                          >
                            {isExpanded ? (
                              <ChevronDown className="w-3.5 h-3.5 text-indigo-600 font-bold" />
                            ) : (
                              <ChevronRight className="w-3.5 h-3.5" />
                            )}
                          </button>
                        ) : (
                          <Minus className="w-3 h-3 text-slate-300 mx-auto" />
                        )}
                      </td>

                      {/* 1. Meu Produto & SKU */}
                      <td className="py-2 px-2.5">
                        <div className="flex items-start space-x-2.5">
                          <div className="w-11 h-11 rounded border border-slate-200 bg-white shrink-0 flex items-center justify-center overflow-hidden p-0.5 shadow-2xs">
                            {group.my_listing.thumbnail_url ? (
                              <img
                                src={group.my_listing.thumbnail_url}
                                alt={group.my_listing.title}
                                className="w-full h-full object-contain"
                              />
                            ) : (
                              <Tag className="w-4 h-4 text-slate-400" />
                            )}
                          </div>
                          <div className="flex flex-col min-w-0 flex-1">
                            <div className="flex items-center gap-1 flex-wrap">
                              {isRadar && (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[9.5px] font-bold bg-sky-100 text-sky-800 border border-sky-300">
                                  <Radio className="w-2.5 h-2.5 text-sky-600 animate-pulse" /> Radar
                                </span>
                              )}
                              {/* TÍTULO CLICÁVEL DO MEU ANÚNCIO */}
                              <a
                                href={group.my_listing.permalink}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-semibold text-slate-900 hover:text-indigo-600 truncate text-xs hover:underline inline-flex items-center gap-1 group/title"
                                title="Abrir meu anúncio no marketplace"
                              >
                                <span className="truncate">{group.my_listing.title}</span>
                                <ExternalLink className="w-2.5 h-2.5 text-slate-400 group-hover/title:text-indigo-600 shrink-0 opacity-70" />
                              </a>
                            </div>
                            <div className="flex items-center gap-1.5 mt-0.5 text-[10.5px] text-slate-500">
                              <span>
                                SKU: <strong className="text-slate-700">{group.my_listing.product_sku || "Sem SKU"}</strong>
                              </span>
                              <span>•</span>
                              <span className="font-mono text-slate-400 text-[10px]">ID: {group.my_listing.external_id}</span>
                            </div>

                            <div className="flex items-center gap-1 mt-1 flex-wrap">
                              {formatDate(group.my_listing.listing_created_at || group.my_listing.created_at) && (
                                <span className="inline-flex items-center gap-0.5 text-slate-600 bg-slate-100 border border-slate-200 px-1.5 py-0.2 rounded text-[9.5px] font-medium" title="Data de criação e idade do anúncio">
                                  <Calendar className="w-2.5 h-2.5 text-slate-400" />
                                  {formatDate(group.my_listing.listing_created_at || group.my_listing.created_at)}
                                </span>
                              )}
                              <span
                                className={`inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded border text-[9.5px] font-semibold ${
                                  (group.my_listing.sales_count_approx ?? 0) > 0
                                    ? "text-emerald-700 bg-emerald-50 border-emerald-200"
                                    : "text-slate-500 bg-slate-50 border-slate-200"
                                }`}
                                title="Vendas estimadas"
                              >
                                <ShoppingBag
                                  className={`w-2.5 h-2.5 ${
                                    (group.my_listing.sales_count_approx ?? 0) > 0 ? "text-emerald-600" : "text-slate-400"
                                  }`}
                                />
                                {formatSales(group.my_listing.sales_count_approx)}
                              </span>
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* 2. Meu Preço */}
                      <td className="py-2 px-2 text-right">
                        <div className="flex flex-col items-end group/price relative">
                          <div className="flex items-center gap-1 justify-end w-full">
                            <MarketplacePrice
                              currentPrice={group.my_listing.current_price}
                              originalPrice={group.my_listing.original_price}
                              align="right"
                              size="sm"
                            />
                            {!isRadar && (
                              <button
                                type="button"
                                onClick={() => handleRefreshSinglePrice(group.my_listing.id)}
                                disabled={refreshingPriceId === group.my_listing.id}
                                className="opacity-0 group-hover/price:opacity-100 p-0.5 text-slate-400 hover:text-indigo-600 rounded transition-all ml-0.5"
                                title="Atualizar preço e promoção do Mercado Livre agora"
                              >
                                <RefreshCw className={`w-3 h-3 ${refreshingPriceId === group.my_listing.id ? "animate-spin text-indigo-600" : ""}`} />
                              </button>
                            )}
                          </div>
                          {group.my_listing.product_cost_price && (
                            <div className="text-[9.5px] text-slate-400 mt-0.5">
                              Custo: R$ {Number(group.my_listing.product_cost_price).toFixed(2)}
                            </div>
                          )}
                        </div>
                      </td>

                      {/* 3. Logística Própria */}
                      <td className="py-2 px-2 border-r border-slate-200">
                        {renderShippingBadge(group.my_listing.shipping_type)}
                      </td>

                      {/* 4. Concorrente Vinculado: FOTO + TÍTULO COM LINK CLICÁVEL + VENDEDOR */}
                      <td className="py-2 px-2.5 bg-amber-50/20">
                        {topComp && compUrl ? (
                          <div className="flex items-start space-x-2.5">
                            {/* Foto do Anúncio do Concorrente */}
                            <a
                              href={compUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="w-11 h-11 rounded border border-slate-200 bg-white shrink-0 flex items-center justify-center overflow-hidden p-0.5 shadow-2xs hover:border-indigo-400 transition-all hover:scale-105"
                              title="Clique para abrir o anúncio do concorrente"
                            >
                              {topComp.thumbnail_url ? (
                                <img
                                  src={topComp.thumbnail_url}
                                  alt={topComp.title}
                                  className="w-full h-full object-contain"
                                  onError={(e) => {
                                    (e.target as HTMLElement).style.display = "none";
                                  }}
                                />
                              ) : (
                                <Tag className="w-4 h-4 text-slate-400" />
                              )}
                            </a>

                            {/* Título Clicável e Dados do Concorrente */}
                            <div className="flex flex-col min-w-0 flex-1">
                              {/* TÍTULO CLICÁVEL: DIRECIONA AO ANÚNCIO DO CONCORRENTE */}
                              <a
                                href={compUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-semibold text-slate-900 hover:text-indigo-600 truncate text-xs hover:underline inline-flex items-center gap-1 group/comptitle"
                                title={`Abrir anúncio concorrente: ${topComp.title}`}
                              >
                                <span className="truncate">{topComp.title}</span>
                                <ExternalLink className="w-2.5 h-2.5 text-slate-400 group-hover/comptitle:text-indigo-600 shrink-0 opacity-70" />
                              </a>

                              {/* Vendedor e ID */}
                              <div className="flex items-center gap-1.5 mt-0.5 text-[10.5px] text-slate-500">
                                <span className="flex items-center gap-0.5 text-slate-700 font-medium truncate">
                                  <Store className="w-3 h-3 text-slate-400 shrink-0" />
                                  <span className="truncate">{topComp.seller_name || "Concorrente"}</span>
                                </span>
                                <span>•</span>
                                <span className="font-mono text-slate-400 text-[10px]">ID: {topComp.external_id}</span>
                              </div>

                              {/* Data de Criação, Idade em Dias e Vendas Estimadas */}
                              <div className="flex items-center gap-1 mt-1 flex-wrap">
                                {formatDate(topComp.listing_created_at || topComp.created_at) && (
                                  <span className="inline-flex items-center gap-0.5 text-slate-600 bg-white/90 border border-slate-200 px-1.5 py-0.2 rounded text-[9.5px] font-medium" title="Data de criação e idade do anúncio concorrente">
                                    <Calendar className="w-2.5 h-2.5 text-slate-400" />
                                    {formatDate(topComp.listing_created_at || topComp.created_at)}
                                  </span>
                                )}
                                <span
                                  className={`inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded border text-[9.5px] font-semibold ${
                                    (topComp.sales_count_approx ?? 0) > 0
                                      ? "text-emerald-700 bg-emerald-50 border-emerald-200"
                                      : "text-slate-500 bg-white/90 border-slate-200"
                                  }`}
                                  title="Vendas estimadas do concorrente"
                                >
                                  <ShoppingBag
                                    className={`w-2.5 h-2.5 ${
                                      (topComp.sales_count_approx ?? 0) > 0 ? "text-emerald-600" : "text-slate-400"
                                    }`}
                                  />
                                  {formatSales(topComp.sales_count_approx)}
                                </span>
                                {(() => {
                                  const f = estimateCompetitorFees(topComp.current_price, group.my_listing.platform);
                                  return (
                                    <>
                                      <span
                                        className="inline-flex items-center gap-0.5 text-rose-700 bg-rose-50/90 border border-rose-200 px-1.5 py-0.2 rounded text-[9.5px] font-medium"
                                        title={`Tarifa estimada do marketplace (${f.pct}%)`}
                                      >
                                        Tarifa: R$ {f.fee.toFixed(2).replace(".", ",")}
                                      </span>
                                      <span
                                        className="inline-flex items-center gap-0.5 text-amber-800 bg-amber-50/90 border border-amber-200 px-1.5 py-0.2 rounded text-[9.5px] font-medium"
                                        title="Custo estimado de envio/frete do vendedor"
                                      >
                                        Frete: R$ {f.shipping.toFixed(2).replace(".", ",")}
                                      </span>
                                    </>
                                  );
                                })()}
                              </div>

                              {/* Botão de Atualizar Dados ao lado do comparativo */}
                              <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                                <button
                                  type="button"
                                  onClick={() => handleRefreshComparison(group, topComp)}
                                  disabled={refreshingCompId === topComp.id}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 transition-all shadow-2xs hover:shadow active:scale-95 disabled:opacity-60 cursor-pointer"
                                  title="A extensão e API conferem o anúncio do concorrente via link e atualizam meu anúncio"
                                >
                                  <RefreshCw
                                    className={`w-3 h-3 text-indigo-600 ${
                                      refreshingCompId === topComp.id ? "animate-spin" : ""
                                    }`}
                                  />
                                  <span>{refreshingCompId === topComp.id ? "Conferindo..." : "Atualizar Dados"}</span>
                                </button>
                                {verifiedSuccessIds[topComp.id] && (
                                  <span className="inline-flex items-center gap-0.5 text-[9.5px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.2 rounded animate-pulse">
                                    <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" /> Conferido no Link
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between p-1.5 rounded border border-dashed border-slate-300 bg-white/80">
                            <span className="text-[10.5px] text-slate-400 italic">Sem concorrente</span>
                            <button
                              onClick={() => setSelectedGroupForAdd(group)}
                              className="px-2 py-0.5 rounded bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-[10px] font-bold inline-flex items-center gap-0.5 transition-colors"
                            >
                              <PlusCircle className="w-3 h-3" /> Vincular
                            </button>
                          </div>
                        )}
                      </td>

                      {/* 5. Preço Concorrente */}
                      <td className="py-2 px-2 text-right bg-amber-50/20">
                        {topComp ? (
                          <div>
                            <MarketplacePrice
                              currentPrice={topComp.current_price}
                              originalPrice={topComp.original_price}
                              align="right"
                              size="sm"
                            />
                            {hasMultipleCompetitors && (
                              <button
                                onClick={() => toggleRow(group.my_listing.id)}
                                className="text-[9.5px] font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 border border-indigo-200 px-1 py-0.2 rounded mt-0.5 inline-flex items-center gap-0.5"
                                title="Ver sublinhas com outros concorrentes"
                              >
                                +{group.competitors.length - 1} outro(s)
                              </button>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400 italic text-[11px]">—</span>
                        )}
                      </td>

                      {/* 6. Discrepância / Buybox Status */}
                      <td className="py-2 px-2 text-center bg-amber-50/20">
                        {isRadar ? (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-sky-50 text-sky-700 border border-sky-200">
                            <Radio className="w-2.5 h-2.5 text-sky-600 animate-pulse" />
                            Radar
                          </span>
                        ) : (
                          <>
                            {group.status === "WINNING" && (
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-[#ECFDF5] text-[#065F46] border border-[#A7F3D0]">
                                <TrendingDown className="w-3 h-3 text-[#10B981]" />
                                -R$ {Math.abs(group.diff_brl || 0).toFixed(2)} ({Math.abs(group.diff_pct || 0)}%)
                              </span>
                            )}
                            {group.status === "TIED" && (
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-[#FEFCE8] text-[#854D0E] border border-[#FEF08A]">
                                Empatado
                              </span>
                            )}
                            {group.status === "LOSING" && (
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-[#FEF2F2] text-[#991B1B] border border-[#FECACA]">
                                <TrendingUp className="w-3 h-3 text-[#EF4444]" />
                                +R$ {Math.abs(group.diff_brl || 0).toFixed(2)} (+{group.diff_pct}%)
                              </span>
                            )}
                            {group.status === "UNMATCHED" && (
                              <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-medium bg-slate-100 text-slate-400">
                                Sem concorrente
                              </span>
                            )}
                          </>
                        )}
                      </td>

                      {/* 7. Logística / Selo Concorrente */}
                      <td className="py-2 px-2 border-r border-slate-200 bg-amber-50/20">
                        {topComp ? (
                          <div className="flex flex-col gap-0.5 items-start">
                            {renderShippingBadge(topComp.shipping_type)}
                            {renderReputationBadge(topComp.seller_reputation)}
                            {topComp.promo_badge && (
                              <span className="px-1 py-0.2 rounded text-[9px] font-bold bg-amber-100 text-amber-800 border border-amber-200 truncate max-w-[80px]">
                                {topComp.promo_badge}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400 text-[10px]">—</span>
                        )}
                      </td>

                      {/* 8. Ações Rápidas */}
                      <td className="py-2 px-2 text-center">
                        <div className="flex items-center justify-center space-x-0.5">
                          {/* Atualizar Dados via Link do Concorrente e API */}
                          {topComp && (
                            <button
                              type="button"
                              onClick={() => handleRefreshComparison(group, topComp)}
                              disabled={refreshingCompId === topComp.id}
                              className="p-1 rounded hover:bg-indigo-50 text-indigo-600 hover:text-indigo-800 transition-colors disabled:opacity-50"
                              title="Atualizar dados: confere anúncio concorrente via link e atualiza meu anúncio"
                            >
                              <RefreshCw
                                className={`w-3.5 h-3.5 ${
                                  refreshingCompId === topComp.id ? "animate-spin text-indigo-600" : ""
                                }`}
                              />
                            </button>
                          )}

                          {/* Adicionar Mais Concorrente ao Meu Anúncio (1:N) */}
                          <button
                            onClick={() => setSelectedGroupForAdd(group)}
                            className="p-1 rounded hover:bg-indigo-50 text-indigo-600 transition-colors"
                            title="Vincular mais um concorrente (1:N)"
                          >
                            <PlusCircle className="w-3.5 h-3.5" />
                          </button>

                          {/* Simulação de Reprecificação */}
                          <button
                            onClick={() => setSelectedGroupForReprice(group)}
                            className="p-1 rounded hover:bg-sky-50 text-sky-700 transition-colors"
                            title="Simular Reprecificação"
                          >
                            <SlidersHorizontal className="w-3.5 h-3.5" />
                          </button>

                          {/* Link Externo */}
                          <a
                            href={compUrl || group.my_listing.permalink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1 rounded hover:bg-slate-100 text-slate-600 transition-colors"
                            title={compUrl ? "Abrir anúncio concorrente no Marketplace" : "Ver meu anúncio no Marketplace"}
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>

                          {/* Remover / Desvincular */}
                          <button
                            onClick={() => {
                              if (topComp) {
                                if (confirm(`Deseja desvincular o concorrente "${topComp.title.slice(0, 35)}..." deste anúncio?`)) {
                                  onDeleteCompetitor && onDeleteCompetitor(group.my_listing.id, topComp.id);
                                }
                              } else {
                                if (confirm(`Deseja remover este anúncio do catálogo de monitoramento?`)) {
                                  onDeleteMyListing && onDeleteMyListing(group.my_listing.id, group.my_listing.title);
                                }
                              }
                            }}
                            className="p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors"
                            title={topComp ? "Desvincular concorrente deste produto" : "Remover do catálogo"}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>

                    {/* SUBLINHAS: Concorrentes Adicionais (1:N) - Alinhamento Perfeito com as Colunas */}
                    {isExpanded && hasMultipleCompetitors && (
                      group.competitors.slice(1).map((comp, compIdx) => {
                        const isHighlighted = highlightedIds[comp.id];
                        const subCompUrl = comp.permalink || `https://produto.mercadolivre.com.br/MLB-${(comp.external_id || "").replace(/^MLB-?/i, "")}`;

                        return (
                          <tr
                            key={`${group.my_listing.id}-comp-${comp.id}`}
                            className={`border-b border-indigo-100/50 transition-colors ${
                              isHighlighted ? "bg-amber-100/60 font-semibold" : "bg-indigo-50/20 hover:bg-indigo-50/40"
                            }`}
                          >
                            {/* 1. Número da Sublinha */}
                            <td className="py-2 px-1 text-center font-mono text-[10px] text-indigo-600 font-bold border-l-2 border-indigo-500">
                              #{compIdx + 2}
                            </td>

                            {/* 2-4: Indicação de Concorrente Adicional */}
                            <td colSpan={3} className="py-2 px-2.5 border-r border-slate-200">
                              <div className="flex items-center gap-1 text-[11px] text-slate-500">
                                <span className="text-indigo-600 font-bold text-xs">└─</span>
                                <span className="text-slate-600">Concorrente adicional comparando com este SKU</span>
                              </div>
                            </td>

                            {/* 5. Foto + Título Clicável + Loja do Concorrente Adicional */}
                            <td className="py-2 px-2.5 bg-amber-50/20">
                              <div className="flex items-start space-x-2.5">
                                <a
                                  href={subCompUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="w-10 h-10 rounded border border-slate-200 bg-white shrink-0 flex items-center justify-center overflow-hidden p-0.5 shadow-2xs hover:border-indigo-400"
                                  title="Ver anúncio concorrente"
                                >
                                  {comp.thumbnail_url ? (
                                    <img src={comp.thumbnail_url} alt={comp.title} className="w-full h-full object-contain" />
                                  ) : (
                                    <Tag className="w-3.5 h-3.5 text-slate-400" />
                                  )}
                                </a>
                                <div className="flex flex-col min-w-0 flex-1">
                                  <a
                                    href={subCompUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="font-semibold text-slate-900 hover:text-indigo-600 truncate text-xs hover:underline inline-flex items-center gap-1 group/comptitle"
                                    title={`Abrir concorrente: ${comp.title}`}
                                  >
                                    <span className="truncate">{comp.title}</span>
                                    <ExternalLink className="w-2.5 h-2.5 text-slate-400 group-hover/comptitle:text-indigo-600 shrink-0 opacity-70" />
                                  </a>
                                  <div className="flex items-center gap-1.5 text-[10.5px] text-slate-500 mt-0.5">
                                    <Store className="w-3 h-3 text-slate-400 shrink-0" />
                                    <span className="truncate">Loja: <strong className="text-slate-700">{comp.seller_name}</strong></span>
                                    <span>•</span>
                                    <span className="font-mono text-slate-400 text-[10px]">ID: {comp.external_id}</span>
                                  </div>

                                  {/* Data de Criação, Idade em Dias e Vendas Estimadas da Sublinha */}
                                  <div className="flex items-center gap-1 mt-1 flex-wrap">
                                    {formatDate(comp.listing_created_at || comp.created_at) && (
                                      <span className="inline-flex items-center gap-0.5 text-slate-600 bg-white/90 border border-slate-200 px-1.5 py-0.2 rounded text-[9.5px] font-medium" title="Data de criação e idade do anúncio concorrente">
                                        <Calendar className="w-2.5 h-2.5 text-slate-400" />
                                        {formatDate(comp.listing_created_at || comp.created_at)}
                                      </span>
                                    )}
                                    <span
                                      className={`inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded border text-[9.5px] font-semibold ${
                                        (comp.sales_count_approx ?? 0) > 0
                                          ? "text-emerald-700 bg-emerald-50 border-emerald-200"
                                          : "text-slate-500 bg-white/90 border-slate-200"
                                      }`}
                                      title="Vendas estimadas do concorrente"
                                    >
                                      <ShoppingBag
                                        className={`w-2.5 h-2.5 ${
                                          (comp.sales_count_approx ?? 0) > 0 ? "text-emerald-600" : "text-slate-400"
                                        }`}
                                      />
                                      {formatSales(comp.sales_count_approx)}
                                    </span>
                                    {(() => {
                                      const f = estimateCompetitorFees(comp.current_price, group.my_listing.platform);
                                      return (
                                        <>
                                          <span
                                            className="inline-flex items-center gap-0.5 text-rose-700 bg-rose-50/90 border border-rose-200 px-1.5 py-0.2 rounded text-[9.5px] font-medium"
                                            title={`Tarifa estimada do marketplace (${f.pct}%)`}
                                          >
                                            Tarifa: R$ {f.fee.toFixed(2).replace(".", ",")}
                                          </span>
                                          <span
                                            className="inline-flex items-center gap-0.5 text-amber-800 bg-amber-50/90 border border-amber-200 px-1.5 py-0.2 rounded text-[9.5px] font-medium"
                                            title="Custo estimado de envio/frete do vendedor"
                                          >
                                            Frete: R$ {f.shipping.toFixed(2).replace(".", ",")}
                                          </span>
                                        </>
                                      );
                                    })()}
                                  </div>

                                  {/* Botão de Atualizar Dados da Sublinha */}
                                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                    <button
                                      type="button"
                                      onClick={() => handleRefreshComparison(group, comp)}
                                      disabled={refreshingCompId === comp.id}
                                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9.5px] font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 transition-all shadow-2xs hover:shadow active:scale-95 disabled:opacity-60 cursor-pointer"
                                      title="A extensão e API conferem o anúncio do concorrente via link e atualizam meu anúncio"
                                    >
                                      <RefreshCw
                                        className={`w-2.5 h-2.5 text-indigo-600 ${
                                          refreshingCompId === comp.id ? "animate-spin" : ""
                                        }`}
                                      />
                                      <span>{refreshingCompId === comp.id ? "Conferindo..." : "Atualizar Dados"}</span>
                                    </button>
                                    {verifiedSuccessIds[comp.id] && (
                                      <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1 py-0.2 rounded animate-pulse">
                                        <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" /> Conferido
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </td>

                            {/* 6. Preço Concorrente Adicional */}
                            <td className="py-2 px-2 text-right bg-amber-50/20">
                              <MarketplacePrice currentPrice={comp.current_price} originalPrice={comp.original_price} align="right" size="sm" />
                            </td>

                            {/* 7. Discrepância Concorrente Adicional */}
                            <td className="py-2 px-2 text-center bg-amber-50/20">
                              {comp.price_difference_brl > 0 ? (
                                <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-[#EF4444] bg-red-50 border border-red-200 px-1.5 py-0.5 rounded">
                                  <TrendingUp className="w-2.5 h-2.5 text-red-500" />
                                  +R$ {comp.price_difference_brl.toFixed(2)} (+{comp.price_difference_pct}%)
                                </span>
                              ) : comp.price_difference_brl === 0 ? (
                                <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                                  Empate
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
                                  <TrendingDown className="w-2.5 h-2.5 text-emerald-500" />
                                  -R$ {Math.abs(comp.price_difference_brl).toFixed(2)} ({comp.price_difference_pct}%)
                                </span>
                              )}
                            </td>

                            {/* 8. Logística/Selo Concorrente Adicional */}
                            <td className="py-2 px-2 border-r border-slate-200 bg-amber-50/20">
                              <div className="flex flex-col gap-0.5 items-start">
                                {renderShippingBadge(comp.shipping_type)}
                                {renderReputationBadge(comp.seller_reputation)}
                                {comp.promo_badge && (
                                  <span className="px-1 py-0.2 rounded text-[9px] font-bold bg-amber-100 text-amber-800 border border-amber-200 truncate max-w-[80px]">
                                    {comp.promo_badge}
                                  </span>
                                )}
                              </div>
                            </td>

                            {/* 9. Ações Rápidas Concorrente Adicional */}
                            <td className="py-2 px-2 text-center">
                              <div className="flex items-center justify-center space-x-1">
                                <button
                                  type="button"
                                  onClick={() => handleRefreshComparison(group, comp)}
                                  disabled={refreshingCompId === comp.id}
                                  className="p-1 rounded hover:bg-indigo-50 text-indigo-600 hover:text-indigo-800 transition-colors disabled:opacity-50"
                                  title="Atualizar dados: confere anúncio concorrente adicional via link e atualiza meu anúncio"
                                >
                                  <RefreshCw
                                    className={`w-3.5 h-3.5 ${
                                      refreshingCompId === comp.id ? "animate-spin text-indigo-600" : ""
                                    }`}
                                  />
                                </button>
                                <a
                                  href={subCompUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="p-1 rounded hover:bg-slate-100 text-slate-500"
                                  title="Abrir no marketplace"
                                >
                                  <ExternalLink className="w-3.5 h-3.5" />
                                </a>
                                <button
                                  onClick={() => {
                                    if (confirm(`Deseja desvincular o concorrente "${comp.title.slice(0, 30)}..." deste anúncio?`)) {
                                      onDeleteCompetitor && onDeleteCompetitor(group.my_listing.id, comp.id);
                                    }
                                  }}
                                  className="p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-600"
                                  title="Desvincular este concorrente"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Modal de Adicionar Concorrente (1:N) */}
      <AddCompetitorModal
        group={selectedGroupForAdd}
        isOpen={!!selectedGroupForAdd}
        onClose={() => setSelectedGroupForAdd(null)}
        onSuccess={(msg) => {
          if (onCompetitorAdded) onCompetitorAdded();
        }}
      />

      {/* Modal de Reprecificação e Margem */}
      <RepriceModal
        group={selectedGroupForReprice}
        isOpen={!!selectedGroupForReprice}
        onClose={() => setSelectedGroupForReprice(null)}
        onSuccess={(newPrice) => {
          if (selectedGroupForReprice && onPriceUpdated) {
            onPriceUpdated(selectedGroupForReprice.my_listing.id, newPrice);
          }
        }}
      />
    </div>
    </div>
  );
}
