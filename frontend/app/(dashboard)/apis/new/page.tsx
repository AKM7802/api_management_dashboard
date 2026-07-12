"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { BackLink } from "@/components/back-link";
import { CodeBlock } from "@/components/code-block";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { ApiError, API_URL } from "@/lib/api";
import {
  useActiveMembership,
  useAttachApiToTeam,
  useCreateApi,
  usePersonalApisForAttach,
} from "@/lib/queries";
import type { ManagedApiCreated } from "@/lib/types";

function curlFor(token: string) {
  return `curl ${API_URL}/proxy/your/path \\
  -H "Authorization: Bearer ${token}" \\
  -H "Content-Type: application/json" \\
  -d '{}'`;
}

function CreateApiForm({
  onDone,
  hasTeam,
}: {
  onDone: (apiId: string) => void;
  hasTeam: boolean;
}) {
  const create = useCreateApi();
  const [created, setCreated] = useState<ManagedApiCreated | null>(null);
  const nameError =
    create.error instanceof ApiError && create.error.status === 409
      ? create.error.message
      : null;

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
        onSuccess: (data) => {
          toast.success("API added");
          setCreated(data);
        },
      },
    );
  }

  async function copyToken() {
    if (created) {
      await navigator.clipboard.writeText(created.token.token);
      toast.success("Token copied");
    }
  }

  return (
    <>
      <form onSubmit={onSubmit}>
        <FieldGroup>
          <Field data-invalid={nameError ? true : undefined}>
            <FieldLabel htmlFor="name">Name</FieldLabel>
            <Input
              id="name"
              name="name"
              required
              placeholder="My API"
              aria-invalid={nameError ? true : undefined}
            />
            <FieldDescription>
              Must be unique among your{hasTeam ? " team's" : ""} APIs.
            </FieldDescription>
            {nameError ? <FieldError>{nameError}</FieldError> : null}
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
          <Field data-invalid={create.isError && !nameError ? true : undefined}>
            <FieldLabel htmlFor="secret">API key</FieldLabel>
            <Input
              id="secret"
              name="secret"
              type="password"
              required
              autoComplete="off"
              placeholder="sk-..."
              aria-invalid={create.isError && !nameError ? true : undefined}
            />
            <FieldDescription>
              Sent over TLS, stored encrypted. Only the last 4 characters stay
              visible.
            </FieldDescription>
            {create.isError && !nameError ? (
              <FieldError>{create.error.message}</FieldError>
            ) : null}
          </Field>
          <Button type="submit" disabled={create.isPending}>
            {create.isPending ? <Spinner data-icon="inline-start" /> : null}
            Add API
          </Button>
        </FieldGroup>
      </form>

      <Dialog
        open={created !== null}
        onOpenChange={(open) => {
          if (!open && created) onDone(created.id);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>API added — save your token now</DialogTitle>
            <DialogDescription>
              A proxy token was created for you so you can start calling this
              API right away. This is the only time it will be shown.
            </DialogDescription>
          </DialogHeader>
          {created ? (
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-muted/40 p-3">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-[10.5px] font-semibold tracking-wide text-muted-foreground uppercase">
                    Base URL
                  </span>
                  <span className="truncate font-mono text-xs">
                    {created.base_url}
                  </span>
                </div>
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-[10.5px] font-semibold tracking-wide text-muted-foreground uppercase">
                    API key
                  </span>
                  <span className="truncate font-mono text-xs">
                    ••••{created.secret_last4}
                  </span>
                </div>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-[10.5px] font-semibold tracking-wide text-muted-foreground uppercase">
                  Proxy token
                </span>
                <div className="flex items-center gap-2">
                  <code className="min-w-0 flex-1 truncate rounded-lg bg-muted px-3 py-2 font-mono text-sm">
                    {created.token.token}
                  </code>
                  <Button variant="outline" size="sm" onClick={copyToken}>
                    Copy
                  </Button>
                </div>
              </div>
              <CodeBlock code={curlFor(created.token.token)} label="request.sh" />
            </div>
          ) : null}
          <DialogFooter>
            <Button onClick={() => created && onDone(created.id)}>
              Go to API
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
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
        onError: (err) => toast.error(err.message),
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
            <CreateApiForm onDone={goToApi} hasTeam={!!team} />
          ) : (
            <AttachExistingApi teamId={team.id} onAttached={goToApi} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
