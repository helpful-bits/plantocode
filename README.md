# O1 Pro Flow

O1 Pro Flow is a comprehensive utility designed to streamline the workflow of generating prompts for AI models (like the O1 Pro model in ChatGPT or Anthropic's Claude) and applying the resulting code changes directly to your codebase. Built with Next.js (App Router) and React, it focuses on end-to-end automation: from preparing context-rich prompts based on your project files to processing AI-generated diffs or refactoring plans and updating your local repository.

## Prerequisites
- macOS or Linux (due to shell script usage for cleanup)
- Git installed and available in PATH
- Node.js (v18+) and pnpm
- A Git repository
- Next.js 15.1.3 with React 18
- (Optional) `GROQ_API_KEY` for voice transcription
- (Optional) `ANTHROPIC_API_KEY` for text correction via Anthropic's Claude (specifically Sonnet 3.7 model as configured)
- (Optional) Set `NEXT_PUBLIC_ANTHROPIC_API_KEY_EXISTS=true` in your `.env` file if you provide `ANTHROPIC_API_KEY` to enable related features.

## Installation & Quick Start
1. **Install Dependencies**:
    ```bash
    cd o1-pro-flow
    pnpm install
    ```
2. **Configure Environment Variables**:
    ```bash
    cp .env.example .env.local
    ```
3. **Run the Development Server**:
    ```bash
    pnpm dev
    ```
4. **Open the App**:
   - Navigate to [http://localhost:3000](http://localhost:3000) and explore the interface.
   - Local storage caches your Project Directory, file selections, and Task Description.
   - If you set `GROQ_API_KEY`, you can record audio and use voice transcription for your Task Description.

## Core Features
### Prompt Generation
Generate comprehensive prompts for AI models tailored to your codebase and task.
- **Project Context:** Select your project directory. The tool uses `git ls-files` to find tracked files, ignoring those specified in `.gitignore`.
- **File Selection:**
    - **File Browser:** Browse your Git repository, search, and select files to include in the prompt context. Filter files using JavaScript regex for paths and content.
    - **Paste Paths:** Directly paste file paths (relative to the project or absolute external paths) to include specific files.
    - **Regex Generation:** Describe file patterns (e.g., "React components using useState") and use Anthropic Claude (if API key is provided) to generate corresponding title (path) and content regex patterns for filtering.
- **Codebase Structure:** Optionally provide or generate (using `tree` command logic) an ASCII representation of your codebase structure for better AI understanding, especially useful for refactoring tasks.
- **Task Description:** Detail the changes you want the AI to perform.

### Voice Transcription
Record audio instructions directly in the browser for the Task Description.
- **Transcription:** Uses the Groq API (requires `GROQ_API_KEY`) for fast transcription via Whisper.
- **Correction (Optional):** If `ANTHROPIC_API_KEY` and `NEXT_PUBLIC_ANTHROPIC_API_KEY_EXISTS=true` are set, the transcribed text is automatically sent to Anthropic Claude (Sonnet 3.5) for correction and refinement. You can revert to the raw transcription if needed.

### Text Improvement (Optional)
Select text within the Task Description area and use Anthropic Claude (if configured) to improve clarity and grammar while preserving formatting (line breaks, indentation, etc.).

### Output Formats
- **Code Changes (Diff):** Generates a prompt specifically designed to produce a Git patch file.
- **Refactoring Plan:** Generates a prompt asking the AI to break down a refactoring task into structured steps, outputting markdown files for each step.
- **Path Finder:** Generates a prompt asking the AI to identify all relevant files for a given task based on the provided context.
- **Custom:** Define your own prompt structure.

### Apply Changes
After generating a diff from your AI model, paste it into the "Apply Changes" form. It will update, create, or remove files as specified. If renames or deletions are requested, a `cleanup.sh` script is generated.

## Project Structure
- `app` - Next.js App Router with server actions, pages, and layout
- `components` - UI and utility components
- `lib` - Utility libraries (token estimation, file utilities, Git utils, hashing, etc.)
- `actions` - Server actions for reading directories, applying diffs, voice transcription, text correction
- `prompts` - Functions to generate prompts for specific LLM tasks
- `public` - Static assets
- `hooks` - Custom React hooks for shared logic
- `types` - Type definitions

## Basic Workflow
1. **Generate Prompt**  
   Specify your Project Directory, then either select files from the file browser or paste file paths. Provide the Task Description. Optionally use voice transcription. Click "Generate Prompt" to produce a text prompt for the O1 Pro model.

2. **Send Prompt to O1 Pro Model**  
   Copy and paste the generated prompt into ChatGPT (or another environment) where you have the O1 Pro model.

3. **Apply Changes**  
   Paste the returned diff into the "Apply Changes" form to update your local codebase automatically. A `cleanup.sh` script is produced for any renames/deletions.

## Contributing
Contributions are welcome. To contribute:
1. Fork this repo and clone your fork.
2. Create a new branch.
3. Make your changes, then test thoroughly.
4. Submit a pull request explaining your modifications.

## License
This project is open source under the MIT license.
