"use client";

import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyContent,
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
import { useApis } from "@/lib/queries";

export default function DashboardPage() {
  const apis = useApis();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Your APIs</h1>
          <p className="text-sm text-muted-foreground">
            Upstream APIs you manage through proxy tokens.
          </p>
        </div>
        <Button render={<Link href="/apis/new" />}>Add API</Button>
      </div>

      {apis.isPending ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : apis.data && apis.data.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Provider</TableHead>
              <TableHead>Base URL</TableHead>
              <TableHead>Key</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {apis.data.map((a) => (
              <TableRow key={a.id}>
                <TableCell>
                  <Link className="font-medium underline-offset-4 hover:underline" href={`/apis/${a.id}`}>
                    {a.name}
                  </Link>
                </TableCell>
                <TableCell>{a.provider}</TableCell>
                <TableCell className="max-w-56 truncate text-muted-foreground">
                  {a.base_url}
                </TableCell>
                <TableCell className="font-mono text-muted-foreground">
                  ••••{a.secret_last4}
                </TableCell>
                <TableCell>
                  <Badge variant={a.status === "active" ? "secondary" : "outline"}>
                    {a.status}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>Add your first API</EmptyTitle>
            <EmptyDescription>
              Connect an upstream API (OpenAI, Anthropic, or any custom base
              URL), then mint a proxy token to use instead of the real key.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button render={<Link href="/apis/new" />}>Add API</Button>
          </EmptyContent>
        </Empty>
      )}
    </div>
  );
}
