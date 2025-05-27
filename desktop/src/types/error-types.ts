/**
 * Database error type definitions
 */

export enum DatabaseErrorCategory {
  CONNECTION = "CONNECTION",
  QUERY = "QUERY",
  UPDATE = "UPDATE",
  DELETE = "DELETE",
  INSERT = "INSERT",
  TRANSACTION = "TRANSACTION",
  MIGRATION = "MIGRATION",
  DATA_CONSTRAINT = "DATA_CONSTRAINT",
  CONSTRAINT_VIOLATION = "CONSTRAINT_VIOLATION",
  NOT_FOUND = "NOT_FOUND",
  TIMEOUT = "TIMEOUT",
  OTHER = "OTHER",
}

export enum DatabaseErrorSeverity {
  INFO = "INFO",
  WARNING = "WARNING",
  ERROR = "ERROR",
  CRITICAL = "CRITICAL",
}

export interface DatabaseErrorOptions {
  originalError?: Error;
  category?: DatabaseErrorCategory;
  severity?: DatabaseErrorSeverity;
  context?: Record<string, unknown>;
  reportToUser?: boolean;
}

export class DatabaseError extends Error {
  public category: DatabaseErrorCategory;
  public severity: DatabaseErrorSeverity;
  public context?: Record<string, unknown>;
  public originalError?: Error;
  public reportToUser: boolean;

  constructor(message: string, options: DatabaseErrorOptions = {}) {
    super(message);
    this.name = "DatabaseError";
    this.category = options.category || DatabaseErrorCategory.OTHER;
    this.severity = options.severity || DatabaseErrorSeverity.ERROR;
    this.context = options.context;
    this.originalError = options.originalError;
    this.reportToUser = options.reportToUser || false;
    Object.setPrototypeOf(this, DatabaseError.prototype);
  }
}
