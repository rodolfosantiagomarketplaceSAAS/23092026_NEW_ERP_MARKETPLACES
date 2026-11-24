"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { computeDatePresetRange } from "@/components/vendas/formatters";

const AUTOSYNC_STORAGE_KEY = "crm_ml_sales_last_autosync_ms";
const AUTOSYNC_COOLDOWN_MS = 10 * 60 * 1000; // 10 minutos — 100% seguro para Vercel & Supabase Free
let globalAutoSyncInFlight = false;

export function markSalesSyncedNow(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(AUTOSYNC_STORAGE_KEY, String(Date.now()));
  } catch {
    // Ignora caso storage esteja indisponível
  }
}

function shouldRunAutoSync(): boolean {
  if (typeof window === "undefined" || globalAutoSyncInFlight) return false;
  try {
    const raw = window.localStorage.getItem(AUTOSYNC_STORAGE_KEY);
    const lastMs = raw ? Number(raw) : 0;
    if (Number.isFinite(lastMs) && Date.now() - lastMs < AUTOSYNC_COOLDOWN_MS) {
      return false;
    }
    return true;
  } catch {
    return true;
  }
}

interface UseRealtimeSalesOrdersOptions {
  /** Chamado com debounce quando vendas entram ou mudam no Supabase Realtime */
  onSalesChange: () => void;
  /** Ativa auto-sync silencioso em background (a cada >= 10 min) quando há conta ML conectada */
  enableAutoSync?: boolean;
  onAutoSyncComplete?: (ordersUpserted: number) => void;
}

export function useRealtimeSalesOrders({
  onSalesChange,
  enableAutoSync = false,
  onAutoSyncComplete,
}: UseRealtimeSalesOrdersOptions) {
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const [autoSyncing, setAutoSyncing] = useState(false);
  const [lastLiveUpdateAt, setLastLiveUpdateAt] = useState<string | null>(null);

  const onSalesChangeRef = useRef(onSalesChange);
  onSalesChangeRef.current = onSalesChange;

  const onAutoSyncCompleteRef = useRef(onAutoSyncComplete);
  onAutoSyncCompleteRef.current = onAutoSyncComplete;

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleRefresh = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setLastLiveUpdateAt(
        new Date().toLocaleTimeString("pt-BR", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })
      );
      onSalesChangeRef.current();
    }, 450);
  }, []);

  // 1. Canal Supabase Realtime em `public.ml_sales_orders`
  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    const channelName = `realtime-ml-sales-${Math.random().toString(36).slice(2, 8)}`;

    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "ml_sales_orders",
        },
        () => {
          scheduleRefresh();
        }
      )
      .subscribe((status) => {
        setRealtimeConnected(status === "SUBSCRIBED");
      });

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      supabase.removeChannel(channel);
    };
  }, [scheduleRefresh]);

  // 2. Auto-sync leve com cooldown de 10 min (cobre ontem + hoje caso algum webhook atrase)
  const triggerSilentAutoSync = useCallback(async () => {
    if (!enableAutoSync || !shouldRunAutoSync()) return;

    globalAutoSyncInFlight = true;
    markSalesSyncedNow();
    setAutoSyncing(true);

    try {
      const yesterdayRange = computeDatePresetRange("yesterday");
      const todayRange = computeDatePresetRange("today");

      const res = await fetch("/api/ml/sales/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          from: yesterdayRange.from,
          to: todayRange.to,
        }),
      });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.success) {
        const upserted = Number(json.ordersUpserted ?? 0);
        setLastLiveUpdateAt(
          new Date().toLocaleTimeString("pt-BR", {
            hour: "2-digit",
            minute: "2-digit",
          })
        );
        if (onAutoSyncCompleteRef.current) {
          onAutoSyncCompleteRef.current(upserted);
        } else if (upserted > 0) {
          onSalesChangeRef.current();
        }
      }
    } catch {
      // Silencioso para nunca interromper a navegação do operador
    } finally {
      globalAutoSyncInFlight = false;
      setAutoSyncing(false);
    }
  }, [enableAutoSync]);

  useEffect(() => {
    if (!enableAutoSync) return;

    triggerSilentAutoSync();

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        triggerSilentAutoSync();
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [enableAutoSync, triggerSilentAutoSync]);

  return {
    realtimeConnected,
    autoSyncing,
    lastLiveUpdateAt,
  };
}
