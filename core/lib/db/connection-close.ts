import connectionPool from "./connection-pool";

/**
 * Close all open database connections
 */
export function closeDatabase() {
  try {
    connectionPool.closeAll();
    console.log("[DB] Closed all database connections");
  } catch (error) {
    console.error("[DB] Error closing database connections:", error);
  }
} 