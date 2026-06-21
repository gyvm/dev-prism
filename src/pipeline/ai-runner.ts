import { CopilotClient, approveAll } from "@github/copilot-sdk";

import { ConfigError } from "../shared/errors.js";

export type AiRunnerInput = Readonly<{
  id: string;
  prompt: string;
  payload: unknown;
}>;

export type AiRunner = (input: AiRunnerInput) => Promise<string>;

export type CopilotSdkRunnerOptions = Readonly<{
  model?: string;
  timeoutMs?: number;
  maxRetries?: number;
  gitHubToken?: string;
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
  return async ({ id, prompt: promptBody, payload }) => {
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    const prompt = `${promptBody}\n\n## 入力JSON\n\n${JSON.stringify(payload, null, 2)}\n`;

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
        const usageTotals = {
          model: "unknown" as string,
          input: 0,
          output: 0,
          reasoning: 0,
          cacheRead: 0,
          cacheWrite: 0,
          nanoAiu: 0,
          duration: 0,
          turns: 0,
        };
        try {
          const session = await client.createSession({
            ...(options.model ? { model: options.model } : {}),
            onPermissionRequest: approveAll,
          });
          session.on("assistant.usage", (event) => {
            try {
              const usage = event.data;
              if (usage.model) usageTotals.model = usage.model;
              usageTotals.input += usage.inputTokens ?? 0;
              usageTotals.output += usage.outputTokens ?? 0;
              usageTotals.reasoning += usage.reasoningTokens ?? 0;
              usageTotals.cacheRead += usage.cacheReadTokens ?? 0;
              usageTotals.cacheWrite += usage.cacheWriteTokens ?? 0;
              usageTotals.nanoAiu += usage.copilotUsage?.totalNanoAiu ?? 0;
              usageTotals.duration += usage.duration ?? 0;
              usageTotals.turns += 1;
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
          try {
            if (usageTotals.turns > 0) {
              process.stderr.write(
                `[ai] analysis=${id} model=${usageTotals.model} ` +
                  `input=${usageTotals.input} output=${usageTotals.output} ` +
                  `reasoning=${usageTotals.reasoning} ` +
                  `cacheRead=${usageTotals.cacheRead} cacheWrite=${usageTotals.cacheWrite} ` +
                  `nanoAiu=${usageTotals.nanoAiu} duration=${usageTotals.duration}ms ` +
                  `turns=${usageTotals.turns}\n`,
              );
            }
          } catch {
            // テレメトリ失敗を AI 呼び出しのリトライループに伝播させない
          }
          await client.stop();
        }
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError;
  };
}
