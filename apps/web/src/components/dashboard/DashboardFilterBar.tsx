"use client";

import React from "react";
import { Calendar, Database, RefreshCw, Store } from "lucide-react";
import type { DashboardPeriodPreset } from "@/types/executive-dashboard";

interface DashboardFilterBarProps {
  preset: DashboardPeriodPreset;
  fromDate: string;
  toDate: string;
  prevFromDate?: string;
  prevToDate?: string;
  stores: string[];
  selectedStore: string;
  loading: boolean;
  cacheInfo?: {
    source: "browser" | "server" | "fresh";
    generatedAt: string;
    ttlMinutes: number;
  } | null;
  onSelectPreset: (preset: DashboardPeriodPreset) => void;
  onChangeCustomRange: (from: string, to: string) => void;
  onChangeStore: (store: string) => void;
  onForceRefresh: () => void;
}

const PRESET_OPTIONS: Array<{ id: DashboardPeriodPreset; label: string }> = [
  { id: "today", label: "Hoje" },
  { id: "last7", label: "7 dias" },
  { id: "last15", label: "15 dias" },
  { id: "last30", label: "30 dias" },
  { id: "thisMonth", label: "Este Mês" },
  { id: "custom", label: "Personalizado" },
];

function formatBrDateShort(iso?: string): string {
  if (!iso || iso.length < 10) return "";
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}`;
}

function formatTimeBr(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export function DashboardFilterBar({
  preset,
  fromDate,
  toDate,
  prevFromDate,
  prevToDate,
  stores,
  selectedStore,
  loading,
  cacheInfo,
  onSelectPreset,
  onChangeCustomRange,
  onChangeStore,
  onForceRefresh,
}: DashboardFilterBarProps) {
  return (
    <div className="bg-white border border-[#E2E8F0] rounded p-3 shadow-2xs space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        {/* Seletor de Período */}
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="inline-flex items-center bg-[#F4F6F8] border border-[#E2E8F0] rounded p-0.5">
            {PRESET_OPTIONS.map((opt) => {
              const active = preset === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => onSelectPreset(opt.id)}
                  className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-all ${
                    active
                      ? "bg-[#0F172A] text-white shadow-2xs"
                      : "text-slate-600 hover:text-slate-900 hover:bg-white/70"
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          {/* Inputs de data quando Personalizado */}
          {preset === "custom" && (
            <div className="inline-flex items-center gap-1.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded px-2 py-1">
              <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <input
                type="date"
                value={fromDate}
                max={toDate}
                onChange={(e) => onChangeCustomRange(e.target.value, toDate)}
                className="bg-transparent text-[11px] font-mono text-slate-800 focus:outline-none"
                aria-label="Data inicial"
              />
              <span className="text-[10px] text-slate-400">até</span>
              <input
                type="date"
                value={toDate}
                min={fromDate}
                onChange={(e) => onChangeCustomRange(fromDate, e.target.value)}
                className="bg-transparent text-[11px] font-mono text-slate-800 focus:outline-none"
                aria-label="Data final"
              />
            </div>
          )}
        </div>

        {/* Controles à direita: Loja + Cache + Atualizar */}
        <div className="flex flex-wrap items-center gap-2">
          {stores.length > 0 && (
            <div className="inline-flex items-center gap-1.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded px-2 py-1">
              <Store className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <select
                value={selectedStore}
                onChange={(e) => onChangeStore(e.target.value)}
                className="bg-transparent text-[11px] font-medium text-slate-700 focus:outline-none pr-1"
                aria-label="Filtrar por loja"
              >
                <option value="all">Todas as contas ({stores.length})</option>
                {stores.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          )}

          {cacheInfo && (
            <span
              title={`Dados em cache econômico (TTL ${cacheInfo.ttlMinutes} min) para preservar limites de uso do Supabase e Vercel. Clique em Atualizar para consultar ao vivo.`}
              className="hidden sm:inline-flex items-center gap-1.5 px-2 py-1 rounded bg-[#F8FAFC] border border-[#E2E8F0] text-[10px] text-slate-500 font-mono"
            >
              <Database className="w-3 h-3 text-emerald-600" />
              <span>
                {cacheInfo.source === "fresh" ? "Sincronizado" : "Cache"} às{" "}
                {formatTimeBr(cacheInfo.generatedAt)}
              </span>
            </span>
          )}

          <button
            type="button"
            onClick={onForceRefresh}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded text-[11px] font-semibold bg-white border border-[#E2E8F0] text-slate-700 hover:bg-[#F8FAFC] hover:border-slate-300 disabled:opacity-50 transition-colors"
            title="Ignorar cache e atualizar dados agora"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-sky-600 ${loading ? "animate-spin" : ""}`} />
            <span>Atualizar</span>
          </button>
        </div>
      </div>

      {/* Linha discreta de contexto de comparação */}
      {prevFromDate && prevToDate && (
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 text-[11px] text-slate-500">
          <div className="flex items-center gap-2">
            <span>
              Período atual:{" "}
              <strong className="font-mono text-slate-700">
                {formatBrDateShort(fromDate)} – {formatBrDateShort(toDate)}
              </strong>
            </span>
            <span className="text-slate-300">•</span>
            <span>
              Comparando com:{" "}
              <strong className="font-mono text-slate-600">
                {formatBrDateShort(prevFromDate)} – {formatBrDateShort(prevToDate)}
              </strong>
            </span>
          </div>
          <span className="text-[10px] text-slate-400">
            Modo econômico ativo: cache de 30 min (BD) / 60 min (API ML)
          </span>
        </div>
      )}
    </div>
  );
}
