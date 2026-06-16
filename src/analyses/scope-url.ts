import { resolveScope, type Grain, type Scope } from "./scope.js";

// Scope ↔ URL serialization. Two uses:
//   - Explore keeps its filter state in the URL (shareable permalink).
//   - A frozen report's "Explore で深掘り" link carries its scope to /explore.
// Defaults (all repos/users, bots included, week grain) are omitted to keep
// URLs clean; resolveScope restores them on parse, so the round-trip is exact.

const GRAINS: ReadonlySet<string> = new Set(["day", "week", "month"]);

function splitList(value: string | null): string[] {
  if (!value) return [];
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

export function scopeToSearchParams(scope: Scope): URLSearchParams {
  const params = new URLSearchParams();
  if (scope.from) params.set("from", scope.from.toISOString());
  if (scope.to) params.set("to", scope.to.toISOString());
  if (scope.repos.length > 0) params.set("repos", scope.repos.join(","));
  if (scope.users.length > 0) params.set("users", scope.users.join(","));
  if (!scope.includeBots) params.set("bots", "exclude");
  if (scope.grain !== "week") params.set("grain", scope.grain);
  return params;
}

export function scopeFromSearchParams(params: URLSearchParams): Scope {
  const grainParam = params.get("grain");
  if (grainParam !== null && !GRAINS.has(grainParam)) {
    throw new Error(`Invalid grain in scope URL: ${JSON.stringify(grainParam)}`);
  }
  const botsParam = params.get("bots");
  if (botsParam !== null && botsParam !== "include" && botsParam !== "exclude") {
    throw new Error(`Invalid bots in scope URL: ${JSON.stringify(botsParam)}`);
  }
  return resolveScope({
    from: params.get("from"),
    to: params.get("to"),
    repos: splitList(params.get("repos")),
    users: splitList(params.get("users")),
    includeBots: botsParam === null ? true : botsParam === "include",
    ...(grainParam ? { grain: grainParam as Grain } : {}),
  });
}

/** Link from a report (or anywhere) into Explore carrying the given scope. */
export function exploreHref(scope: Scope, basePath = "/explore"): string {
  const query = scopeToSearchParams(scope).toString();
  return query ? `${basePath}?${query}` : basePath;
}
