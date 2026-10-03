export { compile } from "./compile.js";
export { validate } from "./validate.js";
export { emitProject } from "./emit.js";
export {
  resolveLocatorLadder,
  buildLocator,
  LOCATOR_LADDER,
} from "./locator.js";
export type {
  CompiledSuite,
  CompiledScenario,
  CompiledStep,
  ValidatedSuite,
  ValidatedScenario,
  ValidatedStep,
  ElementFingerprint,
  CompileContext,
  ValidationContext,
  CompileResult,
  ValidationResult,
  LocatorStrategy,
  LocatorArgs,
} from "./types.js";
