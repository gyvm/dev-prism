export class ConfigError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ConfigError";
  }
}

export class RuntimeConfigError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "RuntimeConfigError";
  }
}

export class CollectorError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "CollectorError";
  }
}

/**
 * A GitHub rate limit (primary or secondary) was hit during collection. Carries
 * the reset time when GitHub provided one so the operator knows when a re-run
 * can resume.
 */
export class RateLimitError extends CollectorError {
  readonly scope: "primary" | "secondary";
  readonly resetAt: Date | null;

  constructor(
    message: string,
    options: { scope: "primary" | "secondary"; resetAt: Date | null; cause?: unknown },
  ) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = "RateLimitError";
    this.scope = options.scope;
    this.resetAt = options.resetAt;
  }
}

export class MetricsError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "MetricsError";
  }
}
