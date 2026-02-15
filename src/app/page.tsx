import { AutoRefresh } from '@/components/auto-refresh';
import { fetchTopSp500Gainers } from '@/lib/market';

export const revalidate = 300;

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(value);
}

function formatPercent(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}

export default async function Home() {
  const { data, error } = await fetchTopSp500Gainers();

  return (
    <main className="page">
      <section className="container card">
        <header className="header">
          <h1>Top 10 S&amp;P 500 Stocks Today</h1>
          <p>Based on daily % gain — live market data</p>
          <AutoRefresh />
        </header>

        {error ? (
          <div className="errorBox">{error}</div>
        ) : (
          <div className="tableWrap">
            <table>
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Ticker</th>
                  <th>Company</th>
                  <th>Price</th>
                  <th>Change $</th>
                  <th>Change %</th>
                </tr>
              </thead>
              <tbody>
                {data.map((stock, index) => {
                  const positive = stock.regularMarketChange >= 0;
                  return (
                    <tr key={stock.symbol}>
                      <td>#{index + 1}</td>
                      <td className="ticker">{stock.symbol}</td>
                      <td>{stock.shortName}</td>
                      <td>{formatCurrency(stock.regularMarketPrice)}</td>
                      <td className={positive ? 'up' : 'down'}>
                        {positive ? '+' : ''}
                        {formatCurrency(stock.regularMarketChange)}
                      </td>
                      <td className={positive ? 'up' : 'down'}>{formatPercent(stock.regularMarketChangePercent)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
