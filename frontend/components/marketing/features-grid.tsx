import {
  BarChart3,
  KeyRound,
  Layers,
  Radio,
  ShieldCheck,
  Users,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const FEATURES = [
  {
    icon: KeyRound,
    title: "Key masking",
    description:
      "Clients get an xpxy_live_… proxy token instead of your real key. It's encrypted at rest and injected server-side on every request.",
  },
  {
    icon: BarChart3,
    title: "Usage analytics",
    description:
      "Requests, tokens, latency, cost, and errors — charted over time for every API, down to each individual request.",
  },
  {
    icon: Layers,
    title: "Any API, no provider lock-in",
    description:
      "Registering an API is just a name, a base URL, and a key — nothing coupled to OpenAI, Anthropic, or anyone else. Point it at any backend.",
  },
  {
    icon: Radio,
    title: "Streaming passthrough",
    description:
      "Server-sent event streams pass straight through the gateway, chunk by chunk, with no added buffering latency.",
  },
  {
    icon: Users,
    title: "Scoped access",
    description:
      "Create a separate proxy token per app, teammate, or environment — and revoke exactly one without touching the rest.",
  },
  {
    icon: ShieldCheck,
    title: "Revoke instantly",
    description:
      "Suspend a token or disable an API and it stops working immediately — no cache window, no stale access.",
  },
];

export function FeaturesGrid() {
  return (
    <section id="features" className="scroll-mt-16 bg-muted/30">
      <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
        <div className="mx-auto mb-14 max-w-2xl text-center">
          <h2 className="font-heading text-3xl font-semibold tracking-tight">
            Everything you need to manage API access
          </h2>
          <p className="mt-3 text-muted-foreground">
            Built for teams and solo developers wiring up LLM and third-party
            APIs.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <Card key={f.title} className="border-border/60">
              <CardHeader>
                <div className="mb-2 flex size-10 items-center justify-center rounded-lg bg-primary/10">
                  <f.icon className="size-5" style={{ color: "var(--primary)" }} />
                </div>
                <CardTitle className="font-heading">{f.title}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                {f.description}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
