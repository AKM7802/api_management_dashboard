"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

export function BackLink({
  href,
  label = "Back",
}: {
  href: string;
  label?: string;
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className="-ml-2 w-fit"
      render={<Link href={href} />}
      nativeButton={false}
    >
      <ArrowLeft data-icon="inline-start" />
      {label}
    </Button>
  );
}
