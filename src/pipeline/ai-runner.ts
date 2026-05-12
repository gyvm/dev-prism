import { CopilotClient, approveAll } from "@github/copilot-sdk";

import { ConfigError } from "../shared/errors.js";

export type AiRunnerInput = Readonly<{
  skillId: string;
  payload: unknown;
}>;

export type AiRunner = (input: AiRunnerInput) => Promise<string>;

export type CopilotSdkRunnerOptions = Readonly<{
  model?: string;
  timeoutMs?: number;
  maxRetries?: number;
  gitHubToken?: string;
  skillDirectories: readonly string[];
}>;

const DEFAULT_TIMEOUT_MS = 300_000;
const DEFAULT_MAX_RETRIES = 1;

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export type ValidateAiModelOptions = Readonly<{
  model: string;
  gitHubToken?: string;
}>;

export async function validateAiModel(
  options: ValidateAiModelOptions,
): Promise<void> {
  const client = options.gitHubToken
    ? new CopilotClient({ gitHubToken: options.gitHubToken })
    : new CopilotClient();
  let models;
  try {
    await client.start();
    try {
      models = await client.listModels();
    } finally {
      await client.stop();
    }
  } catch {
    return;
  }
  if (!models.some((m) => m.id === options.model)) {
    const available = models.map((m) => m.id).join(", ");
    throw new ConfigError(
      `config.ai.model "${options.model}" is not available. Valid IDs: ${available}`,
    );
  }
}

export function createCopilotSdkRunner(
  options: CopilotSdkRunnerOptions,
): AiRunner {
  return async ({ skillId, payload }) => {
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    const prompt = `Use the "${skillId}" skill to produce the requested Markdown section.\n\nInput JSON:\n${JSON.stringify(payload, null, 2)}\n`;

    let lastError: unknown;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (attempt > 0) {
        await sleep(5_000 * attempt);
      }
      try {
        const client = options.gitHubToken
          ? new CopilotClient({ gitHubToken: options.gitHubToken })
          : new CopilotClient();
        await client.start();
        try {
          const session = await client.createSession({
            ...(options.model ? { model: options.model } : {}),
            skillDirectories: [...options.skillDirectories],
            onPermissionRequest: approveAll,
          });
          session.on("assistant.usage", (event) => {
            try {
              const usage = event.data;
              const nanoAiu = usage.copilotUsage?.totalNanoAiu ?? 0;
              process.stderr.write(
                `[ai] skill=${skillId} model=${usage.model ?? "unknown"} ` +
                  `input=${usage.inputTokens ?? 0} output=${usage.outputTokens ?? 0} ` +
                  `reasoning=${usage.reasoningTokens ?? 0} ` +
                  `cacheRead=${usage.cacheReadTokens ?? 0} cacheWrite=${usage.cacheWriteTokens ?? 0} ` +
                  `nanoAiu=${nanoAiu} duration=${usage.duration ?? 0}ms\n`,
              );
            } catch {
              // テレメトリ失敗を AI 呼び出しのリトライループに伝播させない
            }
          });
          try {
            const result = await session.sendAndWait({ prompt }, timeoutMs);
            if (!result) {
              throw new Error("Copilot SDK returned no assistant message");
            }
            return result.data.content;
          } finally {
            await session.disconnect();
          }
        } finally {
          await client.stop();
        }
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError;
  };
}
