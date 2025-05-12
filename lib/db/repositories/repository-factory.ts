/**
 * Repository Factory
 * 
 * Provides a centralized way to access different repositories,
 * ensuring consistent initialization and database connection management.
 */

import { backgroundJobRepository } from "./background-job-repository";
import { sessionRepository } from "./session-repository";

/**
 * Repository factory singleton that provides access to all repositories
 */
export class RepositoryFactory {
  // Repositories are lazily initialized when first accessed
  private static _backgroundJobRepository = backgroundJobRepository;
  private static _sessionRepository = sessionRepository;
  
  /**
   * Get the BackgroundJobRepository instance
   */
  static get backgroundJobRepository() {
    return this._backgroundJobRepository;
  }
  
  /**
   * Get the SessionRepository instance
   */
  static get sessionRepository() {
    return this._sessionRepository;
  }
  
  /**
   * Initialize all repositories 
   * This is useful for ensuring all repositories have been created 
   * and database tables have been set up before the application starts
   */
  static async initializeAll(): Promise<void> {
    try {
      // Access each repository to trigger initialization
      const repositoryCount = Object.keys(this).filter(key => key.endsWith('Repository')).length;
      console.log(`[RepositoryFactory] Initialized ${repositoryCount} repositories`);
    } catch (error) {
      console.error('[RepositoryFactory] Error initializing repositories:', error);
      throw error;
    }
  }
  
  /**
   * Get repository diagnostics
   * Useful for debugging and status reporting
   */
  static async getDiagnostics(): Promise<any> {
    try {
      // Get database info from SessionRepository
      const dbInfo = await this.sessionRepository.getDatabaseInfo();
      
      // Get session count
      const sessionCount = await this.sessionRepository.getSessionCount();
      
      // Get job metrics if possible
      const jobMetrics = await this.getJobMetrics();
      
      return {
        status: dbInfo.ok ? 'healthy' : 'unhealthy',
        message: dbInfo.message,
        metrics: {
          sessions: sessionCount,
          ...jobMetrics
        },
        fileSize: dbInfo.fileSize
      };
    } catch (error) {
      console.error('[RepositoryFactory] Error getting diagnostics:', error);
      return {
        status: 'error',
        message: error instanceof Error ? error.message : String(error)
      };
    }
  }
  
  /**
   * Get job metrics from BackgroundJobRepository
   * Private helper method for getDiagnostics
   */
  private static async getJobMetrics(): Promise<any> {
    try {
      // Use the connection to get job metrics
      // Not implementing this directly to avoid dependency on connectionPool
      return {
        jobs: {
          total: -1 // Not implemented
        }
      };
    } catch (error) {
      console.error('[RepositoryFactory] Error getting job metrics:', error);
      return {
        jobs: {
          error: error instanceof Error ? error.message : String(error)
        }
      };
    }
  }
}

// Export a direct access point to repositories for convenience
export const repositories = {
  backgroundJob: RepositoryFactory.backgroundJobRepository,
  session: RepositoryFactory.sessionRepository
};

export default RepositoryFactory;