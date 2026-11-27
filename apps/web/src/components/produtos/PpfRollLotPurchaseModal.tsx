"use client";

import React, { useEffect, useState } from "react";
import { Layers, Loader2, ShoppingCart, X } from "lucide-react";
import type { ErpPpfRoll, ErpSupplier } from "@/types/erp-products";
import { SupplierFormModal } from "./SupplierFormModal";

interface PpfRollLotPurchaseModalProps {
  open: boolean;
  roll: ErpPpfRoll | null;
  suppliers: ErpSupplier[];
  onClose: () => void;
  onSaved: () => void;
  onSupplierCreated?: (supplier: ErpSupplier) => void;
}

function formatBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function PpfRollLotPurchaseModal({
  open,
  roll,
  suppliers,
  onClose,
  onSaved,
  onSupplierCreated,
}: PpfRollLotPurchaseModalProps) {
  const [supplierId, setSupplierId] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [lotCode, setLotCode] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [purchaseDate, setPurchaseDate] = useState("");
  const [initialMeters, setInitialMeters] = useState("12");
  const [totalPurchaseCost, setTotalPurchaseCost] = useState("2700");
  const [activateImmediately, setActivateImmediately] = useState(false);
  const [notes, setNotes] = useState("");
  const [quickSupplierOpen, setQuickSupplierOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !roll) return;
    setError(null);
    const today = new Date().toISOString().slice(0, 10);
    const dateSlug = today.replace(/-/g, "");
    const nextSeq = String((roll.lots?.length ?? 0) + 1).padStart(2, "0");

    setSupplierId(roll.supplier_id || "");
    setSupplierName(roll.supplier_ref?.trade_name || roll.supplier || "");
    setLotCode(`LOTE-${dateSlug}-${nextSeq}`);
    setInvoiceNumber("");
    setPurchaseDate(today);
    const defaultLength = Number(roll.roll_length_m || 12);
    setInitialMeters(String(defaultLength));
    setTotalPurchaseCost(
      String(Math.round(Number(roll.cost_per_linear_meter || 225) * defaultLength * 100) / 100)
    );
    const hasInUse = (roll.lots ?? []).some(
      (l) => l.status === "in_use" && Number(l.remaining_meters) > 0
    );
    setActivateImmediately(!hasInUse);
    setNotes("");
  }, [open, roll]);

  if (!open || !roll) return null;

  const metersNum = Math.max(0.001, Number(initialMeters) || 0.001);
  const totalCostNum = Math.max(0, Number(totalPurchaseCost) || 0);
  const widthM = Math.max(0.01, Number(roll.roll_width_cm || 152) / 100);
  const costPerMeter = totalCostNum / metersNum;
  const costPerM2 = costPerMeter / widthM;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!roll) return;
    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/erp/ppf-roll-lots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ppf_roll_id: roll.id,
          supplier_id: supplierId || null,
          supplier_name: supplierName || null,
          lot_code: lotCode,
          invoice_number: invoiceNumber || null,
          purchase_date: purchaseDate,
          roll_width_cm: Number(roll.roll_width_cm),
          initial_meters: Number(initialMeters),
          total_purchase_cost: Number(totalPurchaseCost),
          activate_immediately: activateImmediately,
          notes: notes || null,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Falha ao registrar compra da bobina.");
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar compra da bobina.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-xl max-h-[92vh] flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-emerald-50/70">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
              <ShoppingCart className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Registrar Nova Compra de Bobina (Lote PEPS)
              </h2>
              <p className="text-xs text-slate-600">
                {roll.code} • {roll.name}
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

          {/* Resumo de Custo Calculado ao Vivo */}
          <div className="grid grid-cols-3 gap-3 p-3.5 rounded-xl bg-emerald-50/70 border border-emerald-200/80">
            <div>
              <span className="text-[10px] font-bold text-emerald-800 uppercase">Valor da Bobina</span>
              <p className="text-base font-extrabold text-slate-900">{formatBRL(totalCostNum)}</p>
              <span className="text-[11px] text-slate-500">{metersNum}m comprados</span>
            </div>
            <div>
              <span className="text-[10px] font-bold text-emerald-800 uppercase">Custo / Metro</span>
              <p className="text-base font-extrabold text-emerald-700">
                {formatBRL(costPerMeter)}/m
              </p>
              <span className="text-[11px] text-slate-500">Base das vendas deste lote</span>
            </div>
            <div>
              <span className="text-[10px] font-bold text-emerald-800 uppercase">Custo / m²</span>
              <p className="text-base font-extrabold text-slate-900">{formatBRL(costPerM2)}/m²</p>
              <span className="text-[11px] text-slate-500">
                Largura {roll.roll_width_cm}cm
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Fornecedor desta Compra
              </label>
              <div className="flex gap-1.5">
                <select
                  value={supplierId}
                  onChange={(e) => {
                    const nextId = e.target.value;
                    setSupplierId(nextId);
                    const found = suppliers.find((s) => s.id === nextId);
                    setSupplierName(found ? found.trade_name : "");
                  }}
                  className="flex-1 min-w-0 px-2.5 py-2 text-xs border border-slate-200 rounded-lg bg-white"
                >
                  <option value="">Selecionar fornecedor...</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.trade_name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setQuickSupplierOpen(true)}
                  className="px-2.5 py-2 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-xs font-bold shrink-0"
                  title="Cadastrar novo fornecedor"
                >
                  +
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Data da Compra *
              </label>
              <input
                type="date"
                required
                value={purchaseDate}
                onChange={(e) => setPurchaseDate(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Valor Pago pela Bobina (R$) *
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                required
                value={totalPurchaseCost}
                onChange={(e) => setTotalPurchaseCost(e.target.value)}
                placeholder="Ex: 2700.00"
                className="w-full px-3 py-2 text-sm font-bold text-emerald-700 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Metragem Comprada (m) *
              </label>
              <input
                type="number"
                step="0.01"
                min="0.1"
                required
                value={initialMeters}
                onChange={(e) => setInitialMeters(e.target.value)}
                placeholder="Ex: 12"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Código do Lote *
              </label>
              <input
                type="text"
                required
                value={lotCode}
                onChange={(e) => setLotCode(e.target.value)}
                placeholder="LOTE-20261127-01"
                className="w-full px-3 py-2 text-sm font-mono uppercase border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Nº Nota Fiscal (NF-e)
              </label>
              <input
                type="text"
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                placeholder="Opcional"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          <div className="p-3 rounded-xl bg-sky-50/70 border border-sky-200/80 space-y-1.5">
            <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-800 cursor-pointer">
              <input
                type="checkbox"
                checked={activateImmediately}
                onChange={(e) => setActivateImmediately(e.target.checked)}
                className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
              />
              Colocar esta bobina em uso imediatamente
            </label>
            <p className="text-[11px] text-slate-600 leading-relaxed">
              <strong>Histórico protegido:</strong> se desmarcado, esta bobina entra na{" "}
              <strong>Fila PEPS</strong> e só passa a valer quando a bobina atual acabar ou for
              encerrada. Em qualquer caso, <strong>vendas antigas nunca têm seu custo alterado</strong>.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Observações</label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Condição de pagamento, frete incluso, qualidade do lote..."
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Layers className="w-4 h-4" />}
              Registrar Compra no PEPS
            </button>
          </div>
        </form>
      </div>

      <SupplierFormModal
        open={quickSupplierOpen}
        onClose={() => setQuickSupplierOpen(false)}
        onSaved={(created) => {
          setSupplierId(created.id);
          setSupplierName(created.trade_name);
          onSupplierCreated?.(created);
        }}
      />
    </div>
  );
}
