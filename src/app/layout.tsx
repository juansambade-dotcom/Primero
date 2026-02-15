import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Top 10 S&P 500 Stocks Today',
  description: 'Live market leaders by daily percentage gains using free public data sources.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
