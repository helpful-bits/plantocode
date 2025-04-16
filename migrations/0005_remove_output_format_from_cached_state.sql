-- Migration to remove output_format from cached_state table

-- Step 1: Create a new cached_state table without output_format
CREATE TABLE cached_state_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_hash TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT, -- Store serialized values as text
  updated_at INTEGER,
  UNIQUE(project_hash, key)
);

-- Step 2: Copy data from old table to new table
-- Group by project_hash and key to handle potential duplicates from different output_formats
INSERT INTO cached_state_new (project_hash, key, value, updated_at)
SELECT project_hash, key, value, MAX(updated_at) as updated_at
FROM cached_state
GROUP BY project_hash, key;

-- Step 3: Drop the old table and index
DROP TABLE cached_state;
DROP INDEX IF EXISTS idx_cached_state_lookup;

-- Step 4: Rename the new table
ALTER TABLE cached_state_new RENAME TO cached_state;

-- Step 5: Create a new index
CREATE INDEX idx_cached_state_lookup ON cached_state(project_hash, key); 