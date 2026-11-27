import type {
  DailyClosingRow,
  MlProductReturnRankingRow,
  MlSaleOrder,
  SalesAnalysisMode,
  Seller,
} from "../../types/ml-sales";
import { getOrderOperationalCostsOnly } from "../../lib/mercadolivre/sales-analytics";

/**
 * Retorna o Código Oficial da Venda exibido no painel "Vendas" do Mercado Livre:
 * prioriza `ml_pack_id` quando presente, com fallback para `ml_order_id`.
 */
export function getOfficialMlSaleCode(
  order: Pick<MlSaleOrder, "ml_order_id" | "ml_pack_id">
): string {
  return String(order.ml_pack_id ?? order.ml_order_id);
}

export function formatLogisticTypeLabel(logisticType?: string | null): string | null {
  if (!logisticType) return null;
  const key = logisticType.trim().toLowerCase();
  switch (key) {
    case "fulfillment":
      return "Full";
    case "xd_drop_off":
      return "Agência ML";
    case "cross_docking":
      return "Coleta ML";
    case "self_service":
      return "Flex";
    case "drop_off":
      return "Correios";
    case "custom":
    case "me1":
      return "Envio Próprio";
    default:
      return null;
  }
}

const brlFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatBRL(value: number | null | undefined): string {
  return brlFormatter.format(Number(value || 0));
}

export function formatPct(value: number | null | undefined): string {
  return `${Number(value || 0).toFixed(1).replace(".", ",")}%`;
}

export function formatDateTimeBR(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export function formatShortDateBR(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
  }).format(d);
}

export function formatDeadlineBR(iso: string | null | undefined): {
  label: string;
  isUrgent: boolean;
  isOverdue: boolean;
} {
  if (!iso) return { label: "Sem prazo ML", isUrgent: false, isOverdue: false };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return { label: "Sem prazo ML", isUrgent: false, isOverdue: false };
  }

  const formatted = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);

  const diffMs = d.getTime() - Date.now();
  const isOverdue = diffMs < 0;
  const isUrgent = diffMs >= 0 && diffMs <= 24 * 60 * 60 * 1000;

  return {
    label: `Enviar ${formatted}`,
    isUrgent,
    isOverdue,
  };
}

export const SELLER_COLOR_SWATCHES = [
  "#0284C7", // Sky
  "#059669", // Emerald
  "#D97706", // Amber
  "#DC2626", // Crimson
  "#0D9488", // Teal
  "#EA580C", // Signal Orange
  "#65A30D", // Lime
  "#0891B2", // Cyan
  "#CA8A04", // Gold
  "#334155", // Slate
] as const;

export const MONTH_NAMES_PT = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
] as const;

export function upgradeMlThumbnailUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  return url
    .replace(/^http:\/\//i, "https://")
    .replace(/-I\.(jpg|jpeg|webp|png)$/i, "-O.$1");
}

export function toBrazilInputDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export function getTodayBrazilISO(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export type QuickDatePreset =
  | "today"
  | "yesterday"
  | "last7"
  | "thisMonth"
  | "lastMonth"
  | "thisYear"
  | "all";

export function computeDatePresetRange(
  preset: QuickDatePreset
): { from: string; to: string; isAll?: boolean } {
  const todayStr = getTodayBrazilISO();
  const [y, m, d] = todayStr.split("-").map(Number);
  const base = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));

  const toIso = (dt: Date) => dt.toISOString().slice(0, 10);

  if (preset === "all") {
    return { from: "", to: todayStr, isAll: true };
  }
  if (preset === "today") {
    return { from: todayStr, to: todayStr };
  }
  if (preset === "yesterday") {
    const yest = new Date(base);
    yest.setUTCDate(yest.getUTCDate() - 1);
    const s = toIso(yest);
    return { from: s, to: s };
  }
  if (preset === "last7") {
    const start = new Date(base);
    start.setUTCDate(start.getUTCDate() - 6);
    return { from: toIso(start), to: todayStr };
  }
  if (preset === "thisMonth") {
    const first = new Date(Date.UTC(y, m - 1, 1, 12, 0, 0));
    return { from: toIso(first), to: todayStr };
  }
  if (preset === "thisYear") {
    return { from: `${y}-01-01`, to: todayStr };
  }

  // lastMonth
  const firstLastMonth = new Date(Date.UTC(y, m - 2, 1, 12, 0, 0));
  const lastLastMonth = new Date(Date.UTC(y, m - 1, 0, 12, 0, 0));
  return { from: toIso(firstLastMonth), to: toIso(lastLastMonth) };
}

export function computeSpecificMonthRange(year: number, monthOneBased: number): {
  from: string;
  to: string;
} {
  const first = new Date(Date.UTC(year, monthOneBased - 1, 1, 12, 0, 0));
  const last = new Date(Date.UTC(year, monthOneBased, 0, 12, 0, 0));
  return {
    from: first.toISOString().slice(0, 10),
    to: last.toISOString().slice(0, 10),
  };
}

export function computeSpecificYearRange(year: number): { from: string; to: string } {
  const todayStr = getTodayBrazilISO();
  const currentYear = Number(todayStr.slice(0, 4));
  return {
    from: `${year}-01-01`,
    to: year === currentYear ? todayStr : `${year}-12-31`,
  };
}

function escapeCsvCell(val: string | number): string {
  const str = typeof val === "number" ? val.toFixed(2).replace(".", ",") : String(val);
  if (str.includes(";") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function exportDailyClosingToCsv(params: {
  rows: DailyClosingRow[];
  sellers: Seller[];
  from: string;
  to: string;
  analysisMode?: SalesAnalysisMode;
}): void {
  const { rows, sellers, from, to, analysisMode = "order_date" } = params;
  const activeSellers = sellers.filter(
    (s) => s.active || rows.some((r) => (r.seller_transfers[s.id] ?? 0) > 0)
  );
  const includeUnassigned = rows.some((r) => r.unassigned_transfer_total > 0);
  const dateHeader = analysisMode === "shipping_date" ? "Dia do Envio" : "Data da Venda";

  const headers = [
    dateHeader,
    "Qtd Vendas Validas",
    "Canceladas/Devolvidas",
    "Faturamento Bruto (R$)",
    "Taxas e Frete Liquido ML (R$)",
    ...activeSellers.map(
      (s) =>
        `Repasse ${s.name}${s.commission_pct < 100 ? ` (${s.commission_pct}%)` : ""} (R$)`
    ),
    ...(includeUnassigned ? ["Sem Vendedor (R$)"] : []),
    "Custos Operacionais + Imposto (R$)",
    "Lucro Limpo Total (R$)",
  ];

  const lines = [headers.map(escapeCsvCell).join(";")];

  for (const r of rows) {
    const rowCells: Array<string | number> = [
      r.date_label,
      String(r.valid_orders_count),
      String(r.cancelled_orders_count),
      r.gross_sale_total,
      r.net_ml_fees_and_shipping,
      ...activeSellers.map((s) => r.seller_transfers[s.id] ?? 0),
      ...(includeUnassigned ? [r.unassigned_transfer_total] : []),
      r.operational_costs_and_tax_total,
      r.net_operational_profit_total,
    ];
    lines.push(rowCells.map(escapeCsvCell).join(";"));
  }

  const modeSlug = analysisMode === "shipping_date" ? "por-dia-envio" : "por-data-venda";
  const csvContent = "\uFEFF" + lines.join("\r\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `fechamento-repasse-ml-${modeSlug}-${from}-a-${to}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function exportDetailedOrdersToCsv(params: {
  orders: MlSaleOrder[];
  sellers: Seller[];
  from: string;
  to: string;
  analysisMode?: SalesAnalysisMode;
}): void {
  const { orders, sellers, from, to, analysisMode = "order_date" } = params;
  const sellerMap = new Map(sellers.map((s) => [s.id, s]));

  const headers = [
    "Data Venda",
    "Data Real do Envio",
    "Modalidade Logistica",
    "Codigo Venda ML",
    "ID Subpedido API",
    "Loja",
    "Status",
    "Motivo Cancelamento",
    "MLB",
    "SKU",
    "Produto",
    "Qtd",
    "Vendedor",
    "Comprador",
    "Doc Tipo",
    "Venda Bruta (R$)",
    "Comissao ML (R$)",
    "Frete Vendedor (R$)",
    "Estorno Promo ML (R$)",
    "Base Repasse Vendedor (R$)",
    "Imposto (R$)",
    "Custos Operacionais (R$)",
    "Lucro Limpo (R$)",
    "Verificado",
  ];

  const lines = [headers.map(escapeCsvCell).join(";")];

  for (const o of orders) {
    const sellerName = o.assigned_seller_id
      ? sellerMap.get(o.assigned_seller_id)?.name || "—"
      : "Sem Vendedor";
    const logisticLabel = formatLogisticTypeLabel(o.logistic_type) || o.logistic_type || "—";
    const cells: Array<string | number> = [
      formatDateTimeBR(o.order_date),
      o.shipped_at ? formatDateTimeBR(o.shipped_at) : "Pendente",
      logisticLabel,
      getOfficialMlSaleCode(o),
      String(o.ml_order_id),
      o.store_name,
      o.status,
      o.cancellation_reason || "",
      o.mlb_id,
      o.sku || "",
      o.product_title,
      String(o.quantity),
      sellerName,
      o.buyer_name,
      o.is_business_buyer ? "CNPJ" : o.buyer_document ? "CPF" : "—",
      o.gross_sale_amount,
      o.ml_commission_amount,
      o.ml_shipping_cost,
      o.ml_promo_rebate,
      o.seller_transfer_profit,
      o.tax_amount,
      getOrderOperationalCostsOnly(o),
      o.net_operational_profit,
      o.verified_at ? "Sim" : "Não",
    ];
    lines.push(cells.map(escapeCsvCell).join(";"));
  }

  const modeSlug = analysisMode === "shipping_date" ? "por-dia-envio" : "por-data-venda";
  const csvContent = "\uFEFF" + lines.join("\r\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `vendas-detalhadas-ml-${modeSlug}-${from}-a-${to}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function exportReturnsRankingToCsv(params: {
  rows: MlProductReturnRankingRow[];
  from: string;
  to: string;
  analysisMode?: SalesAnalysisMode;
}): void {
  const { rows, from, to, analysisMode = "order_date" } = params;

  const headers = [
    "MLB",
    "SKU",
    "Produto",
    "Total Pedidos no Periodo",
    "Unidades Totais",
    "Pedidos Validos",
    "Devolucoes (Pos-Envio)",
    "Cancelamentos",
    "Total Ocorrencias",
    "Unidades Afetadas",
    "Taxa Devolucao (%)",
    "Taxa Cancelamento (%)",
    "Taxa Total Perda no Item (%)",
    "Valor Bruto Devolvido (R$)",
    "Valor Bruto Cancelado (R$)",
    "Valor Bruto Total Perdido (R$)",
    "Custo Operacional em Devolucoes (R$)",
    "Principal Motivo ML",
  ];

  const lines = [headers.map(escapeCsvCell).join(";")];

  for (const r of rows) {
    const cells: Array<string | number> = [
      r.mlb_id,
      r.sku || "",
      r.product_title,
      String(r.total_orders_count),
      String(r.total_units),
      String(r.valid_orders_count),
      String(r.returned_orders_count),
      String(r.cancelled_orders_count),
      String(r.affected_orders_count),
      String(r.affected_units),
      r.return_rate_pct,
      r.cancel_rate_pct,
      r.loss_rate_pct,
      r.gross_returned_amount,
      r.gross_cancelled_amount,
      r.gross_affected_amount,
      r.retained_operational_cost,
      r.top_reason || "",
    ];
    lines.push(cells.map(escapeCsvCell).join(";"));
  }

  const modeSlug = analysisMode === "shipping_date" ? "por-dia-envio" : "por-data-venda";
  const csvContent = "\uFEFF" + lines.join("\r\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `analise-devolucoes-cancelamentos-ml-${modeSlug}-${from}-a-${to}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
