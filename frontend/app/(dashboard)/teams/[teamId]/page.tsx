"use client";

import { Trash2 } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { BackLink } from "@/components/back-link";
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
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { setActiveTeamId } from "@/lib/api";
import { useDeleteTeam, useRenameTeam, useTeams } from "@/lib/queries";
import type { Role } from "@/lib/types";

export default function TeamSettingsPage() {
  const { teamId } = useParams<{ teamId: string }>();
  const router = useRouter();
  const teams = useTeams();
  const renameTeam = useRenameTeam(teamId);

  const team = teams.data?.find((t) => t.id === teamId);
  const myRole: Role | undefined = team?.my_role;
  const isAdmin = myRole === "owner" || myRole === "admin";
  const isOwner = myRole === "owner";

  if (teams.isPending || !team) {
    return (
      <div className="flex flex-col gap-4">
        <BackLink href="/dashboard" label="Back to dashboard" />
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  function onRename() {
    const name = prompt("New team name", team!.name);
    if (name) renameTeam.mutate({ name });
  }

  return (
    <div className="flex flex-col gap-6">
      <BackLink href="/dashboard" label="Back to dashboard" />

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h1 className="font-heading text-2xl font-semibold tracking-tight">
            {team.name}
          </h1>
          <Badge variant={myRole === "owner" ? "accent" : "outline"}>{myRole}</Badge>
        </div>
        {isAdmin ? (
          <Button variant="outline" size="sm" onClick={onRename}>
            Rename
          </Button>
        ) : null}
      </div>

      <p className="text-sm text-muted-foreground">
        Members, invitations, and per-member usage now live on the{" "}
        <button
          className="underline underline-offset-4"
          onClick={() => router.push("/dashboard")}
        >
          dashboard&apos;s Members tab
        </button>{" "}
        while this team is active.
      </p>

      {isOwner ? (
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
      ) : null}
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
