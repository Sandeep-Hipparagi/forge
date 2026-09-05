import { defaultSessionConfig, SessionConfigSnapshot } from "@forge/core";

describe("EC-00 bootstrap replay contract", () => {
  it("creates a valid deterministic configuration without a browser or model key", () => {
    const config = defaultSessionConfig();

    expect(SessionConfigSnapshot.parse(config)).toEqual(config);
    expect(config.model.enabled).toBe(false);
    expect(config.exploration.destructiveActions).toBe("deny");
  });
});
