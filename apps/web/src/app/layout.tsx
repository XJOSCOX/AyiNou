import type { Metadata } from "next";
import { cookies } from "next/headers";
import "@fontsource-variable/dm-sans";
import { defaultLocale, isLocale, localeCookie, messages } from "@/lib/i18n";
import { VerificationPresentationProvider } from "@/components/verification-presentation";
import { serverSupabase } from "@/lib/supabase/server";
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
  const client = await serverSupabase();
  const { data } = await client.rpc("verification_presentation").abortSignal(AbortSignal.timeout(2500));
  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: initializeTheme }} />
      </head>
      <body><LocaleProvider initial={locale}><VerificationPresentationProvider value={data}>
        {children}
      </VerificationPresentationProvider></LocaleProvider></body>
    </html>
  );
}
