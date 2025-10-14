# App Review Information

This document contains all information needed for the App Review team to test Vibe Manager for iOS.

## Sign-in Required

**Yes** – This app requires authentication.

## Demo Account

**IMPORTANT:** Demo credentials must not expire during review.

**Demo Account Credentials:**
- Username/Email: `demo@vibemanager.app`
- Password: `<DEMO_PASSWORD>`

**OAuth Providers (if applicable):**
- List any third-party sign-in methods enabled for the demo account
- If using Google/GitHub/etc., ensure **Sign in with Apple** is also available per Guideline 4.8

## Notes for Reviewers

```
This is a companion controller for the Vibe Manager desktop app. No desktop UI is streamed; the iOS app issues commands to the host Vibe Manager and receives lightweight status/terminal text.

**To review:**

1. Launch the app and sign in with the **demo account** above.
2. Tap **Connect** → **Demo Host**.
3. The app connects to our review-only Mac mini running Vibe Manager with a seeded SQLite workspace.
4. Try: create/edit tasks, toggle files, start/stop timers, dictate a note, and view terminal output.
5. No purchase or additional hardware required.

If you need a video walkthrough: <LINK TO 60-90s DEMO VIDEO>

We've ensured the demo account doesn't expire, and backend services are enabled during review. If anything is unclear or you prefer a TestFlight build with prefilled credentials, contact <YOUR EMAIL/PHONE>.
```

## Testing Steps for Reviewers

### 1. Initial Connection
- Launch app
- Sign in with demo credentials
- Select "Connect" → "Demo Host"
- Verify connection status shows "Connected"

### 2. Task Management
- Create a new task
- Edit task description
- Start/stop task timer
- Mark task status (pending/in progress/completed)
- Reorder tasks

### 3. File Operations
- View file list
- Toggle files on/off in working set
- Verify file status updates

### 4. Planning Features
- Access sprint planning board
- Create/edit implementation plans
- Review plan details

### 5. Voice Input (if microphone permission granted)
- Test dictation for task titles
- Test dictation for notes
- Verify transcription accuracy

### 6. Terminal Output
- View terminal output from Mac
- Verify text rendering (no UI streaming)
- Check scroll performance

### 7. Settings & Connection
- Review connection settings
- View device pairing status
- Test disconnect/reconnect

## Demo Environment Details

**Backend Services:**
- Review-only Mac mini with Vibe Manager desktop app
- Seeded SQLite workspace with sample data
- Available 24/7 during review period
- Monitored for uptime

**Sample Data Includes:**
- 10+ pre-configured tasks
- 5+ file toggles
- 2+ implementation plans
- Terminal output examples

## Video Walkthrough

**Demo Video URL:**
`<LINK TO 60-90s DEMO VIDEO>`

Video covers:
- Sign-in flow
- Connection process
- Key features walkthrough
- Common use cases

## Special Notes About Architecture

### Not a Remote Desktop Client
This app is a **companion controller**, not a screen-mirroring client. It does not present store-like UI for software purchase. Per Guideline 4.2.7, all software runs on the host Mac, UI is native iOS/SwiftUI, and no external stores are exposed.

### Data Flow
- Commands sent from iOS → Mac desktop app
- Lightweight status/text responses returned
- No file contents uploaded to cloud
- No UI streaming or screen capture

### Network Requirements
- LAN connection preferred
- Secure remote connection supported
- Uses standard TLS/HTTPS encryption
- Optional local network discovery (Bonjour)

## Contact for Review Issues

**Primary Contact:**
- Name: `<YOUR NAME>`
- Email: `<YOUR EMAIL>`
- Phone: `<YOUR PHONE>`

**Response Time:**
Within 24 hours during business days, faster during active review.

---

**Reference:** [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/) | [Distribute Your Apps](https://developer.apple.com/distribute/app-review/)
