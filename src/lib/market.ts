const SP500_CSV_URL =
  'https://raw.githubusercontent.com/datasets/s-and-p-500-companies/master/data/constituents.csv';
const YAHOO_QUOTE_URL = 'https://query1.finance.yahoo.com/v7/finance/quote?symbols=';
const BATCH_SIZE = 50;

export type StockQuote = {
  symbol: string;
  shortName: string;
  regularMarketPrice: number;
  regularMarketChange: number;
  regularMarketChangePercent: number;
};

function toNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

async function fetchSp500Tickers(): Promise<string[]> {
  const response = await fetch(SP500_CSV_URL, {
    next: { revalidate: 60 * 60 * 24 },
  });

  if (!response.ok) {
    throw new Error('Unable to load S&P 500 constituents list.');
  }

  const csv = await response.text();
  const lines = csv.trim().split('\n');

  return lines
    .slice(1)
    .map((line) => line.split(',')[0]?.replace(/"/g, '').trim())
    .filter((symbol): symbol is string => Boolean(symbol));
}

async function fetchYahooBatch(symbols: string[]): Promise<StockQuote[]> {
  const response = await fetch(`${YAHOO_QUOTE_URL}${symbols.join(',')}`, {
    next: { revalidate: 300 },
  });

  if (!response.ok) {
    throw new Error(`Yahoo Finance request failed with status ${response.status}`);
  }

  const payload = await response.json();
  const result = payload?.quoteResponse?.result;

  if (!Array.isArray(result)) {
    return [];
  }

  return result
    .map((item: Record<string, unknown>) => ({
      symbol: (item.symbol as string) ?? 'N/A',
      shortName: (item.shortName as string) ?? (item.symbol as string) ?? 'Unknown company',
      regularMarketPrice: toNumber(item.regularMarketPrice),
      regularMarketChange: toNumber(item.regularMarketChange),
      regularMarketChangePercent: toNumber(item.regularMarketChangePercent),
    }))
    .filter((item: StockQuote) => item.symbol !== 'N/A');
}

export async function fetchTopSp500Gainers(): Promise<{ data: StockQuote[]; error?: string }> {
  try {
    const tickers = await fetchSp500Tickers();

    const batches: string[][] = [];
    for (let i = 0; i < tickers.length; i += BATCH_SIZE) {
      batches.push(tickers.slice(i, i + BATCH_SIZE));
    }

    const batchResponses = await Promise.allSettled(
      batches.map((batch) => fetchYahooBatch(batch)),
    );

    const fulfilled = batchResponses
      .filter((response): response is PromiseFulfilledResult<StockQuote[]> => response.status === 'fulfilled')
      .flatMap((response) => response.value);

    if (fulfilled.length === 0) {
      return { data: [], error: 'Unable to fetch market data from Yahoo Finance right now.' };
    }

    const top10 = fulfilled
      .filter((item) => Number.isFinite(item.regularMarketChangePercent))
      .sort((a, b) => b.regularMarketChangePercent - a.regularMarketChangePercent)
      .slice(0, 10);

    return { data: top10 };
  } catch (error) {
    console.error('Failed to fetch S&P 500 top gainers:', error);
    return {
      data: [],
      error: 'Unable to load top S&P 500 gainers at the moment. Please try again shortly.',
    };
  }
}
