export type DashboardPeriodPreset =
  | "today"
  | "last7"
  | "last15"
  | "last30"
  | "thisMonth"
  | "custom";

export interface KpiMetricWithDelta {
  value: number;
  previousValue: number;
  deltaPct: number | null;
  sparkline: number[];
}

export interface AccountReputationHealth {
  levelId: string | null; // e.g. '5_green', '4_light_green', '3_yellow', '2_orange', '1_red'
  powerSellerStatus: string | null; // 'platinum' | 'gold' | 'silver' | null
  claimsRatePct: number | null;
  claimsCount: number;
  delayedRatePct: number | null;
  delayedCount: number;
  cancellationsRatePct: number | null;
  cancellationsCount: number;
  openClaimsCount: number;
  unansweredQuestionsCount: number;
  overdueQuestionsCount: number; // > 15 min without answer
  accountName: string | null;
  source: "ml_live" | "db_fallback" | "no_account";
  lastSyncedAt: string | null;
}

export interface ExecutiveKpisPayload {
  grossSales: KpiMetricWithDelta & {
    validOrdersCount: number;
    previousValidOrdersCount: number;
    cancelledOrdersCount: number;
    unitsSold: number;
  };
  netProfit: KpiMetricWithDelta & {
    marginPct: number;
    previousMarginPct: number;
    marginDeltaPts: number;
    mlFeesAndShippingTotal: number;
    taxTotal: number;
    operationalCostsTotal: number;
  };
  averageTicket: KpiMetricWithDelta;
  conversionRate: KpiMetricWithDelta & {
    totalVisits: number;
    previousTotalVisits: number;
    visitsSource: "ml_live" | "db_fallback";
  };
  reputation: AccountReputationHealth;
}

export interface DailyEvolutionPoint {
  dateKey: string;
  dateLabel: string;
  grossSales: number;
  netProfit: number;
  ordersCount: number;
  unitsSold: number;
  prevGrossSales: number;
  prevNetProfit: number;
  prevOrdersCount: number;
}

export interface PortfolioProductRow {
  mlbId: string;
  sku: string | null;
  title: string;
  thumbnail: string | null;
  permalink: string | null;
  ordersCount: number;
  unitsSold: number;
  grossSales: number;
  netProfit: number;
  marginPct: number;
  prevUnitsSold: number;
  prevGrossSales: number;
  revenueDeltaPct: number | null;
  unitsDeltaPct: number | null;
  availableQuantity: number | null;
  listingStatus: string | null;
  dailyVelocity: number;
  daysOfStock: number | null;
  diagnosis?: string;
  diagnosisTone?: "danger" | "warning" | "info";
}

export interface StockoutAlertItem {
  mlbId: string;
  sku: string | null;
  title: string;
  thumbnail: string | null;
  permalink: string | null;
  availableQuantity: number;
  dailyVelocity: number;
  daysOfStock: number;
  grossSales: number;
}

export interface CriticalMarginAlertItem {
  mlbId: string;
  sku: string | null;
  title: string;
  thumbnail: string | null;
  permalink: string | null;
  unitsSold: number;
  grossSales: number;
  netProfit: number;
  marginPct: number;
}

export interface ConversionDropAlertItem {
  mlbId: string;
  title: string;
  thumbnail: string | null;
  permalink: string | null;
  visits: number;
  ordersCount: number;
  availableQuantity: number;
}

export interface UrgentShipmentAlertItem {
  mlOrderId: number;
  mlPackId: number | null;
  mlbId: string;
  title: string;
  shippingDeadline: string;
  logisticType: string | null;
  storeName: string;
  isOverdue: boolean;
}

export interface ActionRadarPayload {
  stockoutRisk: StockoutAlertItem[];
  conversionDrop: ConversionDropAlertItem[];
  criticalMargin: CriticalMarginAlertItem[];
  urgentShipments: UrgentShipmentAlertItem[];
  unansweredQuestionsCount: number;
  overdueQuestionsCount: number;
  criticalMarginThresholdPct: number;
}

export interface ExecutiveDashboardResponse {
  success: boolean;
  schemaReady: boolean;
  usedRpc: boolean;
  cacheMeta: {
    hit: boolean;
    generatedAt: string;
    ttlSeconds: number;
    mlCacheTtlSeconds: number;
  };
  period: {
    from: string;
    to: string;
    prevFrom: string;
    prevTo: string;
    daysSpan: number;
  };
  stores: string[];
  selectedStore: string;
  kpis: ExecutiveKpisPayload;
  dailySeries: DailyEvolutionPoint[];
  topProductsByRevenue: PortfolioProductRow[];
  topProductsByProfit: PortfolioProductRow[];
  decliningProducts: PortfolioProductRow[];
  actionRadar: ActionRadarPayload;
}
