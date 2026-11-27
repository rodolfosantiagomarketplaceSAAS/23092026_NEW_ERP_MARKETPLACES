"use client";

import React, { useState } from "react";
import {
  Barcode,
  Box,
  Layers,
  Package,
  Ruler,
  Scale,
  Tag,
  X,
} from "lucide-react";
import type { ErpListingLink, ErpProductWithSummary } from "@/types/erp-products";

interface ProductDetailDrawerProps {
  open: boolean;
  product: ErpProductWithSummary | null;
  links?: ErpListingLink[];
  quantityMultiplier?: number;
  contextLabel?: string;
  onClose: () => void;
  onEditProduct?: (product: ErpProductWithSummary) => void;
}

function formatBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function ProductDetailDrawer({
  open,
  product,
  links = [],
  quantityMultiplier = 1,
  contextLabel,
  onClose,
  onEditProduct,
}: ProductDetailDrawerProps) {
  const [activePhotoIdx, setActivePhotoIdx] = useState(0);

  if (!open || !product) return null;

  const photos =
    product.photos && product.photos.length > 0
      ? product.photos
      : product.thumbnail_url
      ? [{ url: product.thumbnail_url }]
      : [];
  const activePhoto = photos[activePhotoIdx]?.url || photos[0]?.url || null;
  const mult = Math.max(1, quantityMultiplier);

  const productLinks = links.filter((l) => l.product_id === product.id);
  const typeBadge =
    product.product_type === "kit"
      ? { label: "Kit / Composto", cls: "bg-indigo-100 text-indigo-700" }
      : product.product_type === "ppf_piece"
      ? { label: "Peça PPF (Bobina)", cls: "bg-sky-100 text-sky-700" }
      : { label: "Produto Simples", cls: "bg-slate-100 text-slate-700" };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/50 backdrop-blur-xs">
      <div className="bg-white w-full max-w-xl h-full shadow-2xl border-l border-slate-200 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-start justify-between bg-slate-50/80">
          <div className="min-w-0 pr-4">
            <div className="flex items-center gap-2 mb-1">
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${typeBadge.cls}`}>
                {typeBadge.label}
              </span>
              <span className="text-[11px] font-mono text-slate-500">{product.code}</span>
              <span className="text-[11px] font-mono font-semibold text-slate-700">
                SKU: {product.sku}
              </span>
            </div>
            <h2 className="text-base font-bold text-slate-900 leading-snug">{product.name}</h2>
            {contextLabel && (
              <p className="text-xs text-sky-700 font-medium mt-0.5">{contextLabel}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/70"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Galeria de Fotos */}
          {photos.length > 0 && (
            <div className="space-y-2">
              <div className="w-full h-52 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-center overflow-hidden">
                {activePhoto ? (
                  <img
                    src={activePhoto}
                    alt={product.name}
                    className="max-h-full max-w-full object-contain"
                  />
                ) : null}
              </div>
              {photos.length > 1 && (
                <div className="flex items-center gap-2 overflow-x-auto pb-1">
                  {photos.map((ph, idx) => (
                    <button
                      key={`${ph.url}-${idx}`}
                      type="button"
                      onClick={() => setActivePhotoIdx(idx)}
                      className={`w-12 h-12 rounded-lg border overflow-hidden shrink-0 ${
                        idx === activePhotoIdx
                          ? "border-sky-500 ring-2 ring-sky-200"
                          : "border-slate-200 opacity-70 hover:opacity-100"
                      }`}
                    >
                      <img src={ph.url} alt="" className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* KPIs Financeiros e PPF */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200">
              <span className="text-[10px] font-bold uppercase text-emerald-700">
                Custo {mult > 1 ? `(${mult}x)` : "Unitário"}
              </span>
              <p className="text-lg font-extrabold text-emerald-800">
                {formatBRL(product.computed_total_cost * mult)}
              </p>
              {mult > 1 && (
                <span className="text-[10px] text-emerald-700">
                  {formatBRL(product.computed_total_cost)} / un
                </span>
              )}
            </div>

            <div className="p-3 rounded-xl bg-sky-50 border border-sky-200">
              <span className="text-[10px] font-bold uppercase text-sky-700">
                Consumo Bobina PPF
              </span>
              <p className="text-lg font-extrabold text-sky-800">
                {(product.computed_total_ppf_meters * mult).toFixed(4).replace(".", ",")} m
              </p>
              <span className="text-[10px] text-sky-700">
                {(product.computed_total_ppf_area_m2 * mult).toFixed(4).replace(".", ",")} m² (c/ borda)
              </span>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 col-span-2 sm:col-span-1">
              <span className="text-[10px] font-bold uppercase text-slate-500">
                Peso & Estoque
              </span>
              <p className="text-sm font-bold text-slate-900 mt-0.5">
                {(product.computed_total_weight_grams * mult).toFixed(0)} g
              </p>
              <span className="text-[11px] text-slate-600">
                {product.product_type === "kit"
                  ? "Composto (por itens)"
                  : `Saldo: ${Number(product.stock_quantity || 0)} ${product.unit}`}
              </span>
            </div>
          </div>

          {/* Detalhamento de consumo por Bobina PPF */}
          {product.roll_consumptions.length > 0 && (
            <div className="rounded-xl border border-sky-200 bg-sky-50/40 p-4 space-y-2.5">
              <div className="flex items-center gap-2 text-xs font-bold text-sky-900">
                <Layers className="w-4 h-4 text-sky-600" />
                Detalhamento de Consumo na Bobina PPF
              </div>
              {product.roll_consumptions.map((rc) => {
                const consumedMeters = rc.linear_meters * mult;
                const pctOfRoll = (consumedMeters / Math.max(0.01, rc.roll_length_m)) * 100;
                return (
                  <div
                    key={rc.roll_id}
                    className="p-3 rounded-lg bg-white border border-sky-100 text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-800">
                        {rc.roll_code} — {rc.roll_name}
                      </span>
                      <span className="font-bold text-emerald-700">
                        {formatBRL(rc.cost * mult)}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-600">
                      <span>
                        Consumo: <strong>{consumedMeters.toFixed(4).replace(".", ",")} m</strong> (
                        {(consumedMeters * 100).toFixed(1).replace(".", ",")} cm)
                      </span>
                      <span>
                        Área: <strong>{(rc.area_m2 * mult).toFixed(4).replace(".", ",")} m²</strong>
                      </span>
                      <span>
                        Equiv. bobina {rc.roll_length_m}m:{" "}
                        <strong>{pctOfRoll.toFixed(2).replace(".", ",")}%</strong>
                      </span>
                      <span>
                        Saldo bobina: <strong>{rc.remaining_meters.toFixed(2).replace(".", ",")} m</strong>
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Composição do Kit (BOM) */}
          {product.product_type === "kit" && (
            <div className="rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <Package className="w-4 h-4 text-indigo-600" />
                  Composição do Kit ({product.kit_items?.length || 0} itens)
                </span>
                <span className="text-xs font-bold text-emerald-700">
                  Total: {formatBRL(product.computed_total_cost * mult)}
                </span>
              </div>
              <div className="divide-y divide-slate-100">
                {(product.kit_items ?? []).map((item) => {
                  const comp = item.component;
                  if (!comp) return null;
                  const itemQty = item.quantity * mult;
                  const itemCost = comp.computed_total_cost * itemQty;
                  const itemMeters = comp.computed_total_ppf_meters * itemQty;
                  return (
                    <div key={item.id} className="px-4 py-2.5 flex items-center justify-between gap-3 text-xs">
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-800 truncate">
                          {itemQty}× {comp.name}
                        </p>
                        <div className="flex items-center gap-2 text-[11px] text-slate-500">
                          <span className="font-mono">{comp.sku}</span>
                          {comp.width && comp.height ? (
                            <span>
                              • {comp.width}×{comp.height} {comp.dimension_unit}
                            </span>
                          ) : null}
                          {itemMeters > 0 && (
                            <span className="text-sky-700 font-medium">
                              • {itemMeters.toFixed(4).replace(".", ",")}m PPF
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-bold text-slate-900">{formatBRL(itemCost)}</p>
                        <p className="text-[10px] text-slate-400">
                          {formatBRL(comp.computed_total_cost)} / un
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Ficha Técnica Completa */}
          <div className="grid grid-cols-2 gap-3 text-xs bg-slate-50/70 p-4 rounded-xl border border-slate-200">
            <div className="flex items-center gap-2">
              <Barcode className="w-4 h-4 text-slate-400 shrink-0" />
              <div>
                <span className="text-[10px] text-slate-500 block">EAN / GTIN</span>
                <strong className="font-mono text-slate-800">{product.ean || "—"}</strong>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Tag className="w-4 h-4 text-slate-400 shrink-0" />
              <div>
                <span className="text-[10px] text-slate-500 block">NCM / Categoria</span>
                <strong className="text-slate-800">
                  {product.ncm || "—"} {product.category ? `• ${product.category}` : ""}
                </strong>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Ruler className="w-4 h-4 text-slate-400 shrink-0" />
              <div>
                <span className="text-[10px] text-slate-500 block">Dimensões</span>
                <strong className="text-slate-800">
                  {product.width || product.height
                    ? `${product.width || 0} × ${product.height || 0}${
                        product.depth ? ` × ${product.depth}` : ""
                      } ${product.dimension_unit}`
                    : "—"}
                </strong>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Scale className="w-4 h-4 text-slate-400 shrink-0" />
              <div>
                <span className="text-[10px] text-slate-500 block">Peso / Localização</span>
                <strong className="text-slate-800">
                  {product.computed_total_weight_grams}g
                  {product.storage_location ? ` • ${product.storage_location}` : ""}
                </strong>
              </div>
            </div>
          </div>

          {product.description && (
            <div className="text-xs text-slate-600 bg-white p-3.5 rounded-xl border border-slate-200">
              <span className="text-[10px] font-bold uppercase text-slate-400 block mb-1">
                Descrição do Produto
              </span>
              <p className="whitespace-pre-line leading-relaxed">{product.description}</p>
            </div>
          )}

          {productLinks.length > 0 && (
            <div className="space-y-1.5">
              <span className="text-[11px] font-bold uppercase text-slate-500 flex items-center gap-1.5">
                <Box className="w-3.5 h-3.5" />
                Anúncios Vinculados ({productLinks.length})
              </span>
              <div className="space-y-1.5">
                {productLinks.map((lnk) => (
                  <div
                    key={lnk.id}
                    className="px-3 py-2 rounded-lg border border-slate-200 bg-slate-50/70 flex items-center justify-between text-xs"
                  >
                    <div className="min-w-0 pr-2">
                      <span className="font-mono font-bold text-sky-700">
                        {lnk.external_listing_id}
                      </span>
                      <p className="text-[11px] text-slate-600 truncate">
                        {lnk.listing_title || "Anúncio vinculado"}
                      </p>
                    </div>
                    <span className="text-[11px] font-semibold text-slate-700 shrink-0">
                      {lnk.quantity_per_sale}x / venda
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-100 bg-slate-50/80 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg"
          >
            Fechar
          </button>
          {onEditProduct && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onEditProduct(product);
              }}
              className="px-4 py-2 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-700 rounded-lg"
            >
              Editar Produto / Kit
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
