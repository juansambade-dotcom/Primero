import Head from 'next/head';
import Link from 'next/link';
import { GetServerSideProps } from 'next';
import { getUniverseMetrics, STOCK_UNIVERSE } from '../lib/api';
import { RiskLevel, scoreStocks } from '../lib/scoring';

type HomeProps = {
  riskLevel: RiskLevel;
  rows: ReturnType<typeof scoreStocks>;
  warnings: string[];
  error?: string;
};

const riskOptions: RiskLevel[] = ['low', 'med', 'high'];

function formatPct(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

export default function Home({ riskLevel, rows, warnings, error }: HomeProps) {
  const selectedIndex = riskOptions.indexOf(riskLevel);

  return (
    <>
      <Head>
        <title>Stock Picks Today</title>
      </Head>
      <main className="mx-auto max-w-7xl p-6">
        <div className="mb-6 rounded-lg border border-amber-400 bg-amber-50 p-4 text-center text-lg font-bold text-amber-900">
          Educational only. Not investment advice.
        </div>

        <section className="mb-6 rounded-lg border border-slate-700 bg-slate-900 p-4">
          <h1 className="mb-3 text-3xl font-semibold">Stock Picks Today</h1>
          <p className="mb-4 text-sm text-slate-300">
            We rank stocks from a fixed US large-cap universe using a transparent formula: Momentum = (6M return × 0.6) + (1M return × 0.4). Overall score = momentum z-score − (volatility z-score × risk factor), where risk factor is Low=1.2, Med=0.8, High=0.4.
          </p>
          <form className="flex flex-col gap-3 sm:flex-row sm:items-end" method="get">
            <label className="block flex-1">
              <span className="mb-1 block text-sm font-medium">Risk preference</span>
              <input
                className="w-full"
                name="riskIdx"
                type="range"
                min={0}
                max={2}
                defaultValue={selectedIndex}
              />
              <div className="mt-1 text-sm text-slate-300">Selected: {riskLevel.toUpperCase()}</div>
            </label>
            <button className="rounded bg-sky-500 px-4 py-2 font-medium text-white hover:bg-sky-400" type="submit">
              Apply / Refresh
            </button>
          </form>
        </section>

        {error ? <div className="mb-4 rounded border border-rose-700 bg-rose-950 p-3 text-rose-100">{error}</div> : null}

        {warnings.length ? (
          <div className="mb-4 rounded border border-yellow-700 bg-yellow-950 p-3 text-yellow-100">
            Some tickers were skipped due to API limits or temporary data issues:
            <ul className="mt-2 list-inside list-disc text-sm">
              {warnings.slice(0, 8).map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="overflow-x-auto rounded-lg border border-slate-700">
          <table className="min-w-full divide-y divide-slate-700 text-sm">
            <thead className="bg-slate-900">
              <tr>
                {['Ticker', 'Company', 'Price', '1M Return', '6M Return', 'Volatility (3M)', 'Momentum', 'Value Proxy', 'Overall Score'].map((col) => (
                  <th key={col} className="px-3 py-2 text-left font-semibold text-slate-200">{col}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 bg-slate-950">
              {rows.map((stock) => (
                <tr key={stock.ticker} className="hover:bg-slate-900/80">
                  <td className="px-3 py-2 font-medium text-sky-300">
                    <Link href={`/stock/${stock.ticker}`}>{stock.ticker}</Link>
                  </td>
                  <td className="px-3 py-2">{stock.companyName}</td>
                  <td className="px-3 py-2">${stock.price.toFixed(2)}</td>
                  <td className="px-3 py-2">{formatPct(stock.return1M)}</td>
                  <td className="px-3 py-2">{formatPct(stock.return6M)}</td>
                  <td className="px-3 py-2">{formatPct(stock.volatility3M)}</td>
                  <td className="px-3 py-2">{stock.momentum.toFixed(4)}</td>
                  <td className="px-3 py-2">{stock.valueProxy ?? 'N/A'}</td>
                  <td className="px-3 py-2 font-semibold">{stock.overallScore.toFixed(3)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<HomeProps> = async ({ query }) => {
  const riskIdx = Number(query.riskIdx);
  const riskLevel: RiskLevel = riskOptions[Number.isFinite(riskIdx) ? Math.min(2, Math.max(0, riskIdx)) : 1];

  try {
    const { metrics, warnings } = await getUniverseMetrics(STOCK_UNIVERSE);
    if (!metrics.length) {
      return {
        props: {
          riskLevel,
          rows: [],
          warnings,
          error: 'Unable to load stock data right now. Please try again later.'
        }
      };
    }

    const rows = scoreStocks(metrics, riskLevel).slice(0, 10);
    return { props: { riskLevel, rows, warnings } };
  } catch (error) {
    return {
      props: {
        riskLevel,
        rows: [],
        warnings: [],
        error: (error as Error).message
      }
    };
  }
};
