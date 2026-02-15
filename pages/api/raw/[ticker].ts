import type { NextApiRequest, NextApiResponse } from 'next';

const ALPHA_BASE_URL = 'https://www.alphavantage.co/query';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const ticker = String(req.query.ticker || '').toUpperCase();
  const apiKey = process.env.ALPHAVANTAGE_API_KEY;

  if (!ticker) {
    return res.status(400).json({ error: 'Ticker is required.' });
  }

  if (!apiKey) {
    return res.status(500).json({ error: 'Missing ALPHAVANTAGE_API_KEY.' });
  }

  const url = `${ALPHA_BASE_URL}?function=TIME_SERIES_DAILY_ADJUSTED&symbol=${ticker}&outputsize=full&apikey=${apiKey}`;

  try {
    const response = await fetch(url);
    const payload = await response.json();
    return res.status(response.ok ? 200 : response.status).json(payload);
  } catch {
    return res.status(502).json({ error: 'Failed to fetch data from Alpha Vantage.' });
  }
}
