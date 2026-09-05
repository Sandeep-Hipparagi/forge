import type { LoginForm, DomFacts, AccessibilitySnapshot, AccessibilityNode } from "./types.js";
import { detectLoginForm, stateSignature } from "./perception.js";

export { detectLoginForm };

export function isAuthenticated(
  beforeSnap: AccessibilitySnapshot,
  afterSnap: AccessibilitySnapshot,
  beforeDom: DomFacts,
  afterDom: DomFacts
): { authenticated: boolean; reason: string } {
  const beforeSig = stateSignature(beforeSnap);
  const afterSig = stateSignature(afterSnap);

  if (beforeSig === afterSig) {
    return { authenticated: false, reason: "signature unchanged" };
  }

  const hasPasswordAfter = afterDom.inputs.some(i => i.type === "password");
  const hasLogoutAffordance = afterSnap.nodes.some(node =>
    node.name && /sign ?out|log ?out|my account|profile/i.test(node.name)
  );

  if (!hasPasswordAfter || hasLogoutAffordance) {
    return { authenticated: true, reason: "signature changed, password field gone or logout appeared" };
  }

  const hasAlert = afterSnap.nodes.some(node =>
    node.role === "alert" || node.role === "status"
  );
  if (hasAlert) {
    return { authenticated: false, reason: "signature changed, password field remains, alert/status appeared" };
  }

  return { authenticated: false, reason: "signature changed but unclear" };
}

export function buildDomFacts(snap: AccessibilitySnapshot): DomFacts {
  const inputs: DomFacts["inputs"] = [];
  const forms: DomFacts["forms"] = [];
  const buttons: DomFacts["buttons"] = [];
  const landmarks: DomFacts["landmarks"] = [];

  let formCounter = 0;

  function visit(node: AccessibilityNode, currentForm: string | null = null, currentLandmark: string | null = null) {
    if (node.role === "form" || node.role === "search") {
      formCounter++;
      currentForm = `form_${formCounter}`;
      forms.push({
        ref: currentForm,
        action: null,
        method: null,
        inputs: [],
        buttons: [],
      });
    }

    if (["main", "navigation", "banner", "contentinfo", "complementary", "search", "region"].includes(node.role)) {
      const landmarkRef = `landmark_${landmarks.length}`;
      landmarks.push({
        role: node.role,
        label: node.name ?? null,
        refs: [landmarkRef],
      });
      currentLandmark = landmarkRef;
    }

    if (["textbox", "searchbox", "spinbutton", "email", "tel", "password"].includes(node.role.toLowerCase()) || node.role === "combobox") {
      inputs.push({
        type: node.role.toLowerCase() === "password" ? "password" : "text",
        name: null,
        id: null,
        autocomplete: node.autocomplete ?? null,
        placeholder: node.placeholder ?? null,
        accessibleName: node.name ?? null,
        ref: node.ref ?? `input_${inputs.length}`,
      });
      if (currentForm) {
        const form = forms.find(f => f.ref === currentForm);
        if (form) form.inputs.push(inputs[inputs.length - 1].ref);
      }
    }

    if (node.role === "button" || node.role === "menuitem" || node.role === "link") {
      const btnRef = node.ref ?? `button_${buttons.length}`;
      buttons.push({
        ref: btnRef,
        accessibleName: node.name ?? null,
        role: node.role,
        landmark: currentLandmark ?? null,
      });
      if (currentForm) {
        const form = forms.find(f => f.ref === currentForm);
        if (form) form.buttons.push(btnRef);
      }
    }

    if (node.children) {
      for (const child of node.children) {
        visit(child, currentForm, currentLandmark);
      }
    }
  }

  for (const node of snap.nodes) {
    visit(node);
  }

  return { inputs, forms, buttons, landmarks };
}

function stateSignature(snap: AccessibilitySnapshot): string {
  const { createHash } = require("node:crypto");
  const skeleton = buildSkeletonForSig(snap);
  return createHash("sha256").update(skeleton).digest("hex").slice(0, 16);
}

function buildSkeletonForSig(snap: AccessibilitySnapshot): string {
  const routeTemplate = normalizeUrlToTemplate(snap.url);

  function processNode(node: AccessibilityNode): string {
    let parts = [node.role];
    if (node.name) {
      parts.push(maskDigits(node.name));
    }
    if (node.children && node.children.length > 0) {
      const childGroups = collapseRepeatedSiblings(node.children);
      for (const group of childGroups) {
        if (group.count > 1) {
          parts.push(`[repeat:${group.count}]${processNode(group.node)}`);
        } else {
          parts.push(processNode(group.node));
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

function collapseRepeatedSiblings(children: AccessibilityNode[]): Array<{ node: AccessibilityNode; count: number }> {
  if (children.length === 0) return [];
  const groups: Array<{ node: AccessibilityNode; count: number }> = [];
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
      if (!nodesHaveSameShape(a.children[i], b.children[i])) return false;
    }
  }
  return true;
}