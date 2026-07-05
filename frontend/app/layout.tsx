import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";

import { Providers } from "./providers";

const fontBody = Inter({
  variable: "--font-body",
  subsets: ["latin"],
});

const fontDisplay = Space_Grotesk({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const fontCode = JetBrains_Mono({
  variable: "--font-code",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "API Manager — one gateway for every API key",
    template: "%s | API Manager",
  },
  description:
    "Manage your API keys in one place. Get safe proxy tokens instead of sharing real keys, and see exactly how each API is being used — requests, tokens, latency, cost, and errors.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${fontBody.variable} ${fontDisplay.variable} ${fontCode.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
