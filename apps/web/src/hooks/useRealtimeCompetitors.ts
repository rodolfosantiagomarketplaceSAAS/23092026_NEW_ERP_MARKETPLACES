"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { CompetitorListing } from "@crm/types";

interface UseRealtimeCompetitorsProps {
  onPriceUpdate?: (payload: {
    competitorId: string;
    newPrice: number;
    externalId: string;
    oldPrice?: number;
  }) => void;
  onCompetitorChange?: () => void;
}

export function useRealtimeCompetitors({
  onPriceUpdate,
  onCompetitorChange,
}: UseRealtimeCompetitorsProps = {}) {
  const [lastEventTime, setLastEventTime] = useState<string | null>(null);
  const [highlightedIds, setHighlightedIds] = useState<Record<string, boolean>>({});
  const timeoutRefs = useRef<Record<string, NodeJS.Timeout>>({});

  const triggerHighlight = useCallback((id: string) => {
    // Ativa o destaque
    setHighlightedIds((prev) => ({ ...prev, [id]: true }));

    // Limpa timeout anterior se houver
    if (timeoutRefs.current[id]) {
      clearTimeout(timeoutRefs.current[id]);
    }

    // Remove o destaque após 2.5s (duração da animação CSS)
    timeoutRefs.current[id] = setTimeout(() => {
      setHighlightedIds((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      delete timeoutRefs.current[id];
    }, 2500);
  }, []);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();

    // Cria o canal Realtime para escutar inserções e atualizações em competitor_listings
    const channel = supabase
      .channel("realtime-competitors-channel")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "competitor_listings",
        },
        (payload) => {
          const newRecord = payload.new as CompetitorListing;
          const oldRecord = payload.old as Partial<CompetitorListing>;

          const eventType = payload.eventType; // 'INSERT', 'UPDATE', 'DELETE'

          if (eventType === "INSERT" || eventType === "DELETE") {
            if (onCompetitorChange) {
              onCompetitorChange();
            }
          }

          if (newRecord && newRecord.id) {
            triggerHighlight(newRecord.id);
            setLastEventTime(new Date().toLocaleTimeString("pt-BR"));

            if (onPriceUpdate) {
              onPriceUpdate({
                competitorId: newRecord.id,
                newPrice: Number(newRecord.current_price),
                externalId: newRecord.external_id,
                oldPrice: oldRecord?.current_price ? Number(oldRecord.current_price) : undefined,
              });
            }
          }
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          console.log("[Supabase Realtime] Canal de concorrentes inscrito com sucesso.");
        }
      });

    return () => {
      // Limpeza de canal e timers
      supabase.removeChannel(channel);
      Object.values(timeoutRefs.current).forEach((t) => clearTimeout(t));
    };
  }, [triggerHighlight, onPriceUpdate, onCompetitorChange]);

  return {
    highlightedIds,
    lastEventTime,
    triggerHighlight,
  };
}
