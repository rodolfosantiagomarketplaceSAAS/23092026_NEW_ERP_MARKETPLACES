import React from "react";
import { Header } from "@/components/layout/Header";
import { ConfiguracoesDashboard } from "@/components/config/ConfiguracoesDashboard";

export default function ConfiguracoesPage() {
  return (
    <>
      <Header platformName="Configurações & Integrações de APIs" />
      <main className="p-4 flex-1">
        <div className="max-w-[1600px] mx-auto">
          {/* Título de Seção */}
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-base font-bold text-slate-900 tracking-tight">
                Configurações & Conexões de APIs
              </h1>
              <p className="text-xs text-slate-500">
                Gerenciamento de credenciais da Extensão Chrome, conexões com Marketplaces e regras automatizadas de Buybox.
              </p>
            </div>
          </div>

          {/* Componente Mestre de Configurações */}
          <ConfiguracoesDashboard />
        </div>
      </main>
    </>
  );
}
