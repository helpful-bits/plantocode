# Vibe Manager

Vibe Manager is a powerful AI coding assistant that helps you write and manage code.

## Project Structure

This monorepo is organized into three main parts:

```
vibe-manager/
├── core/               # Core web application (Next.js)
├── desktop/            # Desktop application (Tauri)
└── server/             # Backend server (Rust)
```

### Core

The `core` directory contains the main web application built with Next.js. This is the foundation of the application with all the business logic, UI components, and API clients.

### Desktop

The `desktop` directory contains the Tauri-based desktop application. It imports and reuses code from the `core` application through aliases.

### Server

The `server` directory contains the Rust backend server. It provides authentication, handles proxying requests to AI services, and manages user data with PostgreSQL.

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [pnpm](https://pnpm.io/) (v8+)
- [Rust](https://www.rust-lang.org/) (stable)
- [Tauri prerequisites](https://tauri.app/v1/guides/getting-started/prerequisites)

### Installation

Install dependencies for all packages:

```bash
pnpm install -r
```

### Development

#### Option 1: Running Components Individually

Run the core web application:

```bash
cd core
pnpm dev
```

Run the server (required for desktop app):

```bash
cd server
cargo run
```

Run the desktop application (requires server running):

```bash
cd desktop
pnpm tauri:dev
```

#### Option 2: Running the Full System

For the full desktop experience, you need to run both the server and desktop app:

1. First, set up environment variables:
   - Create a `.env` file in the `server` directory using `.env.example` as a template
   - Make sure to include the required API keys:
     - `OPENROUTER_API_KEY` - API key for OpenRouter (used for all AI model access)
     - `FIREBASE_API_KEY` and `FIREBASE_PROJECT_ID` - For authentication
     - `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` - For billing/subscription functionality

2. Start the server:
   ```bash
   cd server
   cargo run
   ```

3. In another terminal, start the desktop app:
   ```bash
   cd desktop
   pnpm tauri:dev
   ```

The desktop app will automatically connect to the server, which will handle authentication and proxy requests to the AI services.

## Running the Server with OpenRouter

The server now acts as a proxy for all AI requests using OpenRouter. To set this up:

1. Get an API key from [OpenRouter](https://openrouter.ai/)
2. Add `OPENROUTER_API_KEY=<your-key>` to your server's `.env` file
3. The server will automatically route all AI requests through OpenRouter's unified API
4. Usage data is tracked for each user in the `api_usage` table

## Desktop Login Flow

The desktop app now uses a simplified login flow:

1. User authenticates with Firebase (Google, GitHub, etc.)
2. The Firebase token is exchanged for a server JWT
3. The token is stored in the new `TokenManager` (not directly in Stronghold)
4. After successful login, the app fetches runtime configuration
5. The token is used for authenticating all server requests

This approach avoids Stronghold-dependent startup crashes and makes authentication more robust.

## Building

### Build the core web application:

```bash
cd core
pnpm build
```

### Build the desktop application:

```bash
cd desktop
pnpm tauri:build
```

### Build the server:

```bash
cd server
cargo build --release
```

## Architecture

The application follows a modular architecture:

1. The core web app contains all the UI components and business logic
2. The desktop app reuses the core app's components but provides native features through Tauri
3. The server provides authentication, billing, AI model proxying, and data persistence

### AI Integration Architecture

Vibe Manager uses a server-proxy architecture for all AI model access:

1. The desktop application communicates with the server through a `ServerProxyClient`
2. The server handles authentication, billing, and rate limiting
3. The server proxies all AI requests to OpenRouter, which provides access to various AI models
4. OpenRouter handles routing to the appropriate model provider (Anthropic, OpenAI, etc.)
5. Usage data and costs are tracked in the server's database for billing purposes
6. Models, pricing, and usage data are stored in dedicated database tables

## Remote Control Surface

This section documents the RPC methods and events available for remote control via DeviceLink.

### RPCs (Remote Procedure Calls)

The following RPC methods are available for controlling implementation plans remotely:

#### Plan Management
- `actions.createImplementationPlan` - Create a new implementation plan from a task description
- `actions.mergePlans` - Merge multiple implementation plans into one
- `plans.save` - Save changes to an implementation plan
- `plans.get` - Retrieve an implementation plan by ID (alias: `actions.readImplementationPlan`)
- `plans.list` - List all implementation plans (includes both `implementation_plan` and `implementation_plan_merge` types)

### Events

The following events are emitted and relayed via `device-link-event`:

#### Job Events (canonical names with `:` separator)
- `job:created` - Fired when a new job is created
- `job:deleted` - Fired when a job is deleted
- `job:status-changed` - Fired when job status changes
- `job:response-appended` - Fired when content is streamed/appended to job response
- `job:stream-progress` - Fired during streaming progress updates
- `job:finalized` - Fired when job is finalized
- `job:tokens-updated` - Fired when token counts are updated
- `job:cost-updated` - Fired when cost estimates are updated
- `job:error-details` - Fired when error details are available
- `job:metadata-updated` - Fired when job metadata changes

#### Plan-Specific Events
- `PlanCreated` - Emitted when a plan is created (includes `jobId`, `sessionId`, `projectDirectory`)
- `PlanModified` - Emitted when plan content is saved/updated (includes `jobId`)
- `PlanDeleted` - Emitted when a plan is deleted (includes `jobId`)

### DeviceLink Relay

All events are forwarded through the DeviceLink relay using the `device-link-event` wrapper:
```json
{
  "type": "event-name",
  "payload": { /* event data */ }
}
```

This enables real-time synchronization between desktop and mobile clients.

## License

Proprietary - All rights reserved

## Mobile Parity Reference

When porting features from desktop to mobile iOS, consult these desktop implementation files:

### Theme and Core UI Tokens
- `desktop/src/app/globals.css` - Colors (OKLCH), radii, animations
- `desktop/src/ui/button.tsx` - Button variants and sizes
- `desktop/src/ui/card.tsx` - Card spacing and borders

### Files Feature
- `desktop/src/app/components/generate-prompt/file-browser.tsx` - File browser layout
- `desktop/src/app/components/generate-prompt/_components/file-item.tsx` - File item rendering
- `desktop/src/app/components/generate-prompt/_hooks/use-file-selection.ts` - File selection logic

### Plans Feature
- `desktop/src/app/components/implementation-plans-panel/implementation-plans-panel.tsx` - Plans panel
- `desktop/src/app/components/implementation-plans-panel/_components/*.tsx` - Cards, modals

### Text Improvement
- `desktop/src/contexts/text-improvement/TextImprovementProvider.tsx` - Text improvement context
- `desktop/src/contexts/text-improvement/TextImprovementPopover.tsx` - Sparkles popover

### Jobs Monitoring
- `desktop/src/app/components/background-jobs-sidebar/*` - Job list, details, status badges

### External Folders/Scoping
- `desktop/src/app/components/generate-prompt/_components/external-folders-manager.tsx` - Folders UI
- `desktop/src-tauri/src/jobs/workflow_orchestrator/query_service.rs` - Root directories query