"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Header } from "@/components/layout/Header";
import {
  ArrowRight,
  ExternalLink,
  Loader2,
  PackageCheck,
  Radio,
  RefreshCw,
  Search,
  Settings,
  Wallet,
} from "lucide-react";
import type { MlSaleOrder, MlSaleOrderStatus, MlSalesDashboardResponse } from "@/types/ml-sales";
import {
  computeDatePresetRange,
  formatBRL,
  formatDateTimeBR,
  getOfficialMlSaleCode,
} from "@/components/vendas/formatters";
import {
  markSalesSyncedNow,
  useRealtimeSalesOrders,
} from "@/hooks/useRealtimeSalesOrders";

type RangeOption = "today" | "last7" | "thisMonth";

const STATUS_BADGE: Record<
  MlSaleOrderStatus,
  { label: string; className: string }
> = {
  paid: {
    label: "Pago · Pronto p/ Envio",
    className: "bg-sky-50 text-sky-800 border-sky-200",
  },
  shipped: {
    label: "Em Trânsito",
    className: "bg-amber-50 text-amber-800 border-amber-200",
  },
  delivered: {
    label: "Entregue",
    className: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  cancelled: {
    label: "Cancelado",
    className: "bg-rose-50 text-rose-700 border-rose-200",
  },
  returned: {
    label: "Devolvido",
    className: "bg-rose-50 text-rose-700 border-rose-200",
  },
};

export default function PedidosPage() {
  const [rangePreset, setRangePreset] = useState<RangeOption>("last7");
  const [search, setSearch] = useState("");
  const [orders, setOrders] = useState<MlSaleOrder[]>([]);
  const [hasConnectedAccount, setHasConnectedAccount] = useState(false);
  const [schemaReady, setSchemaReady] = useState(true);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const loadOrders = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!options?.silent) setLoading(true);
      try {
        const range = computeDatePresetRange(rangePreset);
        const qs = new URLSearchParams({
          from: range.from,
          to: range.to,
          seller: "all",
          status: "all",
          store: "all",
        });
        if (search.trim()) qs.set("q", search.trim());

        const res = await fetch(`/api/ml/sales?${qs.toString()}`, {
          cache: "no-store",
        });
        const json = (await res.json()) as MlSalesDashboardResponse;
        if (res.ok && json.success) {
          setOrders(json.orders ?? []);
          setSchemaReady(json.schemaReady !== false);
          setHasConnectedAccount(
            (json.accounts ?? []).some((a) => a.status === "online")
          );
        }
      } catch {
        // Mantém estado atual em caso de oscilação de rede
      } finally {
        if (!options?.silent) setLoading(false);
      }
    },
    [rangePreset, search]
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      loadOrders();
    }, 200);
    return () => clearTimeout(timer);
  }, [loadOrders]);

  const { realtimeConnected, autoSyncing, lastLiveUpdateAt } = useRealtimeSalesOrders({
    onSalesChange: () => {
      loadOrders({ silent: true });
    },
    enableAutoSync: schemaReady && hasConnectedAccount,
    onAutoSyncComplete: (upserted) => {
      if (upserted > 0) loadOrders({ silent: true });
    },
  });

  async function handleManualSync() {
    setSyncing(true);
    try {
      const range = computeDatePresetRange(rangePreset);
      const res = await fetch("/api/ml/sales/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(range),
      });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.success) {
        markSalesSyncedNow();
        await loadOrders({ silent: true });
      }
    } finally {
      setSyncing(false);
    }
  }

  return (
    <>
      <Header platformName="Gestão de Pedidos e Vendas" />
      <main className="p-4 flex-1">
        <div className="max-w-[1600px] mx-auto space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-base font-bold text-slate-900 tracking-tight">
                  Vendas & Pedidos Sincronizados
                </h1>
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-xs border text-[10px] font-bold ${
                    realtimeConnected
                      ? "bg-sky-50 border-sky-200 text-sky-800"
                      : "bg-slate-100 border-slate-200 text-slate-600"
                  }`}
                >
                  <Radio
                    className={`w-3 h-3 ${
                      realtimeConnected ? "text-emerald-600 animate-pulse" : "text-slate-400"
                    }`}
                  />
                  <span>
                    {autoSyncing
                      ? "Sincronizando automaticamente..."
                      : realtimeConnected
                      ? lastLiveUpdateAt
                        ? `Ao Vivo · ${lastLiveUpdateAt}`
                        : "Ao Vivo (Webhook Ativo)"
                      : "Conectando..."}
                  </span>
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Pedidos reais recebidos automaticamente da sua loja vinculada ao ERP.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={syncing || autoSyncing}
                onClick={handleManualSync}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded bg-white hover:bg-slate-50 border border-slate-300 text-slate-800 text-xs font-bold transition-colors shadow-2xs disabled:opacity-60"
              >
                {syncing || autoSyncing ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-sky-600" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5 text-sky-600" />
                )}
                <span>{syncing ? "Sincronizando..." : "Atualizar Agora"}</span>
              </button>

              <Link
                href="/vendas/gestao-diaria"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold transition-colors shadow-2xs"
              >
                <Wallet className="w-3.5 h-3.5" />
                Abrir Gestão de Vendas & Repasse por Vendedor
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>

          {/* Barra rápida de período e busca */}
          <div className="bg-white border border-[#E2E8F0] rounded p-3 shadow-2xs flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex items-center gap-1.5">
              {(
                [
                  { id: "today", label: "Hoje" },
                  { id: "last7", label: "Últimos 7 dias" },
                  { id: "thisMonth", label: "Este Mês" },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setRangePreset(opt.id)}
                  className={`px-2.5 py-1 rounded-xs text-[11px] font-bold border transition-colors ${
                    rangePreset === opt.id
                      ? "bg-slate-900 text-white border-slate-900"
                      : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1.5" />
              <input
                type="text"
                aria-label="Buscar pedido, MLB, SKU ou cliente"
                placeholder="Buscar pedido, MLB, SKU ou cliente..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-7 pr-2.5 py-1 w-64 border border-slate-300 rounded-xs text-[11px] focus:outline-none focus:border-sky-600"
              />
            </div>
          </div>

          <div className="bg-white border border-[#E2E8F0] rounded shadow-2xs overflow-hidden">
            {loading ? (
              <div className="p-10 flex items-center justify-center gap-2 text-xs text-slate-500">
                <Loader2 className="w-4 h-4 animate-spin text-sky-600" />
                <span>Carregando pedidos reais sincronizados...</span>
              </div>
            ) : orders.length === 0 ? (
              <div className="p-10 text-center space-y-2.5">
                <PackageCheck className="w-7 h-7 text-slate-400 mx-auto" />
                <div className="text-xs font-bold text-slate-800">
                  Nenhum pedido encontrado no período selecionado
                </div>
                <p className="text-[11px] text-slate-500 max-w-md mx-auto">
                  {hasConnectedAccount
                    ? "Assim que sair uma venda no Mercado Livre, ela aparecerá automaticamente aqui via Webhook ou Auto-Sync."
                    : "Conecte sua conta do Mercado Livre e configure o Webhook gratuito em Configurações & APIs."}
                </p>
                {!hasConnectedAccount && (
                  <Link
                    href="/configuracoes"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-slate-900 text-white text-[11px] font-bold hover:bg-slate-800"
                  >
                    <Settings className="w-3.5 h-3.5" />
                    Ir para Configurações & APIs
                  </Link>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase text-[11px]">
                      <th className="py-2.5 px-3">Pedido ML</th>
                      <th className="py-2.5 px-3">Cliente</th>
                      <th className="py-2.5 px-3">Loja</th>
                      <th className="py-2.5 px-3">Produto / SKU</th>
                      <th className="py-2.5 px-3 text-right">Valor Bruto</th>
                      <th className="py-2.5 px-3 text-right">Repasse Limpo</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3 text-right">Data/Hora</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {orders.map((o) => {
                      const badge = STATUS_BADGE[o.status] ?? STATUS_BADGE.paid;
                      return (
                        <tr key={o.id} className="hover:bg-slate-50 transition-colors">
                          <td className="py-2.5 px-3 font-mono font-bold text-slate-800">
                            <span
                              title={
                                o.ml_pack_id
                                  ? `Código Venda ML: #${o.ml_pack_id} · Subpedido API: #${o.ml_order_id}`
                                  : `Código Venda ML: #${o.ml_order_id}`
                              }
                            >
                              #{getOfficialMlSaleCode(o)}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-slate-700 min-w-[170px] max-w-[220px]">
                            <div className="font-semibold text-slate-900 break-words">{o.buyer_name}</div>
                            {o.is_business_buyer && (
                              <span className="inline-block mt-0.5 px-1.5 py-0.2 rounded-xs bg-slate-100 text-slate-700 text-[9px] font-bold">
                                CNPJ
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-slate-600">{o.store_name}</td>
                          <td className="py-2.5 px-3 text-slate-800 min-w-[320px] max-w-md">
                            <div className="flex items-start gap-2.5">
                              {o.product_thumbnail && (
                                <div className="group relative shrink-0">
                                  <div className="w-12 h-12 rounded border border-slate-200 bg-white p-0.5 overflow-hidden flex items-center justify-center">
                                    <img
                                      src={o.product_thumbnail}
                                      alt={o.product_title}
                                      className="w-full h-full object-contain"
                                      loading="lazy"
                                    />
                                  </div>
                                </div>
                              )}
                              <div className="min-w-0 flex-1">
                                <div className="flex items-start gap-1.5">
                                  <span className="font-bold text-slate-900 shrink-0">
                                    {o.quantity}x
                                  </span>
                                  <span className="font-semibold text-slate-900 text-xs leading-snug break-words">
                                    {o.product_title}
                                  </span>
                                </div>
                                <div className="mt-1 flex items-center gap-1.5 text-[10px] font-mono text-slate-500">
                                  <span>{o.mlb_id}</span>
                                  {o.sku && <span> · SKU: {o.sku}</span>}
                                  {o.permalink && (
                                    <a
                                      href={o.permalink}
                                      target="_blank"
                                      rel="noreferrer"
                                      aria-label={`Abrir anúncio ${o.mlb_id}`}
                                      className="text-slate-400 hover:text-sky-600 inline-flex items-center gap-0.5 ml-1"
                                    >
                                      <ExternalLink className="w-3 h-3" />
                                    </a>
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-right font-bold text-slate-900 font-mono">
                            {formatBRL(o.gross_sale_amount)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-bold text-emerald-700 font-mono">
                            {formatBRL(o.seller_transfer_profit)}
                          </td>
                          <td className="py-2.5 px-3">
                            <span
                              className={`px-2 py-0.5 rounded-xs text-[10px] font-semibold border ${badge.className}`}
                            >
                              {badge.label}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-right text-slate-500 font-mono text-[11px]">
                            {formatDateTimeBR(o.order_date)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
