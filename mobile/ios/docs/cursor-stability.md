# Task Description Input Stability (iOS)

## Overview
The iOS mobile app implements cursor stability for the task description text field to prevent cursor jumps and ensure smooth, uninterrupted typing even when remote updates arrive from the desktop app or other sources.

## Architecture

### Two-Layer Defense System

The implementation mirrors the desktop app's approach, adapted for iOS/SwiftUI:

#### 1. Component-Level Protection (SelectableTextView)

**Location**: `VibeUI/Sources/VibeUI/Components/TaskInputView.swift`

The `SelectableTextView` coordinator tracks user interaction state:

- **Focus Tracking**: `isFocused` tracks when the UITextView has focus via `textViewDidBeginEditing`/`textViewDidEndEditing`
- **Typing Detection**: `isUserTyping` flag set on text changes, cleared after 200ms idle via timer
- **Edit Detection**: `isUserEditing` flag briefly set during text mutations

**Selection Preservation Logic**:
```swift
let shouldPreserveSelection = coordinator.isUserEditing || coordinator.isUserTyping || coordinator.isFocused
if !shouldPreserveSelection && (selectionChanged) {
    // Only update selection when user is NOT interacting
    uiView.selectedRange = newRange
}
```

Text updates are also gated:
```swift
if uiView.text != text && !coordinator.isUserEditing && !coordinator.isUserTyping {
    uiView.text = text  // Only update when safe
}
```

#### 2. Parent-Level Gating (SessionWorkspaceView)

**Location**: `VibeUI/Sources/VibeUI/SessionWorkspaceView.swift`

Remote task description updates from the desktop are intercepted and gated:

**Gating Logic**:
```swift
.onReceive(container.sessionService.$currentSession) { updatedSession in
    // Check if text field is currently focused
    let isTextFieldFocused = activeElement is UITextView

    if isTextFieldFocused {
        // Queue update for later
        pendingRemoteTaskDescription = updatedTaskDesc
    } else {
        // Apply immediately
        taskText = updatedTaskDesc
    }
}
```

**Flush on Keyboard Dismiss**:
```swift
.onReceive(NotificationCenter.keyboardWillHideNotification) { _ in
    // Apply pending updates when keyboard closes
    if let pending = pendingRemoteTaskDescription {
        taskText = pending
        pendingRemoteTaskDescription = nil
    }
}
```

### Performance Characteristics

- **Typing Idle Threshold**: 200ms (matches desktop for consistency)
- **Remote Update Sources**: Desktop sync, session switches, undo/redo operations
- **Zero Input Latency**: Updates to local state are immediate; only remote updates are gated

## Comparison with Desktop

| Feature | Desktop (React/TypeScript) | iOS (SwiftUI) |
|---------|---------------------------|---------------|
| Component tracking | useRef + selectionchange listener | Coordinator properties + delegates |
| Typing detection | 200ms idle timer | 200ms idle timer |
| Parent gating | useEffect with gate logic | .onReceive with gate logic |
| Flush trigger | onBlur + idle | Keyboard dismiss + idle |
| Selection API | setSelectionRange + rAF | UITextView.selectedRange |

Both implementations provide equivalent protection using platform-native patterns.

## Background Update Sources

All remote updates that may modify `taskDescription` are routed through the gate:

| Source | Method | Flow |
|--------|--------|------|
| Desktop sync | Combine publisher `$currentSession` | → Gate → Apply or queue |
| Session switch | `onChange(of: currentSession?.id)` | → Clear queue, apply immediately |
| Undo/redo operations | `TaskInputView` local | → Direct update (user-initiated) |
| Voice transcription | `TaskInputView` local | → Direct update (user-initiated) |

## Troubleshooting

### Cursor Still Jumps
- Verify the text field is a `SelectableTextView` (not plain SwiftUI TextField)
- Check that `isUserTyping` timer is firing (200ms delay)
- Ensure keyboard notifications are firing for flush logic

### Updates Not Appearing
- Pending update may be queued; dismiss keyboard to flush
- Check `pendingRemoteTaskDescription` is being set
- Verify session IDs match between update source and current session

### Memory Leaks
- `typingIdleTimer` should be invalidated in `deinit`
- Weak self captures in all closures and timers

## Future Enhancements

- **OPEN-1**: Add dev-only latency instrumentation (key→frame measurement)
- **OPEN-2**: Consider more granular focus detection beyond keyboard visibility
- **OPEN-3**: Explore cursor position preservation across view reloads
