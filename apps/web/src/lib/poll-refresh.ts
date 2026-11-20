type Snapshot = {
  status: string;
  opensAt: string;
  closesAt: string;
  serverNow?: number;
};

export function pollRefreshDelay(poll: Snapshot, elapsed: number, wallTime: number) {
  const at = poll.status === "scheduled" ? poll.opensAt : poll.status === "open" ? poll.closesAt : null;
  if (at === null) return null;
  const boundary = Date.parse(at);
  if (!Number.isFinite(boundary)) return null;
  const now = Number.isFinite(poll.serverNow) ? poll.serverNow! + elapsed : wallTime;
  // A server response immediately before the boundary may still report the previous status.
  return Math.min(2_147_483_647, Math.max(1000, boundary - now + 150));
}

export function watchPoll<T extends Snapshot>(options: {
  load(signal: AbortSignal): Promise<T>;
  publish(poll: T): void;
  fail(error: unknown): void;
  visible(): boolean;
  monotonic(): number;
  wallTime(): number;
  schedule(callback: () => void, delay: number): () => void;
}) {
  let pending: AbortController | null = null;
  let cancelTimer: (() => void) | null = null;
  let stopped = false;
  let poll: T | null = null;
  let sampledAt = 0;

  function clearTimer() {
    cancelTimer?.();
    cancelTimer = null;
  }

  function refresh(replace = false) {
    if (stopped || (pending && !replace)) return;
    clearTimer();
    pending?.abort();
    const controller = new AbortController();
    pending = controller;
    const start = options.monotonic();
    void options.load(controller.signal).then((next) => {
      if (controller.signal.aborted) return;
      pending = null;
      poll = next;
      sampledAt = start;
      options.publish(next);
      scheduleBoundary();
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return;
      pending = null;
      options.fail(error);
      // A failed background read leaves manual refresh to the existing retry control.
    });
  }

  function scheduleBoundary() {
    clearTimer();
    if (!poll || !options.visible()) return;
    const delay = pollRefreshDelay(poll, options.monotonic() - sampledAt, options.wallTime());
    if (delay !== null) cancelTimer = options.schedule(() => refresh(), delay);
  }

  return {
    refresh,
    visibilityChanged() {
      if (options.visible()) refresh();
      else clearTimer();
    },
    dispose() {
      stopped = true;
      clearTimer();
      pending?.abort();
    },
  };
}
