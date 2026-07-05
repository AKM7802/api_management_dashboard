"use client";

// Active team context: null = Personal mode (the original, unchanged flow).
// Held in React state (persisted to localStorage) so switching teams
// re-renders every consumer — query hooks fold activeTeamId into their
// cache keys so a context switch always refetches instead of showing
// stale data from the previous context.

import { createContext, useContext, useEffect, useState } from "react";

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
  const [activeTeamId, setActiveTeamIdState] = useState<string | null>(null);

  // hydrate from localStorage after mount (avoids SSR/client mismatch) — a
  // narrow, legitimate exception to react-hooks/set-state-in-effect: this
  // isn't reacting to a prop/state change, it's the one-time client-only
  // read every hydration-safe localStorage pattern requires.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActiveTeamIdState(getActiveTeamId());
  }, []);

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
