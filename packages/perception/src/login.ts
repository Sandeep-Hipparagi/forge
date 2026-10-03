import type {
  DomFacts,
  AccessibilitySnapshot,
  AccessibilityNode,
} from "./types.js";
import { detectLoginForm, stateSignature } from "./perception.js";

export { detectLoginForm };

export function isAuthenticated(
  beforeSnap: AccessibilitySnapshot,
  afterSnap: AccessibilitySnapshot,
  _beforeDom: DomFacts,
  afterDom: DomFacts,
): { authenticated: boolean; reason: string } {
  const beforeSig = stateSignature(beforeSnap);
  const afterSig = stateSignature(afterSnap);

  if (beforeSig === afterSig) {
    return { authenticated: false, reason: "signature unchanged" };
  }

  const hasPasswordAfter = afterDom.inputs.some((i) => i.type === "password");
  const hasLogoutAffordance = afterSnap.nodes.some(
    (node) =>
      node.name && /sign ?out|log ?out|my account|profile/i.test(node.name),
  );

  if (!hasPasswordAfter || hasLogoutAffordance) {
    return {
      authenticated: true,
      reason: "signature changed, password field gone or logout appeared",
    };
  }

  const hasAlert = afterSnap.nodes.some(
    (node) => node.role === "alert" || node.role === "status",
  );
  if (hasAlert) {
    return {
      authenticated: false,
      reason:
        "signature changed, password field remains, alert/status appeared",
    };
  }

  return { authenticated: false, reason: "signature changed but unclear" };
}

export function buildDomFacts(snap: AccessibilitySnapshot): DomFacts {
  const inputs: DomFacts["inputs"] = [];
  const forms: DomFacts["forms"] = [];
  const buttons: DomFacts["buttons"] = [];
  const landmarks: DomFacts["landmarks"] = [];

  let formCounter = 0;

  function visit(
    node: AccessibilityNode,
    currentForm: string | null = null,
    currentLandmark: string | null = null,
  ) {
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

    if (
      [
        "main",
        "navigation",
        "banner",
        "contentinfo",
        "complementary",
        "search",
        "region",
      ].includes(node.role)
    ) {
      const landmarkRef = `landmark_${landmarks.length}`;
      landmarks.push({
        role: node.role,
        label: node.name ?? null,
        refs: [landmarkRef],
      });
      currentLandmark = landmarkRef;
    }

    if (
      [
        "textbox",
        "searchbox",
        "spinbutton",
        "email",
        "tel",
        "password",
      ].includes(node.role.toLowerCase()) ||
      node.role === "combobox"
    ) {
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
        const form = forms.find((f) => f.ref === currentForm);
        const input = inputs[inputs.length - 1];
        if (form && input) form.inputs.push(input.ref);
      }
    }

    if (
      node.role === "button" ||
      node.role === "menuitem" ||
      node.role === "link"
    ) {
      const btnRef = node.ref ?? `button_${buttons.length}`;
      buttons.push({
        ref: btnRef,
        accessibleName: node.name ?? null,
        role: node.role,
        landmark: currentLandmark ?? null,
      });
      if (currentForm) {
        const form = forms.find((f) => f.ref === currentForm);
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
