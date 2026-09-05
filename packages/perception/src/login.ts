import type { AccessibilityNode, AccessibilitySnapshot, DomFacts } from "./types.js";

export type LoginForm = {
  identityRef: string;
  passwordRef: string;
  submitRef: string;
  scopeRef: string | null;
  confidence: number;
};

const IDENTITY_PATTERN = /\b(user(name)?|e-?mail|login|phone|mobile|account|employee|member)\b/i;

const SUBMIT_PATTERN = /\b(sign ?in|log ?in|continue|submit|enter)\b/i;

function* walk(node: AccessibilityNode): Iterable<AccessibilityNode> {
  yield node;
  if (node.children) {
    for (const child of node.children) yield* walk(child);
  }
}

function isPasswordInput(ref: string, dom: DomFacts): boolean {
  const facts = dom.inputs[ref];
  return (facts?.type ?? "").toLowerCase() === "password";
}

function isTextInput(ref: string, dom: DomFacts): boolean {
  const facts = dom.inputs[ref];
  const type = (facts?.type ?? "text").toLowerCase();
  return type === "text" || type === "email" || type === "tel" || type === "search";
}

function identityHints(ref: string, node: AccessibilityNode, dom: DomFacts): string {
  const facts = dom.inputs[ref];
  const parts = [
    node.name ?? "",
    facts?.autocomplete ?? "",
    facts?.name ?? "",
    facts?.id ?? "",
    facts?.placeholder ?? "",
  ];
  return parts.join(" ").toLowerCase();
}

function findFormAncestors(snapshot: AccessibilitySnapshot): Map<string, string | null> {
  const scope = new Map<string, string | null>();

  function visit(node: AccessibilityNode, currentFormRef: string | null): void {
    const nextFormRef = node.role === "form" && node.ref ? node.ref : currentFormRef;
    if (node.ref) {
      scope.set(node.ref, nextFormRef);
    }
    if (node.children) {
      for (const child of node.children) visit(child, nextFormRef);
    }
  }

  visit(snapshot.root, null);
  return scope;
}

/**
 * Deterministically detect a login form from a snapshot plus DOM facts.
 * Implements the rules from 09 §2.1.
 */
export function detectLoginForm(snapshot: AccessibilitySnapshot, dom: DomFacts): LoginForm | null {
  const scopeByRef = findFormAncestors(snapshot);

  const passwordRefs: string[] = [];
  const textRefsInOrder: string[] = [];

  for (const node of walk(snapshot.root)) {
    if (!node.ref) continue;
    if (isPasswordInput(node.ref, dom)) {
      passwordRefs.push(node.ref);
    } else if (isTextInput(node.ref, dom)) {
      textRefsInOrder.push(node.ref);
    }
  }

  if (passwordRefs.length !== 1) return null;
  const passwordRef = passwordRefs[0]!;

  // Identity field: nearest preceding textbox, preferring explicit identity hints.
  let identityRef: string | null = null;
  let fallbackRef: string | null = null;
  for (const ref of textRefsInOrder) {
    if (ref === passwordRef) break;
    const node = [...walk(snapshot.root)].find((n) => n.ref === ref);
    if (!node) continue;
    const hints = identityHints(ref, node, dom);
    if (IDENTITY_PATTERN.test(hints)) {
      identityRef = ref;
    }
    fallbackRef = ref;
  }
  if (!identityRef) identityRef = fallbackRef;
  if (!identityRef) return null;

  // Submit control – try within the same form first.
  const targetScope = scopeByRef.get(passwordRef) ?? scopeByRef.get(identityRef) ?? null;
  let submitRef: string | null = null;

  for (const node of walk(snapshot.root)) {
    if (!node.ref) continue;
    if (node.role !== "button") continue;
    const sameScope = scopeByRef.get(node.ref) === targetScope;
    if (sameScope && !node.disabled && SUBMIT_PATTERN.test((node.name ?? "").toLowerCase())) {
      submitRef = node.ref;
      break;
    }
  }

  if (!submitRef) {
    // Fallback: any enabled button whose name looks like a submit.
    for (const node of walk(snapshot.root)) {
      if (!node.ref || node.role !== "button" || node.disabled) continue;
      if (SUBMIT_PATTERN.test((node.name ?? "").toLowerCase())) {
        submitRef = node.ref;
        break;
      }
    }
  }

  if (!submitRef) return null;

  let confidence = 0;
  if (targetScope) {
    confidence = 1.0;
  } else if (scopeByRef.get(identityRef) === scopeByRef.get(passwordRef)) {
    confidence = 0.8;
  } else {
    confidence = 0.6;
  }

  return {
    identityRef,
    passwordRef,
    submitRef,
    scopeRef: targetScope,
    confidence,
  };
}
