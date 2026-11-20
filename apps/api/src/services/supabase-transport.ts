export const supabaseDatabaseOptions = { retry: false };

export function supabaseFetch(timeoutMs = 8_000): typeof fetch {
  return (input, init) => {
    const deadline = AbortSignal.timeout(timeoutMs);
    const caller = init?.signal ?? (input instanceof Request ? input.signal : null);
    return fetch(input, { ...init, signal: caller ? AbortSignal.any([caller, deadline]) : deadline });
  };
}
