"use client";

// Active team context: null = Personal mode (the original, unchanged flow).
// Held in React state (persisted to localStorage) so switching teams
// re-renders every consumer — query hooks fold activeTeamId into their
// cache keys so a context switch always refetches instead of showing
// stale data from the previous context.

import { createContext, useContext, useState } from "react";

import { getActiveTeamId, setActiveTeamId as persistActiveTeamId } from "@/lib/api";

interface TeamContextValue {
  activeTeamId: string | null;
  setActiveTeamId: (id: string | null) => void;
}

const Ctx = createContext<TeamContextValue>({
  activeTeamId: null,
  setActiveTeamId: () => {},
});

export function TeamProvider({ children }: { children: React.ReactNode }) {
  // Lazy-init straight from localStorage (not an effect-based hydrate).
  // api()'s X-Team-Id header is ALSO read synchronously from localStorage,
  // so this must match on the very first render -- an effect-based
  // "start null, correct after mount" here previously let a query fire
  // with cache key ["apis", null] while the header it actually sent was
  // still the old team's, poisoning the Personal-mode cache entry with
  // team data. That's a real bug, worse than the cosmetic SSR/client text
  // mismatch this trades for (React just reconciles it on hydration).
  const [activeTeamId, setActiveTeamIdState] = useState<string | null>(() =>
    getActiveTeamId(),
  );

  function setActiveTeamId(id: string | null) {
    persistActiveTeamId(id);
    setActiveTeamIdState(id);
  }

  return (
    <Ctx.Provider value={{ activeTeamId, setActiveTeamId }}>
      {children}
    </Ctx.Provider>
  );
}

export function useActiveTeam() {
  return useContext(Ctx);
}
