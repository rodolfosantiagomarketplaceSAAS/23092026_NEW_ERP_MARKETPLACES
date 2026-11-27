"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  Calculator,
  ImagePlus,
  Layers,
  Loader2,
  Package,
  Plus,
  Save,
  Star,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import type {
  ErpCostCategory,
  ErpDimensionUnit,
  ErpPpfCalcMode,
  ErpPpfRoll,
  ErpProductPhoto,
  ErpProductStatus,
  ErpProductType,
  ErpProductWithSummary,
} from "@/types/erp-products";
import { calculatePpfConsumption, round2 } from "@/lib/erp/ppf-calculator";

interface ProductFormModalProps {
  open: boolean;
  product?: ErpProductWithSummary | null;
  defaultType?: ErpProductType;
  rolls: ErpPpfRoll[];
  allProducts: ErpProductWithSummary[];
  onClose: () => void;
  onSaved: () => void;
}

type ModalTab = "geral" | "fotos" | "dimensoes_ppf" | "kit" | "estoque_preco";

function formatBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function ProductFormModal({
  open,
  product,
  defaultType = "ppf_piece",
  rolls,
  allProducts,
  onClose,
  onSaved,
}: ProductFormModalProps) {
  const [activeTab, setActiveTab] = useState<ModalTab>("geral");
  const [productType, setProductType] = useState<ErpProductType>(defaultType);
  const [code, setCode] = useState("");
  const [sku, setSku] = useState("");
  const [ean, setEan] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [brand, setBrand] = useState("");
  const [supplier, setSupplier] = useState("");
  const [ncm, setNcm] = useState("");
  const [unit, setUnit] = useState("UN");
  const [status, setStatus] = useState<ErpProductStatus>("active");
  const [costCategory, setCostCategory] = useState<ErpCostCategory>("material");

  const [photos, setPhotos] = useState<ErpProductPhoto[]>([]);
  const [photoUrlInput, setPhotoUrlInput] = useState("");
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [dimensionUnit, setDimensionUnit] = useState<ErpDimensionUnit>("cm");
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");
  const [depth, setDepth] = useState("");
  const [weightGrams, setWeightGrams] = useState("0");

  const [usesPpfRoll, setUsesPpfRoll] = useState(false);
  const [ppfRollId, setPpfRollId] = useState("");
  const [ppfCalcMode, setPpfCalcMode] = useState<ErpPpfCalcMode>("area");
  const [ppfWasteMarginPct, setPpfWasteMarginPct] = useState("15");
  const [ppfPieceCount, setPpfPieceCount] = useState("1");

  const [manualCost, setManualCost] = useState("0");
  const [extraCost, setExtraCost] = useState("0");
  const [suggestedPrice, setSuggestedPrice] = useState("0");
  const [minPrice, setMinPrice] = useState("0");
  const [stockQuantity, setStockQuantity] = useState("0");
  const [minStockQuantity, setMinStockQuantity] = useState("0");
  const [storageLocation, setStorageLocation] = useState("");
  const [notes, setNotes] = useState("");

  const [kitItems, setKitItems] = useState<
    Array<{ component_product_id: string; quantity: number; notes?: string }>
  >([]);
  const [selectedComponentToAdd, setSelectedComponentToAdd] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setActiveTab("geral");
    setPhotoUrlInput("");
    setSelectedComponentToAdd("");

    if (product) {
      setProductType(product.product_type);
      setCode(product.code);
      setSku(product.sku);
      setEan(product.ean || "");
      setName(product.name);
      setDescription(product.description || "");
      setCategory(product.category || "");
      setBrand(product.brand || "");
      setSupplier(product.supplier || "");
      setNcm(product.ncm || "");
      setUnit(product.unit || "UN");
      setStatus(product.status);
      setCostCategory(product.cost_category || "material");
      setPhotos(
        product.photos && product.photos.length > 0
          ? product.photos
          : product.thumbnail_url
          ? [{ url: product.thumbnail_url, is_primary: true }]
          : []
      );
      setDimensionUnit(product.dimension_unit || "cm");
      setWidth(product.width !== null && product.width !== undefined ? String(product.width) : "");
      setHeight(product.height !== null && product.height !== undefined ? String(product.height) : "");
      setDepth(product.depth !== null && product.depth !== undefined ? String(product.depth) : "");
      setWeightGrams(String(product.weight_grams ?? 0));
      setUsesPpfRoll(product.uses_ppf_roll);
      setPpfRollId(product.ppf_roll_id || rolls[0]?.id || "");
      setPpfCalcMode(product.ppf_calc_mode || "area");
      setPpfWasteMarginPct(String(product.ppf_waste_margin_pct ?? 15));
      setPpfPieceCount(String(product.ppf_piece_count ?? 1));
      setManualCost(String(product.manual_cost ?? 0));
      setExtraCost(String(product.extra_cost ?? 0));
      setSuggestedPrice(String(product.suggested_price ?? 0));
      setMinPrice(String(product.min_price ?? 0));
      setStockQuantity(String(product.stock_quantity ?? 0));
      setMinStockQuantity(String(product.min_stock_quantity ?? 0));
      setStorageLocation(product.storage_location || "");
      setNotes(product.notes || "");
      setKitItems(
        (product.kit_items ?? []).map((ki) => ({
          component_product_id: ki.component_product_id,
          quantity: ki.quantity,
          notes: ki.notes || "",
        }))
      );
    } else {
      const rand = Math.floor(1000 + Math.random() * 9000);
      const isPpf = defaultType === "ppf_piece";
      const isKit = defaultType === "kit";
      setProductType(defaultType);
      setCode(isKit ? `KIT-${rand}` : isPpf ? `PPF-${rand}` : `PRD-${rand}`);
      setSku(isKit ? `KIT-PPF-${rand}` : isPpf ? `PPF-${rand}` : `SKU-${rand}`);
      setEan("");
      setName("");
      setDescription("");
      setCategory(isKit ? "Kit PPF" : isPpf ? "Película PPF" : "Acessório");
      setBrand("");
      setSupplier("");
      setNcm("");
      setUnit(isKit ? "KIT" : "UN");
      setStatus("active");
      setCostCategory(isPpf || isKit ? "material" : "accessories");
      setPhotos([]);
      setDimensionUnit("cm");
      setWidth("");
      setHeight("");
      setDepth("");
      setWeightGrams("0");
      setUsesPpfRoll(isPpf);
      setPpfRollId(rolls[0]?.id || "");
      setPpfCalcMode("area");
      setPpfWasteMarginPct(String(rolls[0]?.default_waste_margin_pct ?? 15));
      setPpfPieceCount("1");
      setManualCost("0");
      setExtraCost("0");
      setSuggestedPrice("0");
      setMinPrice("0");
      setStockQuantity("0");
      setMinStockQuantity("0");
      setStorageLocation("");
      setNotes("");
      setKitItems([]);
    }
  }, [open, product, defaultType, rolls]);

  const selectedRoll = useMemo(
    () => rolls.find((r) => r.id === ppfRollId) ?? null,
    [rolls, ppfRollId]
  );

  const livePpfCalc = useMemo(() => {
    if (productType === "kit" || !usesPpfRoll || !selectedRoll) return null;
    return calculatePpfConsumption({
      width: Number(width) || 0,
      height: Number(height) || 0,
      dimensionUnit,
      pieceCount: Math.max(1, Number(ppfPieceCount) || 1),
      wasteMarginPct: Number(ppfWasteMarginPct) || 0,
      calcMode: ppfCalcMode,
      rollWidthCm: Number(selectedRoll.roll_width_cm),
      rollLengthM: Number(selectedRoll.roll_length_m),
      costPerLinearMeter: Number(selectedRoll.cost_per_linear_meter),
    });
  }, [
    productType,
    usesPpfRoll,
    selectedRoll,
    width,
    height,
    dimensionUnit,
    ppfPieceCount,
    ppfWasteMarginPct,
    ppfCalcMode,
  ]);

  const availableComponents = useMemo(
    () =>
      allProducts.filter(
        (p) =>
          p.id !== product?.id &&
          p.product_type !== "kit" &&
          !kitItems.some((k) => k.component_product_id === p.id)
      ),
    [allProducts, product?.id, kitItems]
  );

  const componentById = useMemo(
    () => new Map(allProducts.map((p) => [p.id, p])),
    [allProducts]
  );

  const liveKitSummary = useMemo(() => {
    let cost = 0;
    let ppfMeters = 0;
    let ppfArea = 0;
    let weight = 0;
    for (const item of kitItems) {
      const comp = componentById.get(item.component_product_id);
      if (!comp) continue;
      cost += comp.computed_total_cost * item.quantity;
      ppfMeters += comp.computed_total_ppf_meters * item.quantity;
      ppfArea += comp.computed_total_ppf_area_m2 * item.quantity;
      weight += comp.computed_total_weight_grams * item.quantity;
    }
    return {
      cost: round2(cost + (Number(extraCost) || 0)),
      componentsCost: round2(cost),
      ppfMeters,
      ppfArea,
      weight: round2(weight),
    };
  }, [kitItems, componentById, extraCost]);

  const computedTotalCost = useMemo(() => {
    if (productType === "kit") return liveKitSummary.cost;
    if (usesPpfRoll) return round2((livePpfCalc?.calculatedCost ?? 0) + (Number(extraCost) || 0));
    return round2((Number(manualCost) || 0) + (Number(extraCost) || 0));
  }, [productType, liveKitSummary.cost, usesPpfRoll, livePpfCalc, manualCost, extraCost]);

  if (!open) return null;

  async function handleFileUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploadingPhoto(true);
    setError(null);
    try {
      const uploaded: ErpProductPhoto[] = [];
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/erp/products/upload-photo", {
          method: "POST",
          body: fd,
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || "Erro ao enviar foto.");
        }
        uploaded.push({
          url: data.photo.url,
          path: data.photo.path,
          alt: data.photo.alt,
          is_primary: photos.length === 0 && uploaded.length === 0,
        });
      }
      setPhotos((prev) => [...prev, ...uploaded]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao enviar imagem.");
    } finally {
      setUploadingPhoto(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function handleAddPhotoUrl() {
    const clean = photoUrlInput.trim();
    if (!clean) return;
    setPhotos((prev) => [
      ...prev,
      { url: clean, is_primary: prev.length === 0 },
    ]);
    setPhotoUrlInput("");
  }

  function handleSetPrimaryPhoto(index: number) {
    setPhotos((prev) => prev.map((p, i) => ({ ...p, is_primary: i === index })));
  }

  function handleRemovePhoto(index: number) {
    setPhotos((prev) => {
      const next = prev.filter((_, i) => i !== index);
      if (next.length > 0 && !next.some((p) => p.is_primary)) {
        next[0] = { ...next[0], is_primary: true };
      }
      return next;
    });
  }

  function handleAddKitComponent() {
    if (!selectedComponentToAdd) return;
    setKitItems((prev) => [
      ...prev,
      { component_product_id: selectedComponentToAdd, quantity: 1 },
    ]);
    setSelectedComponentToAdd("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/erp/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: product?.id,
          product_type: productType,
          code,
          sku,
          ean: ean || null,
          name,
          description: description || null,
          category: category || null,
          brand: brand || null,
          supplier: supplier || null,
          ncm: ncm || null,
          unit,
          status,
          cost_category: costCategory,
          photos,
          thumbnail_url: photos.find((p) => p.is_primary)?.url || photos[0]?.url || null,
          dimension_unit: dimensionUnit,
          width: width !== "" ? Number(width) : null,
          height: height !== "" ? Number(height) : null,
          depth: depth !== "" ? Number(depth) : null,
          weight_grams: Number(weightGrams) || 0,
          uses_ppf_roll: productType === "kit" ? false : usesPpfRoll,
          ppf_roll_id: productType !== "kit" && usesPpfRoll && ppfRollId ? ppfRollId : null,
          ppf_calc_mode: ppfCalcMode,
          ppf_waste_margin_pct: Number(ppfWasteMarginPct) || 0,
          ppf_piece_count: Math.max(1, Number(ppfPieceCount) || 1),
          manual_cost: Number(manualCost) || 0,
          extra_cost: Number(extraCost) || 0,
          suggested_price: Number(suggestedPrice) || 0,
          min_price: Number(minPrice) || 0,
          stock_quantity: Number(stockQuantity) || 0,
          min_stock_quantity: Number(minStockQuantity) || 0,
          storage_location: storageLocation || null,
          notes: notes || null,
          kit_items: productType === "kit" ? kitItems : undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Erro ao salvar produto.");
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar produto.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-3 sm:p-5">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[94vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-600 text-white flex items-center justify-center shadow-sm">
              {productType === "kit" ? (
                <Package className="w-5 h-5" />
              ) : productType === "ppf_piece" ? (
                <Layers className="w-5 h-5" />
              ) : (
                <Box className="w-5 h-5" />
              )}
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                {product ? `Editar: ${product.name}` : "Novo Cadastro de Produto / Kit ERP"}
              </h2>
              <p className="text-xs text-slate-500">
                Padrão Tiny/Bling • Custo consolidado atual:{" "}
                <strong className="text-emerald-700">{formatBRL(computedTotalCost)}</strong>
                {productType === "kit" && liveKitSummary.ppfMeters > 0 && (
                  <>
                    {" "}• Bobina PPF:{" "}
                    <strong className="text-sky-700">
                      {liveKitSummary.ppfMeters.toFixed(4).replace(".", ",")} m
                    </strong>
                  </>
                )}
                {productType !== "kit" && livePpfCalc && livePpfCalc.linearMeters > 0 && (
                  <>
                    {" "}• Bobina PPF:{" "}
                    <strong className="text-sky-700">
                      {livePpfCalc.linearMeters.toFixed(4).replace(".", ",")} m
                    </strong>
                  </>
                )}
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

        {/* Sub-tabs */}
        <div className="px-6 pt-3 border-b border-slate-200 flex items-center gap-1 overflow-x-auto bg-white shrink-0">
          {(
            [
              { id: "geral", label: "1. Dados Gerais" },
              { id: "fotos", label: `2. Fotos (${photos.length})` },
              ...(productType !== "kit"
                ? [{ id: "dimensoes_ppf", label: "3. Dimensões, Peso & PPF" }]
                : [{ id: "kit", label: `3. Composição do Kit (${kitItems.length})` }]),
              { id: "estoque_preco", label: "4. Custos, Estoque & Preço" },
            ] as Array<{ id: ModalTab; label: string }>
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className={`px-3.5 py-2 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
                activeTab === t.id
                  ? "border-sky-600 text-sky-700"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
              {error}
            </div>
          )}

          {/* TAB 1: DADOS GERAIS */}
          {activeTab === "geral" && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Tipo de Cadastro
                </label>
                <div className="grid grid-cols-3 gap-2.5">
                  {(
                    [
                      {
                        id: "ppf_piece",
                        title: "Peça PPF (Bobina)",
                        desc: "Calcula custo & metros da bobina pelas medidas",
                      },
                      {
                        id: "simple",
                        title: "Produto Simples / Insumo",
                        desc: "Espátula, borrifador, caixa, manual, etc.",
                      },
                      {
                        id: "kit",
                        title: "Kit / Composto (BOM)",
                        desc: "Combina peças PPF + acessórios em um kit",
                      },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        setProductType(opt.id);
                        if (opt.id === "ppf_piece") {
                          setUsesPpfRoll(true);
                          setCostCategory("material");
                        } else if (opt.id === "simple") {
                          setUsesPpfRoll(false);
                        } else {
                          setUsesPpfRoll(false);
                          setUnit("KIT");
                        }
                      }}
                      className={`p-3 rounded-xl border text-left transition-all ${
                        productType === opt.id
                          ? "border-sky-500 bg-sky-50/70 ring-1 ring-sky-400"
                          : "border-slate-200 hover:bg-slate-50"
                      }`}
                    >
                      <span className="text-xs font-bold text-slate-900 block">{opt.title}</span>
                      <span className="text-[11px] text-slate-500 leading-tight block mt-0.5">
                        {opt.desc}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Código do Produto *
                  </label>
                  <input
                    type="text"
                    required
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="PPF-001"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg font-mono uppercase focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">SKU *</label>
                  <input
                    type="text"
                    required
                    value={sku}
                    onChange={(e) => setSku(e.target.value)}
                    placeholder="PPF-CIVIC-FAROL"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg font-mono uppercase focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    EAN / GTIN (Código de Barras)
                  </label>
                  <input
                    type="text"
                    value={ean}
                    onChange={(e) => setEan(e.target.value)}
                    placeholder="7891234567890"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nome do Produto / Kit *
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: Película PPF Farol Honda Civic G10 (Par) ou Kit PPF Completo"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Descrição Completa
                </label>
                <textarea
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Detalhes técnicos, modelo do veículo, aplicação, o que acompanha..."
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Categoria</label>
                  <input
                    type="text"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    placeholder="Película PPF"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Marca</label>
                  <input
                    type="text"
                    value={brand}
                    onChange={(e) => setBrand(e.target.value)}
                    placeholder="Marca"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">NCM</label>
                  <input
                    type="text"
                    value={ncm}
                    onChange={(e) => setNcm(e.target.value)}
                    placeholder="3919.90.90"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Unidade</label>
                  <select
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                  >
                    <option value="UN">UN (Unidade)</option>
                    <option value="KIT">KIT (Kit)</option>
                    <option value="PAR">PAR (Par)</option>
                    <option value="PC">PC (Peça)</option>
                    <option value="M">M (Metro)</option>
                    <option value="CX">CX (Caixa)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Categoria de Custo (Vendas)
                  </label>
                  <select
                    value={costCategory}
                    onChange={(e) => setCostCategory(e.target.value as ErpCostCategory)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                  >
                    <option value="material">Matéria-Prima / Película PPF</option>
                    <option value="accessories">Acessórios / Kit Aplicação</option>
                    <option value="packaging">Embalagem / Tubo / Caixa</option>
                    <option value="printing">Impressão / Manual / Etiqueta</option>
                    <option value="logistics">Logística / Despacho</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Fornecedor</label>
                  <input
                    type="text"
                    value={supplier}
                    onChange={(e) => setSupplier(e.target.value)}
                    placeholder="Fornecedor principal"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Status</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as ErpProductStatus)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                  >
                    <option value="active">Ativo</option>
                    <option value="draft">Rascunho</option>
                    <option value="inactive">Inativo</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: FOTOS */}
          {activeTab === "fotos" && (
            <div className="space-y-4">
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-300 hover:border-sky-500 rounded-2xl p-6 text-center cursor-pointer bg-slate-50/60 hover:bg-sky-50/40 transition-colors"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  multiple
                  onChange={(e) => handleFileUpload(e.target.files)}
                  className="hidden"
                />
                {uploadingPhoto ? (
                  <div className="flex flex-col items-center gap-2 text-sky-600">
                    <Loader2 className="w-7 h-7 animate-spin" />
                    <span className="text-xs font-semibold">Enviando imagem para o Supabase Storage...</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-1.5">
                    <Upload className="w-7 h-7 text-sky-600" />
                    <p className="text-sm font-bold text-slate-800">
                      Clique para enviar fotos do computador
                    </p>
                    <p className="text-xs text-slate-500">
                      JPG, PNG, WEBP ou GIF até 5MB por foto (múltiplas fotos suportadas)
                    </p>
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                <input
                  type="url"
                  value={photoUrlInput}
                  onChange={(e) => setPhotoUrlInput(e.target.value)}
                  placeholder="Ou cole a URL direta de uma imagem (https://...)"
                  className="flex-1 px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
                <button
                  type="button"
                  onClick={handleAddPhotoUrl}
                  className="inline-flex items-center gap-1 px-3.5 py-2 text-xs font-semibold bg-slate-800 text-white rounded-lg hover:bg-slate-900"
                >
                  <ImagePlus className="w-3.5 h-3.5" />
                  Adicionar URL
                </button>
              </div>

              {photos.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {photos.map((photo, idx) => (
                    <div
                      key={`${photo.url}-${idx}`}
                      className={`relative rounded-xl border overflow-hidden group ${
                        photo.is_primary
                          ? "border-sky-500 ring-2 ring-sky-200"
                          : "border-slate-200"
                      }`}
                    >
                      <div className="aspect-square bg-slate-100 flex items-center justify-center overflow-hidden">
                        <img
                          src={photo.url}
                          alt={photo.alt || name}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="p-1.5 bg-white flex items-center justify-between border-t border-slate-100">
                        <button
                          type="button"
                          onClick={() => handleSetPrimaryPhoto(idx)}
                          className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded ${
                            photo.is_primary
                              ? "bg-sky-100 text-sky-700"
                              : "text-slate-500 hover:bg-slate-100"
                          }`}
                        >
                          <Star className="w-3 h-3" />
                          {photo.is_primary ? "Principal" : "Definir"}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemovePhoto(idx)}
                          className="p-1 text-slate-400 hover:text-rose-600 rounded"
                          title="Remover foto"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-xs text-slate-400 py-4">
                  Nenhuma foto adicionada ainda.
                </p>
              )}
            </div>
          )}

          {/* TAB 3A: DIMENSÕES, PESO & CALCULADORA PPF */}
          {activeTab === "dimensoes_ppf" && productType !== "kit" && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Unidade Medida
                  </label>
                  <select
                    value={dimensionUnit}
                    onChange={(e) => setDimensionUnit(e.target.value as ErpDimensionUnit)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white font-semibold"
                  >
                    <option value="cm">cm (Centímetros)</option>
                    <option value="mm">mm (Milímetros)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Largura ({dimensionUnit})
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={width}
                    onChange={(e) => setWidth(e.target.value)}
                    placeholder="Ex: 50"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Altura/Comp. ({dimensionUnit})
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={height}
                    onChange={(e) => setHeight(e.target.value)}
                    placeholder="Ex: 30"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Espessura ({dimensionUnit})
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={depth}
                    onChange={(e) => setDepth(e.target.value)}
                    placeholder="Opcional"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Peso (gramas)
                  </label>
                  <input
                    type="number"
                    step="1"
                    min="0"
                    value={weightGrams}
                    onChange={(e) => setWeightGrams(e.target.value)}
                    placeholder="Ex: 120"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
              </div>

              {/* Bloco Calculadora PPF */}
              <div className="p-4 rounded-2xl border border-sky-200 bg-sky-50/40 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Calculator className="w-4 h-4 text-sky-600" />
                    <span className="text-xs font-bold text-slate-900">
                      Cálculo Automático de Consumo de Bobina PPF
                    </span>
                  </div>
                  <label className="inline-flex items-center gap-2 text-xs font-semibold text-sky-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={usesPpfRoll}
                      onChange={(e) => setUsesPpfRoll(e.target.checked)}
                      className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                    />
                    Usa Bobina PPF
                  </label>
                </div>

                {usesPpfRoll && (
                  <>
                    {rolls.length === 0 ? (
                      <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs">
                        Nenhuma bobina PPF cadastrada ainda. Cadastre sua bobina (ex: 12m × 1,52m a R$ 220/m) na aba <strong>Bobinas PPF</strong> para habilitar o cálculo automático.
                      </div>
                    ) : (
                      <>
                        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                          <div className="sm:col-span-2">
                            <label className="block text-xs font-semibold text-slate-700 mb-1">
                              Bobina PPF Vinculada *
                            </label>
                            <select
                              value={ppfRollId}
                              onChange={(e) => {
                                const nextId = e.target.value;
                                setPpfRollId(nextId);
                                const r = rolls.find((x) => x.id === nextId);
                                if (r) setPpfWasteMarginPct(String(r.default_waste_margin_pct));
                              }}
                              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white"
                            >
                              <option value="">Selecione a bobina...</option>
                              {rolls.map((r) => (
                                <option key={r.id} value={r.id}>
                                  {r.code} — {r.name} ({r.roll_width_cm}cm | {formatBRL(r.cost_per_linear_meter)}/m)
                                </option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-1">
                              Modo de Cálculo
                            </label>
                            <select
                              value={ppfCalcMode}
                              onChange={(e) => setPpfCalcMode(e.target.value as ErpPpfCalcMode)}
                              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white"
                            >
                              <option value="area">Área proporcional (m²)</option>
                              <option value="linear">Corte linear fixo (larg. total)</option>
                            </select>
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-xs font-semibold text-slate-700 mb-1">
                                Borda (%)
                              </label>
                              <input
                                type="number"
                                step="0.5"
                                min="0"
                                value={ppfWasteMarginPct}
                                onChange={(e) => setPpfWasteMarginPct(e.target.value)}
                                className="w-full px-2.5 py-2 text-xs border border-slate-200 rounded-lg bg-white"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-semibold text-slate-700 mb-1">
                                Qtd Peças
                              </label>
                              <input
                                type="number"
                                min="1"
                                value={ppfPieceCount}
                                onChange={(e) => setPpfPieceCount(e.target.value)}
                                className="w-full px-2.5 py-2 text-xs border border-slate-200 rounded-lg bg-white"
                              />
                            </div>
                          </div>
                        </div>

                        {livePpfCalc && (
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
                            <div className="p-3 rounded-xl bg-white border border-sky-100">
                              <span className="text-[10px] font-bold uppercase text-slate-500">
                                Área c/ Borda (+{ppfWasteMarginPct}%)
                              </span>
                              <p className="text-sm font-extrabold text-slate-900">
                                {livePpfCalc.grossAreaM2.toFixed(4).replace(".", ",")} m²
                              </p>
                              <span className="text-[10px] text-slate-400">
                                Líquida: {livePpfCalc.netAreaM2.toFixed(4).replace(".", ",")} m²
                              </span>
                            </div>
                            <div className="p-3 rounded-xl bg-white border border-sky-100">
                              <span className="text-[10px] font-bold uppercase text-sky-700">
                                Consumo da Bobina
                              </span>
                              <p className="text-sm font-extrabold text-sky-800">
                                {livePpfCalc.linearMeters.toFixed(4).replace(".", ",")} m
                              </p>
                              <span className="text-[10px] text-slate-500">
                                {(livePpfCalc.linearMeters * 100).toFixed(1).replace(".", ",")} cm lineares
                              </span>
                            </div>
                            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200">
                              <span className="text-[10px] font-bold uppercase text-emerald-700">
                                Custo da Película PPF
                              </span>
                              <p className="text-sm font-extrabold text-emerald-800">
                                {formatBRL(livePpfCalc.calculatedCost)}
                              </p>
                              <span className="text-[10px] text-emerald-700">
                                {formatBRL(livePpfCalc.costPerM2)}/m²
                              </span>
                            </div>
                            <div className="p-3 rounded-xl bg-white border border-sky-100">
                              <span className="text-[10px] font-bold uppercase text-slate-500">
                                Rendimento / Bobina
                              </span>
                              <p className="text-sm font-extrabold text-slate-900">
                                {livePpfCalc.piecesPerFullRoll} un
                              </p>
                              <span className="text-[10px] text-slate-400">
                                Bobina de {selectedRoll?.roll_length_m}m
                              </span>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {/* TAB 3B: COMPOSIÇÃO DO KIT (BOM) */}
          {activeTab === "kit" && productType === "kit" && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3 p-3.5 rounded-xl bg-indigo-50/70 border border-indigo-200">
                <div>
                  <span className="text-[10px] font-bold uppercase text-indigo-700">
                    Custo Total do Kit
                  </span>
                  <p className="text-base font-extrabold text-emerald-700">
                    {formatBRL(liveKitSummary.cost)}
                  </p>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase text-indigo-700">
                    Consumo Total PPF
                  </span>
                  <p className="text-base font-extrabold text-sky-800">
                    {liveKitSummary.ppfMeters.toFixed(4).replace(".", ",")} m
                  </p>
                  <span className="text-[10px] text-slate-500">
                    {liveKitSummary.ppfArea.toFixed(4).replace(".", ",")} m²
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase text-indigo-700">
                    Peso Total Estimado
                  </span>
                  <p className="text-base font-extrabold text-slate-900">
                    {liveKitSummary.weight} g
                  </p>
                </div>
              </div>

              <div className="flex gap-2">
                <select
                  value={selectedComponentToAdd}
                  onChange={(e) => setSelectedComponentToAdd(e.target.value)}
                  className="flex-1 px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white"
                >
                  <option value="">Selecione uma Peça PPF ou Acessório para adicionar ao kit...</option>
                  {availableComponents.map((p) => (
                    <option key={p.id} value={p.id}>
                      [{p.product_type === "ppf_piece" ? "PPF" : "SIMPLES"}] {p.sku} — {p.name} (
                      {formatBRL(p.computed_total_cost)}
                      {p.computed_total_ppf_meters > 0
                        ? ` | ${p.computed_total_ppf_meters.toFixed(3)}m`
                        : ""}
                      )
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={handleAddKitComponent}
                  disabled={!selectedComponentToAdd}
                  className="inline-flex items-center gap-1 px-3.5 py-2 text-xs font-semibold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Adicionar Item
                </button>
              </div>

              {kitItems.length > 0 ? (
                <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 overflow-hidden">
                  {kitItems.map((item, idx) => {
                    const comp = componentById.get(item.component_product_id);
                    if (!comp) return null;
                    return (
                      <div
                        key={item.component_product_id}
                        className="px-4 py-2.5 flex items-center justify-between gap-3 bg-white text-xs"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-slate-800 truncate">{comp.name}</p>
                          <p className="text-[11px] text-slate-500">
                            SKU: <span className="font-mono">{comp.sku}</span> • Unitário:{" "}
                            {formatBRL(comp.computed_total_cost)}
                            {comp.computed_total_ppf_meters > 0 && (
                              <span className="text-sky-700 font-medium">
                                {" "}• {(comp.computed_total_ppf_meters * item.quantity).toFixed(4).replace(".", ",")} m PPF
                              </span>
                            )}
                          </p>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[11px] text-slate-500">Qtd:</span>
                            <input
                              type="number"
                              step="0.5"
                              min="0.1"
                              value={item.quantity}
                              onChange={(e) => {
                                const q = Math.max(0.1, Number(e.target.value) || 1);
                                setKitItems((prev) =>
                                  prev.map((x, i) => (i === idx ? { ...x, quantity: q } : x))
                                );
                              }}
                              className="w-16 px-2 py-1 text-xs border border-slate-200 rounded text-center font-semibold"
                            />
                          </div>
                          <span className="font-bold text-emerald-700 w-20 text-right">
                            {formatBRL(comp.computed_total_cost * item.quantity)}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setKitItems((prev) => prev.filter((_, i) => i !== idx))
                            }
                            className="p-1 text-slate-400 hover:text-rose-600"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-8 border border-dashed border-slate-200 rounded-xl text-xs text-slate-400">
                  Adicione peças PPF e acessórios (espátula, borrifador, caixa, manual...) para montar a composição deste kit.
                </div>
              )}
            </div>
          )}

          {/* TAB 4: CUSTOS, ESTOQUE E PREÇO */}
          {activeTab === "estoque_preco" && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {!usesPpfRoll && productType !== "kit" && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Custo Unitário Manual (R$)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={manualCost}
                      onChange={(e) => setManualCost(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg font-semibold"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Custo Adicional (Corte / Acabamento) (R$)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={extraCost}
                    onChange={(e) => setExtraCost(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>

                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200">
                  <span className="text-[10px] font-bold uppercase text-emerald-700">
                    Custo Final Consolidado
                  </span>
                  <p className="text-lg font-extrabold text-emerald-800">
                    {formatBRL(computedTotalCost)}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Preço Sugerido (R$)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={suggestedPrice}
                    onChange={(e) => setSuggestedPrice(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Preço Mínimo (R$)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={minPrice}
                    onChange={(e) => setMinPrice(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Estoque Atual ({unit})
                  </label>
                  <input
                    type="number"
                    step="1"
                    value={stockQuantity}
                    onChange={(e) => setStockQuantity(e.target.value)}
                    disabled={productType === "kit"}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg disabled:bg-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Estoque Mínimo
                  </label>
                  <input
                    type="number"
                    step="1"
                    min="0"
                    value={minStockQuantity}
                    onChange={(e) => setMinStockQuantity(e.target.value)}
                    disabled={productType === "kit"}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg disabled:bg-slate-100"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Localização no Estoque
                  </label>
                  <input
                    type="text"
                    value={storageLocation}
                    onChange={(e) => setStorageLocation(e.target.value)}
                    placeholder="Ex: Prateleira A2, Gaveta PPF-03"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Observações Internas
                  </label>
                  <input
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Notas de produção, plotter, embalagem..."
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Footer actions */}
          <div className="flex items-center justify-between pt-4 border-t border-slate-100">
            <span className="text-[11px] text-slate-500">
              * Campos obrigatórios: Código, SKU e Nome
            </span>
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
                className="inline-flex items-center gap-1.5 px-5 py-2 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-700 rounded-lg disabled:opacity-50 shadow-xs"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {product ? "Salvar Alterações" : "Cadastrar Produto / Kit"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
