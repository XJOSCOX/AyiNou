const adminAction = "inline-flex min-h-10 max-w-full items-center justify-center rounded-md border px-3 py-2 text-center text-sm font-semibold leading-snug focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60";

export const adminSecondaryAction = `${adminAction} border-[var(--theme-border)] bg-[var(--theme-surface)] text-[var(--theme-link)] enabled:hover:border-[var(--theme-link)] enabled:hover:bg-[var(--theme-control)]`;

export const adminDangerAction = `${adminAction} border-[var(--theme-error-text)] bg-[var(--theme-error-bg)] text-[var(--theme-error-text)] enabled:hover:bg-[var(--theme-error-text)] enabled:hover:text-[var(--theme-error-bg)]`;

export const adminCompactCard = "min-w-0 rounded-lg border border-[var(--theme-border)] bg-[var(--theme-surface)] p-3 sm:p-4";

export const adminActionPanel = "grid min-w-0 content-start gap-3 rounded-lg border border-[var(--theme-border)] bg-[var(--theme-control)] p-3 sm:p-4 [&_input:not([type=checkbox]):not([type=radio])]:bg-[var(--theme-surface)] [&_select]:bg-[var(--theme-surface)] [&_textarea]:bg-[var(--theme-surface)]";

export const adminConfirmation = "flex items-start gap-2 rounded-md border border-[var(--theme-border)] bg-[var(--theme-surface)] p-3 text-sm [&_input]:mt-0.5 [&_input]:size-4 [&_input]:shrink-0 [&_input]:accent-[var(--theme-primary)]";

export const adminDisclosure = "flex min-h-10 cursor-pointer list-none items-center justify-between gap-3 rounded-md px-3 py-2 text-sm font-semibold text-[var(--theme-link)] hover:bg-[var(--theme-control)] focus-visible:outline-2 focus-visible:outline-[var(--theme-link)] after:size-2 after:shrink-0 after:rotate-45 after:border-b-2 after:border-e-2 after:content-[''] in-open:after:rotate-225 [&::-webkit-details-marker]:hidden";
