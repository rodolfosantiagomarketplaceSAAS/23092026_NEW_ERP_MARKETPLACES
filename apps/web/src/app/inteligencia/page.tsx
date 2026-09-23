import React from "react";
import { Header } from "@/components/layout/Header";
import { BiDashboard } from "@/components/bi/BiDashboard";

export default function InteligenciaPage() {
  return (
    <>
      <Header platformName="Módulo de Inteligência de Negócios" />
      <main className="p-4 flex-1">
        <div className="max-w-[1600px] mx-auto">
          {/* Título de Seção & Badge de Destaque */}
          <div className="flex items-center justify-between mb-3">
            <div>
              <h1 className="text-base font-bold text-slate-900 tracking-tight">
                Painel Comparativo de Inteligência de Mercado
              </h1>
              <p className="text-xs text-slate-500">
                Monitoramento 1:N de anúncios concorrentes pareados com atualização em tempo real (Supabase Realtime).
              </p>
            </div>
          </div>

          {/* Componente Mestre do BI */}
          <BiDashboard />
        </div>
      </main>
    </>
  );
}
