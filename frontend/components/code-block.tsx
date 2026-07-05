"use client";

// Shared terminal-chrome code display with copy-to-clipboard and lightweight,
// injection-safe syntax coloring (returns React nodes, never dangerouslySetInnerHTML).

import { Check, Copy } from "lucide-react";
import { Fragment, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const TOKEN_RE = /("(?:[^"\\]|\\.)*")|(\bhttps?:\/\/[^\s"'\\]+)|(\s-{1,2}[A-Za-z][\w-]*)/g;

function highlightLine(line: string): React.ReactNode[] {
  if (line.trim().startsWith("#")) {
    return [
      <span key="comment" className="text-muted-foreground">
        {line}
      </span>,
    ];
  }
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let i = 0;
  TOKEN_RE.lastIndex = 0;
  while ((match = TOKEN_RE.exec(line))) {
    if (match.index > lastIndex) nodes.push(line.slice(lastIndex, match.index));
    const [full, string_, url, flag] = match;
    if (string_) {
      nodes.push(
        <span key={i++} style={{ color: "var(--status-good)" }}>
          {string_}
        </span>,
      );
    } else if (url) {
      nodes.push(
        <span key={i++} style={{ color: "var(--primary)" }}>
          {url}
        </span>,
      );
    } else if (flag) {
      nodes.push(
        <span key={i++} className="text-muted-foreground">
          {flag}
        </span>,
      );
    }
    lastIndex = match.index + full.length;
  }
  if (lastIndex < line.length) nodes.push(line.slice(lastIndex));
  return nodes;
}

export function CodeBlock({
  code,
  label = "shell",
  className,
}: {
  code: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const lines = code.split("\n");

  async function copy() {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className={cn("overflow-hidden rounded-xl border bg-card", className)}>
      <div className="flex items-center gap-1.5 border-b bg-muted/50 px-4 py-2">
        <span className="size-2.5 rounded-full bg-status-critical/70" />
        <span className="size-2.5 rounded-full bg-status-warning/70" />
        <span className="size-2.5 rounded-full bg-status-good/70" />
        <span className="ml-3 text-xs text-muted-foreground">{label}</span>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="ml-auto"
          onClick={copy}
          aria-label="Copy code"
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        </Button>
      </div>
      <pre className="overflow-x-auto p-4 font-mono text-[13px] leading-relaxed">
        <code>
          {lines.map((line, i) => (
            <Fragment key={i}>
              {highlightLine(line)}
              {i < lines.length - 1 ? "\n" : null}
            </Fragment>
          ))}
        </code>
      </pre>
    </div>
  );
}
