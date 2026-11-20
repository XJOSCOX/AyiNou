"use client";

import { useEffect, useRef, useState } from "react";

type Page<T> = { rows: T[]; nextCursor: string | null };
type Loader<T> = (cursor: string | null, signal: AbortSignal) => Promise<Page<T>>;

export function useCursorPage<T extends { id: string }>(load: Loader<T>, revision = 0) {
  const [page, setPage] = useState<Page<T> | null>(null);
  const [error, setError] = useState<unknown>(null);
  const pageError = useRef<"initial" | "more">("initial");
  const [attempt, setAttempt] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const current = useRef<AbortController | null>(null);
  const pendingCursor = useRef<AbortController | null>(null);

  useEffect(() => {
    const control = new AbortController();
    current.current = control;
    load(null, control.signal).then((result) => {
      if (!control.signal.aborted) { setPage(result); setError(null); }
    }).catch((cause: unknown) => {
      if (!control.signal.aborted) { pageError.current = "initial"; setError(cause); }
    });
    return () => {
      control.abort();
      if (current.current === control) current.current = null;
    };
  }, [load, revision, attempt]);

  async function more() {
    const control = current.current;
    if (!page?.nextCursor || !control || pendingCursor.current === control) return;
    pendingCursor.current = control;
    setError(null);
    setLoadingMore(true);
    try {
      const result = await load(page.nextCursor, control.signal);
      if (control.signal.aborted) return;
      const seen = new Set(page.rows.map(({ id }) => id));
      setPage({ rows: [...page.rows, ...result.rows.filter(({ id }) => !seen.has(id))], nextCursor: result.nextCursor });
    } catch (cause) {
      if (!control.signal.aborted) { pageError.current = "more"; setError(cause); }
    } finally {
      if (pendingCursor.current === control) {
        pendingCursor.current = null;
        setLoadingMore(false);
      }
    }
  }

  return {
    page, error, loadingMore, more,
    retry: () => {
      if (pageError.current === "more") void more();
      else { setError(null); setAttempt((value) => value + 1); }
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
