"use client";

import React from "react";
import { Clock, RefreshCw, ShoppingBag, Truck } from "lucide-react";
import type { SalesAnalysisMode } from "@/types/ml-sales";

interface AnalysisModeToggleProps {
  value: SalesAnalysisMode;
  onChange: (next: SalesAnalysisMode) => void;
  pendingShipmentCount?: number;
  backfillMissingCount?: number;
  syncing?: boolean;
  onRequestBackfillSync?: () => void;
}

export function AnalysisModeToggle({
  value,
  onChange,
  pendingShipmentCount = 0,
  backfillMissingCount = 0,
  syncing = false,
  onRequestBackfillSync,
}: AnalysisModeToggleProps) {
  const isOrderMode = value === "order_date";
  const isShippingMode = value === "shipping_date";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div
        role="group"
        aria-label="Modo de análise das vendas"
        className="inline-flex items-center p-0.5 rounded bg-slate-100 border border-slate-300 shadow-2xs"
      >
        <button
          type="button"
          aria-pressed={isOrderMode}
          onClick={() => onChange("order_date")}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xs text-[11px] font-bold transition-all active:scale-[0.98] ${
            isOrderMode
              ? "bg-slate-900 text-white shadow-2xs"
              : "text-slate-600 hover:text-slate-900 hover:bg-white/70"
          }`}
          title="Filtra e agrupa vendas pelo dia/hora em que o comprador realizou o pedido"
        >
          <ShoppingBag className="w-3.5 h-3.5 shrink-0" />
          <span>Por Data da Venda</span>
        </button>

        <button
          type="button"
          aria-pressed={isShippingMode}
          onClick={() => onChange("shipping_date")}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xs text-[11px] font-bold transition-all active:scale-[0.98] ${
            isShippingMode
              ? "bg-emerald-700 text-white shadow-2xs"
              : "text-slate-600 hover:text-emerald-800 hover:bg-white/70"
          }`}
          title="Filtra e agrupa vendas pelo dia real em que você despachou o produto (status_history.date_shipped)"
        >
          <Truck className="w-3.5 h-3.5 shrink-0" />
          <span>Por Dia do Envio</span>
        </button>
      </div>

      {isShippingMode && pendingShipmentCount > 0 && (
        <span
          className="inline-flex items-center gap-1 px-2 py-1 rounded-xs bg-amber-50 border border-amber-300 text-amber-900 text-[10px] font-bold font-mono"
          title="Estes pedidos aparecem sinalizados na tabela abaixo como 'Aguardando Envio' e passam a somar nos cards financeiros de envio assim que bipados no ML ou marcados manualmente."
        >
          <Clock className="w-3 h-3 text-amber-700 shrink-0" />
          <span>
            {pendingShipmentCount}{" "}
            {pendingShipmentCount === 1
              ? "pago aguardando envio"
              : "pagos aguardando envio"}
          </span>
        </span>
      )}

      {isShippingMode && backfillMissingCount > 0 && onRequestBackfillSync && (
        <button
          type="button"
          disabled={syncing}
          onClick={onRequestBackfillSync}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-xs bg-sky-50 hover:bg-sky-100 border border-sky-300 text-sky-900 text-[10px] font-bold transition-colors disabled:opacity-60"
          title="Sincroniza automaticamente na API do ML a data real de postagem dos pedidos antigos já enviados"
        >
          <RefreshCw
            className={`w-3 h-3 text-sky-700 shrink-0 ${syncing ? "animate-spin" : ""}`}
          />
          <span>
            {syncing
              ? "Preenchendo datas de envio..."
              : `Carregar data de envio de ${backfillMissingCount} pedido(s) já enviados`}
          </span>
        </button>
      )}
    </div>
  );
}
