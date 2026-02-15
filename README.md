# Stock Picks Today

Educational demo web app that ranks a fixed universe of US stocks using a simple, transparent scoring model.

> **Educational only. Not investment advice.**

## Features

- Next.js + TypeScript + Tailwind UI.
- Home page with:
  - risk slider (Low/Med/High)
  - refresh/apply button
  - top 10 ranked stocks table
- Stock detail page (`/stock/[ticker]`) with:
  - 6-month price chart
  - key scoring metrics
  - raw API data links for transparency
- Alpha Vantage market data integration.
- In-memory API cache for 10 minutes to reduce rate-limit pressure.
- Friendly error/warning messages when API limits or outages occur.
- Unit tests for scoring logic (Vitest).

## Scoring model

For each stock:

- `Momentum = (6M return × 0.6) + (1M return × 0.4)`
- `Volatility penalty = z-score of 3M volatility` (std dev of daily returns)
- `Overall score = Momentum z-score − (Volatility penalty × risk factor)`

Risk factors:

- Low = `1.2`
- Med = `0.8`
- High = `0.4`

Higher overall scores rank higher.

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create env file:

   ```bash
   cp .env.example .env.local
   ```

3. Add your Alpha Vantage key:

   ```bash
   ALPHAVANTAGE_API_KEY=your_key_here
   ```

4. Run locally:

   ```bash
   npm run dev
   ```

5. Open http://localhost:3000

## Tests

```bash
npm test
```

## Vercel deployment

- This app is Vercel-compatible out of the box.
- Set `ALPHAVANTAGE_API_KEY` in your Vercel project environment variables before deployment.
