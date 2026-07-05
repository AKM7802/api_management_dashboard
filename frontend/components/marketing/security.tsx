import { Check, ShieldCheck } from "lucide-react";

const POINTS = [
  "Upstream secrets are encrypted at rest — never stored or logged in plain text.",
  "Proxy tokens are stored as a one-way hash; the raw token is shown exactly once, at creation.",
  "Revoking a token or disabling an API takes effect immediately — no stale cache window.",
  "Every proxied request is authenticated independently; there is no shared session between clients.",
  "All traffic to and from the gateway is expected to run over TLS.",
];

export function Security() {
  return (
    <section id="security" className="scroll-mt-16 border-y bg-muted/30">
      <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-20 sm:px-6 sm:py-28 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] lg:items-center">
        <div>
          <div className="mb-4 flex size-12 items-center justify-center rounded-xl bg-primary/10">
            <ShieldCheck className="size-6" style={{ color: "var(--primary)" }} />
          </div>
          <h2 className="font-heading text-3xl font-semibold tracking-tight">
            Built with security as the default
          </h2>
          <p className="mt-3 max-w-md text-muted-foreground">
            The whole point of a gateway is that your real credentials never
            reach a client. Here&apos;s how that holds up in practice.
          </p>
        </div>
        <ul className="flex flex-col gap-3">
          {POINTS.map((point) => (
            <li key={point} className="flex items-start gap-3 rounded-lg border bg-card p-4">
              <Check
                className="mt-0.5 size-4 shrink-0"
                style={{ color: "var(--status-good)" }}
              />
              <span className="text-sm text-foreground">{point}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
