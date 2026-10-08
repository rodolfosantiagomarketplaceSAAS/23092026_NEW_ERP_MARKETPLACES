"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Boxes,
  ShoppingCart,
  TrendingUp,
  Settings,
  ChevronLeft,
  ChevronRight,
  Zap,
  Building2,
  LogOut,
  User,
  ShieldCheck,
  UserCheck,
} from "lucide-react";
import {
  getCurrentUserProfileAndOrg,
  signOutUser,
  type UserProfileInfo,
  type OrganizationInfo,
} from "@/lib/services/auth";

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [profile, setProfile] = useState<UserProfileInfo | null>(null);
  const [org, setOrg] = useState<OrganizationInfo | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const pathname = usePathname();

  // Verifica se está em rota pública/autenticação/aguardando liberação (não exibe sidebar)
  const isAuthRoute =
    pathname?.startsWith("/login") ||
    pathname?.startsWith("/cadastro") ||
    pathname?.startsWith("/esqueci-senha") ||
    pathname?.startsWith("/redefinir-senha") ||
    pathname?.startsWith("/aguardando-liberacao");

  useEffect(() => {
    if (!isAuthRoute) {
      getCurrentUserProfileAndOrg().then((res) => {
        setIsAuthenticated(res.isAuthenticated);
        setProfile(res.user);
        setOrg(res.organization);
      });
    }
  }, [pathname, isAuthRoute]);

  if (isAuthRoute) {
    return null;
  }

  const isSuperAdmin = profile?.email?.toLowerCase() === "rodolfo.mecatronica@gmail.com";

  const menuItems = [
    {
      label: "Dashboard Geral",
      href: "/dashboard",
      icon: LayoutDashboard,
      badge: null,
    },
    {
      label: "Anúncios & Catálogo",
      href: "/catalogo",
      icon: Boxes,
      badge: null,
    },
    {
      label: "Vendas & Pedidos",
      href: "/pedidos",
      icon: ShoppingCart,
      badge: null,
    },
    {
      label: "Inteligência de Negócios",
      href: "/inteligencia",
      icon: TrendingUp,
      badge: "PRO",
      isPrimary: true,
    },
    {
      label: "Configurações & APIs",
      href: "/configuracoes",
      icon: Settings,
      badge: null,
    },
  ];

  // Adiciona o item exclusivo do Super Administrador Geral
  if (isSuperAdmin) {
    menuItems.push({
      label: "Gestão de Assinantes",
      href: "/admin/usuarios",
      icon: UserCheck,
      badge: "ADM",
      isPrimary: false,
    });
  }

  return (
    <aside
      className={`h-screen bg-[#0F172A] text-slate-300 flex flex-col justify-between transition-all duration-300 select-none z-40 sticky top-0 shrink-0 ${
        collapsed ? "w-16" : "w-64"
      }`}
    >
      {/* Topo: Logo & Toggle */}
      <div>
        <div className="h-14 border-b border-slate-800 flex items-center justify-between px-3">
          <div className="flex items-center space-x-2.5 overflow-hidden">
            <div className="w-8 h-8 rounded-lg bg-sky-600 flex items-center justify-center text-white font-black text-xs shrink-0 shadow-sm shadow-sky-600/30">
              <Zap className="w-4 h-4 fill-white" />
            </div>
            {!collapsed && (
              <div className="flex flex-col whitespace-nowrap overflow-hidden">
                <span className="font-bold text-white text-xs tracking-tight">MARKETPLACE ERP</span>
                <span className="text-[10px] text-slate-400">Inteligência & Gestão</span>
              </div>
            )}
          </div>
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white transition-colors"
            title={collapsed ? "Expandir Menu" : "Recolher Menu"}
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>

        {/* Informações da Conta Mestra / Empresa Ativa */}
        {!collapsed && org && (
          <div className="mx-2 mt-2.5 mb-1 p-2.5 rounded-lg bg-slate-850/80 border border-slate-800/80 text-xs">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center space-x-1.5 overflow-hidden">
                <Building2 className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                <span className="font-semibold text-slate-200 truncate text-[11px]">
                  {org.trade_name}
                </span>
              </div>
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-sky-500/10 border border-sky-500/20 text-sky-300 font-mono font-bold">
                {org.code}
              </span>
            </div>
            <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1 border-t border-slate-800/60">
              <span className="flex items-center gap-1 text-emerald-400 font-medium">
                <ShieldCheck className="w-3 h-3" />
                {isSuperAdmin ? "Super Admin" : "Mensalidade Ativa"}
              </span>
              <span className="text-slate-500">{isSuperAdmin ? "Acesso Total" : "Titular"}</span>
            </div>
          </div>
        )}

        {/* Lista de Navegação Principal */}
        <nav className="p-2 space-y-1">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href || (item.href === "/inteligencia" && pathname === "/");

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center rounded-md px-2.5 py-2 text-xs font-medium transition-all group ${
                  isActive
                    ? "bg-sky-600 text-white shadow-xs"
                    : "text-slate-300 hover:bg-slate-800/80 hover:text-white"
                } ${collapsed ? "justify-center" : "justify-between"}`}
                title={collapsed ? item.label : undefined}
              >
                <div className="flex items-center space-x-2.5 overflow-hidden">
                  <Icon
                    className={`w-4 h-4 shrink-0 transition-transform ${
                      isActive ? "text-white" : "text-slate-400 group-hover:text-white"
                    }`}
                  />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </div>

                {!collapsed && item.badge && (
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                      isActive
                        ? "bg-sky-800 text-white"
                        : item.badge === "ADM"
                        ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                        : item.isPrimary
                        ? "bg-amber-400/20 text-amber-300 border border-amber-400/30"
                        : "bg-slate-800 text-slate-400"
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Rodapé da Sidebar: Usuário Logado & Logout */}
      <div className="p-2.5 border-t border-slate-800 text-xs text-slate-400 flex flex-col gap-2">
        {isAuthenticated && profile ? (
          <div className={`flex items-center ${collapsed ? "justify-center" : "justify-between"} p-1.5 rounded-lg bg-slate-900/60`}>
            {!collapsed && (
              <div className="flex items-center space-x-2 overflow-hidden">
                <div className="w-7 h-7 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 text-xs font-bold shrink-0">
                  <User className="w-3.5 h-3.5 text-sky-400" />
                </div>
                <div className="flex flex-col overflow-hidden">
                  <span className="text-[11px] font-semibold text-white truncate">
                    {profile.full_name}
                  </span>
                  <span className="text-[9px] text-slate-400 truncate">
                    {profile.email}
                  </span>
                </div>
              </div>
            )}
            <button
              onClick={() => signOutUser()}
              className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded transition-colors"
              title="Sair da Conta (Logout)"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        ) : (
          !collapsed && (
            <div className="flex items-center space-x-2">
              <Link
                href="/login"
                className="flex-1 text-center py-1.5 px-2 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-medium transition-colors"
              >
                Entrar
              </Link>
              <Link
                href="/cadastro"
                className="flex-1 text-center py-1.5 px-2 rounded bg-sky-600 hover:bg-sky-500 text-white text-[11px] font-semibold transition-colors"
              >
                Criar Conta
              </Link>
            </div>
          )
        )}

        {/* Status Realtime & Versão */}
        {!collapsed ? (
          <div className="px-1 flex items-center justify-between text-[10px] text-slate-500">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
              Realtime Conectado
            </span>
            <span className="text-[9px]">Padrão Tiny/Bling</span>
          </div>
        ) : (
          <div className="flex justify-center" title="Supabase Realtime Ativo">
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
          </div>
        )}
      </div>
    </aside>
  );
}
