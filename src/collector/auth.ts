import { createAppAuth } from "@octokit/auth-app";
import { request as octokitRequest } from "@octokit/request";

import { CollectorError } from "../shared/errors.js";
import type { AppAuthFactory, AppAuthentication, RuntimeConfig } from "../shared/types.js";

export type TokenResolver = (owner: string) => Promise<string>;

export function resolveGitHubApiUrl(env: NodeJS.ProcessEnv = process.env): string {
  return env.GITHUB_API_URL?.trim().replace(/\/+$/, "") || "https://api.github.com";
}

async function octokitAppAuthFactory(options: {
  appId: string;
  privateKey: string;
  installationId: number;
  apiUrl?: string;
}): Promise<AppAuthentication> {
  const request = octokitRequest.defaults({
    baseUrl: options.apiUrl?.trim().replace(/\/+$/, "") || resolveGitHubApiUrl(),
  });
  const auth = createAppAuth({
    appId: options.appId,
    privateKey: options.privateKey,
    request,
  });

  const installationAuthentication = await auth({
    type: "installation",
    installationId: options.installationId,
  });

  return {
    token: installationAuthentication.token,
    expiresAt: installationAuthentication.expiresAt,
  };
}

export async function resolveToken(
  runtimeConfig: RuntimeConfig,
  authFactory: AppAuthFactory = octokitAppAuthFactory,
): Promise<string> {
  return resolveTokenForOwner(runtimeConfig, "", authFactory);
}

/** Resolve one owner explicitly when using GITHUB_APP_INSTALLATION_IDS. */
async function resolveTokenForOwner(
  runtimeConfig: RuntimeConfig,
  owner: string,
  authFactory: AppAuthFactory = octokitAppAuthFactory,
): Promise<string> {
  return createTokenResolver(runtimeConfig, authFactory)(owner);
}

function installationIdForOwner(runtimeConfig: RuntimeConfig, owner: string): number {
  const normalizedOwner = owner.trim().toLowerCase();
  const mappedInstallationId = normalizedOwner
    ? runtimeConfig.githubAppInstallationIds[normalizedOwner]
    : undefined;
  if (mappedInstallationId !== undefined) return mappedInstallationId;
  if (runtimeConfig.githubAppInstallationId !== null) {
    return runtimeConfig.githubAppInstallationId;
  }

  const configuredInstallationIds = Object.values(runtimeConfig.githubAppInstallationIds);
  if (!normalizedOwner && configuredInstallationIds.length === 1) {
    return configuredInstallationIds[0]!;
  }

  if (
    runtimeConfig.githubAppId === null || runtimeConfig.githubAppPrivateKey === null
  ) {
    throw new CollectorError(
      "Either GITHUB_TOKEN or GitHub App credentials (GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY, and an installation ID) must be provided",
    );
  }

  if (normalizedOwner) {
    throw new CollectorError(
      `No GitHub App installation ID is configured for owner "${owner}". Set GITHUB_APP_INSTALLATION_ID for a single installation or add "${owner}=<installation_id>" to GITHUB_APP_INSTALLATION_IDS.`,
    );
  }
  throw new CollectorError(
    "A GitHub App installation ID is required. Set GITHUB_APP_INSTALLATION_ID or GITHUB_APP_INSTALLATION_IDS.",
  );
}

export function createTokenResolver(
  runtimeConfig: RuntimeConfig,
  authFactory: AppAuthFactory = octokitAppAuthFactory,
): TokenResolver {
  type TokenCacheEntry = {
    authentication: Promise<AppAuthentication>;
    refreshAt: number;
    refreshPromise?: Promise<AppAuthentication>;
  };

  const tokenCache = new Map<
    string,
    TokenCacheEntry
  >();
  const fallbackLifetimeMs = 50 * 60 * 1000;
  const refreshSafetyMs = 60 * 1000;

  return async (owner: string): Promise<string> => {
    if (runtimeConfig.githubToken !== null) {
      return runtimeConfig.githubToken;
    }

    const cacheKey = owner.trim().toLowerCase();
    const now = Date.now();
    const existing = tokenCache.get(cacheKey);
    if (existing && now < existing.refreshAt) {
      return (await existing.authentication).token;
    }

    if (existing?.refreshPromise) {
      return (await existing.refreshPromise).token;
    }

    const authentication = (async (): Promise<AppAuthentication> => {
      if (
        runtimeConfig.githubAppId === null ||
        runtimeConfig.githubAppPrivateKey === null
      ) {
        throw new CollectorError(
          "Either GITHUB_TOKEN or GitHub App credentials (GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY, and an installation ID) must be provided",
        );
      }

      const installationId = installationIdForOwner(runtimeConfig, owner);
      try {
        return await authFactory({
          appId: runtimeConfig.githubAppId,
          privateKey: runtimeConfig.githubAppPrivateKey,
          installationId,
          ...(runtimeConfig.githubApiUrl ? { apiUrl: runtimeConfig.githubApiUrl } : {}),
        });
      } catch (error) {
        throw new CollectorError(
          `Failed to create GitHub App installation token for owner "${owner || "the configured installation"}"`,
          { cause: error },
        );
      }
    })();

    const cacheEntry: TokenCacheEntry = existing ?? {
      authentication,
      refreshAt: now + fallbackLifetimeMs,
    };
    cacheEntry.refreshPromise = authentication;
    if (!existing) tokenCache.set(cacheKey, cacheEntry);

    authentication
      .then((result) => {
        const expiresAt = result.expiresAt ? Date.parse(result.expiresAt) : Number.NaN;
        cacheEntry.authentication = Promise.resolve(result);
        if (Number.isFinite(expiresAt)) {
          cacheEntry.refreshAt = Math.max(now, expiresAt - refreshSafetyMs);
        } else {
          cacheEntry.refreshAt = Date.now() + fallbackLifetimeMs;
        }
        delete cacheEntry.refreshPromise;
      })
      .catch(() => {
        if (tokenCache.get(cacheKey) === cacheEntry) tokenCache.delete(cacheKey);
      });

    return (await authentication).token;
  };
}
