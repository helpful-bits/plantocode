import {
  sqliteTable,
  text,
  integer,
  primaryKey,
} from 'drizzle-orm/sqlite-core';

// Sessions table
export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(), // Unique identifier
  name: text('name').notNull(), // User-provided name
  projectDirectory: text('project_directory').notNull(),
  taskDescription: text('task_description').default(''),
  searchTerm: text('search_term').default(''),
  pastedPaths: text('pasted_paths').default(''),
  patternDescription: text('pattern_description').default(''),
  titleRegex: text('title_regex').default(''),
  contentRegex: text('content_regex').default(''),
  isRegexActive: integer('is_regex_active', { mode: 'boolean' }).default(true),
  codebaseStructure: text('codebase_structure').default(''),
  outputFormat: text('output_format').notNull(), // Format this session was saved under
  customFormat: text('custom_format').default(''), // Optional custom format
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(Date.now),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(Date.now),
});

// Included files for a session
export const includedFiles = sqliteTable('included_files', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  sessionId: text('session_id').notNull().references(() => sessions.id, { onDelete: 'cascade' }),
  filePath: text('file_path').notNull(),
}, (table) => ({
  // Create a unique constraint to prevent duplicate file paths in the same session
  uniqueIdx: primaryKey({ columns: [table.sessionId, table.filePath] }),
}));

// Excluded files for a session
export const excludedFiles = sqliteTable('excluded_files', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  sessionId: text('session_id').notNull().references(() => sessions.id, { onDelete: 'cascade' }),
  filePath: text('file_path').notNull(),
}, (table) => ({
  // Create a unique constraint to prevent duplicate file paths in the same session
  uniqueIdx: primaryKey({ columns: [table.sessionId, table.filePath] }),
}));

// Project settings table (to store active session ID, etc.)
export const projectSettings = sqliteTable('project_settings', {
  projectHash: text('project_hash').notNull(), // Hashed project directory path
  outputFormat: text('output_format').notNull(), // Format type
  activeSessionId: text('active_session_id').references(() => sessions.id, { onDelete: 'set null' }),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(Date.now),
}, (table) => ({
  // Create a unique constraint for project + format combination
  uniqueIdx: primaryKey({ columns: [table.projectHash, table.outputFormat] }),
}));

// Individual cached state values
export const cachedStateItems = sqliteTable('cached_state_items', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  projectHash: text('project_hash').notNull(),
  outputFormat: text('output_format').notNull(),
  key: text('key').notNull(),
  value: text('value'),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(Date.now),
}, (table) => ({
  // Create a unique constraint for project + format + key combination
  uniqueIdx: primaryKey({ columns: [table.projectHash, table.outputFormat, table.key] }),
})); 