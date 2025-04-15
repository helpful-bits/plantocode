import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge"; // Keep twMerge import
// Keep cn function
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs)); // Keep cn function
} 
