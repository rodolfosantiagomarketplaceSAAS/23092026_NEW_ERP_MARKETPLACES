"use client";

import React, { useMemo, useState } from "react";
import {
  AlertTriangle,
  BookmarkCheck,
  BookmarkPlus,
  Building2,
  CheckCircle2,
  Clock,
  ExternalLink,
  ImageOff,
  Info,
  Loader2,
  Package,
  PencilLine,
  ShieldCheck,
  Truck,
  UserCheck,
  X,
} from "lucide-react";
import type { MlSaleOrder, ProductCostTemplate, Seller } from "@/types/ml-sales";
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
  formatPct,
  formatShortDateBR,
} from "./formatters";
import { OrderCostsPopover } from "./OrderCostsPopover";

interface DailySalesTableProps {
  orders: MlSaleOrder[];
  sellers: Seller[];
  templates: ProductCostTemplate[];
  onRefresh: () => void;
}

export function DailySalesTable({
  orders,
  sellers,
  templates,
  onRefresh,
}: DailySalesTableProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchSellerId, setBatchSellerId] = useState<string>("");
  const [busyRowId, setBusyRowId] = useState<string | null>(null);
  const [batchBusy, setBatchBusy] = useState<boolean>(false);
  const [editingCostsOrder, setEditingCostsOrder] = useState<MlSaleOrder | null>(null);

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
          assignedSellerId: batchSellerId === "__CLEAR__" ? null : batchSellerId || null,
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
        <Package className="w-8 h-8 text-slate-300 mx-auto" />
        <div className="text-sm font-bold text-slate-800">
          Nenhuma venda encontrada para os filtros selecionados
        </div>
        <p className="text-xs text-slate-500 max-w-md mx-auto">
          Clique em <strong>&ldquo;Sincronizar Vendas ML&rdquo;</strong> no topo para buscar os
          pedidos mais recentes na API oficial do Mercado Livre ou ajuste o intervalo de datas.
        </p>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="bg-white border border-[#E2E8F0] rounded shadow-2xs overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs min-w-[1320px]">
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
              <th className="py-2.5 px-2.5">Data / Enviar Dia</th>
              <th className="py-2.5 px-2.5 min-w-[250px]">Produto</th>
              <th className="py-2.5 px-2.5 min-w-[185px]">Vendedor (Repasse)</th>
              <th className="py-2.5 px-2.5">Comprador</th>
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
              const netMlDiscount = roundCurrency(
                order.ml_commission_amount + order.ml_shipping_cost - order.ml_promo_rebate
              );
              const opCostsOnly = getOrderOperationalCostsOnly(order);
              const totalInternalCostsAndTax = roundCurrency(order.tax_amount + opCostsOnly);
              const marginPct =
                !cancelled && order.gross_sale_amount > 0
                  ? roundCurrency((order.net_operational_profit / order.gross_sale_amount) * 100)
                  : 0;
              const mpReleased = isMpMoneyReleased(order);
              const isRowBusy = busyRowId === order.id;

              const sellerCotaPct = assignedSeller ? Number(assignedSeller.commission_pct ?? 100) : 100;
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

                  {/* 2. Data Venda / Enviar Dia */}
                  <td className="py-2.5 px-2.5 align-top whitespace-nowrap">
                    <div className="font-mono font-bold text-slate-900 text-[11px]">
                      {formatDateTimeBR(order.order_date)}
                    </div>
                    <div className="text-[10px] font-mono text-slate-500">
                      #{order.ml_order_id} · {order.store_name}
                    </div>
                    <div className="mt-1">
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
                      ) : order.status === "shipped" ? (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-xs text-[10px] font-semibold bg-sky-50 text-sky-700 border border-sky-200">
                          <Truck className="w-2.5 h-2.5" />
                          Em Trânsito
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
                    </div>
                  </td>

                  {/* 3. Produto */}
                  <td className="py-2.5 px-2.5 align-top max-w-[290px]">
                    <div className="flex items-start gap-2.5">
                      <div className="w-10 h-10 rounded-xs border border-slate-200 bg-slate-50 shrink-0 overflow-hidden flex items-center justify-center">
                        {order.product_thumbnail ? (
                          <img
                            src={order.product_thumbnail}
                            alt={order.product_title}
                            className="w-full h-full object-contain"
                            loading="lazy"
                          />
                        ) : (
                          <ImageOff className="w-4 h-4 text-slate-300" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1">
                          <span
                            className="font-semibold text-slate-900 text-[11px] leading-snug line-clamp-2"
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

                          {order.ml_pack_id && (
                            <span
                              className="px-1.5 py-0.2 rounded-xs bg-sky-50 text-sky-700 border border-sky-200"
                              title={`Carrinho ML Pack #${order.ml_pack_id}`}
                            >
                              Pack
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* 4. Vendedor (Repasse) — 1 Clique Inline */}
                  <td className="py-2.5 px-2.5 align-top">
                    <div className="space-y-1">
                      <div className="relative flex items-center">
                        <span
                          className="w-2.5 h-2.5 rounded-xs mr-1.5 shrink-0"
                          style={{
                            backgroundColor: assignedSeller ? assignedSeller.color_hex : "#CBD5E1",
                          }}
                        />
                        <select
                          aria-label={`Atribuir vendedor ao pedido ${order.ml_order_id}`}
                          disabled={isRowBusy}
                          value={order.assigned_seller_id || ""}
                          onChange={(e) =>
                            handleAssignSingle(order, e.target.value ? e.target.value : null, false)
                          }
                          style={
                            assignedSeller
                              ? {
                                  borderColor: assignedSeller.color_hex,
                                  backgroundColor: `${assignedSeller.color_hex}12`,
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
                  <td className="py-2.5 px-2.5 align-top max-w-[170px]">
                    <div
                      className="text-[11px] font-medium text-slate-800 truncate"
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

                  {/* 7. Taxas ML & Frete (com Tooltip detalhado) */}
                  <td className="py-2.5 px-2.5 text-right align-top font-mono tabular-nums whitespace-nowrap">
                    <div className="relative inline-block group">
                      <div className="inline-flex items-center gap-1 cursor-help text-rose-600 font-semibold text-[11px]">
                        <span>-{formatBRL(cancelled ? 0 : netMlDiscount)}</span>
                        <Info className="w-3 h-3 text-slate-400 group-hover:text-slate-700" />
                      </div>

                      {order.ml_promo_rebate > 0 && !cancelled && (
                        <div className="text-[9px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1 py-0.2 rounded-xs mt-0.5">
                          +{formatBRL(order.ml_promo_rebate)} estorno ML
                        </div>
                      )}

                      {/* Tooltip */}
                      <div className="invisible opacity-0 group-hover:visible group-hover:opacity-100 transition-opacity z-40 absolute right-0 top-full mt-1.5 w-60 p-2.5 rounded bg-slate-900 text-white text-[10px] shadow-xl pointer-events-none text-left space-y-1">
                        <div className="font-sans font-bold text-slate-300 border-b border-slate-700 pb-1 mb-1">
                          Composição Plataforma ML
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-300">
                            Comissão ML ({order.ml_commission_pct.toFixed(1)}%):
                          </span>
                          <span className="text-rose-300 font-semibold">
                            -{formatBRL(order.ml_commission_amount)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-300">Frete Vendedor:</span>
                          <span className="text-rose-300 font-semibold">
                            -{formatBRL(order.ml_shipping_cost)}
                          </span>
                        </div>
                        <div className="flex justify-between text-emerald-300 font-bold pt-1 border-t border-slate-800">
                          <span>Estorno / Promo ML:</span>
                          <span>+{formatBRL(order.ml_promo_rebate)}</span>
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* 8. Valor Repasse Vendedor (Coluna em Destaque) */}
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

                  {/* 9. Custos & Imposto (Abre Popover) */}
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

      {/* Barra Flutuante de Seleção em Massa (Batch Action) */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-40 bg-[#0F172A] text-white border border-slate-700 rounded shadow-2xl px-4 py-3 flex flex-wrap items-center gap-3 text-xs">
          <span className="font-bold text-sky-300 font-mono">
            {selectedIds.size}{" "}
            {selectedIds.size === 1 ? "venda selecionada" : "vendas selecionadas"}
          </span>

          <div className="h-4 w-px bg-slate-700" />

          <div className="flex items-center gap-2">
            <span className="text-slate-300 text-[11px]">Atribuir para:</span>
            <select
              aria-label="Selecionar vendedor para atribuição em massa"
              value={batchSellerId}
              onChange={(e) => setBatchSellerId(e.target.value)}
              className="bg-slate-800 border border-slate-600 text-white text-xs rounded px-2.5 py-1.5 focus:outline-none focus:border-sky-400"
            >
              <option value="">Selecionar Vendedor...</option>
              {activeSellers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
              <option value="__CLEAR__">— Remover Vendedor (Deixar Pendente) —</option>
            </select>

            <button
              type="button"
              disabled={!batchSellerId || batchBusy}
              onClick={handleBatchAssign}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-bold transition-colors"
            >
              {batchBusy ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <UserCheck className="w-3.5 h-3.5" />
              )}
              Aplicar Vendedor
            </button>
          </div>

          <div className="h-4 w-px bg-slate-700" />

          <button
            type="button"
            disabled={batchBusy}
            onClick={handleBatchVerify}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold transition-colors"
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            Marcar como Verificado
          </button>

          <button
            type="button"
            onClick={() => setSelectedIds(new Set())}
            className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-white"
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
    </div>
  );
}

