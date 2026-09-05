export interface Clock {
  now(): Date;
}

export const systemClock: Clock = {
  now: () => new Date(),
};

export interface Rng {
  next(): number;
}

export interface IdGen {
  next(prefix: string): string;
}

export interface RunContext {
  clock: Clock;
  rng: Rng;
  ids: IdGen;
}

export const fixedClock = (iso: string): Clock => ({
  now: () => new Date(iso),
});

export const createSeededRng = (seed: number): Rng => {
  let state = seed >>> 0;
  return {
    next: () => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 2 ** 32;
    },
  };
};
