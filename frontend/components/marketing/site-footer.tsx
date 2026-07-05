import Link from "next/link";

import { Logo } from "@/components/logo";

const COLUMNS = [
  {
    title: "Product",
    links: [
      { href: "#features", label: "Features" },
      { href: "#how-it-works", label: "How it works" },
      { href: "#security", label: "Security" },
      { href: "#faq", label: "FAQ" },
    ],
  },
  {
    title: "Account",
    links: [
      { href: "/signup", label: "Sign up" },
      { href: "/login", label: "Log in" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="border-t">
      <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6">
        <div className="flex flex-col gap-10 sm:flex-row sm:justify-between">
          <div className="max-w-xs">
            <Logo />
            <p className="mt-3 text-sm text-muted-foreground">
              Open source API key management — safe proxy tokens and per-API
              usage analytics.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-8 sm:flex sm:gap-16">
            {COLUMNS.map((col) => (
              <div key={col.title}>
                <h3 className="text-sm font-semibold">{col.title}</h3>
                <ul className="mt-3 flex flex-col gap-2">
                  {col.links.map((link) => (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        className="text-sm text-muted-foreground hover:text-foreground"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-10 border-t pt-6 text-sm text-muted-foreground">
          API Manager — open source API key management.
        </div>
      </div>
    </footer>
  );
}
