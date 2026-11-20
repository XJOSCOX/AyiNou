"use client";

import { useId, useSyncExternalStore, type ReactNode } from "react";
import { messages } from "@/lib/i18n";
import { useLocale } from "@/lib/locale-store";
import { MemberIdentityBoundary } from "@/lib/member-display-name";
import { MemberNavbar } from "./member-navbar";
import { MemberSidebar } from "./member-sidebar";
import { SiteFooter } from "./site-footer";

const desktopSidebar = "(min-width: 64rem)";
const sidebarChange = "ayinou-sidebar-change";
const sidebarPreferences = { desktop: null, compact: null } as Record<"desktop" | "compact", boolean | null>;

function sidebarMode() {
  return window.matchMedia(desktopSidebar).matches ? "desktop" : "compact";
}

function readSidebar() {
  const mode = sidebarMode();
  return sidebarPreferences[mode] ?? (mode === "desktop");
}

function subscribeSidebar(onChange: () => void) {
  const media = window.matchMedia(desktopSidebar);
  media.addEventListener("change", onChange);
  window.addEventListener(sidebarChange, onChange);
  return () => {
    media.removeEventListener("change", onChange);
    window.removeEventListener(sidebarChange, onChange);
  };
}

export function MemberShell({ children }: { children: ReactNode }) {
  const [locale] = useLocale();
  const sidebarId = useId();
  const expanded = useSyncExternalStore(subscribeSidebar, readSidebar, () => false);

  function toggleSidebar() {
    sidebarPreferences[sidebarMode()] = !readSidebar();
    window.dispatchEvent(new Event(sidebarChange));
  }

  return (
    <MemberIdentityBoundary><div id="top" className="flex min-h-dvh flex-col text-[var(--theme-text)]">
      <a href="#member-main" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-[var(--theme-surface)] focus:p-4">
        {messages[locale].skip}
      </a>
      <MemberNavbar />
      <div className={`grid flex-1 grid-cols-[minmax(0,1fr)] grid-rows-[auto_1fr] lg:grid-rows-1 ${expanded
        ? "lg:grid-cols-[clamp(12rem,16vw,16rem)_minmax(0,1fr)]" : "lg:grid-cols-[3.5rem_minmax(0,1fr)]"}`}>
        <MemberSidebar id={sidebarId} expanded={expanded} toggle={toggleSidebar} />
        <main id="member-main" tabIndex={-1} className="min-w-0 px-4 py-5 sm:px-6 sm:py-7 xl:px-10 xl:py-9">
          {children}
        </main>
      </div>
      <SiteFooter member />
    </div></MemberIdentityBoundary>
  );
}
