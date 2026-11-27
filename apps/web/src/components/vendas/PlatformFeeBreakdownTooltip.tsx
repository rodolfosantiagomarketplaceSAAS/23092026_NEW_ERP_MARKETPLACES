"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Info } from "lucide-react";
import type { MlSaleOrder } from "@/types/ml-sales";
import { isCancelledOrReturned, roundCurrency } from "@/lib/mercadolivre/sales-analytics";
import { formatBRL } from "./formatters";

interface PlatformFeeBreakdownTooltipProps {
  order: MlSaleOrder;
}

interface TooltipCoords {
  top: number;
  left: number;
}

const TOOLTIP_WIDTH = 288;
const ESTIMATED_TOOLTIP_HEIGHT = 232;
const VIEWPORT_MARGIN = 12;

/**
 * Renderiza o detalhamento "Composição Plataforma ML" via Portal em `document.body` (`position: fixed`).
 * Impede qualquer corte vertical/horizontal dentro de containers `overflow-x-auto` (mesmo quando há apenas 1 linha na tabela).
 */
export function PlatformFeeBreakdownTooltip({ order }: PlatformFeeBreakdownTooltipProps) {
  const [mounted, setMounted] = useState(false);
  const [coords, setCoords] = useState<TooltipCoords | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!coords) return;
    const handleViewportChange = () => setCoords(null);
    window.addEventListener("scroll", handleViewportChange, true);
    window.addEventListener("resize", handleViewportChange);
    return () => {
      window.removeEventListener("scroll", handleViewportChange, true);
      window.removeEventListener("resize", handleViewportChange);
    };
  }, [coords]);

  const cancelled = isCancelledOrReturned(order.status);
  const netMlDiscount = roundCurrency(
    order.ml_commission_amount + order.ml_shipping_cost - order.ml_promo_rebate
  );
  const cleanTransferBase = cancelled
    ? 0
    : roundCurrency(order.gross_sale_amount - netMlDiscount);

  function openFromElement(el: HTMLElement) {
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const left = Math.min(
      Math.max(VIEWPORT_MARGIN, rect.right - TOOLTIP_WIDTH),
      Math.max(VIEWPORT_MARGIN, vw - TOOLTIP_WIDTH - VIEWPORT_MARGIN)
    );

    const fitsBelow = rect.bottom + 8 + ESTIMATED_TOOLTIP_HEIGHT <= vh - VIEWPORT_MARGIN;
    const top = fitsBelow
      ? rect.bottom + 8
      : Math.max(VIEWPORT_MARGIN, rect.top - ESTIMATED_TOOLTIP_HEIGHT - 8);

    setCoords({ top, left });
  }

  return (
    <div
      className="inline-block"
      onMouseEnter={(e) => openFromElement(e.currentTarget)}
      onMouseLeave={() => setCoords(null)}
    >
      <button
        type="button"
        onFocus={(e) => openFromElement(e.currentTarget)}
        onBlur={() => setCoords(null)}
        aria-label={`Ver composição das taxas ML do pedido ${order.ml_order_id}`}
        className="inline-flex items-center gap-1 cursor-help text-rose-600 font-semibold text-[11px] focus:outline-none"
      >
        <span>-{formatBRL(cancelled ? 0 : netMlDiscount)}</span>
        <Info className="w-3 h-3 text-slate-400 hover:text-slate-700 transition-colors" />
      </button>

      {order.ml_promo_rebate > 0 && !cancelled && (
        <div className="text-[9px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1 py-0.2 rounded-xs mt-0.5">
          +{formatBRL(order.ml_promo_rebate)} estorno ML
        </div>
      )}

      {mounted &&
        coords &&
        createPortal(
          <div
            role="tooltip"
            style={{
              top: coords.top,
              left: coords.left,
              width: TOOLTIP_WIDTH,
            }}
            className="pointer-events-none fixed z-[9999] p-3 rounded bg-slate-900 text-white border border-slate-700 text-[11px] shadow-2xl text-left space-y-1.5 font-mono tabular-nums"
          >
            <div className="flex items-center justify-between gap-2 font-sans font-bold text-slate-200 border-b border-slate-700 pb-1.5 mb-1">
              <span>Composição Plataforma ML</span>
              {cancelled && (
                <span className="px-1.5 py-0.5 rounded-xs bg-rose-950 text-rose-300 border border-rose-800 text-[9px] uppercase tracking-wider">
                  {order.status === "returned" ? "Devolvida" : "Cancelada"}
                </span>
              )}
            </div>

            <div className="flex items-center justify-between">
              <span className="font-sans text-slate-300">
                Venda Bruta ({order.quantity}x):
              </span>
              <span className="text-white font-semibold">
                {formatBRL(order.gross_sale_amount)}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="font-sans text-slate-300">
                Comissão ML ({order.ml_commission_pct.toFixed(1)}%):
              </span>
              <span className="text-rose-300 font-semibold">
                -{formatBRL(order.ml_commission_amount)}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="font-sans text-slate-300">Frete Vendedor:</span>
              <span className="text-rose-300 font-semibold">
                -{formatBRL(order.ml_shipping_cost)}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="font-sans text-emerald-300">Estorno / Subsídio ML:</span>
              <span className="text-emerald-300 font-semibold">
                +{formatBRL(order.ml_promo_rebate)}
              </span>
            </div>

            <div className="pt-1.5 mt-1 border-t border-slate-700 space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-sans text-slate-300">Desconto Líquido ML:</span>
                <span className="text-rose-300 font-bold">
                  -{formatBRL(cancelled ? 0 : netMlDiscount)}
                </span>
              </div>

              <div className="flex items-center justify-between pt-1 border-t border-slate-800">
                <span className="font-sans font-bold text-emerald-300">
                  Base Limpa de Repasse:
                </span>
                <span className="text-emerald-400 font-black text-xs">
                  {formatBRL(cleanTransferBase)}
                </span>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
