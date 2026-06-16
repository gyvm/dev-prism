import { createHash } from "node:crypto";

import type { NormalizedActor, NormalizedPullRequest } from "../shared/types.js";

export function stableHash(input: string): string {
  return createHash("sha1").update(input).digest("hex");
}

export function requirePrId(pr: NormalizedPullRequest): string {
  if (typeof pr.sourceNodeId === "string" && pr.sourceNodeId.length > 0) {
    return pr.sourceNodeId;
  }
  throw new Error(`Pull request ${pr.repo.owner}/${pr.repo.name}#${pr.number} is missing sourceNodeId`);
}

export function requireRepoId(pr: NormalizedPullRequest): string {
  if (typeof pr.repo.sourceNodeId === "string" && pr.repo.sourceNodeId.length > 0) {
    return pr.repo.sourceNodeId;
  }
  throw new Error(`Repository ${pr.repo.owner}/${pr.repo.name} is missing sourceNodeId`);
}

export function actorDisplayKey(actor: NormalizedActor): string | null {
  return actor.login ?? actor.slug ?? actor.name ?? actor.url ?? actor.sourceNodeId;
}

export function actorId(actor: NormalizedActor | null | undefined): string | null {
  if (!actor) return null;
  if (typeof actor.sourceNodeId === "string" && actor.sourceNodeId.length > 0) {
    return actor.sourceNodeId;
  }
  const displayKey = actorDisplayKey(actor);
  if (!displayKey) return null;
  return `actor:${stableHash(`${actor.type ?? "Unknown"}:${displayKey}`)}`;
}

export function actorType(actor: NormalizedActor | null | undefined): string | null {
  return actor?.type ?? null;
}

export function prKey(pr: NormalizedPullRequest): string {
  return `${pr.repo.owner}/${pr.repo.name}#${pr.number}`;
}
