import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = {
  title: "API Manager — manage your API keys in one place",
  description:
    "Add your API, get a safe proxy token, and see exactly how your APIs are being used. Works with OpenAI, Anthropic, and any custom backend.",
  openGraph: {
    title: "API Manager",
    description:
      "Safe proxy tokens for your API keys, with per-API usage analytics.",
    type: "website",
  },
};

const FEATURES = [
  {
    title: "Key masking",
    description:
      "Clients get an xpxy_live_… proxy token. Your real key is encrypted at rest and injected server-side — it never leaves the gateway.",
  },
  {
    title: "Usage analytics",
    description:
      "Requests, tokens, latency, and errors per API — charted over time, down to each individual request.",
  },
  {
    title: "Any provider",
    description:
      "OpenAI and Anthropic out of the box, or point it at any custom base URL. Streaming responses pass straight through.",
  },
];

const STEPS = [
  { n: "1", title: "Add your API", text: "Paste your upstream key — it's encrypted immediately." },
  { n: "2", title: "Get a proxy token", text: "Mint an xpxy_live_… token for each app that needs access." },
  { n: "3", title: "Watch usage", text: "Every request is logged and charted in your dashboard." },
];

export default function LandingPage() {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="border-b">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-4">
          <span className="font-semibold">API Manager</span>
          <nav className="flex items-center gap-2">
            <Button variant="ghost" render={<Link href="/login" />}>
              Log in
            </Button>
            <Button render={<Link href="/signup" />}>Get started</Button>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <section className="mx-auto flex w-full max-w-5xl flex-col items-center gap-6 px-4 py-24 text-center">
          <h1 className="max-w-2xl text-4xl font-semibold tracking-tight sm:text-5xl">
            Manage your API keys in one place
          </h1>
          <p className="max-w-xl text-lg text-muted-foreground">
            Get a safe proxy token instead of sharing real keys, and see
            exactly how your APIs are being used.
          </p>
          <div className="flex gap-3">
            <Button size="lg" render={<Link href="/signup" />}>
              Get started free
            </Button>
            <Button size="lg" variant="outline" render={<Link href="/login" />}>
              Log in
            </Button>
          </div>
          <pre className="mt-6 max-w-full overflow-x-auto rounded-lg border bg-muted p-4 text-left font-mono text-sm">
            {`curl https://your-gateway/proxy/v1/chat/completions \\
  -H "Authorization: Bearer xpxy_live_…"   # not your real key`}
          </pre>
        </section>

        <section
          aria-labelledby="how-it-works"
          className="border-t bg-muted/40"
        >
          <div className="mx-auto w-full max-w-5xl px-4 py-16">
            <h2 id="how-it-works" className="mb-8 text-center text-2xl font-semibold">
              How it works
            </h2>
            <div className="grid gap-4 md:grid-cols-3">
              {STEPS.map((s) => (
                <Card key={s.n}>
                  <CardHeader>
                    <CardDescription>Step {s.n}</CardDescription>
                    <CardTitle>{s.title}</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground">
                    {s.text}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section aria-labelledby="features">
          <div className="mx-auto w-full max-w-5xl px-4 py-16">
            <h2 id="features" className="mb-8 text-center text-2xl font-semibold">
              Features
            </h2>
            <div className="grid gap-4 md:grid-cols-3">
              {FEATURES.map((f) => (
                <Card key={f.title}>
                  <CardHeader>
                    <CardTitle>{f.title}</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground">
                    {f.description}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t">
          <div className="mx-auto flex w-full max-w-5xl flex-col items-center gap-4 px-4 py-16 text-center">
            <h2 className="text-2xl font-semibold">
              Start managing your APIs
            </h2>
            <Button size="lg" render={<Link href="/signup" />}>
              Create your free account
            </Button>
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto w-full max-w-5xl px-4 py-6 text-sm text-muted-foreground">
          API Manager — open source API key management.
        </div>
      </footer>
    </div>
  );
}
