import type { Affordance, Capability, CapabilityMap, RiskFactors, State } from "@forge/core";

type CapabilityStats = {
  capability: Capability;
  states: State[];
  affordances: Affordance[];
  incomingFromOutside: number;
  hasSubmitOrNonGet: boolean;
  hasTextbox: boolean;
  authAny: boolean;
  authAll: boolean;
};

const MONEY_OR_PII_LEXICON = [
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
] as const;

const RISK_WEIGHTS: Record<keyof RiskFactors, number> = {
  moneyOrPii: 0.28,
  dataMutation: 0.22,
  authProximity: 0.15,
  graphCentrality: 0.15,
  affordanceDensity: 0.1,
  // Intent is a promotion, not a weight in the risk score itself.
  statedIntent: 0,
};

function normaliseMethod(method: string | undefined): string {
  return (method ?? "GET").toUpperCase();
}

function textForMoneyOrPii(stats: CapabilityStats): string {
  const stateText = stats.states.map((state) => `${state.title ?? ""} ${state.url}`).join(" ");
  const affordanceText = stats.affordances
    .map((affordance) => affordance.accessibleName ?? "")
    .join(" ");
  return `${stats.capability.name} ${stats.capability.description} ${stateText} ${affordanceText}`.toLowerCase();
}

function countLexiconHits(text: string): number {
  let hits = 0;
  for (const term of MONEY_OR_PII_LEXICON) {
    if (text.includes(term)) {
      hits += 1;
    }
  }
  return hits;
}

function tokenise(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter((token) => token.length > 0);
}

function jaccardSimilarity(a: string, b: string): number {
  const aTokens = new Set(tokenise(a));
  const bTokens = new Set(tokenise(b));
  if (aTokens.size === 0 || bTokens.size === 0) return 0;
  let intersection = 0;
  for (const token of aTokens) {
    if (bTokens.has(token)) intersection += 1;
  }
  const union = aTokens.size + bTokens.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function computeCapabilityStats(map: CapabilityMap): CapabilityStats[] {
  const stateById = new Map<string, State>(map.states.map((state) => [state.id, state]));
  const ownerByStateId = new Map<string, string>();

  for (const capability of map.capabilities) {
    for (const stateId of capability.stateIds) {
      if (!ownerByStateId.has(stateId)) {
        ownerByStateId.set(stateId, capability.id);
      }
    }
  }

  const affordancesByStateId = new Map<string, Affordance[]>();
  for (const affordance of map.affordances) {
    const list = affordancesByStateId.get(affordance.stateId) ?? [];
    list.push(affordance);
    affordancesByStateId.set(affordance.stateId, list);
  }

  const statsByCapabilityId = new Map<string, CapabilityStats>();

  for (const capability of map.capabilities) {
    const states: State[] = [];
    const affordances: Affordance[] = [];
    let authAny = false;
    let authAll = true;

    for (const stateId of capability.stateIds) {
      const state = stateById.get(stateId);
      if (!state) continue;
      states.push(state);
      if (state.authRequired) {
        authAny = true;
      } else {
        authAll = false;
      }
      for (const affordance of affordancesByStateId.get(state.id) ?? []) {
        affordances.push(affordance);
      }
    }

    statsByCapabilityId.set(capability.id, {
      capability,
      states,
      affordances,
      incomingFromOutside: 0,
      hasSubmitOrNonGet: false,
      hasTextbox: affordances.some((affordance) => affordance.kind === "textbox"),
      authAny,
      authAll: authAny && authAll,
    });
  }

  for (const transition of map.transitions) {
    const fromOwner = ownerByStateId.get(transition.fromStateId) ?? null;
    const toOwner = ownerByStateId.get(transition.toStateId) ?? null;
    if (toOwner !== null && fromOwner !== toOwner) {
      const stats = statsByCapabilityId.get(toOwner);
      if (stats) {
        stats.incomingFromOutside += 1;
      }
    }
    if (transition.action === "submit" && toOwner !== null) {
      const stats = statsByCapabilityId.get(toOwner);
      if (stats) {
        stats.hasSubmitOrNonGet = true;
      }
    }
  }

  for (const hint of map.apiHints ?? []) {
    const nonGet = normaliseMethod(hint.method) !== "GET";
    if (!nonGet) continue;
    for (const stateId of hint.seenInStateIds) {
      const owner = ownerByStateId.get(stateId);
      if (!owner) continue;
      const stats = statsByCapabilityId.get(owner);
      if (stats) {
        stats.hasSubmitOrNonGet = true;
      }
    }
  }

  return [...statsByCapabilityId.values()];
}

function computeRiskFactorsForAll(
  statsList: CapabilityStats[],
  sessionIntent: string | undefined,
): Array<{
  capability: Capability;
  factors: RiskFactors;
  score: number;
  intentMatched: boolean;
}> {
  const maxIncoming = Math.max(0, ...statsList.map((stats) => stats.incomingFromOutside));
  const maxAffordances = Math.max(0, ...statsList.map((stats) => stats.affordances.length));
  const trimmedIntent = sessionIntent?.trim();

  return statsList.map((stats) => {
    const moneyHits = countLexiconHits(textForMoneyOrPii(stats));
    const moneyOrPii = Math.min(1, moneyHits / 3);

    let dataMutation = 0;
    if (stats.hasSubmitOrNonGet) {
      dataMutation = 1;
    } else if (stats.hasTextbox) {
      dataMutation = 0.6;
    }

    const authProximity = stats.authAny ? (stats.authAll ? 1 : 0.6) : 0;

    const graphCentrality = maxIncoming === 0 ? 0 : stats.incomingFromOutside / maxIncoming;

    const affordanceDensity = maxAffordances === 0 ? 0 : stats.affordances.length / maxAffordances;

    const statedIntent =
      trimmedIntent && trimmedIntent.length > 0
        ? jaccardSimilarity(
            trimmedIntent,
            `${stats.capability.name} ${stats.capability.description}`,
          )
        : 0;

    const factors: RiskFactors = {
      moneyOrPii,
      dataMutation,
      authProximity,
      graphCentrality,
      affordanceDensity,
      statedIntent,
    };

    let score = 0;
    for (const key of Object.keys(RISK_WEIGHTS) as (keyof RiskFactors)[]) {
      score += RISK_WEIGHTS[key] * factors[key];
    }

    const intentMatched = statedIntent > 0;

    return { capability: stats.capability, factors, score, intentMatched };
  });
}

export function rankCapabilities(map: CapabilityMap, options?: { intent?: string }): Capability[] {
  const statsList = computeCapabilityStats(map);
  const ranked = computeRiskFactorsForAll(statsList, options?.intent).sort((left, right) => {
    const leftIntent = left.intentMatched ? 0 : 1;
    const rightIntent = right.intentMatched ? 0 : 1;
    if (leftIntent !== rightIntent) return leftIntent - rightIntent;
    if (left.score !== right.score) return right.score - left.score;
    return left.capability.name.localeCompare(right.capability.name);
  });

  return ranked.map((entry, index) => ({
    ...entry.capability,
    risk: {
      score: entry.score,
      factors: entry.factors,
    },
    priorityRank: index,
  }));
}

export function applyRanking(map: CapabilityMap, options?: { intent?: string }): CapabilityMap {
  const rankedCapabilities = rankCapabilities(map, options);
  return {
    ...map,
    capabilities: rankedCapabilities,
  };
}
