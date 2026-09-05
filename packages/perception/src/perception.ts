import { createHash } from "node:crypto";
import type {
  AccessibilityNode,
  AccessibilitySnapshot,
  DomFacts,
  LoginForm,
  Affordance,
  State,
} from "./types.js";

export const MAX_INTERACTIVES = 200;
export const SIGNATURE_LENGTH = 16;

export function normalizeSnapshot(raw: AccessibilitySnapshot): AccessibilitySnapshot {
  let interactivesCount = 0;
  let interactivesDropped = 0;
  let refCounter = 0;

  function assignRefs(node: AccessibilityNode): AccessibilityNode {
    const isInteractive = isInteractiveRole(node.role);
    if (isInteractive) {
      interactivesCount++;
    }

    const newNode: AccessibilityNode = { ...node };
    if (isInteractive) {
      if (interactivesCount <= MAX_INTERACTIVES) {
        newNode.ref = `e${refCounter++}`;
      } else {
        interactivesDropped++;
      }
    }

    if (node.children && node.children.length > 0) {
      newNode.children = node.children.map(assignRefs);
    }
    return newNode;
  }

  const normalizedNodes = raw.nodes.map(assignRefs);

  return {
    ...raw,
    nodes: normalizedNodes,
    metadata: {
      interactivesCount,
      interactivesDropped,
    },
  };
}

function isInteractiveRole(role: string): boolean {
  const interactiveRoles = new Set([
    "button",
    "link",
    "textbox",
    "checkbox",
    "radio",
    "combobox",
    "listbox",
    "menuitem",
    "tab",
    "treeitem",
    "option",
    "slider",
    "spinbutton",
    "searchbox",
    "spinbutton",
    "grid",
    "treegrid",
  ]);
  return interactiveRoles.has(role.toLowerCase());
}

export function stateSignature(snap: AccessibilitySnapshot): string {
  const skeleton = buildSkeleton(snap);
  const hash = createHash("sha256").update(skeleton).digest("hex");
  return hash.slice(0, SIGNATURE_LENGTH);
}

function buildSkeleton(snap: AccessibilitySnapshot): string {
  const routeTemplate = normalizeUrlToTemplate(snap.url);

  function processNode(node: AccessibilityNode, depth = 0): string {
    let parts = [`${node.role}`];

    if (node.name) {
      const maskedName = maskDigits(node.name);
      parts.push(maskedName);
    }

    if (node.children && node.children.length > 0) {
      const childGroups = collapseRepeatedSiblings(node.children);
      for (const group of childGroups) {
        if (group.count > 1) {
          parts.push(`[repeat:${group.count}]${processNode(group.node, depth + 1)}`);
        } else {
          parts.push(processNode(group.node, depth + 1));
        }
      }
    }

    return parts.join(" ");
  }

  const tree = snap.nodes.map(n => processNode(n)).join(" | ");
  return `${routeTemplate} :: ${tree}`;
}

function normalizeUrlToTemplate(url: string): string {
  try {
    const u = new URL(url);
    const segments = u.pathname.split("/").filter(Boolean);
    const normalized = segments.map(seg => {
      if (/^\d+$/.test(seg) || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(seg)) {
        return ":id";
      }
      return seg;
    }).join("/");
    const query = [...u.searchParams.entries()].map(([k]) => `${k}=:v`).sort().join("&");
    return `${u.origin}/${normalized}${query ? `?${query}` : ""}`;
  } catch {
    return url;
  }
}

function maskDigits(name: string): string {
  return name.replace(/\d/g, "#");
}

interface SiblingGroup {
  node: AccessibilityNode;
  count: number;
}

function collapseRepeatedSiblings(children: AccessibilityNode[]): SiblingGroup[] {
  if (children.length === 0) return [];

  const groups: SiblingGroup[] = [];
  let current = children[0];
  let count = 1;

  for (let i = 1; i < children.length; i++) {
    if (nodesHaveSameShape(current, children[i])) {
      count++;
    } else {
      groups.push({ node: current, count });
      current = children[i];
      count = 1;
    }
  }
  groups.push({ node: current, count });
  return groups;
}

function nodesHaveSameShape(a: AccessibilityNode, b: AccessibilityNode): boolean {
  if (a.role !== b.role) return false;
  const aName = a.name ? maskDigits(a.name) : null;
  const bName = b.name ? maskDigits(b.name) : null;
  if (aName !== bName) return false;

  const aChildren = a.children?.length ?? 0;
  const bChildren = b.children?.length ?? 0;
  if (aChildren !== bChildren) return false;

  if (aChildren > 0 && a.children && b.children) {
    for (let i = 0; i < aChildren; i++) {
      const aChild = a.children[i];
      const bChild = b.children[i];
      if (aChild && bChild && !nodesHaveSameShape(aChild, bChild)) return false;
    }
  }
  return true;
}

export function extractAffordances(snap: AccessibilitySnapshot, stateId: string): Affordance[] {
  const affordances: Affordance[] = [];

  function visit(node: AccessibilityNode, parentBBox?: AccessibilityNode["bbox"]) {
    if (isInteractiveRole(node.role) && node.ref) {
      const kind = mapRoleToKind(node.role);
      const accessibleName = node.name ?? null;
      const destructive = isDestructive(accessibleName);
      const bbox = node.bbox ?? parentBBox ?? null;

      affordances.push({
        id: `af_${node.ref}`,
        stateId,
        ref: node.ref,
        role: node.role,
        accessibleName,
        kind,
        enabled: node.enabled !== false,
        destructive,
        observedNotExercised: false,
        notExercisedReason: null,
        bbox: bbox ? { x: bbox.x, y: bbox.y, w: bbox.width, h: bbox.height } : null,
      });
    }

    if (node.children) {
      for (const child of node.children) {
        visit(child, node.bbox ?? parentBBox);
      }
    }
  }

  for (const node of snap.nodes) {
    visit(node);
  }

  return affordances;
}

function mapRoleToKind(role: string): Affordance["kind"] {
  const roleLower = role.toLowerCase();
  if (["button", "menuitem"].includes(roleLower)) return "button";
  if (roleLower === "link") return "link";
  if (["textbox", "searchbox", "spinbutton"].includes(roleLower)) return "textbox";
  if (roleLower === "checkbox") return "checkbox";
  if (roleLower === "radio") return "radio";
  if (["combobox", "listbox"].includes(roleLower)) return "select";
  if (roleLower === "tab") return "tab";
  if (roleLower === "menuitem") return "menuitem";
  if (roleLower === "form") return "form";
  if (roleLower === "upload") return "upload";
  return "other";
}

export const DESTRUCTIVE_PATTERN = /\b(delete|remove|cancel|void|refund|discard|revoke|terminate|destroy|clear|reset|deactivate|unsubscribe|pay|transfer|submit order|place order|close account)\b/i;

export function isDestructive(accessibleName: string | null): boolean {
  if (!accessibleName) return false;
  return DESTRUCTIVE_PATTERN.test(accessibleName);
}

export function detectLoginForm(snap: AccessibilitySnapshot, dom: DomFacts): LoginForm | null {
  const passwordInputs = dom.inputs.filter(i => i.type === "password");
  if (passwordInputs.length !== 1) return null;

  const passwordRef = passwordInputs[0].ref;
  let identityRef: string | null = null;
  let submitRef: string | null = null;
  let scopeRef: string | null = null;

  const passwordInput = passwordInputs[0];

  const identityPatterns = /user|e-?mail|login|phone|mobile|account|employee|member/i;

  let identityCandidate: typeof dom.inputs[0] | null = null;

  for (const input of dom.inputs) {
    if (input.ref === passwordRef) continue;
    if (input.type !== "text" && input.type !== "email" && input.type !== "tel") continue;

    const haystack = [
      input.autocomplete,
      input.name,
      input.id,
      input.accessibleName,
      input.placeholder,
    ].filter(Boolean).join(" ");

    if (identityPatterns.test(haystack)) {
      identityCandidate = input;
      break;
    }
  }

  if (!identityCandidate) {
    const preceding = dom.inputs.filter(i =>
      i.ref !== passwordRef && ["text", "email", "tel"].includes(i.type)
    );
    if (preceding.length > 0) {
      identityCandidate = preceding[preceding.length - 1];
    }
  }

  if (!identityCandidate) return null;
  identityRef = identityCandidate.ref;

  const passwordForm = dom.forms.find(f => f.inputs.includes(passwordRef));
  if (passwordForm) {
    scopeRef = passwordForm.ref;
    const formButtons = dom.buttons.filter(b => passwordForm.buttons.includes(b.ref));
    if (formButtons.length === 1) {
      submitRef = formButtons[0].ref;
    } else if (formButtons.length > 1) {
      const submitBtn = formButtons.find(b => /sign ?in|log ?in|continue|submit|enter/i.test(b.accessibleName ?? ""));
      if (submitBtn) submitRef = submitBtn.ref;
    }
  }

  if (!submitRef) {
    const passwordLandmark = dom.landmarks.find(l => l.refs.includes(passwordRef));
    if (passwordLandmark) {
      scopeRef = passwordLandmark.role;
      const landmarkButtons = dom.buttons.filter(b => passwordLandmark.refs.includes(b.ref));
      if (landmarkButtons.length === 1) {
        submitRef = landmarkButtons[0].ref;
      } else if (landmarkButtons.length > 1) {
        const submitBtn = landmarkButtons.find(b => /sign ?in|log ?in|continue|submit|enter/i.test(b.accessibleName ?? ""));
        if (submitBtn) submitRef = submitBtn.ref;
        else {
          const enabledBtn = landmarkButtons.find(b => b.accessibleName);
          if (enabledBtn) submitRef = enabledBtn.ref;
        }
      }
    }
  }

  if (!submitRef) {
    const allButtons = dom.buttons.filter(b => b.accessibleName && /sign ?in|log ?in|continue|submit|enter/i.test(b.accessibleName));
    if (allButtons.length === 1) submitRef = allButtons[0].ref;
  }

  if (!submitRef) return null;

  let confidence = 0.6;
  if (scopeRef && dom.forms.some(f => f.ref === scopeRef)) confidence = 1.0;
  else if (scopeRef) confidence = 0.8;

  return { identityRef, passwordRef, submitRef, scopeRef, confidence };
}

export function affordancesOf(snap: AccessibilitySnapshot, stateId: string): Affordance[] {
  return extractAffordances(snap, stateId);
}

export function getSnapshotSize(snap: AccessibilitySnapshot): number {
  return JSON.stringify(snap).length;
}