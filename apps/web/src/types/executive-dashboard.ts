export type DashboardPeriodPreset =
  | "today"
  | "last7"
  | "last15"
  | "last30"
  | "thisMonth"
  | "custom";

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
  dailySeries: DailyEvolutionPoint[];
  topProductsByRevenue: PortfolioProductRow[];
  topProductsByProfit: PortfolioProductRow[];
  decliningProducts: PortfolioProductRow[];
  actionRadar: ActionRadarPayload;
}
