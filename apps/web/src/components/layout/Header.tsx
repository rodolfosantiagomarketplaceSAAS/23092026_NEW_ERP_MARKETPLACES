"use client";

import React, { useState } from "react";
import {
  Bell,
  ChevronDown,
  Building2,
  PlugZap,
  User,
  ShieldCheck,
} from "lucide-react";

interface HeaderProps {
  platformName?: string;
}

export function Header({ platformName = "Mercado Livre" }: HeaderProps) {
  const [selectedOrg, setSelectedOrg] = useState("Distribuidora Matriz SP");
  const [extensionOnline] = useState(true);

  return (
    <header className="h-12 bg-white border-b border-[#E2E8F0] px-4 flex items-center justify-between sticky top-0 z-30 shadow-xs">
      {/* Lado Esquerdo: Breadcrumb Corporativo */}
      <div className="flex items-center space-x-2 text-xs">
        <span className="text-[#64748B] hover:text-[#0F172A] cursor-pointer">Início</span>
        <span className="text-[#CBD5E1]">/</span>
        <span className="text-[#64748B]">Inteligência Competitiva</span>
        <span className="text-[#CBD5E1]">/</span>
        <span className="font-semibold text-[#0F172A]">{platformName}</span>
      </div>

      {/* Lado Direito: Seletor de Conta, Status da Extensão e Perfil */}
      <div className="flex items-center space-x-3 text-xs">
        {/* Status da Extensão Chrome */}
        <div
          title={extensionOnline ? "Extensão Chrome conectada e sincronizando" : "Extensão desconectada"}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-medium transition-colors ${
            extensionOnline
              ? "bg-[#ECFDF5] border-[#A7F3D0] text-[#065F46]"
              : "bg-[#FEF2F2] border-[#FECACA] text-[#991B1B]"
          }`}
        >
          <span className="relative flex h-2 w-2">
            {extensionOnline && (
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#10B981] opacity-75"></span>
            )}
            <span
              className={`relative inline-flex rounded-full h-2 w-2 ${
                extensionOnline ? "bg-[#10B981]" : "bg-[#EF4444]"
              }`}
            ></span>
          </span>
          <PlugZap className="w-3 h-3" />
          <span>{extensionOnline ? "Extensão Online" : "Extensão Offline"}</span>
        </div>

        {/* Seletor de Organização / Empresa */}
        <div className="relative flex items-center border border-[#E2E8F0] rounded px-2.5 py-1 bg-[#F8FAFC] hover:bg-[#F1F5F9] cursor-pointer text-[#334155]">
          <Building2 className="w-3.5 h-3.5 mr-1.5 text-[#64748B]" />
          <span className="font-medium mr-1 text-[11px]">{selectedOrg}</span>
          <ChevronDown className="w-3 h-3 text-[#64748B]" />
        </div>

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
