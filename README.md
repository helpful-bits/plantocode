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
- **Persistent Sessions** - All work automatically saved in real-time with intelligent failure recovery and retry mechanisms
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
git clone https://github.com/helpful-bits/ai-architect-studio.git
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

# Start the background job workers (in a separate terminal)
pnpm workers
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

# Create a backup of the database
pnpm db:backup
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
- Rapid transcription via Groq API (Whisper model)
- Multiple language support
- AI-assisted correction and refinement

### Persistent Processing
- Sessions automatically saved and restored with robust error handling
- Background processing with cancelation support
- Real-time status updates without intrusive notifications
- Project settings customization for consistent workflows

## 🔄 Background Job Processing

The application uses a robust, priority-based job queuing system to handle resource-intensive operations efficiently:

### Job Queue Architecture
- **GlobalJobQueue** - In-memory queue that stores job descriptors with priority handling
- **JobProcessor** - Interface for components that execute specific job types
- **JobRegistry** - Maps job types to their specialized processors
- **JobDispatcher** - Routes jobs to appropriate processors
- **JobScheduler** - Manages worker concurrency and polls for jobs
- **API Clients** - Integrated with job system for request tracking and management
- **Specialized Processors** - One processor per job type, following a consistent pattern

### Job Status Lifecycle
The system tracks job status in the database with a clear lifecycle:

- `created`: Initial state when job is created in the database
- `queued`: Job has been added to the processing queue
- `running`: Job is actively being processed
- `completed`: Job finished successfully
- `failed`: Job failed due to an error
- `canceled`: Job was canceled by the user
- `preparing`: Job is in preparation phase (e.g., gathering resources)

### Job Types and Dedicated Processors
Each operation type has a specialized processor for efficient handling:

- `GEMINI_REQUEST`: General Gemini API requests
- `CLAUDE_REQUEST`: Claude API requests
- `IMPLEMENTATION_PLAN_GENERATION`: Architecture planning
- `PATH_FINDER`: Smart file selection
- `TEXT_CORRECTION`: Text refinement
- `GUIDANCE_GENERATION`: Task guidance
- `PATH_CORRECTION`: Path normalization
- `REGEX_GENERATION`: Pattern matching
- `TEXT_IMPROVEMENT`: Style improvement
- `VOICE_CORRECTION`: Voice transcription refinement
- `VOICE_TRANSCRIPTION`: Audio-to-text conversion
- `READ_DIRECTORY`: File system operations

### Worker Configuration
You can configure the worker system through environment variables:

- `WORKER_CONCURRENCY` - Maximum number of concurrent jobs (default: 5)
- `WORKER_POLLING_INTERVAL` - How often workers check for new jobs in milliseconds (default: 200)
- `WORKER_JOB_TIMEOUT` - Maximum job execution time in milliseconds (default: 10 minutes)

### Starting Workers
```bash
# Start workers with default configuration
pnpm workers

# Start workers with custom configuration
WORKER_CONCURRENCY=10 WORKER_POLLING_INTERVAL=100 pnpm workers
```

The worker system must be running alongside the Next.js server for background jobs to be processed.

## 📂 Project Structure

```
├── app                 # Next.js App Router components
│   ├── _components     # Feature-specific components
│   ├── api             # Backend API routes
│   └── settings        # Application settings UI
├── components          # Reusable UI components
├── lib                 # Utility functions and libraries
│   ├── db              # Database layer (SQLite)
│   ├── jobs            # Background job processing system
│   │   ├── processors  # Job type-specific processors
│   │   └── job-types.ts # Job type definitions
│   └── services        # Core services
│       └── session-sync  # Session persistence and synchronization
│           ├── api-handler.ts      # API interaction logic
│           ├── health-checker.ts   # Service health monitoring
│           ├── queue-manager.ts    # Operation queue management
│           ├── types.ts            # Shared type definitions
│           └── index.ts            # Service exports
├── actions             # Server actions for core functionality
├── migrations          # Database migrations
├── hooks               # React hooks
├── types               # TypeScript type definitions
├── scripts             # Utility scripts
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