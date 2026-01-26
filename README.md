# PlanToCode

**AI-powered coding assistant that transforms voice, video, and text descriptions into detailed implementation plans.**

[![License: BUSL-1.1](https://img.shields.io/badge/License-BUSL--1.1-blue.svg)](LICENSE)
[![Platform: macOS | Windows | iOS](https://img.shields.io/badge/Platform-macOS%20%7C%20Windows%20%7C%20iOS-lightgrey.svg)]()

---

### Download PlanToCode

<table>
<tr>
<td align="center" width="33%">
<a href="https://d2tyb0wucqqf48.cloudfront.net/desktop/mac/stable/latest.dmg">
<strong>macOS</strong><br/>
Download&nbsp;(.dmg)
</a>
</td>
<td align="center" width="33%">
<a href="https://apps.microsoft.com/store/detail/9PNF5PVHN5K8">
<strong>Windows</strong><br/>
Microsoft&nbsp;Store
</a>
</td>
<td align="center" width="33%">
<a href="https://apps.apple.com/app/plantocode-remote/id6752567525">
<strong>iOS</strong><br/>
App&nbsp;Store
</a>
</td>
</tr>
</table>

[plantocode.com](https://www.plantocode.com)

---

### About This Repository

This is the **complete source code** for PlanToCode - the same code that powers the official apps above.

**You are free to:**
- Download, build, and run PlanToCode from source
- Modify the code for personal use or internal company use
- Learn from the codebase and use it as a reference
- Self-host your own instance

**The one restriction:** You may not use this code to create a competing product or service. See the [Business Source License 1.1](./LICENSE) for details. Each version converts to Apache 2.0 four years after release.

**~263,000 lines of source code** across 5 components (source-only; excludes vendored/third-party and generated files):

| Component | Technology | Approx. LOC |
|-----------|------------|---------------|
| Desktop App | TypeScript + Rust (Tauri) | 124,000 |
| Backend Server | Rust (Actix-Web) | 49,000 |
| iOS App | Swift (SwiftUI) | 58,000 |
| Marketing Website | TypeScript (Next.js) | 26,000 |
| Infrastructure | Ansible + Bash | 5,000 |

_Line counts are approximate and based on source files (TS/TSX/RS/Swift/JS and infra YAML/Jinja/Bash), excluding vendor and generated output._

---

PlanToCode helps developers create **detailed architectural implementation plans** for coding agents. Describe your task naturally - speak it, record your screen, or type it - and get a structured plan with exact file operations, validation checkpoints, and context slices from your codebase.

## Why PlanToCode?

PlanToCode creates **detailed architectural implementation plans** designed for safe handoff to coding agents. Instead of generating code directly, it:

- **Isolates Work Scope**  -  Intelligently identifies relevant files from large codebases using multi-stage AI filtering
- **Creates Verifiable Context**  -  Builds a precise context slice with exact file contents and project structure
- **Architectural Focus**  -  Generates step-by-step plans detailing what changes to make in each file
- **Enables Safe Handoff**  -  Produces machine-readable plans with validation checkpoints for coding agents

### Input Methods
- **Voice Input**  -  Speak naturally - OpenAI's GPT-4o auto-detects language and applies intelligent corrections
- **Screen Recording**  -  Record your screen with AI-powered video analysis to show exactly what you're working on
- **Rich Text Editor**  -  Write and refine your task description with persistent undo/redo history

### Additional Features
- **Model Flexibility**  -  Use Claude, GPT, Gemini, Grok, or other AI models
- **Cost Transparent**  -  See token usage and costs before and after generation

## Features

### Multi-Modal Input
- **Voice Recording**  -  OpenAI's GPT-4o transcription with automatic language detection and intelligent corrections
- **Screen Recording**  -  Capture screen areas with configurable frame rate and optional audio
- **Video Analysis**  -  Import existing videos or analyze recordings with AI vision models
- **Text Editor**  -  Full-featured editor with SQLite-persisted undo/redo history

### Implementation Planning
- **Architectural Plans**  -  File operations with exact paths, changes, and validation checkpoints
- **Intelligent File Discovery**  -  Multi-stage AI filtering to identify relevant files from large codebases
- **Plan Merging**  -  Synthesize multiple approaches into a superior consolidated strategy
- **Web Search Integration**  -  Incorporate web research findings into implementation plans
- **Coding Agent Ready**  -  Machine-readable XML format designed for handoff to coding agents

### Project Integration
- **File Browser**  -  Select relevant files to include as context
- **External Folders**  -  Include directories outside your project root
- **Session Management**  -  Organize work across multiple projects
- **Background Jobs**  -  Track multiple AI operations simultaneously

### Cross-Platform
- **Desktop**  -  Native apps for macOS and Windows (Tauri)
- **iOS Companion**  -  Remote control your desktop, dictate tasks, monitor jobs, and access terminal from anywhere
- **Real-time Sync**  -  Changes sync instantly between mobile and desktop via relay connections

## Project Structure

```
plantocode/
├── desktop/            # Desktop app (Tauri + React + TypeScript)
├── mobile/
│   └── ios/            # iOS app (Swift + SwiftUI)
├── server/             # Backend API (Rust + Actix-Web)
├── website/            # Marketing website (Next.js)
├── infrastructure/     # Deployment (Ansible) + ops scripts
└── docs/               # Documentation
```

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v18+
- [pnpm](https://pnpm.io/) v8+
- [Rust](https://www.rust-lang.org/) (stable)
- [Tauri prerequisites](https://tauri.app/v1/guides/getting-started/prerequisites)

### Quick Start

```bash
# Clone the repository
git clone https://github.com/helpful-bits/plantocode.git
cd plantocode

# Install dependencies
pnpm install
```

### Running the Server

The server handles authentication, AI proxying, and billing.

```bash
cd server
cp .env.example .env    # Configure your environment
cargo run
```

**Required environment variables (server startup):**

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `SERVER_AUTH0_CALLBACK_URL` | Auth0 callback URL for the server |
| `SERVER_AUTH0_LOGGED_OUT_URL` | Auth0 logged-out redirect URL |
| `AUTH0_DOMAIN` | Auth0 tenant domain |
| `AUTH0_API_AUDIENCE` | Auth0 API identifier |
| `JWT_SECRET` | JWT signing secret (min 32 chars) |
| `API_KEY_HASH_SECRET` | API key hash secret (min 32 chars) |
| `FEATUREBASE_SSO_SECRET` | Featurebase SSO signing secret |
| `REFRESH_TOKEN_ENCRYPTION_KEY` | Refresh token encryption key (hex, min 32 chars) |
| `REDIS_URL` | Redis connection for rate limiting |
| `STRIPE_SECRET_KEY` | Stripe secret key |
| `STRIPE_PUBLISHABLE_KEY` | Stripe publishable key |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook secret |
| `STRIPE_CHECKOUT_SUCCESS_URL` | Stripe checkout success redirect |
| `STRIPE_CHECKOUT_CANCEL_URL` | Stripe checkout cancel redirect |
| `STRIPE_PORTAL_RETURN_URL` | Stripe billing portal return URL |
| `WEBSITE_BASE_URL` | Base URL for the website |
| `CDN_BASE_URL` | Base URL for CDN assets |

**Optional / feature-specific:**

| Variable | Description |
|----------|-------------|
| `OPENAI_API_KEY` | OpenAI access (required for OpenAI models + transcription) |
| `ANTHROPIC_API_KEY` | Anthropic Claude API access |
| `GOOGLE_API_KEYS` | Google Gemini API access (comma-separated list) |
| `XAI_API_KEY` | xAI Grok API access |
| `OPENROUTER_API_KEY` | OpenRouter access (fallback + additional models) |
| `AUTH0_SERVER_CLIENT_ID` | Auth0 M2M client ID (server-side refresh flow) |
| `AUTH0_SERVER_CLIENT_SECRET` | Auth0 M2M client secret (server-side refresh flow) |

See `server/.env.example` for the full list and defaults.

### Running the Desktop App

```bash
cd desktop
pnpm tauri:dev
```

### Running the Website

```bash
cd website
pnpm dev
```

## Building for Production

### Desktop App

```bash
cd desktop
pnpm tauri:build
```

Outputs platform-specific installers in `desktop/src-tauri/target/release/bundle/`.

### Server

```bash
cd server
cargo build --release
```

### Website

```bash
cd website
pnpm build
```

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                        Client Apps                           │
│  ┌─────────────┐     ┌─────────────┐                         │
│  │   Desktop   │     │     iOS     │      ┌─────────────┐    │
│  │   (Tauri)   │     │   (Swift)   │      │   Website   │    │
│  └──────┬──────┘     └──────┬──────┘      │  (Next.js)  │    │
│         │                   │             │             │    │
│         └─────────┬─────────┘             └─────────────┘    │
└───────────────────┼──────────────────────────────────────────┘
                    │
         ┌──────────┼──────────┐
         ▼                     ▼
   ┌───────────┐        ┌─────────────┐
   │   Auth0   │        │   Server    │
   │   (Auth)  │◄──────►│   (Rust)    │
   └───────────┘        └──────┬──────┘
                               │
         ┌─────────────────────┼─────────────────────┐
         ▼                     ▼                     ▼
   ┌───────────┐        ┌───────────┐         ┌───────────┐
   │    AI     │        │ PostgreSQL│         │  Stripe   │
   │ Providers │        │   Redis   │         │ (Billing) │
   └───────────┘        └───────────┘         └───────────┘
```

### Server Capabilities

- **Authentication**  -  Auth0 with OAuth (Google, GitHub, Microsoft, Apple)
- **AI Proxying**  -  Routes requests directly to AI provider APIs (Anthropic, OpenAI, Google, xAI)
- **Billing**  -  Stripe integration with usage-based pricing
- **Rate Limiting**  -  Redis-backed protection against abuse
- **Multi-Region**  -  Deploy to US and EU for data residency

### Supported AI Models

PlanToCode connects directly to AI providers for optimal performance and reliability:
- **Anthropic** - Claude models
- **OpenAI** - GPT and reasoning models
- **Google** - Gemini models
- **xAI** - Grok models

[OpenRouter](https://openrouter.ai/) is available as a fallback and for additional model access.

## Self-Hosting

PlanToCode can be self-hosted using the included Ansible playbooks.

```bash
cd infrastructure/ansible

# Configure your inventory
cp inventory/hosts.yml.example inventory/hosts.yml

# Set up secrets
cp group_vars/all/secrets.yml.example group_vars/all/secrets.yml
ansible-vault encrypt group_vars/all/secrets.yml

# Deploy
ansible-playbook -i inventory/hosts.yml site.yml
```

See [infrastructure/README.md](./infrastructure/README.md) for detailed deployment guides.

## Tech Stack

| Component | Technology |
|-----------|------------|
| Desktop | Tauri 2.x, React 19, TypeScript, Vite |
| Mobile | Swift, SwiftUI, iOS 16.0+ |
| Server | Rust, Actix-Web, SQLx |
| Database | PostgreSQL, Redis |
| Auth | Auth0 (PKCE OAuth) |
| Payments | Stripe |
| AI | Direct provider APIs (Anthropic, OpenAI, Google, xAI) |
| Infrastructure | Ansible, systemd |

## What You Can Learn

This repository is a comprehensive example of building a modern, production-ready SaaS application. Whether you're learning or building something similar, you'll find real-world implementations of:

### Desktop Development (Tauri + React)
- Building cross-platform desktop apps with Tauri 2.x
- React 19 with TypeScript and Vite
- Native system integration (file system, screen recording, audio capture)
- SQLite for local data persistence (sessions, undo/redo history, settings)
- IPC communication between Rust backend and React frontend

### Mobile Development (Swift + SwiftUI)
- Native iOS companion app with SwiftUI
- WebSocket relay connections to desktop devices
- Remote terminal via PTY over RPC
- Voice dictation with AVAudioEngine
- Push notifications for job completion
- Keychain integration for secure credential storage
- Auth0 PKCE authentication flow
- StoreKit 2 for in-app subscriptions

### Backend Development (Rust)
- Actix-Web REST API design
- SQLx for type-safe database queries
- Server-sent events (SSE) for streaming responses
- WebSocket connections for real-time features
- Repository pattern for data access
- Middleware for auth, rate limiting, and logging

### AI Integration
- Direct API integration with multiple providers (Anthropic, OpenAI, Google, xAI)
- Streaming AI responses to clients
- Token counting and cost estimation
- Vision model integration for video/image analysis
- Voice transcription pipelines

### Authentication & Security
- Auth0 integration with PKCE OAuth flow
- JWT token handling and refresh
- Rate limiting strategies (IP-based and user-based)
- Secure credential storage patterns

### Billing & Payments
- Stripe subscription and one-time payment integration
- Usage-based billing with token tracking
- Webhook handling for payment events
- Credit system implementation

### Infrastructure & DevOps
- Ansible playbooks for automated deployment
- Zero-downtime deployment strategies
- PostgreSQL and Redis configuration
- SSL/TLS with Let's Encrypt
- Multi-region deployment patterns

## License

This project is licensed under the [Business Source License 1.1](./LICENSE).

**What this means:**
- **Allowed**  -  Personal use, internal business use, education, testing, modification
- **Not Allowed**  -  Creating a competing product or service
- **Future**  -  Converts to Apache 2.0 four years after each version's release

For commercial licensing inquiries, contact [helpful bits GmbH](https://www.helpfulbits.com).

## Contributing

Contributions are welcome! Please:

1. Open an issue to discuss your proposed changes
2. Fork the repository
3. Create a feature branch
4. Submit a pull request

## Links

- **Website**  -  [plantocode.com](https://www.plantocode.com)
- **Issues**  -  [GitHub Issues](https://github.com/helpful-bits/plantocode/issues)
- **Documentation**  -  [docs/](./docs/)

---

Built with care by [helpful bits GmbH](https://www.helpfulbits.com)
