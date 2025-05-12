import { BackgroundJobRepository } from './background-job-repository';
import SessionRepository, { sessionRepository } from './session-repository';
import { BaseRepository, handleRepositoryAction, executeTransaction } from './repository-interface';
import { RepositoryFactory, repositories } from './repository-factory';

// Export repository instances
export const backgroundJobRepository = new BackgroundJobRepository();
export { sessionRepository };

// Export repository factory and utilities
export { RepositoryFactory, repositories };

// Export repository interface for implementing new repositories
export type { BaseRepository };
export { handleRepositoryAction, executeTransaction };

// Export repository classes for use in tests or when creating custom instances
export { BackgroundJobRepository, SessionRepository }; 