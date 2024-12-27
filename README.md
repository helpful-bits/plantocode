# O1 Pro Flow

The O1 Pro Flow is a comprehensive utility that generates prompts for the O1 Pro model in ChatGPT and applies resulting code changes directly to your codebase. Below is an overview of its features, setup instructions, and usage.

## Prerequisites
- Node.js (v18+) and npm (or yarn) installed
- A Git repository (files should be tracked or recognized via `git ls-files`)
- Next.js 15.1.3 with React 18

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
    - Navigate to [http://localhost:3000](http://localhost:3000) in your browser to access the O1 Pro Flow interface.
    - The application stores your selected Project Directory and other settings (like file inclusions) in local storage, so you can easily reload them later.
    - You can also leverage voice transcription to append audio-based instructions to your Task Description by setting the `GROQ_API_KEY` environment variable.

## Features

- **Prompt Generation**: Easily create prompts to request changes from the O1 Pro model, leveraging your local codebase context. Use the built-in file browser or paste file paths manually.
- **Voice Transcription**: Record audio directly in the browser to generate text for your Task Description if you have configured `GROQ_API_KEY`.
- **File Browser**: Browse and select files from your local project directory.
- **Syntax Highlighting**: View file contents with proper syntax highlighting.
- **Git Integration**: Automatically detect git-tracked files.

## Usage

1. **Generate O1 Prompt**:
    - Provide your project directory (stored in local storage for convenience).
    - Load files and optionally exclude/uncheck files you don't need.
    - Or paste file paths one per line to override file selection.
    - Optionally, record voice instructions if `GROQ_API_KEY` is set.
    - Describe your changes in the Task Description.
    - Click **Generate Prompt** to create your O1-compatible prompt.

2. **Apply Changes**:
    - Copy your generated prompt and send it to the O1 Pro model (e.g., ChatGPT).
    - Paste the returned diff into the *Apply Changes* form, then click the apply button.
    - Your local files (tracked by git) will be updated accordingly, including any deletions or renames in `cleanup.sh`.

## Project Structure
- **app** (Next.js App Router)  
  Contains routes and page components, including prompts generation and changes application.
- **components**  
  Shared UI and utility components following Shadcn UI structure.
- **lib**  
  Core libraries such as the XML parser, token estimator, file changes application, etc.
- **actions**  
  Server actions for reading directories, applying changes, and more.
- **public**  
  Static assets, fonts, etc.
- **types**  
  Type definitions used throughout the app.

## Contributing
1. Fork this repo and clone your fork.
2. Create a new branch for your feature or bug fix.
3. Make changes, ensuring code quality and consistency with the existing project structure.
4. Submit a pull request with a clear summary of your modifications.

## License
This project is open source under the MIT license.
