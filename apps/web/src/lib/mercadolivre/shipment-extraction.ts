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

export interface RawShipmentSubstatusHistoryEntry {
  status?: string | null;
  substatus?: string | null;
  date?: string | null;
}

export interface RawShipmentDetail {
  id: number;
  order_id?: number | null;
  status?: string;
  substatus?: string | null;
  date_created?: string | null;
  last_updated?: string | null;
  shipped_date?: string | null;
  date_shipped?: string | null;
  tracking_number?: string | null;
  logistic_type?: string | null;
  logistic?: {
    type?: string | null;
    mode?: string | null;
    direction?: string | null;
  } | null;
  status_history?: RawShipmentStatusHistory | null;
  substatus_history?: RawShipmentSubstatusHistoryEntry[] | null;
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
  date?: string | null;
  code?: string | null;
  event_name?: string | null;
  status?: string | null;
  substatus?: string | null;
}

export interface RawShipmentHistoryEntry {
  status?: string | null;
  substatus?: string | null;
  date?: string | null;
  date_created?: string | null;
  event_date?: string | null;
}

/**
 * Substatus do Mercado Envios que comprovam a postagem/coleta física do pacote pelo vendedor.
 * Na modalidade Agência ML (`xd_drop_off`) e Coleta (`cross_docking`), o shipment permanece em
 * `status: "ready_to_ship"` com `substatus: "dropped_off"` / `"picked_up"` / `"in_hub"` até o ML
 * expedir do centro de distribuição (quando só então muda para `status: "shipped"`, 1–3 dias depois).
 */
export const DISPATCHED_SHIPMENT_SUBSTATUSES: ReadonlySet<string> = new Set([
  "dropped_off",
  "picked_up",
  "picked_up_by_carrier",
  "in_hub",
  "hub_in",
  "hub_out",
  "on_route_to_hub",
  "in_cross_docking",
  "sorting",
  "in_packing_list",
  "waiting_for_handover",
  "out_for_delivery",
  "at_customs",
  "soon_deliver",
  "waiting_for_withdrawal",
  "arrived_at_agency",
  "in_warehouse",
  "forwarded_to_third",
  "delivered",
  "returned",
  "returning_to_sender",
]);

export function isDispatchedShipmentSubstatus(substatus?: string | null): boolean {
  if (!substatus || typeof substatus !== "string") return false;
  return DISPATCHED_SHIPMENT_SUBSTATUSES.has(substatus.trim().toLowerCase());
}

export function isValidIsoTimestamp(val?: string | null): val is string {
  if (!val || typeof val !== "string") return false;
  return !Number.isNaN(Date.parse(val));
}

/**
 * Detecta se um timestamp salvo anteriormente corresponde exatamente ao meio-dia de Brasília (`15:00:00.000Z`)
 * gerado por `normalizeManualShippedAtInput("YYYY-MM-DD")`, protegendo marcações manuais legadas.
 */
export function isLegacyManualNoonTimestamp(val?: string | null): boolean {
  if (!isValidIsoTimestamp(val)) return false;
  const d = new Date(val);
  return (
    d.getUTCHours() === 15 &&
    d.getUTCMinutes() === 0 &&
    d.getUTCSeconds() === 0 &&
    d.getUTCMilliseconds() === 0
  );
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
 * combinando `/shipments/{id}` (`x-format-new` + schema clássico `status_history`),
 * `/shipments/{id}/history` (e `/marketplace/shipments/{id}/history`) e `/shipments/{id}/tracking/timeline`.
 *
 * Regra estrita de negócio:
 * - Prioriza sempre o primeiro marco físico de postagem/bipagem (`dropped_off` / `picked_up` / `in_hub`),
 *   com fallback para a transição `shipped` / `date_shipped`.
 * - Pedidos ainda em `pending`, `handling` ou `ready_to_ship` sem substatus de postagem retornam `shippedAt: null`
 *   (etiqueta impressa/pronta NÃO conta como enviado).
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
    modernDetail?.shipped_date ||
    classicDetail?.shipped_date ||
    modernDetail?.date_shipped ||
    classicDetail?.date_shipped ||
    null;

  const substatusHistoryEntries: RawShipmentSubstatusHistoryEntry[] = [
    ...(Array.isArray(modernDetail?.substatus_history) ? modernDetail.substatus_history : []),
    ...(Array.isArray(classicDetail?.substatus_history) ? classicDetail.substatus_history : []),
  ];

  const substatusShipped =
    substatusHistoryEntries.length > 0
      ? pickEarliestIso(
          substatusHistoryEntries
            .filter((entry) => {
              const st = (entry?.status || "").toLowerCase();
              return (
                isDispatchedShipmentSubstatus(entry?.substatus) ||
                st === "shipped" ||
                st === "in_transit"
              );
            })
            .map((entry) => entry.date)
        )
      : null;

  const directDelivered =
    modernDetail?.status_history?.date_delivered ||
    classicDetail?.status_history?.date_delivered ||
    null;

  const historySubstatusDispatched = Array.isArray(historyEntries)
    ? pickEarliestIso(
        historyEntries
          .filter((h) => isDispatchedShipmentSubstatus(h?.substatus))
          .map((h) => h.date || h.date_created || h.event_date)
      )
    : null;

  const historyStatusShipped = Array.isArray(historyEntries)
    ? pickEarliestIso(
        historyEntries
          .filter((h) => {
            const st = (h?.status || "").toLowerCase();
            return st === "shipped" || st === "in_transit";
          })
          .map((h) => h.date || h.date_created || h.event_date)
      )
    : null;

  const historyDelivered = Array.isArray(historyEntries)
    ? pickEarliestIso(
        historyEntries
          .filter(
            (h) =>
              (h?.status || "").toLowerCase() === "delivered" ||
              (h?.substatus || "").toLowerCase() === "delivered"
          )
          .map((h) => h.date || h.date_created || h.event_date)
      )
    : null;

  const timelineShipped = Array.isArray(timelineEvents)
    ? pickEarliestIso(
        timelineEvents
          .filter((ev) => {
            const name = (ev?.event_name || ev?.code || "").toLowerCase();
            const st = (ev?.status || "").toLowerCase();
            return (
              isDispatchedShipmentSubstatus(name) ||
              isDispatchedShipmentSubstatus(ev?.substatus) ||
              name === "shipped" ||
              name === "in_transit" ||
              st === "shipped" ||
              st === "in_transit"
            );
          })
          .map((ev) => ev.event_date || ev.date)
      )
    : null;

  const timelineDelivered = Array.isArray(timelineEvents)
    ? pickEarliestIso(
        timelineEvents
          .filter((ev) => {
            const name = (ev?.event_name || ev?.code || "").toLowerCase();
            const st = (ev?.status || "").toLowerCase();
            return name === "delivered" || st === "delivered";
          })
          .map((ev) => ev.event_date || ev.date)
      )
    : null;

  const deliveredAt = isValidIsoTimestamp(directDelivered)
    ? directDelivered
    : historyDelivered || timelineDelivered || null;

  // Prioridade máxima para o primeiro evento de postagem/coleta física (dropped_off / picked_up / in_hub),
  // seguido da transição formal `shipped` / `date_shipped`.
  let shippedAt =
    pickEarliestIso([substatusShipped, historySubstatusDispatched]) ||
    pickEarliestIso([directShipped, historyStatusShipped, timelineShipped]) ||
    null;

  // Fallback seguro EXCLUSIVO para envios comprovadamente já despachados/em trânsito/entregues
  // quando a API do ML omitir os sub-recursos de histórico (ex.: Flex, Full, ME1 ou escopo restrito).
  const effectiveStatus = (modernDetail?.status || classicDetail?.status || "").toLowerCase();
  const effectiveSubstatus = modernDetail?.substatus || classicDetail?.substatus || null;
  const firstVisit =
    classicDetail?.status_history?.date_first_visit ||
    modernDetail?.status_history?.date_first_visit ||
    null;
  const lastUpdated =
    modernDetail?.last_updated ||
    classicDetail?.last_updated ||
    null;

  if (!shippedAt) {
    if (effectiveStatus === "delivered") {
      shippedAt = isValidIsoTimestamp(firstVisit)
        ? firstVisit
        : deliveredAt || (isValidIsoTimestamp(lastUpdated) ? lastUpdated : null);
    } else if (
      effectiveStatus === "shipped" ||
      effectiveStatus === "not_delivered" ||
      isDispatchedShipmentSubstatus(effectiveSubstatus)
    ) {
      shippedAt = isValidIsoTimestamp(firstVisit)
        ? firstVisit
        : isValidIsoTimestamp(lastUpdated)
        ? lastUpdated
        : null;
    }
  }

  const normalizedDeliveredAt =
    deliveredAt ||
    (effectiveStatus === "delivered" && isValidIsoTimestamp(lastUpdated) ? lastUpdated : null);

  return {
    shippedAt,
    deliveredAt: normalizedDeliveredAt,
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
