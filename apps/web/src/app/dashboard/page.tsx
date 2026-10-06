import React from "react";
import { Header } from "@/components/layout/Header";
import Link from "next/link";
import { TrendingUp, ShoppingBag, DollarSign, Award, ArrowUpRight, Sparkles } from "lucide-react";

export default function DashboardPage() {
  return (
    <>
      <Header platformName="Visão Geral Operacional" />
      <main className="p-4 flex-1">
        <div className="max-w-[1600px] mx-auto space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-base font-bold text-slate-900 tracking-tight">Dashboard Executivo de Operações</h1>
              <p className="text-xs text-slate-500">
                Métricas consolidadas de vendas, faturamento e competitividade em tempo real.
              </p>
            </div>
            <Link
              href="/inteligencia"
              className="px-3 py-1.5 text-xs font-semibold bg-sky-600 hover:bg-sky-700 text-white rounded flex items-center gap-1.5 shadow-2xs transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Painel de Inteligência de Buybox
            </Link>
          </div>

          {/* Cards de Métricas Estilo Tiny ERP */}
          <div className="grid grid-cols-4 gap-3">
            <div className="bg-white border border-[#E2E8F0] p-3.5 rounded shadow-2xs">
              <div className="text-[11px] font-medium text-slate-500 flex items-center justify-between">
                <span>Faturamento Mensal</span>
                <DollarSign className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="text-xl font-bold text-slate-900 mt-1">R$ 142.890,00</div>
              <div className="text-[10px] text-emerald-700 font-medium flex items-center mt-1">
                <ArrowUpRight className="w-3 h-3" /> +14.2% vs mês anterior
              </div>
            </div>

            <div className="bg-white border border-[#E2E8F0] p-3.5 rounded shadow-2xs">
              <div className="text-[11px] font-medium text-slate-500 flex items-center justify-between">
                <span>Pedidos no Mês</span>
                <ShoppingBag className="w-4 h-4 text-sky-600" />
              </div>
              <div className="text-xl font-bold text-slate-900 mt-1">1.284</div>
              <div className="text-[10px] text-sky-700 font-medium flex items-center mt-1">
                <ArrowUpRight className="w-3 h-3" /> +8.7% vs mês anterior
              </div>
            </div>

            <div className="bg-white border border-[#E2E8F0] p-3.5 rounded shadow-2xs">
              <div className="text-[11px] font-medium text-slate-500 flex items-center justify-between">
                <span>Taxa de Vitória de Buybox</span>
                <Award className="w-4 h-4 text-amber-500" />
              </div>
              <div className="text-xl font-bold text-slate-900 mt-1">68.4%</div>
              <div className="text-[10px] text-slate-400 mt-1">
                Monitorado no Mercado Livre & Shopee
              </div>
            </div>

            <div className="bg-white border border-[#E2E8F0] p-3.5 rounded shadow-2xs">
              <div className="text-[11px] font-medium text-slate-500 flex items-center justify-between">
                <span>Ticket Médio</span>
                <TrendingUp className="w-4 h-4 text-purple-600" />
              </div>
              <div className="text-xl font-bold text-slate-900 mt-1">R$ 111,28</div>
              <div className="text-[10px] text-slate-400 mt-1">
                Média dos canais ativos
              </div>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
