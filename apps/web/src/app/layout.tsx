import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AYINOU — Ansanm pou Ayiti",
  description: "Ayinou brings Haitians together through peaceful dialogue, collaboration, and community action.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ht">
      <body>{children}</body>
    </html>
  );
}
