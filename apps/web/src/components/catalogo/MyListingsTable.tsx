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
} from "lucide-react";
import { MarketplacePrice } from "@/components/bi/MarketplacePrice";

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

// Estrutura agrupada para exibir exatamente como no Mercado Livre
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
  classicListing?: MyListingItem;
  premiumListing?: MyListingItem;
  variationsList: Array<{
    name: string;
    sku?: string | null;
    stock: number;
    classicPrice?: number;
    premiumPrice?: number;
    classicSold?: number;
    premiumSold?: number;
  }>;
  allListings: MyListingItem[];
}

interface ListingsTableProps {
  items: MyListingItem[];
}

// Normaliza o título para agrupar Clássico e Premium do mesmo produto
function getProductGroupKey(item: MyListingItem): string {
  if (item.sku && item.sku !== "SEM-SKU" && item.sku !== "") {
    // Se o SKU terminar com -C ou -P ou similar, agrupa pelo SKU base
    const baseSku = item.sku.replace(/[-_](classico|premium|cl|pr|c|p)$/i, "").trim();
    if (baseSku.length >= 3) return `sku:${baseSku.toLowerCase()}`;
  }
  // Agrupa pelo título limpo (removendo variações de clássico/premium)
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

  // Agrupa os anúncios pelo Produto Real (juntando Clássico e Premium em 1 único bloco pai)
  const groupedProducts = useMemo(() => {
    const map = new Map<string, GroupedProduct>();

    items.forEach((item) => {
      const key = getProductGroupKey(item);
      const isPrem = item.listing_type?.includes("gold_pro") || item.listing_type?.includes("premium") || item.title.toLowerCase().includes("premium");

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
          variationsList: [],
          allListings: [],
        };
        map.set(key, group);
      }

      group.allListings.push(item);
      group.totalStock += item.available_quantity || 0;
      group.totalSold += item.sold_quantity || 0;
      group.minPrice = Math.min(group.minPrice, item.price);
      group.maxPrice = Math.max(group.maxPrice, item.price);

      if (isPrem) {
        group.premiumListing = item;
      } else {
        group.classicListing = item;
      }

      // Processar variações filhas
      if (Array.isArray(item.variations) && item.variations.length > 0) {
        item.variations.forEach((v) => {
          let existingVar = group?.variationsList.find((ev) => ev.name.toLowerCase() === v.name.toLowerCase());
          if (!existingVar) {
            existingVar = {
              name: v.name,
              sku: v.sku || item.sku,
              stock: v.available_quantity || 0,
            };
            group?.variationsList.push(existingVar);
          }
          if (isPrem) {
            existingVar.premiumPrice = v.price;
            existingVar.premiumSold = v.sold_quantity;
          } else {
            existingVar.classicPrice = v.price;
            existingVar.classicSold = v.sold_quantity;
          }
        });
      }
    });

    map.forEach((g) => {
      g.hasBothChannels = !!(g.classicListing && g.premiumListing);
    });

    return Array.from(map.values());
  }, [items]);

  // Estado de expansão (por padrão aberto para visualização rica como no ML)
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
              const hasSubRows = group.variationsList.length > 0 || group.hasBothChannels;

              return (
                <React.Fragment key={group.groupKey}>
                  {/* LINHA PAI: PRODUTO PRINCIPAL (EXATAMENTE COMO NO PAINEL DO MERCADO LIVRE) */}
                  <tr className="bg-white hover:bg-slate-50/70 border-t border-slate-200 transition-colors">
                    {/* Botão de Expansão */}
                    <td className="py-3 px-2 text-center align-top">
                      {hasSubRows ? (
                        <button
                          type="button"
                          onClick={() => toggleGroup(group.groupKey)}
                          className="p-1 text-slate-400 hover:text-sky-700 hover:bg-sky-50 rounded transition-colors"
                          title={isExpanded ? "Recolher opções" : "Expandir opções e variações"}
                        >
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4 text-sky-600" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-slate-500" />
                          )}
                        </button>
                      ) : null}
                    </td>

                    {/* Foto, Título Pai, Estoque Total */}
                    <td className="py-3 px-3 align-top">
                      <div className="flex items-start space-x-3">
                        <div className="w-12 h-12 rounded border border-slate-200 bg-white shrink-0 flex items-center justify-center overflow-hidden shadow-2xs">
                          {group.thumbnail ? (
                            <img src={group.thumbnail} alt={group.title} className="w-full h-full object-cover" />
                          ) : (
                            <Tag className="w-5 h-5 text-slate-400" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="font-bold text-slate-900 text-xs line-clamp-2 leading-snug">
                            {group.title}
                          </div>
                          <div className="text-[11px] text-slate-500 flex flex-wrap items-center gap-1.5 mt-1">
                            {group.allListings.map((l, lIdx) => (
                              <span key={l.id} className="text-slate-400 font-mono text-[10px]">
                                #{l.external_id}
                                {lIdx < group.allListings.length - 1 ? " • " : ""}
                              </span>
                            ))}
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
                    </td>

                    {/* Faixa de Preço do Produto */}
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

                    {/* Modalidades presentes no anúncio pai */}
                    <td className="py-3 px-3 align-top">
                      <span className="font-bold text-slate-800 text-[11px]">
                        {group.hasBothChannels
                          ? "Clássico e Premium"
                          : group.premiumListing
                          ? "Premium"
                          : "Clássico"}
                      </span>
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

                  {/* SUB-LINHAS ESTRUTURADAS (VARIAÇÕES ESPECÍFICAS: BRILHO, FOSCO, ETC) */}
                  {isExpanded &&
                    group.variationsList.map((v, vIdx) => {
                      return (
                        <React.Fragment key={`${group.groupKey}-v-${vIdx}`}>
                          {/* Opção Premium da Variação */}
                          {v.premiumPrice !== undefined && (
                            <tr className="bg-slate-50/70 border-l-4 border-l-amber-500 hover:bg-slate-100/60 transition-colors">
                              <td className="py-2 px-2 text-center text-slate-400">↳</td>
                              <td className="py-2.5 px-3 pl-8">
                                <div className="font-bold text-slate-800 text-xs">{v.name}</div>
                                <div className="text-[10px] text-slate-500 flex items-center gap-2 mt-0.5">
                                  <span>
                                    SKU: <code className="font-bold text-slate-700">{v.sku || group.sku}</code>
                                  </span>
                                  <span>•</span>
                                  <span>Estoque: {v.stock} un.</span>
                                </div>
                              </td>
                              <td className="py-2.5 px-3 font-semibold text-slate-900 text-xs">
                                R$ {v.premiumPrice.toFixed(2).replace(".", ",")}
                              </td>
                              <td className="py-2.5 px-3">
                                <span className="text-[10px] font-bold text-amber-900 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded">
                                  Premium (Sem Juros)
                                </span>
                              </td>
                              <td className="py-2.5 px-3 text-center text-[11px] text-slate-600">
                                {v.premiumSold ? `${v.premiumSold} un.` : "-"}
                              </td>
                              <td className="py-2.5 px-3 text-center text-[10px] text-slate-600 font-medium">FULL</td>
                              <td className="py-2.5 px-3 text-center">
                                <span className="text-[10px] text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                                  Disponível
                                </span>
                              </td>
                              <td className="py-2.5 px-3 text-center text-[10px] text-slate-400">Variação Ativa</td>
                            </tr>
                          )}

                          {/* Opção Clássica da Variação */}
                          {v.classicPrice !== undefined && (
                            <tr className="bg-slate-50/50 border-l-4 border-l-sky-500 hover:bg-slate-100/60 transition-colors">
                              <td className="py-2 px-2 text-center text-slate-400">↳</td>
                              <td className="py-2.5 px-3 pl-8">
                                <div className="font-bold text-slate-800 text-xs">{v.name}</div>
                                <div className="text-[10px] text-slate-500 flex items-center gap-2 mt-0.5">
                                  <span>
                                    SKU: <code className="font-bold text-slate-700">{v.sku || group.sku}</code>
                                  </span>
                                  <span>•</span>
                                  <span>Estoque: {v.stock} un.</span>
                                </div>
                              </td>
                              <td className="py-2.5 px-3 font-semibold text-slate-900 text-xs">
                                R$ {v.classicPrice.toFixed(2).replace(".", ",")}
                              </td>
                              <td className="py-2.5 px-3">
                                <span className="text-[10px] font-bold text-slate-700 bg-white border border-slate-200 px-2 py-0.5 rounded">
                                  Clássico
                                </span>
                              </td>
                              <td className="py-2.5 px-3 text-center text-[11px] text-slate-600">
                                {v.classicSold ? `${v.classicSold} un.` : "-"}
                              </td>
                              <td className="py-2.5 px-3 text-center text-[10px] text-slate-600 font-medium">Padrão</td>
                              <td className="py-2.5 px-3 text-center">
                                <span className="text-[10px] text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                                  Disponível
                                </span>
                              </td>
                              <td className="py-2.5 px-3 text-center text-[10px] text-slate-400">Variação Ativa</td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}

                  {/* CASO NÃO TENHA VARIAÇÕES MAS TENHA ANÚNCIO CLÁSSICO E PREMIUM DO MESMO PRODUTO */}
                  {isExpanded &&
                    group.variationsList.length === 0 &&
                    group.hasBothChannels && (
                      <>
                        {group.premiumListing && (
                          <tr className="bg-slate-50/70 border-l-4 border-l-amber-500 hover:bg-slate-100/60 transition-colors">
                            <td className="py-2 px-2 text-center text-slate-400">↳</td>
                            <td className="py-2.5 px-3 pl-8 text-xs font-semibold text-slate-800">
                              {group.premiumListing.title}
                            </td>
                            <td className="py-2.5 px-3 font-semibold text-slate-900 text-xs">
                              R$ {group.premiumListing.price.toFixed(2).replace(".", ",")}
                            </td>
                            <td className="py-2.5 px-3">
                              <span className="text-[10px] font-bold text-amber-900 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded">
                                Premium (Sem Juros)
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-center text-[11px] text-slate-600">
                              {group.premiumListing.sold_quantity || 0} un.
                            </td>
                            <td className="py-2.5 px-3 text-center text-[10px] text-slate-600 font-medium">
                              {group.premiumListing.shipping === "ml_full" ? "FULL" : "Padrão"}
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              <span className="text-[10px] text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                                Ativo
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-center text-[10px] text-slate-400">Opção Premium</td>
                          </tr>
                        )}
                        {group.classicListing && (
                          <tr className="bg-slate-50/50 border-l-4 border-l-sky-500 hover:bg-slate-100/60 transition-colors">
                            <td className="py-2 px-2 text-center text-slate-400">↳</td>
                            <td className="py-2.5 px-3 pl-8 text-xs font-semibold text-slate-800">
                              {group.classicListing.title}
                            </td>
                            <td className="py-2.5 px-3 font-semibold text-slate-900 text-xs">
                              R$ {group.classicListing.price.toFixed(2).replace(".", ",")}
                            </td>
                            <td className="py-2.5 px-3">
                              <span className="text-[10px] font-bold text-slate-700 bg-white border border-slate-200 px-2 py-0.5 rounded">
                                Clássico
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-center text-[11px] text-slate-600">
                              {group.classicListing.sold_quantity || 0} un.
                            </td>
                            <td className="py-2.5 px-3 text-center text-[10px] text-slate-600 font-medium">
                              {group.classicListing.shipping === "ml_full" ? "FULL" : "Padrão"}
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              <span className="text-[10px] text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                                Ativo
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-center text-[10px] text-slate-400">Opção Clássico</td>
                          </tr>
                        )}
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
