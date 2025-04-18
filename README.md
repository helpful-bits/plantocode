# O1 Pro Flow

O1 Pro Flow is a comprehensive utility designed to streamline the workflow of generating prompts for AI models (like the O1 Pro model in ChatGPT or Anthropic's Claude) and applying the resulting code changes directly to your codebase. Built with Next.js (App Router) and React, it focuses on end-to-end automation: from preparing context-rich prompts based on your project files to processing AI-generated diffs or refactoring plans and updating your local repository.

**Key Update:** The application now uses a persistent SQLite database to store your sessions and settings, ensuring data is saved reliably across browser sessions and even after restarts.
All your inputs (project directory, file selections, task descriptions, regex patterns, etc.) are saved automatically as you work, associated with the current project directory. **When a session is active, changes automatically update that session in the database.** You must create or load a session before you can interact with the main input form. The selected project directory is synced with the browser URL for easier sharing and bookmarking.

## Prerequisites
 
- Git installed and available in PATH
- Node.js (v18+) and pnpm
- Next.js 14+ with React 18
- (Required) `GROQ_API_KEY` for voice transcription service (uses Whisper via Groq for faster performance than OpenAI)
- (Required) `ANTHROPIC_API_KEY` for text improvement and regex generation via Anthropic's Claude (specifically `claude-3-7-sonnet-20250219` model as configured)
- (Required) `GEMINI_API_KEY` for generating patches or other content via Google Gemini (currently `gemini-2.5-pro-preview-03-25`).

## Installation & Quick Start 

1. **Install Dependencies**:
    ```bash # Make sure you are in the root directory of the cloned repository
    cd o1-pro-flow
    pnpm install
    ```
2. **Configure Environment Variables**:
    - Copy the example file:
    ```bash
    cp .env.example .env.local
    ```
    - Edit `.env.local` to add your required `GROQ_API_KEY`, `ANTHROPIC_API_KEY`, and `GEMINI_API_KEY`.
    - **Important:** The SQLite database (`o1-pro-flow.db`) will be automatically created in the `~/.o1-pro-flow/` directory on first run.
3. **Run Development Server**:
    ```bash
    pnpm dev
    ```
4. **Open the App & Get Started**:
   - Navigate to [http://localhost:3000](http://localhost:3000) and explore the interface.
   - The app automatically saves your working state for each project/format combination and restores it on reload.
   - Multiple tabs/sessions for the same project directory are supported without interference.
 
## Core Features
### Prompt Generation
Generate comprehensive prompts for AI models tailored to your codebase and task.
- **Project Context:** Select your project directory. The tool uses `git ls-files` (if available) to find tracked files, ignoring those specified in `.gitignore`. It can also operate on non-Git directories.
- **File Selection:**
    - **File Browser:** Browse your Git repository, search, and select files to include in the prompt context.
    - **Paste Paths:** Directly paste file paths (relative to the project or absolute external paths) to include specific files.
    - **AI Path Finder:** Click a button near the "Paste Paths" area. Gemini Flash analyzes the codebase structure and task description to automatically suggest relevant files, populating the "Paste Paths" area. Handles large codebases by requesting intelligent splitting if necessary.
    - **Regex Generation:** Describe file patterns (e.g., "React components using useState") and use Anthropic Claude (if API key is provided) to generate corresponding title (path) and content regex patterns for filtering.
- **Codebase Structure:** Optionally provide or generate (using `tree` command logic) an ASCII representation of your codebase structure for better AI understanding, especially useful for refactoring tasks.
- **Task Description:** Detail the changes you want the AI to perform. Use the integrated voice transcription and correction features if needed.
- **Session Management:**
    - Explicitly save all current inputs (project, files, task, regex, etc.) as a named session.
    - Sessions are specific to a **Project Directory**.
    - **Gemini processing status** (idle, running, completed, failed, canceled), along with start/end times and the path to the saved patch file, is stored per session. The server action continues running even if the browser is refreshed or closed.
    - The UI reflects the current status by polling the database.
    - When a session is active, any changes made to the inputs (task description, file selections, regex, etc.) automatically update that session in the database.
    - The main input form (Task Description, File Selection, etc.) is only accessible *after* a session has been created or loaded for the current project directory.
### Voice Transcription 
Record audio instructions directly in the browser for the Task Description.
- **Transcription:** Uses the Groq API (requires `GROQ_API_KEY`) for fast transcription via Whisper.
- **Language Selection:** Specify the language for transcription.
- **Correction:** If transcribed text is available, it is automatically sent to Anthropic Claude (Sonnet 3.7) for correction and refinement. You can revert to the raw transcription if needed.

### Text Improvement
Select text within the Task Description area and use Anthropic Claude (if configured) to improve clarity and grammar while preserving formatting (line breaks, indentation, etc.).

### Process Prompt with Gemini (Background Task)
- Takes the generated prompt from Step 1.
- Sends the prompt to the Google Gemini API (`gemini-2.5-pro-preview-03-25`) using the provided `GEMINI_API_KEY`. The prompt is designed to elicit a Git patch as the response.
- Expects a Git patch in the response, potentially wrapped in markdown code fences (```diff ... ```) which are automatically stripped.
- Automatically streams the received patch content directly to a file in the `patches/` directory within your selected **Project Directory**. The filename includes an ISO timestamp and the current session name (e.g., `patches/2024-07-28T10-30-05_123Z_MySessionName.patch`). If writing to the project directory fails (e.g., permissions), it falls back to a central `patches/` directory in the application root. **You can monitor this file in your IDE to see changes appear in real-time.**
- The UI displays the processing status (running, completed, failed, canceled) and elapsed time by polling the session state in the database.
- **IDE Integration:** Provides a button to directly open the generated patch file in your default IDE/editor.
- **Background Processing:** The server action runs independently. You can refresh the page, close the tab, or even restart the browser; the processing continues on the server. Re-opening the session will show the current status.
- **Cancellation:** Allows canceling the ongoing Gemini processing request via a button in the UI.

## Important Note

The tool itself does not directly execute code changes on your local machine. It generates prompts and, via the Gemini integration, produces patch files. Applying these patches is a separate step you perform using standard Git tools or IDE features.

## Project Structure
- `app` - Next.js App Router with server actions, API routes, pages, and layout
- `app/api` - Next.js API routes for backend database interactions
- `components` - UI and utility components
- `app/_components` - Feature-specific components grouped by functionality (e.g., `generate-prompt`, `gemini-processor`)
- `lib` - Utility libraries (token estimation, file utilities, Git utils, hashing, path utils, etc.)
- `lib/db` - Database setup, schema, repository pattern, connection pool and migrations (uses SQLite)
- `patches` - Application-level directory where generated patch files are saved as a fallback
- `lib/contexts` - React context providers (Project, Database for managing global state)
- `actions` - Server actions (reading directories, voice transcription, text correction, regex generation)
- `prompts` - Functions to generate prompts for specific LLM tasks
- `public` - Static assets
- `migrations` - SQL files for database schema evolution
- `hooks` - Custom React hooks for shared logic
- `types` - Type definitions
## Recommended Workflow
1. **Select Project:** Choose your project directory.
2. **Manage Session:** Create a new session or load an existing one for the selected project. Your work (task description, file selections, etc.) is auto-saved to the active session.
3. **Define Task & Context:**
   - Write or record the task description.
   - **Find Files:** Use the "Find Relevant Files" button (near Paste Paths) to let AI populate relevant file paths based on your task description.
   - **Adjust Files:** Manually adjust the pasted paths, use the file browser for selection, or use regex for filtering.
   - Optionally provide codebase structure information.
4. **Generate Prompt:** Click "Generate Prompt" to create the input for the AI model (Gemini) based on your selections and task.
5. **Process with Gemini:** Click "Send to Gemini & Save Patch". The tool will send the prompt to Gemini, stream the response (expected to be a patch) to a file in the `patches/` directory within your selected project directory (or fallback), and display the progress.
6. **Apply Patch:** Once Gemini processing is complete, use the "Open in IDE" button or standard tools (`git apply your-patch-file.patch`) to apply the generated changes to your local codebase.
7. **Alternative (Manual Copy/Paste):** Copy the generated prompt from step 4 and paste it into your preferred AI model interface (like ChatGPT with O1 Pro). Obtain the response (e.g., diff) and apply it manually.
## Contributing
Contributions are welcome. To contribute:
1. Fork the repo and clone your fork.
2. Create a new branch.
3. Make your changes, then test thoroughly.
4. Submit a pull request explaining your modifications.

## License
This project is open source under the MIT license.
