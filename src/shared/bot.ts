export type BotLoginMatcher = (login: string) => boolean;

export const neverBotLogin: BotLoginMatcher = () => false;

export function createBotLoginMatcher(
  patterns: readonly string[],
): BotLoginMatcher {
  if (patterns.length === 0) return neverBotLogin;
  const regexes = patterns.map((pattern) => new RegExp(pattern, "i"));
  return (login: string) => regexes.some((regex) => regex.test(login));
}

export function isBotLogin(
  login: string,
  patterns: readonly string[],
): boolean {
  return createBotLoginMatcher(patterns)(login);
}
