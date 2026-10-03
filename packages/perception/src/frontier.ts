import type {
  AccessibilitySnapshot,
  DomFacts,
  Affordance,
  State,
  Transition,
  Capability,
  CapabilityMap,
  RiskFactors,
  FrontierItem,
} from "./types.js";
import {
  extractAffordances,
  normalizeSnapshot,
  stateSignature,
  detectLoginForm,
} from "./perception.js";
import { isAuthenticated } from "./login.js";

export const FRONTIER_BATCH = 40;
export const MAX_STATES = 40;
export const MAX_DURATION_MS = 90_000;
export const MAX_CALLS = 40;
export const MAX_TURNS = 8;

export interface ExplorerInput {
  url: string;
  sessionId?: string;
  credentials?: { username: string; password: string };
  intent?: string;
  budgets: {
    maxStates: number;
    maxDurationMs: number;
    maxCalls: number;
    maxTurns: number;
  };
}

export interface AgentContext {
  navigate: (url: string) => Promise<void>;
  click: (
    ref: string,
  ) => Promise<{ ok: boolean; error?: string; action: string }>;
  fill: (
    ref: string,
    value: string,
  ) => Promise<{ ok: boolean; error?: string }>;
  select: (
    ref: string,
    value: string,
  ) => Promise<{ ok: boolean; error?: string }>;
  back: () => Promise<void>;
  snapshot: () => Promise<AccessibilitySnapshot>;
  getDomFacts: () => Promise<DomFacts>;
  getStorageState: () => Promise<string>;
  setStorageState: (state: string) => Promise<void>;
  chooseBatch?: (batch: FrontierItem[]) => Promise<FrontierItem[]>;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

export interface ExplorerOutput {
  capabilityMap: CapabilityMap;
  authResult: { authenticated: boolean; reason: string };
}

function stableId(prefix: string, ...parts: string[]): string {
  const material = parts.join("|");
  let hash = 2166136261;
  for (let i = 0; i < material.length; i++)
    hash = Math.imul(hash ^ material.charCodeAt(i), 16777619);
  return `${prefix}_${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function now(ctx: AgentContext): number {
  return ctx.now?.() ?? 0;
}
function sleep(ctx: AgentContext, ms: number): Promise<void> {
  return ctx.sleep?.(ms) ?? Promise.resolve();
}
function isoTime(milliseconds: number): string {
  return new globalThis.Date(milliseconds).toISOString();
}

export async function explore(
  input: ExplorerInput,
  ctx: AgentContext,
): Promise<ExplorerOutput> {
  const sessionId = input.sessionId ?? stableId("ses", input.url);
  const startTime = now(ctx);
  let callsUsed = 0;
  let turnsUsed = 0;
  let reauthAttempted = false;
  const call = async <T>(fn: () => Promise<T>): Promise<T> => {
    callsUsed++;
    return fn();
  };
  const states = new Map<string, State>();
  const transitions: Transition[] = [];
  const affordancesByState = new Map<string, Affordance[]>();
  const frontier: FrontierItem[] = [];
  const withinBudget = (): boolean =>
    states.size < input.budgets.maxStates &&
    callsUsed < input.budgets.maxCalls &&
    turnsUsed < input.budgets.maxTurns &&
    now(ctx) - startTime < input.budgets.maxDurationMs;

  await call(() => ctx.navigate(input.url));

  let authResult = { authenticated: false, reason: "not attempted" };
  if (input.credentials) {
    authResult = await authenticate(input.credentials, ctx, call);
  }

  const initialSnap = normalizeSnapshot(await call(() => ctx.snapshot()));
  const initialDom = await call(() => ctx.getDomFacts());
  admit(
    initialSnap,
    sessionId,
    states,
    affordancesByState,
    frontier,
    ctx,
    authResult.authenticated,
  );

  while (frontier.length > 0 && withinBudget()) {
    const batch = frontier.splice(0, FRONTIER_BATCH);
    turnsUsed++;
    const chosen = await chooseBatch(batch, states, ctx);

    for (const item of chosen) {
      if (!withinBudget()) break;

      const fromState = states.get(item.fromStateId);
      if (!fromState) continue;

      await restore(fromState, ctx, call);

      const act = await exercise(item.affordance, ctx, call);
      if (!act.ok) {
        recordNotExercised(item.affordance, act.error ?? "ACTION_DENIED");
        continue;
      }

      await sleep(ctx, 250);

      const toSnap = normalizeSnapshot(await call(() => ctx.snapshot()));
      const toDom = await call(() => ctx.getDomFacts());
      if (
        authResult.authenticated &&
        input.credentials &&
        detectLoginForm(toSnap, toDom)
      ) {
        if (!reauthAttempted) {
          reauthAttempted = true;
          authResult = await authenticate(input.credentials, ctx, call);
          if (authResult.authenticated) continue;
        }
        recordNotExercised(item.affordance, "SESSION_EXPIRED");
        continue;
      }
      const toState = admit(
        toSnap,
        sessionId,
        states,
        affordancesByState,
        frontier,
        ctx,
        authResult.authenticated,
      );

      const action = [
        "click",
        "fill",
        "select",
        "navigate",
        "back",
        "submit",
      ].includes(act.action)
        ? (act.action as Transition["action"])
        : "click";
      recordTransition(
        fromState,
        item.affordance,
        toState,
        action,
        transitions,
        ctx,
      );
    }
  }

  const haltReason = getHaltReason(
    frontier,
    states,
    startTime,
    callsUsed,
    turnsUsed,
    input.budgets,
    ctx,
  );
  const capabilityMap = await assembleCapabilityMap(
    sessionId,
    states,
    transitions,
    affordancesByState,
    input.intent,
    haltReason,
    initialSnap.metadata.interactivesCount,
    initialDom.inputs.length + initialDom.buttons.length,
    ctx,
    authResult.authenticated,
  );

  return { capabilityMap, authResult };
}

function getHaltReason(
  frontier: FrontierItem[],
  states: Map<string, State>,
  startTime: number,
  callsUsed: number,
  turnsUsed: number,
  budgets: ExplorerInput["budgets"],
  ctx: AgentContext,
): "EXHAUSTED" | "STATE_BUDGET" | "TIME_BUDGET" | "CALL_BUDGET" {
  if (frontier.length === 0) return "EXHAUSTED";
  if (states.size >= budgets.maxStates) return "STATE_BUDGET";
  if (ctx.now ? ctx.now() - startTime >= budgets.maxDurationMs : false)
    return "TIME_BUDGET";
  if (callsUsed >= budgets.maxCalls) return "CALL_BUDGET";
  if (turnsUsed >= budgets.maxTurns) return "CALL_BUDGET";
  return "EXHAUSTED";
}

async function authenticate(
  credentials: { username: string; password: string },
  ctx: AgentContext,
  call: <T>(fn: () => Promise<T>) => Promise<T>,
): Promise<{ authenticated: boolean; reason: string }> {
  const beforeSnap = await call(() => ctx.snapshot());
  const beforeDom = await call(() => ctx.getDomFacts());

  const loginForm = detectLoginForm(beforeSnap, beforeDom);
  if (!loginForm || loginForm.confidence < 0.6) {
    return { authenticated: false, reason: "no login form detected" };
  }

  await call(() => ctx.fill(loginForm.identityRef, credentials.username));
  await call(() => ctx.fill(loginForm.passwordRef, credentials.password));
  await call(() => ctx.click(loginForm.submitRef));

  await sleep(ctx, 2000);

  const afterSnap = await call(() => ctx.snapshot());
  const afterDom = await call(() => ctx.getDomFacts());

  const result = isAuthenticated(beforeSnap, afterSnap, beforeDom, afterDom);

  if (result.authenticated) {
    const storageState = await call(() => ctx.getStorageState());
    await call(() => ctx.setStorageState(storageState));
  }

  return result;
}

function admit(
  snap: AccessibilitySnapshot,
  sessionId: string,
  states: Map<string, State>,
  affordancesByState: Map<string, Affordance[]>,
  frontier: FrontierItem[],
  ctx: AgentContext,
  authRequired: boolean,
): State {
  const normalized = normalizeSnapshot(snap);
  const sig = stateSignature(normalized);
  let state = Array.from(states.values()).find((s) => s.signature === sig);

  if (state) {
    state.authRequired = state.authRequired || authRequired;
    state.visitedVariants++;
    const existingAffs = affordancesByState.get(state.id) ?? [];
    const existingRefs = new Set(existingAffs.map((a) => a.ref));
    const newAffs = extractAffordances(normalized, state.id).filter(
      (a) => !existingRefs.has(a.ref),
    );
    affordancesByState.set(state.id, [...existingAffs, ...newAffs]);
    for (const aff of newAffs) {
      if (!aff.destructive && aff.enabled) {
        frontier.push({
          fromStateId: state.id,
          fromSignature: sig,
          affordance: aff,
          value: computeValue(aff, state.id, affordancesByState),
        });
      }
    }
    return state;
  }

  state = {
    id: stableId("st", sessionId, sig),
    sessionId,
    signature: sig,
    url: normalized.url,
    title: normalized.title,
    authRequired,
    snapshotEvidenceId: stableId("ev", sessionId, sig),
    affordanceIds: [],
    visitedVariants: 1,
    discoveredAt: isoTime(now(ctx)),
  };

  const affs = extractAffordances(normalized, state.id);
  state.affordanceIds = affs.map((a) => a.id);
  affordancesByState.set(state.id, affs);

  for (const aff of affs) {
    if (!aff.destructive && aff.enabled) {
      frontier.push({
        fromStateId: state.id,
        fromSignature: sig,
        affordance: aff,
        value: computeValue(aff, state.id, affordancesByState),
      });
    }
  }

  states.set(state.id, state);
  return state;
}

function computeValue(
  aff: Affordance,
  fromStateId: string,
  affordancesByState: Map<string, Affordance[]>,
): number {
  const isNavigational = ["link", "tab", "menuitem"].includes(aff.kind);
  const isFormSubmit = aff.kind === "button" && !aff.destructive;
  const nameInformative =
    !!aff.accessibleName &&
    aff.accessibleName.length > 1 &&
    !/^[\u2000-\u206F\u2E00-\u2E7F\\'!"#$%&()*+,\-./:;<=>?@[\]^_`{|}~]$/.test(
      aff.accessibleName,
    );
  const stateFanout = affordancesByState.get(fromStateId)?.length ?? 0;
  const MAX_FANOUT = 20;

  return (
    0.4 * (isNavigational ? 1 : 0) +
    0.25 * (isFormSubmit ? 1 : 0) +
    0.2 * (nameInformative ? 1 : 0) +
    0.15 * (1 - Math.min(stateFanout, MAX_FANOUT) / MAX_FANOUT)
  );
}

function sortFrontier(frontier: FrontierItem[]): void {
  frontier.sort((a, b) => {
    if (b.value !== a.value) return b.value - a.value;
    if (a.fromStateId !== b.fromStateId)
      return a.fromStateId.localeCompare(b.fromStateId);
    return a.affordance.ref.localeCompare(b.affordance.ref);
  });
}

async function chooseBatch(
  batch: FrontierItem[],
  states: Map<string, State>,
  ctx: AgentContext,
): Promise<FrontierItem[]> {
  sortFrontier(batch);
  if (ctx.chooseBatch) {
    const selected = await ctx.chooseBatch(batch.slice(0, FRONTIER_BATCH));
    const allowed = new Set(batch);
    return selected.filter((item) => allowed.has(item));
  }
  return batch.slice(0, Math.min(6, batch.length));
}

async function restore(
  state: State,
  ctx: AgentContext,
  call: <T>(fn: () => Promise<T>) => Promise<T>,
): Promise<void> {
  await call(() => ctx.navigate(state.url));
}

async function exercise(
  affordance: Affordance,
  ctx: AgentContext,
  call: <T>(fn: () => Promise<T>) => Promise<T>,
): Promise<{ ok: boolean; error?: string; action: string }> {
  if (affordance.destructive) {
    return { ok: false, error: "ACTION_DENIED", action: "click" };
  }

  switch (affordance.kind) {
    case "link":
    case "button":
    case "tab":
    case "menuitem":
      return call(() => ctx.click(affordance.ref));
    case "textbox":
      return { ok: true, action: "fill" };
    case "select":
    case "radio":
    case "checkbox":
      return { ok: true, action: "select" };
    default:
      return call(() => ctx.click(affordance.ref));
  }
}

function recordNotExercised(affordance: Affordance, reason: string): void {
  affordance.observedNotExercised = true;
  affordance.notExercisedReason = reason;
}

function recordTransition(
  from: State,
  via: Affordance,
  to: State,
  action: Transition["action"],
  transitions: Transition[],
  ctx: AgentContext,
): void {
  const transition: Transition = {
    id: stableId("tr", from.id, via.id, to.id, action),
    sessionId: from.sessionId,
    fromStateId: from.id,
    toStateId: to.id,
    viaAffordanceId: via.id,
    action,
    observedAt: isoTime(now(ctx)),
  };
  transitions.push(transition);
}

async function assembleCapabilityMap(
  sessionId: string,
  states: Map<string, State>,
  transitions: Transition[],
  affordancesByState: Map<string, Affordance[]>,
  intent: string | undefined,
  haltReason: CapabilityMap["frontier"]["haltReason"],
  snapshotInteractiveCount: number,
  domInteractiveCount: number,
  ctx: AgentContext,
  authenticated: boolean,
): Promise<CapabilityMap> {
  const stateArray = Array.from(states.values());
  const clusters = clusterCapabilities(
    stateArray,
    transitions,
    affordancesByState,
  );
  const capabilities = await nameAndRankCapabilities(
    clusters,
    stateArray,
    transitions,
    affordancesByState,
    intent,
    sessionId,
  );

  return {
    sessionId,
    authenticated,
    states: stateArray,
    transitions,
    capabilities,
    apiHints: [],
    frontier: {
      discovered: stateArray.length,
      explored: stateArray.filter((s) => s.visitedVariants > 0).length,
      haltReason,
      ...(Math.abs(snapshotInteractiveCount - domInteractiveCount) > 0
        ? { domDivergence: { snapshotInteractiveCount, domInteractiveCount } }
        : {}),
    },
  };
}

function clusterCapabilities(
  states: State[],
  transitions: Transition[],
  affordancesByState: Map<string, Affordance[]>,
): string[][] {
  const graph = buildGraph(states, transitions, affordancesByState);
  const components = weaklyConnectedComponents(graph);
  let clusters = mergeByRouteSegment(components, states);
  clusters = splitLargeClusters(clusters, states);
  clusters = attachOrphans(clusters, states, transitions);
  return clusters;
}

interface Graph {
  nodes: Set<string>;
  edges: Map<string, Set<string>>;
}

function buildGraph(
  states: State[],
  transitions: Transition[],
  affordancesByState: Map<string, Affordance[]>,
): Graph {
  const nodes = new Set(states.map((s) => s.id));
  const edges = new Map<string, Set<string>>();

  for (const state of states) {
    edges.set(state.id, new Set());
  }

  const globalNav = findGlobalNavigation(states, affordancesByState);

  for (const trans of transitions) {
    const fromAffs = affordancesByState.get(trans.fromStateId) ?? [];
    const viaAff = fromAffs.find((a) => a.id === trans.viaAffordanceId);
    if (viaAff && globalNav.has(`${viaAff.role}:${viaAff.accessibleName}`))
      continue;

    const fromEdges = edges.get(trans.fromStateId) ?? new Set();
    fromEdges.add(trans.toStateId);
    edges.set(trans.fromStateId, fromEdges);
  }

  return { nodes, edges };
}

function findGlobalNavigation(
  states: State[],
  affordancesByState: Map<string, Affordance[]>,
): Set<string> {
  const counts = new Map<string, number>();
  const total = states.length;

  for (const state of states) {
    const affs = affordancesByState.get(state.id) ?? [];
    for (const aff of affs) {
      const key = `${aff.role}:${aff.accessibleName}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }

  const global = new Set<string>();
  for (const [key, count] of counts) {
    if (count / total >= 0.6) global.add(key);
  }
  return global;
}

function weaklyConnectedComponents(graph: Graph): string[][] {
  const visited = new Set<string>();
  const components: string[][] = [];

  for (const node of graph.nodes) {
    if (visited.has(node)) continue;
    const component: string[] = [];
    const stack = [node];

    while (stack.length) {
      const current = stack.pop()!;
      if (visited.has(current)) continue;
      visited.add(current);
      component.push(current);
      const neighbors = graph.edges.get(current) ?? new Set();
      for (const n of neighbors) {
        if (!visited.has(n)) stack.push(n);
      }
      for (const [src, targets] of graph.edges) {
        if (targets.has(current) && !visited.has(src)) stack.push(src);
      }
    }
    components.push(component);
  }
  return components;
}

function mergeByRouteSegment(
  components: string[][],
  states: State[],
): string[][] {
  const stateMap = new Map(states.map((s) => [s.id, s]));
  const merged: string[][] = [];
  const used = new Set<string>();

  for (const comp of components) {
    if (comp.some((id) => used.has(id))) continue;
    const current = [...comp];
    for (const id of comp) used.add(id);

    for (const other of components) {
      if (other === comp || other.some((id) => used.has(id))) continue;
      const canMerge = current.some((a) =>
        other.some((b) => {
          const sa = stateMap.get(a);
          const sb = stateMap.get(b);
          if (!sa || !sb) return false;
          const aSeg = sa.url.split("/")[1] ?? "";
          const bSeg = sb.url.split("/")[1] ?? "";
          return aSeg && aSeg === bSeg;
        }),
      );
      if (canMerge) {
        current.push(...other);
        for (const id of other) used.add(id);
      }
    }
    merged.push(current);
  }
  return merged;
}

function splitLargeClusters(clusters: string[][], states: State[]): string[][] {
  const stateMap = new Map(states.map((s) => [s.id, s]));
  const result: string[][] = [];

  for (const cluster of clusters) {
    if (cluster.length <= 8) {
      result.push(cluster);
      continue;
    }
    const groups = new Map<string, string[]>();
    for (const id of cluster) {
      const state = stateMap.get(id);
      if (!state) continue;
      const seg = state.url.split("/")[2] ?? "other";
      if (!groups.has(seg)) groups.set(seg, []);
      groups.get(seg)!.push(state.id);
    }
    for (const group of groups.values()) {
      result.push(group);
    }
  }
  return result;
}

function attachOrphans(
  clusters: string[][],
  states: State[],
  transitions: Transition[],
): string[][] {
  const inCluster = new Set(clusters.flat());
  const orphans = states.filter((s) => !inCluster.has(s.id));

  for (const orphan of orphans) {
    let bestCluster: string[] | null = null;
    let maxIncoming = -1;

    for (const cluster of clusters) {
      let incoming = 0;
      for (const trans of transitions) {
        if (
          trans.toStateId === orphan.id &&
          cluster.includes(trans.fromStateId)
        ) {
          incoming++;
        }
      }
      if (incoming > maxIncoming) {
        maxIncoming = incoming;
        bestCluster = cluster;
      }
    }

    if (bestCluster) {
      bestCluster.push(orphan.id);
    } else {
      clusters.push([orphan.id]);
    }
  }
  return clusters;
}

async function nameAndRankCapabilities(
  clusters: string[][],
  states: State[],
  transitions: Transition[],
  affordancesByState: Map<string, Affordance[]>,
  intent: string | undefined,
  sessionId: string,
): Promise<Capability[]> {
  const stateMap = new Map(states.map((s) => [s.id, s]));
  const capabilities: Capability[] = [];

  for (let i = 0; i < clusters.length; i++) {
    const cluster = clusters[i];
    if (!cluster) continue;
    const clusterStates = cluster
      .map((id) => stateMap.get(id))
      .filter((state): state is State => state !== undefined);

    const entryState = findEntryState(cluster, states, transitions);
    const exitConditions = findExitConditions(cluster, states, transitions);
    const dependsOn: string[] = [];
    const factors = computeRiskFactors(
      clusterStates,
      transitions,
      affordancesByState,
      intent,
    );
    const score = computeRiskScore(factors);

    const name = fallbackName(clusterStates);
    const description = fallbackDescription(clusterStates);

    capabilities.push({
      id: stableId(
        "cap",
        sessionId,
        ...clusterStates.map((state) => state.id).sort(),
      ),
      sessionId,
      name,
      description,
      entryStateId: entryState?.id ?? clusterStates[0]?.id ?? "",
      stateIds: clusterStates.map((s) => s.id),
      exitConditions,
      dependsOn,
      risk: { score, factors },
      priorityRank: 0,
    });
  }

  const capabilityByState = new Map<string, string>();
  for (const capability of capabilities) {
    for (const stateId of capability.stateIds)
      capabilityByState.set(stateId, capability.id);
  }
  for (const capability of capabilities) {
    const ownStates = new Set(capability.stateIds);
    const dependencies = new Set<string>();
    for (const transition of transitions) {
      if (!ownStates.has(transition.toStateId)) continue;
      const sourceCapability = capabilityByState.get(transition.fromStateId);
      if (sourceCapability && sourceCapability !== capability.id)
        dependencies.add(sourceCapability);
    }
    capability.dependsOn = Array.from(dependencies).sort();
  }

  capabilities.sort((a, b) => {
    const aIntent = intentMatches(a, intent);
    const bIntent = intentMatches(b, intent);
    if (aIntent !== bIntent) return aIntent ? -1 : 1;
    if (b.risk.score !== a.risk.score) return b.risk.score - a.risk.score;
    return a.name.localeCompare(b.name);
  });

  capabilities.forEach((cap, idx) => {
    cap.priorityRank = idx;
  });

  return capabilities;
}

function findEntryState(
  cluster: string[],
  states: State[],
  transitions: Transition[],
): State | null {
  const stateMap = new Map(states.map((s) => [s.id, s]));
  const clusterSet = new Set(cluster);
  let maxIncoming = -1;
  let entry: State | null = null;

  for (const stateId of cluster) {
    const state = stateMap.get(stateId);
    if (!state) continue;
    let incoming = 0;
    for (const trans of transitions) {
      if (trans.toStateId === state.id && !clusterSet.has(trans.fromStateId)) {
        incoming++;
      }
    }
    if (incoming > maxIncoming) {
      maxIncoming = incoming;
      entry = state;
    }
  }
  return entry ?? (cluster[0] ? (stateMap.get(cluster[0]) ?? null) : null);
}

function findExitConditions(
  cluster: string[],
  states: State[],
  transitions: Transition[],
): string[] {
  const stateMap = new Map(states.map((s) => [s.id, s]));
  const clusterSet = new Set(cluster);
  const exits = new Set<string>();

  for (const stateId of cluster) {
    for (const trans of transitions) {
      if (trans.fromStateId === stateId && !clusterSet.has(trans.toStateId)) {
        const toState = stateMap.get(trans.toStateId);
        if (toState) exits.add(toState.title);
      }
    }
  }
  const first = cluster[0] ? stateMap.get(cluster[0]) : undefined;
  return exits.size > 0
    ? Array.from(exits)
    : [`returns to ${first?.title ?? "entry"}`];
}

function computeRiskFactors(
  clusterStates: State[],
  transitions: Transition[],
  affordancesByState: Map<string, Affordance[]>,
  intent: string | undefined,
): RiskFactors {
  const lexicon = [
    "card",
    "credit",
    "payment",
    "pay",
    "price",
    "total",
    "invoice",
    "billing",
    "iban",
    "cvv",
    "ssn",
    "passport",
    "dob",
    "address",
    "phone",
    "email",
    "password",
  ];

  const matchedTerms = new Set<string>();
  let dataMutation = 0;
  let authProximity = 0;
  let affordanceCount = 0;

  for (const state of clusterStates) {
    const affs = affordancesByState.get(state.id) ?? [];
    affordanceCount += affs.length;
    for (const aff of affs) {
      const haystack = [aff.accessibleName, state.url, state.title]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      for (const term of lexicon) {
        if (haystack.includes(term)) {
          matchedTerms.add(term);
        }
      }
      if (aff.kind === "button" && !aff.destructive) {
        dataMutation = Math.max(dataMutation, 1);
      } else if (
        ["textbox", "select", "checkbox", "radio"].includes(aff.kind)
      ) {
        dataMutation = Math.max(dataMutation, 0.6);
      }
      if (state.authRequired) authProximity = 1;
    }
  }
  const moneyOrPii = Math.min(1, matchedTerms.size / 3);

  const graphCentrality = 0.5;
  const affordanceDensity = Math.min(1, affordanceCount / 50);

  const statedIntent = intent
    ? jaccardOverlap(intent, clusterStates.map((s) => s.title).join(" "))
    : 0;

  return {
    authProximity,
    dataMutation,
    moneyOrPii,
    graphCentrality,
    affordanceDensity,
    statedIntent,
  };
}

function computeRiskScore(factors: RiskFactors): number {
  const W = {
    moneyOrPii: 0.28,
    dataMutation: 0.22,
    authProximity: 0.15,
    graphCentrality: 0.15,
    affordanceDensity: 0.1,
    statedIntent: 0.1,
  };
  return (
    W.moneyOrPii * factors.moneyOrPii +
    W.dataMutation * factors.dataMutation +
    W.authProximity * factors.authProximity +
    W.graphCentrality * factors.graphCentrality +
    W.affordanceDensity * factors.affordanceDensity +
    W.statedIntent * factors.statedIntent
  );
}

function jaccardOverlap(a: string, b: string): number {
  const tokensA = new Set(a.toLowerCase().split(/\W+/).filter(Boolean));
  const tokensB = new Set(b.toLowerCase().split(/\W+/).filter(Boolean));
  const intersection = [...tokensA].filter((t) => tokensB.has(t)).length;
  const union = tokensA.size + tokensB.size - intersection;
  return union > 0 ? intersection / union : 0;
}

function intentMatches(cap: Capability, intent: string | undefined): boolean {
  if (!intent) return false;
  const haystack = `${cap.name} ${cap.description}`.toLowerCase();
  return intent
    .toLowerCase()
    .split(/\W+/)
    .some((t) => t.length > 2 && haystack.includes(t));
}

function fallbackName(states: State[]): string {
  const first = states[0];
  if (!first) return "Unknown";
  const segments = first.url.split("/").filter(Boolean);
  if (segments.length > 0) {
    const seg = (segments.at(-1) ?? "unknown").replace(/^:/, "");
    return seg.charAt(0).toUpperCase() + seg.slice(1);
  }
  return first.title.split(" ")[0] ?? "Unknown";
}

function fallbackDescription(states: State[]): string {
  return `Capability covering ${states.length} state${states.length !== 1 ? "s" : ""}: ${states.map((s) => s.title).join(", ")}`;
}
