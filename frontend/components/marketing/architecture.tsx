import { ArrowRight, Bot, Server, Sparkle } from "lucide-react";

const NODES = [
  {
    icon: Bot,
    title: "Your app",
    text: "Calls the gateway with a proxy token — never the real key.",
  },
  {
    icon: Server,
    title: "API Manager",
    text: "Verifies the token, decrypts your real key in memory, and logs usage.",
  },
  {
    icon: Sparkle,
    title: "Upstream API",
    text: "Receives the request with the real key injected. Streams straight back.",
  },
];

export function Architecture() {
  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
      <div className="mx-auto mb-14 max-w-2xl text-center">
        <h2 className="font-heading text-3xl font-semibold tracking-tight">
          What actually happens on each request
        </h2>
        <p className="mt-3 text-muted-foreground">
          The real key never leaves the gateway.
        </p>
      </div>
      <div className="flex flex-col items-stretch gap-4 md:flex-row md:items-center md:justify-center md:gap-3">
        {NODES.map((node, i) => (
          <div key={node.title} className="flex items-center gap-3 md:contents">
            <div className="flex flex-1 flex-col items-start gap-3 rounded-xl border bg-card p-5 md:items-center md:text-center">
              <div className="flex size-11 items-center justify-center rounded-lg bg-primary/10">
                <node.icon className="size-5" style={{ color: "var(--primary)" }} />
              </div>
              <div>
                <h3 className="font-heading font-semibold">{node.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{node.text}</p>
              </div>
            </div>
            {i < NODES.length - 1 ? (
              <ArrowRight
                className="size-5 shrink-0 self-center text-muted-foreground max-md:mx-2 max-md:rotate-90"
                aria-hidden
              />
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}
