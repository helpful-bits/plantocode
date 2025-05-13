/**
 * Database error handling utilities
 * Provides structured error types for database operations
 */

/**
 * Database error severity levels
 */
export enum DatabaseErrorSeverity {
  /**
   * Fatal errors that indicate a complete failure of the database system
   * These errors typically require user intervention to resolve
   */
  FATAL = 'fatal',
  
  /**
   * Critical errors that may prevent normal operation but could potentially be recovered from
   * These errors should be reported to the user
   */
  CRITICAL = 'critical',
  
  /**
   * Warning errors that indicate a problem but operations can continue
   * These errors may or may not be reported to the user depending on context
   */
  WARNING = 'warning',
  
  /**
   * Informational errors that are logged but don't impact functionality
   * These errors are not reported to the user
   */
  INFO = 'info'
}

/**
 * Database error categories for better error handling
 */
export enum DatabaseErrorCategory {
  /**
   * Connection errors (failed to establish or maintain a connection)
   */
  CONNECTION = 'connection',
  
  /**
   * Permission errors (insufficient file system access)
   */
  PERMISSION = 'permission',
  
  /**
   * Integrity errors (corruption, invalid schema, etc.)
   */
  INTEGRITY = 'integrity',
  
  /**
   * Constraint errors (foreign key, unique constraint, etc.)
   */
  CONSTRAINT = 'constraint',
  
  /**
   * Lock errors (database locked by another process)
   */
  LOCK = 'lock',
  
  /**
   * Timeout errors (operation took too long)
   */
  TIMEOUT = 'timeout',
  
  /**
   * Query errors (syntax errors, etc.)
   */
  QUERY = 'query',
  
  /**
   * Other/unknown errors
   */
  OTHER = 'other'
}

/**
 * Custom error class for database-related errors
 * Provides structured error information for better handling and reporting
 */
export class DatabaseError extends Error {
  /** The original error that caused this database error */
  public readonly originalError?: Error | unknown;
  
  /** The severity of the error */
  public readonly severity: DatabaseErrorSeverity;
  
  /** The category of the error */
  public readonly category: DatabaseErrorCategory;
  
  /** Additional context or metadata about the error */
  public readonly context: Record<string, any>;
  
  /** Whether this error should be reported to the user interface */
  public readonly reportToUser: boolean;
  
  /** Unique identifier for the error instance */
  public readonly errorId: string;
  
  /** Timestamp when the error occurred */
  public readonly timestamp: number;
  
  /**
   * Creates a new database error
   */
  constructor(
    message: string,
    {
      originalError,
      severity = DatabaseErrorSeverity.WARNING,
      category = DatabaseErrorCategory.OTHER,
      context = {},
      reportToUser = false,
      errorId = generateErrorId(),
    }: {
      originalError?: Error | unknown;
      severity?: DatabaseErrorSeverity;
      category?: DatabaseErrorCategory;
      context?: Record<string, any>;
      reportToUser?: boolean;
      errorId?: string;
    } = {}
  ) {
    super(message);
    this.name = 'DatabaseError';
    this.originalError = originalError;
    this.severity = severity;
    this.category = category;
    this.context = context;
    this.reportToUser = reportToUser;
    this.errorId = errorId;
    this.timestamp = Date.now();
    
    // Maintain proper stack trace for where our error was thrown
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, DatabaseError);
    }
  }
  
  /**
   * Returns a simplified object representation of this error
   * Suitable for logging or serialization
   */
  public toJSON(): Record<string, any> {
    return {
      name: this.name,
      message: this.message,
      severity: this.severity,
      category: this.category,
      errorId: this.errorId,
      timestamp: this.timestamp,
      reportToUser: this.reportToUser,
      context: this.context,
      originalError: this.originalError instanceof Error
        ? {
            name: this.originalError.name,
            message: this.originalError.message,
            stack: this.originalError.stack,
          }
        : this.originalError,
      stack: this.stack,
    };
  }
  
  /**
   * Get a JSON string representation of this error
   */
  public toString(): string {
    return `[${this.severity.toUpperCase()}] ${this.category}: ${this.message} (${this.errorId})`;
  }
  
  /**
   * Creates a DatabaseError from another error or error-like object
   */
  public static fromError(
    error: Error | string | unknown,
    options: {
      severity?: DatabaseErrorSeverity;
      category?: DatabaseErrorCategory;
      context?: Record<string, any>;
      reportToUser?: boolean;
    } = {}
  ): DatabaseError {
    // Handle string errors
    if (typeof error === 'string') {
      return new DatabaseError(error, options);
    }
    
    // Handle Error instances
    if (error instanceof Error) {
      const message = error.message;
      
      // Auto-detect error category based on error message
      let category = options.category || detectErrorCategory(message);
      
      // Auto-detect severity based on category if not provided
      let severity = options.severity || getSeverityForCategory(category);
      
      // Determine if this error should be reported to the user
      const reportToUser = options.reportToUser ?? (
        severity === DatabaseErrorSeverity.FATAL || 
        severity === DatabaseErrorSeverity.CRITICAL
      );
      
      return new DatabaseError(message, {
        originalError: error,
        severity,
        category,
        context: options.context || {},
        reportToUser,
      });
    }
    
    // Handle unknown error types
    return new DatabaseError(
      `Unknown database error: ${String(error)}`,
      {
        originalError: error,
        severity: options.severity || DatabaseErrorSeverity.WARNING,
        category: options.category || DatabaseErrorCategory.OTHER,
        context: options.context || {},
        reportToUser: options.reportToUser ?? false,
      }
    );
  }
}

/**
 * Generates a unique error ID for tracking purposes
 */
function generateErrorId(): string {
  return Math.random().toString(36).substring(2, 10);
}

/**
 * Detects the error category based on error message patterns
 */
function detectErrorCategory(message: string): DatabaseErrorCategory {
  const lowerMessage = message.toLowerCase();
  
  // Connection errors
  if (
    lowerMessage.includes('cannot open database') ||
    lowerMessage.includes('unable to open database file') ||
    lowerMessage.includes('no such file or directory')
  ) {
    return DatabaseErrorCategory.CONNECTION;
  }
  
  // Permission errors
  if (
    lowerMessage.includes('permission denied') ||
    lowerMessage.includes('readonly database') ||
    lowerMessage.includes('sqlite_readonly') ||
    lowerMessage.includes('access denied')
  ) {
    return DatabaseErrorCategory.PERMISSION;
  }
  
  // Integrity errors
  if (
    lowerMessage.includes('sqlite_corrupt') ||
    lowerMessage.includes('database disk image is malformed') ||
    lowerMessage.includes('database or disk is full') ||
    lowerMessage.includes('not a database') ||
    lowerMessage.includes('integrity check') ||
    lowerMessage.includes('sqlite_notadb')
  ) {
    return DatabaseErrorCategory.INTEGRITY;
  }
  
  // Constraint errors
  if (
    lowerMessage.includes('constraint failed') ||
    lowerMessage.includes('sqlite_constraint') ||
    lowerMessage.includes('foreign key constraint') ||
    lowerMessage.includes('unique constraint') ||
    lowerMessage.includes('not null constraint')
  ) {
    return DatabaseErrorCategory.CONSTRAINT;
  }
  
  // Lock errors
  if (
    lowerMessage.includes('database is locked') ||
    lowerMessage.includes('sqlite_busy') ||
    lowerMessage.includes('database table is locked') ||
    lowerMessage.includes('waiting for a lock')
  ) {
    return DatabaseErrorCategory.LOCK;
  }
  
  // Timeout errors
  if (
    lowerMessage.includes('timeout') ||
    lowerMessage.includes('timed out') ||
    lowerMessage.includes('connection timed out')
  ) {
    return DatabaseErrorCategory.TIMEOUT;
  }
  
  // Query errors
  if (
    lowerMessage.includes('syntax error') ||
    lowerMessage.includes('no such table') ||
    lowerMessage.includes('no such column')
  ) {
    return DatabaseErrorCategory.QUERY;
  }
  
  // Default to OTHER for unrecognized error messages
  return DatabaseErrorCategory.OTHER;
}

/**
 * Determines the severity level based on the error category
 */
function getSeverityForCategory(category: DatabaseErrorCategory): DatabaseErrorSeverity {
  switch (category) {
    case DatabaseErrorCategory.INTEGRITY:
    case DatabaseErrorCategory.CONNECTION:
      // Database corruption and connection issues are typically critical
      return DatabaseErrorSeverity.CRITICAL;
      
    case DatabaseErrorCategory.PERMISSION:
      // Permission issues may prevent database operations but could be fixed
      return DatabaseErrorSeverity.CRITICAL;
      
    case DatabaseErrorCategory.LOCK:
    case DatabaseErrorCategory.TIMEOUT:
      // Lock and timeout issues often resolve themselves with retries
      return DatabaseErrorSeverity.WARNING;
      
    case DatabaseErrorCategory.CONSTRAINT:
    case DatabaseErrorCategory.QUERY:
      // Constraint and query errors are typically application bugs
      return DatabaseErrorSeverity.WARNING;
      
    default:
      return DatabaseErrorSeverity.WARNING;
  }
}

/**
 * Helper function to dispatch database errors to the UI in browser environments
 */
export function dispatchDatabaseErrorEvent(error: DatabaseError): void {
  if (typeof window !== 'undefined' && error.reportToUser) {
    try {
      const detail = {
        type: 'database_error',
        error: error.toJSON(),
        message: error.message,
        severity: error.severity,
        category: error.category,
        errorId: error.errorId,
        timestamp: error.timestamp
      };
      
      window.dispatchEvent(new CustomEvent('database_error', { detail }));
    } catch (dispatchError) {
      console.error('Failed to dispatch database error event:', dispatchError);
    }
  }
}

/**
 * Standardized error messages for common database errors
 */
export const DatabaseErrorMessages = {
  CONNECTION_FAILED: 'Failed to establish database connection',
  READONLY_DATABASE: 'Database is in read-only mode',
  DATABASE_LOCKED: 'Database is locked by another process',
  INTEGRITY_CHECK_FAILED: 'Database integrity check failed',
  PERMISSION_DENIED: 'Permission denied for database operation',
  CONSTRAINT_VIOLATION: 'Database constraint violation',
  QUERY_ERROR: 'Error in database query',
  TRANSACTION_FAILED: 'Database transaction failed',
  OPERATION_TIMEOUT: 'Database operation timed out'
};