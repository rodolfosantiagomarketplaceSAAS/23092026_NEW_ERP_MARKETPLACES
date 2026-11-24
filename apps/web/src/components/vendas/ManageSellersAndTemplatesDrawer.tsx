"use client";

import React, { useState } from "react";
import {
  Check,
  Loader2,
  PackageCheck,
  Plus,
  Trash2,
  Users,
  X,
} from "lucide-react";
import type { ProductCostTemplate, Seller } from "@/types/ml-sales";
import { formatBRL } from "./formatters";

const SELLER_COLOR_SWATCHES = [
  "#0284C7",
  "#059669",
  "#D97706",
  "#DC2626",
  "#0D9488",
  "#EA580C",
  "#65A30D",
  "#334155",
];

interface ManageSellersAndTemplatesDrawerProps {
  open: boolean;
  sellers: Seller[];
  templates: ProductCostTemplate[];
  onClose: () => void;
  onRefresh: () => void;
}

export function ManageSellersAndTemplatesDrawer({
  open,
  sellers,
  templates,
  onClose,
  onRefresh,
}: ManageSellersAndTemplatesDrawerProps) {
  const [activeTab, setActiveTab] = useState<"sellers" | "templates">("sellers");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<boolean>(false);

  // Form Novo Vendedor
  const [sellerName, setSellerName] = useState("");
  const [sellerColor, setSellerColor] = useState(SELLER_COLOR_SWATCHES[0]);
  const [sellerCommission, setSellerCommission] = useState("100");

  // Form Template MLB
  const [mlbId, setMlbId] = useState("");
  const [sku, setSku] = useState("");
  const [defaultSellerId, setDefaultSellerId] = useState("");
  const [defaultTaxPct, setDefaultTaxPct] = useState("4");
  const [materialCost, setMaterialCost] = useState("0");
  const [packagingCost, setPackagingCost] = useState("0");
  const [logisticsCost, setLogisticsCost] = useState("0");
  const [printingCost, setPrintingCost] = useState("0");
  const [kitCost, setKitCost] = useState("0");
  const [applyExisting, setApplyExisting] = useState(true);

  if (!open) return null;

  async function handleCreateSeller(e: React.FormEvent) {
    e.preventDefault();
    if (!sellerName.trim()) return;
    setBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/ml/sellers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: sellerName.trim(),
          color_hex: sellerColor,
          commission_pct: Number.parseFloat(sellerCommission.replace(",", ".")) || 100,
          active: true,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Erro ao cadastrar vendedor.");
      }
      setSellerName("");
      setSellerCommission("100");
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao cadastrar vendedor.");
    } finally {
      setBusy(false);
    }
  }

  async function handleToggleSellerActive(seller: Seller) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/ml/sellers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: seller.id,
          active: !seller.active,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error);
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao atualizar status.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteSeller(id: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/ml/sellers?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error);
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao remover vendedor.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveTemplate(e: React.FormEvent) {
    e.preventDefault();
    if (!mlbId.trim()) return;
    setBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/ml/cost-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mlb_id: mlbId.trim().toUpperCase(),
          sku: sku.trim() || null,
          default_seller_id: defaultSellerId || null,
          default_tax_pct: Number.parseFloat(defaultTaxPct.replace(",", ".")) || 0,
          material_cost: Number.parseFloat(materialCost.replace(",", ".")) || 0,
          packaging_cost: Number.parseFloat(packagingCost.replace(",", ".")) || 0,
          logistics_cost: Number.parseFloat(logisticsCost.replace(",", ".")) || 0,
          printing_cost: Number.parseFloat(printingCost.replace(",", ".")) || 0,
          accessories_kit_cost: Number.parseFloat(kitCost.replace(",", ".")) || 0,
          applyToExistingUnassigned: applyExisting,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error);

      setMlbId("");
      setSku("");
      setMaterialCost("0");
      setPackagingCost("0");
      setLogisticsCost("0");
      setPrintingCost("0");
      setKitCost("0");
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar regra por MLB.");
    } finally {
      setBusy(false);
    }
  }

  function loadTemplateToEdit(tpl: ProductCostTemplate) {
    setMlbId(tpl.mlb_id);
    setSku(tpl.sku || "");
    setDefaultSellerId(tpl.default_seller_id || "");
    setDefaultTaxPct(String(tpl.default_tax_pct));
    setMaterialCost(String(tpl.material_cost));
    setPackagingCost(String(tpl.packaging_cost));
    setLogisticsCost(String(tpl.logistics_cost));
    setPrintingCost(String(tpl.printing_cost));
    setKitCost(String(tpl.accessories_kit_cost));
  }

  async function handleDeleteTemplate(id: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/ml/cost-templates?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error);
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao excluir regra.");
    } finally {
      setBusy(false);
    }
  }

  const sellerMap = new Map(sellers.map((s) => [s.id, s]));

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-slate-950/45"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl h-full bg-white border-l border-slate-300 shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-[#0F172A] text-white px-5 py-4 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-sm font-bold tracking-tight">
              Gerenciar Vendedores & Custos Padrão (MLB)
            </h2>
            <p className="text-[11px] text-slate-400">
              Cadastre sócios/operadores e configure atribuição automática + custos por anúncio.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
            aria-label="Fechar painel"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200 bg-slate-50 px-5 pt-2 gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab("sellers")}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold border-b-2 transition-colors ${
              activeTab === "sellers"
                ? "border-sky-600 text-sky-700 bg-white rounded-t"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            Vendedores / Sócios ({sellers.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("templates")}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold border-b-2 transition-colors ${
              activeTab === "templates"
                ? "border-sky-600 text-sky-700 bg-white rounded-t"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            <PackageCheck className="w-3.5 h-3.5" />
            Regras & Custos por MLB ({templates.length})
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5 text-xs">
          {error && (
            <div className="p-2.5 rounded bg-rose-50 border border-rose-200 text-rose-700 text-[11px]">
              {error}
            </div>
          )}

          {activeTab === "sellers" ? (
            <>
              <form
                onSubmit={handleCreateSeller}
                className="p-3.5 rounded border border-slate-200 bg-slate-50/70 space-y-3"
              >
                <div className="font-bold text-slate-800 text-xs">
                  Novo Vendedor / Sócio de Repasse
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Nome do Vendedor / Sócio
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Ex: Carlos (Operação Flex)"
                      value={sellerName}
                      onChange={(e) => setSellerName(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded text-xs focus:outline-none focus:border-sky-600"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Cota Repasse (%)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      value={sellerCommission}
                      onChange={(e) => setSellerCommission(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded text-xs font-mono focus:outline-none focus:border-sky-600"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-slate-600 font-medium mr-1">Cor Badge:</span>
                    {SELLER_COLOR_SWATCHES.map((hex) => (
                      <button
                        key={hex}
                        type="button"
                        onClick={() => setSellerColor(hex)}
                        style={{ backgroundColor: hex }}
                        className={`w-5 h-5 rounded-xs border transition-transform ${
                          sellerColor === hex
                            ? "ring-2 ring-offset-1 ring-slate-900 scale-110 border-white"
                            : "border-black/15 opacity-80 hover:opacity-100"
                        }`}
                        aria-label={`Selecionar cor ${hex}`}
                      />
                    ))}
                  </div>

                  <button
                    type="submit"
                    disabled={busy}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-sky-600 hover:bg-sky-700 disabled:opacity-60 text-white font-semibold transition-colors"
                  >
                    {busy ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Plus className="w-3.5 h-3.5" />
                    )}
                    Adicionar
                  </button>
                </div>
              </form>

              <div className="space-y-2">
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Vendedores Cadastrados
                </div>

                {sellers.length === 0 ? (
                  <div className="p-6 text-center border border-dashed border-slate-300 rounded text-slate-500">
                    Nenhum vendedor cadastrado ainda. Adicione acima para iniciar a separação de repasses.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-200 border border-slate-200 rounded overflow-hidden">
                    {sellers.map((s) => (
                      <div
                        key={s.id}
                        className="flex items-center justify-between px-3.5 py-2.5 bg-white hover:bg-slate-50"
                      >
                        <div className="flex items-center gap-2.5">
                          <span
                            className="w-3 h-3 rounded-xs shrink-0"
                            style={{ backgroundColor: s.color_hex }}
                          />
                          <div>
                            <div className="font-bold text-slate-800 flex items-center gap-2">
                              {s.name}
                              {!s.active && (
                                <span className="px-1.5 py-0.5 text-[9px] rounded bg-slate-200 text-slate-600 font-semibold">
                                  Inativo
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-slate-500 font-mono">
                              Repasse configurado: {Number(s.commission_pct).toFixed(2)}% da base pós-ML
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleToggleSellerActive(s)}
                            className="px-2 py-1 rounded border border-slate-200 text-[11px] text-slate-600 hover:bg-slate-100"
                          >
                            {s.active ? "Desativar" : "Ativar"}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteSeller(s.id)}
                            className="p-1.5 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                            title="Excluir vendedor"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <form
                onSubmit={handleSaveTemplate}
                className="p-3.5 rounded border border-slate-200 bg-slate-50/70 space-y-3"
              >
                <div className="font-bold text-slate-800 text-xs">
                  Cadastrar / Atualizar Regra Automática por Anúncio (MLB)
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Código MLB *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="MLB384920192"
                      value={mlbId}
                      onChange={(e) => setMlbId(e.target.value.toUpperCase())}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded text-xs font-mono focus:outline-none focus:border-sky-600"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      SKU Interno (Opcional)
                    </label>
                    <input
                      type="text"
                      placeholder="KIT-PPF-01"
                      value={sku}
                      onChange={(e) => setSku(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded text-xs font-mono focus:outline-none focus:border-sky-600"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Vendedor Automático
                    </label>
                    <select
                      value={defaultSellerId}
                      onChange={(e) => setDefaultSellerId(e.target.value)}
                      className="w-full px-2 py-1.5 bg-white border border-slate-300 rounded text-xs focus:outline-none focus:border-sky-600"
                    >
                      <option value="">Sem atribuição automática</option>
                      {sellers
                        .filter((s) => s.active)
                        .map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Material Un. (R$)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={materialCost}
                      onChange={(e) => setMaterialCost(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Embalagem (R$)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={packagingCost}
                      onChange={(e) => setPackagingCost(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Logística (R$)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={logisticsCost}
                      onChange={(e) => setLogisticsCost(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Impressão (R$)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={printingCost}
                      onChange={(e) => setPrintingCost(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Kit Acessórios Un. (R$)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={kitCost}
                      onChange={(e) => setKitCost(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Imposto Padrão (%)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      value={defaultTaxPct}
                      onChange={(e) => setDefaultTaxPct(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded text-xs font-mono"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <label className="flex items-center gap-2 cursor-pointer select-none text-[11px] text-slate-600">
                    <input
                      type="checkbox"
                      checked={applyExisting}
                      onChange={(e) => setApplyExisting(e.target.checked)}
                      className="rounded border-slate-300 text-sky-600"
                    />
                    Aplicar também às vendas existentes deste MLB sem edição manual
                  </label>

                  <button
                    type="submit"
                    disabled={busy}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-semibold transition-colors"
                  >
                    {busy ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Check className="w-3.5 h-3.5" />
                    )}
                    Salvar Regra MLB
                  </button>
                </div>
              </form>

              <div className="space-y-2">
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Templates Configurados ({templates.length})
                </div>

                {templates.length === 0 ? (
                  <div className="p-6 text-center border border-dashed border-slate-300 rounded text-slate-500">
                    Nenhuma regra por MLB cadastrada. Novas vendas desse anúncio já nascerão com vendedor e custos preenchidos.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-200 border border-slate-200 rounded overflow-hidden">
                    {templates.map((tpl) => {
                      const linkedSeller = tpl.default_seller_id
                        ? sellerMap.get(tpl.default_seller_id)
                        : null;
                      const sumCosts =
                        tpl.material_cost +
                        tpl.packaging_cost +
                        tpl.logistics_cost +
                        tpl.printing_cost +
                        tpl.accessories_kit_cost;

                      return (
                        <div
                          key={tpl.id}
                          className="flex items-center justify-between px-3.5 py-2.5 bg-white hover:bg-slate-50"
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-slate-900">
                                {tpl.mlb_id}
                              </span>
                              {tpl.sku && (
                                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                                  {tpl.sku}
                                </span>
                              )}
                              {linkedSeller && (
                                <span
                                  className="text-[10px] px-1.5 py-0.5 rounded font-semibold text-white"
                                  style={{ backgroundColor: linkedSeller.color_hex }}
                                >
                                  {linkedSeller.name}
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                              Custos base: {formatBRL(sumCosts)} · Imposto: {tpl.default_tax_pct}%
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => loadTemplateToEdit(tpl)}
                              className="px-2 py-1 rounded border border-slate-200 text-[11px] text-slate-700 hover:bg-slate-100"
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteTemplate(tpl.id)}
                              className="p-1.5 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                              title="Remover regra MLB"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

