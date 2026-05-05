import { createAppAuth } from "@octokit/auth-app";

import { CollectorError } from "../shared/errors.js";
import type { AppAuthFactory, RuntimeConfig } from "../shared/types.js";

async function octokitAppAuthFactory(options: {
  appId: string;
  privateKey: string;
  installationId: number;
}): Promise<string> {
  const auth = createAppAuth({
    appId: options.appId,
    privateKey: options.privateKey,
  });

  const installationAuthentication = await auth({
    type: "installation",
    installationId: options.installationId,
  });

  return installationAuthentication.token;
}

export async function resolveToken(
  runtimeConfig: RuntimeConfig,
  authFactory: AppAuthFactory = octokitAppAuthFactory,
): Promise<string> {
  if (runtimeConfig.githubToken !== null) {
    return runtimeConfig.githubToken;
  }

  if (
    runtimeConfig.githubAppId === null ||
    runtimeConfig.githubAppPrivateKey === null ||
    runtimeConfig.githubAppInstallationId === null
  ) {
    throw new CollectorError(
      "Either GITHUB_TOKEN or GitHub App credentials (GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY, GITHUB_APP_INSTALLATION_ID) must be provided",
    );
  }

  try {
    return await authFactory({
      appId: runtimeConfig.githubAppId,
      privateKey: runtimeConfig.githubAppPrivateKey,
      installationId: runtimeConfig.githubAppInstallationId,
    });
  } catch (error) {
    throw new CollectorError("Failed to create GitHub App installation token", {
      cause: error,
    });
  }
}

/** @deprecated Use resolveToken instead */
export const createInstallationToken = resolveToken;
