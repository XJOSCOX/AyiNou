"use client";

import { useEffect, useRef, useState } from "react";

type Page<T> = { rows: T[]; nextCursor: string | null };
type Loader<T> = (cursor: string | null, signal: AbortSignal) => Promise<Page<T>>;
type PageResult<T> = {
  load: Loader<T>;
  revision: number;
  attempt: number;
  page: Page<T> | null;
  error: unknown;
  failedPage: "initial" | "more";
};

export function useCursorPage<T extends { id: string }>(load: Loader<T>, revision = 0) {
  const [result, setResult] = useState<PageResult<T> | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [loadingPage, setLoadingPage] = useState<Page<T> | null>(null);
  const current = useRef<AbortController | null>(null);
  const pendingCursor = useRef<AbortController | null>(null);
  const active = result?.load === load && result.revision === revision && result.attempt === attempt ? result : null;
  const page = active?.page ?? null;

  useEffect(() => {
    const control = new AbortController();
    current.current = control;
    const query = { load, revision, attempt, failedPage: "initial" as const };
    load(null, control.signal).then((page) => {
      if (!control.signal.aborted) setResult({ ...query, page, error: null });
    }).catch((cause: unknown) => {
      if (!control.signal.aborted) setResult({ ...query, page: null, error: cause });
    });
    return () => {
      control.abort();
      if (current.current === control) current.current = null;
    };
  }, [load, revision, attempt]);

  async function more() {
    const control = current.current;
    if (!active || !page?.nextCursor || !control || pendingCursor.current === control) return;
    pendingCursor.current = control;
    setResult({ ...active, error: null });
    setLoadingPage(page);
    try {
      const next = await load(page.nextCursor, control.signal);
      if (control.signal.aborted) return;
      const seen = new Set(page.rows.map(({ id }) => id));
      setResult({ ...active, error: null,
        page: { rows: [...page.rows, ...next.rows.filter(({ id }) => !seen.has(id))], nextCursor: next.nextCursor } });
    } catch (cause) {
      if (!control.signal.aborted) setResult({ ...active, error: cause, failedPage: "more" });
    } finally {
      if (pendingCursor.current === control) {
        pendingCursor.current = null;
        setLoadingPage(null);
      }
    }
  }

  return {
    page, error: active?.error ?? null, loadingMore: page !== null && loadingPage === page, more,
    retry: () => {
      if (active?.failedPage === "more") void more();
      else setAttempt((value) => value + 1);
    },
  };
}

export function useFeedMutation() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const active = useRef(false);
  async function run(change: () => Promise<unknown>) {
    if (active.current) return false;
    active.current = true;
    setBusy(true);
    setError(null);
    try { await change(); return true; }
    catch (cause) { setError(cause); return false; }
    finally { active.current = false; setBusy(false); }
  }
  return { busy, error, run };
}
