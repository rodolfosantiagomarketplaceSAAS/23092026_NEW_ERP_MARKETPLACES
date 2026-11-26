"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { BiDashboard } from "@/components/bi/BiDashboard";
import { MarketSearchSubTab } from "@/components/bi/MarketSearchSubTab";
import { CompetitorStoresSubTab } from "@/components/bi/CompetitorStoresSubTab";
import { Radio, Search, Store, BookmarkCheck } from "lucide-react";

function InteligenciaContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawTab = searchParams.get("tab");
  const initialTab =
    rawTab === "radar"
      ? "radar"
      : rawTab === "salvos" || rawTab === "criar"
      ? "salvos"
      : rawTab === "pesquisa"
      ? "pesquisa"
      : "lojas";
  const [activeSubTab, setActiveSubTab] = useState<
    "radar" | "pesquisa" | "lojas" | "salvos"
  >(initialTab);

  useEffect(() => {
    const tabParam = searchParams.get("tab");
    if (tabParam === "concorrentes" || tabParam === "lojas") {
      setActiveSubTab("lojas");
    } else if (tabParam === "criar" || tabParam === "salvos") {
      setActiveSubTab("salvos");
    } else if (tabParam === "pesquisa") {
      setActiveSubTab("pesquisa");
    } else if (tabParam === "radar") {
      setActiveSubTab("radar");
    }
  }, [searchParams]);

  const handleSelectTab = (tab: "radar" | "pesquisa" | "lojas" | "salvos") => {
    setActiveSubTab(tab);
    router.replace(`/inteligencia?tab=${tab}`, { scroll: false });
  };

  const activeSubTabLabel =
    activeSubTab === "lojas"
      ? "Espião de Concorrentes"
      : activeSubTab === "salvos"
      ? "Anúncios para Analisar & Criar"
      : activeSubTab === "pesquisa"
      ? "Pesquisa de Mercado"
      : "Radar Comparativo";

  return (
    <>
      <Header platformName={activeSubTabLabel} />
      <main className="p-4 sm:p-6 flex-1 min-w-0 w-full">
        <div className="max-w-[1600px] w-full mx-auto space-y-5 min-w-0">
          {/* Cabeçalho do Módulo & Navegação de Subabas no Canto Direito */}
          <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 pb-3 border-b border-slate-200">
            {/* Lado Esquerdo: Identificação do Módulo */}
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
                  Inteligência de Negócios
                </h1>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700">
                  Mercado Livre & Shopee
                </span>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                  {activeSubTabLabel}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1 max-w-2xl">
                {activeSubTab === "lojas"
                  ? "Espião de lojas concorrentes no Mercado Livre: extração via extensão, datas de criação, vendas e clonagem de anúncios."
                  : activeSubTab === "salvos"
                  ? "Fila de anúncios interessantes salvos para analisar, calcular lucro real, criar na sua loja e gerenciar."
                  : activeSubTab === "pesquisa"
                  ? "Pesquisa ativa de produtos com raio-X estatístico, campanhas promocionais, menores preços e pareamento 1-clique."
                  : "Monitoramento 1:N dos seus anúncios e concorrentes seguidos com atualização sob demanda em 1 clique (Modo Econômico)."}
              </p>
            </div>

            {/* Lado Direito ("no canto direito as subabas"): Subabas Alinhadas */}
            <div className="flex items-center justify-end ml-auto shrink-0 max-w-full overflow-x-auto pb-1 xl:pb-0">
              <nav
                aria-label="Subabas de Inteligência de Negócios"
                className="flex items-center gap-1 bg-slate-100/90 p-1 rounded-xl border border-slate-200 text-[11px] font-semibold shadow-2xs"
              >
                {/* 1. Espião de Concorrentes */}
                <button
                  type="button"
                  onClick={() => handleSelectTab("lojas")}
                  className={`px-2.5 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                    activeSubTab === "lojas"
                      ? "bg-white text-indigo-700 shadow-xs font-bold border border-slate-200/80"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/50"
                  }`}
                  title="Espião de Lojas e Anúncios Concorrentes no Mercado Livre"
                >
                  <Store className={`w-3.5 h-3.5 ${activeSubTab === "lojas" ? "text-indigo-600" : "text-slate-500"}`} />
                  <span>Espião de Concorrentes</span>
                </button>

                {/* 2. Anúncios para Analisar & Criar */}
                <button
                  type="button"
                  onClick={() => handleSelectTab("salvos")}
                  className={`px-2.5 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                    activeSubTab === "salvos"
                      ? "bg-white text-indigo-700 shadow-xs font-bold border border-slate-200/80"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/50"
                  }`}
                  title="Fila de Anúncios Concorrentes Salvos para Analisar e Criar"
                >
                  <BookmarkCheck className={`w-3.5 h-3.5 ${activeSubTab === "salvos" ? "text-amber-600" : "text-slate-500"}`} />
                  <span>Anúncios para Analisar & Criar</span>
                  <span className="text-[9px] bg-emerald-600 text-white px-1.5 py-0.2 rounded-full font-black">
                    NOVO
                  </span>
                </button>

                {/* 3. Pesquisa de Mercado */}
                <button
                  type="button"
                  onClick={() => handleSelectTab("pesquisa")}
                  className={`px-2.5 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                    activeSubTab === "pesquisa"
                      ? "bg-white text-indigo-700 shadow-xs font-bold border border-slate-200/80"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/50"
                  }`}
                  title="Pesquisa Ativa no Mercado Livre e Análise de Preços"
                >
                  <Search className={`w-3.5 h-3.5 ${activeSubTab === "pesquisa" ? "text-indigo-600" : "text-slate-500"}`} />
                  <span>Pesquisa de Mercado</span>
                  <span className="text-[9px] bg-indigo-600 text-white px-1.5 py-0.2 rounded-full font-bold">
                    PRO
                  </span>
                </button>

                {/* 4. Radar Comparativo */}
                <button
                  type="button"
                  onClick={() => handleSelectTab("radar")}
                  className={`px-2.5 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                    activeSubTab === "radar"
                      ? "bg-white text-indigo-700 shadow-xs font-bold border border-slate-200/80"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/50"
                  }`}
                  title="Radar Comparativo de Preços e BuyBox em Tempo Real (1:N)"
                >
                  <Radio className={`w-3.5 h-3.5 ${activeSubTab === "radar" ? "text-emerald-600" : "text-slate-500"}`} />
                  <span>Radar Comparativo</span>
                  <span className="text-[9px] bg-emerald-50 text-emerald-700 border border-emerald-300 px-1.5 py-0.2 rounded-full font-bold">
                    1:N
                  </span>
                </button>
              </nav>
            </div>
          </div>

          {/* Renderização Condicional da Subaba Ativa */}
          {activeSubTab === "lojas" ? (
            <CompetitorStoresSubTab initialView="stores" />
          ) : activeSubTab === "salvos" ? (
            <CompetitorStoresSubTab initialView="saved" />
          ) : activeSubTab === "pesquisa" ? (
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
