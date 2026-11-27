"use client";

import React, { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  LayoutDashboard,
  Boxes,
  Radio,
  TrendingUp,
  Store,
  Settings,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Search,
  BookmarkCheck,
  Zap,
  Building2,
  LogOut,
  User,
  ShieldCheck,
  UserCheck,
  Download,
  Wallet,
  Package,
} from "lucide-react";
import {
  getCurrentUserProfileAndOrg,
  signOutUser,
  type UserProfileInfo,
  type OrganizationInfo,
} from "@/lib/services/auth";
import { EXTENSION_VERSION } from "@/lib/extension/version";

function SidebarContent() {
  const [collapsed, setCollapsed] = useState(false);
  const [profile, setProfile] = useState<UserProfileInfo | null>(null);
  const [org, setOrg] = useState<OrganizationInfo | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const pathname = usePathname();
  const searchParams = useSearchParams();

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
  const isBiPage = pathname === "/inteligencia" || pathname === "/";
  const rawTab = searchParams?.get("tab");
  const currentBiTab =
    rawTab === "radar"
      ? "radar"
      : rawTab === "salvos" || rawTab === "criar"
      ? "salvos"
      : rawTab === "pesquisa"
      ? "pesquisa"
      : "lojas";

  const [biOpen, setBiOpen] = useState(true);

  useEffect(() => {
    if (isBiPage) {
      setBiOpen(true);
    }
  }, [isBiPage]);

  interface SubMenuItem {
    label: string;
    href: string;
    icon: React.ComponentType<{ className?: string }>;
    tab: string;
    badge?: string | null;
  }

  interface MenuItem {
    label: string;
    href: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: string | null;
    isPrimary?: boolean;
    children?: SubMenuItem[];
  }

  const menuItems: MenuItem[] = [
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
      label: "Produtos, Kits & Bobinas",
      href: "/produtos",
      icon: Package,
      badge: "ERP",
    },
    {
      label: "Gestão de Vendas & Repasse",
      href: "/vendas/gestao-diaria",
      icon: Wallet,
      badge: "ML",
    },
    {
      label: "Inteligência de Negócios",
      href: "/inteligencia?tab=lojas",
      icon: TrendingUp,
      badge: "PRO",
      isPrimary: true,
      children: [
        {
          label: "Espião de Concorrentes",
          href: "/inteligencia?tab=lojas",
          icon: Store,
          tab: "lojas",
          badge: null,
        },
        {
          label: "Anúncios para Analisar & Criar",
          href: "/inteligencia?tab=salvos",
          icon: BookmarkCheck,
          tab: "salvos",
          badge: "NOVO",
        },
        {
          label: "Pesquisa de Mercado",
          href: "/inteligencia?tab=pesquisa",
          icon: Search,
          tab: "pesquisa",
          badge: null,
        },
        {
          label: "Radar Comparativo",
          href: "/inteligencia?tab=radar",
          icon: Radio,
          tab: "radar",
          badge: "1:N",
        },
      ],
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
      <div className="flex-1 overflow-y-auto min-h-0">
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

            // Se o item tem sub-abas (Inteligência de Negócios)
            if (item.children && item.children.length > 0) {
              if (collapsed) {
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center justify-center rounded-md p-2 text-xs font-medium transition-all ${
                      isBiPage
                        ? "bg-sky-600 text-white shadow-xs"
                        : "text-slate-300 hover:bg-slate-800/80 hover:text-white"
                    }`}
                    title={`${item.label} (Espião, Analisar, Pesquisa, Radar)`}
                  >
                    <Icon className={`w-4 h-4 ${isBiPage ? "text-white" : "text-slate-400 group-hover:text-white"}`} />
                  </Link>
                );
              }

              return (
                <div key={item.label} className="space-y-1">
                  <div
                    className={`flex items-center justify-between rounded-md px-2.5 py-2 text-xs font-medium transition-all ${
                      isBiPage
                        ? "bg-slate-800/80 text-white border border-slate-700/60 shadow-2xs"
                        : "text-slate-300 hover:bg-slate-800/80 hover:text-white"
                    }`}
                  >
                    <Link
                      href={item.href}
                      className="flex items-center space-x-2.5 overflow-hidden flex-1 group"
                    >
                      <Icon
                        className={`w-4 h-4 shrink-0 transition-transform ${
                          isBiPage ? "text-sky-400" : "text-slate-400 group-hover:text-white"
                        }`}
                      />
                      <span className="truncate font-semibold">{item.label}</span>
                    </Link>

                    <div className="flex items-center gap-1 shrink-0">
                      {item.badge && (
                        <span className="text-[10px] px-1.5 py-0.2 rounded font-bold bg-amber-400/20 text-amber-300 border border-amber-400/30">
                          {item.badge}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setBiOpen(!biOpen);
                        }}
                        className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-700/60 transition-colors"
                        title={biOpen ? "Recolher subabas" : "Expandir subabas"}
                      >
                        <ChevronDown
                          className={`w-3.5 h-3.5 transition-transform duration-200 ${
                            biOpen ? "rotate-0" : "-rotate-90"
                          }`}
                        />
                      </button>
                    </div>
                  </div>

                  {/* Subabas Indentadas */}
                  {biOpen && (
                    <div className="ml-4 pl-2.5 border-l-2 border-slate-700/70 space-y-0.5 pt-0.5 pb-1">
                      {item.children.map((sub) => {
                        const SubIcon = sub.icon;
                        const isSubActive = isBiPage && currentBiTab === sub.tab;
                        return (
                          <Link
                            key={sub.tab}
                            href={sub.href}
                            title={sub.label}
                            className={`flex items-center justify-between px-2.5 py-1.5 rounded-md text-[11px] font-medium transition-all ${
                              isSubActive
                                ? "bg-sky-600 text-white shadow-xs font-semibold -ml-[11px] border-l-2 border-white pl-2"
                                : "text-slate-400 hover:text-white hover:bg-slate-800/60"
                            }`}
                          >
                            <div className="flex items-center gap-2 overflow-hidden">
                              <SubIcon
                                className={`w-3.5 h-3.5 shrink-0 ${
                                  isSubActive ? "text-white" : "text-slate-400"
                                }`}
                              />
                              <span className="truncate">{sub.label}</span>
                            </div>
                            {sub.badge && (
                              <span
                                className={`text-[9px] px-1.5 py-0.2 rounded font-bold ${
                                  isSubActive
                                    ? "bg-white/20 text-white"
                                    : sub.badge === "NOVO"
                                    ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                                    : "bg-sky-500/20 text-sky-300 border border-sky-500/30"
                                }`}
                              >
                                {sub.badge}
                              </span>
                            )}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            }

            const isActive =
              item.href === "/vendas/gestao-diaria"
                ? Boolean(pathname?.startsWith("/vendas"))
                : pathname === item.href;

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

        {/* Botão de Download da Extensão Chrome (apenas após login) */}
        {isAuthenticated && (
          <div className="px-2 pt-2 border-t border-slate-800/80">
            <a
              href="/api/extension/download"
              download="erp-marketplaces-extension.zip"
              title="Baixar pacote da extensão Chrome (.zip) para este PC"
              className={`flex items-center rounded-md px-2.5 py-2 text-xs font-semibold transition-all group bg-emerald-950/40 border border-emerald-500/30 text-emerald-200 hover:bg-emerald-900/60 hover:text-white ${
                collapsed ? "justify-center" : "justify-between"
              }`}
            >
              <div className="flex items-center space-x-2.5 overflow-hidden">
                <Download className="w-4 h-4 shrink-0 text-emerald-400 group-hover:text-white transition-transform group-hover:scale-110" />
                {!collapsed && <span className="truncate">Baixar Extensão</span>}
              </div>
              {!collapsed && (
                <span className="text-[9px] px-1.5 py-0.5 rounded font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  v{EXTENSION_VERSION}
                </span>
              )}
            </a>
          </div>
        )}
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

export function Sidebar() {
  return (
    <Suspense fallback={<aside className="h-screen w-64 bg-[#0F172A] shrink-0" />}>
      <SidebarContent />
    </Suspense>
  );
}
