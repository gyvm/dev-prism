import type { GraphQLPullRequestNode, GraphQLReviewNode, GraphQLReviewRequestNode, GraphQLTimelineItemNode } from "./graphql.js";
import { getReviewerIdentifier } from "./graphql.js";
import { CollectorError } from "../shared/errors.js";
import type { NormalizedPullRequest, RepositoryConfig, ReviewState } from "../shared/types.js";

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
      owner: repository.owner,
      name: repository.name,
    },
    number: node.number,
    title: node.title,
    bodyText: node.bodyText ?? null,
    url: node.url ?? null,
    state: node.state ?? null,
    author: getActorLogin(node.author),
    createdAt: node.createdAt,
    mergedAt: node.mergedAt ?? null,
    closedAt: node.closedAt ?? null,
    additions: node.additions,
    deletions: node.deletions,
    labels: (node.labels?.nodes ?? [])
      .filter((label): label is { name: string } => label !== null && typeof label.name === "string")
      .map((label) => ({ name: label.name })),
    reviews: (node.reviews?.nodes ?? [])
      .filter((review): review is GraphQLReviewNode => review !== null)
      .map((review) => ({
        author: getActorLogin(review.author),
        state: toReviewState(review.state),
        submittedAt: review.submittedAt ?? null,
        ...(typeof review.bodyText === "string" ? { bodyText: review.bodyText } : {}),
      })),
    reviewRequests: (node.reviewRequests?.nodes ?? [])
      .filter((req): req is GraphQLReviewRequestNode => req !== null)
      .map((reviewRequest) => ({
        requestedReviewer: getReviewerIdentifier(reviewRequest.requestedReviewer),
      })),
    isDraft: node.isDraft ?? false,
    timelineEvents: (node.timelineItems?.nodes ?? [])
      .filter(
        (item): item is GraphQLTimelineItemNode & { createdAt: string; __typename: string } =>
          item !== null && typeof item.createdAt === "string" && typeof item.__typename === "string" &&
          (item.__typename === "ReadyForReviewEvent" || item.__typename === "ReviewRequestedEvent"),
      )
      .map((item) => ({
        type: item.__typename === "ReadyForReviewEvent"
          ? "ready_for_review" as const
          : "review_requested" as const,
        createdAt: item.createdAt,
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
        author: getActorLogin(comment.author),
        bodyText: comment.bodyText,
        createdAt: comment.createdAt,
        updatedAt: comment.updatedAt ?? null,
        url: comment.url ?? null,
      })),
    reviewThreads: (node.reviewThreads?.nodes ?? [])
      .filter((thread): thread is NonNullable<typeof thread> => thread !== null)
      .map((thread) => ({
        isResolved: thread.isResolved ?? null,
        isOutdated: thread.isOutdated ?? null,
        path: thread.path ?? null,
        line: thread.line ?? null,
        startLine: thread.startLine ?? null,
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
            author: getActorLogin(comment.author),
            bodyText: comment.bodyText,
            createdAt: comment.createdAt,
            updatedAt: comment.updatedAt ?? null,
            url: comment.url ?? null,
            path: comment.path ?? thread.path ?? null,
            line: comment.line ?? thread.line ?? null,
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
