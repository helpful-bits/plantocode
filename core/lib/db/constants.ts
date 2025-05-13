import path from 'path';
import os from 'os';

// Set up database file paths
export const APP_DATA_DIR = path.join(os.homedir(), '.vibe-manager');
export const DB_FILE = path.join(APP_DATA_DIR, 'vibe-manager.db'); 