# Firebase Authentication Setup for Vibe Manager Desktop

This document provides step-by-step instructions for configuring Firebase Authentication with OAuth providers for the Vibe Manager desktop application.

## Overview of the Authentication Flow

The Vibe Manager desktop application uses Firebase Authentication with the `signInWithRedirect` method, implementing "Option 1" from Firebase's redirect best practices to avoid third-party cookie issues. This approach uses the app's own origin as the `authDomain` in Firebase configuration.

![Auth Flow Diagram](https://firebasestorage.googleapis.com/v0/b/firebase-docs.appspot.com/o/1702581687337.png?alt=media&token=08c5a23e-e5d7-4d06-94c7-5caefc2a5af1)

## Configuration Steps

### 1. Firebase Console Configuration

1. **Go to your Firebase Console**: https://console.firebase.google.com/
2. **Select your project** for Vibe Manager
3. **Navigate to Authentication > Settings > Authorized Domains**
4. **Add the following domains**:
   - `localhost` (usually added by default)
   - `localhost:1420` (for development)
   - `tauri.localhost` (for production)

> ⚠️ Note: The Firebase "Authorized Domains" section only accepts web origins (starting with HTTP or HTTPS), not custom URL schemes.

### 2. Configure OAuth Providers in Firebase

1. **Go to Authentication > Sign-in method**
2. **Enable** the providers you want to use (Google, GitHub, Microsoft, Apple, etc.)
3. For each provider, copy the generated **Client ID** and **Client Secret** (if applicable)

### 3. Configure OAuth Providers in their Respective Developer Consoles

#### Google OAuth Configuration

1. **Go to the Google Cloud Console**: https://console.cloud.google.com/
2. **Select your project** (the same one used with Firebase)
3. **Navigate to APIs & Services > Credentials**
4. **Edit the OAuth 2.0 Client ID** used by Firebase
5. **Add the following Authorized JavaScript Origins**:
   - `http://localhost:1420` (for development)
   - `https://tauri.localhost` (for production)
6. **Add the following Authorized Redirect URIs**:
   - `http://localhost:1420/__/auth/handler` (for development)
   - `https://tauri.localhost/__/auth/handler` (for production)
   - `vibe-manager://auth_callback` (for deep linking)

#### GitHub OAuth Configuration

1. **Go to GitHub Developer Settings**: https://github.com/settings/developers
2. **Select your OAuth App**
3. **Update the following settings**:
   - **Homepage URL**: Set to your app's homepage or `https://tauri.localhost`
   - **Authorization callback URLs**: Add all of these (one per line):
     - `http://localhost:1420/__/auth/handler` (for development)
     - `https://tauri.localhost/__/auth/handler` (for production)
     - `vibe-manager://auth_callback` (for deep linking)

#### Microsoft OAuth Configuration

1. **Go to the Microsoft Azure Portal**: https://portal.azure.com/
2. **Navigate to Azure Active Directory > App registrations**
3. **Select your application**
4. **Go to Authentication**
5. **Add the following Redirect URIs**:
   - **Web platform**:
     - `http://localhost:1420/__/auth/handler` (for development)
     - `https://tauri.localhost/__/auth/handler` (for production)
   - **Custom URI platform**:
     - `vibe-manager://auth_callback` (for deep linking)

#### Apple OAuth Configuration

1. **Go to the Apple Developer Portal**: https://developer.apple.com/
2. **Navigate to Certificates, Identifiers & Profiles > Identifiers**
3. **Select your App ID or create a new one**
4. **Enable Sign In with Apple**
5. **Go to Services > Sign In with Apple > Configure**
6. **Add Domains and Subdomains**:
   - `localhost` (for development)
   - `tauri.localhost` (for production)
7. **Add Return URLs**:
   - `http://localhost:1420/__/auth/handler` (for development)
   - `https://tauri.localhost/__/auth/handler` (for production)
   - `vibe-manager://auth_callback` (for deep linking)

## Environment Configuration

Ensure your environment files (.env) have the correct configuration:

### For Development (desktop/.env)

```
# Tauri development server URL - Critical for Firebase auth to work correctly
VITE_TAURI_DEV_SERVER_URL=http://localhost:1420
```

### For Production (desktop/src-tauri/.env)

```
# Production app origin - Used for Firebase authDomain in production mode
PRODUCTION_APP_ORIGIN=https://tauri.localhost
```

## How the Authentication Flow Works

1. User clicks "Sign in with Provider" (Google, GitHub, etc.) in the app
2. The app calls `signInWithRedirect` with the selected provider
3. User is redirected to the provider's sign-in page
4. After successful authentication, the provider redirects back to:
   - In browser environments: directly to the `/__/auth/handler` page
   - In Tauri desktop: to the `vibe-manager://auth_callback` with auth parameters
5. For Tauri desktop:
   - The deep link handler receives the URL
   - It parses the parameters and constructs a URL to the `authDomain`'s `/__/auth/handler` path
   - It navigates to this URL in the app's webview
6. Firebase's `getRedirectResult()` is called in the same origin context
7. The authentication process completes

## Secure Token Storage

JWTs are stored automatically in the operating system credential vault via the keyring crate.

The authentication flow has been streamlined to use a centralized secure token storage approach:

1. Frontend authentication via Firebase generates a Firebase ID token
2. Token is exchanged with the server for an application JWT
3. JWT is stored securely in the Rust backend using the OS native keyring
4. Frontend code accesses the token only via Tauri commands (`get_app_jwt` and `set_app_jwt`)

This approach eliminates duplicate token storage and provides secure credential storage using the operating system's built-in facilities.

## Troubleshooting

If you encounter authentication issues:

1. **Check Developer Console**: Look for errors related to:
   - Unauthorized domains
   - Redirect URI mismatches
   - CORS issues

2. **Verify OAuth Provider Configuration**:
   - Ensure all redirect URIs are correctly added
   - Check that origins match exactly (including http/https and any trailing slashes)

3. **Check App Configuration**:
   - Verify the `authDomain` in Firebase config matches your app's actual origin
   - Confirm deep linking is working by testing with a simple URL scheme

4. **Common Errors**:
   - `auth/unauthorized-domain`: Your app's origin is not in Firebase's authorized domains
   - `auth/web-storage-unsupported`: Browser is blocking third-party cookies/storage
   - `auth/operation-not-supported-in-this-environment`: Environment doesn't support the auth method

5. **Token Storage Issues**:
   - If authentication succeeds but your token isn't persisting between sessions, check OS keyring permissions
   - The application will automatically store credentials in the OS keyring (Keychain on macOS, Windows Credential Manager, etc.)
   - You can verify the token is stored correctly by checking the logs for successful keyring operations

For any persistent issues, check the [Firebase Authentication documentation](https://firebase.google.com/docs/auth) or open an issue in the Vibe Manager repository.