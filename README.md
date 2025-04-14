# O1 Pro Flow

O1 Pro Flow is a comprehensive utility designed to streamline the workflow of generating prompts for AI models (like the O1 Pro model in ChatGPT or Anthropic's Claude) and applying the resulting code changes directly to your codebase. Built with Next.js (App Router) and React, it focuses on end-to-end automation: from preparing context-rich prompts based on your project files to processing AI-generated diffs or refactoring plans and updating your local repository.

**Key Update:** The application now uses a persistent SQLite database to store your sessions and settings, ensuring data is saved reliably across browser sessions and even after restarts.
All your inputs (project directory, file selections, task descriptions, regex patterns, etc.) are saved automatically as you work, associated with the current project directory and output format. **When a session is active, changes automatically update that session in the database.** You must create or load a session before you can interact with the main input form.

## Prerequisites

- Git installed and available in PATH
- Node.js (v18+) and pnpm
- Next.js 14+ with React 18
- (Required) `GROQ_API_KEY` for voice transcription service (uses Whisper via Groq for faster performance than OpenAI)
- (Required) `ANTHROPIC_API_KEY` for text correction and regex generation via Anthropic's Claude (specifically Sonnet 3.5 model as configured)

## Installation & Quick Start

1. **Install Dependencies**:
    ```bash
    cd o1-pro-flow
    pnpm install
    ```
2. **Configure Environment Variables**:
    - Copy the example file:
    ```bash
    cp .env.example .env.local
    ```
    - Edit `.env.local` to add your required `GROQ_API_KEY` and `ANTHROPIC_API_KEY`.
    - **Important:** The SQLite database (`o1-pro-flow.db`) will be automatically created in the `~/.o1-pro-flow/` directory on first run.
3. **Run Development Server**:
    ```bash
    pnpm dev
    ```
4. **Open the App & Get Started**:
   - Navigate to [http://localhost:3000](http://localhost:3000) and explore the interface.
   - The app automatically saves your working state for each project/format combination and restores it on reload.
   - Multiple tabs/sessions for the same project are supported without interference.

## Core Features
### Prompt Generation
Generate comprehensive prompts for AI models tailored to your codebase and task.
- **Project Context:** Select your project directory. The tool uses `git ls-files` (if available) to find tracked files, ignoring those specified in `.gitignore`. It can also operate on non-Git directories.
- **File Selection:**
    - **File Browser:** Browse your Git repository, search, and select files to include in the prompt context. Filter files using JavaScript regex for paths and content.
    - **Paste Paths:** Directly paste file paths (relative to the project or absolute external paths) to include specific files.
    - **Regex Generation:** Describe file patterns (e.g., "React components using useState") and use Anthropic Claude (if API key is provided) to generate corresponding title (path) and content regex patterns for filtering.
- **Codebase Structure:** Optionally provide or generate (using `tree` command logic) an ASCII representation of your codebase structure for better AI understanding, especially useful for refactoring tasks.
- **Task Description:** Detail the changes you want the AI to perform.
- **Session Management:**
    - Explicitly save all current inputs (project, files, task, regex, etc.) as a named session.
    - Sessions are specific to a **Project Directory** and **Output Format** combination.
    - When a session is active, any changes made to the inputs automatically update that session in the database.
    - The main input form is only accessible *after* a session has been created or loaded for the current project/format.

### Voice Transcription
Record audio instructions directly in the browser for the Task Description.
- **Transcription:** Uses the Groq API (requires `GROQ_API_KEY`) for fast transcription via Whisper.
- **Language Selection:** Specify the language for transcription.
- **Correction:** If transcribed text is available, it is automatically sent to Anthropic Claude (Sonnet 3.5) for correction and refinement. You can revert to the raw transcription if needed.

### Text Improvement
Select text within the Task Description area and use Anthropic Claude (if configured) to improve clarity and grammar while preserving formatting (line breaks, indentation, etc.).

### Output Formats
- **Code Changes (Diff):** Generates a prompt specifically designed to produce a Git patch file.
- **Refactoring Plan:** Generates a prompt asking the AI to break down a refactoring task into structured steps, outputting markdown files for each step.
- **Path Finder:** Generates a prompt asking the AI to identify all relevant files for a given task based on the provided context.
- **Custom:** Define your own prompt structure.

### Generate "Apply Changes" Prompt
This tool focuses on *generating prompts*. The "Apply Changes" section does *not* directly modify your files. Instead, it takes the output (like a diff or refactoring plan) from your AI model (which you run separately) from your clipboard and generates a *new prompt*. You then send this new prompt to your AI model (like O1 Pro in ChatGPT) to actually perform the file modifications within its environment.


**Important:** The tool itself does not execute code changes on your local machine. It prepares the instructions for the AI to do so.

## Project Structure
- `app` - Next.js App Router with server actions, pages, and layout
- `app/api` - Next.js API routes for backend database interactions
- `components` - UI and utility components
- `lib` - Utility libraries (token estimation, file utilities, Git utils, hashing, etc.)
- `lib/db` - Database setup, schema, repository pattern, and migrations
- `lib/contexts` - React context providers (Project, Format, Database for managing global state)
- `actions` - Server actions (reading directories, voice transcription, text correction, regex generation)
- `prompts` - Functions to generate prompts for specific LLM tasks
- `public` - Static assets
- `migrations` - SQL files for database schema evolution
- `hooks` - Custom React hooks for shared logic
- `types` - Type definitions

## Recommended Workflow
1. **Generate Prompt**  
   Specify your Project Directory, then either select files from the file browser or paste file paths. Provide the Task Description. Optionally use voice transcription. Click "Generate Prompt" to produce a text prompt for the O1 Pro model.

2. **Send Prompt to O1 Pro Model**  
   Copy and paste the generated prompt into ChatGPT (or another environment) where you have the O1 Pro model.

3. **Apply Changes**  
   Paste the diff or refactoring plan returned by the AI into the "Apply Changes" section of the tool. Click the button to generate a *new prompt*. Copy this new prompt and send it back to your AI model (e.g., O1 Pro) to execute the changes.
4. **Save/Load Sessions:** Use the "Saved Sessions" section to save your current setup or load a previous one. Your work is auto-saved to the active session.


## Contributing
Contributions are welcome. To contribute:

1. Fork the repo and clone your fork.
2. Create a new branch.
3. Make your changes, then test thoroughly.
4. Submit a pull request explaining your modifications.

## License
This project is open source under the MIT license.
