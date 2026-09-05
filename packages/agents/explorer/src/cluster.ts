import type { Affordance, Capability, CapabilityMap, IdGen, State, Transition } from "@forge/core";

const GLOBAL_NAV_THRESHOLD = 0.6;
const MAX_CLUSTER_STATES = 8;

export type ClusterInput = {
  sessionId: string;
  states: State[];
  affordances: Affordance[];
  transitions: Transition[];
  /** Optional naming override (model). Fallback naming runs when omitted. */
  nameCluster?: (cluster: {
    stateIds: string[];
    routeTemplates: string[];
    headings: string[];
    affordanceNames: string[];
  }) => { name: string; description: string };
  ids?: IdGen;
};

/**
 * Normalise a URL path to a route template (`/order/12` → `/order/:id`).
 */
export function routeTemplateOf(url: string): string {
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    pathname = url;
  }
  const normalised = pathname
    .split("/")
    .map((segment) => {
      if (!segment) return "";
      if (/^[0-9]+$/.test(segment)) return ":id";
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segment)) {
        return ":id";
      }
      return segment;
    })
    .join("/");
  return normalised === "" ? "/" : normalised;
}

function firstSegment(template: string): string {
  const parts = template.split("/").filter(Boolean);
  return parts[0] ?? "";
}

function secondSegment(template: string): string {
  const parts = template.split("/").filter(Boolean);
  return parts[1] ?? "";
}

function titleCase(segment: string): string {
  if (!segment || segment === ":id") return "Page";
  return segment
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function segmentLists(templates: string[]): string[][] {
  return templates.map((template) =>
    template.split("/").filter((segment) => segment.length > 0 && segment !== ":id"),
  );
}

/** Longest common prefix of route segments, title-cased (`/account/orders` → Account Orders). */
export function longestCommonRouteLabel(templates: string[]): string {
  const lists = segmentLists(templates).filter((parts) => parts.length > 0);
  if (lists.length === 0) return "";
  const [first, ...rest] = lists;
  const prefix: string[] = [];
  for (let index = 0; index < first!.length; index += 1) {
    const candidate = first![index]!;
    if (rest.every((parts) => parts[index] === candidate)) {
      prefix.push(candidate);
    } else {
      break;
    }
  }
  if (prefix.length === 0) {
    // No shared prefix — fall back to the most common first segment.
    const counts = new Map<string, number>();
    for (const parts of lists) {
      const head = parts[0]!;
      counts.set(head, (counts.get(head) ?? 0) + 1);
    }
    let best = "";
    let bestCount = 0;
    for (const [segment, count] of counts) {
      if (count > bestCount) {
        best = segment;
        bestCount = count;
      }
    }
    return titleCase(best);
  }
  return prefix.map(titleCase).join(" ");
}

function normaliseCapabilityName(name: string): string {
  const trimmed = name.trim();
  if (/^sign[\s-]?in$/i.test(trimmed) || /^log[\s-]?in$/i.test(trimmed)) {
    return "Sign-in";
  }
  return trimmed;
}

export function fallbackNameCluster(input: {
  stateIds: string[];
  routeTemplates: string[];
  headings: string[];
  states: State[];
}): { name: string; description: string } {
  const hasRoot = input.routeTemplates.some((template) => template === "/" || template === "");
  const fromRoute = hasRoot ? "" : longestCommonRouteLabel(input.routeTemplates);
  if (fromRoute) {
    const name = normaliseCapabilityName(fromRoute);
    return {
      name,
      description: `${name} flows across ${input.stateIds.length} observed states`,
    };
  }
  const entry = input.states[0];
  const heading = input.headings.find((h) => h.trim().length > 0) ?? entry?.title ?? "Entry";
  const name = normaliseCapabilityName(heading.trim().slice(0, 40) || "Entry");
  return {
    name,
    description: `${name} capability covering the entry surface`,
  };
}

type MutableCluster = {
  stateIds: string[];
};

function weaklyConnectedComponents(
  stateIds: string[],
  edges: Array<{ from: string; to: string }>,
): string[][] {
  const adjacency = new Map<string, Set<string>>();
  for (const id of stateIds) {
    adjacency.set(id, new Set());
  }
  for (const edge of edges) {
    if (!adjacency.has(edge.from) || !adjacency.has(edge.to)) continue;
    adjacency.get(edge.from)!.add(edge.to);
    adjacency.get(edge.to)!.add(edge.from);
  }

  const seen = new Set<string>();
  const components: string[][] = [];
  for (const id of stateIds) {
    if (seen.has(id)) continue;
    const queue = [id];
    seen.add(id);
    const component: string[] = [];
    while (queue.length > 0) {
      const current = queue.shift()!;
      component.push(current);
      for (const neighbour of adjacency.get(current) ?? []) {
        if (seen.has(neighbour)) continue;
        seen.add(neighbour);
        queue.push(neighbour);
      }
    }
    components.push(component);
  }
  return components;
}

/**
 * Nav-stripping capability clustering (09 §5). Pure and deterministic.
 */
export function clusterCapabilities(input: ClusterInput): Capability[] {
  const stateById = new Map(input.states.map((state) => [state.id, state]));
  const stateIds = input.states.map((state) => state.id);
  if (stateIds.length === 0) return [];

  const affordancesByState = new Map<string, Affordance[]>();
  for (const affordance of input.affordances) {
    const list = affordancesByState.get(affordance.stateId) ?? [];
    list.push(affordance);
    affordancesByState.set(affordance.stateId, list);
  }

  // Pass 1 — strip global navigation.
  const pairCounts = new Map<string, number>();
  for (const state of input.states) {
    const seenPairs = new Set<string>();
    for (const affordance of affordancesByState.get(state.id) ?? []) {
      const pair = `${affordance.role}|${affordance.accessibleName ?? ""}`;
      if (seenPairs.has(pair)) continue;
      seenPairs.add(pair);
      pairCounts.set(pair, (pairCounts.get(pair) ?? 0) + 1);
    }
  }

  const globalPairs = new Set<string>();
  for (const [pair, count] of pairCounts) {
    if (count / input.states.length >= GLOBAL_NAV_THRESHOLD) {
      globalPairs.add(pair);
    }
  }

  const globalAffordanceIds = new Set<string>();
  for (const affordance of input.affordances) {
    const pair = `${affordance.role}|${affordance.accessibleName ?? ""}`;
    if (globalPairs.has(pair)) {
      globalAffordanceIds.add(affordance.id);
    }
  }

  const clusteringEdges = input.transitions
    .filter((transition) => !globalAffordanceIds.has(transition.viaAffordanceId))
    .map((transition) => ({
      from: transition.fromStateId,
      to: transition.toStateId,
    }));

  // Pass 2 — weakly connected components.
  let clusters: MutableCluster[] = weaklyConnectedComponents(stateIds, clusteringEdges).map(
    (ids) => ({ stateIds: ids }),
  );

  const segmentKey = (stateId: string): string => {
    const segment = firstSegment(routeTemplateOf(stateById.get(stateId)!.url));
    return segment || "__root__";
  };

  // Pass 2b — split components that span multiple first-route segments.
  // Without this, a cart→checkout local edge glues unrelated capabilities into
  // one blob; orphans (pass 5) then re-attach `/order/:id` to Checkout.
  {
    const refined: MutableCluster[] = [];
    for (const cluster of clusters) {
      const byFirst = new Map<string, string[]>();
      for (const stateId of cluster.stateIds) {
        const key = segmentKey(stateId);
        const list = byFirst.get(key) ?? [];
        list.push(stateId);
        byFirst.set(key, list);
      }
      if (byFirst.size === 1) {
        refined.push(cluster);
        continue;
      }
      for (const ids of byFirst.values()) {
        refined.push({ stateIds: ids });
      }
    }
    clusters = refined;
  }

  const entryOf = (cluster: MutableCluster): State => {
    const memberSet = new Set(cluster.stateIds);
    let bestId = cluster.stateIds[0]!;
    let bestScore = -1;
    for (const stateId of cluster.stateIds) {
      let inbound = 0;
      for (const edge of clusteringEdges) {
        if (edge.to === stateId && !memberSet.has(edge.from)) inbound += 1;
      }
      // Prefer discovery order on ties — first listed state wins when scores equal.
      const discoveryIndex = stateIds.indexOf(stateId);
      const score = inbound * 1_000_000 - discoveryIndex;
      if (score > bestScore) {
        bestScore = score;
        bestId = stateId;
      }
    }
    return stateById.get(bestId)!;
  };

  // Pass 3 — merge clusters whose entry states share a first route segment.
  const merged: MutableCluster[] = [];
  const bySegment = new Map<string, MutableCluster>();
  for (const cluster of clusters) {
    const segment = firstSegment(routeTemplateOf(entryOf(cluster).url));
    if (!segment) {
      merged.push(cluster);
      continue;
    }
    const existing = bySegment.get(segment);
    if (existing) {
      existing.stateIds.push(...cluster.stateIds);
    } else {
      const created = { stateIds: [...cluster.stateIds] };
      bySegment.set(segment, created);
      merged.push(created);
    }
  }
  clusters = merged;

  // Pass 4 — split clusters above 8 states by second route segment.
  const split: MutableCluster[] = [];
  for (const cluster of clusters) {
    if (cluster.stateIds.length <= MAX_CLUSTER_STATES) {
      split.push(cluster);
      continue;
    }
    const bySecond = new Map<string, string[]>();
    for (const stateId of cluster.stateIds) {
      const state = stateById.get(stateId)!;
      const key = secondSegment(routeTemplateOf(state.url)) || "__root__";
      const list = bySecond.get(key) ?? [];
      list.push(stateId);
      bySecond.set(key, list);
    }
    if (bySecond.size === 1) {
      split.push(cluster);
      continue;
    }
    for (const ids of bySecond.values()) {
      split.push({ stateIds: ids });
    }
  }
  clusters = split;

  // Pass 5 — attach orphans via non-nav edges only. Singletons may join
  // other singletons (product → browse) as well as multi-state clusters
  // (order → checkout). Nav edges are ignored so shared headers cannot
  // glue the map back together after pass 1.
  {
    let working: MutableCluster[] = clusters.map((cluster) => ({
      stateIds: [...cluster.stateIds],
    }));
    let changed = true;
    while (changed) {
      changed = false;
      const singles = working.filter((cluster) => cluster.stateIds.length === 1);
      for (const orphan of singles) {
        const orphanId = orphan.stateIds[0]!;
        let best: MutableCluster | null = null;
        let bestCount = 0;
        for (const candidate of working) {
          if (candidate === orphan) continue;
          const memberSet = new Set(candidate.stateIds);
          let count = 0;
          for (const edge of clusteringEdges) {
            if (edge.to === orphanId && memberSet.has(edge.from)) count += 1;
          }
          if (count > bestCount) {
            bestCount = count;
            best = candidate;
          }
        }
        if (best !== null && bestCount > 0) {
          best.stateIds.push(orphanId);
          working = working.filter((cluster) => cluster !== orphan);
          changed = true;
          break;
        }
      }
    }
    clusters = working;
  }

  // Preserve discovery order of states inside each cluster.
  for (const cluster of clusters) {
    cluster.stateIds.sort((left, right) => stateIds.indexOf(left) - stateIds.indexOf(right));
  }
  // Stable cluster order: by earliest discovered state.
  clusters.sort(
    (left, right) => stateIds.indexOf(left.stateIds[0]!) - stateIds.indexOf(right.stateIds[0]!),
  );

  const idGen: IdGen =
    input.ids ??
    (() => {
      let n = 0;
      return {
        next(prefix: string): string {
          n += 1;
          return `${prefix}_${String(n).padStart(8, "0")}`;
        },
      };
    })();

  const loginStateIds = new Set(
    input.states
      .filter((state) => /login|sign-?in|auth/i.test(routeTemplateOf(state.url)))
      .map((state) => state.id),
  );

  const capabilities: Capability[] = clusters.map((cluster, index) => {
    const states = cluster.stateIds.map((id) => stateById.get(id)!);
    const routeTemplates = [...new Set(states.map((state) => routeTemplateOf(state.url)))];
    const affordanceNames = cluster.stateIds.flatMap((stateId) =>
      (affordancesByState.get(stateId) ?? [])
        .map((affordance) => affordance.accessibleName)
        .filter((name): name is string => Boolean(name)),
    );
    const headings = states.map((state) => state.title);
    const named = input.nameCluster
      ? input.nameCluster({
          stateIds: cluster.stateIds,
          routeTemplates,
          headings,
          affordanceNames,
        })
      : fallbackNameCluster({
          stateIds: cluster.stateIds,
          routeTemplates,
          headings,
          states,
        });

    const memberSet = new Set(cluster.stateIds);
    const entry = entryOf(cluster);

    const exitConditions: string[] = [];
    for (const transition of input.transitions) {
      if (!memberSet.has(transition.fromStateId)) continue;
      if (memberSet.has(transition.toStateId)) continue;
      const outside = stateById.get(transition.toStateId);
      if (outside) {
        const label = `reaches ${outside.title}`;
        if (!exitConditions.includes(label)) exitConditions.push(label);
      }
    }
    if (exitConditions.length === 0) {
      exitConditions.push(`returns to ${entry.title}`);
    }

    return {
      id: idGen.next("cap"),
      sessionId: input.sessionId,
      name: named.name,
      description:
        named.description.length >= 10
          ? named.description
          : `${named.description} capability surface`,
      entryStateId: entry.id,
      stateIds: cluster.stateIds,
      exitConditions,
      dependsOn: [],
      risk: {
        score: 0,
        factors: {
          moneyOrPii: 0,
          dataMutation: 0,
          authProximity: 0,
          graphCentrality: 0,
          affordanceDensity: 0,
          statedIntent: 0,
        },
      },
      priorityRank: index,
    };
  });

  // dependsOn: auth-required clusters depend on the cluster containing login.
  const ownerByState = new Map<string, string>();
  for (const capability of capabilities) {
    for (const stateId of capability.stateIds) {
      ownerByState.set(stateId, capability.id);
    }
  }
  let loginCapabilityId: string | null = null;
  for (const stateId of loginStateIds) {
    const owner = ownerByState.get(stateId);
    if (owner) {
      loginCapabilityId = owner;
      break;
    }
  }
  if (loginCapabilityId) {
    for (const capability of capabilities) {
      const states = capability.stateIds.map((id) => stateById.get(id)!);
      const authAll = states.length > 0 && states.every((state) => state.authRequired);
      if (authAll && capability.id !== loginCapabilityId) {
        capability.dependsOn = [loginCapabilityId];
      }
    }
  }

  return capabilities;
}

export function assembleCapabilityMap(options: {
  sessionId: string;
  authenticated: boolean;
  states: State[];
  affordances: Affordance[];
  transitions: Transition[];
  frontier: CapabilityMap["frontier"];
  nameCluster?: ClusterInput["nameCluster"];
  ids?: IdGen;
}): CapabilityMap {
  const capabilities = clusterCapabilities({
    sessionId: options.sessionId,
    states: options.states,
    affordances: options.affordances,
    transitions: options.transitions,
    ...(options.nameCluster ? { nameCluster: options.nameCluster } : {}),
    ...(options.ids ? { ids: options.ids } : {}),
  });

  return {
    sessionId: options.sessionId,
    authenticated: options.authenticated,
    states: options.states,
    affordances: options.affordances,
    transitions: options.transitions,
    capabilities,
    apiHints: [],
    frontier: options.frontier,
  };
}
