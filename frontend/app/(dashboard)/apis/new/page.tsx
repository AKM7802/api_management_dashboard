"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { BackLink } from "@/components/back-link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useActiveMembership,
  useAttachApiToTeam,
  useCreateApi,
  usePersonalApisForAttach,
} from "@/lib/queries";

function CreateApiForm({ onCreated }: { onCreated: (apiId: string) => void }) {
  const create = useCreateApi();

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
          onCreated(created.id);
        },
      },
    );
  }

  return (
    <form onSubmit={onSubmit}>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="name">Name</FieldLabel>
          <Input id="name" name="name" required placeholder="My API" />
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
            The upstream API&apos;s root URL. Requests to your proxy token are
            forwarded here.
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
            Sent over TLS, stored encrypted. Only the last 4 characters stay
            visible.
          </FieldDescription>
          {create.isError ? <FieldError>{create.error.message}</FieldError> : null}
        </Field>
        <Button type="submit" disabled={create.isPending}>
          {create.isPending ? <Spinner data-icon="inline-start" /> : null}
          Add API
        </Button>
      </FieldGroup>
    </form>
  );
}

function AttachExistingApi({
  teamId,
  onAttached,
}: {
  teamId: string;
  onAttached: (apiId: string) => void;
}) {
  const personalApis = usePersonalApisForAttach(true);
  const attach = useAttachApiToTeam();

  function onAttach(apiId: string) {
    attach.mutate(
      { apiId, teamId },
      {
        onSuccess: (updated) => {
          toast.success("API added to the team");
          onAttached(updated.id);
        },
      },
    );
  }

  if (personalApis.isPending) {
    return <Skeleton className="h-32 w-full" />;
  }

  if (!personalApis.data || personalApis.data.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>No personal APIs to add</EmptyTitle>
          <EmptyDescription>
            You don&apos;t have any personal APIs outside a team yet. Create a
            new one instead.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        Move one of your existing personal APIs into this team — its tokens
        and usage history come with it.
      </p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Base URL</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {personalApis.data.map((a) => (
            <TableRow key={a.id}>
              <TableCell>{a.name}</TableCell>
              <TableCell className="max-w-48 truncate font-mono text-xs text-muted-foreground">
                {a.base_url}
              </TableCell>
              <TableCell className="text-right">
                <Button
                  size="xs"
                  variant="outline"
                  disabled={attach.isPending}
                  onClick={() => onAttach(a.id)}
                >
                  Add to team
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export default function NewApiPage() {
  const router = useRouter();
  const { role, team } = useActiveMembership();
  const [mode, setMode] = useState<"create" | "existing">("create");

  if (role === "member") {
    return (
      <div className="mx-auto flex w-full max-w-lg flex-col gap-4">
        <BackLink href="/dashboard" label="Back to dashboard" />
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

  function goToApi(apiId: string) {
    router.push(`/apis/${apiId}`);
  }

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-4">
      <BackLink href="/dashboard" label="Back to dashboard" />
      <Card>
        <CardHeader>
          <CardTitle>Add an API</CardTitle>
          <CardDescription>
            {mode === "create"
              ? "Works with any HTTP API — nothing here is tied to a specific provider. Your key is encrypted at rest and never shown again."
              : `Add one of your existing personal APIs to ${team?.name ?? "this team"}.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {team ? (
            <Tabs value={mode} onValueChange={(v) => setMode(v as typeof mode)}>
              <TabsList className="w-full">
                <TabsTrigger value="create" className="flex-1">
                  Create new
                </TabsTrigger>
                <TabsTrigger value="existing" className="flex-1">
                  Use existing API
                </TabsTrigger>
              </TabsList>
            </Tabs>
          ) : null}

          {mode === "create" || !team ? (
            <CreateApiForm onCreated={goToApi} />
          ) : (
            <AttachExistingApi teamId={team.id} onAttached={goToApi} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
