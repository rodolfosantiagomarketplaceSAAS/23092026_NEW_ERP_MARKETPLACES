"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Bell,
  ChevronDown,
  Building2,
  PlugZap,
  User,
  ShieldCheck,
  AlertCircle,
} from "lucide-react";

interface HeaderProps {
  platformName?: string;
}

export function Header({ platformName = "Mercado Livre" }: HeaderProps) {
  const [selectedOrg, setSelectedOrg] = useState("Sem Loja Vinculada");
  const [hasConnectedChannel, setHasConnectedChannel] = useState(false);

  useEffect(() => {
    try {
      const ml = localStorage.getItem("erp_ml_integration");
      const shp = localStorage.getItem("erp_shopee_integration");
      if (ml) {
        const parsed = JSON.parse(ml);
        if (parsed.connected && parsed.accountName) {
          setSelectedOrg(parsed.accountName);
          setHasConnectedChannel(true);
          return;
        }
      }
      if (shp) {
        const parsed = JSON.parse(shp);
        if (parsed.connected && parsed.shopId) {
          setSelectedOrg(`Shopee: ${parsed.shopId}`);
          setHasConnectedChannel(true);
          return;
        }
      }
      setSelectedOrg("Sem Loja Vinculada");
      setHasConnectedChannel(false);
    } catch {
      // Ignora
    }
  }, []);

  return (
    <header className="h-12 bg-white border-b border-[#E2E8F0] px-4 flex items-center justify-between sticky top-0 z-30 shadow-xs">
      {/* Lado Esquerdo: Breadcrumb Corporativo */}
      <div className="flex items-center space-x-2 text-xs">
        <Link href="/" className="text-[#64748B] hover:text-[#0F172A] cursor-pointer">
          Início
        </Link>
        <span className="text-[#CBD5E1]">/</span>
        <span className="text-[#64748B]">Inteligência Competitiva</span>
        <span className="text-[#CBD5E1]">/</span>
        <span className="font-semibold text-[#0F172A]">{platformName}</span>
      </div>

      {/* Lado Direito: Seletor de Conta, Status da Extensão e Perfil */}
      <div className="flex items-center space-x-3 text-xs">
        {/* Status da Extensão Chrome */}
        <Link
          href="/configuracoes"
          title="Extensão pronta para receber capturas. Clique para ver credenciais e configurar."
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-medium bg-sky-50 border-sky-200 text-sky-800 hover:bg-sky-100 transition-colors cursor-pointer"
        >
          <span className="relative flex h-2 w-2">
            <span className="relative inline-flex rounded-full h-2 w-2 bg-sky-500"></span>
          </span>
          <PlugZap className="w-3 h-3 text-sky-600" />
          <span>Extensão Pronta (Local)</span>
        </Link>

        {/* Seletor de Organização / Empresa (Reflete status real) */}
        <Link
          href="/configuracoes"
          className={`relative flex items-center border rounded px-2.5 py-1 text-[11px] transition-colors cursor-pointer ${
            hasConnectedChannel
              ? "bg-[#F8FAFC] hover:bg-[#F1F5F9] border-[#E2E8F0] text-[#334155]"
              : "bg-amber-50/60 hover:bg-amber-100/60 border-amber-200 text-amber-900"
          }`}
          title={hasConnectedChannel ? "Canal conectado. Clique para gerenciar." : "Nenhuma conta vinculada. Clique para conectar Mercado Livre ou Shopee."}
        >
          <Building2 className={`w-3.5 h-3.5 mr-1.5 ${hasConnectedChannel ? "text-[#64748B]" : "text-amber-600"}`} />
          <span className="font-medium mr-1">{selectedOrg}</span>
          {!hasConnectedChannel && (
            <span className="ml-1 text-[9px] bg-amber-200 text-amber-800 px-1 py-0.2 rounded font-bold">
              Conectar
            </span>
          )}
          <ChevronDown className="w-3 h-3 text-[#64748B] ml-1" />
        </Link>

        {/* Notificações de Alerta de Buybox */}
        <button
          className="relative p-1.5 text-[#64748B] hover:text-[#0F172A] hover:bg-[#F1F5F9] rounded border border-transparent hover:border-[#E2E8F0]"
          title="Alertas de Perda de Buybox"
        >
          <Bell className="w-4 h-4" />
          <span className="absolute top-1 right-1 w-2 h-2 bg-[#EF4444] rounded-full"></span>
        </button>

        {/* Perfil do Usuário */}
        <div className="flex items-center space-x-2 pl-2 border-l border-[#E2E8F0]">
          <div className="w-7 h-7 rounded-full bg-[#0F172A] text-white flex items-center justify-center font-bold text-[10px]">
            RS
          </div>
          <div className="hidden md:flex flex-col text-left">
            <span className="text-[11px] font-semibold text-[#0F172A] leading-tight">Rodolfo S.</span>
            <span className="text-[10px] text-[#64748B] leading-tight">Admin Master</span>
          </div>
        </div>
      </div>
    </header>
  );
}
