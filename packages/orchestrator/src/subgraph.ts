import type { Capability, CapabilityMap, CapabilitySubgraph } from "@forge/core";

/**
 * Slice one capability out of a persisted map for planner/critic.
 */
export function capabilitySubgraph(map: CapabilityMap, capability: Capability): CapabilitySubgraph {
  const stateIds = new Set(capability.stateIds);
  const states = map.states
    .filter((state) => stateIds.has(state.id))
    .map((state) => ({
      id: state.id,
      signature: state.signature,
      url: state.url,
      title: state.title,
    }));
  const affordances = map.affordances.filter((affordance) => stateIds.has(affordance.stateId));
  const transitions = map.transitions.filter(
    (transition) => stateIds.has(transition.fromStateId) && stateIds.has(transition.toStateId),
  );

  const entry =
    states.find((state) => state.id === capability.entryStateId) ?? states[0] ?? map.states[0]!;

  return {
    states:
      states.length > 0
        ? states
        : [{ id: entry.id, signature: entry.signature, url: entry.url, title: entry.title }],
    transitions,
    affordances,
    entryStateId: capability.entryStateId || entry.id,
    exitConditions:
      capability.exitConditions.length > 0
        ? capability.exitConditions
        : ["Capability entry remains reachable"],
  };
}
