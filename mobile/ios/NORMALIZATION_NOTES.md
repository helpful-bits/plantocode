- Native SwiftUI app with SPM modules (Core, UI, Features) stored beside iOS assets under `mobile/`
- App target files stored in `mobile/ios/App`
- Launch screen defined via Info.plist `UILaunchScreen` + color asset (no storyboard)
- Auth0 Swift SDK + KeychainAccess in Core
- Auth callback scheme uses bundle id: com.vibemanager.mobile
- Minimal entitlements for first draft
- Prebuilt `mobile/ios/VibeManager.xcodeproj` links local packages

## Implementation Status

### Remote connection setup
- **Status: COMPLETE** - Relay-first implemented via ServerRelayClient
- WebSocket events implemented in EventSourceClient with proper gating via serverRelayOnly flag
- SSL certificate pinning implemented in CertificatePinning.swift with SPKI validation
- Authorization headers and X-Client-ID properly configured for all requests
- Connection is explicit via start() method, no auto-connect in initialization

### File management
- **Status: COMPLETE** - Deep file search and research capabilities implemented
- FilesDataService provides comprehensive file operations (search, read, write, delete)
- FileManagementView implements full UI parity with desktop version
- Search functionality with regex patterns and file type filtering
- Real-time file watching and synchronization capabilities

### Implementation plans
- **Status: COMPLETE** - Full CRUD operations implemented
- PlansDataService handles all plan operations (list, get, save, delete)
- UI displays plan counts, navigation arrows, and multi-select functionality
- CodeEditor integrated and bound to PlansDataService for editing
- Plan synchronization via server relay events

### Terminal integration
- **Status: COMPLETE** - Remote-only execution model implemented
- TerminalDataService provides streaming output via ServerRelayClient
- Keyboard-safe input handling with proper escape sequences
- Voice input integration for command entry and enhancement
- Real-time terminal output streaming and session management

### Voice dictation and text improvement
- **Status: COMPLETE** - Full speech services implemented
- SpeechTextServices handles transcription and text enhancement
- Info.plist permissions added: NSMicrophoneUsageDescription, NSSpeechRecognitionUsageDescription
- Voice input routed to server for processing and enhancement
- Integration with terminal and text input fields throughout app

### Technical implementation & parity
- **Status: COMPLETE** - All mobile features route to Tauri/desktop via server relay
- CommandRouter standardizes all RPC calls to backend services
- Feature parity achieved with desktop application functionality
- Consistent UI/UX patterns across file management, plans, and terminal

### Synchronization
- **Status: COMPLETE** - Real-time synchronization implemented
- Server relay events publisher provides instant updates
- WebSocket events properly gated and optional based on serverRelayOnly configuration
- Event filtering and processing for relevant data changes

### Push notifications
- **Status: COMPLETE** - iOS client registration implemented
- VibeManagerAppDelegate handles remote notification registration
- Server endpoint wired for push notification delivery
- Background mode configured for remote notifications

### Build errors resolved
- **Status: COMPLETE** - All critical build issues addressed
- SF Symbols usage standardized throughout UI components
- WebSocket connection spam eliminated with proper gating
- Required permissions added to Info.plist
- Keyboard constraint issues resolved in terminal and input views

### Server route/schema confirmations required
- All mobile endpoints (/api/mobile/*) implemented and tested
- WebSocket events endpoint (/ws/events) available and gated
- Push notification registration endpoint (/api/push/register) functional
- File operations endpoints support full CRUD operations
- Terminal session endpoints provide streaming capabilities
