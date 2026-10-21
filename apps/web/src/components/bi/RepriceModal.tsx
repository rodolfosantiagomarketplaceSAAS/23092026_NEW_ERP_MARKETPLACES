"use client";

import React, { useState, useMemo } from "react";
import { X, TrendingDown, DollarSign, CheckCircle2, AlertTriangle, ExternalLink, ShieldAlert, Calculator } from "lucide-react";
import type { ComparativeListingGroup } from "@crm/types";
import { ProfitMarginCalculator } from "@/lib/services/pricingSimulator";

interface RepriceModalProps {
  group: ComparativeListingGroup | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (newPrice: number) => void;
}

export function RepriceModal({ group, isOpen, onClose, onSuccess }: RepriceModalProps) {
  if (!isOpen || !group) return null;

  const currentPrice = group.my_listing.current_price;
  const lowestCompetitor = group.lowest_competitor_price || currentPrice;
  const costPrice = group.my_listing.product_cost_price || currentPrice * 0.6; // fallback 60% se não cadastrado custo

  const [simulatedPrice, setSimulatedPrice] = useState<number>(
    lowestCompetitor > 0 && lowestCompetitor < currentPrice ? Number((lowestCompetitor - 0.10).toFixed(2)) : currentPrice
  );
  const [isSaving, setIsSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Simulação de Margem Líquida Real (Unit Economics de Marketplace)
  const simulation = useMemo(() => {
    const isPremium = group.my_listing.listing_type === "premium";
    return ProfitMarginCalculator.simulate(simulatedPrice, {
      cmv: costPrice,
      comissaoMarketplacePct: isPremium ? 17.0 : 12.0,
      aliquotaImpostoPct: 6.0,
      margemMinimaPct: 15.0,
    });
  }, [simulatedPrice, costPrice, group.my_listing.listing_type]);

  const isWinning = lowestCompetitor ? simulatedPrice < lowestCompetitor : true;
  const isTied = lowestCompetitor ? simulatedPrice === lowestCompetitor : false;

  const handleApplyPreset = (price: number) => {
    setSimulatedPrice(Number(price.toFixed(2)));
  };

  const handleConfirm = async () => {
    setIsSaving(true);
    // Simula envio à API de atualização de preço
    setTimeout(() => {
      setIsSaving(false);
      setSavedSuccess(true);
      setTimeout(() => {
        setSavedSuccess(false);
        onSuccess(simulatedPrice);
        onClose();
      }, 1000);
    }, 600);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-lg shadow-2xl border border-[#CBD5E1] w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Cabeçalho do Modal */}
        <div className="flex items-center justify-between px-4 py-3 bg-[#F8FAFC] border-b border-[#E2E8F0]">
          <div className="flex items-center space-x-2">
            <span className="p-1 bg-sky-100 text-sky-700 rounded font-bold text-xs">
              {group.my_listing.platform === "mercadolivre" ? "Mercado Livre" : "Shopee"}
            </span>
            <h3 className="font-bold text-sm text-[#0F172A]">Simulador de Reprecificação & Buybox</h3>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-1 rounded hover:bg-slate-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Corpo do Modal */}
        <div className="p-4 space-y-4 text-xs">
          {/* Dados do Anúncio */}
          <div className="bg-[#F8FAFC] p-3 rounded border border-[#E2E8F0]">
            <div className="font-semibold text-slate-800 line-clamp-1">{group.my_listing.title}</div>
            <div className="flex items-center gap-3 mt-1.5 text-slate-500">
              <span>SKU: <strong className="text-slate-700">{group.my_listing.product_sku || "N/A"}</strong></span>
              <span>•</span>
              <span>ID: <code className="text-slate-700">{group.my_listing.external_id}</code></span>
            </div>
          </div>

          {/* Cards de Comparativo Atual */}
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="p-2.5 bg-slate-50 rounded border border-slate-200">
              <div className="text-[10px] text-slate-500 font-medium">Preço de Custo</div>
              <div className="text-sm font-bold text-slate-700">R$ {costPrice.toFixed(2)}</div>
            </div>

            <div className="p-2.5 bg-slate-50 rounded border border-slate-200">
              <div className="text-[10px] text-slate-500 font-medium">Meu Preço Atual</div>
              <div className="text-sm font-bold text-slate-800">R$ {currentPrice.toFixed(2)}</div>
            </div>

            <div className="p-2.5 bg-amber-50 rounded border border-amber-200">
              <div className="text-[10px] text-amber-700 font-medium">Menor Concorrente</div>
              <div className="text-sm font-bold text-amber-900">
                {group.lowest_competitor_price ? `R$ ${group.lowest_competitor_price.toFixed(2)}` : "Sem dados"}
              </div>
            </div>
          </div>

          {/* Presets Rápidos de Reprecificação */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-700 mb-1.5">
              Ações Rápidas de Estratégia de Preço:
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => handleApplyPreset(lowestCompetitor - 0.10)}
                className="px-2 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded font-medium text-[11px] transition-colors"
              >
                Cobrir (-R$ 0,10)
              </button>

              <button
                type="button"
                onClick={() => handleApplyPreset(lowestCompetitor)}
                className="px-2 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 rounded font-medium text-[11px] transition-colors"
              >
                Igualar Preço
              </button>

              <button
                type="button"
                onClick={() => handleApplyPreset(lowestCompetitor - 1.00)}
                className="px-2 py-1.5 bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-300 rounded font-medium text-[11px] transition-colors"
              >
                Super Agressivo (-R$ 1)
              </button>
            </div>
          </div>

          {/* Input do Novo Preço */}
          <div>
            <label htmlFor="simulatedPriceInput" className="block text-[11px] font-semibold text-slate-700 mb-1">
              Novo Preço de Venda Desejado (R$):
            </label>
            <div className="relative">
              <span className="absolute left-3 top-2 text-slate-500 font-bold">R$</span>
              <input
                id="simulatedPriceInput"
                type="number"
                step="0.01"
                min="1"
                value={simulatedPrice}
                onChange={(e) => setSimulatedPrice(parseFloat(e.target.value) || 0)}
                className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded focus:border-sky-600 focus:ring-1 focus:ring-sky-600 outline-none font-bold text-sm text-slate-900"
              />
            </div>
          </div>

          {/* Projeção de Margem Líquida Real e Diagnóstico de Buybox */}
          <div
            className={`p-3 rounded border text-xs space-y-2.5 ${
              !simulation.ehViavel
                ? "bg-red-50/70 border-red-300 text-red-900"
                : isWinning
                ? "bg-emerald-50/70 border-emerald-300 text-emerald-900"
                : isTied
                ? "bg-amber-50/70 border-amber-300 text-amber-900"
                : "bg-slate-100 border-slate-300 text-slate-800"
            }`}
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="font-bold flex items-center gap-1.5">
                  {!simulation.ehViavel ? (
                    <>
                      <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                      <span>Alerta de Margem Baixa ou Inviável</span>
                    </>
                  ) : isWinning ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>Posição: Menor Preço (Ganhando Buybox)!</span>
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                      <span>Posição: {isTied ? "Empatado com concorrente" : "Acima do mercado"}</span>
                    </>
                  )}
                </div>
                <div className="text-[11px] mt-0.5">
                  Lucro Líquido Real: <strong className="font-bold">R$ {simulation.lucroLiquidoReais.toFixed(2)}</strong> (
                  <span className={simulation.ehViavel ? "text-emerald-700 font-bold" : "text-red-700 font-bold"}>
                    {simulation.margemLiquidaPct.toFixed(1)}% líquido
                  </span>)
                </div>
              </div>

              <div className="text-right">
                <span className="text-[9px] uppercase font-bold text-slate-500">Status no Radar</span>
                <div className="font-black text-xs">
                  {isWinning ? "MAIS BARATO" : isTied ? "EMPATADO" : "MAIS CARO"}
                </div>
              </div>
            </div>

            {/* Detalhamento de Deduções da Plataforma & Impostos */}
            <div className="pt-2 border-t border-slate-200/80 grid grid-cols-3 gap-2 text-[10px]">
              <div className="bg-white/80 p-1.5 rounded border border-slate-200">
                <span className="text-slate-500 block">Comissão ({group.my_listing.listing_type === "premium" ? "17%" : "12%"}):</span>
                <strong className="text-slate-800">R$ {simulation.detalhamento.valorComissao.toFixed(2)}</strong>
              </div>
              <div className="bg-white/80 p-1.5 rounded border border-slate-200">
                <span className="text-slate-500 block">Impostos (6%):</span>
                <strong className="text-slate-800">R$ {simulation.detalhamento.valorImposto.toFixed(2)}</strong>
              </div>
              <div className="bg-white/80 p-1.5 rounded border border-slate-200">
                <span className="text-slate-500 block">Preço Piso Seguro:</span>
                <strong className="text-indigo-700">R$ {simulation.precoPisoSugerido.toFixed(2)}</strong>
              </div>
            </div>

            {!simulation.ehViavel && simulation.motivoInviabilidade && (
              <div className="text-[10px] text-red-700 bg-red-100/80 p-1.5 rounded flex items-center gap-1">
                <ShieldAlert className="w-3.5 h-3.5 shrink-0 text-red-600" />
                <span>{simulation.motivoInviabilidade}</span>
              </div>
            )}
          </div>
        </div>

        {/* Rodapé com Ações */}
        <div className="px-4 py-3 bg-[#F8FAFC] border-t border-[#E2E8F0] flex items-center justify-end space-x-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded border border-slate-300 text-slate-700 hover:bg-slate-100 font-semibold text-xs"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={isSaving || simulatedPrice <= 0}
            onClick={handleConfirm}
            className="px-4 py-1.5 rounded bg-[#0F172A] hover:bg-slate-800 text-white font-semibold text-xs flex items-center gap-1.5 disabled:opacity-50"
          >
            {isSaving ? "Aplicando Preço..." : savedSuccess ? "Preço Atualizado!" : "Confirmar & Reprecificar"}
          </button>
        </div>
      </div>
    </div>
  );
}
