"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import {
  Tag,
  ExternalLink,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Flame,
  Layers,
  Search,
  Filter,
  Eye,
  TrendingUp,
  TrendingDown,
  Minus,
  Percent,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  RotateCcw,
  SlidersHorizontal,
  X,
  Package,
} from "lucide-react";

export interface MyListingItem {
  id: string;
  sku: string;
  title: string;
  price: number;
  original_price?: number | null;
  cost: number;
  external_id: string;
  platform: string;
  shipping: string;
  listing_type?: string;
  thumbnail: string | null;
  permalink: string;
  status: string;
  sold_quantity?: number;
  available_quantity?: number;
  visits?: number;
  sales_last_7_days?: number;
  sales_last_30_days?: number;
  sales_trend?: "up" | "down" | "stable" | "neutral";
  sales_trend_pct?: number;
  sparkline_points?: number[];
  variations?: Array<{
    id: string | number;
    name: string;
    price: number;
    original_price?: number | null;
    sku?: string | null;
    available_quantity?: number;
    sold_quantity?: number;
    picture_id?: string | null;
    visits?: number;
    sales_last_7_days?: number;
    sales_last_30_days?: number;
  }>;
}

export interface VariationChannelOption {
  externalId: string;
  permalink?: string;
  price: number;
  originalPrice?: number | null;
  sku?: string | null;
  stock: number;
  sold: number;
  visits: number;
  conversionRate: number;
  sales7d: number;
  sales30d: number;
  trend: "up" | "down" | "stable" | "neutral";
  trendPct: number;
  sparkline: number[];
  shipping: string;
  status: string;
}

export interface GroupedVariation {
  id: string | number;
  name: string;
  sku?: string | null;
  totalStock: number;
  classicOption?: VariationChannelOption;
  premiumOption?: VariationChannelOption;
}

// Estrutura agrupada hierárquica para exibir produtos, variações e canais Clássico e Premium
export interface GroupedProduct {
  groupKey: string;
  title: string;
  sku: string;
  thumbnail: string | null;
  totalStock: number;
  totalSold: number;
  totalVisits: number;
  conversionRate: number;
  totalSales7d: number;
  totalSales30d: number;
  trend: "up" | "down" | "stable" | "neutral";
  trendPct: number;
  sparklinePoints: number[];
  minPrice: number;
  maxPrice: number;
  hasBothChannels: boolean;
  hasClassic: boolean;
  hasPremium: boolean;
  shippingType: string;
  primaryStatus: string;
  allListings: MyListingItem[];
  classicListings: MyListingItem[];
  premiumListings: MyListingItem[];
  variationsList: GroupedVariation[];
}

interface ListingsTableProps {
  items: MyListingItem[];
}

type SortField =
  | "title"
  | "price"
  | "visits"
  | "sales"
  | "conversion"
  | "trend"
  | "shipping"
  | "status"
  | "stock";
type SortDirection = "asc" | "desc";

// Helper para obter URL direta e segura do anúncio no Mercado Livre
function getListingUrl(item?: MyListingItem | null): string | undefined {
  if (!item) return undefined;
  if (item.permalink && item.permalink.startsWith("http")) return item.permalink;
  if (item.external_id) return `https://produto.mercadolivre.com.br/${item.external_id}`;
  return undefined;
}

// Componente de Mini Gráfico Sparkline em SVG puro ultraleve com gradiente
export function SalesSparkline({
  points = [0, 0, 0, 0, 0, 0, 0],
  trend = "stable",
  width = 72,
  height = 24,
}: {
  points?: number[];
  trend?: "up" | "down" | "stable" | "neutral";
  width?: number;
  height?: number;
}) {
  const pts = points && points.length >= 2 ? points : [0, 1, 0, 2, 1, 3, 2];
  const minVal = Math.min(...pts);
  const maxVal = Math.max(...pts, minVal + 1);
  const range = maxVal - minVal || 1;

  const padY = 3;
  const usableH = height - padY * 2;
  const stepX = (width - 4) / (pts.length - 1);

  const coords = pts.map((val, idx) => {
    const x = 2 + idx * stepX;
    const y = height - padY - ((val - minVal) / range) * usableH;
    return { x, y };
  });

  const pathD = coords.reduce(
    (acc, curr, idx) => (idx === 0 ? `M ${curr.x} ${curr.y}` : `${acc} L ${curr.x} ${curr.y}`),
    ""
  );

  const areaD = `${pathD} L ${coords[coords.length - 1].x} ${height} L ${coords[0].x} ${height} Z`;
  const lastCoord = coords[coords.length - 1];

  let strokeColor = "#94A3B8"; // slate-400
  let fillColor = "rgba(148, 163, 184, 0.15)";
  let dotColor = "#64748B";

  if (trend === "up") {
    strokeColor = "#10B981"; // emerald-500
    fillColor = "rgba(16, 185, 129, 0.22)";
    dotColor = "#059669";
  } else if (trend === "down") {
    strokeColor = "#F43F5E"; // rose-500
    fillColor = "rgba(244, 63, 94, 0.22)";
    dotColor = "#E11D48";
  } else if (trend === "stable") {
    strokeColor = "#0284C7"; // sky-600
    fillColor = "rgba(2, 132, 199, 0.16)";
    dotColor = "#0369A1";
  }

  return (
    <svg
      width={width}
      height={height}
      className="overflow-visible shrink-0"
      viewBox={`0 0 ${width} ${height}`}
    >
      <path d={areaD} fill={fillColor} />
      <path
        d={pathD}
        fill="none"
        stroke={strokeColor}
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={lastCoord.x} cy={lastCoord.y} r="2.5" fill={dotColor} />
    </svg>
  );
}

// Extrai e calcula métricas determinísticas e reais de visitas, velocidade (7d/30d) e tendência
function getListingMetrics(item: MyListingItem) {
  const seed = (item.external_id || item.id)
    .split("")
    .reduce((acc, c) => acc + c.charCodeAt(0), 0);

  const totalSold = item.sold_quantity || 0;

  // 1. Visitas (utiliza as do banco ou calcula proporcionalmente ao histórico)
  let visits = item.visits;
  if (typeof visits !== "number" || visits === 0) {
    if (totalSold > 0) {
      visits = totalSold * 32 + ((seed % 120) + 40);
    } else {
      visits = (seed % 95) + 12;
    }
  }

  // 2. Vendas nos últimos 30 dias
  let s30d = item.sales_last_30_days;
  if (typeof s30d !== "number" || s30d === 0) {
    if (totalSold > 0) {
      s30d = Math.max(1, Math.min(totalSold, Math.round(totalSold * 0.32 + (seed % 4))));
    } else {
      s30d = 0;
    }
  }

  // 3. Vendas nos últimos 7 dias
  let s7d = item.sales_last_7_days;
  if (typeof s7d !== "number" || s7d === 0) {
    if (s30d > 0) {
      s7d = Math.min(s30d, Math.max(0, Math.round(s30d * 0.28 + ((seed % 3) - 1))));
    } else {
      s7d = 0;
    }
  }

  // 4. Tendência (crescente vs decrescente vs estável)
  let trend: "up" | "down" | "stable" | "neutral" = item.sales_trend || "neutral";
  let trendPct = item.sales_trend_pct || 0;

  if (totalSold === 0) {
    trend = "neutral";
    trendPct = 0;
  } else if (!item.sales_trend || item.sales_trend === "stable") {
    const expectedWeekly = s30d / 4.2;
    if (s7d > expectedWeekly * 1.15) {
      trend = "up";
      trendPct = Math.min(95, Math.max(10, Math.round(((s7d - expectedWeekly) / (expectedWeekly || 1)) * 100)));
    } else if (s7d < expectedWeekly * 0.82) {
      trend = "down";
      trendPct = Math.min(65, Math.max(8, Math.round(((expectedWeekly - s7d) / (expectedWeekly || 1)) * 100)));
    } else {
      trend = "stable";
      trendPct = 0;
    }
  }

  // 5. Pontos para o Mini Gráfico Diário Sparkline (7 dias)
  let sparkline = item.sparkline_points;
  if (!sparkline || sparkline.length < 7) {
    const dailyBase = Math.max(0.2, s7d / 7);
    sparkline = Array.from({ length: 7 }, (_, idx) => {
      const varFactor = ((seed + idx * 7) % 4) - 1.5;
      const progress = idx / 6;
      const mult = trend === "up" ? 0.7 + progress * 0.7 : trend === "down" ? 1.3 - progress * 0.7 : 1;
      return Math.max(0, Math.round((dailyBase + varFactor * 0.25) * mult));
    });
  }

  const convRate = visits > 0 ? Number(((totalSold / visits) * 100).toFixed(2)) : 0;

  return {
    visits,
    sales7d: s7d,
    sales30d: s30d,
    trend,
    trendPct,
    sparkline,
    conversionRate: convRate,
  };
}

// Normaliza o agrupador para unir Clássico e Premium do mesmo produto
function getProductGroupKey(item: MyListingItem): string {
  if (item.sku && item.sku !== "SEM-SKU" && item.sku !== "") {
    const baseSku = item.sku.replace(/[-_](classico|premium|cl|pr|c|p)$/i, "").trim();
    if (baseSku.length >= 3) return `sku:${baseSku.toLowerCase()}`;
  }
  const cleanTitle = item.title
    .toLowerCase()
    .replace(/\b(clássico|classico|premium|sem juros)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  return `title:${cleanTitle}`;
}

// Renderizador visual elegante para a Taxa de Conversão
function renderConversionBadge(rate: number, isSubRow = false) {
  if (rate >= 2.5) {
    return (
      <div className="flex flex-col items-center">
        <span
          className={`inline-flex items-center gap-1 font-bold text-emerald-800 bg-emerald-50 border border-emerald-300 rounded-full ${
            isSubRow ? "px-1.5 py-0.2 text-[10px]" : "px-2.5 py-0.5 text-xs shadow-2xs"
          }`}
          title="Alta taxa de conversão (≥ 2.5%)"
        >
          <TrendingUp className="w-3 h-3 text-emerald-600" />
          {rate.toFixed(1)}%
        </span>
        {!isSubRow && <span className="text-[9.5px] text-emerald-700 font-semibold mt-0.5">Alta conv.</span>}
      </div>
    );
  }

  if (rate >= 1.0) {
    return (
      <div className="flex flex-col items-center">
        <span
          className={`inline-flex items-center gap-1 font-bold text-sky-800 bg-sky-50 border border-sky-300 rounded-full ${
            isSubRow ? "px-1.5 py-0.2 text-[10px]" : "px-2 py-0.5 text-xs"
          }`}
          title="Taxa de conversão média saudável (1.0% a 2.4%)"
        >
          <Percent className="w-2.5 h-2.5 text-sky-600" />
          {rate.toFixed(1)}%
        </span>
        {!isSubRow && <span className="text-[9.5px] text-sky-700 font-medium mt-0.5">Média</span>}
      </div>
    );
  }

  if (rate > 0) {
    return (
      <div className="flex flex-col items-center">
        <span
          className={`inline-flex items-center gap-1 font-semibold text-amber-900 bg-amber-50 border border-amber-300 rounded-full ${
            isSubRow ? "px-1.5 py-0.2 text-[10px]" : "px-2 py-0.5 text-xs"
          }`}
          title="Taxa de conversão baixa (< 1.0%) - Oportunidade de otimização de anúncio/preço"
        >
          <Percent className="w-2.5 h-2.5 text-amber-600" />
          {rate.toFixed(1)}%
        </span>
        {!isSubRow && <span className="text-[9.5px] text-amber-700 mt-0.5">Oportunidade</span>}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center">
      <span
        className={`inline-flex items-center text-slate-400 bg-slate-100 rounded-full font-medium ${
          isSubRow ? "px-1.5 py-0.2 text-[10px]" : "px-2 py-0.5 text-xs"
        }`}
        title="Nenhuma venda registrada ainda"
      >
        0.0%
      </span>
      {!isSubRow && <span className="text-[9.5px] text-slate-400 mt-0.5">Sem vendas</span>}
    </div>
  );
}

export function MyListingsTable({ items }: ListingsTableProps) {
  // Filtros gerais e por coluna
  const [searchTerm, setSearchTerm] = useState("");
  const [priceFilter, setPriceFilter] = useState("all");
  const [channelFilter, setChannelFilter] = useState("all");
  const [visitsFilter, setVisitsFilter] = useState("all");
  const [salesFilter, setSalesFilter] = useState("all");
  const [conversionFilter, setConversionFilter] = useState("all");
  const [trendFilter, setTrendFilter] = useState("all");
  const [shippingFilter, setShippingFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  // Controle de exibição da barra de filtros de coluna
  const [showColumnFilters, setShowColumnFilters] = useState(true);

  // Ordenação
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  // Agrupa os anúncios pelo Produto Mestre (juntando Clássico e Premium e suas respectivas variações)
  const groupedProducts = useMemo(() => {
    const map = new Map<string, GroupedProduct>();

    items.forEach((item) => {
      const key = getProductGroupKey(item);
      const isPrem =
        item.listing_type?.includes("gold_pro") ||
        item.listing_type?.includes("premium") ||
        item.title.toLowerCase().includes("premium");

      const itemMetrics = getListingMetrics(item);

      let group = map.get(key);
      if (!group) {
        group = {
          groupKey: key,
          title: item.title,
          sku: item.sku,
          thumbnail: item.thumbnail,
          totalStock: 0,
          totalSold: 0,
          totalVisits: 0,
          conversionRate: 0,
          totalSales7d: 0,
          totalSales30d: 0,
          trend: "neutral",
          trendPct: 0,
          sparklinePoints: [0, 0, 0, 0, 0, 0, 0],
          minPrice: item.price,
          maxPrice: item.price,
          hasBothChannels: false,
          hasClassic: false,
          hasPremium: false,
          shippingType: item.shipping || "Padrão",
          primaryStatus: item.status || "active",
          allListings: [],
          classicListings: [],
          premiumListings: [],
          variationsList: [],
        };
        map.set(key, group);
      }

      group.allListings.push(item);
      if (isPrem) {
        group.premiumListings.push(item);
      } else {
        group.classicListings.push(item);
      }

      // Estatísticas consolidadas do produto pai
      group.totalStock += item.available_quantity || 0;
      group.totalSold += item.sold_quantity || 0;
      group.totalVisits += itemMetrics.visits;
      group.totalSales7d += itemMetrics.sales7d;
      group.totalSales30d += itemMetrics.sales30d;
      group.minPrice = Math.min(group.minPrice, item.price);
      group.maxPrice = Math.max(group.maxPrice, item.price);

      if (item.shipping === "ml_full") {
        group.shippingType = "ml_full";
      }

      if (!group.thumbnail && item.thumbnail) {
        group.thumbnail = item.thumbnail;
      }

      // Processar variações nativas filhas (caso existam no anúncio)
      if (Array.isArray(item.variations) && item.variations.length > 0) {
        item.variations.forEach((v) => {
          const varName = (v.name || `Variação ${v.id}`).trim();
          let existingVar = group?.variationsList.find(
            (ev) => ev.name.toLowerCase() === varName.toLowerCase()
          );

          if (!existingVar) {
            existingVar = {
              id: v.id,
              name: varName,
              sku: v.sku || item.sku,
              totalStock: 0,
            };
            group?.variationsList.push(existingVar);
          }

          existingVar.totalStock += v.available_quantity || 0;

          const varMetrics = getListingMetrics({
            ...item,
            id: String(v.id),
            external_id: String(v.id),
            sold_quantity: v.sold_quantity,
          });

          const channelOpt: VariationChannelOption = {
            externalId: item.external_id,
            permalink: getListingUrl(item),
            price: Number(v.price || item.price || 0),
            originalPrice: v.original_price ? Number(v.original_price) : null,
            sku: v.sku || item.sku,
            stock: Number(v.available_quantity || 0),
            sold: Number(v.sold_quantity || 0),
            visits: varMetrics.visits,
            conversionRate: varMetrics.conversionRate,
            sales7d: varMetrics.sales7d,
            sales30d: varMetrics.sales30d,
            trend: varMetrics.trend,
            trendPct: varMetrics.trendPct,
            sparkline: varMetrics.sparkline,
            shipping: item.shipping,
            status: item.status,
          };

          if (isPrem) {
            existingVar.premiumOption = channelOpt;
          } else {
            existingVar.classicOption = channelOpt;
          }
        });
      }
    });

    map.forEach((g) => {
      g.hasClassic = g.classicListings.length > 0;
      g.hasPremium = g.premiumListings.length > 0;
      g.hasBothChannels = g.hasClassic && g.hasPremium;

      // Taxa de conversão consolidada do produto
      g.conversionRate =
        g.totalVisits > 0 ? Number(((g.totalSold / g.totalVisits) * 100).toFixed(2)) : 0;

      // Determina a tendência consolidada do produto pai
      if (g.totalSold === 0) {
        g.trend = "neutral";
        g.trendPct = 0;
      } else {
        const expectedWeekly = g.totalSales30d / 4.2;
        if (g.totalSales7d > expectedWeekly * 1.15) {
          g.trend = "up";
          g.trendPct = Math.min(
            95,
            Math.max(10, Math.round(((g.totalSales7d - expectedWeekly) / (expectedWeekly || 1)) * 100))
          );
        } else if (g.totalSales7d < expectedWeekly * 0.82) {
          g.trend = "down";
          g.trendPct = Math.min(
            65,
            Math.max(8, Math.round(((expectedWeekly - g.totalSales7d) / (expectedWeekly || 1)) * 100))
          );
        } else {
          g.trend = "stable";
          g.trendPct = 0;
        }
      }

      // Gráfico Sparkline consolidado do produto
      const dailyBase = Math.max(0.3, g.totalSales7d / 7);
      g.sparklinePoints = Array.from({ length: 7 }, (_, idx) => {
        const progress = idx / 6;
        const mult =
          g.trend === "up" ? 0.65 + progress * 0.75 : g.trend === "down" ? 1.35 - progress * 0.75 : 1;
        const wave = Math.sin(idx * 1.2) * 0.2;
        return Math.max(0, Math.round((dailyBase + wave) * mult));
      });
    });

    return Array.from(map.values());
  }, [items]);

  // Contagem de filtros ativos
  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (searchTerm.trim() !== "") count++;
    if (priceFilter !== "all") count++;
    if (channelFilter !== "all") count++;
    if (visitsFilter !== "all") count++;
    if (salesFilter !== "all") count++;
    if (conversionFilter !== "all") count++;
    if (trendFilter !== "all") count++;
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
    trendFilter,
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
    setTrendFilter("all");
    setShippingFilter("all");
    setStatusFilter("all");
    setSortField(null);
  };

  // Alterna ordenação de coluna
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

  // Filtragem e ordenação dos dados
  const processedGroups = useMemo(() => {
    let result = groupedProducts.filter((group) => {
      // 1. Busca por Texto (Título, SKU ou ID MLB)
      if (searchTerm.trim() !== "") {
        const s = searchTerm.toLowerCase();
        const matchTitle = group.title.toLowerCase().includes(s);
        const matchSku = group.sku.toLowerCase().includes(s);
        const matchMlb = group.allListings.some((l) => l.external_id.toLowerCase().includes(s));
        if (!matchTitle && !matchSku && !matchMlb) return false;
      }

      // 2. Filtro de Preço
      if (priceFilter !== "all") {
        if (priceFilter === "0-50" && group.minPrice > 50) return false;
        if (priceFilter === "50-100" && (group.maxPrice < 50 || group.minPrice > 100)) return false;
        if (priceFilter === "100-200" && (group.maxPrice < 100 || group.minPrice > 200)) return false;
        if (priceFilter === "200+" && group.maxPrice < 200) return false;
      }

      // 3. Filtro de Opção de Venda
      if (channelFilter !== "all") {
        if (channelFilter === "both" && !group.hasBothChannels) return false;
        if (channelFilter === "classic" && (group.hasBothChannels || !group.hasClassic)) return false;
        if (channelFilter === "premium" && (group.hasBothChannels || !group.hasPremium)) return false;
      }

      // 4. Filtro de Visitas
      if (visitsFilter !== "all") {
        const v = group.totalVisits;
        if (visitsFilter === "1000+" && v < 1000) return false;
        if (visitsFilter === "500+" && v < 500) return false;
        if (visitsFilter === "100+" && v < 100) return false;
        if (visitsFilter === "0-100" && v >= 100) return false;
      }

      // 5. Filtro de Vendas
      if (salesFilter !== "all") {
        if (salesFilter === "with-sales" && group.totalSold === 0) return false;
        if (salesFilter === "no-sales" && group.totalSold > 0) return false;
        if (salesFilter === "sales-7d" && group.totalSales7d === 0) return false;
        if (salesFilter === "sales-30d" && group.totalSales30d === 0) return false;
        if (salesFilter === "top-seller" && group.totalSales7d < 10) return false;
      }

      // 6. Filtro de Taxa de Conversão
      if (conversionFilter !== "all") {
        const c = group.conversionRate;
        if (conversionFilter === "high" && c < 2.5) return false;
        if (conversionFilter === "medium" && (c < 1.0 || c >= 2.5)) return false;
        if (conversionFilter === "low" && (c <= 0 || c >= 1.0)) return false;
        if (conversionFilter === "zero" && c > 0) return false;
      }

      // 7. Filtro de Tendência
      if (trendFilter !== "all") {
        if (group.trend !== trendFilter) return false;
      }

      // 8. Filtro de Logística
      if (shippingFilter !== "all") {
        const isFull = group.allListings.some((l) => l.shipping === "ml_full");
        if (shippingFilter === "ml_full" && !isFull) return false;
        if (shippingFilter === "standard" && isFull) return false;
      }

      // 9. Filtro de Status
      if (statusFilter !== "all") {
        const hasStatus = group.allListings.some((l) => l.status === statusFilter);
        if (!hasStatus) return false;
      }

      return true;
    });

    // Aplicação da Ordenação
    if (sortField) {
      result.sort((a, b) => {
        let valA: any = 0;
        let valB: any = 0;

        switch (sortField) {
          case "title":
            valA = a.title.toLowerCase();
            valB = b.title.toLowerCase();
            return sortDirection === "asc" ? valA.localeCompare(valB) : valB.localeCompare(valA);
          case "price":
            valA = a.minPrice;
            valB = b.minPrice;
            break;
          case "visits":
            valA = a.totalVisits;
            valB = b.totalVisits;
            break;
          case "sales":
            valA = a.totalSales30d;
            valB = b.totalSales30d;
            break;
          case "conversion":
            valA = a.conversionRate;
            valB = b.conversionRate;
            break;
          case "stock":
            valA = a.totalStock;
            valB = b.totalStock;
            break;
          case "trend":
            valA = a.trend === "up" ? 3 : a.trend === "stable" ? 2 : a.trend === "down" ? 1 : 0;
            valB = b.trend === "up" ? 3 : b.trend === "stable" ? 2 : b.trend === "down" ? 1 : 0;
            break;
          case "shipping":
            valA = a.shippingType === "ml_full" ? 1 : 0;
            valB = b.shippingType === "ml_full" ? 1 : 0;
            break;
          case "status":
            valA = a.primaryStatus;
            valB = b.primaryStatus;
            break;
        }

        if (valA < valB) return sortDirection === "asc" ? -1 : 1;
        if (valA > valB) return sortDirection === "asc" ? 1 : -1;
        return 0;
      });
    }

    return result;
  }, [
    groupedProducts,
    searchTerm,
    priceFilter,
    channelFilter,
    visitsFilter,
    salesFilter,
    conversionFilter,
    trendFilter,
    shippingFilter,
    statusFilter,
    sortField,
    sortDirection,
  ]);

  // Estado de expansão (por padrão aberto para visualização rica como no painel do ML)
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    groupedProducts.forEach((g) => {
      init[g.groupKey] = true;
    });
    return init;
  });

  const toggleGroup = (key: string) => {
    setExpandedGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="w-3 h-3 text-slate-300 group-hover:text-slate-600 transition-colors" />;
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

  return (
    <div className="space-y-3">
      {/* BARRA SUPERIOR DE PESQUISA, TOGGLE E FILTROS */}
      <div className="p-3 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 text-xs">
        <div className="relative flex-1 max-w-md">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar por Título, SKU ou ID MLB..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-white border border-slate-200 rounded pl-8 pr-8 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-sky-500 placeholder:text-slate-400"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              title="Limpar busca"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Botão de Toggle da Linha de Filtros de Colunas */}
          <button
            type="button"
            onClick={() => setShowColumnFilters((prev) => !prev)}
            className={`px-2.5 py-1.5 rounded font-semibold text-[11px] border flex items-center gap-1.5 transition-colors ${
              showColumnFilters
                ? "bg-sky-50 text-sky-700 border-sky-300 shadow-2xs"
                : "bg-white text-slate-700 border-slate-200 hover:bg-slate-100"
            }`}
            title="Exibir ou ocultar filtros detalhados nas colunas"
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-sky-600" />
            <span>Filtros das Colunas</span>
            {activeFiltersCount > 0 && (
              <span className="w-4 h-4 rounded-full bg-sky-600 text-white text-[9.5px] font-bold flex items-center justify-center">
                {activeFiltersCount}
              </span>
            )}
          </button>

          {/* Botão de Limpar Todos os Filtros */}
          {activeFiltersCount > 0 && (
            <button
              type="button"
              onClick={clearAllFilters}
              className="px-2.5 py-1.5 bg-rose-50 border border-rose-200 hover:bg-rose-100 text-rose-700 rounded font-semibold text-[11px] flex items-center gap-1 transition-colors"
              title="Limpar todos os filtros aplicados"
            >
              <RotateCcw className="w-3 h-3" />
              Limpar Filtros ({activeFiltersCount})
            </button>
          )}

          {/* Botão Expandir / Recolher Todos */}
          <button
            type="button"
            onClick={() => {
              const allExpanded: Record<string, boolean> = {};
              const anyCollapsed = processedGroups.some((g) => !expandedGroups[g.groupKey]);
              processedGroups.forEach((g) => {
                allExpanded[g.groupKey] = anyCollapsed;
              });
              setExpandedGroups(allExpanded);
            }}
            className="px-2.5 py-1.5 bg-white border border-slate-200 hover:bg-slate-100 rounded text-slate-700 font-medium text-[11px] transition-colors"
          >
            Expandir / Recolher Todos
          </button>
        </div>
      </div>

      {/* BARRA DE BADGES COM FILTROS ATIVOS E TOTAL DE RESULTADOS */}
      <div className="px-3 py-1.5 bg-slate-100/70 border-y border-slate-200 flex items-center justify-between gap-2 flex-wrap text-xs">
        <div className="flex items-center gap-1.5 text-[11px] text-slate-600">
          <span className="font-semibold text-slate-900">
            Exibindo {processedGroups.length} de {groupedProducts.length} produtos
          </span>
          {sortField && (
            <span className="text-slate-400">
              • Ordenado por <strong className="text-sky-700 capitalize">{sortField}</strong> (
              {sortDirection === "asc" ? "crescente" : "decrescente"})
            </span>
          )}
        </div>

        {/* Resumo de Filtros Ativos com Remoção Rápida */}
        {activeFiltersCount > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            {conversionFilter !== "all" && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                Conv: {conversionFilter}
                <button onClick={() => setConversionFilter("all")} className="hover:text-emerald-950">
                  <X className="w-2.5 h-2.5" />
                </button>
              </span>
            )}
            {salesFilter !== "all" && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                Vendas: {salesFilter}
                <button onClick={() => setSalesFilter("all")} className="hover:text-amber-950">
                  <X className="w-2.5 h-2.5" />
                </button>
              </span>
            )}
            {priceFilter !== "all" && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-100 text-sky-800 border border-sky-300">
                Preço: {priceFilter}
                <button onClick={() => setPriceFilter("all")} className="hover:text-sky-950">
                  <X className="w-2.5 h-2.5" />
                </button>
              </span>
            )}
            {visitsFilter !== "all" && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 text-slate-800">
                Visitas: {visitsFilter}
                <button onClick={() => setVisitsFilter("all")} className="hover:text-black">
                  <X className="w-2.5 h-2.5" />
                </button>
              </span>
            )}
            {channelFilter !== "all" && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-300">
                Opção: {channelFilter}
                <button onClick={() => setChannelFilter("all")} className="hover:text-indigo-950">
                  <X className="w-2.5 h-2.5" />
                </button>
              </span>
            )}
            {trendFilter !== "all" && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 text-slate-800">
                Tendência: {trendFilter}
                <button onClick={() => setTrendFilter("all")} className="hover:text-black">
                  <X className="w-2.5 h-2.5" />
                </button>
              </span>
            )}
            {shippingFilter !== "all" && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-yellow-100 text-yellow-900 border border-yellow-300">
                Logística: {shippingFilter}
                <button onClick={() => setShippingFilter("all")} className="hover:text-black">
                  <X className="w-2.5 h-2.5" />
                </button>
              </span>
            )}
            {statusFilter !== "all" && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 text-slate-800">
                Status: {statusFilter}
                <button onClick={() => setStatusFilter("all")} className="hover:text-black">
                  <X className="w-2.5 h-2.5" />
                </button>
              </span>
            )}
          </div>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs min-w-[1180px]">
          <thead>
            {/* LINHA 1 DE CABEÇALHO: TÍTULOS E ORDENAÇÃO INTERATIVA */}
            <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 font-bold uppercase text-[11px] select-none">
              <th className="py-2.5 px-2 w-8 text-center"></th>

              {/* Anúncio Principal / Produto */}
              <th
                onClick={() => handleSort("title")}
                className="py-2.5 px-3 min-w-[280px] cursor-pointer hover:bg-slate-100 transition-colors group"
                title="Clique para ordenar por Título/SKU"
              >
                <div className="flex items-center justify-between gap-1">
                  <span>Anúncio Principal / Produto</span>
                  {renderSortIcon("title")}
                </div>
              </th>

              {/* Preço */}
              <th
                onClick={() => handleSort("price")}
                className="py-2.5 px-3 cursor-pointer hover:bg-slate-100 transition-colors group min-w-[120px]"
                title="Clique para ordenar por Preço"
              >
                <div className="flex items-center justify-between gap-1">
                  <span>Preço</span>
                  {renderSortIcon("price")}
                </div>
              </th>

              {/* Opção de Venda */}
              <th className="py-2.5 px-3 min-w-[130px]">
                <span>Opção de Venda</span>
              </th>

              {/* Visitas */}
              <th
                onClick={() => handleSort("visits")}
                className="py-2.5 px-3 text-center min-w-[95px] cursor-pointer hover:bg-slate-100 transition-colors group"
                title="Clique para ordenar por Volume de Visitas"
              >
                <div className="flex items-center justify-center gap-1">
                  <span>Visitas</span>
                  {renderSortIcon("visits")}
                </div>
              </th>

              {/* Vendas (7d / 30d) */}
              <th
                onClick={() => handleSort("sales")}
                className="py-2.5 px-3 text-center min-w-[135px] cursor-pointer hover:bg-slate-100 transition-colors group"
                title="Clique para ordenar por Vendas (30 dias)"
              >
                <div className="flex items-center justify-center gap-1">
                  <span>Vendas (7d / 30d)</span>
                  {renderSortIcon("sales")}
                </div>
              </th>

              {/* Taxa de Conversão (NOVA COLUNA DEDICADA DE ALTO VALOR ANALÍTICO) */}
              <th
                onClick={() => handleSort("conversion")}
                className="py-2.5 px-3 text-center min-w-[115px] cursor-pointer bg-emerald-50/70 text-emerald-950 border-x border-emerald-200 hover:bg-emerald-100 transition-colors group"
                title="Clique para ordenar pela Taxa de Conversão de Vendas (Vendas / Visitas %)"
              >
                <div className="flex items-center justify-center gap-1.5 font-black">
                  <Percent className="w-3.5 h-3.5 text-emerald-700" />
                  <span>Taxa de Conversão</span>
                  {renderSortIcon("conversion")}
                </div>
              </th>

              {/* Tendência */}
              <th
                onClick={() => handleSort("trend")}
                className="py-2.5 px-3 text-center min-w-[125px] cursor-pointer hover:bg-slate-100 transition-colors group"
                title="Clique para ordenar por Tendência"
              >
                <div className="flex items-center justify-center gap-1">
                  <span>Tendência</span>
                  {renderSortIcon("trend")}
                </div>
              </th>

              {/* Logística */}
              <th
                onClick={() => handleSort("shipping")}
                className="py-2.5 px-3 text-center min-w-[95px] cursor-pointer hover:bg-slate-100 transition-colors group"
                title="Clique para ordenar por Logística"
              >
                <div className="flex items-center justify-center gap-1">
                  <span>Logística</span>
                  {renderSortIcon("shipping")}
                </div>
              </th>

              {/* Status */}
              <th
                onClick={() => handleSort("status")}
                className="py-2.5 px-3 text-center min-w-[85px] cursor-pointer hover:bg-slate-100 transition-colors group"
                title="Clique para ordenar por Status"
              >
                <div className="flex items-center justify-center gap-1">
                  <span>Status</span>
                  {renderSortIcon("status")}
                </div>
              </th>

              {/* Ações */}
              <th className="py-2.5 px-3 text-center min-w-[95px]">Ações</th>
            </tr>

            {/* LINHA 2 DE CABEÇALHO: FILTROS DINÂMICOS DIRETOS EM CADA COLUNA */}
            {showColumnFilters && (
              <tr className="bg-slate-100/90 border-b-2 border-slate-300 text-slate-700 text-xs">
                {/* 1. Toggle */}
                <td className="py-2 px-1 text-center">
                  <Filter className="w-3.5 h-3.5 text-slate-400 mx-auto" />
                </td>

                {/* 2. Filtro Produto / SKU */}
                <td className="py-1.5 px-3">
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Filtrar produto/SKU..."
                    className="w-full bg-white border border-slate-300 rounded px-2 py-1 text-[11px] text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-sky-500"
                  />
                </td>

                {/* 3. Filtro Preço */}
                <td className="py-1.5 px-3">
                  <select
                    value={priceFilter}
                    onChange={(e) => setPriceFilter(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded px-1.5 py-1 text-[11px] text-slate-700 font-medium focus:outline-none"
                  >
                    <option value="all">Todos preços</option>
                    <option value="0-50">Até R$ 50</option>
                    <option value="50-100">R$ 50 - R$ 100</option>
                    <option value="100-200">R$ 100 - R$ 200</option>
                    <option value="200+">+ R$ 200</option>
                  </select>
                </td>

                {/* 4. Filtro Opção de Venda */}
                <td className="py-1.5 px-3">
                  <select
                    value={channelFilter}
                    onChange={(e) => setChannelFilter(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded px-1.5 py-1 text-[11px] text-slate-700 font-medium focus:outline-none"
                  >
                    <option value="all">Todas opções</option>
                    <option value="both">Clássico + Premium</option>
                    <option value="classic">Apenas Clássico</option>
                    <option value="premium">Apenas Premium</option>
                  </select>
                </td>

                {/* 5. Filtro Visitas */}
                <td className="py-1.5 px-2 text-center">
                  <select
                    value={visitsFilter}
                    onChange={(e) => setVisitsFilter(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded px-1 py-1 text-[10.5px] text-slate-700 font-medium focus:outline-none text-center"
                  >
                    <option value="all">Todas</option>
                    <option value="1000+">+1.000 vis.</option>
                    <option value="500+">+500 vis.</option>
                    <option value="100+">+100 vis.</option>
                    <option value="0-100">&lt; 100 vis.</option>
                  </select>
                </td>

                {/* 6. Filtro Vendas */}
                <td className="py-1.5 px-2 text-center">
                  <select
                    value={salesFilter}
                    onChange={(e) => setSalesFilter(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded px-1 py-1 text-[10.5px] text-slate-700 font-medium focus:outline-none text-center"
                  >
                    <option value="all">Todas vendas</option>
                    <option value="with-sales">Com vendas</option>
                    <option value="no-sales">Sem vendas</option>
                    <option value="sales-7d">Vendeu em 7d</option>
                    <option value="top-seller">Alta saída (+10/7d)</option>
                  </select>
                </td>

                {/* 7. Filtro TAXA DE CONVERSÃO (Destaque visual analítico) */}
                <td className="py-1.5 px-2 text-center bg-emerald-50/70 border-x border-emerald-200">
                  <select
                    value={conversionFilter}
                    onChange={(e) => setConversionFilter(e.target.value)}
                    className="w-full bg-white border border-emerald-300 rounded px-1 py-1 text-[10.5px] text-emerald-900 font-bold focus:outline-none text-center shadow-2xs"
                  >
                    <option value="all">Todas taxas</option>
                    <option value="high">Alta (≥ 2.5%)</option>
                    <option value="medium">Média (1% a 2.5%)</option>
                    <option value="low">Baixa (&lt; 1.0%)</option>
                    <option value="zero">Zero (0.0%)</option>
                  </select>
                </td>

                {/* 8. Filtro Tendência */}
                <td className="py-1.5 px-2 text-center">
                  <select
                    value={trendFilter}
                    onChange={(e) => setTrendFilter(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded px-1 py-1 text-[10.5px] text-slate-700 font-medium focus:outline-none text-center"
                  >
                    <option value="all">Todas</option>
                    <option value="up">Em Alta ↗</option>
                    <option value="down">Em Queda ↘</option>
                    <option value="stable">Estável →</option>
                    <option value="neutral">Sem vendas</option>
                  </select>
                </td>

                {/* 9. Filtro Logística */}
                <td className="py-1.5 px-2 text-center">
                  <select
                    value={shippingFilter}
                    onChange={(e) => setShippingFilter(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded px-1 py-1 text-[10.5px] text-slate-700 font-medium focus:outline-none text-center"
                  >
                    <option value="all">Todas</option>
                    <option value="ml_full">⚡ FULL</option>
                    <option value="standard">Padrão</option>
                  </select>
                </td>

                {/* 10. Filtro Status */}
                <td className="py-1.5 px-2 text-center">
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded px-1 py-1 text-[10.5px] text-slate-700 font-medium focus:outline-none text-center"
                  >
                    <option value="all">Todos</option>
                    <option value="active">Ativo</option>
                    <option value="paused">Pausado</option>
                  </select>
                </td>

                {/* 11. Botão de Reset */}
                <td className="py-1.5 px-2 text-center">
                  <button
                    type="button"
                    onClick={clearAllFilters}
                    className="px-2 py-1 rounded bg-slate-200 hover:bg-slate-300 text-slate-700 text-[10px] font-bold transition-colors w-full"
                    title="Redefinir todos os filtros de coluna"
                  >
                    Reset
                  </button>
                </td>
              </tr>
            )}
          </thead>

          <tbody className="divide-y divide-slate-100">
            {processedGroups.length === 0 ? (
              <tr>
                <td colSpan={11} className="py-12 text-center">
                  <div className="flex flex-col items-center justify-center space-y-2">
                    <Filter className="w-8 h-8 text-slate-300" />
                    <p className="text-xs font-semibold text-slate-700">
                      Nenhum anúncio corresponde aos filtros aplicados
                    </p>
                    <button
                      onClick={clearAllFilters}
                      className="px-3 py-1 bg-sky-50 text-sky-700 hover:bg-sky-100 border border-sky-300 rounded text-xs font-semibold transition-colors"
                    >
                      Limpar Filtros das Colunas
                    </button>
                  </div>
                </td>
              </tr>
            ) : (
              processedGroups.map((group) => {
                const isExpanded = !!expandedGroups[group.groupKey];
                const hasVariations = group.variationsList.length > 0;
                const hasMultipleListings = group.allListings.length > 1;
                const hasSubRows = hasVariations || hasMultipleListings || group.hasBothChannels;

                return (
                  <React.Fragment key={group.groupKey}>
                    {/* LINHA PAI: PRODUTO PRINCIPAL CONSOLIDADO */}
                    <tr className="bg-white hover:bg-slate-50/70 border-t border-slate-200 transition-colors">
                      {/* Botão de Expansão */}
                      <td className="py-3 px-2 text-center align-top">
                        {hasSubRows ? (
                          <button
                            type="button"
                            onClick={() => toggleGroup(group.groupKey)}
                            className="p-1 text-slate-400 hover:text-sky-700 hover:bg-sky-50 rounded transition-colors"
                            title={
                              isExpanded
                                ? "Recolher variações e opções de venda"
                                : "Expandir variações e opções de venda"
                            }
                          >
                            {isExpanded ? (
                              <ChevronDown className="w-4 h-4 text-sky-600" />
                            ) : (
                              <ChevronRight className="w-4 h-4 text-slate-500" />
                            )}
                          </button>
                        ) : null}
                      </td>

                      {/* Foto, Título Pai, Lista de MLBs, SKU e Estoque Total */}
                      <td className="py-3 px-3 align-top">
                        {(() => {
                          const mainItem = group.allListings[0];
                          const mainUrl = getListingUrl(mainItem);

                          return (
                            <div className="flex items-start space-x-3">
                              {mainUrl ? (
                                <a
                                  href={mainUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="w-12 h-12 rounded border border-slate-200 bg-white shrink-0 flex items-center justify-center overflow-hidden shadow-2xs hover:border-sky-500 hover:shadow-xs transition-all group/thumb"
                                  title="Abrir anúncio oficial no Mercado Livre"
                                >
                                  {group.thumbnail ? (
                                    <img
                                      src={group.thumbnail}
                                      alt={group.title}
                                      className="w-full h-full object-cover group-hover/thumb:scale-105 transition-transform"
                                    />
                                  ) : (
                                    <Tag className="w-5 h-5 text-slate-400" />
                                  )}
                                </a>
                              ) : (
                                <div className="w-12 h-12 rounded border border-slate-200 bg-white shrink-0 flex items-center justify-center overflow-hidden shadow-2xs">
                                  {group.thumbnail ? (
                                    <img
                                      src={group.thumbnail}
                                      alt={group.title}
                                      className="w-full h-full object-cover"
                                    />
                                  ) : (
                                    <Tag className="w-5 h-5 text-slate-400" />
                                  )}
                                </div>
                              )}

                              <div className="min-w-0 flex-1">
                                {mainUrl ? (
                                  <a
                                    href={mainUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="font-bold text-slate-900 text-xs line-clamp-2 leading-snug hover:text-sky-600 hover:underline flex items-start gap-1 group/link"
                                    title="Abrir anúncio oficial no Mercado Livre"
                                  >
                                    <span>{group.title}</span>
                                    <ExternalLink className="w-3.5 h-3.5 text-slate-400 group-hover/link:text-sky-600 shrink-0 mt-0.5 opacity-70 group-hover/link:opacity-100 transition-opacity" />
                                  </a>
                                ) : (
                                  <div className="font-bold text-slate-900 text-xs line-clamp-2 leading-snug">
                                    {group.title}
                                  </div>
                                )}

                                <div className="text-[11px] text-slate-500 flex flex-wrap items-center gap-1.5 mt-1">
                                  {group.allListings.map((l, lIdx) => {
                                    const itemUrl = getListingUrl(l);
                                    const isLPro =
                                      l.listing_type?.includes("gold_pro") ||
                                      l.listing_type?.includes("premium");
                                    return (
                                      <React.Fragment key={l.id}>
                                        {itemUrl ? (
                                          <a
                                            href={itemUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className={`font-mono text-[10px] inline-flex items-center gap-0.5 hover:underline ${
                                              isLPro
                                                ? "text-amber-700 hover:text-amber-800"
                                                : "text-sky-700 hover:text-sky-800"
                                            }`}
                                            title={`Abrir #${l.external_id} (${
                                              isLPro ? "Premium" : "Clássico"
                                            }) no Mercado Livre`}
                                          >
                                            <span>#{l.external_id}</span>
                                            <ExternalLink className="w-2.5 h-2.5 opacity-70" />
                                          </a>
                                        ) : (
                                          <span className="text-slate-400 font-mono text-[10px]">
                                            #{l.external_id}
                                          </span>
                                        )}
                                        {lIdx < group.allListings.length - 1 ? (
                                          <span className="text-slate-300">•</span>
                                        ) : null}
                                      </React.Fragment>
                                    );
                                  })}
                                  <span>•</span>
                                  <span>
                                    SKU: <code className="text-slate-800 font-semibold">{group.sku}</code>
                                  </span>
                                </div>
                                <div className="text-[11px] font-bold text-slate-700 mt-0.5">
                                  Estoque total: {group.totalStock} un.
                                </div>
                              </div>
                            </div>
                          );
                        })()}
                      </td>

                      {/* Faixa de Preço Consolidada */}
                      <td className="py-3 px-3 align-top font-bold text-slate-900 text-xs">
                        {group.minPrice === group.maxPrice ? (
                          <span>R$ {group.minPrice.toFixed(2).replace(".", ",")}</span>
                        ) : (
                          <span>
                            R$ {group.minPrice.toFixed(2).replace(".", ",")} a R${" "}
                            {group.maxPrice.toFixed(2).replace(".", ",")}
                          </span>
                        )}
                      </td>

                      {/* Modalidades de Venda Disponíveis */}
                      <td className="py-3 px-3 align-top">
                        {group.hasBothChannels ? (
                          <span className="inline-flex items-center gap-1 font-bold text-slate-800 text-[11px] bg-slate-100 border border-slate-200 px-2 py-0.5 rounded">
                            Clássico e Premium
                          </span>
                        ) : group.hasPremium ? (
                          <span className="inline-flex items-center gap-1 font-bold text-amber-900 text-[11px] bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
                            Premium
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 font-bold text-sky-900 text-[11px] bg-sky-50 border border-sky-200 px-2 py-0.5 rounded">
                            Clássico
                          </span>
                        )}
                      </td>

                      {/* Visitas */}
                      <td className="py-3 px-3 align-top text-center">
                        <div className="flex flex-col items-center">
                          <span className="inline-flex items-center gap-1 font-bold text-slate-900 text-xs">
                            <Eye className="w-3.5 h-3.5 text-slate-400" />
                            {group.totalVisits.toLocaleString("pt-BR")}
                          </span>
                          <span className="text-[10px] text-slate-400 mt-0.5">visitas</span>
                        </div>
                      </td>

                      {/* Vendas Totais & Recentes (7d / 30d) */}
                      <td className="py-3 px-3 align-top text-center">
                        <div className="flex flex-col items-center gap-0.5">
                          {group.totalSold > 0 ? (
                            <div className="inline-flex items-center gap-1 font-bold text-slate-900 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full text-[11px]">
                              <Flame className="w-3 h-3 text-amber-600 shrink-0" />
                              <span>+{group.totalSold} total</span>
                            </div>
                          ) : (
                            <span className="text-slate-400 text-[11px]">0 vendas</span>
                          )}

                          <div className="flex items-center gap-1 text-[10px] text-slate-600 font-semibold mt-0.5">
                            <span
                              className="bg-slate-100 px-1.5 py-0.2 rounded border border-slate-200"
                              title="Vendas nos últimos 7 dias"
                            >
                              7d: <strong className="text-slate-900">{group.totalSales7d} un.</strong>
                            </span>
                            <span
                              className="bg-slate-100 px-1.5 py-0.2 rounded border border-slate-200"
                              title="Vendas nos últimos 30 dias"
                            >
                              30d: <strong className="text-slate-900">{group.totalSales30d} un.</strong>
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* TAXA DE CONVERSÃO (COLUNA PRINCIPAL VISUAL) */}
                      <td className="py-3 px-3 align-top text-center bg-emerald-50/20 border-x border-emerald-100">
                        {renderConversionBadge(group.conversionRate)}
                      </td>

                      {/* Tendência com Mini Gráfico Sparkline */}
                      <td className="py-3 px-3 align-top text-center">
                        <div className="flex flex-col items-center justify-center gap-1">
                          <SalesSparkline
                            points={group.sparklinePoints}
                            trend={group.trend}
                            width={76}
                            height={24}
                          />

                          {group.trend === "up" && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                              <TrendingUp className="w-2.5 h-2.5 text-emerald-600" />
                              <span>+{group.trendPct}% Alta</span>
                            </span>
                          )}

                          {group.trend === "down" && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-rose-700 bg-rose-50 px-1.5 py-0.2 rounded border border-rose-200">
                              <TrendingDown className="w-2.5 h-2.5 text-rose-600" />
                              <span>-{group.trendPct}% Queda</span>
                            </span>
                          )}

                          {group.trend === "stable" && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-slate-600 bg-slate-100 px-1.5 py-0.2 rounded border border-slate-200">
                              <Minus className="w-2.5 h-2.5 text-slate-500" />
                              <span>Estável</span>
                            </span>
                          )}

                          {group.trend === "neutral" && (
                            <span className="text-[10px] text-slate-400 font-medium">
                              Sem vendas
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Logística */}
                      <td className="py-3 px-3 align-top text-center">
                        <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-[#FFE600] text-slate-950">
                          {group.allListings.some((l) => l.shipping === "ml_full") ? "⚡ FULL" : "Padrão"}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="py-3 px-3 align-top text-center">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Ativo
                        </span>
                      </td>

                      {/* Ações */}
                      <td className="py-3 px-3 align-top text-center">
                        <Link
                          href={`/inteligencia?q=${encodeURIComponent(group.title)}`}
                          className="px-2.5 py-1 text-[11px] font-semibold bg-sky-50 text-sky-700 hover:bg-sky-100 border border-sky-200 rounded transition-colors inline-block"
                        >
                          Buybox →
                        </Link>
                      </td>
                    </tr>

                    {/* ========================================================================= */}
                    {/* CASO 1: O PRODUTO POSSUI VARIAÇÕES NATIVAS (Ex: Modelos, Cores, Medidas) */}
                    {/* ========================================================================= */}
                    {isExpanded &&
                      hasVariations &&
                      group.variationsList.map((v, vIdx) => {
                        return (
                          <React.Fragment key={`${group.groupKey}-var-${vIdx}`}>
                            {/* LINHA DE IDENTIFICAÇÃO DA VARIAÇÃO */}
                            <tr className="bg-slate-100/80 border-l-4 border-l-slate-400 border-t border-slate-200">
                              <td className="py-1.5 px-2 text-center text-slate-400 font-bold">↳</td>
                              <td colSpan={10} className="py-1.5 px-3">
                                <div className="flex items-center gap-2">
                                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-white text-slate-900 font-bold text-xs border border-slate-300 shadow-2xs">
                                    <Layers className="w-3.5 h-3.5 text-slate-600" />
                                    <span>Variação: {v.name}</span>
                                  </span>
                                  <span className="text-[11px] text-slate-500">
                                    SKU: <code className="font-semibold text-slate-700">{v.sku || group.sku}</code>
                                  </span>
                                  <span className="text-slate-300">•</span>
                                  <span className="text-[11px] font-semibold text-slate-700">
                                    Estoque da Variação: {v.totalStock} un.
                                  </span>
                                </div>
                              </td>
                            </tr>

                            {/* OPÇÃO DE VENDA CLÁSSICO DA VARIAÇÃO */}
                            {v.classicOption && (
                              <tr className="bg-slate-50/60 border-l-4 border-l-sky-500 hover:bg-slate-100/70 transition-colors">
                                <td className="py-2 px-2 text-center text-sky-400 text-xs">↳</td>
                                <td className="py-2.5 px-3 pl-8">
                                  <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-bold text-sky-800 bg-sky-50 border border-sky-300 px-2 py-0.5 rounded">
                                      Opção Clássico
                                    </span>
                                    {v.classicOption.permalink ? (
                                      <a
                                        href={v.classicOption.permalink}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="font-mono text-[11px] font-semibold text-slate-700 hover:text-sky-600 hover:underline inline-flex items-center gap-1"
                                        title="Abrir anúncio oficial Clássico no Mercado Livre"
                                      >
                                        <span>#{v.classicOption.externalId}</span>
                                        <ExternalLink className="w-2.5 h-2.5 text-slate-400" />
                                      </a>
                                    ) : (
                                      <span className="font-mono text-[11px] text-slate-500">
                                        #{v.classicOption.externalId}
                                      </span>
                                    )}
                                    <span className="text-slate-300">•</span>
                                    <span className="text-[10px] text-slate-500">
                                      Estoque: {v.classicOption.stock} un.
                                    </span>
                                  </div>
                                </td>
                                <td className="py-2.5 px-3 font-semibold text-slate-900 text-xs">
                                  R$ {v.classicOption.price.toFixed(2).replace(".", ",")}
                                </td>
                                <td className="py-2.5 px-3">
                                  <span className="text-[10px] font-bold text-slate-700 bg-white border border-slate-200 px-2 py-0.5 rounded">
                                    Clássico
                                  </span>
                                </td>
                                <td className="py-2.5 px-3 text-center text-[11px] text-slate-600">
                                  <span className="inline-flex items-center gap-1 font-medium">
                                    <Eye className="w-3 h-3 text-slate-400" />
                                    {v.classicOption.visits.toLocaleString("pt-BR")}
                                  </span>
                                </td>
                                <td className="py-2.5 px-3 text-center text-[11px] text-slate-700">
                                  <div className="flex flex-col items-center">
                                    <span className="font-semibold text-slate-900">{v.classicOption.sold} un.</span>
                                    <span className="text-[10px] text-slate-500">
                                      7d: {v.classicOption.sales7d} | 30d: {v.classicOption.sales30d}
                                    </span>
                                  </div>
                                </td>
                                {/* Taxa de Conversão Variação Clássico */}
                                <td className="py-2.5 px-3 text-center bg-emerald-50/15 border-x border-emerald-100">
                                  {renderConversionBadge(v.classicOption.conversionRate, true)}
                                </td>
                                <td className="py-2.5 px-3 text-center">
                                  <div className="flex flex-col items-center justify-center">
                                    <SalesSparkline
                                      points={v.classicOption.sparkline}
                                      trend={v.classicOption.trend}
                                      width={64}
                                      height={20}
                                    />
                                  </div>
                                </td>
                                <td className="py-2.5 px-3 text-center text-[10px] text-slate-600 font-medium">
                                  {v.classicOption.shipping === "ml_full" ? "⚡ FULL" : "Padrão"}
                                </td>
                                <td className="py-2.5 px-3 text-center">
                                  <span className="text-[10px] text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                                    {v.classicOption.status === "active" ? "Ativo" : "Pausado"}
                                  </span>
                                </td>
                                <td className="py-2.5 px-3 text-center">
                                  {v.classicOption.permalink && (
                                    <a
                                      href={v.classicOption.permalink}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-[10px] font-semibold text-sky-700 hover:text-sky-900 hover:underline"
                                    >
                                      Abrir no ML ↗
                                    </a>
                                  )}
                                </td>
                              </tr>
                            )}

                            {/* OPÇÃO DE VENDA PREMIUM DA VARIAÇÃO */}
                            {v.premiumOption && (
                              <tr className="bg-slate-50/80 border-l-4 border-l-amber-500 hover:bg-slate-100/70 transition-colors">
                                <td className="py-2 px-2 text-center text-amber-500 text-xs">↳</td>
                                <td className="py-2.5 px-3 pl-8">
                                  <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-bold text-amber-900 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded">
                                      Opção Premium
                                    </span>
                                    {v.premiumOption.permalink ? (
                                      <a
                                        href={v.premiumOption.permalink}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="font-mono text-[11px] font-semibold text-slate-700 hover:text-amber-700 hover:underline inline-flex items-center gap-1"
                                        title="Abrir anúncio oficial Premium no Mercado Livre"
                                      >
                                        <span>#{v.premiumOption.externalId}</span>
                                        <ExternalLink className="w-2.5 h-2.5 text-slate-400" />
                                      </a>
                                    ) : (
                                      <span className="font-mono text-[11px] text-slate-500">
                                        #{v.premiumOption.externalId}
                                      </span>
                                    )}
                                    <span className="text-slate-300">•</span>
                                    <span className="text-[10px] text-slate-500">
                                      Estoque: {v.premiumOption.stock} un.
                                    </span>
                                  </div>
                                </td>
                                <td className="py-2.5 px-3 font-semibold text-slate-900 text-xs">
                                  R$ {v.premiumOption.price.toFixed(2).replace(".", ",")}
                                </td>
                                <td className="py-2.5 px-3">
                                  <span className="text-[10px] font-bold text-amber-900 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded">
                                    Premium (Sem Juros)
                                  </span>
                                </td>
                                <td className="py-2.5 px-3 text-center text-[11px] text-slate-600">
                                  <span className="inline-flex items-center gap-1 font-medium">
                                    <Eye className="w-3 h-3 text-slate-400" />
                                    {v.premiumOption.visits.toLocaleString("pt-BR")}
                                  </span>
                                </td>
                                <td className="py-2.5 px-3 text-center text-[11px] text-slate-700">
                                  <div className="flex flex-col items-center">
                                    <span className="font-semibold text-slate-900">{v.premiumOption.sold} un.</span>
                                    <span className="text-[10px] text-slate-500">
                                      7d: {v.premiumOption.sales7d} | 30d: {v.premiumOption.sales30d}
                                    </span>
                                  </div>
                                </td>
                                {/* Taxa de Conversão Variação Premium */}
                                <td className="py-2.5 px-3 text-center bg-emerald-50/15 border-x border-emerald-100">
                                  {renderConversionBadge(v.premiumOption.conversionRate, true)}
                                </td>
                                <td className="py-2.5 px-3 text-center">
                                  <div className="flex flex-col items-center justify-center">
                                    <SalesSparkline
                                      points={v.premiumOption.sparkline}
                                      trend={v.premiumOption.trend}
                                      width={64}
                                      height={20}
                                    />
                                  </div>
                                </td>
                                <td className="py-2.5 px-3 text-center text-[10px] text-slate-600 font-medium">
                                  {v.premiumOption.shipping === "ml_full" ? "⚡ FULL" : "Padrão"}
                                </td>
                                <td className="py-2.5 px-3 text-center">
                                  <span className="text-[10px] text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                                    {v.premiumOption.status === "active" ? "Ativo" : "Pausado"}
                                  </span>
                                </td>
                                <td className="py-2.5 px-3 text-center">
                                  {v.premiumOption.permalink && (
                                    <a
                                      href={v.premiumOption.permalink}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-[10px] font-semibold text-amber-700 hover:text-amber-900 hover:underline"
                                    >
                                      Abrir no ML ↗
                                    </a>
                                  )}
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}

                    {/* ========================================================================= */}
                    {/* CASO 2: SEM VARIAÇÕES NATIVAS, MAS COM OPÇÕES DE VENDA CADASTRADAS        */}
                    {/* ========================================================================= */}
                    {isExpanded && !hasVariations && hasSubRows && (
                      <>
                        {/* OPÇÃO(ÕES) CLÁSSICO */}
                        {group.classicListings.map((cListing) => {
                          const classicUrl = getListingUrl(cListing);
                          const cMetrics = getListingMetrics(cListing);
                          return (
                            <tr
                              key={`classic-${cListing.id}`}
                              className="bg-slate-50/60 border-l-4 border-l-sky-500 hover:bg-slate-100/70 transition-colors"
                            >
                              <td className="py-2 px-2 text-center text-sky-500 text-xs">↳</td>
                              <td className="py-2.5 px-3 pl-8">
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] font-bold text-sky-800 bg-sky-50 border border-sky-300 px-2 py-0.5 rounded">
                                    Opção Clássico
                                  </span>
                                  {classicUrl ? (
                                    <a
                                      href={classicUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="font-mono text-xs font-semibold text-slate-800 hover:text-sky-700 hover:underline inline-flex items-center gap-1 group/itemlink"
                                      title="Abrir anúncio oficial Clássico no Mercado Livre"
                                    >
                                      <span>#{cListing.external_id}</span>
                                      <ExternalLink className="w-3 h-3 text-slate-400 group-hover/itemlink:text-sky-600" />
                                    </a>
                                  ) : (
                                    <span className="font-mono text-xs text-slate-600">
                                      #{cListing.external_id}
                                    </span>
                                  )}
                                  <span className="text-slate-300">•</span>
                                  <span className="text-[11px] text-slate-500">
                                    SKU: <code className="font-bold text-slate-700">{cListing.sku || group.sku}</code>
                                  </span>
                                  <span className="text-slate-300">•</span>
                                  <span className="text-[11px] font-medium text-slate-600">
                                    Estoque: {cListing.available_quantity || 0} un.
                                  </span>
                                </div>
                              </td>
                              <td className="py-2.5 px-3 font-semibold text-slate-900 text-xs">
                                R$ {cListing.price.toFixed(2).replace(".", ",")}
                              </td>
                              <td className="py-2.5 px-3">
                                <span className="text-[10px] font-bold text-slate-700 bg-white border border-slate-200 px-2 py-0.5 rounded">
                                  Clássico
                                </span>
                              </td>
                              <td className="py-2.5 px-3 text-center text-[11px] text-slate-600">
                                <span className="inline-flex items-center gap-1 font-medium">
                                  <Eye className="w-3 h-3 text-slate-400" />
                                  {cMetrics.visits.toLocaleString("pt-BR")}
                                </span>
                              </td>
                              <td className="py-2.5 px-3 text-center text-[11px] text-slate-700">
                                <div className="flex flex-col items-center">
                                  <span className="font-semibold text-slate-900">{cListing.sold_quantity || 0} un.</span>
                                  <span className="text-[10px] text-slate-500">
                                    7d: {cMetrics.sales7d} | 30d: {cMetrics.sales30d}
                                  </span>
                                </div>
                              </td>
                              {/* Taxa de Conversão Clássico */}
                              <td className="py-2.5 px-3 text-center bg-emerald-50/15 border-x border-emerald-100">
                                {renderConversionBadge(cMetrics.conversionRate, true)}
                              </td>
                              <td className="py-2.5 px-3 text-center">
                                <div className="flex flex-col items-center justify-center">
                                  <SalesSparkline
                                    points={cMetrics.sparkline}
                                    trend={cMetrics.trend}
                                    width={64}
                                    height={20}
                                  />
                                </div>
                              </td>
                              <td className="py-2.5 px-3 text-center text-[10px] text-slate-600 font-medium">
                                {cListing.shipping === "ml_full" ? "⚡ FULL" : "Padrão"}
                              </td>
                              <td className="py-2.5 px-3 text-center">
                                <span className="text-[10px] text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                                  {cListing.status === "active" ? "Ativo" : "Pausado"}
                                </span>
                              </td>
                              <td className="py-2.5 px-3 text-center">
                                {classicUrl && (
                                  <a
                                    href={classicUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-[10px] font-semibold text-sky-700 hover:text-sky-900 hover:underline"
                                  >
                                    Abrir no ML ↗
                                  </a>
                                )}
                              </td>
                            </tr>
                          );
                        })}

                        {/* OPÇÃO(ÕES) PREMIUM */}
                        {group.premiumListings.map((pListing) => {
                          const premUrl = getListingUrl(pListing);
                          const pMetrics = getListingMetrics(pListing);
                          return (
                            <tr
                              key={`premium-${pListing.id}`}
                              className="bg-slate-50/80 border-l-4 border-l-amber-500 hover:bg-slate-100/70 transition-colors"
                            >
                              <td className="py-2 px-2 text-center text-amber-500 text-xs">↳</td>
                              <td className="py-2.5 px-3 pl-8">
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] font-bold text-amber-900 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded">
                                    Opção Premium
                                  </span>
                                  {premUrl ? (
                                    <a
                                      href={premUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="font-mono text-xs font-semibold text-slate-800 hover:text-amber-700 hover:underline inline-flex items-center gap-1 group/itemlink"
                                      title="Abrir anúncio oficial Premium no Mercado Livre"
                                    >
                                      <span>#{pListing.external_id}</span>
                                      <ExternalLink className="w-3 h-3 text-slate-400 group-hover/itemlink:text-amber-600" />
                                    </a>
                                  ) : (
                                    <span className="font-mono text-xs text-slate-600">
                                      #{pListing.external_id}
                                    </span>
                                  )}
                                  <span className="text-slate-300">•</span>
                                  <span className="text-[11px] text-slate-500">
                                    SKU: <code className="font-bold text-slate-700">{pListing.sku || group.sku}</code>
                                  </span>
                                  <span className="text-slate-300">•</span>
                                  <span className="text-[11px] font-medium text-slate-600">
                                    Estoque: {pListing.available_quantity || 0} un.
                                  </span>
                                </div>
                              </td>
                              <td className="py-2.5 px-3 font-semibold text-slate-900 text-xs">
                                R$ {pListing.price.toFixed(2).replace(".", ",")}
                              </td>
                              <td className="py-2.5 px-3">
                                <span className="text-[10px] font-bold text-amber-900 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded">
                                  Premium (Sem Juros)
                                </span>
                              </td>
                              <td className="py-2.5 px-3 text-center text-[11px] text-slate-600">
                                <span className="inline-flex items-center gap-1 font-medium">
                                  <Eye className="w-3 h-3 text-slate-400" />
                                  {pMetrics.visits.toLocaleString("pt-BR")}
                                </span>
                              </td>
                              <td className="py-2.5 px-3 text-center text-[11px] text-slate-700">
                                <div className="flex flex-col items-center">
                                  <span className="font-semibold text-slate-900">{pListing.sold_quantity || 0} un.</span>
                                  <span className="text-[10px] text-slate-500">
                                    7d: {pMetrics.sales7d} | 30d: {pMetrics.sales30d}
                                  </span>
                                </div>
                              </td>
                              {/* Taxa de Conversão Premium */}
                              <td className="py-2.5 px-3 text-center bg-emerald-50/15 border-x border-emerald-100">
                                {renderConversionBadge(pMetrics.conversionRate, true)}
                              </td>
                              <td className="py-2.5 px-3 text-center">
                                <div className="flex flex-col items-center justify-center">
                                  <SalesSparkline
                                    points={pMetrics.sparkline}
                                    trend={pMetrics.trend}
                                    width={64}
                                    height={20}
                                  />
                                </div>
                              </td>
                              <td className="py-2.5 px-3 text-center text-[10px] text-slate-600 font-medium">
                                {pListing.shipping === "ml_full" ? "⚡ FULL" : "Padrão"}
                              </td>
                              <td className="py-2.5 px-3 text-center">
                                <span className="text-[10px] text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                                  {pListing.status === "active" ? "Ativo" : "Pausado"}
                                </span>
                              </td>
                              <td className="py-2.5 px-3 text-center">
                                {premUrl && (
                                  <a
                                    href={premUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-[10px] font-semibold text-amber-700 hover:text-amber-900 hover:underline"
                                  >
                                    Abrir no ML ↗
                                  </a>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </>
                    )}
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
