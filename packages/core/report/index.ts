export { buildReport, computeRobustnessScore, hydrateScenarioStatuses } from "./score.js";
export type {
  CapabilityScoreInput,
  ReportDefect,
  ReportHealerAction,
  ReportInput,
  ReportScenario,
  ReportScenarioStatus,
  ReportUntested,
} from "./score.js";
export { renderMarkdown } from "./render.js";
export type { RenderableReport } from "./render.js";
export { demoReportInput } from "./demo.js";
export { stubReportInput } from "./stub.js";
