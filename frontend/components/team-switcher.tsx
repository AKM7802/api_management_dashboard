"use client";

import { Check, ChevronsUpDown, Plus, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
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
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useCreateTeam, useTeams } from "@/lib/queries";
import { useActiveTeam } from "@/lib/team-context";

export function TeamSwitcher() {
  const { activeTeamId, setActiveTeamId } = useActiveTeam();
  const teams = useTeams();
  const createTeam = useCreateTeam();
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);

  const activeTeam = teams.data?.find((t) => t.id === activeTeamId);
  const label = activeTeamId ? (activeTeam?.name ?? "Team") : "Personal";

  function selectPersonal() {
    setActiveTeamId(null);
    router.push("/dashboard");
  }

  function selectTeam(teamId: string) {
    setActiveTeamId(teamId);
    router.push("/dashboard");
  }

  async function onCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const name = new FormData(e.currentTarget).get("name") as string;
    createTeam.mutate(
      { name },
      {
        onSuccess: (team) => {
          toast.success(`Team "${team.name}" created`);
          setActiveTeamId(team.id);
          setDialogOpen(false);
          router.push("/dashboard");
        },
      },
    );
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="outline" size="sm" className="gap-1.5" />}
        >
          <Users className="size-3.5" />
          <span className="max-w-32 truncate">{label}</span>
          <ChevronsUpDown className="size-3.5 text-muted-foreground" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuLabel>Context</DropdownMenuLabel>
          <DropdownMenuItem onClick={selectPersonal}>
            {!activeTeamId ? <Check className="size-3.5" /> : <span className="size-3.5" />}
            Personal
          </DropdownMenuItem>
          {teams.data && teams.data.length > 0 ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Teams</DropdownMenuLabel>
              {teams.data.map((team) => (
                <DropdownMenuItem
                  key={team.id}
                  onClick={() => selectTeam(team.id)}
                >
                  {activeTeamId === team.id ? (
                    <Check className="size-3.5" />
                  ) : (
                    <span className="size-3.5" />
                  )}
                  <span className="flex-1 truncate">{team.name}</span>
                  <Badge variant="outline" className="ml-auto shrink-0 text-xs">
                    {team.my_role}
                  </Badge>
                </DropdownMenuItem>
              ))}
            </>
          ) : null}
          <DropdownMenuSeparator />
          {/* setDialogOpen directly (not DialogTrigger) — nesting a trigger
              inside the dropdown races with the dropdown's own close/unmount */}
          <DropdownMenuItem onClick={() => setDialogOpen(true)}>
            <Plus className="size-3.5" />
            Create team
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create a team</DialogTitle>
            <DialogDescription>
              You&apos;ll become its owner and can invite others afterward.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={onCreate}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="team-name">Team name</FieldLabel>
                <Input id="team-name" name="name" required placeholder="Acme Corp" />
              </Field>
              <DialogFooter>
                <Button type="submit" disabled={createTeam.isPending}>
                  {createTeam.isPending ? <Spinner data-icon="inline-start" /> : null}
                  Create
                </Button>
              </DialogFooter>
            </FieldGroup>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
