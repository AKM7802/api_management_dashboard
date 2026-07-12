"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { Logo } from "@/components/logo";
import { TeamSwitcher } from "@/components/team-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { clearToken, getToken } from "@/lib/api";
import { useActiveMembership, useMe } from "@/lib/queries";

function initials(email: string) {
  return email.slice(0, 2).toUpperCase();
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const me = useMe();
  const { team, role } = useActiveMembership();
  const isTeamAdmin = role === "owner" || role === "admin";

  // client-side guard: no token → login
  useEffect(() => {
    if (!getToken()) router.replace("/login");
  }, [router]);

  function logout() {
    clearToken();
    router.replace("/login");
  }

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-card">
        <div className="mx-auto flex h-[57px] w-full max-w-6xl items-center gap-2 px-3 sm:gap-4 sm:px-6">
          <Link href="/dashboard" aria-label="Dashboard home" className="shrink-0">
            <Logo />
          </Link>
          <div className="min-w-0 sm:mx-auto">
            <TeamSwitcher />
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:ml-0 sm:gap-2">
            <ThemeToggle />
            {me.isPending ? (
              <Skeleton className="size-8 rounded-full" />
            ) : me.data ? (
              <DropdownMenu>
                <DropdownMenuTrigger render={<Button variant="ghost" className="h-8 gap-2 rounded-full px-1.5 sm:pr-3" />}>
                  <Avatar className="size-[26px]">
                    <AvatarFallback className="text-xs">
                      {initials(me.data.email)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="hidden text-[13px] text-muted-foreground sm:inline">{me.data.email}</span>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuGroup>
                    <DropdownMenuLabel className="truncate font-normal text-muted-foreground">
                      {me.data.email}
                    </DropdownMenuLabel>
                  </DropdownMenuGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuGroup>
                    {team && isTeamAdmin ? (
                      <DropdownMenuItem
                        onClick={() => router.push(`/teams/${team.id}`)}
                      >
                        Team settings
                      </DropdownMenuItem>
                    ) : null}
                    <DropdownMenuItem onClick={logout}>Log out</DropdownMenuItem>
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
        {children}
      </main>
    </div>
  );
}
