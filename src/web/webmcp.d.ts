declare global {
  type WebMcpJsonSchema = Readonly<{
    type: "object" | "string" | "number" | "boolean";
    properties?: Readonly<Record<string, WebMcpJsonSchema>>;
    required?: readonly string[];
    enum?: readonly string[];
    additionalProperties?: boolean;
  }>;

  type WebMcpToolAnnotations = Readonly<{
    readOnlyHint?: boolean;
    consequentialHint?: boolean;
    untrustedContentHint?: boolean;
  }>;

  type WebMcpToolExecutionContext = Readonly<{ signal: AbortSignal }>;

  type WebMcpTool = Readonly<{
    name: string;
    description: string;
    inputSchema: WebMcpJsonSchema;
    annotations?: WebMcpToolAnnotations;
    execute: (input: unknown, context: WebMcpToolExecutionContext) => Promise<unknown> | unknown;
  }>;

  interface ModelContext {
    registerTool(
      tool: WebMcpTool,
      options?: Readonly<{ signal?: AbortSignal; exposedTo?: readonly string[] }>,
    ): Promise<void>;
  }

  interface Document {
    modelContext?: ModelContext;
  }
}

export {};
