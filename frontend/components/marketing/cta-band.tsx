import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

export function CtaBand() {
  return (
    <section className="border-t">
      <div className="relative mx-auto w-full max-w-6xl overflow-hidden px-4 py-20 sm:px-6 sm:py-28">
        <div
          aria-hidden
          className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_50%_80%_at_50%_50%,color-mix(in_oklch,var(--primary)_12%,transparent),transparent)]"
        />
        <div className="mx-auto flex max-w-xl flex-col items-center gap-5 text-center">
          <h2 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl">
            Start managing your APIs today
          </h2>
          <p className="text-muted-foreground">
            Free, open source, and self-hostable. No credit card required.
          </p>
          <Button
            size="lg"
            render={<Link href="/signup" />}
            nativeButton={false}
          >
            Create your free account
            <ArrowRight data-icon="inline-end" />
          </Button>
        </div>
      </div>
    </section>
  );
}
