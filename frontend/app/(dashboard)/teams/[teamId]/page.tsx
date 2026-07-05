"use client";

import { Plus, Trash2 } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { setActiveTeamId } from "@/lib/api";
import { compactNumber, currency, percent } from "@/lib/format";
import {
  useCreateInvitation,
  useDeleteTeam,
  useInvitations,
  useMe,
  useRemoveMember,
  useRenameTeam,
  useRevokeInvitation,
  useTeamMembers,
  useTeams,
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

export default function TeamSettingsPage() {
  const { teamId } = useParams<{ teamId: string }>();
  const router = useRouter();
  const me = useMe();
  const teams = useTeams();
  const members = useTeamMembers(teamId);
  const invitations = useInvitations(teamId);
  const updateRole = useUpdateMemberRole(teamId);
  const removeMember = useRemoveMember(teamId);
  const revokeInvite = useRevokeInvitation(teamId);
  const renameTeam = useRenameTeam(teamId);
  const usageSummary = useTeamUsageSummary(teamId, "30d");
  const usageByMember = useTeamUsageByMember(teamId, "30d");

  const team = teams.data?.find((t) => t.id === teamId);
  const myRole: Role | undefined = team?.my_role;
  const isAdmin = myRole === "owner" || myRole === "admin";
  const isOwner = myRole === "owner";

  if (teams.isPending || !team) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  function onRename() {
    const name = prompt("New team name", team!.name);
    if (name) renameTeam.mutate({ name });
  }

  function onRoleChange(userId: string, role: Role) {
    updateRole.mutate(
      { userId, role },
      { onSuccess: () => toast.success("Role updated") },
    );
  }

  function onRemove(userId: string, email: string) {
    if (!confirm(`Remove ${email} from ${team!.name}?`)) return;
    removeMember.mutate(userId, {
      onSuccess: () => toast.success("Member removed"),
    });
  }

  function onRevokeInvite(id: string) {
    revokeInvite.mutate(id, { onSuccess: () => toast.success("Invite revoked") });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h1 className="font-heading text-2xl font-semibold tracking-tight">
            {team.name}
          </h1>
          <Badge variant="outline">{myRole}</Badge>
        </div>
        {isAdmin ? (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onRename}>
              Rename
            </Button>
          </div>
        ) : null}
      </div>

      <Tabs defaultValue="members">
        <TabsList>
          <TabsTrigger value="members">Members</TabsTrigger>
          {isAdmin ? <TabsTrigger value="invitations">Invitations</TabsTrigger> : null}
          {isAdmin ? <TabsTrigger value="usage">Usage</TabsTrigger> : null}
          {isOwner ? <TabsTrigger value="danger">Danger zone</TabsTrigger> : null}
        </TabsList>

        <TabsContent value="members" className="flex flex-col gap-4 pt-4">
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
        </TabsContent>

        {isAdmin ? (
          <TabsContent value="invitations" className="flex flex-col gap-4 pt-4">
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
          </TabsContent>
        ) : null}

        {isAdmin ? (
          <TabsContent value="usage" className="flex flex-col gap-4 pt-4">
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

            <Card>
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
                          <TableCell>{row.email}</TableCell>
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
          </TabsContent>
        ) : null}

        {isOwner ? (
          <TabsContent value="danger" className="pt-4">
            <Card className="border-destructive/40">
              <CardHeader>
                <CardTitle className="font-heading">Delete this team</CardTitle>
                <CardDescription>
                  Permanently deletes every team API, token, and grant. This
                  cannot be undone.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <DeleteTeamButton
                  teamId={teamId}
                  teamName={team.name}
                  onDeleted={() => router.push("/dashboard")}
                />
              </CardContent>
            </Card>
          </TabsContent>
        ) : null}
      </Tabs>
    </div>
  );
}

function DeleteTeamButton({
  teamId,
  teamName,
  onDeleted,
}: {
  teamId: string;
  teamName: string;
  onDeleted: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const deleteTeam = useDeleteTeam();

  function onDelete() {
    deleteTeam.mutate(teamId, {
      onSuccess: () => {
        setActiveTeamId(null);
        toast.success("Team deleted");
        onDeleted();
      },
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant="destructive" size="sm" onClick={() => setOpen(true)}>
        <Trash2 data-icon="inline-start" />
        Delete team
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete &quot;{teamName}&quot;?</DialogTitle>
          <DialogDescription>
            Type the team name to confirm. This deletes all team APIs, tokens,
            and grants immediately and permanently.
          </DialogDescription>
        </DialogHeader>
        <Input
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder={teamName}
        />
        <DialogFooter>
          <Button
            variant="destructive"
            disabled={confirmText !== teamName}
            onClick={onDelete}
          >
            Delete permanently
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
