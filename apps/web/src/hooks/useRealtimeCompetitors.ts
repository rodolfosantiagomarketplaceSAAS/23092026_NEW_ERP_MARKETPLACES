"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { CompetitorListing } from "@crm/types";

interface UseRealtimeCompetitorsProps {
  enabled?: boolean;
  onPriceUpdate?: (payload: {
    competitorId: string;
    newPrice: number;
    externalId: string;
    oldPrice?: number;
  }) => void;
  onCompetitorChange?: () => void;
}

export function useRealtimeCompetitors({
  enabled = false,
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
    if (!enabled) {
      return;
    }

    const supabase = getSupabaseBrowserClient();
    let activeChannel: ReturnType<typeof supabase.channel> | null = null;
    let unmounted = false;

    async function subscribeScoped() {
      const {
        data: { user },
      } = await supabase.auth.getUser().catch(() => ({ data: { user: null } }));
      if (unmounted || !user) return;

      activeChannel = supabase
        .channel("realtime-competitors-channel")
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "competitor_listings",
            filter: `user_id=eq.${user.id}`,
          },
          (payload) => {
            const newRecord = payload.new as CompetitorListing;
            const oldRecord = payload.old as Partial<CompetitorListing>;

            const eventType = payload.eventType;

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
        .subscribe();
    }

    subscribeScoped();

    return () => {
      unmounted = true;
      if (activeChannel) {
        supabase.removeChannel(activeChannel);
      }
      Object.values(timeoutRefs.current).forEach((t) => clearTimeout(t));
    };
  }, [enabled, triggerHighlight, onPriceUpdate, onCompetitorChange]);

  return {
    highlightedIds,
    lastEventTime,
    triggerHighlight,
  };
}
