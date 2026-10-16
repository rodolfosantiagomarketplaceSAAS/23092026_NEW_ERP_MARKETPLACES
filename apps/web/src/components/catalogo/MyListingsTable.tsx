"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import {
  Tag,
  ExternalLink,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Flame,
  Layers,
  Sparkles,
  Search,
  Filter,
  Package,
} from "lucide-react";

export interface MyListingItem {
  id: string;
  sku: string;
  title: string;
  price: number;
  original_price?: number | null;
  cost: number;
  external_id: string;
  platform: string;
  shipping: string;
  listing_type?: string;
  thumbnail: string | null;
  permalink: string;
  status: string;
  sold_quantity?: number;
  available_quantity?: number;
  variations?: Array<{
    id: string | number;
    name: string;
    price: number;
    original_price?: number | null;
    sku?: string | null;
    available_quantity?: number;
    sold_quantity?: number;
    picture_id?: string | null;
  }>;
}

export interface VariationChannelOption {
  externalId: string;
  permalink?: string;
  price: number;
  originalPrice?: number | null;
  sku?: string | null;
  stock: number;
  sold: number;
  shipping: string;
  status: string;
}

export interface GroupedVariation {
  id: string | number;
  name: string;
  sku?: string | null;
  totalStock: number;
  classicOption?: VariationChannelOption;
  premiumOption?: VariationChannelOption;
}

// Estrutura agrupada hierárquica para exibir produtos, variações e canais Clássico e Premium
export interface GroupedProduct {
  groupKey: string;
  title: string;
  sku: string;
  thumbnail: string | null;
  totalStock: number;
  totalSold: number;
  minPrice: number;
  maxPrice: number;
  hasBothChannels: boolean;
  hasClassic: boolean;
  hasPremium: boolean;
  allListings: MyListingItem[];
  classicListings: MyListingItem[];
  premiumListings: MyListingItem[];
  variationsList: GroupedVariation[];
}

interface ListingsTableProps {
  items: MyListingItem[];
}

// Helper para obter URL direta e segura do anúncio no Mercado Livre
function getListingUrl(item?: MyListingItem | null): string | undefined {
  if (!item) return undefined;
  if (item.permalink && item.permalink.startsWith("http")) return item.permalink;
  if (item.external_id) return `https://produto.mercadolivre.com.br/${item.external_id}`;
  return undefined;
}

// Normaliza o agrupador para unir Clássico e Premium do mesmo produto
function getProductGroupKey(item: MyListingItem): string {
  if (item.sku && item.sku !== "SEM-SKU" && item.sku !== "") {
    // Se o SKU possuir sufixo de clássico/premium (-C, -P, etc), agrupa pela raiz
    const baseSku = item.sku.replace(/[-_](classico|premium|cl|pr|c|p)$/i, "").trim();
    if (baseSku.length >= 3) return `sku:${baseSku.toLowerCase()}`;
  }
  // Agrupa pelo título limpo (removendo tags de clássico/premium)
  const cleanTitle = item.title
    .toLowerCase()
    .replace(/\b(clássico|classico|premium|sem juros)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  return `title:${cleanTitle}`;
}

export function MyListingsTable({ items }: ListingsTableProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  // Agrupa os anúncios pelo Produto Mestre (juntando Clássico e Premium e suas respectivas variações)
  const groupedProducts = useMemo(() => {
    const map = new Map<string, GroupedProduct>();

    items.forEach((item) => {
      const key = getProductGroupKey(item);
      const isPrem =
        item.listing_type?.includes("gold_pro") ||
        item.listing_type?.includes("premium") ||
        item.title.toLowerCase().includes("premium");

      let group = map.get(key);
      if (!group) {
        group = {
          groupKey: key,
          title: item.title,
          sku: item.sku,
          thumbnail: item.thumbnail,
          totalStock: 0,
          totalSold: 0,
          minPrice: item.price,
          maxPrice: item.price,
          hasBothChannels: false,
          hasClassic: false,
          hasPremium: false,
          allListings: [],
          classicListings: [],
          premiumListings: [],
          variationsList: [],
        };
        map.set(key, group);
      }

      group.allListings.push(item);
      if (isPrem) {
        group.premiumListings.push(item);
      } else {
        group.classicListings.push(item);
      }

      // Estatísticas consolidadas do produto pai
      group.totalStock += item.available_quantity || 0;
      group.totalSold += item.sold_quantity || 0;
      group.minPrice = Math.min(group.minPrice, item.price);
      group.maxPrice = Math.max(group.maxPrice, item.price);

      if (!group.thumbnail && item.thumbnail) {
        group.thumbnail = item.thumbnail;
      }

      // Processar variações nativas filhas (caso existam no anúncio)
      if (Array.isArray(item.variations) && item.variations.length > 0) {
        item.variations.forEach((v) => {
          const varName = (v.name || `Variação ${v.id}`).trim();
          let existingVar = group?.variationsList.find(
            (ev) => ev.name.toLowerCase() === varName.toLowerCase()
          );

          if (!existingVar) {
            existingVar = {
              id: v.id,
              name: varName,
              sku: v.sku || item.sku,
              totalStock: 0,
            };
            group?.variationsList.push(existingVar);
          }

          existingVar.totalStock += v.available_quantity || 0;

          const channelOpt: VariationChannelOption = {
            externalId: item.external_id,
            permalink: getListingUrl(item),
            price: Number(v.price || item.price || 0),
            originalPrice: v.original_price ? Number(v.original_price) : null,
            sku: v.sku || item.sku,
            stock: Number(v.available_quantity || 0),
            sold: Number(v.sold_quantity || 0),
            shipping: item.shipping,
            status: item.status,
          };

          if (isPrem) {
            existingVar.premiumOption = channelOpt;
          } else {
            existingVar.classicOption = channelOpt;
          }
        });
      }
    });

    map.forEach((g) => {
      g.hasClassic = g.classicListings.length > 0;
      g.hasPremium = g.premiumListings.length > 0;
      g.hasBothChannels = g.hasClassic && g.hasPremium;
    });

    return Array.from(map.values());
  }, [items]);

  // Estado de expansão (por padrão aberto para visualização rica como no painel do ML)
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    groupedProducts.forEach((g) => {
      init[g.groupKey] = true;
    });
    return init;
  });

  const toggleGroup = (key: string) => {
    setExpandedGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const filteredGroups = groupedProducts.filter((group) => {
    const matchesSearch =
      searchTerm === "" ||
      group.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      group.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
      group.allListings.some((l) => l.external_id.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesStatus =
      statusFilter === "all" ||
      group.allListings.some((l) => l.status === statusFilter);

    return matchesSearch && matchesStatus;
  });

  if (!items || items.length === 0) {
    return (
      <div className="py-12 text-center text-slate-400 text-xs">
        Nenhum anúncio cadastrado no sistema ainda. Clique em "Sincronizar Anúncios do ML" acima.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* BARRA SUPERIOR DE PESQUISA E FILTROS */}
      <div className="p-3 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 text-xs">
        <div className="relative flex-1 max-w-md">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar por Título, SKU ou ID MLB..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-white border border-slate-200 rounded pl-8 pr-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-sky-500 placeholder:text-slate-400"
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="text-slate-500 font-medium text-[11px] flex items-center gap-1">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            Filtro:
          </span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-white border border-slate-200 rounded px-2.5 py-1 text-xs text-slate-700 font-medium focus:outline-none"
          >
            <option value="all">Todos os Produtos ({groupedProducts.length})</option>
            <option value="active">Apenas Ativos</option>
            <option value="paused">Pausados</option>
          </select>

          <button
            type="button"
            onClick={() => {
              const allExpanded: Record<string, boolean> = {};
              const anyCollapsed = filteredGroups.some((g) => !expandedGroups[g.groupKey]);
              filteredGroups.forEach((g) => {
                allExpanded[g.groupKey] = anyCollapsed;
              });
              setExpandedGroups(allExpanded);
            }}
            className="px-2.5 py-1 bg-white border border-slate-200 hover:bg-slate-100 rounded text-slate-700 font-medium text-[11px] transition-colors"
          >
            Expandir / Recolher Todos
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase text-[11px]">
              <th className="py-2.5 px-3 w-8"></th>
              <th className="py-2.5 px-3 min-w-[320px]">Anúncio Principal / Produto</th>
              <th className="py-2.5 px-3">Preço</th>
              <th className="py-2.5 px-3">Opção de Venda</th>
              <th className="py-2.5 px-3 text-center">Vendas</th>
              <th className="py-2.5 px-3 text-center">Logística</th>
              <th className="py-2.5 px-3 text-center">Status</th>
              <th className="py-2.5 px-3 text-center min-w-[140px]">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredGroups.map((group) => {
              const isExpanded = !!expandedGroups[group.groupKey];
              const hasVariations = group.variationsList.length > 0;
              const hasMultipleListings = group.allListings.length > 1;
              const hasSubRows = hasVariations || hasMultipleListings || group.hasBothChannels;

              return (
                <React.Fragment key={group.groupKey}>
                  {/* LINHA PAI: PRODUTO PRINCIPAL CONSOLIDADO */}
                  <tr className="bg-white hover:bg-slate-50/70 border-t border-slate-200 transition-colors">
                    {/* Botão de Expansão */}
                    <td className="py-3 px-2 text-center align-top">
                      {hasSubRows ? (
                        <button
                          type="button"
                          onClick={() => toggleGroup(group.groupKey)}
                          className="p-1 text-slate-400 hover:text-sky-700 hover:bg-sky-50 rounded transition-colors"
                          title={isExpanded ? "Recolher variações e opções de venda" : "Expandir variações e opções de venda"}
                        >
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4 text-sky-600" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-slate-500" />
                          )}
                        </button>
                      ) : null}
                    </td>

                    {/* Foto, Título Pai, Lista de MLBs, SKU e Estoque Total */}
                    <td className="py-3 px-3 align-top">
                      {(() => {
                        const mainItem = group.allListings[0];
                        const mainUrl = getListingUrl(mainItem);

                        return (
                          <div className="flex items-start space-x-3">
                            {mainUrl ? (
                              <a
                                href={mainUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="w-12 h-12 rounded border border-slate-200 bg-white shrink-0 flex items-center justify-center overflow-hidden shadow-2xs hover:border-sky-500 hover:shadow-xs transition-all group/thumb"
                                title="Abrir anúncio oficial no Mercado Livre"
                              >
                                {group.thumbnail ? (
                                  <img
                                    src={group.thumbnail}
                                    alt={group.title}
                                    className="w-full h-full object-cover group-hover/thumb:scale-105 transition-transform"
                                  />
                                ) : (
                                  <Tag className="w-5 h-5 text-slate-400" />
                                )}
                              </a>
                            ) : (
                              <div className="w-12 h-12 rounded border border-slate-200 bg-white shrink-0 flex items-center justify-center overflow-hidden shadow-2xs">
                                {group.thumbnail ? (
                                  <img src={group.thumbnail} alt={group.title} className="w-full h-full object-cover" />
                                ) : (
                                  <Tag className="w-5 h-5 text-slate-400" />
                                )}
                              </div>
                            )}

                            <div className="min-w-0 flex-1">
                              {mainUrl ? (
                                <a
                                  href={mainUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="font-bold text-slate-900 text-xs line-clamp-2 leading-snug hover:text-sky-600 hover:underline flex items-start gap-1 group/link"
                                  title="Abrir anúncio oficial no Mercado Livre"
                                >
                                  <span>{group.title}</span>
                                  <ExternalLink className="w-3.5 h-3.5 text-slate-400 group-hover/link:text-sky-600 shrink-0 mt-0.5 opacity-70 group-hover/link:opacity-100 transition-opacity" />
                                </a>
                              ) : (
                                <div className="font-bold text-slate-900 text-xs line-clamp-2 leading-snug">
                                  {group.title}
                                </div>
                              )}

                              <div className="text-[11px] text-slate-500 flex flex-wrap items-center gap-1.5 mt-1">
                                {group.allListings.map((l, lIdx) => {
                                  const itemUrl = getListingUrl(l);
                                  const isLPro = l.listing_type?.includes("gold_pro") || l.listing_type?.includes("premium");
                                  return (
                                    <React.Fragment key={l.id}>
                                      {itemUrl ? (
                                        <a
                                          href={itemUrl}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className={`font-mono text-[10px] inline-flex items-center gap-0.5 hover:underline ${
                                            isLPro
                                              ? "text-amber-700 hover:text-amber-800"
                                              : "text-sky-700 hover:text-sky-800"
                                          }`}
                                          title={`Abrir #${l.external_id} (${isLPro ? "Premium" : "Clássico"}) no Mercado Livre`}
                                        >
                                          <span>#{l.external_id}</span>
                                          <ExternalLink className="w-2.5 h-2.5 opacity-70" />
                                        </a>
                                      ) : (
                                        <span className="text-slate-400 font-mono text-[10px]">
                                          #{l.external_id}
                                        </span>
                                      )}
                                      {lIdx < group.allListings.length - 1 ? (
                                        <span className="text-slate-300">•</span>
                                      ) : null}
                                    </React.Fragment>
                                  );
                                })}
                                <span>•</span>
                                <span>
                                  SKU: <code className="text-slate-800 font-semibold">{group.sku}</code>
                                </span>
                              </div>
                              <div className="text-[11px] font-bold text-slate-700 mt-0.5">
                                Estoque total: {group.totalStock} un.
                              </div>
                            </div>
                          </div>
                        );
                      })()}
                    </td>

                    {/* Faixa de Preço Consolidada */}
                    <td className="py-3 px-3 align-top font-bold text-slate-900 text-xs">
                      {group.minPrice === group.maxPrice ? (
                        <span>R$ {group.minPrice.toFixed(2).replace(".", ",")}</span>
                      ) : (
                        <span>
                          R$ {group.minPrice.toFixed(2).replace(".", ",")} a R${" "}
                          {group.maxPrice.toFixed(2).replace(".", ",")}
                        </span>
                      )}
                    </td>

                    {/* Modalidades de Venda Disponíveis */}
                    <td className="py-3 px-3 align-top">
                      {group.hasBothChannels ? (
                        <span className="inline-flex items-center gap-1 font-bold text-slate-800 text-[11px] bg-slate-100 border border-slate-200 px-2 py-0.5 rounded">
                          Clássico e Premium
                        </span>
                      ) : group.hasPremium ? (
                        <span className="inline-flex items-center gap-1 font-bold text-amber-900 text-[11px] bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
                          Premium
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 font-bold text-sky-900 text-[11px] bg-sky-50 border border-sky-200 px-2 py-0.5 rounded">
                          Clássico
                        </span>
                      )}
                    </td>

                    {/* Vendas Totais */}
                    <td className="py-3 px-3 align-top text-center">
                      {group.totalSold > 0 ? (
                        <div className="inline-flex items-center gap-1 font-bold text-slate-900 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full text-[11px]">
                          <Flame className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                          <span>+{group.totalSold} vendidos</span>
                        </div>
                      ) : (
                        <span className="text-slate-400 text-[11px]">0 vendas</span>
                      )}
                    </td>

                    {/* Logística */}
                    <td className="py-3 px-3 align-top text-center">
                      <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-[#FFE600] text-slate-950">
                        {group.allListings.some((l) => l.shipping === "ml_full") ? "⚡ FULL" : "Padrão"}
                      </span>
                    </td>

                    {/* Status */}
                    <td className="py-3 px-3 align-top text-center">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Ativo
                      </span>
                    </td>

                    {/* Ações */}
                    <td className="py-3 px-3 align-top text-center">
                      <Link
                        href={`/inteligencia?q=${encodeURIComponent(group.title)}`}
                        className="px-2.5 py-1 text-[11px] font-semibold bg-sky-50 text-sky-700 hover:bg-sky-100 border border-sky-200 rounded transition-colors inline-block"
                      >
                        Buybox →
                      </Link>
                    </td>
                  </tr>

                  {/* ========================================================================= */}
                  {/* CASO 1: O PRODUTO POSSUI VARIAÇÕES NATIVAS (Ex: Modelos, Cores, Medidas) */}
                  {/* Cada variação aparece com suas 2 opções de venda (Clássico e Premium)     */}
                  {/* NÃO repete o título na variação!                                         */}
                  {/* ========================================================================= */}
                  {isExpanded &&
                    hasVariations &&
                    group.variationsList.map((v, vIdx) => {
                      return (
                        <React.Fragment key={`${group.groupKey}-var-${vIdx}`}>
                          {/* LINHA DE IDENTIFICAÇÃO DA VARIAÇÃO */}
                          <tr className="bg-slate-100/80 border-l-4 border-l-slate-400 border-t border-slate-200">
                            <td className="py-1.5 px-2 text-center text-slate-400 font-bold">↳</td>
                            <td colSpan={7} className="py-1.5 px-3">
                              <div className="flex items-center gap-2">
                                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-white text-slate-900 font-bold text-xs border border-slate-300 shadow-2xs">
                                  <Layers className="w-3.5 h-3.5 text-slate-600" />
                                  <span>Variação: {v.name}</span>
                                </span>
                                <span className="text-[11px] text-slate-500">
                                  SKU: <code className="font-semibold text-slate-700">{v.sku || group.sku}</code>
                                </span>
                                <span className="text-slate-300">•</span>
                                <span className="text-[11px] font-semibold text-slate-700">
                                  Estoque da Variação: {v.totalStock} un.
                                </span>
                              </div>
                            </td>
                          </tr>

                          {/* OPÇÃO DE VENDA CLÁSSICO DA VARIAÇÃO */}
                          {v.classicOption && (
                            <tr className="bg-slate-50/60 border-l-4 border-l-sky-500 hover:bg-slate-100/70 transition-colors">
                              <td className="py-2 px-2 text-center text-sky-400 text-xs">↳</td>
                              <td className="py-2.5 px-3 pl-8">
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] font-bold text-sky-800 bg-sky-50 border border-sky-300 px-2 py-0.5 rounded">
                                    Opção Clássico
                                  </span>
                                  {v.classicOption.permalink ? (
                                    <a
                                      href={v.classicOption.permalink}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="font-mono text-[11px] font-semibold text-slate-700 hover:text-sky-600 hover:underline inline-flex items-center gap-1"
                                      title="Abrir anúncio oficial Clássico no Mercado Livre"
                                    >
                                      <span>#{v.classicOption.externalId}</span>
                                      <ExternalLink className="w-2.5 h-2.5 text-slate-400" />
                                    </a>
                                  ) : (
                                    <span className="font-mono text-[11px] text-slate-500">
                                      #{v.classicOption.externalId}
                                    </span>
                                  )}
                                  <span className="text-slate-300">•</span>
                                  <span className="text-[10px] text-slate-500">
                                    Estoque: {v.classicOption.stock} un.
                                  </span>
                                </div>
                              </td>
                              <td className="py-2.5 px-3 font-semibold text-slate-900 text-xs">
                                R$ {v.classicOption.price.toFixed(2).replace(".", ",")}
                              </td>
                              <td className="py-2.5 px-3">
                                <span className="text-[10px] font-bold text-slate-700 bg-white border border-slate-200 px-2 py-0.5 rounded">
                                  Clássico
                                </span>
                              </td>
                              <td className="py-2.5 px-3 text-center text-[11px] text-slate-600">
                                {v.classicOption.sold ? `${v.classicOption.sold} un.` : "-"}
                              </td>
                              <td className="py-2.5 px-3 text-center text-[10px] text-slate-600 font-medium">
                                {v.classicOption.shipping === "ml_full" ? "⚡ FULL" : "Padrão"}
                              </td>
                              <td className="py-2.5 px-3 text-center">
                                <span className="text-[10px] text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                                  {v.classicOption.status === "active" ? "Ativo" : "Pausado"}
                                </span>
                              </td>
                              <td className="py-2.5 px-3 text-center">
                                {v.classicOption.permalink && (
                                  <a
                                    href={v.classicOption.permalink}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-[10px] font-semibold text-sky-700 hover:text-sky-900 hover:underline"
                                  >
                                    Abrir no ML ↗
                                  </a>
                                )}
                              </td>
                            </tr>
                          )}

                          {/* OPÇÃO DE VENDA PREMIUM DA VARIAÇÃO */}
                          {v.premiumOption && (
                            <tr className="bg-slate-50/80 border-l-4 border-l-amber-500 hover:bg-slate-100/70 transition-colors">
                              <td className="py-2 px-2 text-center text-amber-500 text-xs">↳</td>
                              <td className="py-2.5 px-3 pl-8">
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] font-bold text-amber-900 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded">
                                    Opção Premium
                                  </span>
                                  {v.premiumOption.permalink ? (
                                    <a
                                      href={v.premiumOption.permalink}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="font-mono text-[11px] font-semibold text-slate-700 hover:text-amber-700 hover:underline inline-flex items-center gap-1"
                                      title="Abrir anúncio oficial Premium no Mercado Livre"
                                    >
                                      <span>#{v.premiumOption.externalId}</span>
                                      <ExternalLink className="w-2.5 h-2.5 text-slate-400" />
                                    </a>
                                  ) : (
                                    <span className="font-mono text-[11px] text-slate-500">
                                      #{v.premiumOption.externalId}
                                    </span>
                                  )}
                                  <span className="text-slate-300">•</span>
                                  <span className="text-[10px] text-slate-500">
                                    Estoque: {v.premiumOption.stock} un.
                                  </span>
                                </div>
                              </td>
                              <td className="py-2.5 px-3 font-semibold text-slate-900 text-xs">
                                R$ {v.premiumOption.price.toFixed(2).replace(".", ",")}
                              </td>
                              <td className="py-2.5 px-3">
                                <span className="text-[10px] font-bold text-amber-900 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded">
                                  Premium (Sem Juros)
                                </span>
                              </td>
                              <td className="py-2.5 px-3 text-center text-[11px] text-slate-600">
                                {v.premiumOption.sold ? `${v.premiumOption.sold} un.` : "-"}
                              </td>
                              <td className="py-2.5 px-3 text-center text-[10px] text-slate-600 font-medium">
                                {v.premiumOption.shipping === "ml_full" ? "⚡ FULL" : "Padrão"}
                              </td>
                              <td className="py-2.5 px-3 text-center">
                                <span className="text-[10px] text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                                  {v.premiumOption.status === "active" ? "Ativo" : "Pausado"}
                                </span>
                              </td>
                              <td className="py-2.5 px-3 text-center">
                                {v.premiumOption.permalink && (
                                  <a
                                    href={v.premiumOption.permalink}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-[10px] font-semibold text-amber-700 hover:text-amber-900 hover:underline"
                                  >
                                    Abrir no ML ↗
                                  </a>
                                )}
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}

                  {/* ========================================================================= */}
                  {/* CASO 2: O PRODUTO NÃO TEM VARIAÇÕES NATIVAS, MAS TEM SUAS OPÇÕES DE VENDA */}
                  {/* (CLÁSSICO E PREMIUM) CADASTRADAS NO MERCADO LIVRE (Ex: Byd Song Plus)      */}
                  {/* NÃO repete o título na sub-linha! Mostra a opção de venda limpa e direta   */}
                  {/* ========================================================================= */}
                  {isExpanded && !hasVariations && hasSubRows && (
                    <>
                      {/* OPÇÃO(ÕES) CLÁSSICO */}
                      {group.classicListings.map((cListing) => {
                        const classicUrl = getListingUrl(cListing);
                        return (
                          <tr
                            key={`classic-${cListing.id}`}
                            className="bg-slate-50/60 border-l-4 border-l-sky-500 hover:bg-slate-100/70 transition-colors"
                          >
                            <td className="py-2 px-2 text-center text-sky-500 text-xs">↳</td>
                            <td className="py-2.5 px-3 pl-8">
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] font-bold text-sky-800 bg-sky-50 border border-sky-300 px-2 py-0.5 rounded">
                                  Opção Clássico
                                </span>
                                {classicUrl ? (
                                  <a
                                    href={classicUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="font-mono text-xs font-semibold text-slate-800 hover:text-sky-700 hover:underline inline-flex items-center gap-1 group/itemlink"
                                    title="Abrir anúncio oficial Clássico no Mercado Livre"
                                  >
                                    <span>#{cListing.external_id}</span>
                                    <ExternalLink className="w-3 h-3 text-slate-400 group-hover/itemlink:text-sky-600" />
                                  </a>
                                ) : (
                                  <span className="font-mono text-xs text-slate-600">
                                    #{cListing.external_id}
                                  </span>
                                )}
                                <span className="text-slate-300">•</span>
                                <span className="text-[11px] text-slate-500">
                                  SKU: <code className="font-bold text-slate-700">{cListing.sku || group.sku}</code>
                                </span>
                                <span className="text-slate-300">•</span>
                                <span className="text-[11px] font-medium text-slate-600">
                                  Estoque: {cListing.available_quantity || 0} un.
                                </span>
                              </div>
                            </td>
                            <td className="py-2.5 px-3 font-semibold text-slate-900 text-xs">
                              R$ {cListing.price.toFixed(2).replace(".", ",")}
                            </td>
                            <td className="py-2.5 px-3">
                              <span className="text-[10px] font-bold text-slate-700 bg-white border border-slate-200 px-2 py-0.5 rounded">
                                Clássico
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-center text-[11px] text-slate-600">
                              {cListing.sold_quantity || 0} un.
                            </td>
                            <td className="py-2.5 px-3 text-center text-[10px] text-slate-600 font-medium">
                              {cListing.shipping === "ml_full" ? "⚡ FULL" : "Padrão"}
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              <span className="text-[10px] text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                                {cListing.status === "active" ? "Ativo" : "Pausado"}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              {classicUrl && (
                                <a
                                  href={classicUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-[10px] font-semibold text-sky-700 hover:text-sky-900 hover:underline"
                                >
                                  Abrir no ML ↗
                                </a>
                              )}
                            </td>
                          </tr>
                        );
                      })}

                      {/* OPÇÃO(ÕES) PREMIUM */}
                      {group.premiumListings.map((pListing) => {
                        const premUrl = getListingUrl(pListing);
                        return (
                          <tr
                            key={`premium-${pListing.id}`}
                            className="bg-slate-50/80 border-l-4 border-l-amber-500 hover:bg-slate-100/70 transition-colors"
                          >
                            <td className="py-2 px-2 text-center text-amber-500 text-xs">↳</td>
                            <td className="py-2.5 px-3 pl-8">
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] font-bold text-amber-900 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded">
                                  Opção Premium
                                </span>
                                {premUrl ? (
                                  <a
                                    href={premUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="font-mono text-xs font-semibold text-slate-800 hover:text-amber-700 hover:underline inline-flex items-center gap-1 group/itemlink"
                                    title="Abrir anúncio oficial Premium no Mercado Livre"
                                  >
                                    <span>#{pListing.external_id}</span>
                                    <ExternalLink className="w-3 h-3 text-slate-400 group-hover/itemlink:text-amber-600" />
                                  </a>
                                ) : (
                                  <span className="font-mono text-xs text-slate-600">
                                    #{pListing.external_id}
                                  </span>
                                )}
                                <span className="text-slate-300">•</span>
                                <span className="text-[11px] text-slate-500">
                                  SKU: <code className="font-bold text-slate-700">{pListing.sku || group.sku}</code>
                                </span>
                                <span className="text-slate-300">•</span>
                                <span className="text-[11px] font-medium text-slate-600">
                                  Estoque: {pListing.available_quantity || 0} un.
                                </span>
                              </div>
                            </td>
                            <td className="py-2.5 px-3 font-semibold text-slate-900 text-xs">
                              R$ {pListing.price.toFixed(2).replace(".", ",")}
                            </td>
                            <td className="py-2.5 px-3">
                              <span className="text-[10px] font-bold text-amber-900 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded">
                                Premium (Sem Juros)
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-center text-[11px] text-slate-600">
                              {pListing.sold_quantity || 0} un.
                            </td>
                            <td className="py-2.5 px-3 text-center text-[10px] text-slate-600 font-medium">
                              {pListing.shipping === "ml_full" ? "⚡ FULL" : "Padrão"}
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              <span className="text-[10px] text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                                {pListing.status === "active" ? "Ativo" : "Pausado"}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              {premUrl && (
                                <a
                                  href={premUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-[10px] font-semibold text-amber-700 hover:text-amber-900 hover:underline"
                                >
                                  Abrir no ML ↗
                                </a>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
