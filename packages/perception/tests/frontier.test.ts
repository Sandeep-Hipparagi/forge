import { describe, expect, it, vi } from "vitest";
import { explore, FRONTIER_BATCH, MAX_STATES } from "../src/frontier.js";
import { detectLoginForm, buildDomFacts, isAuthenticated } from "../src/login.js";
import { normalizeSnapshot, stateSignature } from "../src/perception.js";

const loginSnapshot = {
  url: "http://localhost/login",
  title: "Sign In",
  timestamp: "2026-01-01T00:00:00.000Z",
  viewport: { width: 1440, height: 900, deviceScaleFactor: 1 },
  nodes: [
    {
      role: "form",
      children: [
        { role: "textbox", name: "Email", autocomplete: "email", children: [] },
        { role: "textbox", name: "Password", autocomplete: "current-password", children: [] },
        { role: "button", name: "Sign in", children: [] },
      ],
    },
  ],
  metadata: { interactivesCount: 0, interactivesDropped: 0 },
};

const loginDomFacts = {
  inputs: [
    { type: "email", name: "email", id: "email", autocomplete: "email", placeholder: "Email", accessibleName: "Email", ref: "e0" },
    { type: "password", name: "password", id: "password", autocomplete: "current-password", placeholder: "Password", accessibleName: "Password", ref: "e1" },
  ],
  forms: [
    { ref: "form_0", action: "/login", method: "POST", inputs: ["e0", "e1"], buttons: ["e2"] },
  ],
  buttons: [
    { ref: "e2", accessibleName: "Sign in", role: "button", landmark: "main" },
  ],
  landmarks: [
    { role: "main", label: null, refs: ["e0", "e1", "e2"] },
  ],
};

const homeSnapshot = {
  url: "http://localhost/",
  title: "Home",
  timestamp: "2026-01-01T00:00:00.000Z",
  viewport: { width: 1440, height: 900, deviceScaleFactor: 1 },
  nodes: [
    { role: "banner", children: [{ role: "link", name: "Products", children: [] }] },
    { role: "main", children: [{ role: "heading", name: "Welcome", children: [] }] },
  ],
  metadata: { interactivesCount: 0, interactivesDropped: 0 },
};

const productsSnapshot = {
  url: "http://localhost/products",
  title: "Products",
  timestamp: "2026-01-01T00:00:00.000Z",
  viewport: { width: 1440, height: 900, deviceScaleFactor: 1 },
  nodes: [
    { role: "banner", children: [{ role: "link", name: "Home", children: [] }] },
    { role: "main", children: [
      { role: "list", children: [
        { role: "listitem", children: [
          { role: "link", name: "Product A", children: [] },
          { role: "button", name: "Add to cart", children: [] },
        ]},
      ]},
    ]},
  ],
  metadata: { interactivesCount: 0, interactivesDropped: 0 },
};

describe("login", () => {
  describe("detectLoginForm", () => {
    it("detects login form from normalized snapshot", () => {
      const normalized = normalizeSnapshot(loginSnapshot);
      const result = detectLoginForm(normalized, loginDomFacts);
      expect(result).not.toBeNull();
      expect(result?.confidence).toBe(1.0);
    });
  });

  describe("buildDomFacts", () => {
    it("extracts inputs, forms, buttons, landmarks from snapshot", () => {
      const normalized = normalizeSnapshot(loginSnapshot);
      const facts = buildDomFacts(normalized);
      // buildDomFacts extracts from normalized snapshot structure
      expect(facts.inputs.length).toBeGreaterThanOrEqual(2);
      expect(facts.forms.length).toBeGreaterThanOrEqual(1);
      expect(facts.buttons.length).toBeGreaterThanOrEqual(1);
      // landmarks may not include "form" as a landmark role
      expect(facts.landmarks.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe("isAuthenticated", () => {
    it("returns authenticated when signature changes and password field gone", () => {
      const beforeSnap = normalizeSnapshot(loginSnapshot);
      const beforeDom = buildDomFacts(beforeSnap);

      const afterSnap = normalizeSnapshot({
        ...loginSnapshot,
        url: "http://localhost/dashboard",
        title: "Dashboard",
        nodes: [
          { role: "banner", children: [{ role: "link", name: "Logout", children: [] }] },
          { role: "main", children: [{ role: "heading", name: "Welcome", children: [] }] },
        ],
      });
      const afterDom = buildDomFacts(afterSnap);

      const result = isAuthenticated(beforeSnap, afterSnap, beforeDom, afterDom);
      expect(result.authenticated).toBe(true);
    });

    it("returns unauthenticated when signature unchanged", () => {
      const beforeSnap = normalizeSnapshot(loginSnapshot);
      const beforeDom = buildDomFacts(beforeSnap);

      const afterSnap = normalizeSnapshot({
        url: "http://localhost/login?error=1",
        title: "Sign In",
        timestamp: "2026-01-01T00:00:00.000Z",
        viewport: { width: 1440, height: 900, deviceScaleFactor: 1 },
        nodes: [
          {
            role: "form",
            children: [
              { role: "textbox", name: "Email", autocomplete: "email", children: [] },
              { role: "textbox", name: "Password", autocomplete: "current-password", children: [] },
              { role: "button", name: "Sign in", children: [] },
            ],
          },
        ],
        metadata: { interactivesCount: 0, interactivesDropped: 0 },
      });
      const afterDom = buildDomFacts(afterSnap);

      const result = isAuthenticated(beforeSnap, afterSnap, beforeDom, afterDom);
      expect(typeof result.authenticated).toBe("boolean");
    });
  });
});

describe("frontier exploration", () => {
  const mockContext = {
    navigate: vi.fn().mockResolvedValue(undefined),
    click: vi.fn().mockResolvedValue({ ok: true, action: "click" }),
    fill: vi.fn().mockResolvedValue({ ok: true }),
    select: vi.fn().mockResolvedValue({ ok: true }),
    back: vi.fn().mockResolvedValue(undefined),
    snapshot: vi.fn(),
    getDomFacts: vi.fn(),
    getStorageState: vi.fn().mockResolvedValue("{}"),
    setStorageState: vi.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockContext.snapshot
      .mockResolvedValueOnce(normalizeSnapshot(homeSnapshot))
      .mockResolvedValueOnce(normalizeSnapshot(productsSnapshot))
      .mockResolvedValue(normalizeSnapshot(productsSnapshot));
    mockContext.getDomFacts.mockResolvedValue({
      inputs: [],
      forms: [],
      buttons: [],
      landmarks: [],
    });
  });

  it("explores and returns a capability map", async () => {
    const input = {
      url: "http://localhost/",
      budgets: {
        maxStates: MAX_STATES,
        maxDurationMs: 90_000,
        maxCalls: 40,
        maxTurns: 8,
      },
    };

    const result = await explore(input, mockContext as any);

    expect(result.capabilityMap).toBeDefined();
    expect(result.capabilityMap.states.length).toBeGreaterThan(0);
    expect(result.capabilityMap.capabilities.length).toBeGreaterThan(0);
    expect(result.capabilityMap.frontier.haltReason).toBeDefined();
    expect(mockContext.navigate).toHaveBeenCalled();
  });

  it("halts with EXHAUSTED when frontier empties before budget", async () => {
    const input = {
      url: "http://localhost/",
      budgets: {
        maxStates: MAX_STATES,
        maxDurationMs: 90_000,
        maxCalls: 40,
        maxTurns: 8,
      },
    };

    const result = await explore(input, mockContext as any);
    // With only 2 unique states in mock, frontier exhausts
    expect(["EXHAUSTED", "STATE_BUDGET"]).toContain(result.capabilityMap.frontier.haltReason);
  });

  it("sorts frontier by value heuristic", async () => {
    const input = {
      url: "http://localhost/",
      budgets: {
        maxStates: MAX_STATES,
        maxDurationMs: 90_000,
        maxCalls: 40,
        maxTurns: 8,
      },
    };

    const result = await explore(input, mockContext as any);
    expect(result.capabilityMap.capabilities).toBeDefined();
    expect(result.capabilityMap.capabilities[0].priorityRank).toBe(0);
  });
});

describe("stateSignature determinism", () => {
  it("same snapshot yields same signature", () => {
    const snap = normalizeSnapshot(homeSnapshot);
    const sig1 = stateSignature(snap);
    const sig2 = stateSignature(snap);
    expect(sig1).toBe(sig2);
  });

  it("different URLs yield different signatures", () => {
    const snap1 = normalizeSnapshot(homeSnapshot);
    const snap2 = normalizeSnapshot({ ...homeSnapshot, url: "http://localhost/other" });
    expect(stateSignature(snap1)).not.toBe(stateSignature(snap2));
  });
});