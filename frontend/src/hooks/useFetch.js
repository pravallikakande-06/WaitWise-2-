import { useCallback, useEffect, useState } from 'react';
import { useApp } from '../context/Providers.jsx';

// Loads data, re-fetches when the server pushes a change (Socket.IO), and optionally re-polls every `ms` as a fallback.
export function useFetch(fn, deps = [], ms = 0) {
  const { tick } = useApp();
  const [state, setState] = useState({ data: null, error: false, loading: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const load = useCallback(() => fn().then((data) => setState({ data, error: false, loading: false }))
    .catch(() => setState((s) => ({ ...s, error: true, loading: false }))), deps);
  useEffect(() => {
    load();
    if (!ms) return undefined;
    const t = setInterval(load, ms);
    return () => clearInterval(t);
  }, [load, ms, tick]);
  return { ...state, reload: load };
}
