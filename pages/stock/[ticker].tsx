import Head from 'next/head';
import Link from 'next/link';
import { GetServerSideProps } from 'next';
import { getStockDetail, StockDetailData } from '../../lib/api';

type Props = {
  data?: StockDetailData;
  error?: string;
};

function MiniChart({ points }: { points: StockDetailData['chartPoints'] }) {
  if (!points.length) return null;
  const min = Math.min(...points.map((p) => p.close));
  const max = Math.max(...points.map((p) => p.close));
  const width = 800;
  const height = 280;

  const line = points
    .map((point, idx) => {
      const x = (idx / (points.length - 1 || 1)) * width;
      const y = height - ((point.close - min) / (max - min || 1)) * height;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <svg className="w-full rounded border border-slate-700 bg-slate-900" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Price chart for last six months">
      <polyline fill="none" stroke="#38bdf8" strokeWidth="3" points={line} />
    </svg>
  );
}

export default function StockDetailPage({ data, error }: Props) {
  return (
    <>
      <Head>
        <title>{data ? `${data.ticker} | Stock Picks Today` : 'Stock Details | Stock Picks Today'}</title>
      </Head>
      <main className="mx-auto max-w-4xl p-6">
        <div className="mb-4 rounded-lg border border-amber-400 bg-amber-50 p-4 text-center text-lg font-bold text-amber-900">
          Educational only. Not investment advice.
        </div>

        <Link href="/" className="mb-4 inline-block text-sky-300 hover:text-sky-200">← Back to rankings</Link>

        {error || !data ? (
          <div className="rounded border border-rose-700 bg-rose-950 p-4 text-rose-100">{error || 'Ticker data unavailable.'}</div>
        ) : (
          <div className="space-y-5">
            <header>
              <h1 className="text-3xl font-semibold">{data.ticker} — {data.companyName}</h1>
              <p className="text-slate-300">Last price: ${data.currentPrice.toFixed(2)}</p>
            </header>

            <section>
              <h2 className="mb-2 text-xl font-semibold">Last 6 months price chart</h2>
              <MiniChart points={data.chartPoints} />
            </section>

            <section className="rounded border border-slate-700 bg-slate-900 p-4">
              <h2 className="mb-2 text-xl font-semibold">Scoring metrics</h2>
              <ul className="space-y-1 text-slate-200">
                <li>1M return: {(data.return1M * 100).toFixed(2)}%</li>
                <li>6M return: {(data.return6M * 100).toFixed(2)}%</li>
                <li>3M volatility (std dev of daily returns): {(data.volatility3M * 100).toFixed(2)}%</li>
                <li>Momentum score: {data.momentum.toFixed(4)}</li>
                <li>Value proxy: {data.valueProxy ?? 'N/A'}</li>
              </ul>
              <p className="mt-3 text-sm text-slate-400">
                Formula reminder: Momentum = (6M × 0.6) + (1M × 0.4). Overall rank on home page adjusts momentum by volatility and selected risk level.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold">Raw API data links</h2>
              <ul className="list-inside list-disc text-sky-300">
                <li><a href={`/api/raw/${data.ticker}`} target="_blank" rel="noreferrer">Server-side proxied TIME_SERIES_DAILY_ADJUSTED JSON</a></li>
                <li><a href={data.rawDailyUrl.replace(/apikey=[^&]+/, 'apikey=YOUR_KEY')} target="_blank" rel="noreferrer">Alpha Vantage endpoint template</a></li>
              </ul>
            </section>
          </div>
        )}
      </main>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<Props> = async ({ params }) => {
  const ticker = String(params?.ticker || '').toUpperCase();
  if (!ticker) return { props: { error: 'No ticker specified.' } };

  try {
    const data = await getStockDetail(ticker);
    return { props: { data } };
  } catch (error) {
    return { props: { error: (error as Error).message } };
  }
};
