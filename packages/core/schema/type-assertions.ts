import type { Session } from "./session.js";

type Assert<T extends true> = T;
type HasPassword = "password" extends keyof Session["input"] ? true : false;

/** Compile-time proof that a stored Session can never carry the API password field. */
export type SessionInputOmitsPassword = Assert<HasPassword extends false ? true : false>;
