export interface Clock {
  now(): Date;
  monotonicMs(): number;
}

export interface Rng {
  next(): number;
}

export interface IdGen {
  next(prefix: string): string;
}

export type RunContext = {
  clock: Clock;
  rng: Rng;
  ids: IdGen;
};

export function systemRunContext(): RunContext {
  return {
    clock: {
      now: () => new Date(),
      monotonicMs: () => performance.now(),
    },
    rng: {
      next: () => Math.random(),
    },
    ids: {
      next: (prefix) =>
        `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 14)}`,
    },
  };
}
