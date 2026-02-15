'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

const REFRESH_MS = 5 * 60 * 1000;

export function AutoRefresh() {
  const router = useRouter();
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      router.refresh();
      setLastRefresh(new Date());
    }, REFRESH_MS);

    return () => clearInterval(timer);
  }, [router]);

  return (
    <p className="refreshHint">
      Auto-refreshes every 5 minutes · Last refresh {lastRefresh.toLocaleTimeString()}
    </p>
  );
}
