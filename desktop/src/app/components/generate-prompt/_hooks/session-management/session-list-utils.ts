"use client";

import { type Session } from "@/types/session-types";

/**
 * Helper function to check if two session arrays are functionally equal
 * Compares sessions by their ID and name
 */
export function sessionsAreEqual(
  sessionsA: Session[],
  sessionsB: Session[]
): boolean {
  if (sessionsA.length !== sessionsB.length) return false;

  // Create maps for faster lookup
  const mapA = new Map(sessionsA.map((s) => [s.id, s]));
  const mapB = new Map(sessionsB.map((s) => [s.id, s]));

  // Check if all sessions in A exist in B with the same name
  for (const session of sessionsA) {
    const sessionB = mapB.get(session.id);
    if (!sessionB || sessionB.name !== session.name) {
      return false;
    }
  }

  // Check if all sessions in B exist in A
  for (const session of sessionsB) {
    if (!mapA.has(session.id)) {
      return false;
    }
  }

  return true;
}
