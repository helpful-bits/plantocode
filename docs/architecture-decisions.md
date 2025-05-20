# Architecture Decisions

This document explains key architectural decisions in the Vibe Manager application.

## Directory Structure

The application follows a clear separation of concerns in its directory structure:

- `desktop/src/adapters/`: Bridge between UI and backend services, adhering to the adapter pattern
- `desktop/src/contexts/`: React context providers for global state management
- `desktop/src/actions/`: Server/desktop action handlers implementing command pattern
- `desktop/src/hooks/`: Reusable, global React hooks
- `desktop/src/app/`: Application components and feature-specific logic
- `desktop/src/utils/`: Utility functions and helpers

## SessionProvider Architecture

The `SessionProvider` in `desktop/src/contexts/session/Provider.tsx` employs a hooks-based composition pattern that balances complexity with maintainability.

### Rationale for Current Architecture

1. **Single Responsibility (as a Provider):** Despite internal complexity, the Provider's primary responsibility is singular: providing the `SessionContext` to its children.

2. **Effective Delegation to Specialized Hooks:** The complexity is managed through multiple focused hooks:
   - `useSessionState`: Manages raw state values
   - `useActiveSessionManager`: Handles active session ID tracking
   - `useSessionLoader`: Controls session loading logic
   - `useSessionActions`: Implements CRUD operations
   - `useAutoSessionLoader`: Manages automatic session loading

3. **Localized Complexity:** The circular dependency between `useSessionLoader` and `useSessionActions` is managed through a localized `sessionActionsRef` mechanism without leaking complexity.

4. **Maintainable Size:** The Provider itself isn't excessively long, and its complexity stems from orchestration rather than implementing business logic directly.

5. **Clear State Flow:** The unidirectional data flow remains clear despite the hook composition.

### Why Not Refactor Further?

While the SessionProvider orchestrates multiple hooks, drastic re-architecting could introduce more complexity than it solves:

1. **Increasing Indirection:** Adding additional layers could make the flow harder to follow
2. **Solution in Search of a Problem:** The current structure works effectively with no reported issues
3. **Risk vs. Reward:** Major changes risk introducing bugs for minimal benefits
4. **Maintainability Trade-offs:** More abstraction layers could make debugging more difficult

## Hook Refactoring Decisions

We've applied the following principles to the hooks architecture:

1. **Moved Generic Hooks to Global Scope:** Hooks like `use-async-state` and `use-textarea-resize` were moved from feature-specific directories to the global hooks directory for better reusability.

2. **Context Over Prop-Drilling:** We've refactored `GeneratePromptForm` to properly use the `FileManagementProvider` context, eliminating excessive prop-drilling.

3. **Focused State Hooks:** The `useGeneratePromptOrchestrator` responsibilities have been split into more focused hooks like `useGeneratePromptCoreState` and `useGeneratePromptTaskState`.

These changes enhance maintainability while preserving the existing architectural patterns that work well.