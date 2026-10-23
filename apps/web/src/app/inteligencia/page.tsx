"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { BiDashboard } from "@/components/bi/BiDashboard";
import { MarketSearchSubTab } from "@/components/bi/MarketSearchSubTab";
import { Radio, Search, Sparkles } from "lucide-react";

function InteligenciaContent() {
  const searchParams = useSearchParams();
  const initialTab = searchParams.get("tab") === "radar" ? "radar" : "pesquisa";
  const [activeSubTab, setActiveSubTab] = useState<"radar" | "pesquisa">(initialTab);

  useEffect(() => {
    const tabParam = searchParams.get("tab");
    if (tabParam === "radar" || tabParam === "pesquisa") {
      setActiveSubTab(tabParam);
    }
  }, [searchParams]);

  return (
    <>
      <Header platformName="Módulo de Inteligência de Negócios" />
      <main className="p-4 sm:p-6 flex-1 min-w-0 w-full">
        <div className="max-w-[1600px] w-full mx-auto space-y-5 min-w-0">
          {/* Cabeçalho do Módulo & Navegação de Subabas */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-1 border-b border-slate-200">
            <div>
              <h1 className="text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2">
                Inteligência de Negócios & Concorrência
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">
                  Mercado Livre & Shopee
                </span>
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                {activeSubTab === "pesquisa"
                  ? "Pesquisa ativa de produtos com raio-X estatístico, campanhas, melhores preços e pareamento 1-clique."
                  : "Monitoramento 1:N de anúncios concorrentes pareados com atualização em tempo real (Supabase Realtime)."}
              </p>
            </div>

            {/* Seletor de Subabas Estilizado */}
            <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-semibold self-start sm:self-auto shadow-2xs">
              <button
                type="button"
                onClick={() => setActiveSubTab("pesquisa")}
                className={`px-3.5 py-2 rounded-lg transition-all flex items-center gap-2 ${
                  activeSubTab === "pesquisa"
                    ? "bg-white text-indigo-700 shadow-sm font-bold"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <Search className="w-4 h-4 text-indigo-600" />
                <span>Pesquisa de Mercado</span>
                <span className="text-[10px] bg-indigo-600 text-white px-1.5 py-0.2 rounded-full font-bold">
                  PRO
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveSubTab("radar")}
                className={`px-3.5 py-2 rounded-lg transition-all flex items-center gap-2 ${
                  activeSubTab === "radar"
                    ? "bg-white text-indigo-700 shadow-sm font-bold"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <Radio className="w-4 h-4 text-emerald-600" />
                <span>Radar Comparativo (1:N)</span>
              </button>
            </div>
          </div>

          {/* Renderização Condicional da Subaba Ativa */}
          {activeSubTab === "pesquisa" ? (
            <MarketSearchSubTab />
          ) : (
            <BiDashboard />
          )}
        </div>
      </main>
    </>
  );
}

export default function InteligenciaPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-slate-500 text-sm">Carregando Inteligência de Mercado...</div>}>
      <InteligenciaContent />
    </Suspense>
  );
}
