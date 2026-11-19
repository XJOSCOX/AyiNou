import type { Metadata } from "next";
import { cookies } from "next/headers";
import "@fontsource-variable/dm-sans";
import { defaultLocale, isLocale, localeCookie, messages } from "@/lib/i18n";
import { LocaleProvider } from "@/lib/locale-store";
import { darkThemeQuery, themeStorageKey } from "@/lib/theme";
import "./globals.css";

const initializeTheme = `
  let savedTheme;
  try { savedTheme = localStorage.getItem(${JSON.stringify(themeStorageKey)}); } catch {}
  document.documentElement.dataset.theme = savedTheme === "light" || savedTheme === "dark"
    ? savedTheme
    : matchMedia(${JSON.stringify(darkThemeQuery)}).matches ? "dark" : "light";
`;

async function readLocale() {
  const value = (await cookies()).get(localeCookie)?.value;
  return isLocale(value) ? value : defaultLocale;
}

export async function generateMetadata(): Promise<Metadata> {
  const t = messages[await readLocale()];
  return { title: t.pageTitle, description: t.pageDescription };
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const locale = await readLocale();
  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: initializeTheme }} />
      </head>
      <body><LocaleProvider initial={locale}>{children}</LocaleProvider></body>
    </html>
  );
}
