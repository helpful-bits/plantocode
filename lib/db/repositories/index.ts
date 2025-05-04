import { BackgroundJobRepository } from './background-job-repository';
import SessionRepository, { sessionRepository } from './session-repository';

// Export repository instances
export const backgroundJobRepository = new BackgroundJobRepository();
export { sessionRepository };

// Export repository classes for use in tests or when creating custom instances
export { BackgroundJobRepository, SessionRepository }; 