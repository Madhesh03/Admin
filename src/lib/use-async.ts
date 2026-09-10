"use client";

import * as React from "react";

interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
  setData: React.Dispatch<React.SetStateAction<T | null>>;
}

/**
 * Run an async loader (typically an admin-api call) and track
 * loading/error/data — the seam's latency + simulated errors make these real.
 * Re-runs whenever `deps` change.
 */
export function useAsync<T>(
  loader: () => Promise<T>,
  deps: React.DependencyList = [],
): AsyncState<T> {
  const [data, setData] = React.useState<T | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [nonce, setNonce] = React.useState(0);

  // Keep the latest loader without forcing it into the deps array.
  const loaderRef = React.useRef(loader);
  loaderRef.current = loader;

  React.useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    loaderRef
      .current()
      .then((result) => {
        if (active) setData(result);
      })
      .catch((err: unknown) => {
        if (active)
          setError(err instanceof Error ? err.message : "Something went wrong.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  const reload = React.useCallback(() => setNonce((n) => n + 1), []);

  return { data, loading, error, reload, setData };
}

/**
 * Client-side pagination over an already-fetched array — for list endpoints
 * that return everything in one response (no server-side page/page_size).
 * Slices `rows` into pages of `pageSize`, clamping the current page down when
 * a shrinking result set (a new filter, a deletion) would leave it out of
 * range. For endpoints the server itself paginates (page/page_size params,
 * `meta.total` in the response), pass page state through to the API call
 * instead — see the Products/Returns pages for that pattern.
 */
export function usePagination<T>(rows: T[], pageSize = 20) {
  const [page, setPage] = React.useState(1);
  const total = rows.length;
  const lastPage = Math.max(1, Math.ceil(total / pageSize));

  React.useEffect(() => {
    if (page > lastPage) setPage(lastPage);
  }, [lastPage, page]);

  const pageRows = React.useMemo(
    () => rows.slice((page - 1) * pageSize, page * pageSize),
    [rows, page, pageSize],
  );

  return { page, setPage, pageRows, total, pageSize, lastPage };
}

/** Debounce a rapidly-changing value (e.g. a search box) by `delay` ms. */
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}
