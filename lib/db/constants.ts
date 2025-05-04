import path from 'path';
import os from 'os';

// Set up database file paths
export const APP_DATA_DIR = path.join(os.homedir(), '.o1-pro-flow');
export const DB_FILE = path.join(APP_DATA_DIR, 'ai-architect-studio.db'); 