// Terminal-chrome code panel for the hero. Manually tokenized (no syntax
// highlighter dependency) — a handful of spans is plenty at this size.

export function CodePanel() {
  return (
    <div className="w-full max-w-lg overflow-hidden rounded-xl border bg-card shadow-lg shadow-primary/5">
      <div className="flex items-center gap-1.5 border-b bg-muted/50 px-4 py-2.5">
        <span className="size-2.5 rounded-full bg-status-critical/70" />
        <span className="size-2.5 rounded-full bg-status-warning/70" />
        <span className="size-2.5 rounded-full bg-status-good/70" />
        <span className="ml-3 text-xs text-muted-foreground">request.sh</span>
      </div>
      <pre className="overflow-x-auto p-4 font-mono text-[13px] leading-relaxed">
        <code>
          <span className="text-muted-foreground"># your app calls the gateway, not the provider</span>
          {"\n"}
          <span className="text-foreground">curl</span>{" "}
          <span style={{ color: "var(--chart-1)" }}>
            https://gateway.yourapp.com/proxy/v1/chat/completions
          </span>
          {" \\\n  "}
          <span className="text-muted-foreground">-H</span>{" "}
          <span style={{ color: "var(--status-good)" }}>
            &quot;Authorization: Bearer xpxy_live_a1B2c3…&quot;
          </span>
          {"\n\n"}
          <span className="text-muted-foreground">
            # the gateway injects your real key — clients never see it
          </span>
          {"\n"}
          <span className="text-muted-foreground/50 line-through">
            sk-proj-REAL_SECRET_KEY_never_shared
          </span>
        </code>
      </pre>
    </div>
  );
}
