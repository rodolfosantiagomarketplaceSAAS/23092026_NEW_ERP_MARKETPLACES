"use client";

import React, { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Layers, Link2, Loader2, RefreshCw, Search, X } from "lucide-react";
import type { ErpListingLink, ErpProductWithSummary } from "@/types/erp-products";

interface LinkListingModalProps {
  open: boolean;
  products: ErpProductWithSummary[];
  initialListing?: {
    platform?: "mercadolivre" | "shopee" | "outros";
    external_listing_id: string;
    listing_sku?: string | null;
    listing_title?: string | null;
    listing_thumbnail?: string | null;
  } | null;
  existingLink?: ErpListingLink | null;
  onClose: () => void;
  onSaved: () => void;
}

function formatBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function LinkListingModal({
  open,
  products,
  initialListing,
  existingLink,
  onClose,
  onSaved,
}: LinkListingModalProps) {
  const [platform, setPlatform] = useState<"mercadolivre" | "shopee" | "outros">("mercadolivre");
  const [externalListingId, setExternalListingId] = useState("");
  const [listingSku, setListingSku] = useState("");
  const [listingTitle, setListingTitle] = useState("");
  const [productId, setProductId] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [quantityPerSale, setQuantityPerSale] = useState("1");
  const [syncNow, setSyncNow] = useState(true);
  const [applyToUneditedOrders, setApplyToUneditedOrders] = useState(false);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setProductSearch("");
    if (existingLink) {
      setPlatform(existingLink.platform);
      setExternalListingId(existingLink.external_listing_id);
      setListingSku(existingLink.listing_sku || "");
      setListingTitle(existingLink.listing_title || "");
      setProductId(existingLink.product_id);
      setQuantityPerSale(String(existingLink.quantity_per_sale || 1));
      setSyncNow(true);
      setApplyToUneditedOrders(false);
      setNotes(existingLink.notes || "");
    } else if (initialListing) {
      setPlatform(initialListing.platform || "mercadolivre");
      setExternalListingId(initialListing.external_listing_id);
      setListingSku(initialListing.listing_sku || "");
      setListingTitle(initialListing.listing_title || "");
      setProductId(products[0]?.id || "");
      setQuantityPerSale("1");
      setSyncNow(true);
      setApplyToUneditedOrders(false);
      setNotes("");
    } else {
      setPlatform("mercadolivre");
      setExternalListingId("");
      setListingSku("");
      setListingTitle("");
      setProductId(products[0]?.id || "");
      setQuantityPerSale("1");
      setSyncNow(true);
      setApplyToUneditedOrders(false);
      setNotes("");
    }
  }, [open, initialListing, existingLink, products]);

  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        p.code.toLowerCase().includes(q)
    );
  }, [products, productSearch]);

  const selectedProduct = useMemo(
    () => products.find((p) => p.id === productId) ?? null,
    [products, productId]
  );

  if (!open) return null;

  const qtyNum = Math.max(0.01, Number(quantityPerSale) || 1);
  const previewCost = selectedProduct ? selectedProduct.computed_total_cost * qtyNum : 0;
  const previewMeters = selectedProduct ? selectedProduct.computed_total_ppf_meters * qtyNum : 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!productId) {
      setError("Selecione um produto ou kit do ERP para vincular.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/erp/listing-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: existingLink?.id,
          platform,
          external_listing_id: externalListingId.trim().toUpperCase(),
          listing_sku: listingSku.trim() || null,
          listing_title: listingTitle.trim() || null,
          listing_thumbnail: initialListing?.listing_thumbnail || existingLink?.listing_thumbnail || null,
          product_id: productId,
          quantity_per_sale: qtyNum,
          auto_sync_cost_template: syncNow,
          sync_now: syncNow,
          apply_to_unedited_orders: syncNow && applyToUneditedOrders,
          notes: notes.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Erro ao salvar vínculo com anúncio.");
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao vincular anúncio.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-xl max-h-[92vh] flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-sky-100 text-sky-700 flex items-center justify-center">
              <Link2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Vincular Produto / Kit ao Anúncio
              </h2>
              <p className="text-xs text-slate-500">
                Conecte o anúncio MLB/Shopee para apurar custo real e consumo de bobina PPF
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/70"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="overflow-y-auto p-6 space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Canal</label>
              <select
                value={platform}
                onChange={(e) => setPlatform(e.target.value as "mercadolivre" | "shopee" | "outros")}
                disabled={Boolean(initialListing)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white disabled:bg-slate-100"
              >
                <option value="mercadolivre">Mercado Livre</option>
                <option value="shopee">Shopee</option>
                <option value="outros">Outros</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Código do Anúncio (MLB / ID) *
              </label>
              <input
                type="text"
                required
                value={externalListingId}
                onChange={(e) => setExternalListingId(e.target.value)}
                readOnly={Boolean(initialListing)}
                placeholder="Ex: MLB3847291823"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg font-mono uppercase read-only:bg-slate-100"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Título do Anúncio (referência)
            </label>
            <input
              type="text"
              value={listingTitle}
              onChange={(e) => setListingTitle(e.target.value)}
              placeholder="Nome do anúncio no marketplace"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-semibold text-slate-700">
              Produto ou Kit do ERP *
            </label>
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                placeholder="Filtrar por nome, SKU ou código..."
                className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-lg"
              />
            </div>
            <select
              required
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-sky-500"
            >
              <option value="">Selecione um produto ou kit...</option>
              {filteredProducts.map((p) => (
                <option key={p.id} value={p.id}>
                  [{p.product_type === "kit" ? "KIT" : p.product_type === "ppf_piece" ? "PPF" : "SIMPLES"}]{" "}
                  {p.sku} — {p.name} ({formatBRL(p.computed_total_cost)})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Qtd. do Produto/Kit por Venda
              </label>
              <input
                type="number"
                step="0.5"
                min="0.1"
                required
                value={quantityPerSale}
                onChange={(e) => setQuantityPerSale(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                SKU no Anúncio (opcional)
              </label>
              <input
                type="text"
                value={listingSku}
                onChange={(e) => setListingSku(e.target.value)}
                placeholder="Ex: KIT-PPF-CIVIC"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg font-mono"
              />
            </div>
          </div>

          {selectedProduct && (
            <div className="p-3.5 rounded-xl bg-sky-50 border border-sky-200 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-sky-900 flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-sky-600" />
                  Resumo por venda deste anúncio
                </span>
                <span className="font-extrabold text-emerald-700 text-sm">
                  {formatBRL(previewCost)}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-700">
                <div>
                  Consumo PPF:{" "}
                  <strong className="text-sky-800">
                    {previewMeters.toFixed(4).replace(".", ",")} m
                  </strong>{" "}
                  ({(previewMeters * 100).toFixed(1).replace(".", ",")} cm)
                </div>
                <div>
                  Material: <strong>{formatBRL(selectedProduct.computed_cost_breakdown.material_cost * qtyNum)}</strong>
                  {selectedProduct.computed_cost_breakdown.accessories_kit_cost > 0 && (
                    <>
                      {" "}• Acess.:{" "}
                      <strong>
                        {formatBRL(selectedProduct.computed_cost_breakdown.accessories_kit_cost * qtyNum)}
                      </strong>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Opções de integração com Gestão de Vendas */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
            <label className="flex items-start gap-2.5 text-xs text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={syncNow}
                onChange={(e) => setSyncNow(e.target.checked)}
                className="mt-0.5 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
              />
              <span>
                <strong className="text-slate-900 block">
                  Sincronizar custo no Template do Anúncio (Gestão de Vendas)
                </strong>
                Atualiza <code>product_cost_templates</code> deste MLB para que novas vendas já entrem com o custo exato do produto/kit.
              </span>
            </label>

            {syncNow && (
              <label className="flex items-start gap-2.5 text-xs text-slate-700 cursor-pointer pl-6">
                <input
                  type="checkbox"
                  checked={applyToUneditedOrders}
                  onChange={(e) => setApplyToUneditedOrders(e.target.checked)}
                  className="mt-0.5 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                />
                <span>
                  Aplicar também em pedidos existentes ainda{" "}
                  <strong>não editados manualmente</strong> (preserva 100% dos pedidos já conferidos).
                </span>
              </label>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving || !productId}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-700 rounded-lg disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : syncNow ? (
                <RefreshCw className="w-3.5 h-3.5" />
              ) : (
                <CheckCircle2 className="w-4 h-4" />
              )}
              {syncNow ? "Vincular e Sincronizar Custo" : "Salvar Vínculo"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
