"use client";

import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useGrantAccess,
  useGrants,
  useRevokeGrant,
  useTeamMembers,
} from "@/lib/queries";

export function AccessPanel({ apiId, teamId }: { apiId: string; teamId: string }) {
  const members = useTeamMembers(teamId);
  const grants = useGrants(apiId);
  const grantAccess = useGrantAccess(apiId);
  const revokeGrant = useRevokeGrant(apiId);

  if (members.isPending || grants.isPending) {
    return <Skeleton className="h-40 w-full" />;
  }

  const grantedIds = new Set((grants.data ?? []).map((g) => g.user_id));
  // owners/admins have implicit access — only plain members need a grant
  const grantable = (members.data ?? []).filter((m) => m.role === "member");

  function toggle(userId: string, currentlyGranted: boolean) {
    if (currentlyGranted) {
      revokeGrant.mutate(userId, {
        onSuccess: () => toast.success("Access revoked"),
      });
    } else {
      grantAccess.mutate(userId, {
        onSuccess: () => toast.success("Access granted"),
      });
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-lg text-sm text-muted-foreground">
        Owners and admins always have access. Grant individual members access
        to let them mint their own tokens and see their own usage for this
        API.
      </p>
      {grantable.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>No members to grant</EmptyTitle>
            <EmptyDescription>
              Invite teammates from Team settings — once they join as a
              member, they&apos;ll show up here.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Member</TableHead>
              <TableHead>Access</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {grantable.map((m) => {
              const granted = grantedIds.has(m.user_id);
              return (
                <TableRow key={m.user_id}>
                  <TableCell>{m.email}</TableCell>
                  <TableCell>
                    <Badge variant={granted ? "secondary" : "outline"}>
                      {granted ? "Granted" : "No access"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="xs"
                      variant={granted ? "destructive" : "outline"}
                      disabled={grantAccess.isPending || revokeGrant.isPending}
                      onClick={() => toggle(m.user_id, granted)}
                    >
                      {granted ? "Revoke" : "Grant"}
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
