import { readFileSync } from "node:fs";
import { defaultSessionConfig, SessionConfigSnapshot } from "@forge/core";

describe("EC-00 bootstrap replay contract", () => {
  it("creates a valid deterministic configuration without a browser or model key", () => {
    const fixture = JSON.parse(readFileSync("fixtures/golden/EC-00-bootstrap.json", "utf8"));
    const config = defaultSessionConfig();

    expect(fixture).toMatchObject({ id: "EC-00", requiresBrowser: false, requiresModel: false, expected: "PASS" });
    expect(SessionConfigSnapshot.parse(config)).toEqual(config);
    expect(config.model.enabled).toBe(false);
    expect(config.exploration.destructiveActions).toBe("deny");
  });
});
