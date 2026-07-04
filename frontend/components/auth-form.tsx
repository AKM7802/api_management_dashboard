"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { api, setToken } from "@/lib/api";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
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
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setPending(false);
    }
  }

  return (
    <main className="flex min-h-svh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>
            {mode === "login" ? "Welcome back" : "Create your account"}
          </CardTitle>
          <CardDescription>
            {mode === "login"
              ? "Log in to your API dashboard."
              : "Start managing your APIs in minutes."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="email">Email</FieldLabel>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="you@example.com"
                />
              </Field>
              <Field data-invalid={error ? true : undefined}>
                <FieldLabel htmlFor="password">Password</FieldLabel>
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
                />
                {error ? <FieldError>{error}</FieldError> : null}
              </Field>
              <Button type="submit" disabled={pending}>
                {pending ? <Spinner data-icon="inline-start" /> : null}
                {mode === "login" ? "Log in" : "Sign up"}
              </Button>
            </FieldGroup>
          </form>
          <p className="mt-4 text-sm text-muted-foreground">
            {mode === "login" ? (
              <>
                No account?{" "}
                <Link className="underline" href="/signup">
                  Sign up
                </Link>
              </>
            ) : (
              <>
                Already registered?{" "}
                <Link className="underline" href="/login">
                  Log in
                </Link>
              </>
            )}
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
