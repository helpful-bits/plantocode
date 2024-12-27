# O1 Pro Flow

O1 Pro Flow is a comprehensive utility that helps you generate prompts for the O1 Pro model in ChatGPT and apply the resulting code changes directly to your codebase. It is built with Next.js 15.1.3 and React 18 (using the Next.js App Router). The application focuses on end-to-end automation: from generating AI-assisted code modifications to processing diffs and updating your local repository.

## Prerequisites
- Node.js (v18+) and npm (or yarn)
- A Git repository
- Next.js 15.1.3 with React 18
- (Optional) `GROQ_API_KEY` for voice transcription
- (Optional) `ANTHROPIC_API_KEY` for text correction via Anthropic's Claude

## Installation & Quick Start
1. **Clone the Repository**:
    ```bash
    git clone https://github.com/mckaywrigley/o1-pro-flow
    ```
2. **Install Dependencies**:
    ```bash
    cd o1-pro-flow
    npm install
    ```
3. **Configure Environment Variables**:
    ```bash
    cp .env.example .env.local
    ```
4. **Run the Development Server**:
    ```bash
    npm run dev
    ```
5. **Open the App**:
   - Navigate to [http://localhost:3000](http://localhost:3000) and explore the interface.
   - Local storage caches your Project Directory, file selections, and Task Description.
   - If you set `GROQ_API_KEY`, you can record audio and use voice transcription for your Task Description.

## Core Features
### Prompt Generation
Generate prompts to instruct the O1 Pro model about specific code changes. You can:
- Use a file browser to include or exclude files.
- Paste file paths if needed.
- Provide a Task Description detailing requested changes.

### Voice Transcription
Record audio instructions directly in the browser. Transcriptions are handled by the Groq API, and (optionally) corrected via Anthropic's Claude.

### File Browser
Allows you to browse your Git repository and select files for context, excluding unneeded files to minimize token usage.

### Git Integration
Uses `git ls-files` to identify and load tracked files.

### Apply Changes
After generating a diff from your AI model, paste it into the "Apply Changes" form. It will update, create, or remove files as specified. If renames or deletions are requested, a `cleanup.sh` script is generated.

## Project Structure
- `app` - Next.js App Router with server actions, pages, and layout
- `components` - UI and utility components
- `lib` - Utility libraries (token estimation, file changes, hashing, etc.)
- `actions` - Server actions for reading directories, applying diffs, voice transcription, text correction
- `public` - Static assets
- `types` - Type definitions

## Usage
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
