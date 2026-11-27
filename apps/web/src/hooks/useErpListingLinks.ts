"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ErpListingLink, ErpProductWithSummary } from "@/types/erp-products";

export function useErpListingLinks() {
  const [schemaReady, setSchemaReady] = useState(true);
  const [links, setLinks] = useState<ErpListingLink[]>([]);
  const [products, setProducts] = useState<ErpProductWithSummary[]>([]);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/erp/listing-links", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      if (data.success) {
        setSchemaReady(Boolean(data.schemaReady));
        setLinks(data.links ?? []);
        setProducts(data.products ?? []);
      }
    } catch {
      // Silencioso para nunca impactar as telas de Anúncios e Vendas
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const linkByExternalId = useMemo(() => {
    const map = new Map<string, ErpListingLink>();
    for (const l of links) {
      map.set(l.external_listing_id.toUpperCase(), l);
    }
    return map;
  }, [links]);

  return {
    schemaReady,
    loaded,
    links,
    products,
    linkByExternalId,
    refresh,
  };
}
