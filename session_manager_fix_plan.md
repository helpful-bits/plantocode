# Plan to Fix "Maximum update depth exceeded" Error in SessionManager

## Problem

The application throws a "Maximum update depth exceeded" error, indicating an infinite render loop. The stack trace points to the `ScrollArea` component usage within `SessionManager` (`app/_components/generate-prompt/_components/session-manager.tsx`).

Analysis indicates the root cause is likely within `SessionManager`'s state management or effect handling, causing rapid re-renders, rather than an issue within the `ScrollArea` component itself.

## Investigation Findings

1.  **`ScrollArea` Component:** `components/ui/scroll-area.tsx` is a simple wrapper around Radix UI and does not contain complex state or effects likely to cause this issue.
2.  **`SessionManager` Component:** `app/_components/generate-prompt/_components/session-manager.tsx` manages session state, loads data, and uses several `useEffect` hooks.
3.  **Potential Cause 1: Unstable `useCallback` Dependency:**
    *   The `loadSessions` function (defined with `useCallback`) incorrectly includes `activeSessionId` in its dependency array: `[projectDirectory, outputFormat, repository, activeSessionId, onSessionStatusChange]`.
    *   Loading the *list* of sessions should not depend on the *currently active* session ID.
    *   Changing `activeSessionId` causes the `loadSessions` function reference to change.
    *   A `useEffect` hook depends on `loadSessions`.
    *   This chain reaction (`activeSessionId` change -> `loadSessions` change -> `useEffect` re-run -> potential state update triggering `activeSessionId` change) is the most likely cause of the infinite loop.
4.  **Potential Cause 2: Unstable Props:** Callback functions passed as props from the parent component (`GeneratePromptForm`) might not be memoized with `useCallback`, causing effects in `SessionManager` that depend on them to run on every parent render.

## Proposed Solution

1.  **Primary Fix (High Confidence):**
    *   **Action:** Modify the `useCallback` hook for the `loadSessions` function in `app/_components/generate-prompt/_components/session-manager.tsx`.
    *   **Change:** Remove `activeSessionId` from its dependency array.
    *   **File:** `app/_components/generate-prompt/_components/session-manager.tsx`
    *   **Line (approx):** ~99 (inside the `useCallback` dependency array for `loadSessions`)
    *   **Rationale:** This prevents the `loadSessions` function reference from changing unnecessarily when the active session changes, breaking the likely effect loop.

2.  **Secondary Check (If Primary Fix is Insufficient):**
    *   **Action:** Review the parent component, `GeneratePromptForm`.
    *   **File:** `app/_components/generate-prompt/generate-prompt-form.tsx`
    *   **Check:** Ensure all functions passed as props to `SessionManager` (e.g., `getCurrentSessionState`, `onLoadSession`, `setActiveSessionIdExternally`, `onSessionNameChange`, `onSessionStatusChange`) are wrapped in `React.useCallback` with appropriate dependency arrays.
    *   **Rationale:** Stabilizes props passed to `SessionManager`, preventing unnecessary re-runs of its `useEffect` hooks.

3.  **Code Simplification (Optional):**
    *   Refactor the dynamic `className` calculation for the `ScrollArea` in `SessionManager` using `React.useMemo` for better readability.
    *   Consider memoizing inline functions within the `sessions.map` inside `SessionManager` if performance profiling indicates it's necessary after the main loop is fixed.

## Next Steps

Implement the **Primary Fix** by editing `app/_components/generate-prompt/_components/session-manager.tsx` and removing `activeSessionId` from the `loadSessions` dependency array. Test the application to confirm the infinite loop is resolved. If the issue persists, proceed with the **Secondary Check**. 