import type { Clock, IdGen, State } from "@forge/core";
import type { ExplorerDriverPorts, FrontierObservation } from "@forge/agent-explorer";
import type { SnapshotAffordance } from "@forge/perception";

function aff(
  partial: Partial<SnapshotAffordance> & Pick<SnapshotAffordance, "ref" | "accessibleName">,
): SnapshotAffordance {
  return {
    role: "link",
    kind: "link",
    enabled: true,
    bbox: null,
    destructive: false,
    observedNotExercised: false,
    notExercisedReason: null,
    href: null,
    ...partial,
  };
}

const ORIGIN = "https://aperture.test";

/**
 * Fixture site for EC-02 replay: browse → cart → checkout / login / account,
 * plus three /product/:sku pages that collapse to one signature.
 */
export function createEc02FixturePorts(
  clock: Clock & { advance?(ms: number): void },
  ids: IdGen,
): ExplorerDriverPorts {
  let url = `${ORIGIN}/`;

  const pages: Record<string, FrontierObservation> = {
    [`${ORIGIN}/`]: {
      url: `${ORIGIN}/`,
      title: "Browse",
      signature: "browse0000000000",
      snapshotEvidenceId: ids.next("ev"),
      affordances: [
        aff({ ref: "nav_cart", accessibleName: "Cart", href: `${ORIGIN}/cart` }),
        aff({ ref: "nav_login", accessibleName: "Sign in", href: `${ORIGIN}/login` }),
        aff({ ref: "nav_account", accessibleName: "Account", href: `${ORIGIN}/account/orders` }),
        aff({ ref: "nav_checkout", accessibleName: "Checkout", href: `${ORIGIN}/checkout` }),
        aff({ ref: "p1", accessibleName: "Lens Cap", href: `${ORIGIN}/product/APT-LC-01` }),
        aff({ ref: "p2", accessibleName: "Strap", href: `${ORIGIN}/product/APT-ST-02` }),
        aff({ ref: "p3", accessibleName: "Cloth", href: `${ORIGIN}/product/APT-CL-03` }),
        aff({
          ref: "place",
          accessibleName: "Place order",
          kind: "button",
          role: "button",
          destructive: true,
          observedNotExercised: true,
          notExercisedReason: "DENY_LIST",
        }),
      ],
    },
    [`${ORIGIN}/cart`]: {
      url: `${ORIGIN}/cart`,
      title: "Cart",
      signature: "cart000000000000",
      snapshotEvidenceId: ids.next("ev"),
      affordances: [
        aff({ ref: "nav_home", accessibleName: "Home", href: `${ORIGIN}/` }),
        aff({ ref: "nav_checkout", accessibleName: "Checkout", href: `${ORIGIN}/checkout` }),
        aff({ ref: "nav_login", accessibleName: "Sign in", href: `${ORIGIN}/login` }),
      ],
    },
    [`${ORIGIN}/checkout`]: {
      url: `${ORIGIN}/checkout`,
      title: "Checkout",
      signature: "checkout00000000",
      snapshotEvidenceId: ids.next("ev"),
      authRequired: true,
      affordances: [
        aff({ ref: "nav_home", accessibleName: "Home", href: `${ORIGIN}/` }),
        aff({ ref: "nav_cart", accessibleName: "Cart", href: `${ORIGIN}/cart` }),
        aff({
          ref: "coupon",
          accessibleName: "Apply coupon",
          kind: "button",
          role: "button",
        }),
        aff({
          ref: "place",
          accessibleName: "Place order",
          kind: "button",
          role: "button",
          destructive: true,
          observedNotExercised: true,
          notExercisedReason: "DENY_LIST",
        }),
      ],
    },
    [`${ORIGIN}/login`]: {
      url: `${ORIGIN}/login`,
      title: "Sign in",
      signature: "login00000000000",
      snapshotEvidenceId: ids.next("ev"),
      affordances: [
        aff({ ref: "nav_home", accessibleName: "Home", href: `${ORIGIN}/` }),
        aff({
          ref: "user",
          accessibleName: "Username",
          kind: "textbox",
          role: "textbox",
        }),
        aff({
          ref: "pass",
          accessibleName: "Password",
          kind: "textbox",
          role: "textbox",
        }),
        aff({
          ref: "submit",
          accessibleName: "Sign in",
          kind: "button",
          role: "button",
        }),
      ],
    },
    [`${ORIGIN}/account/orders`]: {
      url: `${ORIGIN}/account/orders`,
      title: "Your orders",
      signature: "orders0000000000",
      snapshotEvidenceId: ids.next("ev"),
      authRequired: true,
      affordances: [
        aff({ ref: "nav_home", accessibleName: "Home", href: `${ORIGIN}/` }),
        aff({ ref: "nav_cart", accessibleName: "Cart", href: `${ORIGIN}/cart` }),
      ],
    },
  };

  // Three product SKUs → same signature (FR-108 / EC-02 dedup).
  for (const sku of ["APT-LC-01", "APT-ST-02", "APT-CL-03"]) {
    pages[`${ORIGIN}/product/${sku}`] = {
      url: `${ORIGIN}/product/${sku}`,
      title: "Product",
      signature: "product000000000",
      snapshotEvidenceId: ids.next("ev"),
      affordances: [
        aff({ ref: "nav_home", accessibleName: "Home", href: `${ORIGIN}/` }),
        aff({ ref: "nav_cart", accessibleName: "Cart", href: `${ORIGIN}/cart` }),
        aff({ ref: "add", accessibleName: "Add to cart", kind: "button", role: "button" }),
      ],
    };
  }

  const hrefFor = (name: string | null): string | null => {
    if (name === "Cart") return `${ORIGIN}/cart`;
    if (name === "Sign in") return `${ORIGIN}/login`;
    if (name === "Account") return `${ORIGIN}/account/orders`;
    if (name === "Checkout") return `${ORIGIN}/checkout`;
    if (name === "Home") return `${ORIGIN}/`;
    if (name === "Lens Cap") return `${ORIGIN}/product/APT-LC-01`;
    if (name === "Strap") return `${ORIGIN}/product/APT-ST-02`;
    if (name === "Cloth") return `${ORIGIN}/product/APT-CL-03`;
    return null;
  };

  return {
    clock,
    ids,
    observe: async () => pages[url] ?? pages[`${ORIGIN}/`]!,
    restore: async (state: State) => {
      url = state.url;
      return { matched: true };
    },
    exercise: async (_item, affordance) => {
      const next = hrefFor(affordance.accessibleName);
      if (next === null) {
        return {
          ok: false as const,
          error: { code: "INTERNAL" as const, message: "no navigation target" },
          evidenceIds: [],
          durationMs: 0,
        };
      }
      url = next;
      clock.advance?.(5);
      return {
        ok: true as const,
        data: { action: "click" as const },
        evidenceIds: [],
        durationMs: 1,
      };
    },
    delay: async () => undefined,
  };
}
