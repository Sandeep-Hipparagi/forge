export const FORGE_AGENT_EXPLORER_VERSION = "0.0.0";

/**
 * Explorer stage (Ph2.6): `explore()` on the Ph1.4 harness.
 * Authentication is Playwright I/O in `@forge/runner` plus
 * `authenticateSession` in `@forge/orchestrator` — agents cannot import
 * runner/store (15 §2.2), so the driver layer owns the login once /
 * storageState reuse loop (FR-101, FR-102).
 *
 * The model chooses what to visit next (call site 1); the frontier,
 * signatures, deny-list, clustering and ranking stay deterministic.
 */

export {
  DEFAULT_FRONTIER_BUDGETS,
  chooseBatchFallback,
  isOffOrigin,
  resolveUrl,
  runFrontier,
  scoreAffordanceValue,
  sortFrontierItems,
  type ExerciseOutcome,
  type FrontierBudgets,
  type FrontierGraph,
  type FrontierItem,
  type FrontierObservation,
  type FrontierPorts,
  type FrontierRunInput,
  type HaltReason,
} from "./frontier.js";

export {
  assembleCapabilityMap,
  clusterCapabilities,
  fallbackNameCluster,
  longestCommonRouteLabel,
  routeTemplateOf,
  type ClusterInput,
} from "./cluster.js";

export { EXPLORER_CEILINGS, EXPLORER_SYSTEM, ExplorationDecision } from "./decision.js";

export {
  createChooseBatch,
  explore,
  type ChoiceSource,
  type ExploreResult,
  type ExplorerDriverPorts,
  type ExplorerInput,
} from "./explore.js";
