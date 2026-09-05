import { describe, expect, it } from "vitest";
import {
  normalizeSnapshot,
  stateSignature,
  extractAffordances,
  affordancesOf,
  isDestructive,
  detectLoginForm,
  MAX_INTERACTIVES,
} from "../src/index.js";

const baseSnapshot = {
  url: "http://localhost/products?page=1",
  title: "Products",
  timestamp: "2026-01-01T00:00:00.000Z",
  viewport: { width: 1440, height: 900, deviceScaleFactor: 1 },
  nodes: [
    {
      role: "banner",
      children: [
        { role: "link", name: "Home", children: [] },
        { role: "link", name: "Cart (2)", children: [] },
      ],
    },
    {
      role: "main",
      children: [
        { role: "heading", name: "Products", level: 1, children: [] },
        { role: "list", children: [
          { role: "listitem", children: [
            { role: "link", name: "Product A", children: [] },
            { role: "button", name: "Add to cart", children: [] },
          ]},
          { role: "listitem", children: [
            { role: "link", name: "Product B", children: [] },
            { role: "button", name: "Add to cart", children: [] },
          ]},
        ]},
      ],
    },
  ],
  metadata: { interactivesCount: 0, interactivesDropped: 0 },
};

describe("perception", () => {
  describe("normalizeSnapshot", () => {
    it("assigns refs to interactive elements in traversal order", () => {
      const normalized = normalizeSnapshot(baseSnapshot);
      const refs: string[] = [];

      function collect(node: typeof baseSnapshot.nodes[0]) {
        if (node.ref) refs.push(node.ref);
        if (node.children) node.children.forEach(collect);
      }

      normalized.nodes.forEach(collect);
      // baseSnapshot has 6 interactive elements: 2 links in banner + 2 links + 2 buttons in list
      expect(refs).toEqual(["e0", "e1", "e2", "e3", "e4", "e5"]);
    });

    it("counts interactives and tracks dropped", () => {
      const manyInteractives = {
        ...baseSnapshot,
        nodes: [
          {
            role: "main",
            children: Array.from({ length: 250 }, (_, i) => ({
              role: "button",
              name: `Button ${i}`,
              children: [],
            })),
          },
        ],
      };

      const normalized = normalizeSnapshot(manyInteractives);
      expect(normalized.metadata.interactivesCount).toBe(250);
      expect(normalized.metadata.interactivesDropped).toBe(50);
      expect(normalized.metadata.interactivesCount).toBe(MAX_INTERACTIVES + 50);
    });

    it("does not assign refs to non-interactive elements", () => {
      const snap = {
        ...baseSnapshot,
        nodes: [
          { role: "heading", name: "Title", children: [] },
          { role: "paragraph", name: "Some text", children: [] },
          { role: "button", name: "Click me", children: [] },
        ],
      };
      const normalized = normalizeSnapshot(snap);
      const heading = normalized.nodes.find(n => n.role === "heading");
      const button = normalized.nodes.find(n => n.role === "button");
      expect(heading?.ref).toBeUndefined();
      expect(button?.ref).toBeDefined();
    });
  });

  describe("stateSignature", () => {
    it("produces consistent 16-char hex signatures", () => {
      const sig1 = stateSignature(baseSnapshot);
      const sig2 = stateSignature(baseSnapshot);
      expect(sig1).toBe(sig2);
      expect(sig1).toMatch(/^[a-f0-9]{16}$/);
    });

    it("collapses repeated sibling structures", () => {
      const listPage = {
        ...baseSnapshot,
        nodes: [
          {
            role: "main",
            children: Array.from({ length: 50 }, (_, i) => ({
              role: "listitem",
              children: [
                { role: "link", name: `Product ${i}`, children: [] },
                { role: "button", name: "Add", children: [] },
              ],
            })),
          },
        ],
      };

      const sig1 = stateSignature(listPage);
      const sig2 = stateSignature({
        ...listPage,
        nodes: listPage.nodes.map((n, i) => ({
          ...n,
          children: n.children?.map((c, j) => ({
            ...c,
            name: c.name?.replace(`Product ${i}`, "Product #"),
          })),
        })),
      });

      expect(sig1).toBe(sig2);
    });

    it("masks digits in names", () => {
      const snap1 = { ...baseSnapshot, nodes: [{ role: "button", name: "Cart (2)", children: [] }] };
      const snap2 = { ...baseSnapshot, nodes: [{ role: "button", name: "Cart (5)", children: [] }] };
      expect(stateSignature(snap1)).toBe(stateSignature(snap2));
    });

    it("normalizes URLs to route templates", () => {
      const snap1 = { ...baseSnapshot, url: "http://localhost/orders/12345/items" };
      const snap2 = { ...baseSnapshot, url: "http://localhost/orders/67890/items" };
      expect(stateSignature(snap1)).toBe(stateSignature(snap2));
    });

    it("different routes produce different signatures", () => {
      const snap1 = { ...baseSnapshot, url: "http://localhost/products" };
      const snap2 = { ...baseSnapshot, url: "http://localhost/checkout" };
      expect(stateSignature(snap1)).not.toBe(stateSignature(snap2));
    });
  });

  describe("extractAffordances / affordancesOf", () => {
    it("extracts affordances with correct properties", () => {
      const snap = {
        ...baseSnapshot,
        nodes: [
          { role: "button", name: "Submit", children: [] },
          { role: "link", name: "Home", children: [] },
          { role: "textbox", name: "Search", children: [] },
          { role: "checkbox", name: "Accept terms", children: [] },
        ],
      };
      const normalized = normalizeSnapshot(snap);
      const affs = affordancesOf(normalized, "st_00000001");

      expect(affs.length).toBe(4);
      expect(affs[0].kind).toBe("button");
      expect(affs[1].kind).toBe("link");
      expect(affs[2].kind).toBe("textbox");
      expect(affs[3].kind).toBe("checkbox");
      expect(affs.every(a => a.stateId === "st_00000001")).toBe(true);
      expect(affs.every(a => a.id.startsWith("af_e"))).toBe(true);
    });

    it("marks destructive affordances", () => {
      const snap = {
        ...baseSnapshot,
        nodes: [
          { role: "button", name: "Delete item", children: [] },
          { role: "button", name: "Place order", children: [] },
          { role: "button", name: "Save", children: [] },
        ],
      };
      const normalized = normalizeSnapshot(snap);
      const affs = affordancesOf(normalized, "st_00000001");

      expect(affs[0].destructive).toBe(true);
      expect(affs[1].destructive).toBe(true);
      expect(affs[2].destructive).toBe(false);
    });

    it("includes bbox when available", () => {
      const snap = {
        ...baseSnapshot,
        nodes: [
          { role: "button", name: "Click", bbox: { x: 10, y: 20, width: 100, height: 30 }, children: [] },
        ],
      };
      const normalized = normalizeSnapshot(snap);
      const affs = affordancesOf(normalized, "st_00000001");
      expect(affs[0].bbox).toEqual({ x: 10, y: 20, w: 100, h: 30 });
    });
  });

  describe("isDestructive", () => {
    it("matches destructive verbs", () => {
      expect(isDestructive("Delete account")).toBe(true);
      expect(isDestructive("Remove item")).toBe(true);
      expect(isDestructive("Cancel order")).toBe(true);
      expect(isDestructive("Place order")).toBe(true);
      expect(isDestructive("Pay now")).toBe(true);
      expect(isDestructive("Transfer funds")).toBe(true);
    });

    it("does not match non-destructive actions", () => {
      expect(isDestructive("Save")).toBe(false);
      expect(isDestructive("Submit")).toBe(false);
      expect(isDestructive("Continue")).toBe(false);
      expect(isDestructive("Add to cart")).toBe(false);
      expect(isDestructive(null)).toBe(false);
      expect(isDestructive("")).toBe(false);
    });
  });

  describe("detectLoginForm", () => {
    const loginSnapshot = {
      ...baseSnapshot,
      url: "http://localhost/login",
      title: "Sign In",
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

    it("detects standard login form with high confidence", () => {
      const normalized = normalizeSnapshot(loginSnapshot);
      const result = detectLoginForm(normalized, loginDomFacts);
      expect(result).not.toBeNull();
      expect(result?.confidence).toBe(1.0);
      expect(result?.identityRef).toBe("e0");
      expect(result?.passwordRef).toBe("e1");
      expect(result?.submitRef).toBe("e2");
      expect(result?.scopeRef).toBe("form_0");
    });

    it("returns null when no password field", () => {
      const dom = { ...loginDomFacts, inputs: [{ type: "email", name: "email", id: "email", autocomplete: "email", placeholder: "Email", accessibleName: "Email", ref: "e0" }] };
      const normalized = normalizeSnapshot(loginSnapshot);
      expect(detectLoginForm(normalized, dom)).toBeNull();
    });

    it("returns null when multiple password fields (registration form)", () => {
      const dom = {
        ...loginDomFacts,
        inputs: [
          { type: "password", name: "password", id: "password", autocomplete: "new-password", placeholder: "Password", accessibleName: "Password", ref: "e1" },
          { type: "password", name: "confirm", id: "confirm", autocomplete: "new-password", placeholder: "Confirm", accessibleName: "Confirm", ref: "e2" },
        ],
      };
      const normalized = normalizeSnapshot(loginSnapshot);
      expect(detectLoginForm(normalized, dom)).toBeNull();
    });

    it("falls back to nearest preceding textbox for identity", () => {
      const dom = {
        ...loginDomFacts,
        inputs: [
          { type: "text", name: "username", id: "username", autocomplete: "username", placeholder: "Username", accessibleName: "Username", ref: "e0" },
          { type: "password", name: "password", id: "password", autocomplete: "current-password", placeholder: "Password", accessibleName: "Password", ref: "e1" },
        ],
      };
      const normalized = normalizeSnapshot(loginSnapshot);
      const result = detectLoginForm(normalized, dom);
      expect(result).not.toBeNull();
      expect(result?.identityRef).toBe("e0");
    });

    it("detects form-less login in same landmark", () => {
      const dom = {
        inputs: [
          { type: "email", name: "email", id: "email", autocomplete: "email", placeholder: "Email", accessibleName: "Email", ref: "e0" },
          { type: "password", name: "password", id: "password", autocomplete: "current-password", placeholder: "Password", accessibleName: "Password", ref: "e1" },
        ],
        forms: [],
        buttons: [
          { ref: "e2", accessibleName: "Sign in", role: "button", landmark: "main" },
        ],
        landmarks: [
          { role: "main", label: null, refs: ["e0", "e1", "e2"] },
        ],
      };
      const normalized = normalizeSnapshot(loginSnapshot);
      const result = detectLoginForm(normalized, dom);
      expect(result).not.toBeNull();
      expect(result?.confidence).toBe(0.8);
    });
  });
});