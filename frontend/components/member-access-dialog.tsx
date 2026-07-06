"use client";

import { Settings2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { compactNumber, currency } from "@/lib/format";
import {
  useGrantAccess,
  useMemberApiAccess,
  useRevokeGrant,
} from "@/lib/queries";
import type { MemberApiAccessRow } from "@/lib/types";

function AccessRow({
  row,
  userId,
}: {
  row: MemberApiAccessRow;
  userId: string;
}) {
  const grant = useGrantAccess(row.api_id);
  const revoke = useRevokeGrant(row.api_id);
  const pending = grant.isPending || revoke.isPending;

  function toggle() {
    if (row.granted) {
      revoke.mutate(userId, { onSuccess: () => toast.success("Access revoked") });
    } else {
      grant.mutate(userId, { onSuccess: () => toast.success("Access granted") });
    }
  }

  return (
    <TableRow>
      <TableCell className="font-medium">{row.name}</TableCell>
      <TableCell>
        {row.implicit ? (
          <Badge variant="secondary">Always (admin/owner)</Badge>
        ) : (
          <Button
            size="xs"
            variant={row.granted ? "destructive" : "outline"}
            disabled={pending}
            onClick={toggle}
          >
            {row.granted ? "Revoke" : "Grant"}
          </Button>
        )}
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
  );
}

export function MemberAccessDialog({
  teamId,
  userId,
  email,
}: {
  teamId: string;
  userId: string;
  email: string;
}) {
  const [open, setOpen] = useState(false);
  const access = useMemberApiAccess(teamId, userId, "30d", open);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant="outline" size="xs" onClick={() => setOpen(true)}>
        <Settings2 data-icon="inline-start" />
        Manage access
      </Button>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{email}</DialogTitle>
          <DialogDescription>
            Every API this team owns, whether they can use it, and what
            they&apos;ve actually used in the last 30 days.
          </DialogDescription>
        </DialogHeader>
        {access.isPending ? (
          <Skeleton className="h-40 w-full" />
        ) : access.data && access.data.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>API</TableHead>
                <TableHead>Access</TableHead>
                <TableHead className="text-right">Requests</TableHead>
                <TableHead className="text-right">Tokens</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead className="text-right">Errors</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {access.data.map((row) => (
                <AccessRow key={row.api_id} row={row} userId={userId} />
              ))}
            </TableBody>
          </Table>
        ) : (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>No team APIs yet</EmptyTitle>
              <EmptyDescription>
                Add an API to this team before granting access to it.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </DialogContent>
    </Dialog>
  );
}
