import type { Metadata } from "next";
import "@fontsource-variable/dm-sans";
import { darkThemeQuery, themeStorageKey } from "@/lib/theme";
import "./globals.css";

const initializeTheme = `
  let savedTheme;
  try { savedTheme = localStorage.getItem(${JSON.stringify(themeStorageKey)}); } catch {}
  document.documentElement.dataset.theme = savedTheme === "light" || savedTheme === "dark"
    ? savedTheme
    : matchMedia(${JSON.stringify(darkThemeQuery)}).matches ? "dark" : "light";
`;

export const metadata: Metadata = {
  title: "AYINOU — Ansanm pou Ayiti",
  description: "Ayinou brings Haitians together through peaceful dialogue, collaboration, and community action.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ht" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: initializeTheme }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
