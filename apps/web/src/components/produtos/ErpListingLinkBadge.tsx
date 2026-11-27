"use client";

import React from "react";
import { Layers, Link2, Package } from "lucide-react";
import type { ErpListingLink, ErpProductWithSummary } from "@/types/erp-products";

interface ErpListingLinkBadgeProps {
  link?: ErpListingLink | null;
  saleQuantity?: number;
  onInspect: (product: ErpProductWithSummary, totalQty: number) => void;
  onLinkClick: () => void;
}

function formatBRL(v: number) {
  return `R$ ${v.toFixed(2).replace(".", ",")}`;
}

export function ErpListingLinkBadge({
  link,
  saleQuantity = 1,
  onInspect,
  onLinkClick,
}: ErpListingLinkBadgeProps) {
  if (!link || !link.product) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onLinkClick();
        }}
        className="mt-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold text-slate-500 hover:text-sky-700 bg-slate-50 hover:bg-sky-50 border border-dashed border-slate-300 hover:border-sky-300 transition-colors"
        title="Vincular Produto ou Kit do ERP para controlar custo real e bobina PPF"
      >
        <Link2 className="w-2.5 h-2.5" />
        Vincular Produto/Kit ERP
      </button>
    );
  }

  const prod = link.product;
  const totalQty = Math.max(1, saleQuantity) * Number(link.quantity_per_sale || 1);
  const totalCost = prod.computed_total_cost * totalQty;
  const totalMeters = prod.computed_total_ppf_meters * totalQty;

  return (
    <div className="mt-1 inline-flex flex-wrap items-center gap-1">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onInspect(prod, totalQty);
        }}
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-200 transition-colors text-left"
        title={`Ver ficha técnica e composição de ${prod.name} (SKU: ${prod.sku})`}
      >
        {prod.product_type === "kit" ? (
          <Package className="w-3 h-3 text-indigo-600 shrink-0" />
        ) : (
          <Layers className="w-3 h-3 text-sky-600 shrink-0" />
        )}
        <span className="truncate max-w-[150px]">{prod.sku}</span>
        <span className="text-emerald-700 font-bold">• {formatBRL(totalCost)}</span>
        {totalMeters > 0 && (
          <span className="text-sky-700 font-bold">
            • {totalMeters.toFixed(3).replace(".", ",")}m
          </span>
        )}
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onLinkClick();
        }}
        className="p-0.5 rounded text-slate-400 hover:text-sky-700 hover:bg-sky-50"
        title="Alterar vínculo ou sincronizar custo com vendas"
      >
        <Link2 className="w-3 h-3" />
      </button>
    </div>
  );
}
