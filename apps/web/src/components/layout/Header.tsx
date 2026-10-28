"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Bell,
  ChevronDown,
  Building2,
  PlugZap,
  Download,
  User,
  ShieldCheck,
  AlertCircle,
} from "lucide-react";
import {
  getCurrentUserProfileAndOrg,
  type UserProfileInfo,
  type OrganizationInfo,
} from "@/lib/services/auth";

interface HeaderProps {
  platformName?: string;
}

export function Header({ platformName = "Mercado Livre" }: HeaderProps) {
  const [selectedOrg, setSelectedOrg] = useState("Carregando loja...");
  const [hasConnectedChannel, setHasConnectedChannel] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfileInfo | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    let isMounted = true;
    async function checkIntegrations() {
      try {
        const res = await fetch("/api/integrations");
        if (res.ok) {
          const data = await res.json();
          const activeMl = data.mercadolivre?.accounts?.find((a: any) => a.status === "online");
          if (activeMl && isMounted) {
            setSelectedOrg(activeMl.account_name || "Mercado Livre");
            setHasConnectedChannel(true);
            return;
          }
          if (data.shopee?.connected && isMounted) {
            setSelectedOrg(data.shopee.account_name || "Shopee Oficial");
            setHasConnectedChannel(true);
            return;
          }
        }
      } catch {
        // Ignora
      }
      if (isMounted) {
        setSelectedOrg("Sem Loja Vinculada");
        setHasConnectedChannel(false);
      }
    }

    async function loadAuth() {
      try {
        const authData = await getCurrentUserProfileAndOrg();
        if (isMounted) {
          setIsAuthenticated(authData.isAuthenticated);
          setUserProfile(authData.user);
        }
      } catch {
        // Ignora
      }
    }

    checkIntegrations();
    loadAuth();

    return () => {
      isMounted = false;
    };
  }, []);

  const userInitials = userProfile?.full_name
    ? userProfile.full_name
        .split(" ")
        .map((n) => n[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : "RS";

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
          href="/configuracoes?tab=api"
          title="Extensão pronta para receber capturas. Clique para ver credenciais e configurar."
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-medium bg-sky-50 border-sky-200 text-sky-800 hover:bg-sky-100 transition-colors cursor-pointer"
        >
          <span className="relative flex h-2 w-2">
            <span className="relative inline-flex rounded-full h-2 w-2 bg-sky-500"></span>
          </span>
          <PlugZap className="w-3 h-3 text-sky-600" />
          <span>Extensão Pronta (Local)</span>
        </Link>

        {/* Botão de Download da Extensão Chrome (apenas após login) */}
        <a
          href="/api/extension/download"
          download="erp-marketplaces-extension.zip"
          title="Baixar pacote compactado da extensão Chrome (.zip) para instalar no seu PC"
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded border text-[11px] font-semibold bg-emerald-50 border-emerald-300 text-emerald-800 hover:bg-emerald-100 transition-colors cursor-pointer shadow-2xs"
        >
          <Download className="w-3.5 h-3.5 text-emerald-700 stroke-[2.2]" />
          <span>Baixar Extensão (.zip)</span>
        </a>

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
            {userInitials}
          </div>
          <div className="hidden md:flex flex-col text-left">
            <span className="text-[11px] font-semibold text-[#0F172A] leading-tight">
              {userProfile?.full_name || "Usuário Master"}
            </span>
            <span className="text-[10px] text-[#64748B] leading-tight">
              {userProfile?.role === "master_admin" ? "Admin Master" : userProfile?.role || "Operador"}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
