import type { Metadata } from "next";

import { Architecture } from "@/components/marketing/architecture";
import { CapabilityStrip } from "@/components/marketing/capability-strip";
import { CtaBand } from "@/components/marketing/cta-band";
import { Faq } from "@/components/marketing/faq";
import { FeaturesGrid } from "@/components/marketing/features-grid";
import { Hero } from "@/components/marketing/hero";
import { HowItWorks } from "@/components/marketing/how-it-works";
import { Security } from "@/components/marketing/security";
import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteHeader } from "@/components/marketing/site-header";

export const metadata: Metadata = {
  title: "API Manager — one gateway for every API key",
  description:
    "Add your API, get a safe proxy token, and see exactly how it's being used. Works with OpenAI, Anthropic, and any custom backend.",
  openGraph: {
    title: "API Manager",
    description:
      "Safe proxy tokens for your API keys, with per-API usage analytics.",
    type: "website",
  },
};

export default function LandingPage() {
  return (
    <div className="flex min-h-svh flex-col">
      <SiteHeader />
      <main className="flex-1">
        <Hero />
        <CapabilityStrip />
        <HowItWorks />
        <FeaturesGrid />
        <Architecture />
        <Security />
        <Faq />
        <CtaBand />
      </main>
      <SiteFooter />
    </div>
  );
}
