"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BookmarkCheck,
  BookmarkPlus,
  Building2,
  CalendarPlus,
  Check,
  CheckCircle2,
  Clock,
  ExternalLink,
  Loader2,
  Package,
  PencilLine,
  RotateCcw,
  ShieldCheck,
  Truck,
  UserCheck,
  X,
} from "lucide-react";
import type {
  MlSaleOrder,
  ProductCostTemplate,
  SalesAnalysisMode,
  Seller,
} from "@/types/ml-sales";
import {
  getOrderOperationalCostsOnly,
  isCancelledOrReturned,
  isMpMoneyReleased,
  roundCurrency,
} from "@/lib/mercadolivre/sales-analytics";
import {
  formatBRL,
  formatDateTimeBR,
  formatDeadlineBR,
  formatLogisticTypeLabel,
  formatPct,
  formatShortDateBR,
  getOfficialMlSaleCode,
  getTodayBrazilISO,
  toBrazilInputDate,
} from "./formatters";
import { OrderCostsPopover } from "./OrderCostsPopover";
import { PlatformFeeBreakdownTooltip } from "./PlatformFeeBreakdownTooltip";
import { ProductThumbnailPreview } from "./ProductThumbnailPreview";
import { SellerQuickColorPopover } from "./SellerQuickColorPopover";
import { useErpListingLinks } from "@/hooks/useErpListingLinks";
import { ErpListingLinkBadge } from "@/components/produtos/ErpListingLinkBadge";
import { LinkListingModal } from "@/components/produtos/LinkListingModal";
import { ProductDetailDrawer } from "@/components/produtos/ProductDetailDrawer";
import type { ErpListingLink, ErpProductWithSummary } from "@/types/erp-products";

interface DailySalesTableProps {
  orders: MlSaleOrder[];
  sellers: Seller[];
  templates: ProductCostTemplate[];
  analysisMode?: SalesAnalysisMode;
  emptyTitle?: string;
  emptyDescription?: string;
  onRefresh: () => void;
}

export function DailySalesTable({
  orders,
  sellers,
  templates,
  analysisMode = "order_date",
  emptyTitle,
  emptyDescription,
  onRefresh,
}: DailySalesTableProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchSellerId, setBatchSellerId] = useState<string>("");
  const [batchShippedDate, setBatchShippedDate] = useState<string>(() =>
    getTodayBrazilISO()
  );
  const [busyRowId, setBusyRowId] = useState<string | null>(null);
  const [batchBusy, setBatchBusy] = useState<boolean>(false);
  const [editingCostsOrder, setEditingCostsOrder] = useState<MlSaleOrder | null>(null);

  // Edição inline de Data de Envio por linha
  const [editingShippedOrderId, setEditingShippedOrderId] = useState<string | null>(
    null
  );
  const [draftShippedDate, setDraftShippedDate] = useState<string>("");

  // Vínculos ERP (Produtos, Kits & Consumo de Bobinas PPF)
  const erpLinks = useErpListingLinks();
  const [erpDetailState, setErpDetailState] = useState<{
    product: ErpProductWithSummary;
    qty: number;
    contextLabel?: string;
  } | null>(null);
  const [erpLinkModalState, setErpLinkModalState] = useState<{
    initialListing: {
      platform: "mercadolivre";
      external_listing_id: string;
      listing_sku?: string | null;
      listing_title?: string | null;
      listing_thumbnail?: string | null;
    };
    existingLink?: ErpListingLink | null;
  } | null>(null);

  const isShippingMode = analysisMode === "shipping_date";

  const activeSellers = useMemo(
    () => sellers.filter((s) => s.active),
    [sellers]
  );

  const sellerMap = useMemo(
    () => new Map(sellers.map((s) => [s.id, s])),
    [sellers]
  );

  const templateMap = useMemo(
    () => new Map(templates.map((t) => [t.mlb_id.toUpperCase(), t])),
    [templates]
  );

  const packItemCounts = useMemo(() => {
    const counts = new Map<number, number>();
    for (const o of orders) {
      if (o.ml_pack_id) {
        counts.set(o.ml_pack_id, (counts.get(o.ml_pack_id) ?? 0) + 1);
      }
    }
    return counts;
  }, [orders]);

  // Garante que seleções em lote nunca incluam pedidos ocultos ao trocar de dia filtrado
  useEffect(() => {
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      const visibleSet = new Set(orders.map((o) => o.id));
      let changed = false;
      const next = new Set<string>();
      prev.forEach((id) => {
        if (visibleSet.has(id)) next.add(id);
        else changed = true;
      });
      return changed ? next : prev;
    });
  }, [orders]);

  const allVisibleSelected =
    orders.length > 0 && orders.every((o) => selectedIds.has(o.id));

  function toggleSelectAll() {
    if (allVisibleSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(orders.map((o) => o.id)));
    }
  }

  function toggleRowSelection(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function startEditingShippedDate(order: MlSaleOrder) {
    const initial =
      toBrazilInputDate(order.shipped_at) ||
      toBrazilInputDate(order.order_date) ||
      getTodayBrazilISO();
    setDraftShippedDate(initial);
    setEditingShippedOrderId(order.id);
  }

  async function handleSaveSingleShippedDate(
    order: MlSaleOrder,
    nextDateStr: string | null
  ) {
    setBusyRowId(order.id);
    try {
      const res = await fetch("/api/ml/sales/assign", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderIds: [order.id],
          updateSellerAssignment: false,
          updateShippedAt: true,
          shippedAt: nextDateStr,
        }),
      });
      if (res.ok) {
        setEditingShippedOrderId(null);
        onRefresh();
      }
    } finally {
      setBusyRowId(null);
    }
  }

  async function handleRevertSingleShippedDateToApi(order: MlSaleOrder) {
    setBusyRowId(order.id);
    try {
      const res = await fetch("/api/ml/sales/assign", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderIds: [order.id],
          updateSellerAssignment: false,
          revertShippedAtToApi: true,
        }),
      });
      if (res.ok) {
        setEditingShippedOrderId(null);
        onRefresh();
      }
    } finally {
      setBusyRowId(null);
    }
  }

  async function handleAssignSingle(
    order: MlSaleOrder,
    newSellerId: string | null,
    saveAsMlbDefault = false
  ) {
    setBusyRowId(order.id);
    try {
      const res = await fetch("/api/ml/sales/assign", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderIds: [order.id],
          assignedSellerId: newSellerId,
          updateSellerAssignment: true,
          saveDefaultForMlb: saveAsMlbDefault ? order.mlb_id : undefined,
        }),
      });
      if (res.ok) {
        onRefresh();
      }
    } finally {
      setBusyRowId(null);
    }
  }

  async function handleToggleVerified(order: MlSaleOrder) {
    setBusyRowId(order.id);
    try {
      const res = await fetch("/api/ml/sales/assign", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderIds: [order.id],
          updateSellerAssignment: false,
          markVerified: !order.verified_at,
        }),
      });
      if (res.ok) {
        onRefresh();
      }
    } finally {
      setBusyRowId(null);
    }
  }

  async function handleBatchAssign() {
    if (selectedIds.size === 0) return;
    setBatchBusy(true);
    try {
      const res = await fetch("/api/ml/sales/assign", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderIds: Array.from(selectedIds),
          assignedSellerId:
            batchSellerId === "__CLEAR__" ? null : batchSellerId || null,
          updateSellerAssignment: true,
        }),
      });
      if (res.ok) {
        setSelectedIds(new Set());
        setBatchSellerId("");
        onRefresh();
      }
    } finally {
      setBatchBusy(false);
    }
  }

  async function handleBatchSetShippedAt() {
    if (selectedIds.size === 0 || !batchShippedDate) return;
    setBatchBusy(true);
    try {
      const res = await fetch("/api/ml/sales/assign", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderIds: Array.from(selectedIds),
          updateSellerAssignment: false,
          updateShippedAt: true,
          shippedAt: batchShippedDate,
        }),
      });
      if (res.ok) {
        setSelectedIds(new Set());
        onRefresh();
      }
    } finally {
      setBatchBusy(false);
    }
  }

  async function handleBatchRevertShippedAt() {
    if (selectedIds.size === 0) return;
    setBatchBusy(true);
    try {
      const res = await fetch("/api/ml/sales/assign", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderIds: Array.from(selectedIds),
          updateSellerAssignment: false,
          revertShippedAtToApi: true,
        }),
      });
      if (res.ok) {
        setSelectedIds(new Set());
        onRefresh();
      }
    } finally {
      setBatchBusy(false);
    }
  }

  async function handleBatchVerify() {
    if (selectedIds.size === 0) return;
    setBatchBusy(true);
    try {
      const res = await fetch("/api/ml/sales/assign", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderIds: Array.from(selectedIds),
          updateSellerAssignment: false,
          markVerified: true,
        }),
      });
      if (res.ok) {
        setSelectedIds(new Set());
        onRefresh();
      }
    } finally {
      setBatchBusy(false);
    }
  }

  if (orders.length === 0) {
    return (
      <div className="bg-white border border-[#E2E8F0] rounded p-10 text-center space-y-2">
        {isShippingMode ? (
          <Truck className="w-8 h-8 text-slate-300 mx-auto" />
        ) : (
          <Package className="w-8 h-8 text-slate-300 mx-auto" />
        )}
        <div className="text-sm font-bold text-slate-800">
          {emptyTitle ||
            "Nenhuma venda encontrada para os filtros e período selecionados"}
        </div>
        <p className="text-xs text-slate-500 max-w-lg mx-auto">
          {emptyDescription ? (
            emptyDescription
          ) : (
            <>
              Clique em <strong>&ldquo;Forçar Sincronização ML&rdquo;</strong> no topo para buscar
              os pedidos e datas reais de envio na API oficial do Mercado Livre ou ajuste o
              intervalo de datas.
            </>
          )}
        </p>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="bg-white border border-[#E2E8F0] rounded shadow-2xs overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs min-w-[1500px]">
          <thead>
            <tr className="bg-slate-900 text-slate-200 border-b border-slate-800 uppercase text-[10px] font-bold tracking-wider">
              <th className="py-2.5 px-2.5 w-9 text-center">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={toggleSelectAll}
                  aria-label="Selecionar todas as vendas visíveis"
                  className="rounded border-slate-600 bg-slate-800 text-sky-500 cursor-pointer"
                />
              </th>
              <th className="py-2.5 px-2.5 min-w-[205px]">
                {isShippingMode ? "Enviado Dia / Data Venda" : "Data Venda / Envio"}
              </th>
              <th className="py-2.5 px-2.5 min-w-[340px] max-w-[480px]">Produto / Variação</th>
              <th className="py-2.5 px-2.5 min-w-[190px]">Vendedor (Repasse)</th>
              <th className="py-2.5 px-2.5 min-w-[170px] max-w-[240px]">Comprador</th>
              <th className="py-2.5 px-2.5 text-right">Venda Bruta</th>
              <th className="py-2.5 px-2.5 text-right">Taxas ML & Frete</th>
              <th className="py-2.5 px-2.5 text-right bg-emerald-950/70 text-emerald-200">
                Repasse Vendedor
              </th>
              <th className="py-2.5 px-2.5 text-right">Custos & Imposto</th>
              <th className="py-2.5 px-2.5 text-right">Lucro Limpo</th>
              <th className="py-2.5 px-2.5 text-center">Repasse MP & Conf.</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100">
            {orders.map((order) => {
              const isSelected = selectedIds.has(order.id);
              const cancelled = isCancelledOrReturned(order.status);
              const assignedSeller = order.assigned_seller_id
                ? sellerMap.get(order.assigned_seller_id)
                : null;
              const tpl = templateMap.get(order.mlb_id.toUpperCase());
              const isDefaultMlbSeller =
                Boolean(assignedSeller) && tpl?.default_seller_id === assignedSeller?.id;

              const deadline = formatDeadlineBR(order.shipping_deadline);
              const logisticLabel = formatLogisticTypeLabel(order.logistic_type);
              const opCostsOnly = getOrderOperationalCostsOnly(order);
              const totalInternalCostsAndTax = roundCurrency(order.tax_amount + opCostsOnly);
              const marginPct =
                !cancelled && order.gross_sale_amount > 0
                  ? roundCurrency((order.net_operational_profit / order.gross_sale_amount) * 100)
                  : 0;
              const mpReleased = isMpMoneyReleased(order);
              const isRowBusy = busyRowId === order.id;
              const isEditingShipDate = editingShippedOrderId === order.id;

              const sellerCotaPct = assignedSeller
                ? Number(assignedSeller.commission_pct ?? 100)
                : 100;
              const sellerEffectiveAmount = roundCurrency(
                order.seller_transfer_profit * (sellerCotaPct / 100)
              );

              return (
                <tr
                  key={order.id}
                  className={`transition-colors ${
                    cancelled
                      ? "bg-rose-50/35 hover:bg-rose-50/60"
                      : isSelected
                      ? "bg-sky-50/60 hover:bg-sky-50"
                      : "hover:bg-slate-50/90"
                  }`}
                >
                  {/* 1. Checkbox */}
                  <td className="py-2.5 px-2.5 text-center align-top pt-3.5">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleRowSelection(order.id)}
                      aria-label={`Selecionar pedido ${order.ml_order_id}`}
                      className="rounded border-slate-300 text-sky-600 cursor-pointer"
                    />
                  </td>

                  {/* 2. Data Venda / Dia do Envio (com Edição Manual Protegida) */}
                  <td className="py-2.5 px-2.5 align-top whitespace-nowrap">
                    {isShippingMode ? (
                      <>
                        {order.shipped_at ? (
                          <div className="flex items-center gap-1">
                            <div
                              className="inline-flex items-center gap-1 font-mono font-black text-emerald-800 text-[11px]"
                              title={
                                order.shipped_at_manual
                                  ? "Data de envio definida manualmente pelo gestor (protegida contra sobrescrita da API)"
                                  : "Data e hora real em que o produto foi postado/coletado na API do Mercado Livre"
                              }
                            >
                              <Truck className="w-3 h-3 text-emerald-700 shrink-0" />
                              <span>
                                Env:{" "}
                                {order.shipped_at_manual
                                  ? formatShortDateBR(order.shipped_at)
                                  : formatDateTimeBR(order.shipped_at)}
                              </span>
                            </div>
                            {order.shipped_at_manual && (
                              <span className="px-1 py-0.2 rounded-xs bg-sky-100 text-sky-900 border border-sky-300 text-[9px] font-bold">
                                Manual
                              </span>
                            )}
                            <button
                              type="button"
                              disabled={isRowBusy}
                              onClick={() => startEditingShippedDate(order)}
                              className="p-0.5 rounded-xs text-slate-400 hover:text-sky-700 hover:bg-sky-50"
                              title="Alterar data de envio desta venda"
                              aria-label={`Alterar data de envio do pedido ${order.ml_order_id}`}
                            >
                              <PencilLine className="w-3 h-3" />
                            </button>
                            {order.shipped_at_manual && (
                              <button
                                type="button"
                                disabled={isRowBusy}
                                onClick={() => handleRevertSingleShippedDateToApi(order)}
                                className="p-0.5 rounded-xs text-amber-700 hover:text-amber-950 hover:bg-amber-100"
                                title="Reverter para a data automática oficial da API do Mercado Livre"
                                aria-label="Reverter para data oficial do ML"
                              >
                                <RotateCcw className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        ) : (
                          <div className="flex flex-wrap items-center gap-1">
                            {cancelled ? (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-xs bg-rose-50 text-rose-800 border border-rose-200 text-[10px] font-bold">
                                Sem Envio
                              </span>
                            ) : order.status === "shipped" || order.status === "delivered" ? (
                              <span
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-xs bg-sky-50 text-sky-900 border border-sky-300 text-[10px] font-bold"
                                title="Pedido consta como enviado/entregue no ML — clique em Forçar Sincronização ML ou defina a data"
                              >
                                <Truck className="w-3 h-3 text-sky-700 shrink-0" />
                                Sincronizar Envio
                              </span>
                            ) : (
                              <span
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-xs bg-amber-50 text-amber-900 border border-amber-300 text-[10px] font-bold"
                                title="Venda paga aguardando bipagem/coleta na transportadora (não soma nos cards de envio até ser despachada)"
                              >
                                <Clock className="w-3 h-3 text-amber-700 shrink-0" />
                                Aguardando Envio
                              </span>
                            )}
                            {!cancelled && (
                              <button
                                type="button"
                                disabled={isRowBusy}
                                onClick={() => startEditingShippedDate(order)}
                                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-xs bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-[10px] font-semibold text-emerald-800"
                                title="Definir manualmente a data de envio desta venda"
                              >
                                <CalendarPlus className="w-2.5 h-2.5" />
                                Definir
                              </button>
                            )}
                          </div>
                        )}
                        <div className="text-[10px] font-mono text-slate-500 mt-0.5">
                          Venda: {formatDateTimeBR(order.order_date)}
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="font-mono font-bold text-slate-900 text-[11px]">
                          {formatDateTimeBR(order.order_date)}
                        </div>
                        {order.shipped_at ? (
                          <div className="flex items-center gap-1 mt-0.5">
                            <span
                              className="text-[10px] font-mono font-semibold text-emerald-700"
                              title={
                                order.shipped_at_manual
                                  ? "Data de envio definida manualmente pelo gestor (protegida contra sobrescrita)"
                                  : "Data e hora real em que o produto foi postado/coletado"
                              }
                            >
                              Enviado:{" "}
                              {order.shipped_at_manual
                                ? formatShortDateBR(order.shipped_at)
                                : formatDateTimeBR(order.shipped_at)}
                            </span>
                            {order.shipped_at_manual && (
                              <span className="px-1 py-0.2 rounded-xs bg-sky-100 text-sky-900 border border-sky-300 text-[9px] font-bold">
                                Manual
                              </span>
                            )}
                            <button
                              type="button"
                              disabled={isRowBusy}
                              onClick={() => startEditingShippedDate(order)}
                              className="p-0.5 rounded-xs text-slate-400 hover:text-sky-700 hover:bg-sky-50"
                              title="Alterar data de envio desta venda"
                              aria-label={`Alterar data de envio do pedido ${order.ml_order_id}`}
                            >
                              <PencilLine className="w-2.5 h-2.5" />
                            </button>
                            {order.shipped_at_manual && (
                              <button
                                type="button"
                                disabled={isRowBusy}
                                onClick={() => handleRevertSingleShippedDateToApi(order)}
                                className="p-0.5 rounded-xs text-amber-700 hover:text-amber-950 hover:bg-amber-100"
                                title="Reverter para a data oficial da API do Mercado Livre"
                                aria-label="Reverter para data oficial do ML"
                              >
                                <RotateCcw className="w-2.5 h-2.5" />
                              </button>
                            )}
                          </div>
                        ) : (
                          !cancelled && (
                            <button
                              type="button"
                              disabled={isRowBusy}
                              onClick={() => startEditingShippedDate(order)}
                              className="mt-0.5 inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 hover:text-emerald-900 hover:underline"
                              title="Definir manualmente a data de envio para apurar métricas por dia de envio"
                            >
                              <CalendarPlus className="w-3 h-3" />
                              Definir Data Envio
                            </button>
                          )
                        )}
                      </>
                    )}

                    {/* Editor Inline de Data de Envio */}
                    {isEditingShipDate && (
                      <div className="mt-1.5 p-1.5 rounded-xs bg-slate-900 text-white border border-slate-700 space-y-1.5 shadow-lg">
                        <div className="text-[9px] font-bold uppercase tracking-wider text-emerald-300">
                          Definir Data de Envio
                        </div>
                        <div className="flex items-center gap-1">
                          <input
                            type="date"
                            aria-label="Data de envio manual"
                            value={draftShippedDate}
                            onChange={(e) => setDraftShippedDate(e.target.value)}
                            className="px-1.5 py-0.5 bg-slate-800 border border-slate-600 rounded-xs text-[11px] font-mono text-white focus:outline-none focus:border-emerald-400"
                          />
                          <button
                            type="button"
                            disabled={isRowBusy || !draftShippedDate}
                            onClick={() =>
                              handleSaveSingleShippedDate(order, draftShippedDate)
                            }
                            className="p-1 rounded-xs bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white"
                            title="Salvar data de envio"
                            aria-label="Salvar data de envio"
                          >
                            {isRowBusy ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Check className="w-3 h-3" />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingShippedOrderId(null)}
                            className="p-1 rounded-xs bg-slate-800 hover:bg-slate-700 text-slate-300"
                            title="Cancelar"
                            aria-label="Cancelar edição de data"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                        {order.shipped_at && (
                          <div className="flex items-center justify-between gap-2 pt-0.5 border-t border-slate-800 text-[9px]">
                            <button
                              type="button"
                              disabled={isRowBusy}
                              onClick={() => handleSaveSingleShippedDate(order, null)}
                              className="text-rose-300 hover:underline"
                            >
                              Limpar data
                            </button>
                            {order.shipped_at_manual && (
                              <button
                                type="button"
                                disabled={isRowBusy}
                                onClick={() => handleRevertSingleShippedDateToApi(order)}
                                className="text-amber-300 hover:underline"
                              >
                                Restaurar API ML
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    <div className="text-[10px] font-mono text-slate-500 mt-0.5">
                      <span
                        className="font-semibold text-slate-700"
                        title={
                          order.ml_pack_id
                            ? `Código Oficial da Venda no ML: #${order.ml_pack_id} · Subpedido API: #${order.ml_order_id}`
                            : `Código Oficial da Venda no ML: #${order.ml_order_id}`
                        }
                      >
                        #{getOfficialMlSaleCode(order)}
                      </span>{" "}
                      · {order.store_name}
                    </div>

                    <div className="mt-1 flex flex-wrap items-center gap-1">
                      {cancelled ? (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-xs text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                          <AlertTriangle className="w-2.5 h-2.5" />
                          {order.status === "returned" ? "Devolvida" : "Cancelada"}
                        </span>
                      ) : order.status === "delivered" ? (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-xs text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <CheckCircle2 className="w-2.5 h-2.5" />
                          Entregue
                        </span>
                      ) : order.status === "shipped" || Boolean(order.shipped_at) ? (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-xs text-[10px] font-semibold bg-sky-50 text-sky-700 border border-sky-200">
                          <Truck className="w-2.5 h-2.5" />
                          {order.status === "shipped" ? "Em Trânsito" : "Enviado (Manual)"}
                        </span>
                      ) : (
                        <span
                          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-xs text-[10px] font-semibold border ${
                            deadline.isOverdue
                              ? "bg-rose-100 text-rose-800 border-rose-300"
                              : deadline.isUrgent
                              ? "bg-amber-100 text-amber-900 border-amber-300"
                              : "bg-slate-100 text-slate-700 border-slate-200"
                          }`}
                        >
                          <Clock className="w-2.5 h-2.5" />
                          {deadline.label}
                        </span>
                      )}

                      {logisticLabel && (
                        <span className="px-1.5 py-0.5 rounded-xs text-[9px] font-mono font-bold bg-slate-100 text-slate-600 border border-slate-200">
                          {logisticLabel}
                        </span>
                      )}
                    </div>
                  </td>

                  {/* 3. Produto (com Zoom via Portal fora da tabela — sem corte pelo cabeçalho) */}
                  <td className="py-2.5 px-2.5 align-top min-w-[340px] max-w-[480px]">
                    <div className="flex items-start gap-3">
                      <ProductThumbnailPreview
                        thumbnailUrl={order.product_thumbnail}
                        title={order.product_title}
                        permalink={order.permalink}
                        sizeClassName="w-16 h-16"
                      />

                      <div className="min-w-0 flex-1">
                        <div className="flex items-start gap-1">
                          <span
                            className="font-semibold text-slate-900 text-xs leading-snug break-words"
                            title={order.product_title}
                          >
                            {order.product_title}
                          </span>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] font-mono">
                          {order.permalink ? (
                            <a
                              href={order.permalink}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded-xs bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold"
                            >
                              {order.mlb_id}
                              <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                          ) : (
                            <span className="px-1.5 py-0.2 rounded-xs bg-slate-100 text-slate-700 font-semibold">
                              {order.mlb_id}
                            </span>
                          )}

                          {order.sku && (
                            <span className="px-1.5 py-0.2 rounded-xs bg-slate-50 border border-slate-200 text-slate-600">
                              SKU: {order.sku}
                            </span>
                          )}

                          <span
                            className={`px-1.5 py-0.2 rounded-xs font-bold ${
                              order.quantity > 1
                                ? "bg-amber-100 text-amber-900 border border-amber-300"
                                : "bg-slate-100 text-slate-700"
                            }`}
                          >
                            {order.quantity}x
                          </span>

                          {order.ml_pack_id && (packItemCounts.get(order.ml_pack_id) ?? 0) > 1 && (
                            <span
                              className="px-1.5 py-0.2 rounded-xs bg-sky-50 text-sky-700 border border-sky-200"
                              title={`Carrinho ML Pack #${order.ml_pack_id}`}
                            >
                              Pack
                            </span>
                          )}
                        </div>

                        {/* Vínculo ERP: Custo do Produto/Kit & Consumo da Bobina PPF nesta venda */}
                        {erpLinks.schemaReady && (() => {
                          const matchedLink =
                            erpLinks.linkByExternalId.get((order.mlb_id || "").toUpperCase()) ??
                            null;
                          return (
                            <ErpListingLinkBadge
                              link={matchedLink}
                              saleQuantity={order.quantity}
                              onInspect={(prod, qty) =>
                                setErpDetailState({
                                  product: prod,
                                  qty,
                                  contextLabel: `Venda #${getOfficialMlSaleCode(order)} (${order.quantity}x) • ${order.mlb_id}`,
                                })
                              }
                              onLinkClick={() =>
                                setErpLinkModalState({
                                  initialListing: {
                                    platform: "mercadolivre",
                                    external_listing_id: order.mlb_id,
                                    listing_sku: order.sku || null,
                                    listing_title: order.product_title,
                                    listing_thumbnail: order.product_thumbnail || null,
                                  },
                                  existingLink: matchedLink,
                                })
                              }
                            />
                          );
                        })()}
                      </div>
                    </div>
                  </td>

                  {/* 4. Vendedor (Repasse) — 1 Clique Inline + Alteração Rápida de Cor */}
                  <td className="py-2.5 px-2.5 align-top">
                    <div className="space-y-1">
                      <div className="relative flex items-center gap-1.5">
                        {assignedSeller ? (
                          <SellerQuickColorPopover
                            seller={assignedSeller}
                            sizeClassName="w-3 h-3"
                            onColorSaved={onRefresh}
                          />
                        ) : (
                          <span className="w-3 h-3 rounded-xs shrink-0 bg-slate-300" />
                        )}
                        <select
                          aria-label={`Atribuir vendedor ao pedido ${order.ml_order_id}`}
                          disabled={isRowBusy}
                          value={order.assigned_seller_id || ""}
                          onChange={(e) =>
                            handleAssignSingle(
                              order,
                              e.target.value ? e.target.value : null,
                              false
                            )
                          }
                          style={
                            assignedSeller
                              ? {
                                  borderColor: assignedSeller.color_hex,
                                  backgroundColor: `${assignedSeller.color_hex}14`,
                                }
                              : undefined
                          }
                          className={`w-full text-[11px] font-bold rounded-xs border px-2 py-1 focus:outline-none cursor-pointer ${
                            assignedSeller
                              ? "text-slate-900"
                              : "bg-amber-50/70 border-amber-300 text-amber-900"
                          }`}
                        >
                          <option value="">— Sem Vendedor —</option>
                          {activeSellers.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                              {s.commission_pct < 100 ? ` (${s.commission_pct}%)` : ""}
                            </option>
                          ))}
                          {assignedSeller && !assignedSeller.active && (
                            <option value={assignedSeller.id}>
                              {assignedSeller.name} (Inativo)
                            </option>
                          )}
                        </select>
                      </div>

                      {assignedSeller && (
                        <div>
                          {isDefaultMlbSeller ? (
                            <span className="inline-flex items-center gap-1 text-[10px] text-emerald-700 font-medium">
                              <BookmarkCheck className="w-3 h-3" />
                              Padrão deste MLB
                            </span>
                          ) : (
                            <button
                              type="button"
                              disabled={isRowBusy}
                              onClick={() =>
                                handleAssignSingle(order, assignedSeller.id, true)
                              }
                              className="inline-flex items-center gap-1 text-[10px] text-sky-700 hover:text-sky-900 hover:underline font-medium"
                              title={`Definir ${assignedSeller.name} como vendedor automático de ${order.mlb_id}`}
                            >
                              <BookmarkPlus className="w-3 h-3" />
                              Salvar padrão p/ {order.mlb_id}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </td>

                  {/* 5. Comprador */}
                  <td className="py-2.5 px-2.5 align-top min-w-[170px] max-w-[240px]">
                    <div
                      className="text-[11px] font-semibold text-slate-900 leading-snug break-words"
                      title={order.buyer_name}
                    >
                      {order.buyer_name}
                    </div>
                    <div className="mt-1 flex items-center gap-1">
                      {order.is_business_buyer ? (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-xs text-[9px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                          <Building2 className="w-2.5 h-2.5" />
                          CNPJ · Negócio
                        </span>
                      ) : order.buyer_document ? (
                        <span className="px-1.5 py-0.5 rounded-xs text-[9px] font-mono font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                          CPF
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-400">PF/Padrão</span>
                      )}
                    </div>
                  </td>

                  {/* 6. Venda Bruta */}
                  <td className="py-2.5 px-2.5 text-right align-top font-mono tabular-nums whitespace-nowrap">
                    <div
                      className={`font-bold text-[11px] ${
                        cancelled ? "line-through text-slate-400" : "text-slate-900"
                      }`}
                    >
                      {formatBRL(order.gross_sale_amount)}
                    </div>
                  </td>

                  {/* 7. Taxas ML & Frete (Tooltip via Portal — sem corte na tabela) */}
                  <td className="py-2.5 px-2.5 text-right align-top font-mono tabular-nums whitespace-nowrap">
                    <PlatformFeeBreakdownTooltip order={order} />
                  </td>

                  {/* 8. Valor Repasse Vendedor */}
                  <td className="py-2.5 px-2.5 text-right align-top font-mono tabular-nums whitespace-nowrap bg-emerald-50/45">
                    {cancelled ? (
                      <div className="space-y-1">
                        <div className="text-xs font-bold text-rose-500 line-through">
                          R$ 0,00
                        </div>
                        <div
                          className="inline-block max-w-[165px] truncate px-1.5 py-0.5 rounded-xs bg-rose-100 text-rose-800 border border-rose-200 font-sans text-[9px] font-semibold"
                          title={order.cancellation_reason || "Venda cancelada/devolvida"}
                        >
                          {order.cancellation_reason || "Cancelada / Devolvida"}
                        </div>
                      </div>
                    ) : (
                      <div>
                        <div className="text-xs font-black text-emerald-800">
                          {formatBRL(order.seller_transfer_profit)}
                        </div>
                        {assignedSeller && sellerCotaPct < 100 && (
                          <div className="text-[10px] font-semibold text-amber-800">
                            Cota {sellerCotaPct}%: {formatBRL(sellerEffectiveAmount)}
                          </div>
                        )}
                      </div>
                    )}
                  </td>

                  {/* 9. Custos & Imposto */}
                  <td className="py-2.5 px-2.5 text-right align-top font-mono tabular-nums whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => setEditingCostsOrder(order)}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-xs border border-slate-200 bg-white hover:border-sky-500 hover:bg-sky-50/50 text-[11px] font-semibold text-slate-700 transition-colors"
                      title="Clique para editar Material, Embalagem, Logística, Impressão, Kit e Imposto %"
                    >
                      <span>-{formatBRL(cancelled ? 0 : totalInternalCostsAndTax)}</span>
                      <PencilLine className="w-3 h-3 text-sky-600" />
                    </button>
                    {!cancelled && order.tax_pct > 0 && (
                      <div className="text-[9px] text-slate-400 mt-0.5">
                        Imp. {order.tax_pct}% ({formatBRL(order.tax_amount)})
                      </div>
                    )}
                  </td>

                  {/* 10. Lucro Limpo */}
                  <td className="py-2.5 px-2.5 text-right align-top font-mono tabular-nums whitespace-nowrap">
                    <div
                      className={`text-xs font-black ${
                        cancelled
                          ? "text-slate-400 line-through"
                          : order.net_operational_profit >= 0
                          ? "text-slate-900"
                          : "text-rose-700"
                      }`}
                    >
                      {formatBRL(order.net_operational_profit)}
                    </div>
                    {!cancelled && (
                      <div
                        className={`text-[10px] font-semibold ${
                          marginPct >= 15
                            ? "text-emerald-700"
                            : marginPct >= 0
                            ? "text-amber-700"
                            : "text-rose-700"
                        }`}
                      >
                        {formatPct(marginPct)}
                      </div>
                    )}
                  </td>

                  {/* 11. Repasse MP & Conferência */}
                  <td className="py-2.5 px-2.5 align-top whitespace-nowrap">
                    <div className="flex flex-col items-center gap-1.5">
                      {cancelled ? (
                        <span className="px-1.5 py-0.5 rounded-xs text-[9px] font-bold bg-slate-100 text-slate-500">
                          Estornado MP
                        </span>
                      ) : mpReleased ? (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-xs text-[9px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                          <CheckCircle2 className="w-2.5 h-2.5" />
                          Liberado MP
                        </span>
                      ) : (
                        <span
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-xs text-[9px] font-semibold bg-amber-50 text-amber-800 border border-amber-200 font-mono"
                          title="Data prevista de liberação do dinheiro no Mercado Pago"
                        >
                          <Clock className="w-2.5 h-2.5" />
                          {order.mp_release_date
                            ? `Lib. ${formatShortDateBR(order.mp_release_date)}`
                            : "A liberar MP"}
                        </span>
                      )}

                      <label
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-xs border text-[10px] font-semibold cursor-pointer select-none transition-colors ${
                          order.verified_at
                            ? "bg-sky-50 border-sky-300 text-sky-800"
                            : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"
                        }`}
                      >
                        <input
                          type="checkbox"
                          disabled={isRowBusy}
                          checked={Boolean(order.verified_at)}
                          onChange={() => handleToggleVerified(order)}
                          className="w-3 h-3 rounded border-slate-300 text-sky-600"
                        />
                        <span>{order.verified_at ? "Verificado" : "Conferir"}</span>
                      </label>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Barra Flutuante de Seleção em Massa (Vendedor + Data de Envio Manual + Conferência) */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 max-w-[96vw] bg-[#0F172A] text-white border border-slate-700 rounded-xs shadow-2xl px-4 py-3 flex flex-wrap items-center gap-3 text-xs">
          <span className="font-bold text-sky-300 font-mono whitespace-nowrap">
            {selectedIds.size}{" "}
            {selectedIds.size === 1 ? "venda selecionada" : "vendas selecionadas"}
          </span>

          <div className="h-4 w-px bg-slate-700 hidden sm:block" />

          {/* Atribuir Vendedor em Massa */}
          <div className="flex items-center gap-1.5">
            <span className="text-slate-300 text-[11px]">Vendedor:</span>
            <select
              aria-label="Selecionar vendedor para atribuição em massa"
              value={batchSellerId}
              onChange={(e) => setBatchSellerId(e.target.value)}
              className="bg-slate-800 border border-slate-600 text-white text-xs rounded-xs px-2 py-1.5 focus:outline-none focus:border-sky-400"
            >
              <option value="">Escolher...</option>
              {activeSellers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
              <option value="__CLEAR__">— Remover Vendedor —</option>
            </select>

            <button
              type="button"
              disabled={!batchSellerId || batchBusy}
              onClick={handleBatchAssign}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xs bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-bold transition-colors"
            >
              {batchBusy ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <UserCheck className="w-3.5 h-3.5" />
              )}
              Aplicar
            </button>
          </div>

          <div className="h-4 w-px bg-slate-700 hidden sm:block" />

          {/* Definir Data de Envio Manual em Massa */}
          <div className="flex items-center gap-1.5">
            <span className="text-emerald-300 text-[11px] font-semibold">
              Data Envio:
            </span>
            <input
              type="date"
              aria-label="Data de envio para aplicar em lote"
              value={batchShippedDate}
              onChange={(e) => setBatchShippedDate(e.target.value)}
              className="bg-slate-800 border border-slate-600 text-white text-xs font-mono rounded-xs px-2 py-1 focus:outline-none focus:border-emerald-400"
            />
            <button
              type="button"
              disabled={!batchShippedDate || batchBusy}
              onClick={handleBatchSetShippedAt}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xs bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold transition-colors"
              title="Definir esta data de envio nas vendas selecionadas (protegida contra sobrescrita da API)"
            >
              <Truck className="w-3.5 h-3.5" />
              Definir Envio
            </button>
            <button
              type="button"
              disabled={batchBusy}
              onClick={handleBatchRevertShippedAt}
              className="inline-flex items-center gap-1 px-2 py-1.5 rounded-xs bg-slate-800 hover:bg-slate-700 border border-slate-600 text-amber-300 font-semibold transition-colors"
              title="Reverter vendas selecionadas para a data automática oficial da API do Mercado Livre"
            >
              <RotateCcw className="w-3 h-3" />
              API ML
            </button>
          </div>

          <div className="h-4 w-px bg-slate-700 hidden sm:block" />

          <button
            type="button"
            disabled={batchBusy}
            onClick={handleBatchVerify}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xs bg-slate-800 hover:bg-slate-700 border border-slate-600 disabled:opacity-50 text-white font-bold transition-colors"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            Verificar
          </button>

          <button
            type="button"
            onClick={() => setSelectedIds(new Set())}
            className="p-1.5 rounded-xs hover:bg-slate-800 text-slate-400 hover:text-white"
            title="Limpar seleção"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Popover/Modal de Edição de Custos do Pedido */}
      {editingCostsOrder && (
        <OrderCostsPopover
          order={editingCostsOrder}
          onClose={() => setEditingCostsOrder(null)}
          onSaved={onRefresh}
        />
      )}

      {/* Modais ERP de Vínculo e Detalhamento do Produto/Kit da Venda */}
      <LinkListingModal
        open={Boolean(erpLinkModalState)}
        products={erpLinks.products}
        initialListing={erpLinkModalState?.initialListing ?? null}
        existingLink={erpLinkModalState?.existingLink ?? null}
        onClose={() => setErpLinkModalState(null)}
        onSaved={() => {
          erpLinks.refresh();
          onRefresh();
        }}
      />

      <ProductDetailDrawer
        open={Boolean(erpDetailState)}
        product={erpDetailState?.product ?? null}
        links={erpLinks.links}
        quantityMultiplier={erpDetailState?.qty ?? 1}
        contextLabel={erpDetailState?.contextLabel}
        onClose={() => setErpDetailState(null)}
      />
    </div>
  );
}
