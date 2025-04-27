# AI Architect Studio

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Next.js](https://img.shields.io/badge/Next.js-15.3.0-black)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-18.3.1-blue)](https://reactjs.org/)
[![SQLite](https://img.shields.io/badge/SQLite-3.x-blue)](https://www.sqlite.org/)
[![Gemini](https://img.shields.io/badge/Gemini-2.5-green)](https://ai.google.dev/gemini-api)
[![Claude](https://img.shields.io/badge/Claude-3.7-purple)](https://www.anthropic.com/)

## Overview

AI Architect Studio transforms how developers approach software architecture by combining the power of AI with intuitive design tools. This comprehensive platform helps you:

- **Generate architectural plans** tailored to your existing codebase
- **Apply changes with precision** using AI-generated patches
- **Accelerate your workflow** through intelligent context gathering and persistent sessions

Whether you're refactoring legacy code, planning new features, or designing entire systems, AI Architect Studio provides the intelligent assistance you need while keeping you in complete control of your codebase.

## ✨ Key Features

### Intelligent Architecture Generation
- **Smart File Selection** - AI automatically identifies relevant files for context
- **Voice-to-Architecture** - Record your ideas and let AI transform them into structured plans
- **Background Processing** - Complex generations run asynchronously while you continue working

### Superior Developer Experience
- **Persistent Sessions** - All work saved automatically per project
- **Real-time Updates** - Track generation progress with live status indicators
- **Multi-Model AI** - Optimized use of leading models for specific tasks:
  - **Google Gemini 2.5 Pro** for architecture generation
  - **Anthropic Claude 3.7** for text refinement and pattern matching
  - **Groq (Whisper)** for fast, accurate voice transcription

### Direct Code Integration
- **Patch Generation** - Create detailed patches ready to apply to your codebase
- **Contextual Understanding** - AI analyzes your project structure for relevant recommendations
- **Seamless Application** - Apply changes with confidence using intelligent patch application

## 🚀 Getting Started

### Prerequisites

- Git installed and available in your PATH
- Node.js v18+ and pnpm package manager
- API keys for:
  - `GROQ_API_KEY` (for voice transcription)
  - `ANTHROPIC_API_KEY` (for Claude 3.7 Sonnet)
  - `GEMINI_API_KEY` (for Gemini 2.5 Pro)

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/ai-architect-studio.git
cd ai-architect-studio

# Install dependencies
pnpm install

# Set up environment variables
cp .env.example .env.local
# Edit .env.local to add your API keys

# Run required database migrations
pnpm migrate

# Start the development server
pnpm dev
```

### ⚠️ IMPORTANT: Database Migrations

This application requires running database migrations manually before use and after updates:

```bash
pnpm migrate
```

**Failure to run migrations will result in application errors.**

Benefits of manual migrations:
- Prevents database locking issues that cause crashes
- Guarantees data consistency and integrity
- Provides better error handling for schema changes
- Gives you control over when schema changes occur

Run migrations:
- After initial installation
- After pulling repository updates
- After encountering database errors

### Basic Workflow

1. Visit [http://localhost:3000](http://localhost:3000)
2. Select your project directory
3. Create a new session or continue an existing one
4. Describe your architecture task (text or voice)
5. Generate context from relevant files (AI-assisted or manual selection)
6. Create your architecture plan
7. Apply the generated changes to your code

## 🔧 Database Management

The application uses SQLite for data storage (`~/.ai-architect-studio/ai-architect-studio.db`).

### Troubleshooting Commands

```bash
# Check database integrity and status
pnpm check-db

# Repair database structure while preserving data (creates backup first)
pnpm check-db --repair

# Reset database completely (creates backup before deleting all data)
pnpm reset-db
```

Development mode diagnostic endpoints:
- Status: http://localhost:3000/api/diagnostics/database/status
- Backup: http://localhost:3000/api/diagnostics/database/backup
- Repair: http://localhost:3000/api/diagnostics/database/repair

### Database Path Migration

If updating from an earlier version, migrate your existing database:

```bash
pnpm migrate-database-path
```

This safely moves data from the old location (`o1-pro-flow.db`) to the new location (`~/.ai-architect-studio/ai-architect-studio.db`).

## 🧠 Core Capabilities

### Architecture Planning
- **Context Gathering** - Multiple methods to select relevant files:
  - Interactive file browser
  - Direct path input
  - AI-assisted file recommendation
  - Regex pattern matching
- **Task Definition** - Write or record detailed requirements
- **Plan Generation** - Create comprehensive architecture plans from your context

### Voice Integration
- In-browser recording with instant feedback
- Rapid transcription via Groq API
- Multiple language support
- AI-assisted correction and refinement

### Persistent Processing
- Sessions automatically saved and restored
- Background processing with cancelation support
- Real-time status updates
- IDE integration for seamless workflow

## 📂 Project Structure

```
├── app                 # Next.js App Router components
│   ├── _components     # Feature-specific components
│   └── api             # Backend API routes
├── components          # Reusable UI components
├── lib                 # Utility functions and libraries
│   ├── db              # Database layer (SQLite)
│   └── contexts        # React context providers
├── actions             # Server actions
├── migrations          # Database migrations
├── patches             # Generated patches storage
└── prompts             # AI prompt templates
```

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🤝 Contributing

Contributions are welcome! To contribute:

1. Fork and clone the repository
2. Create a new branch for your feature
3. Make your changes
4. Test thoroughly
5. Submit a pull request with clear explanation

For major changes, please open an issue first to discuss what you would like to change.
