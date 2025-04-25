# AI Architect Studio

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Next.js](https://img.shields.io/badge/Next.js-15.3.0-black)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-18.3.1-blue)](https://reactjs.org/)
[![SQLite](https://img.shields.io/badge/SQLite-3.x-blue)](https://www.sqlite.org/)
[![Gemini](https://img.shields.io/badge/Gemini-2.5-green)](https://ai.google.dev/gemini-api)
[![Claude](https://img.shields.io/badge/Claude-3.7-purple)](https://www.anthropic.com/)

<p align="center">
  <img src="https://via.placeholder.com/800x400?text=AI+Architect+Studio" alt="AI Architect Studio Screenshot" width="800"/>
</p>

## 🚀 What is AI Architect Studio?

AI Architect Studio is a comprehensive tool that bridges AI and software development, enabling you to:

1. **Generate architectural plans** tailored to your existing codebase
2. **Apply code changes** directly using AI-generated patches
3. **Streamline your workflow** with persistent sessions and intelligent file selection

Perfect for developers who want to leverage AI for code architecture and refactoring without compromising control.

## ✨ Key Features

- **Intelligent File Selection** - AI automatically identifies relevant files based on your task
- **Voice-to-Architecture** - Record your ideas and let AI transcribe and refine them
- **Background Processing** - Generate plans while you continue working
- **Persistent Sessions** - All work is saved automatically per project
- **Database Integration** - Reliable SQLite storage ensures no work is lost
- **Multi-API Support** - Leverages the best AI models for each task:
  - **Google Gemini** for architecture generation
  - **Anthropic Claude** for text refinement and regex creation
  - **Groq (Whisper)** for voice transcription

## 🛠️ Quick Start

### Prerequisites

- Git in your PATH
- Node.js (v18+) and pnpm
- API keys:
  - `GROQ_API_KEY` (Whisper via Groq)
  - `ANTHROPIC_API_KEY` (Claude 3.7 Sonnet)
  - `GEMINI_API_KEY` (Gemini 2.5 Pro)

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/ai-architect-studio.git
cd ai-architect-studio

# Install dependencies
pnpm install

# Configure environment variables
cp .env.example .env.local
# Edit .env.local to add your API keys

# Start development server
pnpm dev
```

### Getting Started

1. Visit [http://localhost:3000](http://localhost:3000)
2. Select your project directory
3. Create a new session or load an existing one
4. Describe your architecture task (write or record)
5. Let AI find relevant files or select them manually
6. Generate and apply your architectural plan

## 🔄 Workflow

1. **Select Project & Create Session** - Choose your working directory
2. **Define Task** - Describe what you want to build or refactor
3. **Generate Context** - Select relevant files (manually or with AI)
4. **Create Plan** - Generate the architecture plan
5. **Process with AI** - Send to Gemini and receive a patch file
6. **Apply Changes** - Apply the generated patch to your code

## 📂 Architecture

```
├── app                 # Next.js App Router components
│   ├── _components     # Feature-specific components
│   └── api             # Backend API routes
├── components          # Reusable UI components
├── lib                 # Utility libraries
│   ├── db              # Database layer (SQLite)
│   └── contexts        # React context providers
├── actions             # Server actions
├── migrations          # Database migrations
├── patches             # Generated patches storage
└── prompts             # AI prompt templates
```

## 🧠 Core Capabilities

### Plan Generation
- **Project Context** - Select directory and files
- **File Selection** - Multiple ways to choose files:
  - File browser
  - Direct path input
  - AI-assisted file finding
  - Regex pattern matching
- **Task Description** - Write or record your requirements

### Voice Transcription
- Record directly in browser
- Fast transcription via Groq API
- Language selection
- AI-powered correction

### Background Processing
- Sessions persist across browser restarts
- Real-time status updates
- Cancel running processes
- Direct integration with your IDE

## 🛠️ Development

### Database Migrations

```bash
# Apply migrations
pnpm migrate

# Reset database (creates backup first)
pnpm reset-db
```

### Database Path Migration

The application's database has been renamed from `o1-pro-flow.db` to `ai-architect-studio.db` and moved to a new location (`~/.ai-architect-studio/`). If you're updating from an older version, you can migrate your existing database using:

```bash
# Migrate database to new location
pnpm migrate-database-path
```

This script will:
1. Check if you have an existing database at the old location
2. Create a backup of your old database
3. Copy the database to the new location
4. Give you the option to delete the old database

The migration process is safe and preserves all your existing data (sessions, files, settings, etc.).

### Troubleshooting

If you encounter database migration errors, try:

```bash
# Fix database tables
pnpm fix-tables

# Or reset completely
pnpm reset-db
```

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🤝 Contributing

Contributions welcome! To contribute:

1. Fork and clone the repo
2. Create a new branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request with explanation
