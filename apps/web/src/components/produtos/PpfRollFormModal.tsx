"use client";

import React, { useEffect, useState } from "react";
import { Layers, Loader2, Save, X } from "lucide-react";
import type { ErpPpfRoll } from "@/types/erp-products";

interface PpfRollFormModalProps {
  open: boolean;
  roll?: ErpPpfRoll | null;
  onClose: () => void;
  onSaved: () => void;
}

function formatBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function PpfRollFormModal({
  open,
  roll,
  onClose,
  onSaved,
}: PpfRollFormModalProps) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [finish, setFinish] = useState("brilho");
  const [thicknessMicrons, setThicknessMicrons] = useState<string>("190");
  const [rollWidthCm, setRollWidthCm] = useState<string>("152");
  const [rollLengthM, setRollLengthM] = useState<string>("12");
  const [costPerLinearMeter, setCostPerLinearMeter] = useState<string>("220");
  const [defaultWasteMarginPct, setDefaultWasteMarginPct] = useState<string>("15");
  const [remainingMeters, setRemainingMeters] = useState<string>("12");
  const [minAlertMeters, setMinAlertMeters] = useState<string>("2");
  const [supplier, setSupplier] = useState("");
  const [lotNumber, setLotNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (roll) {
      setCode(roll.code);
      setName(roll.name);
      setBrand(roll.brand || "");
      setFinish(roll.finish || "brilho");
      setThicknessMicrons(roll.thickness_microns ? String(roll.thickness_microns) : "");
      setRollWidthCm(String(roll.roll_width_cm));
      setRollLengthM(String(roll.roll_length_m));
      setCostPerLinearMeter(String(roll.cost_per_linear_meter));
      setDefaultWasteMarginPct(String(roll.default_waste_margin_pct));
      setRemainingMeters(String(roll.remaining_meters));
      setMinAlertMeters(String(roll.min_alert_meters));
      setSupplier(roll.supplier || "");
      setLotNumber(roll.lot_number || "");
      setNotes(roll.notes || "");
      setActive(roll.active);
    } else {
      setCode(`BOB-PPF-${Math.floor(100 + Math.random() * 900)}`);
      setName("");
      setBrand("");
      setFinish("brilho");
      setThicknessMicrons("190");
      setRollWidthCm("152");
      setRollLengthM("12");
      setCostPerLinearMeter("220");
      setDefaultWasteMarginPct("15");
      setRemainingMeters("12");
      setMinAlertMeters("2");
      setSupplier("");
      setLotNumber("");
      setNotes("");
      setActive(true);
    }
  }, [open, roll]);

  if (!open) return null;

  const widthM = Math.max(0.01, (Number(rollWidthCm) || 152) / 100);
  const lengthM = Math.max(0.01, Number(rollLengthM) || 12);
  const costMeter = Math.max(0, Number(costPerLinearMeter) || 0);
  const costPerM2 = costMeter / widthM;
  const fullRollCost = costMeter * lengthM;
  const fullRollAreaM2 = widthM * lengthM;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/erp/ppf-rolls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: roll?.id,
          code,
          name,
          brand: brand || null,
          finish,
          thickness_microns: thicknessMicrons ? Number(thicknessMicrons) : null,
          roll_width_cm: Number(rollWidthCm),
          roll_length_m: Number(rollLengthM),
          cost_per_linear_meter: Number(costPerLinearMeter),
          default_waste_margin_pct: Number(defaultWasteMarginPct),
          total_meters_purchased: roll ? roll.total_meters_purchased : Number(rollLengthM),
          remaining_meters: Number(remainingMeters),
          min_alert_meters: Number(minAlertMeters),
          supplier: supplier || null,
          lot_number: lotNumber || null,
          notes: notes || null,
          active,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Falha ao salvar bobina PPF.");
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar bobina.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-sky-100 text-sky-700 flex items-center justify-center">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                {roll ? "Editar Bobina PPF" : "Nova Bobina de Película PPF"}
              </h2>
              <p className="text-xs text-slate-500">
                Defina largura, comprimento, custo por metro linear e margem padrão de corte
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

        <form onSubmit={handleSubmit} className="overflow-y-auto p-6 space-y-5">
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
              {error}
            </div>
          )}

          {/* Resumo ao vivo da bobina */}
          <div className="grid grid-cols-3 gap-3 p-3.5 rounded-xl bg-sky-50/80 border border-sky-200/70">
            <div>
              <span className="text-[11px] font-semibold text-sky-700 uppercase">Custo por m²</span>
              <p className="text-base font-bold text-slate-900">{formatBRL(costPerM2)}/m²</p>
              <span className="text-[11px] text-slate-500">
                1m × {widthM.toFixed(2).replace(".", ",")}m = {widthM.toFixed(2).replace(".", ",")} m²
              </span>
            </div>
            <div>
              <span className="text-[11px] font-semibold text-sky-700 uppercase">Valor da Bobina</span>
              <p className="text-base font-bold text-slate-900">{formatBRL(fullRollCost)}</p>
              <span className="text-[11px] text-slate-500">
                {lengthM}m × {widthM.toFixed(2).replace(".", ",")}m
              </span>
            </div>
            <div>
              <span className="text-[11px] font-semibold text-sky-700 uppercase">Área Total</span>
              <p className="text-base font-bold text-slate-900">
                {fullRollAreaM2.toFixed(2).replace(".", ",")} m²
              </p>
              <span className="text-[11px] text-slate-500">
                Margem padrão: +{defaultWasteMarginPct || 0}%
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Código *</label>
              <input
                type="text"
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="BOB-PPF-001"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 uppercase"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Nome / Especificação da Película *
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: PPF TPU Brilho 190µm 1,52m (Bobina 12m)"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Largura (cm) *
              </label>
              <input
                type="number"
                step="0.01"
                required
                value={rollWidthCm}
                onChange={(e) => setRollWidthCm(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Comprimento (m) *
              </label>
              <input
                type="number"
                step="0.01"
                required
                value={rollLengthM}
                onChange={(e) => {
                  setRollLengthM(e.target.value);
                  if (!roll) setRemainingMeters(e.target.value);
                }}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Custo/Metro (R$) *
              </label>
              <input
                type="number"
                step="0.01"
                required
                value={costPerLinearMeter}
                onChange={(e) => setCostPerLinearMeter(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 font-semibold text-emerald-700"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Perda Borda (%)
              </label>
              <input
                type="number"
                step="0.5"
                value={defaultWasteMarginPct}
                onChange={(e) => setDefaultWasteMarginPct(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Saldo Atual (m)
              </label>
              <input
                type="number"
                step="0.01"
                value={remainingMeters}
                onChange={(e) => setRemainingMeters(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Alerta Mínimo (m)
              </label>
              <input
                type="number"
                step="0.1"
                value={minAlertMeters}
                onChange={(e) => setMinAlertMeters(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Acabamento</label>
              <select
                value={finish}
                onChange={(e) => setFinish(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 bg-white"
              >
                <option value="brilho">Brilho (Gloss)</option>
                <option value="fosco">Fosco (Matte/Stealth)</option>
                <option value="fume">Fumê (Farol/Lanterna)</option>
                <option value="carbono">Fibra de Carbono</option>
                <option value="outro">Outro</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Espessura (µm)
              </label>
              <input
                type="number"
                value={thicknessMicrons}
                onChange={(e) => setThicknessMicrons(e.target.value)}
                placeholder="190"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Marca</label>
              <input
                type="text"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                placeholder="Ex: 3M, XPEL, TPU Pro"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Fornecedor</label>
              <input
                type="text"
                value={supplier}
                onChange={(e) => setSupplier(e.target.value)}
                placeholder="Distribuidor"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Lote</label>
              <input
                type="text"
                value={lotNumber}
                onChange={(e) => setLotNumber(e.target.value)}
                placeholder="Lote / NF"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Observações</label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Informações de aplicação, garantia, corte na plotter..."
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-slate-100">
            <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
                className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
              />
              Bobina ativa para novos produtos
            </label>

            <div className="flex items-center gap-2">
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
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-700 rounded-lg disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {roll ? "Salvar Alterações" : "Cadastrar Bobina"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
