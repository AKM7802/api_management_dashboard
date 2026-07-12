"use client";

import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";

import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { ApiError, getToken } from "@/lib/api";
import { useAcceptInvitation, useInvitationPreview } from "@/lib/queries";
import { useActiveTeam } from "@/lib/team-context";

const ROLE_BLURB: Record<string, string> = {
  admin:
    "Admins can invite and manage members, add APIs, and grant teammates access.",
  member:
    "Members can mint their own tokens and see their own usage for the APIs an admin grants them.",
};

export default function InviteAcceptPage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const preview = useInvitationPreview(token);
  const accept = useAcceptInvitation();
  const { setActiveTeamId } = useActiveTeam();
  const isLoggedIn = !!getToken();

  function onAccept() {
    accept.mutate(token, {
      onSuccess: () => {
        // land the new member directly on the team they just joined instead
        // of their (likely empty) Personal dashboard — otherwise there's no
        // visible link between "joined a team" and where that team went
        if (preview.data) setActiveTeamId(preview.data.team_id);
        toast.success(`You've joined ${preview.data?.team_name ?? "the team"}`);
        router.push("/dashboard");
      },
    });
  }

  const notFound = preview.isError && preview.error instanceof ApiError && preview.error.status === 404;
  const expired = preview.isError && preview.error instanceof ApiError && preview.error.status === 410;

  return (
    <main className="relative flex min-h-svh items-center justify-center bg-background p-8">
      <div className="absolute top-6 right-6">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-[440px] overflow-hidden rounded-[20px] border border-border bg-card shadow-2xl">
        <div className="flex flex-col items-center gap-4 px-8 pt-9 pb-8 text-center">
          <Logo />

          {preview.isPending ? (
            <Skeleton className="mt-2 h-24 w-full" />
          ) : notFound ? (
            <p className="mt-2 text-[13.5px] text-muted-foreground">
              This invitation link isn&apos;t valid. Ask whoever invited you
              for a new one.
            </p>
          ) : expired ? (
            <p className="mt-2 text-[13.5px] text-muted-foreground">
              This invitation has expired or was already used. Ask for a new
              invite link.
            </p>
          ) : preview.data ? (
            <>
              <p className="mt-1.5 text-[13.5px] text-muted-foreground">
                You&apos;ve been invited to join
              </p>
              <div className="flex items-center gap-2.5">
                <span className="inline-block size-[34px] shrink-0 rounded-[10px] bg-primary" />
                <span className="font-heading text-2xl font-bold tracking-tight">
                  {preview.data.team_name}
                </span>
              </div>
              <span className="rounded-full bg-accent px-3.5 py-1 font-mono text-xs font-semibold text-accent-foreground uppercase">
                Role · {preview.data.role}
              </span>
              <p className="max-w-[320px] text-[13px] leading-relaxed text-muted-foreground">
                {ROLE_BLURB[preview.data.role] ?? ROLE_BLURB.member}
              </p>

              {isLoggedIn ? (
                <Button
                  className="mt-1.5 h-11 w-full rounded-[10px] text-[14px]"
                  onClick={onAccept}
                  disabled={accept.isPending}
                >
                  {accept.isPending ? <Spinner data-icon="inline-start" /> : null}
                  Accept invitation
                </Button>
              ) : (
                <Button
                  className="mt-1.5 h-11 w-full rounded-[10px] text-[14px]"
                  render={<Link href={`/login?next=/invite/${token}`} />}
                  nativeButton={false}
                >
                  Log in or sign up to accept
                </Button>
              )}

              <span className="font-mono text-[11.5px] text-muted-foreground/70">
                invite/{token.slice(0, 6)}… · bound to {preview.data.email}
              </span>
            </>
          ) : null}
        </div>
      </div>
    </main>
  );
}
