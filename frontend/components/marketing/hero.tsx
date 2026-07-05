import { ArrowRight, Sparkles } from "lucide-react";
import Link from "next/link";

import { CodePanel } from "@/components/marketing/code-panel";
import { Button } from "@/components/ui/button";

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 -z-10 h-[36rem] bg-[radial-gradient(ellipse_60%_50%_at_50%_-10%,color-mix(in_oklch,var(--primary)_18%,transparent),transparent)]"
      />
      <div className="mx-auto grid w-full max-w-6xl items-center gap-12 px-4 py-20 sm:px-6 sm:py-28 lg:grid-cols-2 lg:py-32">
        <div className="flex flex-col items-start gap-6">
          <span className="inline-flex items-center gap-1.5 rounded-full border bg-muted/60 px-3 py-1 text-xs font-medium text-muted-foreground">
            <Sparkles className="size-3.5" style={{ color: "var(--primary)" }} />
            Open source · self-hostable
          </span>
          <h1 className="font-heading text-4xl font-semibold tracking-tight text-balance sm:text-5xl lg:text-[3.25rem] lg:leading-[1.05]">
            One gateway for every API key you manage
          </h1>
          <p className="max-w-xl text-lg text-muted-foreground text-pretty">
            Stop handing out real API keys. Issue safe proxy tokens, route
            every request through one gateway, and see exactly how each
            upstream API is used — requests, tokens, latency, and cost.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button size="lg" render={<Link href="/signup" />}>
              Get started free
              <ArrowRight data-icon="inline-end" />
            </Button>
            <Button size="lg" variant="outline" render={<Link href="#how-it-works" />}>
              See how it works
            </Button>
          </div>
        </div>
        <div className="flex justify-center lg:justify-end">
          <CodePanel />
        </div>
      </div>
    </section>
  );
}
