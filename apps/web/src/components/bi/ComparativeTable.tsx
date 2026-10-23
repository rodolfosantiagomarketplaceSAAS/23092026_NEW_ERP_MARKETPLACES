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
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch {
    return null;
  }
}

function formatSales(sales?: number | null) {
  if (sales === undefined || sales === null || sales < 0) return null;
  if (sales >= 1000) {
    return `+${(sales / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil vendas`;
  }
  return `${sales.toLocaleString("pt-BR")} venda${sales === 1 ? "" : "s"}`;
}

interface ComparativeTableProps {
  groups: ComparativeListingGroup[];
  highlightedIds?: Record<string, boolean>;
  onPriceUpdated?: (groupId: string, newPrice: number) => void;
  onOpenPairModal?: (group: ComparativeListingGroup) => void;
  onDeleteCompetitor?: (myListingId: string, competitorId: string) => void;
  onDeleteMyListing?: (myListingId: string, title: string) => void;
  onCompetitorAdded?: () => void;
}

export function ComparativeTable({
  groups,
  highlightedIds = {},
  onPriceUpdated,
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
                  ? topComp.permalink || `https://www.mercadolivre.com.br/p/${topComp.external_id}`
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

                            {(formatDate(group.my_listing.listing_created_at || group.my_listing.created_at) ||
                              (group.my_listing.sales_count_approx !== undefined && group.my_listing.sales_count_approx > 0)) && (
                              <div className="flex items-center gap-1 mt-1 flex-wrap">
                                {formatDate(group.my_listing.listing_created_at || group.my_listing.created_at) && (
                                  <span className="inline-flex items-center gap-0.5 text-slate-500 bg-slate-100 px-1 py-0.2 rounded text-[9.5px]" title="Data de criação do anúncio">
                                    <Calendar className="w-2.5 h-2.5 text-slate-400" />
                                    {formatDate(group.my_listing.listing_created_at || group.my_listing.created_at)}
                                  </span>
                                )}
                                {group.my_listing.sales_count_approx !== undefined && group.my_listing.sales_count_approx > 0 && (
                                  <span className="inline-flex items-center gap-0.5 text-emerald-700 bg-emerald-50 px-1 py-0.2 rounded border border-emerald-200 text-[9.5px] font-semibold" title="Vendas estimadas">
                                    <ShoppingBag className="w-2.5 h-2.5 text-emerald-600" />
                                    {formatSales(group.my_listing.sales_count_approx)}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* 2. Meu Preço */}
                      <td className="py-2 px-2 text-right">
                        <div>
                          <MarketplacePrice
                            currentPrice={group.my_listing.current_price}
                            originalPrice={group.my_listing.original_price}
                            align="right"
                            size="sm"
                          />
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

                              {/* Data de Criação e Vendas Estimadas */}
                              {(formatDate(topComp.listing_created_at || topComp.created_at) ||
                                (topComp.sales_count_approx !== undefined && topComp.sales_count_approx > 0)) && (
                                <div className="flex items-center gap-1 mt-1 flex-wrap">
                                  {formatDate(topComp.listing_created_at || topComp.created_at) && (
                                    <span className="inline-flex items-center gap-0.5 text-slate-500 bg-white/90 border border-slate-200 px-1 py-0.2 rounded text-[9.5px]" title="Data de criação do concorrente">
                                      <Calendar className="w-2.5 h-2.5 text-slate-400" />
                                      {formatDate(topComp.listing_created_at || topComp.created_at)}
                                    </span>
                                  )}
                                  {topComp.sales_count_approx !== undefined && topComp.sales_count_approx > 0 && (
                                    <span className="inline-flex items-center gap-0.5 text-emerald-700 bg-emerald-50 px-1 py-0.2 rounded border border-emerald-200 text-[9.5px] font-semibold" title="Vendas estimadas do concorrente">
                                      <ShoppingBag className="w-2.5 h-2.5 text-emerald-600" />
                                      {formatSales(topComp.sales_count_approx)}
                                    </span>
                                  )}
                                </div>
                              )}
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
                              currentPrice={group.lowest_competitor_price ?? topComp.current_price}
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
                        const subCompUrl = comp.permalink || `https://www.mercadolivre.com.br/p/${comp.external_id}`;

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
                              </div>
                            </td>

                            {/* 9. Ações Rápidas Concorrente Adicional */}
                            <td className="py-2 px-2 text-center">
                              <div className="flex items-center justify-center space-x-1">
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
  );
}
