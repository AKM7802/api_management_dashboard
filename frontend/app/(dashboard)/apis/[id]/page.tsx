"use client";

import { Check, Copy, KeyRound, MoreHorizontal, Pencil, Shield } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { AccessPanel } from "@/components/access-panel";
import { TokensPanel } from "@/components/tokens-panel";
import { UsagePanel } from "@/components/usage-panel";
import { API_URL } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  useActiveMembership,
  useApi,
  useDeleteApi,
  useUpdateApi,
} from "@/lib/queries";

function EditConnectionDialog({
  apiId,
  baseUrl,
  open,
  onOpenChange,
}: {
  apiId: string;
  baseUrl: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const update = useUpdateApi(apiId);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const base_url = form.get("base_url") as string;
    const secret = form.get("secret") as string;
    update.mutate(
      { base_url, secret: secret.trim() ? secret : undefined },
      {
        onSuccess: () => {
          toast.success("Connection updated");
          onOpenChange(false);
        },
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit connection</DialogTitle>
          <DialogDescription>
            Update where requests are forwarded and/or replace the upstream
            secret. Existing proxy tokens keep working — nothing else changes.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="edit-base-url">Base URL</FieldLabel>
              <Input
                id="edit-base-url"
                name="base_url"
                type="url"
                required
                defaultValue={baseUrl ?? ""}
                placeholder="https://api.example.com"
              />
              <FieldDescription>
                The upstream API&apos;s root URL. Requests to your proxy token
                are forwarded here.
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="edit-secret">New API key</FieldLabel>
              <Input
                id="edit-secret"
                name="secret"
                type="password"
                autoComplete="off"
                placeholder="Leave blank to keep the current key"
              />
              <FieldDescription>
                Sent over TLS, stored encrypted. Only the last 4 characters
                stay visible.
              </FieldDescription>
            </Field>
            <DialogFooter>
              <Button type="submit" disabled={update.isPending}>
                {update.isPending ? <Spinner data-icon="inline-start" /> : null}
                Save changes
              </Button>
            </DialogFooter>
          </FieldGroup>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function ApiDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const api = useApi(id);
  const update = useUpdateApi(id);
  const del = useDeleteApi();
  const { role } = useActiveMembership();
  const [editOpen, setEditOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const proxyUrl = `${API_URL}/proxy`;

  async function copyProxyUrl() {
    await navigator.clipboard.writeText(proxyUrl);
    setCopied(true);
    toast.success("Proxy URL copied");
    setTimeout(() => setCopied(false), 1500);
  }

  if (api.isPending) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-5 w-56" />
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }
  if (!api.data) return null;
  const a = api.data;

  // personal API (team_id null) → the caller is always its sole owner, full
  // control, as today. Team API → only owner/admin can configure or grant.
  const isTeamApi = a.team_id !== null;
  const isAdmin = !isTeamApi || role === "owner" || role === "admin";
  const isActive = a.status === "active";

  function toggleStatus() {
    const next = isActive ? "disabled" : "active";
    update.mutate(
      { status: next },
      { onSuccess: () => toast.success(`API ${next}`) },
    );
  }

  function onRename() {
    const name = prompt("Rename API", a.name);
    if (name && name.trim()) {
      update.mutate(
        { name: name.trim() },
        { onError: (err) => toast.error(err.message) },
      );
    }
  }

  function onDelete() {
    if (!confirm(`Delete "${a.name}" and all its tokens? This cannot be undone.`))
      return;
    del.mutate(a.id, {
      onSuccess: () => {
        toast.success("API deleted");
        router.push("/dashboard");
      },
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="text-sm text-muted-foreground">
        <Link href="/dashboard" className="text-primary hover:underline">
          Overview
        </Link>{" "}
        / APIs / <span className="font-semibold text-foreground">{a.name}</span>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-heading text-2xl font-bold tracking-tight">
          {a.name}
        </h1>
        {isAdmin ? (
          <button
            type="button"
            onClick={onRename}
            aria-label="Rename API"
            title="Rename API"
            className="text-muted-foreground hover:text-foreground"
          >
            <Pencil className="size-4" />
          </button>
        ) : null}
        <button
          type="button"
          onClick={copyProxyUrl}
          title="This is the URL your tokens call — copy it into your client"
          className="flex items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/5 px-2.5 py-1 font-mono text-xs text-primary hover:bg-primary/10"
        >
          {proxyUrl}
          {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
        </button>
        {isAdmin ? (
          <>
            <span className="rounded-lg border border-border px-2.5 py-1 font-mono text-xs text-muted-foreground">
              {a.base_url}
            </span>
            <span className="rounded-lg border border-border px-2.5 py-1 font-mono text-xs text-muted-foreground">
              key ••••{a.secret_last4}
            </span>
          </>
        ) : null}

        {isAdmin ? (
          <div className="ml-auto flex items-center gap-3">
            <span className="text-xs font-semibold text-muted-foreground">
              {a.status}
            </span>
            <Switch
              checked={isActive}
              onCheckedChange={toggleStatus}
              title={isActive ? "Disable this API" : "Enable this API"}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditOpen(true)}
              title="Edit the upstream base URL or API key"
            >
              Edit connection
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label="More actions"
                    title="More actions"
                  />
                }
              >
                <MoreHorizontal className="size-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem variant="destructive" onClick={onDelete}>
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ) : null}
      </div>

      <EditConnectionDialog
        apiId={a.id}
        baseUrl={a.base_url}
        open={editOpen}
        onOpenChange={setEditOpen}
      />

      <Tabs defaultValue="usage">
        <TabsList variant="line">
          <TabsTrigger value="usage">Usage</TabsTrigger>
          <TabsTrigger value="tokens">
            <KeyRound data-icon="inline-start" />
            Access Tokens
          </TabsTrigger>
          {isTeamApi && isAdmin ? (
            <TabsTrigger value="access">
              <Shield data-icon="inline-start" />
              Access
            </TabsTrigger>
          ) : (
            <TabsTrigger value="access" disabled>
              <Shield data-icon="inline-start" />
              Access <span className="text-muted-foreground/70">· team only</span>
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="usage" className="pt-4">
          <UsagePanel apiId={a.id} teamId={a.team_id} isAdmin={isAdmin} />
        </TabsContent>

        <TabsContent value="tokens" className="pt-4">
          <TokensPanel apiId={a.id} />
        </TabsContent>

        {isTeamApi && isAdmin ? (
          <TabsContent value="access" className="pt-4">
            <AccessPanel apiId={a.id} teamId={a.team_id!} />
          </TabsContent>
        ) : null}
      </Tabs>
    </div>
  );
}
