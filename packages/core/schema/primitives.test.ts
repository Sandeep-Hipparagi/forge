import { describe, expect, it } from "vitest";
import { Id } from "./primitives.js";

const validIds = [
  "ses_01j9x2k4",
  "st_01j9x2k5",
  "af_01j9x2k6",
  "tr_01j9x2k7",
  "cap_01j9x2k8",
  "lap_01j9x2k9",
  "pln_01j9x3a0",
  "cva_01j9x3a1",
  "gap_01j9x3a2",
  "run_01j9x3aa",
  "ev_01j9x3ab",
  "fp_01j9x3ac",
  "dg_01j9x3ad",
  "hc_01j9x3ae",
  "pt_01j9x3af",
  "qr_01j9x3ag",
];

describe("ID prefix contract", () => {
  it.each(validIds)("accepts %s", (id) => {
    expect(Id.parse(id)).toBe(id);
  });

  it.each(["ses-short", "S_01j9x2k4", "scenario_01j9x2k4", "ses_01J9X2K4"])("rejects %s", (id) => {
    expect(Id.safeParse(id).success).toBe(false);
  });
});
