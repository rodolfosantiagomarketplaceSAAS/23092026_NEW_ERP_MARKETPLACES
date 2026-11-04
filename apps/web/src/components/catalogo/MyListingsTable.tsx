"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import {
  Tag,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Search,
  Filter,
  Eye,
  ShoppingCart,
  TrendingUp,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  RotateCcw,
  SlidersHorizontal,
  X,
  Copy,
  Check,
  Info,
  AlertCircle,
  Zap,
  MoreVertical,
} from "lucide-react";
import {
  buildMercadoLivreHierarchy,
  type MyListingItem,
  type GroupedFamilyProduct,
  type GroupedVariationNode,
  type SellingOptionItem,
} from "@/lib/catalogo/mlGroupingEngine";

export type { MyListingItem };

interface ListingsTableProps {
  items: MyListingItem[];
}

type SortField =
  | "title"
  | "price"
  | "net"
  | "visits"
  | "sales"
  | "conversion"
  | "quality"
  | "status"
  | "stock";
type SortDirection = "asc" | "desc";

function formatBRL(val: number): string {
  return `R$ ${val.toFixed(2).replace(".", ",")}`;
}

/**
 * Botão compacto de copiar código (#MLB, #Família ou SKU) igual ao ícone de cópia do Mercado Livre
 */
function CopyInlineButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex items-center text-slate-400 hover:text-sky-600 transition-colors p-0.5 rounded hover:bg-slate-100 cursor-pointer"
      title={`Copiar ${label || text}`}
    >
      {copied ? (
        <Check className="w-3 h-3 text-emerald-600" />
      ) : (
        <Copy className="w-3 h-3" />
      )}
    </button>
  );
}

/**
 * Medidor Circular de Qualidade da Opção de Venda (idêntico ao arco 65 laranja / 81 verde do Mercado Livre)
 */
function QualityGauge({
  score,
  objectivesCount,
  isParent = false,
}: {
  score: number;
  objectivesCount: number;
  isParent?: boolean;
}) {
  if (isParent) {
    return (
      <div className="flex flex-col items-center justify-center">
        <div className="w-5 h-5 rounded-full bg-amber-500 text-white flex items-center justify-center font-black text-[11px] shadow-2xs">
          !
        </div>
        <span className="text-[11px] font-semibold text-sky-600 hover:underline mt-1 cursor-pointer">
          {objectivesCount} {objectivesCount === 1 ? "objetivo" : "objetivos"}
        </span>
      </div>
    );
  }

  const isGood = score >= 75;
  const strokeColor = isGood ? "#00A650" : "#F59E0B";
  const textColor = isGood ? "text-[#00A650]" : "text-amber-600";

  // Arco SVG de 240 graus
  const radius = 15;
  const circumference = 2 * Math.PI * radius;
  const arcLength = circumference * 0.72;
  const filledLength = (Math.min(100, Math.max(0, score)) / 100) * arcLength;

  return (
    <div className="flex flex-col items-center justify-center">
      <div className="relative w-10 h-9 flex items-center justify-center">
        <svg className="w-10 h-10 -rotate-[200deg]" viewBox="0 0 40 40">
          <circle
            cx="20"
            cy="20"
            r={radius}
            fill="none"
            stroke="#E2E8F0"
            strokeWidth="3.2"
            strokeDasharray={`${arcLength} ${circumference}`}
            strokeLinecap="round"
          />
          <circle
            cx="20"
            cy="20"
            r={radius}
            fill="none"
            stroke={strokeColor}
            strokeWidth="3.2"
            strokeDasharray={`${filledLength} ${circumference}`}
            strokeLinecap="round"
          />
        </svg>
        <span className={`absolute text-[11px] font-extrabold ${textColor}`}>
          {score}
        </span>
      </div>
      <span className="text-[10.5px] font-semibold text-sky-600 hover:underline leading-tight">
        {objectivesCount} {objectivesCount === 1 ? "objetivo" : "objetivos"}
      </span>
    </div>
  );
}

/**
 * Collage 2x2 de miniaturas para o Anúncio Principal (Família), idêntico ao Mercado Livre
 */
function FamilyThumbnailCollage({
  thumbnails,
  extraCount,
  title,
}: {
  thumbnails: string[];
  extraCount: number;
  title: string;
}) {
  if (thumbnails.length === 0) {
    return (
      <div className="w-14 h-14 rounded border border-slate-200 bg-slate-50 shrink-0 flex items-center justify-center text-slate-400">
        <Tag className="w-5 h-5" />
      </div>
    );
  }

  if (thumbnails.length === 1) {
    return (
      <div className="w-14 h-14 rounded border border-slate-200 bg-white shrink-0 overflow-hidden flex items-center justify-center p-0.5">
        <img
          src={thumbnails[0]}
          alt={title}
          className="w-full h-full object-contain"
        />
      </div>
    );
  }

  const cells = [
    thumbnails[0],
    thumbnails[1] || thumbnails[0],
    thumbnails[2] || thumbnails[0],
    thumbnails[3] || thumbnails[1] || thumbnails[0],
  ];

  return (
    <div className="w-14 h-14 rounded border border-slate-200 bg-white shrink-0 grid grid-cols-2 grid-rows-2 gap-0.5 p-0.5 overflow-hidden shadow-2xs">
      {cells.map((src, idx) => (
        <div
          key={idx}
          className="relative w-full h-full bg-slate-50 rounded-[2px] overflow-hidden flex items-center justify-center"
        >
          <img
            src={src}
            alt={`${title} ${idx + 1}`}
            className="w-full h-full object-cover"
          />
          {idx === 3 && extraCount > 0 && (
            <div className="absolute inset-0 bg-slate-900/65 text-white text-[9px] font-bold flex items-center justify-center">
              +{extraCount}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * Switch visual estilo Mercado Livre (azul ativo / cinza pausado)
 */
function MlStatusSwitch({ active }: { active: boolean }) {
  return (
    <div
      className={`w-8 h-4.5 rounded-full p-0.5 transition-colors inline-flex items-center shrink-0 ${
        active ? "bg-[#3483FA] justify-end" : "bg-slate-300 justify-start"
      }`}
      title={active ? "Anúncio Ativo no Mercado Livre" : "Anúncio Pausado/Inativo"}
    >
      <span className="w-3.5 h-3.5 rounded-full bg-white shadow-xs block" />
    </div>
  );
}

export function MyListingsTable({ items }: ListingsTableProps) {
  // Estados de busca e filtros
  const [searchTerm, setSearchTerm] = useState("");
  const [priceFilter, setPriceFilter] = useState("all");
  const [channelFilter, setChannelFilter] = useState("all");
  const [visitsFilter, setVisitsFilter] = useState("all");
  const [salesFilter, setSalesFilter] = useState("all");
  const [conversionFilter, setConversionFilter] = useState("all");
  const [shippingFilter, setShippingFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showColumnFilters, setShowColumnFilters] = useState(true);

  // Ordenação
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  // Constrói a hierarquia de 3 níveis: Família -> Variações (Sub-anúncios) -> Opções Clássico e Premium
  const familyGroups = useMemo(() => {
    return buildMercadoLivreHierarchy(items);
  }, [items]);

  // Controle de famílias expandidas (por padrão todas abertas como nas imagens do ML)
  const [expandedFamilies, setExpandedFamilies] = useState<Record<string, boolean>>({});
  // Controle de "Ver mais opções de venda" quando uma variação possui > 2 opções (ex: Clássico + Premium + Catálogo)
  const [expandedExtraOptions, setExpandedExtraOptions] = useState<Record<string, boolean>>({});

  const isFamilyExpanded = (groupKey: string) => {
    return expandedFamilies[groupKey] ?? true;
  };

  const toggleFamily = (groupKey: string) => {
    setExpandedFamilies((prev) => ({
      ...prev,
      [groupKey]: !(prev[groupKey] ?? true),
    }));
  };

  const toggleExtraOptions = (varKey: string) => {
    setExpandedExtraOptions((prev) => ({
      ...prev,
      [varKey]: !prev[varKey],
    }));
  };

  // Contagem de filtros ativos
  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (searchTerm.trim() !== "") count++;
    if (priceFilter !== "all") count++;
    if (channelFilter !== "all") count++;
    if (visitsFilter !== "all") count++;
    if (salesFilter !== "all") count++;
    if (conversionFilter !== "all") count++;
    if (shippingFilter !== "all") count++;
    if (statusFilter !== "all") count++;
    return count;
  }, [
    searchTerm,
    priceFilter,
    channelFilter,
    visitsFilter,
    salesFilter,
    conversionFilter,
    shippingFilter,
    statusFilter,
  ]);

  const clearAllFilters = () => {
    setSearchTerm("");
    setPriceFilter("all");
    setChannelFilter("all");
    setVisitsFilter("all");
    setSalesFilter("all");
    setConversionFilter("all");
    setShippingFilter("all");
    setStatusFilter("all");
    setSortField(null);
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      if (sortDirection === "desc") {
        setSortDirection("asc");
      } else {
        setSortField(null);
        setSortDirection("desc");
      }
    } else {
      setSortField(field);
      setSortDirection(field === "title" ? "asc" : "desc");
    }
  };

  // Filtragem e Ordenação das Famílias e Sub-anúncios
  const processedFamilies = useMemo(() => {
    const result = familyGroups.filter((family) => {
      // 1. Busca textual (Título da família, nome da variação, SKU, #familyId ou #MLB)
      if (searchTerm.trim() !== "") {
        const q = searchTerm.toLowerCase().replace(/^#/, "").trim();
        const matchFamilyTitle = family.familyTitle.toLowerCase().includes(q);
        const matchFamilyId = family.familyId.toLowerCase().includes(q);
        const matchVariation = family.variations.some(
          (v) =>
            v.variationName.toLowerCase().includes(q) ||
            (v.sku && v.sku.toLowerCase().includes(q)) ||
            v.mlbIds.some(
              (m) =>
                m.externalId.toLowerCase().includes(q) ||
                m.cleanDigits.toLowerCase().includes(q)
            )
        );
        if (!matchFamilyTitle && !matchFamilyId && !matchVariation) return false;
      }

      // 2. Filtro de Preço
      if (priceFilter !== "all") {
        if (priceFilter === "0-50" && family.minPrice > 50) return false;
        if (priceFilter === "50-100" && (family.maxPrice < 50 || family.minPrice > 100))
          return false;
        if (priceFilter === "100-200" && (family.maxPrice < 100 || family.minPrice > 200))
          return false;
        if (priceFilter === "200+" && family.maxPrice < 200) return false;
      }

      // 3. Filtro de Condição (Clássico / Premium)
      if (channelFilter !== "all") {
        if (channelFilter === "both" && !family.hasBothChannels) return false;
        if (channelFilter === "classic" && !family.hasClassic) return false;
        if (channelFilter === "premium" && !family.hasPremium) return false;
      }

      // 4. Filtro de Visitas
      if (visitsFilter !== "all") {
        const v = family.totalVisits;
        if (visitsFilter === "500+" && v < 500) return false;
        if (visitsFilter === "100+" && v < 100) return false;
        if (visitsFilter === "10+" && v < 10) return false;
        if (visitsFilter === "0-10" && v >= 10) return false;
      }

      // 5. Filtro de Vendas
      if (salesFilter !== "all") {
        if (salesFilter === "with-sales" && family.totalSold === 0 && family.totalSales7d === 0)
          return false;
        if (salesFilter === "no-sales" && (family.totalSold > 0 || family.totalSales7d > 0))
          return false;
        if (salesFilter === "sales-7d" && family.totalSales7d === 0) return false;
      }

      // 6. Filtro de Conversão
      if (conversionFilter !== "all") {
        const c = family.conversionRate;
        if (conversionFilter === "high" && c < 5.0) return false;
        if (conversionFilter === "medium" && (c < 1.5 || c >= 5.0)) return false;
        if (conversionFilter === "low" && (c <= 0 || c >= 1.5)) return false;
      }

      // 7. Filtro de Frete / Logística
      if (shippingFilter !== "all") {
        if (shippingFilter === "free" && !family.hasFreeShipping) return false;
        if (shippingFilter === "buyer" && !family.hasBuyerShipping) return false;
        if (shippingFilter === "ml_full" && family.shippingType !== "ml_full") return false;
      }

      // 8. Filtro de Status
      if (statusFilter !== "all") {
        if (statusFilter === "active" && family.primaryStatus !== "active") return false;
        if (statusFilter === "paused" && family.inactiveVariationsCount === 0 && family.primaryStatus === "active")
          return false;
      }

      return true;
    });

    if (sortField) {
      result.sort((a, b) => {
        let valA: number | string = 0;
        let valB: number | string = 0;

        switch (sortField) {
          case "title":
            return sortDirection === "asc"
              ? a.familyTitle.localeCompare(b.familyTitle)
              : b.familyTitle.localeCompare(a.familyTitle);
          case "price":
            valA = a.minPrice;
            valB = b.minPrice;
            break;
          case "net":
            valA = a.minNetAmount;
            valB = b.minNetAmount;
            break;
          case "visits":
            valA = a.totalVisits;
            valB = b.totalVisits;
            break;
          case "sales":
            valA = a.totalSales7d;
            valB = b.totalSales7d;
            break;
          case "conversion":
            valA = a.conversionRate;
            valB = b.conversionRate;
            break;
          case "quality":
            valA = a.avgQualityScore;
            valB = b.avgQualityScore;
            break;
          case "stock":
            valA = a.totalStock;
            valB = b.totalStock;
            break;
          case "status":
            valA = a.primaryStatus === "active" ? 1 : 0;
            valB = b.primaryStatus === "active" ? 1 : 0;
            break;
        }

        if (valA < valB) return sortDirection === "asc" ? -1 : 1;
        if (valA > valB) return sortDirection === "asc" ? 1 : -1;
        return 0;
      });
    }

    return result;
  }, [
    familyGroups,
    searchTerm,
    priceFilter,
    channelFilter,
    visitsFilter,
    salesFilter,
    conversionFilter,
    shippingFilter,
    statusFilter,
    sortField,
    sortDirection,
  ]);

  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return (
        <ArrowUpDown className="w-3 h-3 text-slate-300 group-hover:text-slate-600 transition-colors" />
      );
    }
    return sortDirection === "asc" ? (
      <ArrowUp className="w-3 h-3 text-sky-600 font-bold" />
    ) : (
      <ArrowDown className="w-3 h-3 text-sky-600 font-bold" />
    );
  };

  if (!items || items.length === 0) {
    return (
      <div className="py-12 text-center text-slate-400 text-xs">
        Nenhum anúncio cadastrado no sistema ainda. Clique em &quot;Sincronizar Anúncios do ML&quot; acima.
      </div>
    );
  }

  const totalVariationsShown = processedFamilies.reduce(
    (acc, f) => acc + f.variations.length,
    0
  );

  return (
    <div className="space-y-0">
      {/* BARRA SUPERIOR DE PESQUISA E CONTROLES DE HIERARQUIA */}
      <div className="p-3 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 text-xs">
        <div className="relative flex-1 max-w-lg">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar por Anúncio Principal, Variação, SKU, #Família ou #MLB..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-white border border-slate-300 rounded pl-8 pr-8 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#3483FA] placeholder:text-slate-400"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              title="Limpar busca"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setShowColumnFilters((prev) => !prev)}
            className={`px-2.5 py-1.5 rounded font-semibold text-[11px] border flex items-center gap-1.5 transition-colors cursor-pointer ${
              showColumnFilters
                ? "bg-sky-50 text-sky-700 border-sky-300 shadow-2xs"
                : "bg-white text-slate-700 border-slate-200 hover:bg-slate-100"
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-sky-600" />
            <span>Filtros Rápidos</span>
            {activeFiltersCount > 0 && (
              <span className="w-4 h-4 rounded-full bg-sky-600 text-white text-[9.5px] font-bold flex items-center justify-center">
                {activeFiltersCount}
              </span>
            )}
          </button>

          {activeFiltersCount > 0 && (
            <button
              type="button"
              onClick={clearAllFilters}
              className="px-2.5 py-1.5 bg-rose-50 border border-rose-200 hover:bg-rose-100 text-rose-700 rounded font-semibold text-[11px] flex items-center gap-1 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              Limpar Filtros ({activeFiltersCount})
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              const anyCollapsed = processedFamilies.some(
                (f) => !isFamilyExpanded(f.groupKey)
              );
              const nextState: Record<string, boolean> = {};
              processedFamilies.forEach((f) => {
                nextState[f.groupKey] = anyCollapsed;
              });
              setExpandedFamilies(nextState);
            }}
            className="px-2.5 py-1.5 bg-white border border-slate-200 hover:bg-slate-100 rounded text-slate-700 font-medium text-[11px] transition-colors cursor-pointer"
          >
            Expandir / Recolher Famílias
          </button>
        </div>
      </div>

      {/* RESUMO DA VISUALIZAÇÃO */}
      <div className="px-4 py-2 bg-[#F5F5F5] border-b border-slate-200 flex items-center justify-between gap-2 flex-wrap text-[11px] text-slate-600">
        <div className="flex items-center gap-2">
          <span className="font-bold text-slate-800">
            {processedFamilies.length}{" "}
            {processedFamilies.length === 1 ? "Anúncio Principal (Família)" : "Anúncios Principais (Famílias)"}
          </span>
          <span>•</span>
          <span>
            <strong>{totalVariationsShown}</strong> sub-anúncios/variações agrupadas
          </span>
          <span>•</span>
          <span>
            <strong>{items.length}</strong> opções de venda (Clássico / Premium)
          </span>
        </div>
        <div className="text-[11px] text-slate-500 flex items-center gap-3">
          <span className="inline-flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-slate-800" /> Nível 1: Família (#ID)
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-[#3483FA]" /> Nível 2: Sub-anúncio (Variação + SKU)
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-600" /> Nível 3: Opções Clássico & Premium
          </span>
        </div>
      </div>

      {/* TABELA NO PADRÃO EXATO DO MERCADO LIVRE */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs min-w-[1220px]">
          <thead>
            <tr className="bg-[#EDEDED] border-b border-slate-300 text-slate-700 font-semibold text-[11.5px] select-none">
              <th className="py-3 px-2.5 w-10 text-center">
                <input
                  type="checkbox"
                  aria-label="Selecionar todos os anúncios"
                  className="w-3.5 h-3.5 rounded border-slate-300 text-[#3483FA] focus:ring-0"
                />
              </th>

              <th
                onClick={() => handleSort("title")}
                className="py-3 px-3 min-w-[330px] cursor-pointer hover:bg-slate-200/70 transition-colors group border-r border-slate-200/80"
              >
                <div className="flex items-center justify-between gap-1">
                  <span>Anúncio</span>
                  {renderSortIcon("title")}
                </div>
              </th>

              <th
                onClick={() => handleSort("price")}
                className="py-3 px-3 min-w-[165px] cursor-pointer hover:bg-slate-200/70 transition-colors group border-r border-slate-200/80"
              >
                <div className="flex items-center justify-between gap-1">
                  <span>Preço</span>
                  {renderSortIcon("price")}
                </div>
              </th>

              <th className="py-3 px-3 min-w-[185px] border-r border-slate-200/80">
                <span>Condições</span>
              </th>

              <th
                onClick={() => handleSort("net")}
                className="py-3 px-3 min-w-[130px] cursor-pointer hover:bg-slate-200/70 transition-colors group border-r border-slate-200/80"
              >
                <div className="flex items-center justify-between gap-1">
                  <span>Você recebe</span>
                  {renderSortIcon("net")}
                </div>
              </th>

              <th
                onClick={() => handleSort("visits")}
                className="py-3 px-3 min-w-[130px] cursor-pointer hover:bg-slate-200/70 transition-colors group border-r border-slate-200/80"
              >
                <div className="flex items-center justify-between gap-1">
                  <span>Métricas últ. 7 dias</span>
                  {renderSortIcon("visits")}
                </div>
              </th>

              <th
                onClick={() => handleSort("quality")}
                className="py-3 px-3 text-center min-w-[95px] cursor-pointer hover:bg-slate-200/70 transition-colors group border-r border-slate-200/80"
              >
                <div className="flex items-center justify-center gap-1">
                  <span>Qualidade</span>
                  {renderSortIcon("quality")}
                </div>
              </th>

              <th
                onClick={() => handleSort("status")}
                className="py-3 px-3 min-w-[215px] cursor-pointer hover:bg-slate-200/70 transition-colors group"
              >
                <div className="flex items-center justify-between gap-1">
                  <span>Status e recomendações</span>
                  {renderSortIcon("status")}
                </div>
              </th>
            </tr>

            {/* LINHA DE FILTROS RÁPIDOS DE COLUNA */}
            {showColumnFilters && (
              <tr className="bg-slate-100 border-b border-slate-300 text-[11px]">
                <td className="py-1.5 px-2 text-center">
                  <Filter className="w-3.5 h-3.5 text-slate-400 mx-auto" />
                </td>
                <td className="py-1.5 px-3 border-r border-slate-200/80">
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Filtrar por nome, SKU, #família ou #MLB..."
                    className="w-full bg-white border border-slate-300 rounded px-2 py-1 text-[11px] text-slate-800 focus:outline-none focus:border-[#3483FA]"
                  />
                </td>
                <td className="py-1.5 px-3 border-r border-slate-200/80">
                  <select
                    value={priceFilter}
                    onChange={(e) => setPriceFilter(e.target.value)}
                    aria-label="Filtrar por faixa de preço"
                    className="w-full bg-white border border-slate-300 rounded px-1.5 py-1 text-[11px] text-slate-700"
                  >
                    <option value="all">Todos os preços</option>
                    <option value="0-50">Até R$ 50</option>
                    <option value="50-100">R$ 50 a R$ 100</option>
                    <option value="100-200">R$ 100 a R$ 200</option>
                    <option value="200+">Acima de R$ 200</option>
                  </select>
                </td>
                <td className="py-1.5 px-3 border-r border-slate-200/80">
                  <select
                    value={channelFilter}
                    onChange={(e) => setChannelFilter(e.target.value)}
                    aria-label="Filtrar por condição de venda"
                    className="w-full bg-white border border-slate-300 rounded px-1.5 py-1 text-[11px] text-slate-700"
                  >
                    <option value="all">Clássico e Premium</option>
                    <option value="both">Ambos (Clássico + Premium)</option>
                    <option value="classic">Possui Clássico</option>
                    <option value="premium">Possui Premium</option>
                  </select>
                </td>
                <td className="py-1.5 px-3 border-r border-slate-200/80">
                  <select
                    value={shippingFilter}
                    onChange={(e) => setShippingFilter(e.target.value)}
                    aria-label="Filtrar por tipo de envio"
                    className="w-full bg-white border border-slate-300 rounded px-1.5 py-1 text-[11px] text-slate-700"
                  >
                    <option value="all">Todos os envios</option>
                    <option value="free">Com frete grátis</option>
                    <option value="buyer">Envio por conta do comprador</option>
                    <option value="ml_full">⚡ Mercado Envios Full</option>
                  </select>
                </td>
                <td className="py-1.5 px-3 border-r border-slate-200/80">
                  <select
                    value={salesFilter}
                    onChange={(e) => setSalesFilter(e.target.value)}
                    aria-label="Filtrar por volume de vendas"
                    className="w-full bg-white border border-slate-300 rounded px-1.5 py-1 text-[11px] text-slate-700"
                  >
                    <option value="all">Todas as métricas</option>
                    <option value="sales-7d">Com vendas nos últ. 7 dias</option>
                    <option value="with-sales">Com histórico de vendas</option>
                    <option value="no-sales">Sem vendas</option>
                  </select>
                </td>
                <td className="py-1.5 px-2 border-r border-slate-200/80">
                  <select
                    value={conversionFilter}
                    onChange={(e) => setConversionFilter(e.target.value)}
                    aria-label="Filtrar por conversão"
                    className="w-full bg-white border border-slate-300 rounded px-1 py-1 text-[11px] text-slate-700"
                  >
                    <option value="all">Qualidade/Conv.</option>
                    <option value="high">Conv. ≥ 5%</option>
                    <option value="medium">Conv. 1.5% - 5%</option>
                    <option value="low">Conv. &lt; 1.5%</option>
                  </select>
                </td>
                <td className="py-1.5 px-3 flex items-center gap-1.5">
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    aria-label="Filtrar por status do anúncio"
                    className="flex-1 bg-white border border-slate-300 rounded px-1.5 py-1 text-[11px] text-slate-700"
                  >
                    <option value="all">Todos os status</option>
                    <option value="active">Ativos</option>
                    <option value="paused">Com variação inativa/pausada</option>
                  </select>
                  <button
                    type="button"
                    onClick={clearAllFilters}
                    className="px-2 py-1 rounded bg-slate-200 hover:bg-slate-300 text-slate-700 text-[10px] font-bold transition-colors cursor-pointer"
                  >
                    Reset
                  </button>
                </td>
              </tr>
            )}
          </thead>

          <tbody>
            {processedFamilies.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-12 text-center">
                  <div className="flex flex-col items-center justify-center space-y-2">
                    <Filter className="w-8 h-8 text-slate-300" />
                    <p className="text-xs font-semibold text-slate-700">
                      Nenhum anúncio principal ou variação corresponde aos filtros aplicados.
                    </p>
                    <button
                      type="button"
                      onClick={clearAllFilters}
                      className="px-3 py-1 bg-sky-50 text-sky-700 hover:bg-sky-100 border border-sky-300 rounded text-xs font-semibold transition-colors cursor-pointer"
                    >
                      Limpar Filtros
                    </button>
                  </div>
                </td>
              </tr>
            ) : (
              processedFamilies.map((family) => {
                const expanded = isFamilyExpanded(family.groupKey);

                return (
                  <React.Fragment key={family.groupKey}>
                    {/* ===================================================================== */}
                    {/* NÍVEL 1: LINHA DO ANÚNCIO PRINCIPAL / FAMÍLIA (IGUAL AO MERCADO LIVRE) */}
                    {/* ===================================================================== */}
                    <tr className="bg-white hover:bg-slate-50/60 border-t-[6px] border-t-[#EDEDED] border-b border-b-slate-200 transition-colors">
                      {/* Coluna 1: Checkbox + Seta Azul de Expandir/Recolher Família */}
                      <td className="py-3.5 px-2.5 align-top text-center">
                        <div className="flex flex-col items-center gap-2.5">
                          <input
                            type="checkbox"
                            aria-label={`Selecionar família ${family.familyTitle}`}
                            className="w-3.5 h-3.5 rounded border-slate-300 text-[#3483FA] focus:ring-0"
                          />
                          <button
                            type="button"
                            onClick={() => toggleFamily(family.groupKey)}
                            className="p-0.5 text-[#3483FA] hover:bg-sky-50 rounded transition-colors cursor-pointer"
                            title={
                              expanded
                                ? "Recolher sub-anúncios e variações"
                                : "Expandir sub-anúncios e variações"
                            }
                          >
                            {expanded ? (
                              <ChevronUp className="w-4 h-4 stroke-[2.5]" />
                            ) : (
                              <ChevronDown className="w-4 h-4 stroke-[2.5]" />
                            )}
                          </button>
                        </div>
                      </td>

                      {/* Coluna 2: Miniatura Collage + Título Principal + #ID da Família + Estoque Total */}
                      <td className="py-3.5 px-3 align-top">
                        <div className="flex items-start gap-3">
                          <FamilyThumbnailCollage
                            thumbnails={family.collageThumbnails}
                            extraCount={family.extraPhotosCount}
                            title={family.familyTitle}
                          />
                          <div className="min-w-0 flex-1">
                            <button
                              type="button"
                              onClick={() => toggleFamily(family.groupKey)}
                              className="text-left font-bold text-slate-900 text-[12.5px] leading-snug hover:text-[#3483FA] transition-colors line-clamp-2 cursor-pointer"
                            >
                              {family.familyTitle}
                            </button>

                            <div className="flex items-center gap-1 text-[11px] text-slate-500 font-mono mt-1">
                              <span>#{family.familyId}</span>
                              <CopyInlineButton
                                text={family.familyId}
                                label="ID do Anúncio Principal"
                              />
                            </div>

                            <div className="text-[11.5px] font-semibold text-slate-700 mt-0.5">
                              Estoque: {family.totalStock.toLocaleString("pt-BR")} un.
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Coluna 3: Faixa de Preço Consolidada da Família */}
                      <td className="py-3.5 px-3 align-top">
                        <div className="text-[12.5px] font-bold text-slate-900 leading-snug">
                          {family.minBasePrice === family.maxBasePrice ? (
                            <span>{formatBRL(family.minBasePrice)}</span>
                          ) : (
                            <span>
                              {formatBRL(family.minBasePrice)} a{" "}
                              {formatBRL(family.maxBasePrice)}
                            </span>
                          )}
                        </div>

                        {family.hasPromoInFamily && (
                          <div className="text-[11px] text-slate-700 mt-0.5 leading-snug">
                            em promoção{" "}
                            {family.minPromoPrice === family.maxPromoPrice ? (
                              <strong className="font-semibold text-slate-900">
                                a {formatBRL(family.minPromoPrice)}
                              </strong>
                            ) : (
                              <span>
                                de{" "}
                                <strong className="font-semibold text-slate-900">
                                  {formatBRL(family.minPromoPrice)}
                                </strong>{" "}
                                a{" "}
                                <strong className="font-semibold text-slate-900">
                                  {formatBRL(family.maxPromoPrice)}
                                </strong>
                              </span>
                            )}
                          </div>
                        )}

                        {family.hasWholesaleInFamily && (
                          <div className="text-[11px] text-slate-600 mt-1 flex items-center gap-1">
                            <span>Com preços de atacado</span>
                            <Info className="w-3 h-3 text-[#3483FA] shrink-0" />
                          </div>
                        )}
                      </td>

                      {/* Coluna 4: Condições Consolidadas (Clássico e Premium + Frete) */}
                      <td className="py-3.5 px-3 align-top">
                        <div className="text-[12px] font-semibold text-slate-900">
                          {family.hasBothChannels
                            ? "Clássico e Premium"
                            : family.hasPremium
                            ? "Premium"
                            : "Clássico"}
                        </div>
                        <div className="text-[11px] text-slate-400 leading-tight mt-0.5">
                          Você paga até {formatBRL(family.maxSaleFee)}
                        </div>

                        <div className="text-[11.5px] font-semibold text-slate-800 mt-1.5 leading-tight">
                          {family.hasFreeShipping && family.hasBuyerShipping
                            ? "Com e sem frete grátis"
                            : family.hasFreeShipping
                            ? "Com frete grátis"
                            : "Envio por conta do comprador"}
                        </div>
                        <div className="text-[11px] text-slate-400 leading-tight mt-0.5">
                          Você paga até {formatBRL(family.maxShippingCost)}
                        </div>
                      </td>

                      {/* Coluna 5: Você Recebe (Faixa Líquida da Família) */}
                      <td className="py-3.5 px-3 align-top">
                        <div className="text-[12.5px] font-bold text-slate-900 leading-snug inline-flex items-center gap-1 flex-wrap">
                          {family.minNetAmount === family.maxNetAmount ? (
                            <span>{formatBRL(family.minNetAmount)}</span>
                          ) : (
                            <span>
                              {formatBRL(family.minNetAmount)} a{" "}
                              {formatBRL(family.maxNetAmount)}
                            </span>
                          )}
                          <span
                            title="Valor líquido estimado descontando tarifas de venda (Clássico/Premium) e custos de envio"
                            className="inline-flex"
                          >
                            <Info className="w-3.5 h-3.5 text-[#3483FA] shrink-0" />
                          </span>
                        </div>
                      </td>

                      {/* Coluna 6: Métricas Últimos 7 Dias Consolidada */}
                      <td className="py-3.5 px-3 align-top">
                        <div className="space-y-1 text-[11.5px] text-slate-700">
                          <div
                            className="flex items-center gap-1.5"
                            title="Visitas nos anúncios da família"
                          >
                            <Eye className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span className="font-semibold text-slate-800">
                              {family.totalVisits.toLocaleString("pt-BR")}
                            </span>
                            <span
                              className={`text-[9px] ${
                                family.trend === "down"
                                  ? "text-rose-500"
                                  : "text-[#00A650]"
                              }`}
                            >
                              {family.trend === "down" ? "▼" : "▲"}
                            </span>
                          </div>

                          <div
                            className="flex items-center gap-1.5"
                            title={`Vendas 7d: ${family.totalSales7d} un. | Vendas 30d: ${family.totalSales30d} un. | Total acumulado: ${family.totalSold} un.`}
                          >
                            <ShoppingCart className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span className="font-semibold text-slate-800">
                              {family.totalSales7d}
                            </span>
                            {family.totalSales7d > 0 && (
                              <span className="text-[9px] text-[#00A650]">▲</span>
                            )}
                            {family.totalSold > 0 && (
                              <span className="text-[10px] text-slate-400">
                                ({family.totalSold} total)
                              </span>
                            )}
                          </div>

                          <div
                            className="flex items-center gap-1.5"
                            title="Taxa de conversão (Vendas / Visitas)"
                          >
                            <TrendingUp className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span className="font-semibold text-slate-800">
                              {family.conversionRate.toFixed(1).replace(".", ",")}%
                            </span>
                            {family.conversionRate > 0 && (
                              <span className="text-[9px] text-[#00A650]">▲</span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Coluna 7: Qualidade do Pai */}
                      <td className="py-3.5 px-3 align-top text-center">
                        <QualityGauge
                          score={family.avgQualityScore}
                          objectivesCount={family.totalObjectives}
                          isParent
                        />
                      </td>

                      {/* Coluna 8: Status e Recomendações do Pai */}
                      <td className="py-3.5 px-3 align-top">
                        <div className="flex items-start justify-between gap-2">
                          <div className="text-[11px] leading-snug">
                            {family.inactiveVariationsCount > 0 ? (
                              <>
                                <div className="font-bold text-rose-600">Inativa</div>
                                <div className="text-rose-500 font-medium">
                                  em {family.inactiveVariationsCount}{" "}
                                  {family.inactiveVariationsCount === 1
                                    ? "variação"
                                    : "variações"}
                                </div>
                                <div className="text-[10.5px] text-slate-500 mt-0.5">
                                  Verifique estoque ou opções pausadas.
                                </div>
                              </>
                            ) : (
                              <>
                                <div className="font-bold text-slate-800">
                                  Família ativa
                                </div>
                                <div className="text-[10.5px] text-slate-500 mt-0.5">
                                  {family.variations.length}{" "}
                                  {family.variations.length === 1
                                    ? "sub-anúncio ativo"
                                    : "sub-anúncios organizados"}
                                </div>
                              </>
                            )}
                            <Link
                              href={`/inteligencia?q=${encodeURIComponent(
                                family.familyTitle
                              )}`}
                              className="inline-flex items-center gap-1 mt-1.5 text-[10.5px] font-semibold text-[#3483FA] hover:underline"
                            >
                              <span>Comparar Buybox →</span>
                            </Link>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <MlStatusSwitch
                              active={family.primaryStatus === "active"}
                            />
                            <MoreVertical className="w-4 h-4 text-slate-400" />
                          </div>
                        </div>
                      </td>
                    </tr>

                    {/* ===================================================================== */}
                    {/* NÍVEL 2 & 3: SUB-ANÚNCIOS (VARIAÇÕES) E SUAS OPÇÕES DE VENDA EMPILHADAS */}
                    {/* ===================================================================== */}
                    {expanded &&
                      family.variations.map((variation: GroupedVariationNode) => {
                        const showAllOpts =
                          !!expandedExtraOptions[variation.variationKey];
                        const visibleOptions: SellingOptionItem[] = showAllOpts
                          ? variation.sellingOptions
                          : variation.sellingOptions.slice(0, 2);
                        const hiddenOptionsCount = Math.max(
                          0,
                          variation.sellingOptions.length - 2
                        );
                        const rowSpanCount = visibleOptions.length;

                        return (
                          <React.Fragment key={variation.variationKey}>
                            {visibleOptions.map((opt, optIdx) => {
                              const isFirstOption = optIdx === 0;
                              const isLastVisibleOption =
                                optIdx === visibleOptions.length - 1;

                              return (
                                <tr
                                  key={opt.optionKey}
                                  className={`bg-white hover:bg-slate-50/50 transition-colors ${
                                    isFirstOption
                                      ? "border-t border-slate-200"
                                      : "border-t border-slate-100"
                                  }`}
                                >
                                  {/* CÉLULAS DA ESQUERDA (VARIAÇÃO / SUB-ANÚNCIO) COM ROWSPAN */}
                                  {isFirstOption && (
                                    <>
                                      {/* Indented Checkbox Cell */}
                                      <td
                                        rowSpan={rowSpanCount}
                                        className="py-3.5 pl-6 pr-1 align-top text-center bg-white"
                                      >
                                        <input
                                          type="checkbox"
                                          aria-label={`Selecionar variação ${variation.variationName}`}
                                          className="w-3.5 h-3.5 rounded border-slate-300 text-[#3483FA] focus:ring-0 mt-1"
                                        />
                                      </td>

                                      {/* Dados da Variação: Foto + Nome + Lista de #MLBs + SKU + Estoque */}
                                      <td
                                        rowSpan={rowSpanCount}
                                        className="py-3.5 px-3 align-top border-r border-slate-100 bg-white"
                                      >
                                        <div className="flex items-start gap-3">
                                          {/* Miniatura da Variação */}
                                          <a
                                            href={
                                              variation.mlbIds[0]?.permalink ||
                                              opt.permalink
                                            }
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="w-11 h-11 rounded border border-slate-200 bg-white shrink-0 flex items-center justify-center overflow-hidden p-0.5 hover:border-[#3483FA] transition-colors"
                                            title="Abrir anúncio no Mercado Livre"
                                          >
                                            {variation.thumbnail ||
                                            family.thumbnail ? (
                                              <img
                                                src={
                                                  variation.thumbnail ||
                                                  family.thumbnail ||
                                                  ""
                                                }
                                                alt={variation.variationName}
                                                className="w-full h-full object-contain"
                                              />
                                            ) : (
                                              <Tag className="w-4 h-4 text-slate-400" />
                                            )}
                                          </a>

                                          <div className="min-w-0 flex-1">
                                            {/* Título do Sub-anúncio / Variação */}
                                            <div
                                              className="font-bold text-slate-900 text-[12px] leading-snug line-clamp-2"
                                              title={variation.variationName}
                                            >
                                              {variation.variationName}
                                            </div>

                                            {/* Lista Vertical de todos os #MLBs desta Variação (exatamente como nas imagens!) */}
                                            <div className="mt-1 space-y-0.5">
                                              {variation.mlbIds.map((mlbObj) => (
                                                <div
                                                  key={mlbObj.externalId}
                                                  className="flex items-center gap-1 text-[11px] text-slate-500 font-mono leading-tight"
                                                >
                                                  <a
                                                    href={mlbObj.permalink}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="hover:text-[#3483FA] hover:underline"
                                                    title={`Abrir #${mlbObj.cleanDigits} (${mlbObj.channelLabel}${
                                                      mlbObj.isCatalog
                                                        ? " • Catálogo"
                                                        : ""
                                                    }) no Mercado Livre`}
                                                  >
                                                    #{mlbObj.cleanDigits}
                                                  </a>
                                                  <CopyInlineButton
                                                    text={mlbObj.cleanDigits}
                                                    label={`#${mlbObj.cleanDigits}`}
                                                  />
                                                </div>
                                              ))}
                                            </div>

                                            {/* SKU da Variação com botão de copiar */}
                                            {variation.sku &&
                                              variation.sku !== "SEM-SKU" && (
                                                <div className="flex items-center gap-1 text-[11px] text-slate-500 mt-0.5">
                                                  <span>
                                                    SKU {variation.sku}
                                                  </span>
                                                  <CopyInlineButton
                                                    text={variation.sku}
                                                    label={`SKU ${variation.sku}`}
                                                  />
                                                </div>
                                              )}

                                            {/* Estoque da Variação */}
                                            <div className="text-[11.5px] font-semibold text-slate-800 mt-1">
                                              Estoque:{" "}
                                              {variation.stock.toLocaleString(
                                                "pt-BR"
                                              )}{" "}
                                              un.
                                            </div>
                                          </div>
                                        </div>
                                      </td>
                                    </>
                                  )}

                                  {/* ================================================================= */}
                                  {/* NÍVEL 3: CÉLULAS EMPILHADAS DA OPÇÃO DE VENDA (CLÁSSICO / PREMIUM) */}
                                  {/* ================================================================= */}

                                  {/* Preço da Opção de Venda */}
                                  <td className="py-3.5 px-3 align-top">
                                    <div className="font-bold text-slate-900 text-[12.5px]">
                                      {formatBRL(opt.basePrice)}
                                    </div>
                                    {opt.hasPromo && (
                                      <div className="text-[11px] text-slate-700 mt-0.5">
                                        em promoção{" "}
                                        <strong className="font-semibold text-slate-900">
                                          a {formatBRL(opt.price)}
                                        </strong>
                                      </div>
                                    )}
                                    {opt.hasWholesale && (
                                      <div className="text-[11px] text-slate-600 mt-0.5 flex items-center gap-1">
                                        <span>Com preços de atacado</span>
                                        <Info className="w-3 h-3 text-[#3483FA] shrink-0" />
                                      </div>
                                    )}
                                  </td>

                                  {/* Condições da Opção de Venda (Clássico ou Premium + Tarifa + Envio) */}
                                  <td className="py-3.5 px-3 align-top">
                                    <div className="flex items-center gap-1.5">
                                      <span className="font-bold text-slate-900 text-[12px]">
                                        {opt.channelLabel}
                                      </span>
                                      {opt.isCatalog && (
                                        <span className="text-[9.5px] font-bold px-1.5 py-0.2 rounded bg-sky-100 text-sky-800 border border-sky-200">
                                          Catálogo
                                        </span>
                                      )}
                                    </div>
                                    <div className="text-[11px] text-slate-400 leading-tight mt-0.5">
                                      A pagar {formatBRL(opt.saleFeeAmount)}
                                    </div>

                                    <div className="text-[11.5px] font-semibold text-slate-800 mt-1.5 leading-tight">
                                      {opt.freeShipping
                                        ? "Frete grátis"
                                        : "Envio por conta do comprador"}
                                    </div>
                                    <div className="text-[11px] text-slate-400 leading-tight mt-0.5">
                                      A pagar {formatBRL(opt.shippingCost)}
                                    </div>
                                  </td>

                                  {/* Você recebe (Líquido da Opção) */}
                                  <td className="py-3.5 px-3 align-top">
                                    <div className="font-bold text-slate-900 text-[12.5px] inline-flex items-center gap-1">
                                      <span>{formatBRL(opt.netAmount)}</span>
                                      <span
                                        title={`Cálculo líquido: ${formatBRL(
                                          opt.price
                                        )} - Tarifa ${formatBRL(
                                          opt.saleFeeAmount
                                        )} - Envio ${formatBRL(
                                          opt.shippingCost
                                        )} = ${formatBRL(opt.netAmount)}`}
                                        className="inline-flex"
                                      >
                                        <Info className="w-3.5 h-3.5 text-[#3483FA] shrink-0" />
                                      </span>
                                    </div>
                                  </td>

                                  {/* Métricas últ. 7 dias da Opção */}
                                  <td className="py-3.5 px-3 align-top">
                                    <div className="space-y-1 text-[11.5px] text-slate-700">
                                      <div className="flex items-center gap-1.5">
                                        <Eye className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                        {opt.visits > 0 ? (
                                          <>
                                            <span className="font-medium text-slate-800">
                                              {opt.visits.toLocaleString(
                                                "pt-BR"
                                              )}
                                            </span>
                                            <span
                                              className={`text-[9px] ${
                                                opt.trend === "down"
                                                  ? "text-rose-500"
                                                  : "text-[#00A650]"
                                              }`}
                                            >
                                              {opt.trend === "down"
                                                ? "▼"
                                                : "▲"}
                                            </span>
                                          </>
                                        ) : (
                                          <span className="text-slate-400">
                                            -
                                          </span>
                                        )}
                                      </div>

                                      <div className="flex items-center gap-1.5">
                                        <ShoppingCart className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                        {opt.sales7d > 0 ? (
                                          <span className="font-medium text-slate-800">
                                            {opt.sales7d}
                                          </span>
                                        ) : (
                                          <span className="text-slate-400">
                                            -
                                          </span>
                                        )}
                                      </div>

                                      <div className="flex items-center gap-1.5">
                                        <TrendingUp className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                        {opt.sales7d > 0 &&
                                        opt.conversionRate > 0 ? (
                                          <span className="font-medium text-slate-800">
                                            {opt.conversionRate
                                              .toFixed(1)
                                              .replace(".", ",")}
                                            %
                                          </span>
                                        ) : (
                                          <span className="text-slate-400">
                                            -
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  </td>

                                  {/* Qualidade da Opção */}
                                  <td className="py-3.5 px-3 align-top text-center">
                                    <QualityGauge
                                      score={opt.qualityScore}
                                      objectivesCount={opt.objectivesCount}
                                    />
                                  </td>

                                  {/* Status, Recomendações e Ações da Opção */}
                                  <td className="py-3.5 px-3 align-top">
                                    <div className="flex items-start justify-between gap-2">
                                      <div>
                                        {opt.shippingType === "ml_full" ? (
                                          <>
                                            <div className="font-bold text-emerald-800 text-[11.5px] flex items-center gap-1">
                                              <Zap className="w-3 h-3 fill-emerald-600 text-emerald-600" />
                                              <span>Mercado Envios Full</span>
                                            </div>
                                            <div className="text-[10.5px] text-slate-500 mt-0.5">
                                              Máxima exposição ativa.
                                            </div>
                                          </>
                                        ) : opt.qualityScore < 75 ? (
                                          <>
                                            <div className="font-bold text-slate-900 text-[11.5px]">
                                              Ofereça envios no mesmo dia
                                            </div>
                                            <div className="text-[10.5px] text-slate-500 mt-0.5">
                                              Atraia mais compradores.
                                            </div>
                                          </>
                                        ) : (
                                          <>
                                            <div className="font-bold text-slate-900 text-[11.5px]">
                                              Crie um vídeo{" "}
                                              <span className="text-rose-500">
                                                ⚡
                                              </span>
                                            </div>
                                            <div className="text-[10.5px] text-slate-500 mt-0.5">
                                              Adicione vídeos para não perder
                                              vendas.
                                            </div>
                                          </>
                                        )}

                                        <div className="mt-2 flex items-center gap-2">
                                          <a
                                            href={opt.permalink}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="px-2.5 py-1 rounded bg-[#E3EDFB] hover:bg-[#D4E4FA] text-[#3483FA] font-bold text-[10.5px] inline-flex items-center gap-1 transition-colors"
                                          >
                                            <span>
                                              Abrir #{opt.cleanMlbDigits}
                                            </span>
                                            <ExternalLink className="w-2.5 h-2.5" />
                                          </a>
                                        </div>

                                        {/* Botão "Ver mais X opção de venda" quando houver 3+ MLBs na mesma variação */}
                                        {isLastVisibleOption &&
                                          hiddenOptionsCount > 0 && (
                                            <div className="mt-2.5">
                                              <button
                                                type="button"
                                                onClick={() =>
                                                  toggleExtraOptions(
                                                    variation.variationKey
                                                  )
                                                }
                                                className="px-3 py-1 rounded-full border border-slate-200 bg-white hover:bg-slate-50 text-[#3483FA] font-semibold text-[11px] shadow-2xs inline-flex items-center gap-1 cursor-pointer"
                                              >
                                                <span>
                                                  {showAllOpts
                                                    ? "Ocultar opções extras"
                                                    : `Ver mais ${hiddenOptionsCount} ${
                                                        hiddenOptionsCount === 1
                                                          ? "opção de venda"
                                                          : "opções de venda"
                                                      }`}
                                                </span>
                                                {showAllOpts ? (
                                                  <ChevronUp className="w-3 h-3" />
                                                ) : (
                                                  <ChevronDown className="w-3 h-3" />
                                                )}
                                              </button>
                                            </div>
                                          )}
                                      </div>

                                      <div className="flex items-center gap-1.5 shrink-0">
                                        <MlStatusSwitch
                                          active={opt.status === "active"}
                                        />
                                        <MoreVertical className="w-4 h-4 text-slate-400" />
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </React.Fragment>
                        );
                      })}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
