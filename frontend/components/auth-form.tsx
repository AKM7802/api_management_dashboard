"use client";

import { KeyRound, LineChart, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { Logo } from "@/components/logo";
import { Sparkline } from "@/components/charts/sparkline";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { api, setToken } from "@/lib/api";

const PITCH = [
  { icon: ShieldCheck, label: "Encrypted credential custody" },
  { icon: KeyRound, label: "One gateway for any HTTP API" },
  { icon: LineChart, label: "Live usage analytics" },
];

const DEMO_TREND = [40, 46, 42, 60, 54, 70, 64];

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const form = new FormData(e.currentTarget);
    try {
      const { access_token } = await api<{ access_token: string }>(
        `/auth/${mode}`,
        {
          method: "POST",
          body: JSON.stringify({
            email: form.get("email"),
            password: form.get("password"),
          }),
        },
      );
      setToken(access_token);
      router.push(next && next.startsWith("/") ? next : "/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setPending(false);
    }
  }

  return (
    <main className="relative flex min-h-svh items-center justify-center bg-background p-4">
      <div className="absolute top-6 right-6">
        <ThemeToggle />
      </div>

      <div className="flex w-full max-w-[840px] min-h-[480px] overflow-hidden rounded-[20px] border border-border bg-card shadow-2xl">
        {/* form */}
        <div className="flex flex-1 flex-col justify-center gap-4 p-10">
          <Logo />
          <h1 className="mt-1.5 font-heading text-2xl font-bold tracking-tight">
            {mode === "login" ? "Welcome back" : "Create your account"}
          </h1>
          <form onSubmit={onSubmit}>
            <FieldGroup>
              <Field>
                <FieldLabel
                  htmlFor="email"
                  className="text-[11.5px] font-semibold text-muted-foreground uppercase"
                >
                  Email
                </FieldLabel>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="you@company.com"
                  className="h-10 rounded-[10px] bg-muted"
                />
              </Field>
              <Field data-invalid={error ? true : undefined}>
                <FieldLabel
                  htmlFor="password"
                  className="text-[11.5px] font-semibold text-muted-foreground uppercase"
                >
                  Password
                </FieldLabel>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  required
                  minLength={8}
                  aria-invalid={error ? true : undefined}
                  autoComplete={
                    mode === "login" ? "current-password" : "new-password"
                  }
                  className="h-10 rounded-[10px] bg-muted"
                />
                {mode === "signup" ? (
                  <p className="text-[11.5px] text-muted-foreground">
                    Minimum 8 characters · no email verification in this
                    version.
                  </p>
                ) : null}
                {error ? <FieldError>{error}</FieldError> : null}
              </Field>
              <Button
                type="submit"
                disabled={pending}
                className="mt-1 h-11 rounded-[10px] text-[14px]"
              >
                {pending ? <Spinner data-icon="inline-start" /> : null}
                {mode === "login" ? "Log in" : "Create account"}
              </Button>
            </FieldGroup>
          </form>
          <p className="text-[13px] text-muted-foreground">
            {mode === "login" ? (
              <>
                No account yet?{" "}
                <Link
                  className="font-semibold text-primary"
                  href={next ? `/signup?next=${encodeURIComponent(next)}` : "/signup"}
                >
                  Sign up
                </Link>
              </>
            ) : (
              <>
                Have an account?{" "}
                <Link
                  className="font-semibold text-primary"
                  href={next ? `/login?next=${encodeURIComponent(next)}` : "/login"}
                >
                  Log in
                </Link>
              </>
            )}
          </p>
        </div>

        {/* context panel */}
        <div className="hidden flex-1 flex-col justify-center gap-4 border-l border-border bg-muted p-10 sm:flex">
          <h2 className="font-heading text-xl leading-snug font-bold tracking-tight">
            Hand out proxy tokens, never your real keys.
          </h2>
          <div className="mt-0.5 flex flex-col gap-2.5">
            {PITCH.map(({ icon: Icon, label }) => (
              <div key={label} className="flex items-center gap-2.5 text-[13.5px]">
                <Icon className="size-3.5 shrink-0 text-primary" />
                {label}
              </div>
            ))}
          </div>
          <div className="mt-2 rounded-xl border border-border bg-card p-3.5">
            <div className="mb-2.5 flex gap-2">
              <div className="flex-1 rounded-[9px] border border-border p-2.5">
                <div className="text-[8.5px] font-semibold text-muted-foreground uppercase">
                  Requests
                </div>
                <div className="mt-0.5 font-mono text-base font-semibold">128k</div>
              </div>
              <div className="flex-1 rounded-[9px] border border-border p-2.5">
                <div className="text-[8.5px] font-semibold text-muted-foreground uppercase">
                  Cost
                </div>
                <div className="mt-0.5 font-mono text-base font-semibold">$47</div>
              </div>
            </div>
            <Sparkline data={DEMO_TREND} height={44} />
          </div>
        </div>
      </div>
    </main>
  );
}
