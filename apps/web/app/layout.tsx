import type { Metadata, Viewport } from "next";
import { DM_Mono, Instrument_Serif, Manrope } from "next/font/google";
import type { ReactNode } from "react";

import { Providers } from "./providers";
import "./globals.css";

const manrope = Manrope({
  display: "swap",
  preload: false,
  subsets: ["latin"],
  variable: "--font-sans",
});

const instrumentSerif = Instrument_Serif({
  display: "swap",
  preload: false,
  subsets: ["latin"],
  variable: "--font-serif",
  weight: "400",
});

const dmMono = DM_Mono({
  display: "swap",
  preload: false,
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["300", "400", "500"],
});

export const metadata: Metadata = {
  title: {
    default: "Ripple | Change intelligence for living knowledge",
    template: "%s | Ripple",
  },
  description:
    "Trace authoritative changes through every dependent asset, approve precise repairs, and verify the result.",
  icons: { icon: "/favicon.svg" },
  metadataBase: new URL("https://ripple.grimnej.com"),
  openGraph: {
    title: "Ripple | Nothing downstream breaks in silence",
    description:
      "Evidence-backed change intelligence for documentation, support, and operational knowledge.",
    siteName: "Ripple",
    type: "website",
  },
};

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#090b0c",
};

type RootLayoutProperties = Readonly<{ children: ReactNode }>;

export default function RootLayout({ children }: RootLayoutProperties) {
  return (
    <html
      className={`${manrope.variable} ${instrumentSerif.variable} ${dmMono.variable}`}
      lang="en"
    >
      <body>
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
