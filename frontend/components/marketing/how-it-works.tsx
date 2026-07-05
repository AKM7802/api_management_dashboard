import { Key, LineChart, ShieldPlus } from "lucide-react";

const STEPS = [
  {
    n: "01",
    icon: Key,
    title: "Add your API",
    text: "Name it, point it at any base URL, paste the key — OpenAI, Anthropic, or your own backend, no provider to pick. It's encrypted immediately and never shown again.",
  },
  {
    n: "02",
    icon: ShieldPlus,
    title: "Get a proxy token",
    text: "Mint an xpxy_live_… token for each app or teammate that needs access. Revoke any token instantly, any time.",
  },
  {
    n: "03",
    icon: LineChart,
    title: "Watch usage roll in",
    text: "Every request is logged automatically — requests, tokens, latency, cost, and errors, charted per API.",
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="scroll-mt-16">
      <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
        <div className="mx-auto mb-14 max-w-2xl text-center">
          <h2 className="font-heading text-3xl font-semibold tracking-tight">
            How it works
          </h2>
          <p className="mt-3 text-muted-foreground">
            Three steps between you and a fully monitored API gateway.
          </p>
        </div>
        <div className="relative grid gap-8 md:grid-cols-3">
          <div
            aria-hidden
            className="absolute top-9 right-0 left-0 hidden h-px bg-border md:block"
          />
          {STEPS.map((step) => (
            <div key={step.n} className="relative flex flex-col items-start gap-4">
              <div className="relative z-10 flex size-[4.5rem] items-center justify-center rounded-2xl border bg-card shadow-sm">
                <step.icon className="size-7" style={{ color: "var(--primary)" }} />
              </div>
              <div>
                <span className="text-xs font-semibold tracking-wide text-muted-foreground">
                  STEP {step.n}
                </span>
                <h3 className="mt-1 font-heading text-lg font-semibold">
                  {step.title}
                </h3>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  {step.text}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
