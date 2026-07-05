// Typed fetch wrapper for the FastAPI backend. JWT lives in localStorage (v1).

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const TOKEN_KEY = "apimgmt.jwt";
const TEAM_KEY = "apimgmt.teamId";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

// Active team context (opt-in): null/absent = Personal mode, identical to
// the original single-owner flow. A value sends X-Team-Id on every request.
export function getActiveTeamId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TEAM_KEY);
}

export function setActiveTeamId(id: string | null) {
  if (id) localStorage.setItem(TEAM_KEY, id);
  else localStorage.removeItem(TEAM_KEY);
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const token = getToken();
  const teamId = getActiveTeamId();
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(teamId ? { "X-Team-Id": teamId } : {}),
      ...init.headers,
    },
  });
  if (res.status === 401 && typeof window !== "undefined") {
    clearToken();
    if (!window.location.pathname.startsWith("/login")) {
      window.location.href = "/login";
    }
  }
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = typeof body.detail === "string" ? body.detail : detail;
    } catch {
      /* not json */
    }
    throw new ApiError(res.status, detail);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}
