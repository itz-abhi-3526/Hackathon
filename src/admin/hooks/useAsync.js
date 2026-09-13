/* ═══════════════════════════════════════════════════════════════
   VOIDHACK 2026 — useAsync
   Tiny fetch wrapper used by every admin page: hands back
   { data, loading, error, run, reload } with an abort-safe flag so a
   fast page switch never writes stale state.
   ═══════════════════════════════════════════════════════════════ */

import { useCallback, useEffect, useRef, useState } from 'react';

export function useAsync(fn, deps = []) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const alive = useRef(true);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const run = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fnRef.current();
      if (alive.current) {
        setData(res);
        setLoading(false);
      }
      return res;
    } catch (err) {
      if (alive.current) {
        setError(err?.message || 'LOAD FAILED');
        setLoading(false);
      }
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    alive.current = true;
    run();
    return () => {
      alive.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, loading, error, run, reload: run };
}