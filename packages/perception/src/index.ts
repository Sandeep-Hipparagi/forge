export { explore, type ExplorerInput, type AgentContext, type ExplorerOutput, FRONTIER_BATCH, MAX_STATES } from "./frontier.js";
export { detectLoginForm, buildDomFacts, isAuthenticated } from "./login.js";
export {
  normalizeSnapshot,
  stateSignature,
  extractAffordances,
  affordancesOf,
  isDestructive,
  DESTRUCTIVE_PATTERN,
  MAX_INTERACTIVES,
  SIGNATURE_LENGTH,
  getSnapshotSize,
} from "./perception.js";
export type {
  AccessibilityNode,
  AccessibilitySnapshot,
  DomFacts,
  LoginForm,
  Affordance,
  State,
  Transition,
  Capability,
  RiskFactors,
  CapabilityMap,
  FrontierItem,
} from "./types.js";