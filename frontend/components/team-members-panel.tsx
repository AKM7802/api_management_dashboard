"use client";

import { Plus, Settings2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { BarList } from "@/components/charts/bar-list";
import { CodeBlock } from "@/components/code-block";
import { Badge } from "@/components/ui/badge";
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
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { compactNumber, currency, percent } from "@/lib/format";
import {
  useCreateInvitation,
  useInvitations,
  useMe,
  useRemoveMember,
  useRevokeInvitation,
  useTeamMembers,
  useTeamUsageByMember,
  useTeamUsageSummary,
  useUpdateMemberRole,
} from "@/lib/queries";
import type { InviteRole, Role } from "@/lib/types";

function InviteDialog({ teamId }: { teamId: string }) {
  const createInvite = useCreateInvitation(teamId);
  const [open, setOpen] = useState(false);
  const [createdLink, setCreatedLink] = useState<string | null>(null);

  function close() {
    setOpen(false);
    setCreatedLink(null);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    createInvite.mutate(
      {
        email: form.get("email") as string,
        role: form.get("role") as InviteRole,
      },
      {
        onSuccess: (invite) => {
          const url = `${window.location.origin}/invite/${invite.token}`;
          setCreatedLink(url);
        },
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : close())}>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus data-icon="inline-start" />
        Invite member
      </Button>
      <DialogContent>
        {createdLink ? (
          <>
            <DialogHeader>
              <DialogTitle>Share this invite link</DialogTitle>
              <DialogDescription>
                This is the only time it will be shown.
              </DialogDescription>
            </DialogHeader>
            <CodeBlock code={createdLink} label="invite link" />
            <DialogFooter>
              <Button onClick={close}>Done</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Invite a member</DialogTitle>
              <DialogDescription>
                They&apos;ll get a link to join with the role you choose.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={onSubmit}>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="invite-email">Email</FieldLabel>
                  <Input
                    id="invite-email"
                    name="email"
                    type="email"
                    required
                    placeholder="teammate@example.com"
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="invite-role">Role</FieldLabel>
                  <Select name="role" defaultValue="member">
                    <SelectTrigger id="invite-role">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="member">Member</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
                <Button type="submit" disabled={createInvite.isPending}>
                  {createInvite.isPending ? (
                    <Spinner data-icon="inline-start" />
                  ) : null}
                  Send invite
                </Button>
              </FieldGroup>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function TeamMembersPanel({
  teamId,
  isAdmin,
  isOwner,
}: {
  teamId: string;
  isAdmin: boolean;
  isOwner: boolean;
}) {
  const me = useMe();
  const members = useTeamMembers(teamId);
  const invitations = useInvitations(teamId);
  const updateRole = useUpdateMemberRole(teamId);
  const removeMember = useRemoveMember(teamId);
  const revokeInvite = useRevokeInvitation(teamId);
  const usageSummary = useTeamUsageSummary(teamId, "30d");
  const usageByMember = useTeamUsageByMember(teamId, "30d");

  function onRoleChange(userId: string, role: Role) {
    updateRole.mutate(
      { userId, role },
      { onSuccess: () => toast.success("Role updated") },
    );
  }

  function onRemove(userId: string, email: string) {
    if (!confirm(`Remove ${email} from this team?`)) return;
    removeMember.mutate(userId, {
      onSuccess: () => toast.success("Member removed"),
    });
  }

  function onRevokeInvite(id: string) {
    revokeInvite.mutate(id, { onSuccess: () => toast.success("Invite revoked") });
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 space-y-0">
          <CardTitle className="font-heading">Members</CardTitle>
          {isAdmin ? <InviteDialog teamId={teamId} /> : null}
        </CardHeader>
        <CardContent>
          {members.isPending ? (
            <Skeleton className="h-32 w-full" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  {isAdmin ? <TableHead>API access</TableHead> : null}
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.data?.map((m) => {
                  const isSelf = m.user_id === me.data?.id;
                  const canManage =
                    isAdmin && m.role !== "owner" && (isOwner || m.role !== "admin");
                  return (
                    <TableRow key={m.user_id}>
                      <TableCell>
                        {m.email}
                        {isSelf ? (
                          <span className="ml-2 text-xs text-muted-foreground">
                            (you)
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        {canManage ? (
                          <Select
                            value={m.role}
                            onValueChange={(v) => onRoleChange(m.user_id, v as Role)}
                          >
                            <SelectTrigger className="w-28">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectGroup>
                                <SelectItem value="member">member</SelectItem>
                                <SelectItem value="admin">admin</SelectItem>
                              </SelectGroup>
                            </SelectContent>
                          </Select>
                        ) : (
                          <Badge variant="secondary">{m.role}</Badge>
                        )}
                      </TableCell>
                      {isAdmin ? (
                        <TableCell>
                          <Button
                            variant="outline"
                            size="xs"
                            render={<Link href={`/teams/${teamId}/members/${m.user_id}`} />}
                            nativeButton={false}
                          >
                            <Settings2 data-icon="inline-start" />
                            View details
                          </Button>
                        </TableCell>
                      ) : null}
                      <TableCell className="text-right">
                        {canManage ? (
                          <Button
                            variant="destructive"
                            size="xs"
                            onClick={() => onRemove(m.user_id, m.email)}
                          >
                            Remove
                          </Button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {isAdmin ? (
        <Card>
          <CardHeader>
            <CardTitle className="font-heading">Pending invitations</CardTitle>
          </CardHeader>
          <CardContent>
            {invitations.isPending ? (
              <Skeleton className="h-24 w-full" />
            ) : invitations.data && invitations.data.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Expires</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invitations.data.map((inv) => (
                    <TableRow key={inv.id}>
                      <TableCell>{inv.email}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{inv.role}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(inv.expires_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="destructive"
                          size="xs"
                          onClick={() => onRevokeInvite(inv.id)}
                        >
                          Revoke
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <Empty>
                <EmptyHeader>
                  <EmptyTitle>No pending invitations</EmptyTitle>
                  <EmptyDescription>
                    Invite a teammate to get them access to granted APIs.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
          </CardContent>
        </Card>
      ) : null}

      {isAdmin ? (
        <>
          {usageSummary.data ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Card className="gap-2 py-4">
                <CardContent className="px-4">
                  <p className="text-sm text-muted-foreground">Requests</p>
                  <p className="text-2xl font-semibold tabular-nums">
                    {usageSummary.data.requests.toLocaleString()}
                  </p>
                </CardContent>
              </Card>
              <Card className="gap-2 py-4">
                <CardContent className="px-4">
                  <p className="text-sm text-muted-foreground">Tokens</p>
                  <p className="text-2xl font-semibold tabular-nums">
                    {compactNumber(usageSummary.data.total_tokens)}
                  </p>
                </CardContent>
              </Card>
              <Card className="gap-2 py-4">
                <CardContent className="px-4">
                  <p className="text-sm text-muted-foreground">Est. cost</p>
                  <p className="text-2xl font-semibold tabular-nums">
                    {currency(usageSummary.data.cost_usd)}
                  </p>
                </CardContent>
              </Card>
              <Card className="gap-2 py-4">
                <CardContent className="px-4">
                  <p className="text-sm text-muted-foreground">Error rate</p>
                  <p className="text-2xl font-semibold tabular-nums">
                    {percent(usageSummary.data.error_rate)}
                  </p>
                </CardContent>
              </Card>
            </div>
          ) : (
            <Skeleton className="h-24 w-full" />
          )}

          <div className="grid gap-4 lg:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle className="font-heading">Requests by member</CardTitle>
              </CardHeader>
              <CardContent>
                {usageByMember.isPending ? (
                  <Skeleton className="h-32 w-full" />
                ) : usageByMember.data && usageByMember.data.length > 0 ? (
                  <BarList
                    items={usageByMember.data
                      .filter((row) => row.requests > 0)
                      .map((row) => ({
                        key: row.user_id,
                        label: row.email,
                        value: row.requests,
                        formattedValue: row.requests.toLocaleString(),
                      }))}
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">No usage yet.</p>
                )}
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="font-heading">Usage by member</CardTitle>
                <CardDescription>Across every API this team owns.</CardDescription>
              </CardHeader>
              <CardContent>
                {usageByMember.isPending ? (
                  <Skeleton className="h-32 w-full" />
                ) : usageByMember.data && usageByMember.data.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Member</TableHead>
                        <TableHead className="text-right">Requests</TableHead>
                        <TableHead className="text-right">Tokens</TableHead>
                        <TableHead className="text-right">Cost</TableHead>
                        <TableHead className="text-right">Errors</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {usageByMember.data.map((row) => (
                        <TableRow key={row.user_id}>
                          <TableCell>
                            <Link
                              className="font-medium underline-offset-4 hover:underline"
                              href={`/teams/${teamId}/members/${row.user_id}`}
                            >
                              {row.email}
                            </Link>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {row.requests.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {compactNumber(row.total_tokens)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {currency(row.cost_usd)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {row.errors.toLocaleString()}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="text-sm text-muted-foreground">No usage yet.</p>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      ) : null}
    </div>
  );
}
