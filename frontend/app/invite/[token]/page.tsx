"use client";

import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";

import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { ApiError, getToken } from "@/lib/api";
import { useAcceptInvitation, useInvitationPreview } from "@/lib/queries";

export default function InviteAcceptPage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const preview = useInvitationPreview(token);
  const accept = useAcceptInvitation();
  const isLoggedIn = !!getToken();

  function onAccept() {
    accept.mutate(token, {
      onSuccess: () => {
        toast.success("You've joined the team");
        router.push("/dashboard");
      },
    });
  }

  const notFound = preview.isError && preview.error instanceof ApiError && preview.error.status === 404;
  const expired = preview.isError && preview.error instanceof ApiError && preview.error.status === 410;

  return (
    <main className="flex min-h-svh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <Logo className="mb-2" />
          <CardTitle>Team invitation</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-4 text-center">
          {preview.isPending ? (
            <Skeleton className="h-20 w-full" />
          ) : notFound ? (
            <CardDescription>
              This invitation link isn&apos;t valid. Ask whoever invited you
              for a new one.
            </CardDescription>
          ) : expired ? (
            <CardDescription>
              This invitation has expired or was already used. Ask for a new
              invite link.
            </CardDescription>
          ) : preview.data ? (
            <>
              <CardDescription>
                You&apos;ve been invited to join{" "}
                <span className="font-medium text-foreground">
                  {preview.data.team_name}
                </span>{" "}
                as <span className="font-medium text-foreground">{preview.data.role}</span>.
              </CardDescription>
              {isLoggedIn ? (
                <Button className="w-full" onClick={onAccept} disabled={accept.isPending}>
                  {accept.isPending ? <Spinner data-icon="inline-start" /> : null}
                  Accept invitation
                </Button>
              ) : (
                <div className="flex w-full flex-col gap-2">
                  <CardDescription>Log in or sign up to accept.</CardDescription>
                  <Button
                    className="w-full"
                    render={<Link href={`/login?next=/invite/${token}`} />}
                    nativeButton={false}
                  >
                    Log in
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full"
                    render={<Link href={`/signup?next=/invite/${token}`} />}
                    nativeButton={false}
                  >
                    Sign up
                  </Button>
                </div>
              )}
            </>
          ) : null}
        </CardContent>
      </Card>
    </main>
  );
}
