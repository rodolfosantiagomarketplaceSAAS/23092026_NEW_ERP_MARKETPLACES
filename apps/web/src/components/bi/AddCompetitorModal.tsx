"use client";

import React, { useState } from "react";
import { X, Link2, ExternalLink, PlusCircle, CheckCircle2 } from "lucide-react";
import type { ComparativeListingGroup } from "@crm/types";

interface AddCompetitorModalProps {
  group: ComparativeListingGroup | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (message: string) => void;
}

export function AddCompetitorModal({
  group,
  isOpen,
  onClose,
  onSuccess,
}: AddCompetitorModalProps) {
  const [competitorUrl, setCompetitorUrl] = useState("");
  const [competitorPrice, setCompetitorPrice] = useState("");
  const [sellerName, setSellerName] = useState("");
  const [competitorTitle, setCompetitorTitle] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen || !group) return null;

  const myListing = group.my_listing;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const cleanUrl = competitorUrl.trim();
    if (!cleanUrl) {
      setErrorMsg("Informe a URL ou ID do anúncio concorrente.");
      return;
    }

    // Extrai external_id do Mercado Livre (MLB...) ou Shopee
    let externalId = "";
    const mlbMatch = cleanUrl.match(/MLB-?(\d+)/i);
    if (mlbMatch) {
      externalId = `MLB${mlbMatch[1]}`;
    } else if (cleanUrl.includes("shopee.com.br")) {
      const shpMatch = cleanUrl.match(/-i\.(\d+)\.(\d+)/) || cleanUrl.match(/\/product\/(\d+)\/(\d+)/);
      if (shpMatch) {
        externalId = `SHP_${shpMatch[1]}_${shpMatch[2]}`;
      } else {
        externalId = `SHP_${Date.now()}`;
      }
    } else if (/^\d+$/.test(cleanUrl)) {
      externalId = `MLB${cleanUrl}`;
    } else {
      externalId = cleanUrl.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40) || `COMP_${Date.now()}`;
    }

    const priceNum = parseFloat(competitorPrice.replace(/[^\d.,]/g, "").replace(",", "."));
    if (isNaN(priceNum) || priceNum <= 0) {
      setErrorMsg("Informe um preço válido para o concorrente.");
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        platform: myListing.platform,
        external_id: externalId,
        seller_name: sellerName.trim() || "Concorrente Monitorado",
        seller_reputation: "comum",
        title: competitorTitle.trim() || `Anúncio Concorrente (${externalId})`,
        current_price: priceNum,
        shipping_type: "padrao",
        permalink: cleanUrl.startsWith("http") ? cleanUrl : `https://produto.mercadolivre.com.br/${externalId}`,
        my_listing_id: myListing.id,
      };

      const res = await fetch("/api/competitors/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json().catch(() => ({}));

      if (res.ok && json.success) {
        onSuccess(`✅ Concorrente (${externalId}) vinculado com sucesso ao seu anúncio!`);
        onClose();
        setCompetitorUrl("");
        setCompetitorPrice("");
        setSellerName("");
        setCompetitorTitle("");
      } else {
        setErrorMsg(json.error || "Não foi possível vincular o concorrente.");
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err?.message || "Falha de comunicação com o servidor.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 bg-slate-50">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-indigo-50 text-indigo-600 rounded-md">
              <PlusCircle className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-slate-900">
                Vincular Mais um Concorrente ao Meu Anúncio
              </h3>
              <p className="text-[11px] text-slate-500">
                Monitoramento 1:N — Adicione sublinhas de concorrentes diretamente
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-md hover:bg-slate-200/60 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Meu Anúncio Alvo */}
        <div className="p-4 bg-slate-50/60 border-b border-slate-100 flex items-start gap-3">
          <div className="w-12 h-12 rounded border border-slate-200 bg-white shrink-0 overflow-hidden p-0.5">
            {myListing.thumbnail_url ? (
              <img src={myListing.thumbnail_url} alt="" className="w-full h-full object-contain" />
            ) : (
              <div className="w-full h-full bg-slate-100 flex items-center justify-center text-[10px] text-slate-400">
                Foto
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-1.5 py-0.2 rounded">
              MEU ANÚNCIO
            </span>
            <h4 className="text-xs font-semibold text-slate-900 truncate mt-0.5">
              {myListing.title}
            </h4>
            <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5">
              <span>SKU: <strong className="text-slate-700">{myListing.product_sku || "Sem SKU"}</strong></span>
              <span>•</span>
              <span>Meu Preço: <strong className="text-emerald-700">R$ {Number(myListing.current_price).toFixed(2)}</strong></span>
            </div>
          </div>
        </div>

        {/* Formulário de Inserção Direta */}
        <form onSubmit={handleSubmit} className="p-5 space-y-3">
          {errorMsg && (
            <div className="p-2.5 rounded bg-red-50 border border-red-200 text-red-800 text-xs">
              {errorMsg}
            </div>
          )}

          <div>
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
              Link do Anúncio do Concorrente ou MLB: <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              placeholder="Ex: https://produto.mercadolivre.com.br/MLB-5190775728 ou MLB5190775728"
              value={competitorUrl}
              onChange={(e) => setCompetitorUrl(e.target.value)}
              className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 outline-none"
              required
            />
            <span className="text-[10px] text-slate-400 mt-0.5 block">
              Dica: Você também pode usar a extensão do Chrome diretamente no anúncio do concorrente.
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                Preço Atual do Concorrente (R$): <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                placeholder="Ex: 130,71"
                value={competitorPrice}
                onChange={(e) => setCompetitorPrice(e.target.value)}
                className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 outline-none"
                required
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                Nome do Vendedor / Loja:
              </label>
              <input
                type="text"
                placeholder="Ex: SEVENPELICULAS"
                value={sellerName}
                onChange={(e) => setSellerName(e.target.value)}
                className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
              Título do Anúncio Concorrente (Opcional):
            </label>
            <input
              type="text"
              placeholder="Ex: Pelicula Painel E Multimidia Vw Nivus Virtus..."
              value={competitorTitle}
              onChange={(e) => setCompetitorTitle(e.target.value)}
              className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 outline-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded shadow-2xs transition disabled:opacity-60 flex items-center gap-1.5"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              {submitting ? "Vinculando..." : "Vincular Concorrente"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
