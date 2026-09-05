import { z } from "zod";

export const Id = z.string().regex(/^[a-z]{2,4}_[0-9a-z]{8,}$/);
export const Iso = z.string().datetime();
export const Sha256 = z.string().regex(/^[a-f0-9]{64}$/);
export const Confidence = z.number().min(0).max(1);
export const Severity = z.enum(["INFO", "MINOR", "MAJOR", "BLOCKER"]);
export const Priority = z.enum(["P0", "P1", "P2", "P3"]);

export const BBox = z.object({
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
});

export const Viewport = z.object({
  width: z.number().int().positive().default(1440),
  height: z.number().int().positive().default(900),
  deviceScaleFactor: z.number().positive().default(1),
});

export type Id = z.infer<typeof Id>;
export type Iso = z.infer<typeof Iso>;
export type Confidence = z.infer<typeof Confidence>;
