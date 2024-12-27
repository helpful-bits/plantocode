# O1 Pro Flow

The O1 Pro Flow is a comprehensive utility that generates prompts for the O1 Pro model in ChatGPT and applies resulting code changes directly to your codebase. Below is an overview of its features, setup instructions, and usage.

## Features
- **Prompt Generation**: Easily create prompts to request changes from the O1 Pro model, leveraging your local codebase context.
- **Apply Changes**: Automatically apply diffs returned by the model to your code, including file creations, updates, and deletions.
- **File Selection**: Filter and select files to include or exclude via an intuitive file browser, or simply paste file paths.
- **Persisted Settings**: Store project paths, search terms, and other data locally for a smooth workflow.

## Prerequisites
- Node.js (v18+) and npm (or yarn) installed
- A Git repository (files should be tracked or recognized via `git ls-files`)
- Next.js 14.2.x with React 18

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
3. **Run the Development Server**:
   ```bash
   npm run dev
   ```
4. **Open the App**:
   - Navigate to [http://localhost:3000](http://localhost:3000) in your browser.
   - Explore the prompt generation and change application flows.

## Usage
1. **Generate O1 Prompt**:
   - Provide your project directory.
   - Select or paste file paths to include in your prompt.
   - Describe your changes in the Task Description.
   - Click **Generate Prompt** to produce a specialized diff request for the O1 Pro model.
2. **Apply Changes**:
   - Copy your generated prompt and send it to the O1 Pro model (e.g., ChatGPT).
   - Paste the returned diff into the *Apply Changes* textarea, then click the apply button.
   - Your local files will be updated accordingly (creates, updates, deletes).

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
