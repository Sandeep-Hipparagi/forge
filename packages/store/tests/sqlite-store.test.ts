import { describe, expect, it } from "vitest";
import { DurableEventStore } from "../src/index.js";
import { fixedClock } from "@forge/core";

describe("DurableEventStore", () => {
  it.skipIf(process.versions.node.split(".")[0] !== "22")(
    "commits before publishing and returns events in order",
    () => {
      const store = new DurableEventStore(
        ":memory:",
        fixedClock("2026-01-01T00:00:00.000Z"),
      );
      const received: number[] = [];
      store.subscribe("ses_00000000", (event) => received.push(event.id));
      const first = store.append(
        "ses_00000000",
        "session.started",
        {},
        "a".repeat(64),
      );
      const second = store.append(
        "ses_00000000",
        "session.finished",
        {},
        "b".repeat(64),
      );
      expect(store.after("ses_00000000").map((event) => event.id)).toEqual([
        first.id,
        second.id,
      ]);
      expect(received).toEqual([first.id, second.id]);
    },
  );
});
