"use client";

import React, { useState } from "react";
import Image from "next/image";
import {
  ChevronDown,
  ChevronRight,
  ExternalLink,
  SlidersHorizontal,
  Link as LinkIcon,
  Truck,
  Zap,
  Tag,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  Minus,
  Sparkles,
  Trash2,
  Radio,
} from "lucide-react";
import type { ComparativeListingGroup, CompetitorComparisonItem } from "@crm/types";
import { RepriceModal } from "./RepriceModal";

interface ComparativeTableProps {
  groups: ComparativeListingGroup[];
  highlightedIds?: Record<string, boolean>;
  onPriceUpdated?: (groupId: string, newPrice: number) => void;
  onOpenPairModal?: (groupId: string) => void;
  onDeleteCompetitor?: (myListingId: string, competitorId: string) => void;
  onDeleteMyListing?: (myListingId: string, title: string) => void;
}

export function ComparativeTable({
  groups,
  highlightedIds = {},
  onPriceUpdated,
  onOpenPairModal,
  onDeleteCompetitor,
  onDeleteMyListing,
}: ComparativeTableProps) {
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({
    "ml-001": true, // Deixa o primeiro expandido por padrão
    "shp-001": true,
  });

  const [selectedGroupForReprice, setSelectedGroupForReprice] = useState<ComparativeListingGroup | null>(null);

  const toggleRow = (id: string) => {
    setExpandedRows((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  /**
   * Renderiza Badge de Logística do Mercado Livre e Shopee
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
      {/* Tabela de Alta Densidade Estilo Tiny ERP */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[#475569] font-bold text-[11px] uppercase tracking-wider">
              <th className="py-2.5 px-3 w-8 text-center"></th>
              <th className="py-2.5 px-3 min-w-[280px]">Produto / SKU / Anúncio Próprio</th>
              <th className="py-2.5 px-3 text-right">Meu Preço</th>
              <th className="py-2.5 px-3 text-right">Menor Concorrente</th>
              <th className="py-2.5 px-3 text-center">Discrepância</th>
              <th className="py-2.5 px-3">Logística</th>
              <th className="py-2.5 px-3">Tipo / Reputação</th>
              <th className="py-2.5 px-3">Promoções</th>
              <th className="py-2.5 px-3 text-center min-w-[140px]">Ações Rápidas</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E2E8F0]">
            {groups.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-8 text-center text-slate-400">
                  Nenhum anúncio encontrado para os filtros selecionados.
                </td>
              </tr>
            ) : (
              groups.map((group) => {
                const isExpanded = !!expandedRows[group.my_listing.id];
                const hasCompetitors = group.competitors.length > 0;
                const isRadar = group.my_listing.listing_type === "radar";

                return (
                  <React.Fragment key={group.my_listing.id}>
                    {/* Linha Principal: Anúncio Próprio ou Radar */}
                    <tr className={`hover:bg-[#F8FAFC]/80 transition-colors group ${isRadar ? "bg-sky-50/20" : ""}`}>
                      {/* Accordion Toggle */}
                      <td className="py-2 px-3 text-center">
                        {hasCompetitors ? (
                          <button
                            onClick={() => toggleRow(group.my_listing.id)}
                            className="p-1 rounded hover:bg-slate-200 text-slate-500 transition-colors"
                            title={isExpanded ? "Recolher Concorrentes" : "Ver Concorrentes"}
                          >
                            {isExpanded ? (
                              <ChevronDown className="w-3.5 h-3.5" />
                            ) : (
                              <ChevronRight className="w-3.5 h-3.5" />
                            )}
                          </button>
                        ) : (
                          <Minus className="w-3 h-3 text-slate-300 mx-auto" />
                        )}
                      </td>

                      {/* Produto & SKU */}
                      <td className="py-2.5 px-3">
                        <div className="flex items-start space-x-2.5">
                          <div className="w-9 h-9 rounded border border-slate-200 bg-slate-50 shrink-0 flex items-center justify-center overflow-hidden">
                            {group.my_listing.thumbnail_url ? (
                              <img
                                src={group.my_listing.thumbnail_url}
                                alt={group.my_listing.title}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <Tag className="w-4 h-4 text-slate-400" />
                            )}
                          </div>
                          <div className="flex flex-col">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {isRadar && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-bold bg-sky-100 text-sky-800 border border-sky-300">
                                  <Radio className="w-2.5 h-2.5 text-sky-600 animate-pulse" /> Radar Concorrente
                                </span>
                              )}
                              <span className="font-semibold text-slate-900 line-clamp-1 leading-snug">
                                {group.my_listing.title}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-500">
                              <span>
                                SKU:{" "}
                                <strong className="text-slate-700">
                                  {group.my_listing.product_sku || "Sem SKU"}
                                </strong>
                              </span>
                              <span>•</span>
                              <span>ID: <code>{group.my_listing.external_id}</code></span>
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Meu Preço */}
                      <td className="py-2.5 px-3 text-right">
                        {isRadar ? (
                          <div>
                            <div className="font-bold text-slate-700 text-sm">
                              R$ {Number(group.my_listing.current_price).toFixed(2)}
                            </div>
                            <div className="text-[10px] text-slate-400">Preço de Referência</div>
                            <button
                              onClick={() => setSelectedGroupForReprice(group)}
                              className="text-[10px] text-sky-600 hover:text-sky-800 underline font-medium block ml-auto mt-0.5"
                              title="Definir custo ou preço pretendido para calcular margem"
                            >
                              {group.my_listing.product_cost_price
                                ? `Custo: R$ ${Number(group.my_listing.product_cost_price).toFixed(2)}`
                                : "Definir Meu Custo"}
                            </button>
                          </div>
                        ) : (
                          <div>
                            <div className="font-bold text-slate-900 text-sm">
                              R$ {Number(group.my_listing.current_price).toFixed(2)}
                            </div>
                            {group.my_listing.product_cost_price && (
                              <div className="text-[10px] text-slate-400">
                                Custo: R$ {Number(group.my_listing.product_cost_price).toFixed(2)}
                              </div>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Menor Concorrente */}
                      <td className="py-2.5 px-3 text-right">
                        {group.lowest_competitor_price !== null ? (
                          <div className="font-bold text-slate-800 text-sm">
                            R$ {group.lowest_competitor_price.toFixed(2)}
                          </div>
                        ) : (
                          <span className="text-slate-400 italic text-[11px]">Nenhum pareado</span>
                        )}
                        <div className="text-[10px] text-slate-500">
                          {group.competitors.length} monitorado(s)
                        </div>
                      </td>

                      {/* Discrepância / Buybox Status */}
                      <td className="py-2.5 px-3 text-center">
                        {isRadar ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-sky-50 text-sky-700 border border-sky-200">
                            <Radio className="w-3 h-3 text-sky-600 animate-pulse" />
                            Espionando Preço
                          </span>
                        ) : (
                          <>
                            {group.status === "WINNING" && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-[#ECFDF5] text-[#065F46] border border-[#A7F3D0]">
                                <TrendingDown className="w-3 h-3 text-[#10B981]" />
                                -R$ {Math.abs(group.diff_brl || 0).toFixed(2)} ({Math.abs(group.diff_pct || 0)}%)
                              </span>
                            )}
                            {group.status === "TIED" && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-[#FEFCE8] text-[#854D0E] border border-[#FEF08A]">
                                Empatado (R$ 0,00)
                              </span>
                            )}
                            {group.status === "LOSING" && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-[#FEF2F2] text-[#991B1B] border border-[#FECACA]">
                                <TrendingUp className="w-3 h-3 text-[#EF4444]" />
                                +R$ {Math.abs(group.diff_brl || 0).toFixed(2)} (+{group.diff_pct}%)
                              </span>
                            )}
                            {group.status === "UNMATCHED" && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-500">
                                Sem concorrentes
                              </span>
                            )}
                          </>
                        )}
                      </td>

                      {/* Logística */}
                      <td className="py-2.5 px-3">
                        {renderShippingBadge(group.my_listing.shipping_type)}
                      </td>

                      {/* Tipo / Reputação */}
                      <td className="py-2.5 px-3">
                        {renderReputationBadge(null, group.my_listing.listing_type)}
                      </td>

                      {/* Promoção */}
                      <td className="py-2.5 px-3">
                        <span className="text-slate-400 text-[11px]">Normal</span>
                      </td>

                      {/* Ações Rápidas */}
                      <td className="py-2.5 px-3 text-center">
                        <div className="flex items-center justify-center space-x-1">
                          <button
                            onClick={() => setSelectedGroupForReprice(group)}
                            className="p-1.5 rounded hover:bg-sky-50 text-sky-700 border border-transparent hover:border-sky-200 transition-colors"
                            title="Simular Reprecificação & Margem"
                          >
                            <SlidersHorizontal className="w-3.5 h-3.5" />
                          </button>

                          <a
                            href={group.my_listing.permalink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 rounded hover:bg-slate-100 text-slate-600 border border-transparent hover:border-slate-200 transition-colors"
                            title={isRadar ? "Abrir anúncio concorrente no Marketplace" : "Ver meu anúncio no Marketplace"}
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>

                          <button
                            onClick={() => onOpenPairModal && onOpenPairModal(group.my_listing.id)}
                            className="p-1.5 rounded hover:bg-slate-100 text-slate-600 border border-transparent hover:border-slate-200 transition-colors"
                            title={isRadar ? "Parear a outro anúncio" : "Parear Novo Concorrente Manualmente"}
                          >
                            <LinkIcon className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => {
                              const msg = isRadar
                                ? `Deseja remover o anúncio "${group.my_listing.title.slice(0, 35)}..." do radar de monitoramento?`
                                : `Deseja remover o anúncio "${group.my_listing.title.slice(0, 35)}..." do catálogo de monitoramento?`;
                              if (confirm(msg)) {
                                onDeleteMyListing && onDeleteMyListing(group.my_listing.id, group.my_listing.title);
                              }
                            }}
                            className="p-1.5 rounded hover:bg-red-50 text-slate-400 hover:text-red-600 border border-transparent hover:border-red-200 transition-colors"
                            title={isRadar ? "Remover do radar de monitoramento" : "Excluir este anúncio do monitoramento"}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>

                    {/* Linhas Filhas: Concorrentes Pareados (Accordion 1:N) */}
                    {isExpanded && hasCompetitors && (
                      <tr className="bg-[#F8FAFC]">
                        <td colSpan={9} className="p-0 border-t border-b border-[#E2E8F0]">
                          <div className="pl-12 pr-4 py-2 space-y-1">
                            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1 flex items-center gap-1">
                              <Sparkles className="w-3 h-3 text-amber-500" />
                              Concorrentes Pareados ({group.competitors.length}):
                            </div>
                            <div className="divide-y divide-slate-200/80 rounded border border-slate-200 bg-white">
                              {group.competitors.map((comp) => {
                                const isHighlighted = highlightedIds[comp.id];

                                return (
                                  <div
                                    key={comp.id}
                                    className={`flex items-center justify-between py-2 px-3 text-xs transition-all duration-300 ${
                                      isHighlighted
                                        ? "realtime-highlight bg-amber-100/60 font-semibold"
                                        : "hover:bg-slate-50/80"
                                    }`}
                                  >
                                    {/* Info Concorrente */}
                                    <div className="flex items-center space-x-2 w-[34%]">
                                      <div className="w-2 h-2 rounded-full bg-slate-300 shrink-0"></div>
                                      <div className="flex flex-col">
                                        <span className="font-medium text-slate-800 line-clamp-1">
                                          {comp.title}
                                        </span>
                                        <div className="text-[10px] text-slate-500 flex items-center gap-2">
                                          <span>Loja: <strong className="text-slate-700">{comp.seller_name}</strong></span>
                                          <span>•</span>
                                          <span>ID: <code>{comp.external_id}</code></span>
                                        </div>
                                      </div>
                                    </div>

                                    {/* Preço do Concorrente */}
                                    <div className="w-[12%] text-right font-bold text-slate-900">
                                      R$ {comp.current_price.toFixed(2)}
                                      {comp.original_price && (
                                        <div className="text-[10px] text-slate-400 line-through">
                                          R$ {comp.original_price.toFixed(2)}
                                        </div>
                                      )}
                                    </div>

                                    {/* Diferença vs Meu Preço */}
                                    <div className="w-[14%] text-center">
                                      {comp.price_difference_brl > 0 ? (
                                        <span className="text-[11px] font-bold text-[#EF4444]">
                                          +R$ {comp.price_difference_brl.toFixed(2)} (+{comp.price_difference_pct}%)
                                        </span>
                                      ) : comp.price_difference_brl === 0 ? (
                                        <span className="text-[11px] font-bold text-amber-600">
                                          Empate
                                        </span>
                                      ) : (
                                        <span className="text-[11px] font-bold text-emerald-600">
                                          -R$ {Math.abs(comp.price_difference_brl).toFixed(2)} ({comp.price_difference_pct}%)
                                        </span>
                                      )}
                                    </div>

                                    {/* Logística */}
                                    <div className="w-[12%]">
                                      {renderShippingBadge(comp.shipping_type)}
                                    </div>

                                    {/* Reputação */}
                                    <div className="w-[12%]">
                                      {renderReputationBadge(comp.seller_reputation)}
                                    </div>

                                    {/* Selo Promocional */}
                                    <div className="w-[10%]">
                                      {comp.promo_badge ? (
                                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                                          {comp.promo_badge}
                                        </span>
                                      ) : (
                                        <span className="text-slate-400 text-[10px]">—</span>
                                      )}
                                    </div>

                                    {/* Ações Concorrente (Link Externo e Excluir) */}
                                    <div className="w-[8%] flex items-center justify-end space-x-1">
                                      <a
                                        href={comp.permalink}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-slate-500 hover:text-slate-900 inline-flex p-1 rounded hover:bg-slate-100 transition-colors"
                                        title="Abrir anúncio concorrente no marketplace"
                                      >
                                        <ExternalLink className="w-3.5 h-3.5" />
                                      </a>
                                      <button
                                        onClick={() => {
                                          if (confirm(`Deseja remover o concorrente "${comp.seller_name} - ${comp.title.slice(0, 30)}..." do monitoramento?`)) {
                                            onDeleteCompetitor && onDeleteCompetitor(group.my_listing.id, comp.id);
                                          }
                                        }}
                                        className="text-slate-400 hover:text-red-600 inline-flex p-1 rounded hover:bg-red-50 transition-colors"
                                        title="Remover este concorrente do monitoramento"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

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
