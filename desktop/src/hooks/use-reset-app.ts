import { useNavigate } from 'react-router-dom';
import { createLogger } from '@/utils/logger';

const logger = createLogger({ namespace: "ResetApp" });

/**
 * Hook that provides a function to perform a full page reload (like F5).
 * This completely refreshes the application, clearing all state and
 * reloading all resources.
 */
export function useResetApp() {
  const navigate = useNavigate();

  const resetApp = async () => {
    try {
      logger.info('Performing full page reload...');
      
      // Perform a full page reload (like F5)
      window.location.reload();
    } catch (error) {
      logger.error('Error reloading page:', error);
      // Fallback to navigation if reload fails
      navigate('/');
    }
  };

  return resetApp;
}