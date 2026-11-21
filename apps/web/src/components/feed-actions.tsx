const art = {
  comments: <path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H4l1.8-3.6A7.5 7.5 0 1 1 20 11.5ZM9 11.5h7m-7 3h4" />,
  reply: <path d="m9 5-5 5 5 5m-5-5h9a6 6 0 0 1 6 6v3" />,
  thread: <><path d="M20.5 13.5a5 5 0 0 1-5 5H14l-3 2v-2m-2-3H4l1.3-2.8A5.5 5.5 0 1 1 9 15.5Z" /><path d="M8 10h5" /></>,
  like: <path d="M8 10v10H4V10h4Zm0 9 2 1h7.3a2 2 0 0 0 2-1.6l1.1-6a2 2 0 0 0-2-2.4H15l.5-3.7A2 2 0 0 0 13.5 4H13l-2 4.2a4 4 0 0 1-1.6 1.7L8 10.7" />,
  love: <path d="M20 9.1c0 4-8 9.4-8 9.4S4 13.1 4 9.1C4 5.2 9 4.1 12 7.7c3-3.6 8-2.5 8 1.4Z" />,
  support: <><path d="M19 7.4c0 2.4-4.5 5-4.5 5S10 9.8 10 7.4c0-2.3 3-2.8 4.5-.8C16 4.6 19 5.1 19 7.4Z" /><path d="M3.5 14.5h3l2-1.5H12a1.5 1.5 0 0 1 0 3H9.5m-3 3h8l5-3.5a1.4 1.4 0 0 0-1.6-2.3l-3.8 2.5M3.5 13v7" /></>,
  celebrate: <><path d="m5 12-2 8 8-2m-6-6 6 6m-3-8 6 6m-4-10 1 2m4-5-.5 3m4 2 2-1m-3 5 3 .5m-5 .5 1 2" /></>,
  more: <g fill="currentColor" stroke="none"><circle cx="5" cy="12" r="1.65" /><circle cx="12" cy="12" r="1.65" /><circle cx="19" cy="12" r="1.65" /></g>,
  edit: <path d="m5 15-.8 4.8 4.8-.8L19.5 8.5a2.8 2.8 0 0 0-4-4L5 15Zm8.8-8.8 4 4" />,
  delete: <path d="M4.5 7h15m-13.5 0 1 13h10l1-13m-8-3h4v3m-4 3.5v6m4-6v6" />,
  report: <path d="M5 21V4m0 1c4-3.8 9 3 14 0v10c-5 3-10-3.8-14 0" />,
  remove: <path d="m6 6 12 12M18 6 6 18" />,
};

export function FeedIcon({ name }: { name: keyof typeof art }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" className="size-[1.125rem] shrink-0" fill="none"
    stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{art[name]}</svg>;
}

export const feedIconButton = "relative inline-grid size-11 shrink-0 place-items-center rounded-md border border-[var(--theme-border)] bg-[var(--theme-control)] text-[var(--theme-link)] hover:bg-[var(--theme-selected)] focus-visible:outline-2 aria-expanded:bg-[var(--theme-selected)] aria-pressed:bg-[var(--theme-selected)] data-[selected=true]:bg-[var(--theme-selected)] disabled:opacity-60";

export function FeedActions({ label, actions }: {
  label: string;
  actions: { icon: "edit" | "delete" | "report"; label: string; run: () => void }[];
}) {
  return <details className="relative ms-auto shrink-0 text-sm" onKeyDown={(event) => {
    if (event.key !== "Escape" || !event.currentTarget.open) return;
    event.currentTarget.open = false;
    event.currentTarget.querySelector("summary")?.focus();
  }}>
    <summary title={label} className="grid size-11 cursor-pointer list-none place-items-center rounded-md text-[var(--theme-link)] hover:bg-[var(--theme-selected)] focus-visible:outline-2 [&::-webkit-details-marker]:hidden">
      <FeedIcon name="more" /><span className="sr-only">{label}</span>
    </summary>
    <div className="absolute end-0 z-20 mt-1 flex gap-1 rounded-lg border border-[var(--theme-border)] bg-[var(--theme-surface)] p-1 shadow-lg">
      {actions.map(({ icon, label: actionLabel, run }) => <button key={icon}
        className={`${feedIconButton} ${icon === "delete" ? "text-[var(--theme-error-text)]" : ""}`}
        type="button" aria-label={actionLabel} title={actionLabel} onClick={run}>
        <FeedIcon name={icon} />
      </button>)}
    </div>
  </details>;
}
