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
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});

  const toggleExpand = (id: string) => {
    setExpandedRows((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  if (!items || items.length === 0) {
    return (
      <div className="py-12 text-center text-slate-400 text-xs">
        Nenhum anúncio cadastrado no sistema ainda. Clique em "Sincronizar Anúncios do ML" acima.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left border-collapse text-xs">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase text-[11px]">
            <th className="py-2.5 px-3 w-8"></th>
            <th className="py-2.5 px-3 min-w-[300px]">Produto / Título</th>
            <th className="py-2.5 px-3 text-center">Tipo de Venda</th>
            <th className="py-2.5 px-3 text-center">Vendas</th>
            <th className="py-2.5 px-3 text-right">Preço de Custo</th>
            <th className="py-2.5 px-3 text-right">Preço de Venda</th>
            <th className="py-2.5 px-3 text-right">Margem Bruta</th>
            <th className="py-2.5 px-3 text-center">Logística</th>
            <th className="py-2.5 px-3 text-center">Status</th>
            <th className="py-2.5 px-3 text-center min-w-[150px]">Ações</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {items.map((item) => {
            const hasVariations = Array.isArray(item.variations) && item.variations.length > 0;
            const isExpanded = !!expandedRows[item.id];
            const marginPct =
              item.price > 0 && item.cost > 0
                ? (((item.price - item.cost) / item.price) * 100).toFixed(1)
                : null;

            const isPremium = item.listing_type?.includes("gold_pro") || item.listing_type?.includes("premium");

            return (
              <React.Fragment key={item.id}>
                {/* LINHA PRINCIPAL DO ANÚNCIO (PADRÃO MERCADO LIVRE) */}
                <tr className={`hover:bg-slate-50/80 transition-colors ${isExpanded ? "bg-slate-50/50" : ""}`}>
                  <td className="py-2.5 px-2 text-center">
                    {hasVariations ? (
                      <button
                        type="button"
                        onClick={() => toggleExpand(item.id)}
                        className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded transition-colors"
                        title={isExpanded ? "Recolher variações" : "Expandir variações deste anúncio"}
                      >
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4 text-sky-600" />
                        ) : (
                          <ChevronRight className="w-4 h-4" />
                        )}
                      </button>
                    ) : null}
                  </td>
                  <td className="py-2.5 px-3">
                    <div className="flex items-center space-x-2.5">
                      <div className="w-10 h-10 rounded border border-slate-200 bg-slate-50 shrink-0 flex items-center justify-center overflow-hidden relative">
                        {item.thumbnail ? (
                          <img src={item.thumbnail} alt={item.title} className="w-full h-full object-cover" />
                        ) : (
                          <Tag className="w-4 h-4 text-slate-400" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold text-slate-900 line-clamp-1 flex items-center gap-1.5" title={item.title}>
                          <span>{item.title}</span>
                          {hasVariations && (
                            <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded font-medium shrink-0 border border-slate-200">
                              {item.variations?.length} variações
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 flex flex-wrap items-center gap-2 mt-0.5">
                          <span>
                            SKU: <code className="text-slate-800 font-bold">{item.sku}</code>
                          </span>
                          <span>•</span>
                          <span>
                            ID: <code className="text-slate-800">{item.external_id}</code>
                          </span>
                          {item.available_quantity !== undefined && (
                            <>
                              <span>•</span>
                              <span className="text-slate-600">Estoque: {item.available_quantity} un.</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* TIPO DE VENDA (CLÁSSICO / PREMIUM) */}
                  <td className="py-2.5 px-3 text-center">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${
                        isPremium
                          ? "bg-amber-100/70 text-amber-900 border border-amber-300"
                          : "bg-slate-100 text-slate-700 border border-slate-200"
                      }`}
                    >
                      {isPremium ? (
                        <>
                          <Sparkles className="w-3 h-3 text-amber-600" />
                          <span>Premium</span>
                        </>
                      ) : (
                        <span>Clássico</span>
                      )}
                    </span>
                  </td>

                  {/* NÚMERO DE VENDAS */}
                  <td className="py-2.5 px-3 text-center">
                    {item.sold_quantity && item.sold_quantity > 0 ? (
                      <span className="inline-flex items-center gap-1 font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded-full text-[11px]">
                        <Flame className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                        <span>+{item.sold_quantity} vendidos</span>
                      </span>
                    ) : (
                      <span className="text-slate-400 text-[11px]">0 vendas</span>
                    )}
                  </td>

                  {/* PREÇO DE CUSTO */}
                  <td className="py-2.5 px-3 text-right text-slate-600 font-medium">
                    R$ {item.cost ? item.cost.toFixed(2) : "0.00"}
                  </td>

                  {/* PREÇO DE VENDA (NORMAL RISCADO + PROMOCIONAL) */}
                  <td className="py-2.5 px-3 text-right">
                    <MarketplacePrice
                      currentPrice={item.price}
                      originalPrice={item.original_price}
                      align="right"
                      size="sm"
                      showInstallments={false}
                    />
                  </td>

                  {/* MARGEM BRUTA */}
                  <td className="py-2.5 px-3 text-right">
                    {marginPct ? (
                      <span className="font-semibold text-emerald-600 text-[11px]">{marginPct}%</span>
                    ) : (
                      <span className="text-slate-400 text-[11px]">-</span>
                    )}
                  </td>

                  {/* LOGÍSTICA */}
                  <td className="py-2.5 px-3 text-center">
                    <span
                      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                        item.shipping === "ml_full"
                          ? "bg-[#FFE600] text-slate-950 font-black shadow-2xs"
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
                  <td className="py-2.5 px-3 text-center">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                      <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Ativo
                    </span>
                  </td>

                  {/* AÇÕES */}
                  <td className="py-2.5 px-3 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <Link
                        href={`/inteligencia?q=${encodeURIComponent(item.title)}`}
                        className="px-2.5 py-1 text-[11px] font-semibold bg-sky-50 text-sky-700 hover:bg-sky-100 border border-sky-200 rounded transition-colors"
                      >
                        Monitorar Buybox →
                      </Link>
                      {item.permalink && (
                        <a
                          href={item.permalink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1 text-slate-400 hover:text-slate-700"
                          title="Abrir anúncio oficial no Mercado Livre"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </div>
                  </td>
                </tr>

                {/* SUB-LINHAS: VARIAÇÕES DO ANÚNCIO (ESTILO PAINEL OFICIAL MERCADO LIVRE) */}
                {hasVariations &&
                  isExpanded &&
                  item.variations?.map((v, vIdx) => {
                    return (
                      <tr key={`${item.id}-var-${v.id || vIdx}`} className="bg-slate-50/70 border-l-4 border-l-sky-500 text-slate-700">
                        <td className="py-2 px-2 text-center text-slate-300">↳</td>
                        <td className="py-2 px-3 pl-8">
                          <div className="flex items-center gap-2">
                            <Layers className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                            <div>
                              <span className="font-semibold text-slate-800 text-[11px]">{v.name}</span>
                              <div className="text-[10px] text-slate-500">
                                SKU Variação: <code className="font-bold text-slate-700">{v.sku || item.sku}</code>
                                {v.available_quantity !== undefined && ` • Estoque: ${v.available_quantity} un.`}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="py-2 px-3 text-center">
                          <span className="text-[10px] text-slate-500 font-medium">{isPremium ? "Premium" : "Clássico"}</span>
                        </td>
                        <td className="py-2 px-3 text-center text-[10px] text-slate-500">
                          {v.sold_quantity ? `${v.sold_quantity} un.` : "-"}
                        </td>
                        <td className="py-2 px-3 text-right text-slate-400 text-[11px]">
                          R$ {item.cost ? item.cost.toFixed(2) : "0.00"}
                        </td>
                        <td className="py-2 px-3 text-right">
                          <MarketplacePrice
                            currentPrice={v.price}
                            originalPrice={v.original_price || item.original_price}
                            align="right"
                            size="sm"
                            showInstallments={false}
                          />
                        </td>
                        <td className="py-2 px-3 text-right text-[11px] text-slate-400">-</td>
                        <td className="py-2 px-3 text-center text-[10px] text-slate-500">
                          {item.shipping === "ml_full" ? "FULL" : "Padrão"}
                        </td>
                        <td className="py-2 px-3 text-center">
                          <span className="text-[10px] text-emerald-700 font-medium">Disponível</span>
                        </td>
                        <td className="py-2 px-3 text-center text-[10px] text-slate-400">Variação Ativa</td>
                      </tr>
                    );
                  })}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
