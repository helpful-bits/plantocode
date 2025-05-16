# Tauri Commands

This directory contains all the Tauri commands that can be invoked from the frontend.

## Commands Structure

- Each command is organized in its own module file
- The `mod.rs` file exports all command functions for easy access
- Commands follow a consistent naming convention: `verb_noun_command`

## Adding New Commands

1. Create a new file for your command (e.g., `my_command.rs`)
2. Implement the command function with the `#[tauri::command]` attribute
3. Add the module to `mod.rs`
4. Register the command in `main.rs` using `invoke_handler`

## Directory Operations

### Read Directory Command

The `create_read_directory_job_command` creates a background job to read a directory structure.

#### Request Parameters

```typescript
interface ReadDirectoryRequestArgs {
  session_id: string;      // Required: Session ID
  directory_path: string;  // Required: Directory path to read
  exclude_patterns?: string[]; // Optional: Patterns to exclude
}
```

#### Response

```typescript
interface ReadDirectoryCommandResponse {
  job_id: string;  // Job ID for tracking
}
```

#### Usage from Frontend

```typescript
import { readDirectoryAction } from '@core/actions/read-directory-actions';

// Create a job to read a directory
const result = await readDirectoryAction(
  sessionId,
  directoryPath,
  ['node_modules/**', '.git/**'] // optional exclude patterns
);

// Get job ID from the result
const jobId = result.data?.jobId;

// Then monitor the job for completion using background job events
// and parse the result using parseReadDirectoryJobData
```

## Job Creation Pattern

Commands that create background jobs follow this pattern:

1. Validate required input parameters
2. Create a payload specific to the job type
3. Use the `job_creation_utils::create_and_queue_background_job` helper function
4. Return the job ID to the frontend

See `read_directory_command.rs` for an example implementation.