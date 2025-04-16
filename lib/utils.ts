import { type ClassValue, clsx } from "clsx"; // Keep clsx import
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
