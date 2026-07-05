import { Activity, Lock, Radio, ShieldCheck } from "lucide-react";

const ITEMS = [
  { icon: Lock, text: "Secrets encrypted at rest" },
  { icon: Radio, text: "Native SSE streaming passthrough" },
  { icon: Activity, text: "Per-API usage analytics" },
  { icon: ShieldCheck, text: "One-time token reveal" },
];

export function CapabilityStrip() {
  return (
    <section className="border-y bg-muted/30">
      <div className="mx-auto grid w-full max-w-6xl grid-cols-2 gap-6 px-4 py-8 sm:px-6 md:grid-cols-4">
        {ITEMS.map((item) => (
          <div key={item.text} className="flex items-center gap-3">
            <item.icon
              className="size-5 shrink-0"
              style={{ color: "var(--primary)" }}
            />
            <span className="text-sm font-medium text-foreground">
              {item.text}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
