import { describe, expect, it } from "vitest";
import { compile } from "./compile.js";
import { emitProject } from "./emit.js";
import { compileFixturePlan } from "./fixture.js";

describe("compile", () => {
  it("compile_is_byte_identical — two compiles of one fixture plan are equal (FR-401)", () => {
    const { plan, affordances, states, capabilityName } = compileFixturePlan();
    const opts = { capabilityName, affordances, states, assessmentScore: 0.8435, floor: 0.7 };
    const a = compile(plan, opts);
    const b = compile(plan, opts);
    expect(a.specs).toHaveLength(1);
    expect(a.specs[0]!.content).toBe(b.specs[0]!.content);
    expect(a.specs[0]!.relativePath).toBe("tests/generated/checkout.spec.ts");
  });

  it("no_wall_clock_in_emitted_code — no timestamp in any generated .spec.ts ([12 §7])", () => {
    const { plan, affordances, states, capabilityName } = compileFixturePlan();
    const suite = compile(plan, {
      capabilityName,
      affordances,
      states,
      assessmentScore: 0.8435,
      floor: 0.7,
    });
    const emitted = emitProject(suite, {
      sessionId: "ses_01j9cmp01",
      planId: plan.id,
      modelId: "none",
      browserRevision: "chromium-pinned",
      createdAt: "2026-09-05T12:00:00.000Z",
    });

    for (const file of emitted.files) {
      if (!file.relativePath.endsWith(".spec.ts")) continue;
      expect(file.content).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
      expect(file.content).not.toMatch(/Date\.now|new Date\(|Math\.random|randomUUID/);
      // Provenance cites ids and scores, never a wall-clock stamp
      expect(file.content).toContain("assessment score 0.8435");
      expect(file.content).toContain("floor 0.7000");
    }

    const manifest = emitted.files.find((f) => f.relativePath === "forge.manifest.json");
    expect(manifest?.content).toContain("2026-09-05T12:00:00.000Z");
  });

  it("emits role+name locators and refuses xpath / positional selectors", () => {
    const { plan, affordances, states, capabilityName } = compileFixturePlan();
    const suite = compile(plan, { capabilityName, affordances, states });
    const spec = suite.specs[0]!.content;
    expect(spec).toContain('getByRole("textbox", { name: "Full name" })');
    expect(spec).toContain('getByRole("button", { name: "Continue" })');
    expect(spec).toContain('getByRole("heading", { name: "Order confirmed" })');
    expect(spec).not.toMatch(/\.nth\(|\.first\(|\.last\(|xpath|page\.evaluate|waitForTimeout/);
    expect(spec).not.toMatch(/\bif\b|\btry\b|\bcatch\b/);
  });

  it("emitProject returns one file per capability and zero FORGE imports (FR-405, FR-408)", () => {
    const { plan, affordances, states, capabilityName } = compileFixturePlan();
    const suite = compile(plan, { capabilityName, affordances, states });
    const emitted = emitProject(suite, {
      sessionId: "ses_01j9cmp01",
      planId: plan.id,
      modelId: "none",
      browserRevision: "chromium-pinned",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    const paths = emitted.files.map((f) => f.relativePath).sort();
    expect(paths).toContain("tests/generated/checkout.spec.ts");
    expect(paths.filter((p) => p.startsWith("tests/generated/"))).toHaveLength(1);
    for (const file of emitted.files) {
      expect(file.content).not.toMatch(/@forge\//);
    }
  });
});
