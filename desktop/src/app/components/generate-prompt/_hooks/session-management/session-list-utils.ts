"use client";

import { type Session } from "@/types/session-types";

/**
 * Helper function to check if two session arrays are functionally equal
 * Compares sessions by their ID, name, and updatedAt timestamp
 */
export function sessionsAreEqual(
  sessionsA: Session[],
  sessionsB: Session[]
): boolean {
  if (sessionsA.length !== sessionsB.length) return false;

  // Create map for faster lookup
  const mapB = new Map(sessionsB.map((s) => [s.id, s]));

  // Check if all sessions in A exist in B with matching properties
  for (const sessionA of sessionsA) {
    const sessionB = mapB.get(sessionA.id);
    if (!sessionB || sessionA.name !== sessionB.name || sessionA.updatedAt !== sessionB.updatedAt) {
      return false;
    }
  }

  return true;
}
