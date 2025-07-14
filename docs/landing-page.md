# Vibe Manager - AI-Powered Context Curation for Large Codebases

## A Desktop Tool for Finding Relevant Files in Complex Projects

Vibe Manager is an AI coding assistant that seamlessly integrates current internet knowledge with your codebase to create actionable implementation plans. It uses sophisticated multi-stage workflows to find relevant files, provides architecture-specific integration guidance, and enables multi-model plan generation with intelligent merging.

## The Problem We Solve

AI coding assistants often struggle with large codebases because:

- Token limits prevent including all relevant files
- Manual file selection is time-consuming and error-prone
- AI costs are unclear until after you've spent the money
- Generic prompts don't work well for specialized domains
- Outdated training data misses current APIs and best practices
- No connection between internet documentation and your actual code
- Single AI model perspective can miss important implementation details
- Unclear task descriptions lead to poor AI results

Vibe Manager addresses these issues through voice dictation, task refinement, automated file discovery, web research integration, multi-model plan generation, and transparent pricing.

## How It Works

### Task Input and Refinement

Clear, detailed task descriptions are crucial for successful implementation plans:

#### Voice Dictation
- Quickly capture thoughts using voice input
- Accurate transcription of technical terms
- Maintains natural flow of ideas
- Faster than typing for complex explanations

#### Text Improvement
- AI refines task descriptions for clarity
- Preserves your formatting and structure
- Removes redundancy while keeping all important details
- Maintains original language

The clearer your task description, the better the AI understands your needs and generates accurate implementation plans.

### Two Distinct Workflows

Vibe Manager provides two separate workflows for different purposes:

### 1. File Finder Workflow (4 Stages)

Analyzes your local codebase to find relevant files:

#### Stage 1: Regex File Filtering
- AI creates targeted pattern groups for specific functionality
- Each group focuses on one aspect (components, APIs, utilities)
- Uses path patterns, content patterns, and exclusions
- Groups combine with OR logic for comprehensive coverage

#### Stage 2: AI File Relevance Assessment
- AI reads actual file contents to verify relevance
- Prioritizes files requiring direct modification
- Identifies core files for understanding the task
- Returns only truly relevant files

#### Stage 3: Extended Path Finding
- Enhanced path finder for complex implementation tasks
- Considers dependencies, imports, and interconnected components
- Includes supporting utilities, types, and configurations
- Balances thoroughness with relevance

#### Stage 4: Path Correction
- Validates that all selected file paths exist
- Attempts to correct any invalid paths
- Removes any paths that cannot be resolved

### 2. Deep Research Workflow (2 Stages)

Seamlessly integrates internet knowledge with your codebase for actionable implementation:

#### Stage 1: Web Search Prompts Generation
- Analyzes task to detect NEW feature implementation vs EXISTING code modification
- For NEW features: Creates integration research prompts with your exact architecture
- For EXISTING code: Generates verification requests with actual code snippets
- Maximum 6 targeted prompts for most relevant integrations
- Includes your framework, language, and existing patterns in searches

#### Stage 2: Web Search Execution
- For NEW features: Complete integration guides with:
  - Installation commands for your architecture
  - Configuration setup and environment variables
  - Code placement following your patterns
  - Working examples that fit your codebase
- For EXISTING code: Verification results showing:
  - Whether current approach is correct
  - Better methods for your specific goal
  - Modern alternatives available
- Returns real URLs from actual searches

The Deep Research workflow transforms generic AI suggestions into precise, actionable plans by combining current internet knowledge with your actual code structure.

### 3. Implementation Plan Generation

Create comprehensive implementation plans that don't miss important details:

#### Single Model Plans
- BOLD EXPERT architect analyzes your entire codebase
- Produces XML-structured plans with specific file operations
- Includes exploration commands and bash commands
- No backward compatibility - uses modern approaches only

#### Multi-Model Plans
- Generate plans from multiple AI models simultaneously
- Each model brings different perspectives and strengths
- Compare approaches from o3, o4-mini, DeepSeek, and Gemini
- Different models may catch different architectural considerations

#### Plan Merging
- Deep analysis of all source plans to extract EVERY valuable insight
- Preserves ALL technical details from every plan
- Identifies gaps individual plans missed and adds them
- Creates a PERFECT merged plan that's better than any individual plan
- Optional custom merge instructions guide the synthesis

### Performance Characteristics

- Hierarchical filtering: Inexpensive regex first, then AI analysis
- Parallel processing: Up to 3 stages can run simultaneously
- Caching: File reads and directory structures are cached between stages
- Typical runtime: Most workflows complete within seconds to minutes depending on project size

## Parallel Execution - Power User Productivity

### Seamless Multitasking
Vibe Manager enables true parallel productivity - every feature can run simultaneously:

#### Parallel Workflows
- Run multiple File Finder workflows for different tasks
- Execute Deep Research while generating implementation plans
- Generate plans from multiple AI models simultaneously
- Process different projects or features in parallel

#### Non-Blocking Operations
- Start a workflow and immediately begin another
- UI remains responsive during all operations
- Background jobs run independently
- No waiting - always something productive to do

#### Productivity Benefits
- Power users can manage multiple features simultaneously
- Teams can work on different aspects concurrently
- Dramatically reduces overall development time
- Maximizes value from AI assistant time

## Customizable System Prompts

### Prompt Configuration

Vibe Manager allows customization of AI prompts at three levels:

#### 1. Server Defaults
- Pre-configured prompts for each workflow stage
- Configured for different AI models
- Updated based on performance data

#### 2. Project Overrides
- Customize prompts for specific projects
- Add domain-specific instructions
- Define coding standards and conventions

#### 3. Runtime Composition
- Dynamic content injection during execution
- Placeholders for file contents and context
- Model-specific adjustments

### Available Placeholders

Your prompts can include:
- {{project_context}}: Project-specific instructions
- {{file_contents}}: Selected file contents (no truncation)
- {{directory_tree}}: Complete project structure
- {{custom_instructions}}: User-defined requirements
- {{task_type}}: Current workflow stage
- {{current_date}}: For up-to-date searches

## Transparent Cost Tracking

### AI Usage Costs

Vibe Manager tracks and displays AI costs:

#### Server-Side Cost Calculation
- Costs calculated using current provider pricing
- Validated against provider-reported usage
- Tracks input, output, and cached tokens separately

#### Real-Time Cost Display
- Estimated costs shown during workflow execution
- Final costs updated after completion
- Per-stage breakdown available

#### Cost Protection
- Validation to prevent calculation errors
- Configurable spending limits
- Detailed usage history

#### Supported AI Models
- **OpenAI**: GPT-4.1, GPT-4.1 Mini, o3, o4-mini
- **Anthropic**: Claude 4 Sonnet, Claude 4 Opus, Claude 3.7 Sonnet
- **Google**: Gemini 2.5 Pro, Gemini 2.5 Flash
- **DeepSeek**: DeepSeek R1
- Unified cost tracking across all providers
- Provider-specific optimizations where available

## Built for Reliability and Performance

### Workflow Reliability
- Automatic recovery from interruptions
- Concurrent processing for efficiency
- Failure handling with retry options

### Privacy-First Architecture
- Files remain on your local machine
- Server only processes AI requests
- No code uploaded to external services
- Works offline for file browsing and session management
- Cross-platform: Windows, macOS, Linux

### Security Features
- OAuth 2.0 authentication (Google, GitHub, Microsoft, Apple)
- Built-in cost protection mechanisms
- Secure API communication

## Context Management - The Key to LLM Success

### Why Context Matters
- LLMs perform best with precise, relevant context
- Token limits mean every file must count
- Irrelevant files waste tokens and confuse AI
- The right context transforms generic suggestions into working code

### Persistent Context System
- **Session Persistence**: Complete work contexts saved locally
- **Quick Reuse**: Instantly reload previous file selections and task descriptions
- **History Tracking**: Access all past contexts for similar tasks
- **Incremental Refinement**: Build on previous selections without starting over

### Context Components Saved
- Selected files and their full contents
- Task descriptions and refinements
- Deep Research findings
- Directory structure snapshots
- Custom instructions and settings
- Previous implementation plans

### Efficiency Benefits
- **Instant Context Loading**: Resume work in seconds, not minutes
- **Context Reuse**: Apply successful contexts to similar tasks
- **Iterative Development**: Refine context across multiple sessions
- **Team Knowledge Sharing**: Export contexts for colleagues

## Developer Experience

### Session Management
- Save and restore complete work contexts
- Project-specific configurations
- Full history of file selections and tasks
- Export/import for team collaboration

### File Selection Interface
- Search and filter capabilities
- Batch selection operations
- AI-powered file discovery
- Visual status indicators

### Background Processing
- Non-blocking interface during workflows
- Real-time progress tracking
- Workflow cancellation support
- Error reporting with details

## Key Differentiators

### 1. Three Core Capabilities
File Finder (4 stages) for code analysis, Deep Research (2 stages) for web integration, and multi-model plan generation with merging.

### 2. Efficient Processing
Hierarchical filtering reduces costs by using inexpensive operations first.

### 3. Cost Transparency
Real-time cost tracking with server-validated billing and detailed token usage.

### 4. Customizable Prompts
Three-level prompt system allows project-specific configurations.

### 5. Local Privacy
Code stays on your machine - only AI requests go to external services.

### 6. Comprehensive Implementation Plans
Generate plans from multiple AI models and merge them to ensure nothing is missed. Each model contributes unique insights.

### 7. Context Persistence and Reuse
Complete work contexts saved locally with full history. Instantly reload previous selections and task descriptions for efficient iterative development.

### 8. True Parallel Execution
Every feature runs independently and simultaneously. Power users can execute multiple workflows, generate plans from different models, and process various tasks without waiting.

## Target Users

### Senior Developers
- Working with large, complex codebases
- Onboarding to unfamiliar projects
- Need accurate context for AI assistants
- Power users managing multiple features simultaneously

### Development Teams
- Using AI coding assistants regularly
- Facing token limit constraints
- Want to control AI costs
- Need consistent file selection
- Teams working on parallel features

### Organizations
- Require transparent cost tracking
- Need customizable workflows
- Want code to remain local
- Value reliable tooling
- Teams needing maximum productivity

## Supported Projects & Requirements

### Programming Languages & File Types
- All major programming languages supported
- Web technologies: HTML, CSS, JavaScript frameworks
- Configuration files: JSON, YAML, XML, TOML, etc.
- Documentation: Markdown and text files
- Excludes: Binary files, compiled code, node_modules, .git

### System Requirements
- Operating Systems: macOS, Windows, Linux
- Internet: Required for AI operations and authentication
- Storage: Local SQLite database for sessions

### Privacy & Security
- All code remains on your machine
- No file uploads to external servers
- Server only handles AI API requests
- Local session storage

### Usage Limitations
- Rate limit: 100 requests per minute
- Text files only (binaries excluded)
- Export via copy/paste to AI assistants

## Getting Started

### Installation
1. Download for your platform
2. Authenticate with OAuth 2.0 (Google, GitHub, Microsoft, Apple)
3. Select your project directory
4. Configure AI provider preferences

### First Workflow
1. Describe your task using:
   - Text input
   - Voice dictation for quick thought capture
   - AI text improvement to clarify and refine
2. (Optional) Run Deep Research to gather current implementation patterns
3. Run File Finder workflow to discover relevant files in your codebase
4. Monitor costs in real-time
5. Generate implementation plans:
   - Single plan from one AI model, OR
   - Multiple plans from different models (o3, o4-mini, DeepSeek, Gemini)
   - Merge multiple plans into one comprehensive plan
6. Review and use the implementation plan
7. View final cost summary

## Summary

Vibe Manager helps with AI-assisted development by:

- Finding relevant files through File Finder workflow
- Integrating current internet knowledge with your codebase through Deep Research
- Creating implementation plans from single or multiple AI models
- Merging multiple plans to ensure comprehensive coverage
- Running all features in parallel for maximum productivity
- Persisting and reusing context across sessions for efficiency
- Allowing customized prompts for specific domains
- Displaying costs during execution
- Keeping code on local machine

---

## Pricing

### Free Credits
- New users receive free credits (30-day expiration)
- Full access to all features
- All AI models available
- No feature restrictions

### Paid Credits
- Pay-as-you-go AI usage
- Processing fees on credit purchases:
  - Under $30: 20% fee
  - $30-$300: 10% fee
  - Over $300: 5% fee
- Auto top-off option available
- Purchase range: $0.01 to $10,000

### Enterprise
- Custom system prompts
- Admin controls
- Volume pricing available
- Contact for details

No subscriptions. No hidden fees. Pay only for AI usage.

---

[Download](#) | [Documentation](#) | [Contact](#)