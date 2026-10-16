"use client";

import React, { useState } from "react";
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
  ShoppingBag,
  TrendingUp,
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

interface ListingsTableProps {
  items: MyListingItem[];
}

export function MyListingsTable({ items }: ListingsTableProps) {
  // Por padrão, deixamos os anúncios com variações já expandidos ou expansíveis com 1 clique
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    items.forEach((item) => {
      // Deixa expandido se tiver variações para visualização idêntica à do Mercado Livre
      if (item.variations && item.variations.length > 0) {
        initial[item.id] = true;
      }
    });
    return initial;
  });

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const toggleExpand = (id: string) => {
    setExpandedRows((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const filteredItems = items.filter((item) => {
    const matchesSearch =
      searchTerm === "" ||
      item.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.external_id.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = statusFilter === "all" || item.status === statusFilter;

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
      {/* BARRA DE FILTRO E PESQUISA RÁPIDA (PARA CONTAS COM CENTENAS/MILHARES DE ANÚNCIOS) */}
      <div className="p-3 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 text-xs">
        <div className="relative flex-1 max-w-md">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar por Título, SKU ou ID do anúncio (MLB)..."
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
            <option value="all">Todos os Status ({items.length})</option>
            <option value="active">Apenas Ativos</option>
            <option value="paused">Pausados</option>
          </select>

          <button
            type="button"
            onClick={() => {
              const allExpanded: Record<string, boolean> = {};
              const anyCollapsed = items.some((i) => i.variations && i.variations.length > 0 && !expandedRows[i.id]);
              items.forEach((i) => {
                if (i.variations && i.variations.length > 0) {
                  allExpanded[i.id] = anyCollapsed;
                }
              });
              setExpandedRows(allExpanded);
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
              <th className="py-2.5 px-3 min-w-[320px]">Produto / Título</th>
              <th className="py-2.5 px-3 text-left">Modalidade & Opções</th>
              <th className="py-2.5 px-3 text-center">Vendas</th>
              <th className="py-2.5 px-3 text-right">Preço de Custo</th>
              <th className="py-2.5 px-3 text-right">Preço de Venda</th>
              <th className="py-2.5 px-3 text-right">Margem Bruta</th>
              <th className="py-2.5 px-3 text-center">Logística</th>
              <th className="py-2.5 px-3 text-center">Status</th>
              <th className="py-2.5 px-3 text-center min-w-[140px]">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredItems.map((item) => {
              const hasVariations = Array.isArray(item.variations) && item.variations.length > 0;
              const isExpanded = !!expandedRows[item.id];
              const marginPct =
                item.price > 0 && item.cost > 0
                  ? (((item.price - item.cost) / item.price) * 100).toFixed(1)
                  : null;

              const isPremium = item.listing_type?.includes("gold_pro") || item.listing_type?.includes("premium");

              return (
                <React.Fragment key={item.id}>
                  {/* ANÚNCIO PAI / PRINCIPAL (ESTILO MERCADO LIVRE DA IMAGEM) */}
                  <tr
                    className={`transition-colors ${
                      hasVariations
                        ? isExpanded
                          ? "bg-sky-50/20 border-b-0"
                          : "hover:bg-slate-50"
                        : "hover:bg-slate-50"
                    }`}
                  >
                    {/* Botão de expansão */}
                    <td className="py-3 px-2 text-center align-top">
                      {hasVariations ? (
                        <button
                          type="button"
                          onClick={() => toggleExpand(item.id)}
                          className="p-1 text-slate-400 hover:text-sky-700 hover:bg-sky-100/50 rounded transition-colors"
                          title={isExpanded ? "Recolher opções e variações" : "Expandir opções e variações"}
                        >
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4 text-sky-600" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-slate-500" />
                          )}
                        </button>
                      ) : null}
                    </td>

                    {/* Bloco de Informações do Produto: Foto, Título, ID e Estoque */}
                    <td className="py-3 px-3 align-top">
                      <div className="flex items-start space-x-3">
                        <div className="w-12 h-12 rounded border border-slate-200 bg-white shrink-0 flex items-center justify-center overflow-hidden shadow-2xs">
                          {item.thumbnail ? (
                            <img src={item.thumbnail} alt={item.title} className="w-full h-full object-cover" />
                          ) : (
                            <Tag className="w-5 h-5 text-slate-400" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="font-bold text-slate-900 text-xs line-clamp-2 leading-snug">
                            {item.title}
                          </div>
                          <div className="text-[11px] text-slate-500 flex flex-wrap items-center gap-1.5 mt-1">
                            <span className="text-slate-400">#{item.external_id}</span>
                            <span>•</span>
                            <span>
                              SKU: <code className="text-slate-800 font-semibold">{item.sku}</code>
                            </span>
                            {item.available_quantity !== undefined && (
                              <>
                                <span>•</span>
                                <span className="font-medium text-slate-700">
                                  Estoque: <strong>{item.available_quantity} un.</strong>
                                </span>
                              </>
                            )}
                          </div>
                          {hasVariations && (
                            <div className="mt-1 text-[11px] text-sky-700 font-semibold flex items-center gap-1">
                              <Layers className="w-3.5 h-3.5" />
                              <span>{item.variations?.length} variações vinculadas a este produto</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* MODALIDADE & OPÇÕES DE VENDA (CLÁSSICO E PREMIUM - IGUAL IMAGEM DO ML) */}
                    <td className="py-3 px-3 align-top text-left">
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-tight ${
                              isPremium
                                ? "bg-amber-100 text-amber-900 border border-amber-300"
                                : "bg-slate-100 text-slate-800 border border-slate-200"
                            }`}
                          >
                            {isPremium ? "Premium (Sem Juros)" : "Clássico"}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-500 leading-tight">
                          {item.shipping === "ml_full" ? (
                            <span className="text-emerald-700 font-semibold">Envio FULL no mesmo dia</span>
                          ) : (
                            <span>Frete padrão por conta</span>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* TOTAL DE VENDAS */}
                    <td className="py-3 px-3 align-top text-center">
                      {item.sold_quantity && item.sold_quantity > 0 ? (
                        <div className="inline-flex items-center gap-1 font-bold text-slate-900 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full text-[11px]">
                          <Flame className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                          <span>+{item.sold_quantity} vendidos</span>
                        </div>
                      ) : (
                        <span className="text-slate-400 text-[11px]">0 vendas</span>
                      )}
                    </td>

                    {/* PREÇO DE CUSTO */}
                    <td className="py-3 px-3 align-top text-right text-slate-600 font-medium">
                      R$ {item.cost ? item.cost.toFixed(2) : "0.00"}
                    </td>

                    {/* PREÇO DE VENDA (NORMAL RISCADO + PROMOCIONAL) */}
                    <td className="py-3 px-3 align-top text-right">
                      <MarketplacePrice
                        currentPrice={item.price}
                        originalPrice={item.original_price}
                        align="right"
                        size="md"
                        showInstallments={false}
                      />
                    </td>

                    {/* MARGEM BRUTA */}
                    <td className="py-3 px-3 align-top text-right">
                      {marginPct ? (
                        <span className="font-semibold text-emerald-600 text-[11px]">{marginPct}%</span>
                      ) : (
                        <span className="text-slate-400 text-[11px]">-</span>
                      )}
                    </td>

                    {/* LOGÍSTICA */}
                    <td className="py-3 px-3 align-top text-center">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                          item.shipping === "ml_full"
                            ? "bg-[#FFE600] text-slate-950 shadow-2xs"
                            : item.shipping === "ml_flex"
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {item.shipping === "ml_full"
                          ? "⚡ FULL"
                          : item.shipping === "ml_flex"
                          ? "FLEX"
                          : item.shipping === "ml_coleta"
                          ? "Coleta"
                          : "Padrão"}
                      </span>
                    </td>

                    {/* STATUS */}
                    <td className="py-3 px-3 align-top text-center">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Ativo
                      </span>
                    </td>

                    {/* AÇÕES */}
                    <td className="py-3 px-3 align-top text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <Link
                          href={`/inteligencia?q=${encodeURIComponent(item.title)}`}
                          className="px-2 py-1 text-[11px] font-semibold bg-sky-50 text-sky-700 hover:bg-sky-100 border border-sky-200 rounded transition-colors"
                        >
                          Buybox →
                        </Link>
                        {item.permalink && (
                          <a
                            href={item.permalink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1 text-slate-400 hover:text-slate-700"
                            title="Abrir no Mercado Livre"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}
                      </div>
                    </td>
                  </tr>

                  {/* SUB-LINHAS ESTRUTURADAS: VARIAÇÕES FILHAS E OPÇÕES DE VENDA (EXATAMENTE COMO NO MERCADO LIVRE) */}
                  {hasVariations &&
                    isExpanded &&
                    item.variations?.map((v, vIdx) => {
                      return (
                        <tr
                          key={`${item.id}-var-${v.id || vIdx}`}
                          className="bg-slate-50/70 border-l-4 border-l-sky-500 hover:bg-slate-100/60 transition-colors"
                        >
                          <td className="py-2 px-2 text-center text-slate-400">↳</td>
                          <td className="py-2.5 px-3 pl-8">
                            <div className="flex items-center space-x-2.5">
                              <div className="w-8 h-8 rounded border border-slate-200 bg-white flex items-center justify-center overflow-hidden shrink-0">
                                {item.thumbnail ? (
                                  <img src={item.thumbnail} alt={v.name} className="w-full h-full object-cover" />
                                ) : (
                                  <Tag className="w-3.5 h-3.5 text-slate-400" />
                                )}
                              </div>
                              <div>
                                <div className="font-bold text-slate-800 text-xs">{v.name}</div>
                                <div className="text-[10px] text-slate-500 flex items-center gap-2 mt-0.5">
                                  <span>
                                    SKU Variação: <code className="text-slate-700 font-bold">{v.sku || item.sku}</code>
                                  </span>
                                  {v.available_quantity !== undefined && (
                                    <>
                                      <span>•</span>
                                      <span>Estoque: {v.available_quantity} un.</span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* OPÇÃO DE VENDA DA VARIAÇÃO (CLÁSSICO / PREMIUM) */}
                          <td className="py-2.5 px-3 text-left">
                            <span className="text-[10px] font-bold text-slate-600 uppercase bg-white border border-slate-200 px-2 py-0.5 rounded">
                              {isPremium ? "Premium" : "Clássico"}
                            </span>
                          </td>

                          {/* VENDAS DA VARIAÇÃO */}
                          <td className="py-2.5 px-3 text-center text-[10px] text-slate-500">
                            {v.sold_quantity ? `${v.sold_quantity} un.` : "-"}
                          </td>

                          {/* CUSTO */}
                          <td className="py-2.5 px-3 text-right text-slate-400 text-[11px]">
                            R$ {item.cost ? item.cost.toFixed(2) : "0.00"}
                          </td>

                          {/* PREÇO DE VENDA DA VARIAÇÃO (COM SUPORTE A PROMOCIONAL) */}
                          <td className="py-2.5 px-3 text-right">
                            <MarketplacePrice
                              currentPrice={v.price}
                              originalPrice={v.original_price || item.original_price}
                              align="right"
                              size="sm"
                              showInstallments={false}
                            />
                          </td>

                          <td className="py-2.5 px-3 text-right text-[11px] text-slate-400">-</td>

                          <td className="py-2.5 px-3 text-center">
                            <span className="text-[10px] text-slate-600 font-medium">
                              {item.shipping === "ml_full" ? "FULL" : "Padrão"}
                            </span>
                          </td>

                          <td className="py-2.5 px-3 text-center">
                            <span className="text-[10px] text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                              Disponível
                            </span>
                          </td>

                          <td className="py-2.5 px-3 text-center text-[10px] text-slate-400">
                            Variação Ativa
                          </td>
                        </tr>
                      );
                    })}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
