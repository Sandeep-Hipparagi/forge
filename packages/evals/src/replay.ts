import { createHash } from "node:crypto";
import type { ModelClient, ModelRequest, ModelTurn, ToolResult } from "@forge/agent-harness";

function canonical(value: unknown): unknown {
  if (typeof value === "number") return Number(value.toFixed(6));
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonical(child)]),
    );
  }
  return value;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonical(value));
}

export function deriveReplayKey(input: {
  caseId: string;
  toolOrAgent: string;
  args: unknown;
  stateSignature?: string | undefined;
  callIndex: number;
}): string {
  return createHash("sha256")
    .update(
      [
        input.caseId,
        input.toolOrAgent,
        canonicalJson(input.args),
        input.stateSignature ?? "",
        input.callIndex,
      ].join("|"),
    )
    .digest("hex")
    .slice(0, 16);
}

export type RecordedModelEntry = {
  key: string;
  response: ModelTurn;
};

export class RecordedModelClient implements ModelClient {
  private callIndex = 0;

  constructor(
    private readonly caseId: string,
    private readonly agent: string,
    private readonly entries: ReadonlyMap<string, RecordedModelEntry>,
  ) {}

  async complete(request: ModelRequest): Promise<ModelTurn> {
    const key = deriveReplayKey({
      caseId: this.caseId,
      toolOrAgent: this.agent,
      args: request,
      callIndex: this.callIndex++,
    });
    const entry = this.entries.get(key);
    if (entry === undefined) {
      throw new Error(`Missing recorded model exchange: ${this.agent} ${key}`);
    }
    return structuredClone(entry.response);
  }
}

export type ReplayToolEntry = {
  key: string;
  result: ToolResult<unknown>;
  evidence?: Record<string, string>;
};

export class ReplayToolset {
  private readonly callIndexes = new Map<string, number>();

  constructor(
    private readonly caseId: string,
    private readonly entries: ReadonlyMap<string, ReplayToolEntry>,
  ) {}

  async execute(
    tool: string,
    args: unknown,
    stateSignature?: string,
  ): Promise<ToolResult<unknown>> {
    const indexKey = `${tool}|${stateSignature ?? ""}`;
    const callIndex = this.callIndexes.get(indexKey) ?? 0;
    this.callIndexes.set(indexKey, callIndex + 1);
    const key = deriveReplayKey({
      caseId: this.caseId,
      toolOrAgent: tool,
      args,
      stateSignature,
      callIndex,
    });
    const entry = this.entries.get(key);
    if (entry === undefined) {
      return {
        ok: false,
        error: { code: "INTERNAL", message: `Missing replay tool call: ${tool} ${key}` },
        evidenceIds: [],
        durationMs: 0,
      };
    }
    return structuredClone(entry.result);
  }
}
