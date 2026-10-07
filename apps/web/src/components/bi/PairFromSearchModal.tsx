"use client";

import React, { useState, useEffect } from "react";
import { X, Check, Link2, Search, ExternalLink, ShieldAlert } from "lucide-react";
import type { MarketSearchItem, MyListing } from "@crm/types";

interface PairFromSearchModalProps {
  item: MarketSearchItem;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (message: string) => void;
}

export function PairFromSearchModal({
  item,
  isOpen,
  onClose,
  onSuccess,
}: PairFromSearchModalProps) {
  const [myListings, setMyListings] = useState<MyListing[]>([]);
  const [selectedMyListingId, setSelectedMyListingId] = useState<string | null>(
    item.matched_my_listing_id || null
  );
  const [loadingListings, setLoadingListings] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searchFilter, setSearchFilter] = useState("");

  useEffect(() => {
    if (!isOpen) return;

    async function loadMyListings() {
      setLoadingListings(true);
      try {
        const res = await fetch(`/api/my-listings?platform=${item.platform}`);
        if (res.ok) {
          const data = await res.json();
          setMyListings(data.items || []);
          if (!selectedMyListingId && data.items && data.items.length > 0) {
            setSelectedMyListingId(data.items[0].id);
          }
        }
      } catch (err) {
        console.error("Falha ao carregar anúncios próprios:", err);
      } finally {
        setLoadingListings(false);
      }
    }

    loadMyListings();
  }, [isOpen, item.platform]);

  if (!isOpen) return null;

  const filteredMyListings = myListings.filter((l) =>
    l.title.toLowerCase().includes(searchFilter.toLowerCase()) ||
    l.external_id.toLowerCase().includes(searchFilter.toLowerCase())
  );

  const handleConfirm = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/competitors/import-from-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform: item.platform,
          external_id: item.external_id,
          seller_name: item.seller_name,
          seller_reputation: item.seller_reputation,
          title: item.title,
          current_price: item.current_price,
          original_price: item.original_price,
          shipping_type: item.shipping_type,
          promo_badge: item.promo_badge,
          permalink: item.permalink,
          thumbnail_url: item.thumbnail_url,
          sales_count_approx: item.sales_count_approx,
          rating: item.rating,
          my_listing_id: selectedMyListingId,
        }),
      });

      if (res.ok) {
        const json = await res.json();
        onSuccess(json.message || "Anúncio pareado com sucesso!");
        onClose();
      } else {
        alert("Erro ao salvar pareamento no banco de dados.");
      }
    } catch (e) {
      console.error(e);
      alert("Falha de rede ao conectar com o ERP.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Top Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/70">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
              <Link2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Parear Concorrente ao Meu Anúncio
              </h2>
              <p className="text-xs text-slate-500">
                Vincule este anúncio concorrente a um item do seu catálogo para ativar o Radar Comparativo 1:N
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-200/60 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Card do Anúncio Concorrente Selecionado */}
        <div className="p-5 space-y-4">
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg flex items-start gap-3">
            <img
              src={item.thumbnail_url || "https://placehold.co/80x80/f1f5f9/64748b?text=Foto"}
              alt=""
              className="w-14 h-14 rounded-md object-cover border border-slate-200 shrink-0"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-200 text-slate-700 uppercase">
                  {item.platform === "mercadolivre" ? "Mercado Livre" : "Shopee"}
                </span>
                <span className="text-xs text-slate-500 font-mono">
                  {item.external_id}
                </span>
                <span className="text-xs text-slate-500 truncate">
                  • {item.seller_name}
                </span>
              </div>
              <h3 className="text-xs font-semibold text-slate-800 line-clamp-1">
                {item.title}
              </h3>
              <div className="flex items-center gap-3 mt-1.5">
                <span className="text-sm font-bold text-slate-900">
                  R$ {item.current_price.toFixed(2).replace(".", ",")}
                </span>
                {item.promo_badge && (
                  <span className="text-[10px] bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded font-medium">
                    {item.promo_badge}
                  </span>
                )}
                <a
                  href={item.permalink}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-indigo-600 hover:underline flex items-center gap-1 ml-auto"
                >
                  Ver no canal <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          </div>

          {/* Seleção do Anúncio Próprio */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
              Selecione com qual anúncio próprio você deseja parear:
            </label>

            <div className="relative mb-2">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Filtrar meus anúncios por título ou MLB/ID..."
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                className="w-full text-xs pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>

            <div className="border border-slate-200 rounded-lg max-h-56 overflow-y-auto divide-y divide-slate-100">
              {loadingListings ? (
                <div className="p-6 text-center text-xs text-slate-500">
                  Carregando seus anúncios do ERP...
                </div>
              ) : filteredMyListings.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-500">
                  Nenhum anúncio próprio encontrado no canal {item.platform === "mercadolivre" ? "Mercado Livre" : "Shopee"}.
                </div>
              ) : (
                filteredMyListings.map((ml) => {
                  const isSelected = selectedMyListingId === ml.id;
                  const priceDiff = ml.current_price - item.current_price;
                  return (
                    <div
                      key={ml.id}
                      onClick={() => setSelectedMyListingId(ml.id)}
                      className={`p-3 flex items-center gap-3 cursor-pointer transition ${
                        isSelected
                          ? "bg-indigo-50/70 border-l-4 border-indigo-600"
                          : "hover:bg-slate-50"
                      }`}
                    >
                      <input
                        type="radio"
                        checked={isSelected}
                        onChange={() => setSelectedMyListingId(ml.id)}
                        className="text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-slate-800 truncate">
                            {ml.title}
                          </span>
                          <span className="text-[10px] font-mono text-slate-400 shrink-0">
                            ({ml.external_id})
                          </span>
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs">
                          <span className="font-bold text-slate-900">
                            Meu Preço: R$ {ml.current_price.toFixed(2).replace(".", ",")}
                          </span>
                          <span
                            className={`font-semibold ${
                              priceDiff < 0
                                ? "text-emerald-600"
                                : priceDiff > 0
                                ? "text-rose-600"
                                : "text-slate-600"
                            }`}
                          >
                            {priceDiff < 0
                              ? `R$ ${Math.abs(priceDiff).toFixed(2).replace(".", ",")} mais barato`
                              : priceDiff > 0
                              ? `R$ ${priceDiff.toFixed(2).replace(".", ",")} mais caro`
                              : "Preço Empatado"}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Modal Actions */}
        <div className="px-6 py-4 bg-slate-50/70 border-t border-slate-100 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 transition"
          >
            Cancelar
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleConfirm}
              disabled={saving}
              className="px-4 py-2 text-xs font-bold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 active:scale-95 transition shadow-sm disabled:opacity-50 flex items-center gap-1.5"
            >
              <Check className="w-4 h-4" />
              {saving ? "Salvando no Radar..." : "Confirmar Pareamento 1:N"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
