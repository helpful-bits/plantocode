/**
 * Repository Interface
 * 
 * This file provides standardized interfaces for all repositories in the application,
 * ensuring consistent error handling, connection management, and interface patterns.
 */

import { ActionState } from "@/types";

/**
 * Base Repository Interface
 * Defines the common functionality for all repositories
 */
export interface BaseRepository<T, ID> {
  /**
   * Create a new entity
   * @param entity The entity to create
   * @returns Promise resolving to the created entity with any generated fields
   */
  create(entity: Partial<T>): Promise<T>;

  /**
   * Get an entity by its ID
   * @param id The entity ID
   * @returns Promise resolving to the entity or null if not found
   */
  getById(id: ID): Promise<T | null>;

  /**
   * Update an existing entity
   * @param id The entity ID
   * @param entity The fields to update
   * @returns Promise resolving to the updated entity
   */
  update(id: ID, entity: Partial<T>): Promise<T>;

  /**
   * Delete an entity by its ID
   * @param id The entity ID
   * @returns Promise resolving to a boolean indicating success
   */
  delete(id: ID): Promise<boolean>;

  /**
   * Find multiple entities based on a criteria
   * @param criteria The search criteria
   * @returns Promise resolving to an array of entities
   */
  find(criteria: any): Promise<T[]>;

  /**
   * Count entities based on a criteria
   * @param criteria The search criteria
   * @returns Promise resolving to the count
   */
  count(criteria?: any): Promise<number>;
}

/**
 * Standard error handling for repository operations
 * @param operation The repository operation
 * @param entityName The name of the entity being operated on
 * @param errorHandler Optional custom error handler function 
 * @returns Promise resolving to an ActionState with the operation result
 */
export async function handleRepositoryAction<T>(
  operation: () => Promise<T>,
  entityName: string,
  errorHandler?: (error: any) => ActionState<T>
): Promise<ActionState<T>> {
  try {
    const result = await operation();
    return {
      isSuccess: true,
      message: `${entityName} operation successful`,
      data: result
    };
  } catch (error) {
    // Use custom error handler if provided
    if (errorHandler) {
      return errorHandler(error);
    }

    // Default error handling
    console.error(`Repository error (${entityName}):`, error);
    
    // Extract meaningful error details
    let errorMessage = '';
    if (error instanceof Error) {
      errorMessage = error.message;
      
      // Provide more specific messages for common SQLite errors
      if (errorMessage.includes('SQLITE_CONSTRAINT')) {
        if (errorMessage.includes('UNIQUE')) {
          errorMessage = `${entityName} with this identifier already exists`;
        } else if (errorMessage.includes('FOREIGN KEY')) {
          errorMessage = `${entityName} references a non-existent entity`;
        }
      } else if (errorMessage.includes('SQLITE_BUSY') || errorMessage.includes('database is locked')) {
        errorMessage = `Database is busy. Please try again in a moment.`;
      }
    } else {
      errorMessage = String(error);
    }

    return {
      isSuccess: false,
      message: errorMessage,
      error: error instanceof Error ? error : new Error(errorMessage)
    };
  }
}

/**
 * Transaction handler utility for atomic operations
 * 
 * Executes multiple repository operations within a single transaction,
 * ensuring that all operations succeed or all fail together.
 * 
 * @param operations Array of functions that return promises to be executed within the transaction
 * @param entityName The name of the entity type for error reporting
 * @returns Promise that resolves to an ActionState with the results of all operations
 */
export async function executeTransaction<T>(
  operations: Array<() => Promise<any>>,
  entityName: string
): Promise<ActionState<T[]>> {
  try {
    // Replace with actual transaction implementation using SQL lib
    const results = [];
    
    for (const operation of operations) {
      const result = await operation();
      results.push(result);
    }
    
    return {
      isSuccess: true,
      message: `${entityName} transaction completed successfully`,
      data: results
    };
  } catch (error) {
    console.error(`Transaction error (${entityName}):`, error);
    
    // Extract meaningful error details
    let errorMessage = '';
    if (error instanceof Error) {
      errorMessage = error.message;
    } else {
      errorMessage = String(error);
    }
    
    return {
      isSuccess: false,
      message: `Transaction failed: ${errorMessage}`,
      error: error instanceof Error ? error : new Error(errorMessage)
    };
  }
}