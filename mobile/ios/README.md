# Vibe Manager iOS

## Setup Instructions

1) Open `mobile/ios/VibeManager.xcodeproj` in Xcode.
   - Select the VibeManager target → Signing & Capabilities → choose your Apple Developer Team.
   - Bundle Identifier is preset to `com.vibemanager.mobile`; adjust only if your team requires it.

2) Resolve local Swift packages when prompted (Core, UI, Features).
   - They live in `mobile/Core`, `mobile/UI`, and `mobile/Features` and are referenced automatically.
   - If resolution stalls, open File → Packages → Reset Package Caches, then Resolve Package Versions.

3) The app uses a SwiftUI-first setup with a modern launch configuration (no storyboard).
   - Launch appearance comes from `UILaunchScreen` in `ios/App/Info.plist` and color assets in `ios/App/Assets.xcassets`.

4) Configure Auth0 settings in `ios/App/Info.plist` (see Auth0 Configuration section below).

5) Update the simulator or device run destination and press Run.
   - Tap "Sign In", complete the Auth0 flow, and you should land on the SessionWorkspaceView screen.

For architectural context see `NORMALIZATION_NOTES.md`.

## Auth0 Configuration

Configure these keys in `ios/App/Info.plist`:

### Required Info.plist Keys

- **AUTH0_DOMAIN**: Your Auth0 tenant domain (e.g., `your-tenant.auth0.com`)
- **AUTH0_NATIVE_CLIENT_ID**: Auth0 Native Application client ID for mobile
- **AUTH0_API_AUDIENCE**: API audience identifier (e.g., `https://vibemanager.app`)

### Desktop Environment Mapping

The iOS Info.plist keys correspond to these desktop environment variables:

| iOS Info.plist Key | Desktop Environment Variable | Purpose |
|-------------------|------------------------------|---------|
| `AUTH0_DOMAIN` | `AUTH0_DOMAIN` | Auth0 tenant domain |
| `AUTH0_NATIVE_CLIENT_ID` | `AUTH0_NATIVE_CLIENT_ID` | Native app client ID |
| `AUTH0_API_AUDIENCE` | `AUTH0_API_AUDIENCE` | API audience for token validation |

### Environment Configuration

Update `ios/App/Info.plist` with your Auth0 settings:

```xml
<key>AUTH0_DOMAIN</key>
<string>your-tenant.auth0.com</string>
<key>AUTH0_NATIVE_CLIENT_ID</key>
<string>your_auth0_native_client_id</string>
<key>AUTH0_API_AUDIENCE</key>
<string>https://api.vibemanager.app</string>
```

These values are read by `Core/Sources/Core/Config.swift` at runtime.

## Region Selection

### SQLite Persistence

Region settings are persisted using `RegionSettingsRepository` with SQLite storage:

- **Database Location**: `~/Library/Application Support/settings.db`
- **Table**: `region_settings` with columns: `id`, `region`, `base_url`, `updated_at`
- **Active Record**: Single row with `id = "active"` stores current region

### Supported Regions

| Region | Base URL | Description |
|--------|----------|-------------|
| United States | `https://api.us.vibemanager.app` | Default region |
| European Union | `https://api.eu.vibemanager.app` | EU data residency |

### Region Behavior

- **Default**: United States region (`https://api.us.vibemanager.app`)
- **API Impact**: All API endpoints use the selected region's base URL
- **Persistence**: Region selection survives app restarts and updates
- **Configuration**: Region affects `Config.serverURL` property dynamically

The `RegionSettingsRepository.shared.getActive()` method returns the current region settings, which are automatically used by the API client.

## Authentication Flow

### PKCE Flow with Auth0

1. **Initiation**: App generates PKCE challenge and opens web authentication session
2. **Authorization**: User authenticates via Auth0 web interface
3. **Polling**: App polls backend for authorization code completion
4. **Token Exchange**: Authorization code exchanged for JWT token
5. **Storage**: JWT stored securely in iOS Keychain

### Polling Mechanism

- **Endpoint**: `/auth0/poll-status?pid={pollingId}`
- **Interval**: 2 seconds
- **Timeout**: 60 attempts (2 minutes)
- **Status Codes**:
  - `204`: Authentication pending
  - `200`: Authentication complete with authorization code
  - Other: Error condition

### Token Management

- **Storage**: JWT tokens stored in iOS Keychain (`com.vibemanager.mobile.auth`)
- **Validation**: Tokens validated by fetching user info (`/api/auth/userinfo`)
- **Refresh**: Token refresh via `/api/auth0/refresh-app-token` endpoint
- **Expiry**: Invalid tokens cleared automatically

### Logout Flow

1. **Server Logout**: Call `/api/auth/logout` endpoint to invalidate server session
2. **Keychain Cleanup**: Remove JWT token from iOS Keychain
3. **State Reset**: Clear authentication state and user data
4. **Auth0 Session**: Auth0 web session cleared automatically

## Provider Support

The authentication system supports multiple identity providers through Auth0:

| Provider | Auth0 Connection | Description |
|----------|------------------|-------------|
| **Google** | `google-oauth2` | Google accounts |
| **GitHub** | `github` | GitHub accounts |
| **Microsoft** | `windowslive` | Microsoft/Azure accounts |
| **Apple** | `apple` | Apple ID (iOS native) |

All providers use the same PKCE flow and result in the same JWT token format.

## Implementation Details

### Key Classes

- **AuthService**: Manages authentication flow and token storage
- **RegionSettingsRepository**: Handles region persistence with SQLite
- **Config**: Provides configuration values from Info.plist and region settings
- **APIClient**: HTTP client that uses dynamic region-based URLs

### Security Features

- **PKCE**: Prevents authorization code interception attacks
- **CSRF Protection**: Validates CSRF tokens during authentication
- **Keychain Storage**: Secure token storage using iOS Keychain Services
- **Token Validation**: Regular validation of stored tokens

### Error Handling

- **Configuration Errors**: App crashes with clear error if Auth0 keys missing
- **Network Errors**: Graceful handling of network failures during auth
- **Token Expiry**: Automatic cleanup of expired tokens
- **Polling Timeout**: Clear feedback when authentication times out
