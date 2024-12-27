# Git Patch Generator

A tool that helps generate prompts and apply git patches from o1 in ChatGPT to your codebase.

## Features

- Generate prompts that include your current codebase
- Apply git patches from o1 responses directly to your codebase
- Works with IDE patch import functionality
- Search and filter files to include in the prompt
- Bulk include/exclude files by search or selection

## Quick Start

1. Clone the repo.

```bash
git clone https://github.com/mckaywrigley/o1-xml-parser
```

2. Install dependencies.

```bash
npm install
```

3. (Optional) Create a `.env.local` file and set the `PROJECT_DIRECTORY` environment variable to your project directory.

```bash
cp .env.example .env.local
```

```bash
PROJECT_DIRECTORY=/path/to/your/project # Ex: /Users/you/your-project
```

## Usage

1. Go to the web interface
2. Enter your project directory
3. Select which files to include in the prompt
4. Enter your task description
5. Click "Generate Prompt" to create a prompt that includes your codebase
6. Copy the generated prompt and paste it into ChatGPT with the o1 model
7. Copy the patch from o1's response
8. Import the patch in your IDE or use `git apply`
