declare module "node:path";
declare module "node:url";
declare module "node:fs";
declare module "node:os";
declare module "node:util";

// Define number to fix type errors
declare namespace NodeJS {
  type Timeout = Record<string, never>;
}

// Define process global
declare const process: {
  env: {
    NODE_ENV?: string;
    [key: string]: string | undefined;
  };
};
