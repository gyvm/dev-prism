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

type IdPart = string | number | boolean | null | undefined;

/** Deterministic synthetic id from a fixed list of parts (null/undefined → ""). */
export function fallbackId(prefix: string, parts: readonly IdPart[]): string {
  return `${prefix}:${stableHash(parts.map((part) => part ?? "").join("|"))}`;
}

/** The real GitHub Node.id when present, else a deterministic fallback. */
export function idOrFallback(
  id: string | null | undefined,
  prefix: string,
  parts: readonly IdPart[],
): string {
  return typeof id === "string" && id.length > 0 ? id : fallbackId(prefix, parts);
}

/**
 * Single source of truth for the ids below. Each is derived identically by the
 * entity tables (`pr_reviews.review_id`, `pr_review_threads.thread_id`,
 * `pr_review_comments.comment_id`) and by the `bodies.subject_id` written for
 * the same row, so the incremental `bodies` purge in build.ts — which
 * reconstructs the key from the entity table — matches the stored body row.
 * When a row lacks a GitHub Node.id the two sides must still agree; deriving
 * both from these helpers guarantees it. Mirrors `issueCommentFallbackId`,
 * which already does this for issue comments.
 */
export function reviewKey(
  sourceNodeId: string | null | undefined,
  prId: string,
  index: number,
  author: string | null | undefined,
  submittedAt: string | null | undefined,
): string {
  return idOrFallback(sourceNodeId, "review", [prId, index, author, submittedAt]);
}

export function reviewThreadKey(
  sourceNodeId: string | null | undefined,
  prId: string,
  threadIndex: number,
  path: string | null | undefined,
  line: number | null | undefined,
): string {
  return idOrFallback(sourceNodeId, "review-thread", [prId, threadIndex, path, line]);
}

export function reviewCommentKey(
  sourceNodeId: string | null | undefined,
  prId: string,
  threadId: string,
  commentIndex: number,
  createdAt: string | null | undefined,
): string {
  return idOrFallback(sourceNodeId, "review-comment", [prId, threadId, commentIndex, createdAt]);
}

/**
 * Deterministic fallback id for a PR issue comment that has no GitHub Node.id.
 * Shared by the activities event_id and the bodies subject_id so the
 * incremental `bodies` purge (which reconstructs the key from activities via
 * COALESCE(source_node_id, event_id)) matches the stored body row. Without a
 * single source of truth the two derive different hashes and stale issue-comment
 * bodies are never purged on re-fetch.
 */
export function issueCommentFallbackId(prId: string, index: number, createdAt: string): string {
  return `event:${stableHash([prId, "issue-comment", String(index), createdAt].join("|"))}`;
}
