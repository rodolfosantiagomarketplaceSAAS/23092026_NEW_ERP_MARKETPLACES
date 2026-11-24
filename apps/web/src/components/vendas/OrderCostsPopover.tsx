"use client";

import React, { useState } from "react";
import { Calculator, Check, Loader2, X } from "lucide-react";
import type { MlSaleOrder } from "@/types/ml-sales";
import { formatBRL } from "./formatters";
import { isCancelledOrReturned, roundCurrency } from "@/lib/mercadolivre/sales-analytics";

interface OrderCostsPopoverProps {
  order: MlSaleOrder;
  onClose: () => void;
  onSaved: () => void;
}

export function OrderCostsPopover({ order, onClose, onSaved }: OrderCostsPopoverProps) {
  const [taxPct, setTaxPct] = useState<string>(String(order.tax_pct ?? 4));
  const [costMaterial, setCostMaterial] = useState<string>(String(order.cost_material ?? 0));
  const [costPackaging, setCostPackaging] = useState<string>(String(order.cost_packaging ?? 0));
  const [costLogistics, setCostLogistics] = useState<string>(String(order.cost_logistics ?? 0));
  const [costPrinting, setCostPrinting] = useState<string>(String(order.cost_printing ?? 0));
  const [costAccessoriesKit, setCostAccessoriesKit] = useState<string>(
    String(order.cost_accessories_kit ?? 0)
  );
  const [saveAsMlbTemplate, setSaveAsMlbTemplate] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const parsedTaxPct = Number.parseFloat(taxPct.replace(",", ".")) || 0;
  const parsedMaterial = Number.parseFloat(costMaterial.replace(",", ".")) || 0;
  const parsedPackaging = Number.parseFloat(costPackaging.replace(",", ".")) || 0;
  const parsedLogistics = Number.parseFloat(costLogistics.replace(",", ".")) || 0;
  const parsedPrinting = Number.parseFloat(costPrinting.replace(",", ".")) || 0;
  const parsedKit = Number.parseFloat(costAccessoriesKit.replace(",", ".")) || 0;

  const cancelled = isCancelledOrReturned(order.status);
  const previewTaxAmount = cancelled
    ? 0
    : roundCurrency(order.gross_sale_amount * (parsedTaxPct / 100));
  const previewOpTotal = roundCurrency(
    parsedMaterial + parsedPackaging + parsedLogistics + parsedPrinting + parsedKit
  );
  const previewCleanProfit = cancelled
    ? 0
    : roundCurrency(order.seller_transfer_profit - previewTaxAmount - previewOpTotal);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const res = await fetch(`/api/ml/sales/${order.id}/costs`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tax_pct: parsedTaxPct,
          cost_material: parsedMaterial,
          cost_packaging: parsedPackaging,
          cost_logistics: parsedLogistics,
          cost_printing: parsedPrinting,
          cost_accessories_kit: parsedKit,
          saveAsMlbTemplate,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Falha ao salvar custos do pedido.");
      }

      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar custos.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-white border border-slate-300 rounded shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-[#0F172A] text-white px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calculator className="w-4 h-4 text-emerald-400" />
            <div>
              <h3 className="text-xs font-bold tracking-tight">
                Custos Operacionais & Imposto do Pedido
              </h3>
              <p className="text-[10px] text-slate-400 font-mono">
                #{order.ml_order_id} · {order.mlb_id} ({order.quantity}x)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
            aria-label="Fechar edição de custos"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-3 text-xs">
          {error && (
            <div className="p-2 rounded bg-rose-50 border border-rose-200 text-rose-700 text-[11px]">
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                Material / Produto (R$)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={costMaterial}
                onChange={(e) => setCostMaterial(e.target.value)}
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-xs font-mono focus:outline-none focus:border-sky-600"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                Embalagem / Caixa (R$)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={costPackaging}
                onChange={(e) => setCostPackaging(e.target.value)}
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-xs font-mono focus:outline-none focus:border-sky-600"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                Logística / Gasolina (R$)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={costLogistics}
                onChange={(e) => setCostLogistics(e.target.value)}
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-xs font-mono focus:outline-none focus:border-sky-600"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                Impressão / Etiqueta (R$)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={costPrinting}
                onChange={(e) => setCostPrinting(e.target.value)}
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-xs font-mono focus:outline-none focus:border-sky-600"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                Kit de Acessórios (R$)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={costAccessoriesKit}
                onChange={(e) => setCostAccessoriesKit(e.target.value)}
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-xs font-mono focus:outline-none focus:border-sky-600"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                Alíquota Imposto (%)
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={taxPct}
                  onChange={(e) => setTaxPct(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-xs font-mono focus:outline-none focus:border-sky-600"
                />
                <span className="absolute right-2.5 top-1.5 text-[10px] text-slate-400 font-mono">
                  ={formatBRL(previewTaxAmount)}
                </span>
              </div>
            </div>
          </div>

          <div className="rounded bg-slate-50 border border-slate-200 p-2.5 space-y-1 text-[11px] tabular-nums">
            <div className="flex justify-between text-slate-600">
              <span>Base Repasse Vendedor (Pós-ML):</span>
              <span className="font-mono font-semibold text-slate-900">
                {formatBRL(order.seller_transfer_profit)}
              </span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>(-) Imposto ({parsedTaxPct.toFixed(1)}%) + Custos Operacionais:</span>
              <span className="font-mono font-semibold text-rose-600">
                -{formatBRL(previewTaxAmount + previewOpTotal)}
              </span>
            </div>
            <div className="flex justify-between pt-1.5 border-t border-slate-200 font-bold">
              <span className="text-slate-800">(=) Lucro Limpo Simulado:</span>
              <span
                className={`font-mono ${
                  previewCleanProfit >= 0 ? "text-emerald-700" : "text-rose-700"
                }`}
              >
                {formatBRL(previewCleanProfit)}
              </span>
            </div>
          </div>

          <label className="flex items-start gap-2 pt-1 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={saveAsMlbTemplate}
              onChange={(e) => setSaveAsMlbTemplate(e.target.checked)}
              className="mt-0.5 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
            />
            <span className="text-[11px] text-slate-600 leading-snug">
              Salvar estes valores como <strong>custo padrão automático</strong> para futuras vendas
              do anúncio <span className="font-mono font-semibold text-slate-800">{order.mlb_id}</span>
            </span>
          </label>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded border border-slate-300 text-slate-700 hover:bg-slate-100 font-medium transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-semibold transition-colors"
            >
              {saving ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Check className="w-3.5 h-3.5" />
              )}
              Salvar Custos
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

