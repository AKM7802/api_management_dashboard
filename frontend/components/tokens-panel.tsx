"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CodeBlock } from "@/components/code-block";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { API_URL } from "@/lib/api";
import { useCreateToken, useRevokeToken, useTokens } from "@/lib/queries";

function curlFor(token: string) {
  return `curl ${API_URL}/proxy/v1/chat/completions \\
  -H "Authorization: Bearer ${token}" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"gpt-4o-mini","messages":[{"role":"user","content":"hi"}]}'`;
}

export function TokensPanel({ apiId }: { apiId: string }) {
  const tokens = useTokens(apiId);
  const create = useCreateToken(apiId);
  const revoke = useRevokeToken(apiId);
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  async function onCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const name = new FormData(e.currentTarget).get("name") as string;
    create.mutate(
      { name },
      { onSuccess: (t) => setCreatedToken(t.token) },
    );
  }

  function closeDialog() {
    setDialogOpen(false);
    setCreatedToken(null);
  }

  async function copyToken() {
    if (createdToken) {
      await navigator.clipboard.writeText(createdToken);
      toast.success("Token copied");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <p className="max-w-md text-sm text-muted-foreground">
          Access tokens authenticate requests to this API — clients use one
          instead of your real key. Separate from LLM token usage, which is
          on the Usage tab.
        </p>
        <Dialog
          open={dialogOpen}
          onOpenChange={(open) => (open ? setDialogOpen(true) : closeDialog())}
        >
          <DialogTrigger render={<Button size="sm" />}>
            Create access token
          </DialogTrigger>
          <DialogContent>
            {createdToken ? (
              <>
                <DialogHeader>
                  <DialogTitle>Save your token now</DialogTitle>
                  <DialogDescription>
                    This is the only time it will be shown.
                  </DialogDescription>
                </DialogHeader>
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-2">
                    <code className="min-w-0 flex-1 truncate rounded-lg bg-muted px-3 py-2 font-mono text-sm">
                      {createdToken}
                    </code>
                    <Button variant="outline" size="sm" onClick={copyToken}>
                      Copy
                    </Button>
                  </div>
                  <CodeBlock code={curlFor(createdToken)} label="request.sh" />
                </div>
                <DialogFooter>
                  <Button onClick={closeDialog}>I&apos;ve saved it</Button>
                </DialogFooter>
              </>
            ) : (
              <>
                <DialogHeader>
                  <DialogTitle>Create access token</DialogTitle>
                  <DialogDescription>
                    Name it after the app or service that will use it.
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={onCreate}>
                  <FieldGroup>
                    <Field>
                      <FieldLabel htmlFor="token-name">Name</FieldLabel>
                      <Input
                        id="token-name"
                        name="name"
                        required
                        placeholder="production app"
                      />
                    </Field>
                    <Button type="submit" disabled={create.isPending}>
                      {create.isPending ? (
                        <Spinner data-icon="inline-start" />
                      ) : null}
                      Create
                    </Button>
                  </FieldGroup>
                </form>
              </>
            )}
          </DialogContent>
        </Dialog>
      </div>

      {tokens.isPending ? (
        <Skeleton className="h-24 w-full" />
      ) : tokens.data && tokens.data.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Access token</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Last used</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {tokens.data.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="font-medium">{t.name}</TableCell>
                <TableCell className="font-mono text-muted-foreground">
                  {t.token_prefix}…
                </TableCell>
                <TableCell>
                  <Badge
                    variant={t.status === "active" ? "success" : "outline"}
                  >
                    {t.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {t.last_used_at
                    ? new Date(t.last_used_at).toLocaleString()
                    : "never"}
                </TableCell>
                <TableCell className="text-right">
                  {t.status === "active" ? (
                    <Button
                      variant="destructive"
                      size="xs"
                      disabled={revoke.isPending}
                      onClick={() =>
                        revoke.mutate(t.id, {
                          onSuccess: () => toast.success("Token revoked"),
                        })
                      }
                    >
                      Revoke
                    </Button>
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>No access tokens yet</EmptyTitle>
            <EmptyDescription>
              Create one to start routing requests through the gateway.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      <Card>
        <CardHeader>
          <CardTitle>How to use</CardTitle>
          <CardDescription>
            Call the proxy with your access token — the real key is injected
            server-side.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CodeBlock code={curlFor("xpxy_live_...")} label="example.sh" />
        </CardContent>
      </Card>
    </div>
  );
}
