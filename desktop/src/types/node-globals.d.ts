declare module "node:path";
declare module "node:url";
declare module "node:fs";
declare module "node:os";
declare module "node:util";
declare module "node:crypto";

// Define NodeJS.Timeout to fix type errors
declare namespace NodeJS {
  type Timeout = Record<string, never>;
  type ProcessEnv = Record<string, string | undefined>;
}
