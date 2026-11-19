import { LanguageSwitch } from "./language-switch";
import { ThemeToggle } from "./theme-toggle";

export function DisplayControls() {
  return (
    <div className="flex w-fit shrink-0 items-center divide-x divide-[var(--theme-border)] rounded-md border border-[var(--theme-border)] bg-[var(--theme-control)]">
      <LanguageSwitch />
      <ThemeToggle />
    </div>
  );
}
