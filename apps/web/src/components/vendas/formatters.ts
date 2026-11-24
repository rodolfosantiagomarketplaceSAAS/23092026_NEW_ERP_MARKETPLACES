import type { DailyClosingRow, MlSaleOrder, Seller } from "@/types/ml-sales";
import { getOrderOperationalCostsOnly } from "@/lib/mercadolivre/sales-analytics";

/**
 * Retorna o Código Oficial da Venda exibido no painel "Vendas" do Mercado Livre:
 * prioriza `ml_pack_id` quando presente, com fallback para `ml_order_id`.
 */
export function getOfficialMlSaleCode(
  order: Pick<MlSaleOrder, "ml_order_id" | "ml_pack_id">
): string {
  return String(order.ml_pack_id ?? order.ml_order_id);
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

export function getTodayBrazilISO(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function computeDatePresetRange(
  preset: "today" | "yesterday" | "last7" | "thisMonth" | "lastMonth"
): { from: string; to: string } {
  const todayStr = getTodayBrazilISO();
  const [y, m, d] = todayStr.split("-").map(Number);
  const base = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));

  const toIso = (dt: Date) => dt.toISOString().slice(0, 10);

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

  // lastMonth
  const firstLastMonth = new Date(Date.UTC(y, m - 2, 1, 12, 0, 0));
  const lastLastMonth = new Date(Date.UTC(y, m - 1, 0, 12, 0, 0));
  return { from: toIso(firstLastMonth), to: toIso(lastLastMonth) };
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
}): void {
  const { rows, sellers, from, to } = params;
  const activeSellers = sellers.filter(
    (s) => s.active || rows.some((r) => (r.seller_transfers[s.id] ?? 0) > 0)
  );
  const includeUnassigned = rows.some((r) => r.unassigned_transfer_total > 0);

  const headers = [
    "Data",
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

  const csvContent = "\uFEFF" + lines.join("\r\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `fechamento-repasse-ml-${from}-a-${to}.csv`;
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
}): void {
  const { orders, sellers, from, to } = params;
  const sellerMap = new Map(sellers.map((s) => [s.id, s]));

  const headers = [
    "Data Venda",
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
    const cells: Array<string | number> = [
      formatDateTimeBR(o.order_date),
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

  const csvContent = "\uFEFF" + lines.join("\r\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `vendas-detalhadas-ml-${from}-a-${to}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
