import { standardDeviation, StockScoreInput } from './scoring';

export interface DailyPoint {
  date: string;
  close: number;
}

export interface StockDetailData {
  ticker: string;
  companyName: string;
  currentPrice: number;
  return1M: number;
  return6M: number;
  volatility3M: number;
  momentum: number;
  valueProxy?: number | null;
  chartPoints: DailyPoint[];
  rawDailyUrl: string;
}

const ALPHA_BASE_URL = 'https://www.alphavantage.co/query';
const CACHE_TTL_MS = 10 * 60 * 1000;

type CacheEntry<T> = {
  expiresAt: number;
  value: T;
};

const memoryCache = new Map<string, CacheEntry<unknown>>();

export const STOCK_UNIVERSE: string[] = [
  'AAPL','MSFT','AMZN','GOOGL','META','NVDA','JPM','XOM','JNJ','V',
  'MA','PG','KO','PEP','HD','COST','WMT','DIS','NFLX','BAC',
  'AVGO','TSLA','PFE','CSCO','ADBE','CRM','CMCSA','ABT','MRK','CVX',
  'INTC','TMO','ORCL','NKE','MCD','DHR','LLY','TXN','AMAT','UPS',
  'UNH','QCOM','LOW','IBM','CAT','GE','GS','SPGI','RTX','BKNG'
];

const COMPANY_NAMES: Record<string, string> = {
  AAPL: 'Apple Inc.', MSFT: 'Microsoft Corp.', AMZN: 'Amazon.com Inc.', GOOGL: 'Alphabet Inc.', META: 'Meta Platforms Inc.',
  NVDA: 'NVIDIA Corp.', JPM: 'JPMorgan Chase & Co.', XOM: 'Exxon Mobil Corp.', JNJ: 'Johnson & Johnson', V: 'Visa Inc.',
  MA: 'Mastercard Inc.', PG: 'Procter & Gamble Co.', KO: 'Coca-Cola Co.', PEP: 'PepsiCo Inc.', HD: 'Home Depot Inc.',
  COST: 'Costco Wholesale Corp.', WMT: 'Walmart Inc.', DIS: 'Walt Disney Co.', NFLX: 'Netflix Inc.', BAC: 'Bank of America Corp.',
  AVGO: 'Broadcom Inc.', TSLA: 'Tesla Inc.', PFE: 'Pfizer Inc.', CSCO: 'Cisco Systems Inc.', ADBE: 'Adobe Inc.',
  CRM: 'Salesforce Inc.', CMCSA: 'Comcast Corp.', ABT: 'Abbott Laboratories', MRK: 'Merck & Co.', CVX: 'Chevron Corp.',
  INTC: 'Intel Corp.', TMO: 'Thermo Fisher Scientific Inc.', ORCL: 'Oracle Corp.', NKE: 'Nike Inc.', MCD: 'McDonald\'s Corp.',
  DHR: 'Danaher Corp.', LLY: 'Eli Lilly and Co.', TXN: 'Texas Instruments Inc.', AMAT: 'Applied Materials Inc.', UPS: 'United Parcel Service Inc.',
  UNH: 'UnitedHealth Group Inc.', QCOM: 'QUALCOMM Inc.', LOW: 'Lowe\'s Companies Inc.', IBM: 'International Business Machines Corp.', CAT: 'Caterpillar Inc.',
  GE: 'GE Aerospace', GS: 'Goldman Sachs Group Inc.', SPGI: 'S&P Global Inc.', RTX: 'RTX Corp.', BKNG: 'Booking Holdings Inc.'
};

function getFromCache<T>(key: string): T | undefined {
  const hit = memoryCache.get(key);
  if (!hit) return undefined;
  if (hit.expiresAt < Date.now()) {
    memoryCache.delete(key);
    return undefined;
  }
  return hit.value as T;
}

function setInCache<T>(key: string, value: T): void {
  memoryCache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

export function getAlphaVantageDailyUrl(ticker: string, apiKey: string): string {
  return `${ALPHA_BASE_URL}?function=TIME_SERIES_DAILY_ADJUSTED&symbol=${ticker}&outputsize=full&apikey=${apiKey}`;
}

async function fetchWithCache<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const cached = getFromCache<T>(key);
  if (cached) return cached;
  const value = await fetcher();
  setInCache(key, value);
  return value;
}

function parseDailySeries(payload: any): DailyPoint[] {
  const series = payload['Time Series (Daily)'];
  if (!series) {
    const message = payload['Note'] || payload['Information'] || 'Market data is unavailable right now.';
    throw new Error(message);
  }

  return Object.entries(series)
    .map(([date, candle]) => ({
      date,
      close: Number((candle as Record<string, string>)['4. close'])
    }))
    .filter((point) => Number.isFinite(point.close))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function pickClosestPoint(points: DailyPoint[], daysBack: number): DailyPoint | undefined {
  const target = new Date();
  target.setDate(target.getDate() - daysBack);

  for (let i = points.length - 1; i >= 0; i -= 1) {
    const pointDate = new Date(points[i].date);
    if (pointDate <= target) return points[i];
  }
  return points[0];
}

function dailyReturns(points: DailyPoint[]): number[] {
  const returns: number[] = [];
  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1].close;
    const curr = points[i].close;
    if (prev > 0) returns.push(curr / prev - 1);
  }
  return returns;
}

export function buildScoreInput(ticker: string, companyName: string, points: DailyPoint[]): StockScoreInput {
  if (points.length < 130) {
    throw new Error(`Not enough data points for ${ticker}.`);
  }

  const latest = points[points.length - 1].close;
  const point1M = pickClosestPoint(points, 30);
  const point6M = pickClosestPoint(points, 182);
  const window3M = points.slice(-63);
  const returns3M = dailyReturns(window3M);

  if (!point1M || !point6M || !returns3M.length) {
    throw new Error(`Failed to compute metrics for ${ticker}.`);
  }

  const return1M = latest / point1M.close - 1;
  const return6M = latest / point6M.close - 1;
  const volatility3M = standardDeviation(returns3M);

  return {
    ticker,
    companyName,
    price: latest,
    return1M,
    return6M,
    volatility3M,
    valueProxy: null
  };
}

export async function getTickerDailySeries(ticker: string): Promise<{ points: DailyPoint[]; rawDailyUrl: string }> {
  const apiKey = process.env.ALPHAVANTAGE_API_KEY;
  if (!apiKey) {
    throw new Error('Missing ALPHAVANTAGE_API_KEY. Add it to your environment to fetch live market data.');
  }

  const rawDailyUrl = getAlphaVantageDailyUrl(ticker, apiKey);
  const cacheKey = `daily:${ticker}`;

  const payload = await fetchWithCache(cacheKey, async () => {
    const response = await fetch(rawDailyUrl, { next: { revalidate: 600 } });
    if (!response.ok) {
      throw new Error(`Alpha Vantage request failed for ${ticker} (${response.status}).`);
    }
    return response.json();
  });

  return { points: parseDailySeries(payload), rawDailyUrl };
}

export async function getUniverseMetrics(universe: string[]): Promise<{ metrics: StockScoreInput[]; warnings: string[] }> {
  const warnings: string[] = [];
  const metrics: StockScoreInput[] = [];

  for (const ticker of universe) {
    try {
      const { points } = await getTickerDailySeries(ticker);
      metrics.push(buildScoreInput(ticker, COMPANY_NAMES[ticker] || ticker, points));
    } catch (error) {
      warnings.push(`${ticker}: ${(error as Error).message}`);
    }
  }

  return { metrics, warnings };
}

export async function getStockDetail(ticker: string): Promise<StockDetailData> {
  const symbol = ticker.toUpperCase();
  const { points, rawDailyUrl } = await getTickerDailySeries(symbol);
  const metrics = buildScoreInput(symbol, COMPANY_NAMES[symbol] || symbol, points);
  const chartPoints = points.slice(-126);

  return {
    ticker: symbol,
    companyName: metrics.companyName,
    currentPrice: metrics.price,
    return1M: metrics.return1M,
    return6M: metrics.return6M,
    volatility3M: metrics.volatility3M,
    momentum: metrics.return6M * 0.6 + metrics.return1M * 0.4,
    valueProxy: null,
    chartPoints,
    rawDailyUrl
  };
}
