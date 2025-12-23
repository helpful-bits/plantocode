# PlanToCode

**AI-powered coding assistant that transforms voice, video, and text descriptions into detailed implementation plans.**

[![License: BUSL-1.1](https://img.shields.io/badge/License-BUSL--1.1-blue.svg)](LICENSE)
[![Platform: macOS | Windows | Linux | iOS](https://img.shields.io/badge/Platform-macOS%20%7C%20Windows%20%7C%20Linux%20%7C%20iOS-lightgrey.svg)]()

---

### Download PlanToCode

<table>
<tr>
<td align="center" width="33%">
<a href="https://d2tyb0wucqqf48.cloudfront.net/desktop/mac/stable/latest.dmg">
<strong>macOS</strong><br/>
Direct Download (.dmg)
</a>
</td>
<td align="center" width="33%">
<a href="https://apps.microsoft.com/store/detail/9PNF5PVHN5K8">
<strong>Windows</strong><br/>
Microsoft Store
</a>
</td>
<td align="center" width="33%">
<a href="https://apps.apple.com/app/plantocode-remote/id6752567525">
<strong>iOS</strong><br/>
App Store
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

---

PlanToCode helps developers bridge the gap between *what they want to build* and *how to build it*. Describe your coding task naturally - speak it, record your screen, or type it - and get a detailed, step-by-step implementation plan powered by AI.

## Why PlanToCode?

Traditional AI coding assistants give you code snippets. PlanToCode gives you a **complete implementation strategy**:

- **Natural Input**  -  Describe tasks the way you think about them: voice recordings, screen captures, or text
- **Detailed Plans**  -  Get step-by-step instructions, not just code fragments
- **Context-Aware**  -  Analyzes your project structure and selected files
- **Model Flexibility**  -  Use Claude, GPT-4, Gemini, or 10+ other AI models
- **Cost Transparent**  -  See token usage and costs before and after generation

## Features

### Multi-Modal Input
- **Voice Recording**  -  Speak your task description with real-time transcription
- **Screen Recording**  -  Capture your screen to show what you're working on
- **Video Analysis**  -  AI vision models extract context from recordings
- **Text Input**  -  Traditional text description with AI-powered enhancement

### Implementation Planning
- **Step-by-Step Plans**  -  Detailed instructions organized by file and task
- **Terminal Commands**  -  Execute commands directly from your plan
- **Plan Merging**  -  Combine multiple approaches into one cohesive strategy
- **Web Search Integration**  -  Optionally include web research for up-to-date solutions

### Project Integration
- **File Browser**  -  Select relevant files to include as context
- **External Folders**  -  Include directories outside your project root
- **Session Management**  -  Organize work across multiple projects
- **Background Jobs**  -  Track multiple AI operations simultaneously

### Cross-Platform
- **Desktop**  -  Native apps for macOS, Windows, and Linux (Tauri)
- **iOS**  -  Native mobile app with full feature parity
- **Synced**  -  Real-time synchronization between devices

## Project Structure

```
plantocode/
├── desktop/            # Desktop app (Tauri + React + TypeScript)
├── mobile/             # iOS app (Swift + SwiftUI)
├── server/             # Backend API (Rust + Actix-Web)
├── website/            # Marketing site (Next.js)
├── infrastructure/     # Deployment automation (Ansible)
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
pnpm install -r
```

### Running the Server

The server handles authentication, AI proxying, and billing.

```bash
cd server
cp .env.example .env    # Configure your environment
cargo run
```

**Required environment variables:**
| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `OPENROUTER_API_KEY` | AI model access via [OpenRouter](https://openrouter.ai/) |
| `AUTH0_DOMAIN` | Auth0 tenant domain |
| `AUTH0_API_AUDIENCE` | Auth0 API identifier |
| `REDIS_URL` | Redis connection for rate limiting |

See `server/.env.example` for the complete list.

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
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Desktop   │     │     iOS     │     │   Website   │
│    (Tauri)  │     │   (Swift)   │     │  (Next.js)  │
└──────┬──────┘     └──────┬──────┘     └──────┬──────┘
       │                   │                   │
       └───────────────────┼───────────────────┘
                           │
                    ┌──────▼──────┐
                    │   Server    │
                    │   (Rust)    │
                    └──────┬──────┘
                           │
       ┌───────────────────┼───────────────────┐
       │                   │                   │
┌──────▼──────┐     ┌──────▼──────┐     ┌──────▼──────┐
│  OpenRouter │     │ PostgreSQL  │     │    Redis    │
│  (AI Models)│     │  (Database) │     │   (Cache)   │
└─────────────┘     └─────────────┘     └─────────────┘
```

### Server Capabilities

- **Authentication**  -  Auth0 with OAuth (Google, GitHub, Microsoft, Apple)
- **AI Proxying**  -  Routes requests to OpenRouter or direct provider APIs
- **Billing**  -  Stripe integration with usage-based pricing
- **Rate Limiting**  -  Redis-backed protection against abuse
- **Multi-Region**  -  Deploy to US and EU for data residency

### Supported AI Models

Via [OpenRouter](https://openrouter.ai/), PlanToCode supports:
- Anthropic Claude (3.5 Sonnet, 3 Opus, etc.)
- OpenAI GPT-4, GPT-4 Turbo, GPT-4o
- Google Gemini Pro, Gemini Flash
- And many more...

You can also configure direct API access for specific providers.

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
| Mobile | Swift, SwiftUI, iOS 15.4+ |
| Server | Rust, Actix-Web, SQLx |
| Database | PostgreSQL, Redis |
| Auth | Auth0 (PKCE OAuth) |
| Payments | Stripe |
| AI | OpenRouter, direct provider APIs |
| Infrastructure | Ansible, systemd |

## What You Can Learn

This repository is a comprehensive example of building a modern, production-ready SaaS application. Whether you're learning or building something similar, you'll find real-world implementations of:

### Desktop Development (Tauri + React)
- Building cross-platform desktop apps with Tauri 2.x
- React 19 with TypeScript and Vite
- Native system integration (file system, screen recording, audio capture)
- SQLite for local data persistence
- IPC communication between Rust backend and React frontend

### Mobile Development (Swift + SwiftUI)
- Native iOS app architecture with SwiftUI
- Keychain integration for secure credential storage
- Auth0 PKCE authentication flow
- Region-aware API client patterns

### Backend Development (Rust)
- Actix-Web REST API design
- SQLx for type-safe database queries
- Server-sent events (SSE) for streaming responses
- WebSocket connections for real-time features
- Repository pattern for data access
- Middleware for auth, rate limiting, and logging

### AI Integration
- OpenRouter API integration for multi-model support
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

For commercial licensing inquiries, contact [helpful bits GmbH](https://www.plantocode.com).

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

Built with care by [helpful bits GmbH](https://www.plantocode.com)
