import type { GraphQLPullRequestNode, GraphQLReviewNode, GraphQLReviewRequestNode, GraphQLTimelineItemNode } from "./graphql.js";
import { getReviewerIdentifier } from "./graphql.js";
import { CollectorError } from "../shared/errors.js";
import type { NormalizedActor, NormalizedPullRequest, RepositoryConfig, ReviewState } from "../shared/types.js";

const KNOWN_REVIEW_STATES = new Set<string>(["APPROVED", "CHANGES_REQUESTED", "COMMENTED", "DISMISSED", "PENDING"]);

function toReviewState(value: string | null | undefined): ReviewState | null {
  if (typeof value === "string" && KNOWN_REVIEW_STATES.has(value)) {
    return value as ReviewState;
  }
  return null;
}

function getActorLogin(actor: { login?: string | null } | null | undefined): string | null {
  return actor?.login ?? null;
}

function normalizeActor(
  actor:
    | {
      __typename?: string | null;
      id?: string | null;
      login?: string | null;
      slug?: string | null;
      name?: string | null;
      url?: string | null;
    }
    | null
    | undefined,
): NormalizedActor | null {
  if (!actor || (typeof actor.id !== "string" && typeof actor.__typename !== "string")) {
    return null;
  }

  return {
    sourceNodeId: actor.id ?? null,
    type: actor.__typename ?? null,
    login: actor.login ?? null,
    slug: actor.slug ?? null,
    name: actor.name ?? null,
    url: actor.url ?? null,
  };
}

function withSourceNodeId(id: string | null | undefined): { sourceNodeId: string } | Record<string, never> {
  return typeof id === "string" ? { sourceNodeId: id } : {};
}

function withActor<T extends string>(
  property: T,
  actor: Parameters<typeof normalizeActor>[0],
): { [K in T]: NormalizedActor } | Record<string, never> {
  const normalized = normalizeActor(actor);
  return normalized ? { [property]: normalized } as { [K in T]: NormalizedActor } : {};
}

export function normalizePullRequest(
  repository: RepositoryConfig,
  node: GraphQLPullRequestNode,
): NormalizedPullRequest {
  if (
    typeof node.number !== "number" ||
    typeof node.title !== "string" ||
    typeof node.createdAt !== "string" ||
    typeof node.additions !== "number" ||
    typeof node.deletions !== "number"
  ) {
    throw new CollectorError(
      `Pull request payload for ${repository.owner}/${repository.name} is missing required fields`,
    );
  }

  return {
    repo: {
      owner: node.repository?.owner?.login ?? repository.owner,
      name: node.repository?.name ?? repository.name,
      ...(typeof node.repository?.id === "string" ? { sourceNodeId: node.repository.id } : {}),
      ...(typeof node.repository?.visibility === "string" ? { visibility: node.repository.visibility } : {}),
    },
    ...withSourceNodeId(node.id),
    number: node.number,
    title: node.title,
    bodyText: node.bodyText ?? null,
    url: node.url ?? null,
    state: node.state ?? null,
    author: getActorLogin(node.author),
    ...withActor("authorActor", node.author),
    ...withActor("mergedByActor", node.mergedBy),
    createdAt: node.createdAt,
    updatedAt: node.updatedAt ?? node.createdAt,
    mergedAt: node.mergedAt ?? null,
    closedAt: node.closedAt ?? null,
    additions: node.additions,
    deletions: node.deletions,
    ...(typeof node.changedFiles === "number" ? { changedFiles: node.changedFiles } : {}),
    labels: (node.labels?.nodes ?? [])
      .filter((label): label is { name: string } => label !== null && typeof label.name === "string")
      .map((label) => ({ name: label.name })),
    reviews: (node.reviews?.nodes ?? [])
      .filter((review): review is GraphQLReviewNode => review !== null)
      .map((review) => ({
        ...withSourceNodeId(review.id),
        author: getActorLogin(review.author),
        ...withActor("authorActor", review.author),
        state: toReviewState(review.state),
        submittedAt: review.submittedAt ?? null,
        ...(typeof review.updatedAt === "string" ? { updatedAt: review.updatedAt } : {}),
        ...(typeof review.commit?.oid === "string" ? { commitOid: review.commit.oid } : {}),
        ...(typeof review.url === "string" ? { url: review.url } : {}),
        ...(typeof review.bodyText === "string" ? { bodyText: review.bodyText } : {}),
      })),
    reviewRequests: (node.reviewRequests?.nodes ?? [])
      .filter((req): req is GraphQLReviewRequestNode => req !== null)
      .map((reviewRequest) => ({
        ...withSourceNodeId(reviewRequest.id),
        requestedReviewer: getReviewerIdentifier(reviewRequest.requestedReviewer),
        ...withActor("requestedReviewerActor", reviewRequest.requestedReviewer),
        ...(typeof reviewRequest.asCodeOwner === "boolean" ? { asCodeOwner: reviewRequest.asCodeOwner } : {}),
      })),
    isDraft: node.isDraft ?? false,
    timelineEvents: (node.timelineItems?.nodes ?? [])
      .filter(
        (item): item is GraphQLTimelineItemNode & { createdAt: string; __typename: string } =>
          item !== null && typeof item.createdAt === "string" && typeof item.__typename === "string" &&
          (item.__typename === "ReadyForReviewEvent" || item.__typename === "ReviewRequestedEvent"),
      )
      .map((item) => ({
        ...withSourceNodeId(item.id),
        type: item.__typename === "ReadyForReviewEvent"
          ? "ready_for_review" as const
          : "review_requested" as const,
        createdAt: item.createdAt,
        ...withActor("actor", item.actor),
        ...withActor("requestedReviewerActor", item.requestedReviewer),
      })),
    comments: (node.comments?.nodes ?? [])
      .filter(
        (comment): comment is NonNullable<typeof comment> & {
          bodyText: string;
          createdAt: string;
        } =>
          comment !== null &&
          typeof comment.bodyText === "string" &&
          typeof comment.createdAt === "string",
      )
      .map((comment) => ({
        ...withSourceNodeId(comment.id),
        author: getActorLogin(comment.author),
        ...withActor("authorActor", comment.author),
        bodyText: comment.bodyText,
        createdAt: comment.createdAt,
        updatedAt: comment.updatedAt ?? null,
        url: comment.url ?? null,
      })),
    reviewThreads: (node.reviewThreads?.nodes ?? [])
      .filter((thread): thread is NonNullable<typeof thread> => thread !== null)
      .map((thread) => ({
        ...withSourceNodeId(thread.id),
        isResolved: thread.isResolved ?? null,
        isOutdated: thread.isOutdated ?? null,
        path: thread.path ?? null,
        line: thread.line ?? null,
        startLine: thread.startLine ?? null,
        ...(typeof thread.subjectType === "string" ? { subjectType: thread.subjectType } : {}),
        ...withActor("resolvedByActor", thread.resolvedBy),
        comments: (thread.comments?.nodes ?? [])
          .filter(
            (comment): comment is NonNullable<typeof comment> & {
              bodyText: string;
              createdAt: string;
            } =>
              comment !== null &&
              typeof comment.bodyText === "string" &&
              typeof comment.createdAt === "string",
          )
          .map((comment) => ({
            ...withSourceNodeId(comment.id),
            author: getActorLogin(comment.author),
            ...withActor("authorActor", comment.author),
            bodyText: comment.bodyText,
            createdAt: comment.createdAt,
            updatedAt: comment.updatedAt ?? null,
            url: comment.url ?? null,
            path: comment.path ?? thread.path ?? null,
            line: comment.line ?? thread.line ?? null,
            ...(typeof comment.startLine === "number" ? { startLine: comment.startLine } : {}),
            ...(typeof comment.originalLine === "number" ? { originalLine: comment.originalLine } : {}),
            ...(typeof comment.state === "string" ? { state: comment.state } : {}),
            ...(typeof comment.outdated === "boolean" ? { isOutdated: comment.outdated } : {}),
            ...(typeof comment.pullRequestReview?.id === "string"
              ? { reviewSourceNodeId: comment.pullRequestReview.id }
              : {}),
          })),
      })),
    commits: (node.commits?.nodes ?? [])
      .filter(
        (commitNode): commitNode is NonNullable<typeof commitNode> & {
          commit: {
            oid: string;
            committedDate: string;
            authoredDate?: string | null;
            messageHeadline: string;
            author?: {
              user?: { login?: string | null } | null;
              name?: string | null;
              email?: string | null;
            } | null;
          };
        } =>
          commitNode !== null &&
          typeof commitNode.commit?.oid === "string" &&
          typeof commitNode.commit.committedDate === "string" &&
          typeof commitNode.commit.messageHeadline === "string",
      )
      .map((commitNode) => ({
        oid: commitNode.commit.oid,
        committedDate: commitNode.commit.committedDate,
        authoredDate:
          typeof commitNode.commit.authoredDate === "string"
            ? commitNode.commit.authoredDate
            : commitNode.commit.committedDate,
        messageHeadline: commitNode.commit.messageHeadline,
        author:
          commitNode.commit.author?.user?.login ??
          commitNode.commit.author?.name ??
          commitNode.commit.author?.email ??
          null,
        ...withActor("authorActor", commitNode.commit.author?.user),
        ...(typeof commitNode.commit.author?.name === "string"
          ? { authorName: commitNode.commit.author.name }
          : {}),
        ...(typeof commitNode.commit.author?.email === "string"
          ? { authorEmail: commitNode.commit.author.email }
          : {}),
      })),
    files: (node.files?.nodes ?? [])
      .filter(
        (file): file is NonNullable<typeof file> & {
          path: string;
          additions: number;
          deletions: number;
        } =>
          file !== null &&
          typeof file.path === "string" &&
          typeof file.additions === "number" &&
          typeof file.deletions === "number",
      )
      .map((file) => ({
        path: file.path,
        additions: file.additions,
        deletions: file.deletions,
        changeType: file.changeType ?? null,
      })),
  };
}
