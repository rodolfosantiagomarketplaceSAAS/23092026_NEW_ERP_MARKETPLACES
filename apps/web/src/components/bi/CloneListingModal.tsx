"use client";

import React, { useState } from "react";
import { X, Sparkles, CheckCircle2, ArrowRight, DollarSign, Package, AlertCircle } from "lucide-react";
import type { CompetitorStoreListing } from "@crm/types";
import Link from "next/link";

interface CloneListingModalProps {
  listing: CompetitorStoreListing | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (message: string) => void;
}

export function CloneListingModal({
  listing,
  isOpen,
  onClose,
  onSuccess,
}: CloneListingModalProps) {
  if (!isOpen || !listing) return null;

  // Auto-generate SKU
  const defaultSku = listing.title
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, "")
    .split(/\s+/)
    .slice(0, 3)
    .join("-")
    .concat(`-${Math.floor(100 + Math.random() * 900)}`);

  const [title, setTitle] = useState(listing.title);
  const [sku, setSku] = useState(defaultSku);
  const [suggestedPrice, setSuggestedPrice] = useState(
    listing.current_price ? Number((listing.current_price * 0.98).toFixed(2)) : 0
  );
  const [costPrice, setCostPrice] = useState(
    listing.current_price ? Number((listing.current_price * 0.45).toFixed(2)) : 0
  );
  const [stockQuantity, setStockQuantity] = useState(25);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [createdResult, setCreatedResult] = useState<any | null>(null);

  // Estimativa de tarifa e margem
  const estimatedFee = Number((suggestedPrice * 0.165).toFixed(2));
  const estimatedProfit = Number((suggestedPrice - costPrice - estimatedFee).toFixed(2));
  const profitMarginPct = suggestedPrice > 0 ? Number(((estimatedProfit / suggestedPrice) * 100).toFixed(1)) : 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!title.trim()) {
      setErrorMsg("O título do anúncio é obrigatório.");
      return;
    }
    if (!sku.trim()) {
      setErrorMsg("O SKU é obrigatório.");
      return;
    }
    if (suggestedPrice <= 0) {
      setErrorMsg("Informe um preço de venda válido.");
      return;
    }

    setSubmitting(true);

    try {
      const res = await fetch("/api/competitors/clone-to-catalog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          competitor_listing_id: listing.id,
          external_id: listing.external_id,
          title: title.trim(),
          suggested_price: suggestedPrice,
          cost_price: costPrice,
          sku: sku.trim().toUpperCase(),
          platform: listing.platform || "mercadolivre",
          thumbnail_url: listing.thumbnail_url || null,
          permalink: listing.permalink,
          shipping_type: listing.is_full ? "ml_full" : "padrao",
          listing_type: "gold_special",
          available_quantity: stockQuantity,
        }),
      });

      const json = await res.json();

      if (res.ok && json.success) {
        setCreatedResult(json.data);
        onSuccess(`✅ Anúncio "${sku.toUpperCase()}" criado com sucesso no seu Catálogo!`);
      } else {
        setErrorMsg(json.error || "Não foi possível criar o anúncio.");
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err?.message || "Erro de comunicação ao criar anúncio.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header do Modal */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-sm sm:text-base">
                Criar Meu Anúncio a partir do Concorrente
              </h3>
              <p className="text-xs text-slate-500">
                Otimize os dados do melhor anúncio concorrente e publique diretamente no seu catálogo.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-200/60 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {createdResult ? (
          /* Tela de Sucesso */
          <div className="p-8 text-center space-y-4">
            <div className="w-14 h-14 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto border border-emerald-200">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h4 className="text-lg font-bold text-slate-900">Anúncio Criado com Sucesso!</h4>
            <p className="text-xs text-slate-600 max-w-md mx-auto">
              O produto <strong>{createdResult.title}</strong> (SKU: <strong>{createdResult.sku}</strong>) foi adicionado ao seu catálogo ativo de produtos.
            </p>
            <div className="flex justify-center gap-3 pt-2">
              <button
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
              >
                Fechar
              </button>
              <Link
                href="/catalogo"
                className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors flex items-center gap-1.5"
              >
                <span>Ver no Meu Catálogo</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        ) : (
          /* Formulário de Criação */
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4">
            {errorMsg && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Raio-X do Anúncio Base do Concorrente */}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center gap-3">
              {listing.thumbnail_url ? (
                <img
                  src={listing.thumbnail_url}
                  alt={listing.title}
                  className="w-14 h-14 rounded-lg object-contain bg-white border border-slate-200 shrink-0"
                />
              ) : (
                <div className="w-14 h-14 rounded-lg bg-slate-200 flex items-center justify-center text-slate-400 shrink-0">
                  <Package className="w-6 h-6" />
                </div>
              )}
              <div className="min-w-0 flex-1 text-xs">
                <div className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider flex items-center gap-1.5">
                  <span>Concorrente: {listing.store_name || "Loja ML"}</span>
                  <span>•</span>
                  <span className="text-emerald-700 font-bold">
                    {listing.sales_count_approx.toLocaleString("pt-BR")} vendas
                  </span>
                </div>
                <div className="font-semibold text-slate-800 truncate mt-0.5" title={listing.title}>
                  {listing.title}
                </div>
                <div className="text-slate-600 mt-0.5">
                  Preço do concorrente:{" "}
                  <strong className="text-slate-900">
                    R$ {listing.current_price.toFixed(2).replace(".", ",")}
                  </strong>
                </div>
              </div>
            </div>

            {/* Título do Anúncio Próprio */}
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-xs font-bold text-slate-700">Título do Meu Anúncio</label>
                <span
                  className={`text-[10px] font-medium ${
                    title.length > 60 ? "text-amber-600 font-bold" : "text-slate-400"
                  }`}
                >
                  {title.length}/60 caracteres (Recomendado ML)
                </span>
              </div>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Título persuasivo para seu anúncio no Mercado Livre..."
                className="w-full text-xs px-3 py-2 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
                required
              />
            </div>

            {/* Grid SKU & Estoque */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  SKU Interno (Código do Produto)
                </label>
                <input
                  type="text"
                  value={sku}
                  onChange={(e) => setSku(e.target.value.toUpperCase())}
                  placeholder="EX: PPF-PRO-01"
                  className="w-full text-xs font-mono uppercase px-3 py-2 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Estoque Inicial Disponível
                </label>
                <input
                  type="number"
                  min="1"
                  value={stockQuantity}
                  onChange={(e) => setStockQuantity(parseInt(e.target.value, 10) || 1)}
                  className="w-full text-xs px-3 py-2 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
                  required
                />
              </div>
            </div>

            {/* Preços e Unit Economics */}
            <div className="p-3.5 bg-indigo-50/50 border border-indigo-100 rounded-xl space-y-3">
              <div className="text-xs font-bold text-indigo-900 flex items-center gap-1.5">
                <DollarSign className="w-4 h-4 text-indigo-600" />
                <span>Precificação & Margem Líquida Estimada</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    Meu Preço de Venda (R$)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="1"
                    value={suggestedPrice}
                    onChange={(e) => setSuggestedPrice(parseFloat(e.target.value) || 0)}
                    className="w-full text-xs font-bold text-slate-900 px-3 py-2 border border-slate-300 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
                    required
                  />
                  <div className="text-[10px] text-slate-500 mt-1">
                    Preço concorrente: R$ {listing.current_price.toFixed(2).replace(".", ",")}
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    Custo da Mercadoria / CMV (R$)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={costPrice}
                    onChange={(e) => setCostPrice(parseFloat(e.target.value) || 0)}
                    className="w-full text-xs px-3 py-2 border border-slate-300 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
                  />
                  <div className="text-[10px] text-slate-500 mt-1">Custo estimado de compra ou fabricação</div>
                </div>
              </div>

              {/* Resultado da Margem */}
              <div className="pt-2 border-t border-indigo-100 flex items-center justify-between text-xs">
                <span className="text-slate-600">
                  Tarifa estimada ML (~16,5%): <strong>R$ {estimatedFee.toFixed(2).replace(".", ",")}</strong>
                </span>
                <span className="font-bold text-emerald-700">
                  Lucro Líquido: R$ {estimatedProfit.toFixed(2).replace(".", ",")} ({profitMarginPct}%)
                </span>
              </div>
            </div>

            {/* Rodapé do Form */}
            <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs transition-colors flex items-center gap-1.5 disabled:opacity-60"
              >
                {submitting ? (
                  <span>Salvando no Catálogo...</span>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>Publicar no Meu Catálogo</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

