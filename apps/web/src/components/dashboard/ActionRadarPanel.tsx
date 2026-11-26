"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  ExternalLink,
  MessageSquareWarning,
  PackageX,
  TrendingDown,
  Truck,
} from "lucide-react";
import type { ActionRadarPayload } from "@/types/executive-dashboard";
import {
  formatBRL,
  formatDeadlineBR,
  formatLogisticTypeLabel,
  formatPct,
} from "@/components/vendas/formatters";

interface ActionRadarPanelProps {
  radar: ActionRadarPayload;
}

type RadarTab = "stockout" | "margin" | "conversion" | "operations";

export function ActionRadarPanel({ radar }: ActionRadarPanelProps) {
  const operationsCount =
    radar.urgentShipments.length + (radar.overdueQuestionsCount > 0 ? 1 : 0);

  const defaultTab: RadarTab =
    radar.stockoutRisk.length > 0
      ? "stockout"
      : radar.criticalMargin.length > 0
      ? "margin"
      : operationsCount > 0
      ? "operations"
      : "conversion";

  const [activeTab, setActiveTab] = useState<RadarTab>(defaultTab);

  const totalAlerts =
    radar.stockoutRisk.length +
    radar.criticalMargin.length +
    radar.conversionDrop.length +
    radar.urgentShipments.length +
    (radar.overdueQuestionsCount > 0 ? 1 : 0);

  const tabs: Array<{
    id: RadarTab;
    label: string;
    count: number;
    icon: React.ComponentType<{ className?: string }>;
    tone: "rose" | "amber" | "sky";
  }> = [
    {
      id: "stockout",
      label: "Ruptura Curva A (<7d)",
      count: radar.stockoutRisk.length,
      icon: PackageX,
      tone: "rose",
    },
    {
      id: "margin",
      label: `Margem Crítica (<${radar.criticalMarginThresholdPct}%)`,
      count: radar.criticalMargin.length,
      icon: AlertTriangle,
      tone: "rose",
    },
    {
      id: "conversion",
      label: "Queda de Conversão",
      count: radar.conversionDrop.length,
      icon: TrendingDown,
      tone: "amber",
    },
    {
      id: "operations",
      label: "Perguntas & Envios",
      count: radar.urgentShipments.length + radar.overdueQuestionsCount,
      icon: Clock,
      tone: "sky",
    },
  ];

  return (
    <section
      aria-label="Radar de Ação Imediata"
      className="bg-white border border-[#E2E8F0] rounded shadow-2xs overflow-hidden"
    >
      {/* Header do Radar */}
      <div className="px-4 py-3 border-b border-[#E2E8F0] flex flex-wrap items-center justify-between gap-2 bg-[#F8FAFC]">
        <div className="flex items-center gap-2">
          <span
            className={`w-2 h-2 rounded-full ${
              totalAlerts > 0 ? "bg-rose-500" : "bg-emerald-500"
            }`}
          />
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800">
            Radar de Ação Imediata
          </h2>
          <span className="text-[11px] text-slate-500 hidden sm:inline">
            • Pontos críticos detectados automaticamente nos seus pedidos e anúncios
          </span>
        </div>

        <span
          className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${
            totalAlerts > 0
              ? "bg-rose-50 text-rose-700 border-rose-200"
              : "bg-emerald-50 text-emerald-700 border-emerald-200"
          }`}
        >
          {totalAlerts > 0
            ? `${totalAlerts} ${totalAlerts === 1 ? "ponto de atenção" : "pontos de atenção"}`
            : "Operação saudável"}
        </span>
      </div>

      {/* Tabs de Categoria */}
      <div className="px-4 pt-2.5 border-b border-[#E2E8F0] flex flex-wrap items-center gap-1.5 bg-white">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          const badgeClass =
            tab.count === 0
              ? "bg-slate-100 text-slate-500"
              : tab.tone === "rose"
              ? "bg-rose-100 text-rose-700"
              : tab.tone === "amber"
              ? "bg-amber-100 text-amber-800"
              : "bg-sky-100 text-sky-700";

          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`inline-flex items-center gap-1.5 px-3 py-2 text-[11px] font-semibold border-b-2 transition-colors -mb-px ${
                isActive
                  ? "border-[#0284C7] text-slate-900"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
              <span
                className={`px-1.5 py-0.2 rounded text-[10px] font-mono font-bold ${badgeClass}`}
              >
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Conteúdo da Aba Selecionada */}
      <div className="p-3.5">
        {activeTab === "stockout" && (
          <>
            {radar.stockoutRisk.length === 0 ? (
              <EmptyRadarState message="Nenhum produto Curva A com risco de ruptura para os próximos 7 dias." />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5">
                {radar.stockoutRisk.map((item) => (
                  <div
                    key={item.mlbId}
                    className="border border-rose-200/80 bg-rose-50/30 rounded p-2.5 flex items-start justify-between gap-2.5"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 font-mono text-[10px] font-bold">
                          {item.daysOfStock <= 0
                            ? "ZERADO"
                            : `${item.daysOfStock.toFixed(1).replace(".", ",")} dias`}
                        </span>
                        <span className="text-[10px] font-mono text-slate-500 truncate">
                          {item.sku || item.mlbId}
                        </span>
                      </div>
                      <p className="text-xs font-semibold text-slate-900 truncate mt-1" title={item.title}>
                        {item.title}
                      </p>
                      <div className="mt-1 flex items-center gap-2 text-[10px] font-mono text-slate-600">
                        <span>
                          Estoque: <strong className="text-rose-700">{item.availableQuantity} un</strong>
                        </span>
                        <span>•</span>
                        <span>Giro: {item.dailyVelocity.toFixed(1).replace(".", ",")}/dia</span>
                      </div>
                    </div>
                    <Link
                      href="/catalogo"
                      className="shrink-0 p-1.5 rounded bg-white border border-slate-200 text-slate-600 hover:text-sky-600 hover:border-sky-300 transition-colors"
                      title="Abrir no Catálogo"
                    >
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {activeTab === "margin" && (
          <>
            {radar.criticalMargin.length === 0 ? (
              <EmptyRadarState
                message={`Todos os SKUs vendidos no período estão com margem líquida acima de ${radar.criticalMarginThresholdPct}%.`}
              />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5">
                {radar.criticalMargin.map((item) => {
                  const isLoss = item.netProfit < 0;
                  return (
                    <div
                      key={item.mlbId}
                      className={`border rounded p-2.5 flex items-start justify-between gap-2.5 ${
                        isLoss
                          ? "border-rose-300 bg-rose-50/40"
                          : "border-amber-200 bg-amber-50/30"
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`px-1.5 py-0.5 rounded font-mono text-[10px] font-bold ${
                              isLoss
                                ? "bg-rose-600 text-white"
                                : "bg-amber-100 text-amber-900"
                            }`}
                          >
                            {isLoss ? "PREJUÍZO" : `Margem ${formatPct(item.marginPct)}`}
                          </span>
                          <span className="text-[10px] font-mono text-slate-500 truncate">
                            {item.sku || item.mlbId}
                          </span>
                        </div>
                        <p className="text-xs font-semibold text-slate-900 truncate mt-1" title={item.title}>
                          {item.title}
                        </p>
                        <div className="mt-1 flex items-center gap-2 text-[10px] font-mono text-slate-600">
                          <span>
                            Lucro:{" "}
                            <strong className={isLoss ? "text-rose-700" : "text-amber-800"}>
                              {formatBRL(item.netProfit)}
                            </strong>
                          </span>
                          <span>•</span>
                          <span>Fat: {formatBRL(item.grossSales)}</span>
                        </div>
                      </div>
                      <Link
                        href="/vendas/gestao-diaria"
                        className="shrink-0 p-1.5 rounded bg-white border border-slate-200 text-slate-600 hover:text-sky-600 hover:border-sky-300 transition-colors"
                        title="Revisar custos na Gestão de Vendas"
                      >
                        <ArrowUpRight className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {activeTab === "conversion" && (
          <>
            {radar.conversionDrop.length === 0 ? (
              <EmptyRadarState message="Nenhum anúncio ativo com alto volume de visitas e conversão travada." />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5">
                {radar.conversionDrop.map((item) => (
                  <div
                    key={item.mlbId}
                    className="border border-amber-200/80 bg-amber-50/25 rounded p-2.5 flex items-start justify-between gap-2.5"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 font-mono text-[10px] font-bold">
                          {item.visits.toLocaleString("pt-BR")} visitas • {item.ordersCount} ped.
                        </span>
                        <span className="text-[10px] font-mono text-slate-500">
                          {item.mlbId}
                        </span>
                      </div>
                      <p className="text-xs font-semibold text-slate-900 truncate mt-1" title={item.title}>
                        {item.title}
                      </p>
                      <p className="mt-1 text-[10px] text-slate-500">
                        Possível perda de BuyBox/Catálogo ou preço acima da concorrência.
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Link
                        href="/inteligencia"
                        className="p-1.5 rounded bg-white border border-slate-200 text-slate-600 hover:text-sky-600 hover:border-sky-300 transition-colors"
                        title="Comparar preço no Radar"
                      >
                        <ArrowUpRight className="w-3.5 h-3.5" />
                      </Link>
                      {item.permalink && (
                        <a
                          href={item.permalink}
                          target="_blank"
                          rel="noreferrer"
                          className="p-1.5 rounded bg-white border border-slate-200 text-slate-600 hover:text-sky-600 hover:border-sky-300 transition-colors"
                          title="Abrir anúncio no Mercado Livre"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {activeTab === "operations" && (
          <div className="space-y-3">
            {/* Alerta de Perguntas Pendentes */}
            <div
              className={`border rounded p-2.5 flex flex-wrap items-center justify-between gap-2 ${
                radar.overdueQuestionsCount > 0
                  ? "border-amber-300 bg-amber-50/40"
                  : "border-slate-200 bg-[#F8FAFC]"
              }`}
            >
              <div className="flex items-center gap-2.5">
                <MessageSquareWarning
                  className={`w-4 h-4 shrink-0 ${
                    radar.overdueQuestionsCount > 0 ? "text-amber-600" : "text-emerald-600"
                  }`}
                />
                <div>
                  <div className="text-xs font-bold text-slate-900">
                    Perguntas no Pré-Venda:{" "}
                    <span className="font-mono">{radar.unansweredQuestionsCount}</span> pendentes
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {radar.overdueQuestionsCount > 0
                      ? `${radar.overdueQuestionsCount} pergunta(s) aguardando resposta há mais de 15 minutos.`
                      : "Nenhuma pergunta atrasada há mais de 15 minutos."}
                  </div>
                </div>
              </div>
              <a
                href="https://www.mercadolivre.com.br/perguntas/vendedor"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-semibold bg-white border border-slate-200 text-slate-700 hover:border-sky-400 hover:text-sky-700 transition-colors"
              >
                <span>Responder no ML</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            {/* Envios urgentes / prazo de corte */}
            {radar.urgentShipments.length === 0 ? (
              <EmptyRadarState message="Nenhum envio pago com prazo de corte vencido ou vencendo nas próximas 24h." />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {radar.urgentShipments.map((s) => {
                  const deadline = formatDeadlineBR(s.shippingDeadline);
                  const logistic = formatLogisticTypeLabel(s.logisticType);
                  return (
                    <div
                      key={s.mlOrderId}
                      className={`border rounded p-2.5 flex items-center justify-between gap-2 ${
                        s.isOverdue
                          ? "border-rose-300 bg-rose-50/40"
                          : "border-amber-200 bg-amber-50/25"
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span
                            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-mono text-[10px] font-bold ${
                              s.isOverdue
                                ? "bg-rose-600 text-white"
                                : "bg-amber-100 text-amber-900"
                            }`}
                          >
                            <Truck className="w-3 h-3" />
                            {deadline.label}
                          </span>
                          {logistic && (
                            <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px] font-semibold">
                              {logistic}
                            </span>
                          )}
                          <span className="text-[10px] font-mono text-slate-500">
                            #{s.mlPackId ?? s.mlOrderId}
                          </span>
                        </div>
                        <p className="text-xs font-semibold text-slate-800 truncate mt-1" title={s.title}>
                          {s.title}
                        </p>
                      </div>
                      <Link
                        href="/vendas/gestao-diaria"
                        className="shrink-0 px-2 py-1 rounded bg-white border border-slate-200 text-[10px] font-semibold text-slate-700 hover:border-sky-400 hover:text-sky-700 transition-colors"
                      >
                        Ver pedido
                      </Link>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function EmptyRadarState({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 py-3 px-3 rounded bg-emerald-50/50 border border-emerald-200/70 text-emerald-800 text-xs">
      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
      <span>{message}</span>
    </div>
  );
}
