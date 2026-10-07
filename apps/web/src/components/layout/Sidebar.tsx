"use client";

import React, { useState } from "react";
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
} from "lucide-react";

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();

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

  return (
    <aside
      className={`h-screen bg-[#0F172A] text-slate-300 flex flex-col justify-between transition-all duration-300 select-none z-40 sticky top-0 ${
        collapsed ? "w-16" : "w-60"
      }`}
    >
      {/* Topo: Logo & Toggle */}
      <div>
        <div className="h-12 border-b border-slate-800 flex items-center justify-between px-3">
          <div className="flex items-center space-x-2 overflow-hidden">
            <div className="w-7 h-7 rounded bg-sky-600 flex items-center justify-center text-white font-black text-xs shrink-0">
              <Zap className="w-4 h-4 fill-white" />
            </div>
            {!collapsed && (
              <div className="flex flex-col whitespace-nowrap">
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

        {/* Lista de Navegação */}
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

      {/* Rodapé da Sidebar */}
      <div className="p-3 border-t border-slate-800 text-[10px] text-slate-400 flex flex-col gap-1">
        {!collapsed ? (
          <>
            <div className="flex items-center justify-between">
              <span>Supabase Realtime:</span>
              <span className="text-emerald-400 font-semibold flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                Ativo
              </span>
            </div>
            <div className="text-slate-500 text-[9px]">v2.4.0 (Padrão Tiny ERP)</div>
          </>
        ) : (
          <div className="flex justify-center" title="Supabase Realtime Ativo">
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
          </div>
        )}
      </div>
    </aside>
  );
}
