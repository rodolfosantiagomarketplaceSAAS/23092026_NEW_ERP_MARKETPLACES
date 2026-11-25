import type { SalesAnalysisMode } from "../../types/ml-sales";

export const SHIPPING_LOOKBACK_DAYS = 14;

export interface RawShipmentStatusHistory {
  date_handling?: string | null;
  date_ready_to_ship?: string | null;
  date_shipped?: string | null;
  date_delivered?: string | null;
  date_first_visit?: string | null;
  date_not_delivered?: string | null;
  date_returned?: string | null;
  date_cancelled?: string | null;
}

export interface RawShipmentDetail {
  id: number;
  order_id?: number | null;
  status?: string;
  substatus?: string;
  date_created?: string | null;
  last_updated?: string | null;
  logistic_type?: string | null;
  logistic?: {
    type?: string | null;
    mode?: string | null;
  } | null;
  status_history?: RawShipmentStatusHistory | null;
  shipping_option?: {
    list_cost?: number;
    cost?: number;
    estimated_handling_limit?: {
      date?: string | null;
    };
  };
  lead_time?: {
    list_cost?: number;
    cost?: number;
    buffering?: {
      date?: string | null;
    };
    estimated_schedule_limit?: {
      date?: string | null;
    };
    estimated_handling_limit?: {
      date?: string | null;
    };
  };
}

export interface RawShipmentTimelineEvent {
  event_date?: string | null;
  code?: string | null;
  event_name?: string | null;
}

export interface RawShipmentHistoryEntry {
  status?: string | null;
  substatus?: string | null;
  date?: string | null;
  date_created?: string | null;
}

export function isValidIsoTimestamp(val?: string | null): val is string {
  if (!val || typeof val !== "string") return false;
  return !Number.isNaN(Date.parse(val));
}

function pickEarliestIso(candidates: Array<string | null | undefined>): string | null {
  const valid = candidates.filter(isValidIsoTimestamp);
  if (valid.length === 0) return null;
  valid.sort((a, b) => Date.parse(a) - Date.parse(b));
  return valid[0];
}

/**
 * Resolve de forma determinística a data real de postagem/coleta (`shippedAt`),
 * a data de entrega (`deliveredAt`) e a modalidade logística (`logisticType`)
 * combinando `/shipments/{id}` (`x-format-new` + schema padrão `status_history`),
 * `/shipments/{id}/history` e `/shipments/{id}/tracking/timeline`.
 *
 * Regra estrita de negócio:
 * - Pedidos ainda em `pending`, `handling` ou `ready_to_ship` retornam `shippedAt: null`
 *   (etiqueta gerada NÃO conta como enviado — apenas a entrada real em trânsito/despacho).
 */
export function extractShipmentDatesAndLogistics(params: {
  modernDetail?: RawShipmentDetail | null;
  classicDetail?: RawShipmentDetail | null;
  historyEntries?: RawShipmentHistoryEntry[] | null;
  timelineEvents?: RawShipmentTimelineEvent[] | null;
}): {
  shippedAt: string | null;
  deliveredAt: string | null;
  logisticType: string | null;
} {
  const { modernDetail, classicDetail, historyEntries, timelineEvents } = params;

  const logisticType =
    modernDetail?.logistic?.type ||
    classicDetail?.logistic_type ||
    modernDetail?.logistic_type ||
    classicDetail?.logistic?.type ||
    modernDetail?.logistic?.mode ||
    null;

  const directShipped =
    modernDetail?.status_history?.date_shipped ||
    classicDetail?.status_history?.date_shipped ||
    null;

  const directDelivered =
    modernDetail?.status_history?.date_delivered ||
    classicDetail?.status_history?.date_delivered ||
    null;

  const historyShipped = Array.isArray(historyEntries)
    ? pickEarliestIso(
        historyEntries
          .filter((h) => {
            const st = (h?.status || "").toLowerCase();
            return st === "shipped" || st === "in_transit";
          })
          .map((h) => h.date || h.date_created)
      )
    : null;

  const historyDelivered = Array.isArray(historyEntries)
    ? pickEarliestIso(
        historyEntries
          .filter((h) => (h?.status || "").toLowerCase() === "delivered")
          .map((h) => h.date || h.date_created)
      )
    : null;

  const timelineShipped = Array.isArray(timelineEvents)
    ? pickEarliestIso(
        timelineEvents
          .filter((ev) => {
            const name = (ev?.event_name || "").toLowerCase();
            return (
              name === "shipped" ||
              name === "in_transit" ||
              name === "picked_up" ||
              name === "dropped_off" ||
              name === "hub_in"
            );
          })
          .map((ev) => ev.event_date)
      )
    : null;

  const timelineDelivered = Array.isArray(timelineEvents)
    ? pickEarliestIso(
        timelineEvents
          .filter((ev) => (ev?.event_name || "").toLowerCase() === "delivered")
          .map((ev) => ev.event_date)
      )
    : null;

  const deliveredAt = isValidIsoTimestamp(directDelivered)
    ? directDelivered
    : historyDelivered || timelineDelivered || null;

  let shippedAt = isValidIsoTimestamp(directShipped)
    ? directShipped
    : historyShipped || timelineShipped || null;

  // Fallback exclusivo para envios comprovadamente já entregues (ex: Flex/ME1 direto para delivered sem checkpoint intermediário)
  const effectiveStatus = (modernDetail?.status || classicDetail?.status || "").toLowerCase();
  if (!shippedAt && effectiveStatus === "delivered") {
    const firstVisit =
      classicDetail?.status_history?.date_first_visit ||
      modernDetail?.status_history?.date_first_visit ||
      null;
    shippedAt = isValidIsoTimestamp(firstVisit) ? firstVisit : deliveredAt;
  }

  return {
    shippedAt,
    deliveredAt,
    logisticType: logisticType ? String(logisticType).toLowerCase() : null,
  };
}

/**
 * Calcula o intervalo ISO de busca em `GET /orders/search`, aplicando lookback automático
 * quando `analysisMode === "shipping_date"` para capturar pedidos comprados dias antes
 * (ex: sexta-feira/fim de semana ou prazo de produção) e despachados dentro do filtro `[from, to]`.
 */
export function normalizeSyncIsoRange(
  fromInput: string,
  toInput: string,
  analysisMode: SalesAnalysisMode = "order_date",
  lookbackDays = SHIPPING_LOOKBACK_DAYS
): { isoStart: string; isoEnd: string } {
  const fromTrim = fromInput.trim();
  const toTrim = toInput.trim();

  let startMs: number;
  if (fromTrim.length === 10) {
    startMs = Date.parse(`${fromTrim}T00:00:00.000-03:00`);
  } else {
    startMs = Date.parse(fromTrim);
  }

  if (analysisMode === "shipping_date" && lookbackDays > 0 && Number.isFinite(startMs)) {
    startMs -= lookbackDays * 24 * 60 * 60 * 1000;
  }

  const isoStart =
    analysisMode === "shipping_date" && Number.isFinite(startMs)
      ? new Date(startMs).toISOString()
      : fromTrim.length === 10
      ? `${fromTrim}T00:00:00.000-03:00`
      : new Date(fromTrim).toISOString();

  const isoEnd =
    toTrim.length === 10 ? `${toTrim}T23:59:59.999-03:00` : new Date(toTrim).toISOString();

  return { isoStart, isoEnd };
}

/**
 * Normaliza uma data manual informada pelo gestor ("YYYY-MM-DD", "YYYY-MM-DDTHH:mm" ou ISO completo)
 * para ISO-8601 estrito no fuso de Brasília (-03:00), evitando deslocamento de dia na virada UTC.
 */
export function normalizeManualShippedAtInput(rawInput?: string | null): string | null {
  if (!rawInput) return null;
  const trimmed = rawInput.trim();
  if (!trimmed) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return new Date(`${trimmed}T12:00:00.000-03:00`).toISOString();
  }

  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(trimmed)) {
    return new Date(`${trimmed}:00.000-03:00`).toISOString();
  }

  const parsed = Date.parse(trimmed);
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed).toISOString();
}

/**
 * Divide intervalos longos (ex: filtro por Ano completo ou "Todas as Vendas") em janelas de até 31 dias
 * ordenadas da mais recente para a mais antiga, respeitando boas práticas da API `/orders/search` do ML
 * (evita degradação e limites de paginação profunda de offset > 10.000).
 */
export function splitIsoRangeIntoMonthlyWindows(
  isoStart: string,
  isoEnd: string,
  maxWindows = 13
): Array<{ isoStart: string; isoEnd: string }> {
  const startMs = Date.parse(isoStart);
  const endMs = Date.parse(isoEnd);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs > endMs) {
    return [{ isoStart, isoEnd }];
  }

  const THIRTY_ONE_DAYS_MS = 31 * 24 * 60 * 60 * 1000;
  if (endMs - startMs <= THIRTY_ONE_DAYS_MS) {
    return [{ isoStart, isoEnd }];
  }

  const windows: Array<{ isoStart: string; isoEnd: string }> = [];
  let cursorEnd = endMs;

  while (cursorEnd >= startMs && windows.length < maxWindows) {
    const windowStart = Math.max(startMs, cursorEnd - THIRTY_ONE_DAYS_MS + 1);
    windows.push({
      isoStart: new Date(windowStart).toISOString(),
      isoEnd: new Date(cursorEnd).toISOString(),
    });
    if (windowStart <= startMs) break;
    cursorEnd = windowStart - 1;
  }

  return windows;
}
