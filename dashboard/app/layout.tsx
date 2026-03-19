import type { Metadata } from "next";
import { IBM_Plex_Mono, Space_Grotesk } from "next/font/google";

import { AppShell } from "@/components/app-shell";
import { getSettingsOverrides } from "@/lib/settings-store";

import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-ibm-plex-mono",
});

export const metadata: Metadata = {
  title: "RAG Control Deck",
  description: "Next.js dashboard for request usage, prompt operations, application settings and flow visualization.",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  let theme: "light" | "dark" = "light";
  try {
    const overrides = await getSettingsOverrides();
    theme = (overrides["UI_THEME"] as "light" | "dark") || "light";
  } catch {
    // fallback to light
  }

  return (
    <html lang="en" data-theme={theme} className={`${spaceGrotesk.variable} ${ibmPlexMono.variable}`} suppressHydrationWarning>
      <body suppressHydrationWarning>
        <AppShell initialTheme={theme}>{children}</AppShell>
      </body>
    </html>
  );
}