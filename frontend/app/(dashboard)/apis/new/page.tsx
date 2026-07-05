"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useActiveMembership, useCreateApi } from "@/lib/queries";

export default function NewApiPage() {
  const router = useRouter();
  const create = useCreateApi();
  const { role } = useActiveMembership();

  if (role === "member") {
    return (
      <div className="mx-auto w-full max-w-lg">
        <Card>
          <CardHeader>
            <CardTitle>Members can&apos;t add APIs</CardTitle>
            <CardDescription>
              Only this team&apos;s owner or admins can add APIs. Ask one of
              them to add it and grant you access.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    create.mutate(
      {
        name: form.get("name") as string,
        base_url: form.get("base_url") as string,
        secret: form.get("secret") as string,
      },
      {
        onSuccess: (created) => {
          toast.success("API added");
          router.push(`/apis/${created.id}`);
        },
      },
    );
  }

  return (
    <div className="mx-auto w-full max-w-lg">
      <Card>
        <CardHeader>
          <CardTitle>Add an API</CardTitle>
          <CardDescription>
            Works with any HTTP API — nothing here is tied to a specific
            provider. Your key is encrypted at rest and never shown again.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="name">Name</FieldLabel>
                <Input
                  id="name"
                  name="name"
                  required
                  placeholder="My API"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="base_url">Base URL</FieldLabel>
                <Input
                  id="base_url"
                  name="base_url"
                  type="url"
                  required
                  placeholder="https://api.example.com"
                />
                <FieldDescription>
                  The upstream API&apos;s root URL. Requests to your proxy
                  token are forwarded here.
                </FieldDescription>
              </Field>
              <Field data-invalid={create.isError ? true : undefined}>
                <FieldLabel htmlFor="secret">API key</FieldLabel>
                <Input
                  id="secret"
                  name="secret"
                  type="password"
                  required
                  autoComplete="off"
                  placeholder="sk-..."
                  aria-invalid={create.isError ? true : undefined}
                />
                <FieldDescription>
                  Sent over TLS, stored encrypted. Only the last 4 characters
                  stay visible.
                </FieldDescription>
                {create.isError ? (
                  <FieldError>{create.error.message}</FieldError>
                ) : null}
              </Field>
              <Button type="submit" disabled={create.isPending}>
                {create.isPending ? <Spinner data-icon="inline-start" /> : null}
                Add API
              </Button>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
