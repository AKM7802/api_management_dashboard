"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { useCreateApi } from "@/lib/queries";
import type { Provider } from "@/lib/types";

const DEFAULT_BASE_URLS: Record<Provider, string> = {
  openai: "https://api.openai.com",
  anthropic: "https://api.anthropic.com",
  custom: "",
};

export default function NewApiPage() {
  const router = useRouter();
  const create = useCreateApi();
  const [provider, setProvider] = useState<Provider>("openai");
  const [baseUrl, setBaseUrl] = useState(DEFAULT_BASE_URLS.openai);

  function onProviderChange(value: Provider) {
    setProvider(value);
    setBaseUrl(DEFAULT_BASE_URLS[value]);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    create.mutate(
      {
        name: form.get("name") as string,
        provider,
        base_url: baseUrl,
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
            Your key is encrypted at rest and never shown again.
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
                  placeholder="My OpenAI key"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="provider">Provider</FieldLabel>
                <Select
                  value={provider}
                  onValueChange={(v) => onProviderChange(v as Provider)}
                >
                  <SelectTrigger id="provider">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="openai">OpenAI</SelectItem>
                      <SelectItem value="anthropic">Anthropic</SelectItem>
                      <SelectItem value="custom">Custom</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="base_url">Base URL</FieldLabel>
                <Input
                  id="base_url"
                  name="base_url"
                  type="url"
                  required
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="https://api.example.com"
                />
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
