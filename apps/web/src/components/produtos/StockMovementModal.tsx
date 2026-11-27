"use client";

import React, { useEffect, useState } from "react";
import { ArrowDownCircle, ArrowUpCircle, Loader2, SlidersHorizontal, X } from "lucide-react";
import type { ErpPpfRoll, ErpProductWithSummary } from "@/types/erp-products";

interface StockMovementModalProps {
  open: boolean;
  target:
    | { type: "product"; product: ErpProductWithSummary }
    | { type: "ppf_roll"; roll: ErpPpfRoll }
    | null;
  onClose: () => void;
  onSaved: () => void;
}

export function StockMovementModal({
  open,
  target,
  onClose,
  onSaved,
}: StockMovementModalProps) {
  const [movementType, setMovementType] = useState<"in" | "out" | "adjustment">("in");
  const [quantity, setQuantity] = useState("1");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !target) return;
    setError(null);
    setMovementType("in");
    setQuantity(target.type === "ppf_roll" ? String(target.roll.roll_length_m || 12) : "1");
    setReason("");
  }, [open, target]);

  if (!open || !target) return null;

  const isRoll = target.type === "ppf_roll";
  const unit = isRoll ? "m" : target.product.unit || "UN";
  const currentBalance = isRoll
    ? Number(target.roll.remaining_meters || 0)
    : Number(target.product.stock_quantity || 0);
  const qtyNum = Number(quantity) || 0;
  const previewBalance =
    movementType === "in"
      ? currentBalance + qtyNum
      : movementType === "out"
      ? currentBalance - qtyNum
      : qtyNum;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!target) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/erp/stock/movements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity_type: target.type === "ppf_roll" ? "ppf_roll" : "product",
          product_id: target.type === "product" ? target.product.id : null,
          ppf_roll_id: target.type === "ppf_roll" ? target.roll.id : null,
          movement_type: movementType,
          quantity: qtyNum,
          reason: reason.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Erro ao registrar movimentação.");
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao movimentar estoque.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              {isRoll ? "Movimentar Bobina PPF" : "Movimentar Estoque do Produto"}
            </h3>
            <p className="text-xs text-slate-500 truncate max-w-[300px]">
              {isRoll ? `${target.roll.code} — ${target.roll.name}` : `${target.product.sku} — ${target.product.name}`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/70"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs">
              {error}
            </div>
          )}

          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setMovementType("in")}
              className={`flex flex-col items-center gap-1 py-2.5 px-2 rounded-xl border text-xs font-semibold transition-all ${
                movementType === "in"
                  ? "bg-emerald-50 border-emerald-400 text-emerald-700 shadow-2xs"
                  : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              <ArrowUpCircle className="w-4 h-4" />
              Entrada
            </button>
            <button
              type="button"
              onClick={() => setMovementType("out")}
              className={`flex flex-col items-center gap-1 py-2.5 px-2 rounded-xl border text-xs font-semibold transition-all ${
                movementType === "out"
                  ? "bg-rose-50 border-rose-400 text-rose-700 shadow-2xs"
                  : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              <ArrowDownCircle className="w-4 h-4" />
              Saída
            </button>
            <button
              type="button"
              onClick={() => setMovementType("adjustment")}
              className={`flex flex-col items-center gap-1 py-2.5 px-2 rounded-xl border text-xs font-semibold transition-all ${
                movementType === "adjustment"
                  ? "bg-sky-50 border-sky-400 text-sky-700 shadow-2xs"
                  : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              <SlidersHorizontal className="w-4 h-4" />
              Ajustar Saldo
            </button>
          </div>

          <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs">
            <div>
              <span className="text-slate-500 block">Saldo atual</span>
              <strong className="text-slate-900 text-sm">
                {currentBalance.toFixed(isRoll ? 2 : 0).replace(".", ",")} {unit}
              </strong>
            </div>
            <div className="text-right">
              <span className="text-slate-500 block">Saldo após movimentação</span>
              <strong
                className={`text-sm ${
                  previewBalance < 0 ? "text-rose-600" : "text-emerald-700"
                }`}
              >
                {previewBalance.toFixed(isRoll ? 2 : 0).replace(".", ",")} {unit}
              </strong>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              {movementType === "adjustment"
                ? `Novo saldo exato (${unit})`
                : `Quantidade (${unit})`}
            </label>
            <input
              type="number"
              step={isRoll ? "0.01" : "1"}
              min="0.001"
              required
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Motivo / Observação
            </label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={
                isRoll
                  ? "Ex: Compra de nova bobina 12m, perda de corte..."
                  : "Ex: Compra fornecedor, ajuste inventário..."
              }
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-700 rounded-lg disabled:opacity-50"
            >
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Confirmar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
