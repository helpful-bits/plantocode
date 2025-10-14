# Info.plist Permission Strings

This document contains all required `Info.plist` permission keys and usage descriptions for Vibe Manager iOS.

Apple requires clear, user-facing explanations for all privacy-sensitive permissions. These strings appear in system permission dialogs.

---

## Required Permissions

### 1. Local Network Access (Bonjour Discovery)

**Purpose:** Discover and connect to Vibe Manager desktop app on the local network.

**Keys to Add:**

```xml
<key>NSLocalNetworkUsageDescription</key>
<string>Vibe Manager uses your local network to discover and connect to the Vibe Manager app running on your Mac.</string>

<key>NSBonjourServices</key>
<array>
    <string>_vibemanager._tcp</string>
    <!-- Replace with your actual Bonjour service type -->
</array>
```

**Notes:**
- Required if you use `NWBrowser` or `NetService` for local discovery
- Must declare specific Bonjour service types in the array
- iOS 14+ requires explicit permission for local network access
- User sees: "Vibe Manager would like to find and connect to devices on your local network"

**References:**
- [NSLocalNetworkUsageDescription](https://developer.apple.com/documentation/bundleresources/information-property-list/nslocalnetworkusagedescription)
- [NSBonjourServices](https://developer.apple.com/documentation/bundleresources/information-property-list/nsbonjourservices)
- [TN3179: Understanding Local Network Privacy](https://developer.apple.com/documentation/technotes/tn3179-understanding-local-network-privacy)

---

### 2. Speech Recognition (Voice Dictation)

**Purpose:** Allow users to dictate task titles and notes.

**Keys to Add:**

```xml
<key>NSSpeechRecognitionUsageDescription</key>
<string>Dictate task titles and notes hands-free.</string>
```

**Notes:**
- Required if using `SFSpeechRecognizer` for on-device or server speech recognition
- User sees: "Vibe Manager would like to access Speech Recognition"
- Apple encourages on-device recognition (`requiresOnDeviceRecognition = true`)

**Implementation Note:**
```swift
import Speech

SFSpeechRecognizer.requestAuthorization { status in
    // Handle authorization
}
```

**References:**
- [NSSpeechRecognitionUsageDescription](https://developer.apple.com/documentation/bundleresources/information-property-list/nsspeechrecognitionusagedescription)
- [SFSpeechRecognizer](https://developer.apple.com/documentation/speech/sfspeechrecognizer)

---

### 3. Microphone Access (for Speech Recognition)

**Purpose:** Capture live audio for voice dictation.

**Keys to Add:**

```xml
<key>NSMicrophoneUsageDescription</key>
<string>Capture your voice to dictate tasks and notes.</string>
```

**Notes:**
- Required if speech recognition uses live audio input
- User sees: "Vibe Manager would like to access the Microphone"
- Only requested when user initiates dictation feature

**Implementation Note:**
```swift
import AVFoundation

AVAudioSession.sharedInstance().requestRecordPermission { granted in
    // Handle permission
}
```

**References:**
- [NSMicrophoneUsageDescription](https://developer.apple.com/documentation/bundleresources/information-property-list/nsmicrophoneusagedescription)
- [AVAudioSession](https://developer.apple.com/documentation/avfaudio/avaudiosession)

---

### 4. User Notifications (Push & Local)

**Purpose:** Notify users about task reminders, plan updates, and background sync status.

**Keys to Add:**

```xml
<key>NSUserNotificationsUsageDescription</key>
<string>Get reminders for tasks and planning steps.</string>
```

**Notes:**
- Optional: iOS shows a system permission dialog for notifications
- This key provides context if your app explains notification benefits
- Required for local and remote notifications

**Implementation Note:**
```swift
import UserNotifications

UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { granted, error in
    // Handle authorization
}
```

**References:**
- [UserNotifications Framework](https://developer.apple.com/documentation/usernotifications)
- [Local and Remote Notifications](https://developer.apple.com/documentation/usernotifications/asking-permission-to-use-notifications)

---

## Conditional Permissions (Only if Implemented)

### 5. Camera Access (Screenshot Support)

**Purpose:** Allow users to capture screenshots for support tickets.

**Keys to Add:**

```xml
<key>NSCameraUsageDescription</key>
<string>Take screenshots to send to support.</string>
```

**Notes:**
- Only add if you implement in-app screenshot/camera feature
- Most apps don't need this for basic screenshot sharing (users can use system screenshot)

---

### 6. Photo Library Access (Screenshot Uploads)

**Purpose:** Allow users to select screenshots from Photos to send to support.

**Keys to Add:**

```xml
<key>NSPhotoLibraryUsageDescription</key>
<string>Select screenshots to share with support.</string>

<!-- iOS 14+ limited photo access -->
<key>PHPhotoLibraryPreventAutomaticLimitedAccessAlert</key>
<true/>
```

**Notes:**
- Use `PHPickerViewController` instead of direct photo library access (no permission needed)
- Only add if you use `PHPhotoLibrary` directly

---

### 7. Location Services (Future Feature)

**Purpose:** Provide location-based reminders or context.

**Keys to Add:**

```xml
<key>NSLocationWhenInUseUsageDescription</key>
<string>Show location-based task reminders.</string>

<key>NSLocationAlwaysAndWhenInUseUsageDescription</key>
<string>Provide location context for tasks even when the app is in the background.</string>
```

**Notes:**
- **Not recommended** unless core to feature
- Increases privacy scrutiny in App Review
- Requires justification in App Privacy labels

---

### 8. Contacts Access (Team Features)

**Purpose:** Share tasks with contacts.

**Keys to Add:**

```xml
<key>NSContactsUsageDescription</key>
<string>Share tasks with your contacts.</string>
```

**Notes:**
- Only if you implement team/sharing features
- Requires disclosure in App Privacy

---

## App Transport Security (ATS)

**Purpose:** Ensure secure network connections.

**Default (recommended):**

```xml
<!-- No ATS exceptions needed for standard HTTPS -->
```

**If you need to connect to HTTP or non-standard TLS (NOT recommended):**

```xml
<key>NSAppTransportSecurity</key>
<dict>
    <key>NSExceptionDomains</key>
    <dict>
        <key>yourdomain.com</key>
        <dict>
            <key>NSExceptionAllowsInsecureHTTPLoads</key>
            <true/>
            <key>NSIncludesSubdomains</key>
            <true/>
        </dict>
    </dict>
</dict>
```

**Apple Requirement:**
- All connections must use HTTPS with TLS 1.2+
- ATS exceptions require justification in App Review

**References:**
- [App Transport Security](https://developer.apple.com/documentation/security/preventing-insecure-network-connections)

---

## Background Modes (if applicable)

**Purpose:** Keep connection alive, process notifications, or sync data in background.

**Add to Xcode:**
- Project → Target → Signing & Capabilities → + Capability → Background Modes

**Common Modes for Vibe Manager:**

```xml
<key>UIBackgroundModes</key>
<array>
    <string>remote-notification</string>  <!-- Push notifications -->
    <string>processing</string>           <!-- Background sync -->
    <string>fetch</string>                <!-- Periodic updates -->
</array>
```

**Notes:**
- Only enable modes you actually use
- Apple tests background behavior in review
- Excessive background activity can lead to rejection

**References:**
- [Background Execution](https://developer.apple.com/documentation/uikit/app_and_environment/scenes/preparing_your_ui_to_run_in_the_background)

---

## Complete Info.plist Example (Core Permissions)

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <!-- App Information -->
    <key>CFBundleDisplayName</key>
    <string>Vibe Manager</string>

    <key>CFBundleIdentifier</key>
    <string>com.vibemanager.ios</string>

    <key>CFBundleVersion</key>
    <string>1</string>

    <key>CFBundleShortVersionString</key>
    <string>1.0</string>

    <!-- Privacy Permissions -->
    <key>NSLocalNetworkUsageDescription</key>
    <string>Vibe Manager uses your local network to discover and connect to the Vibe Manager app running on your Mac.</string>

    <key>NSBonjourServices</key>
    <array>
        <string>_vibemanager._tcp</string>
    </array>

    <key>NSSpeechRecognitionUsageDescription</key>
    <string>Dictate task titles and notes hands-free.</string>

    <key>NSMicrophoneUsageDescription</key>
    <string>Capture your voice to dictate tasks and notes.</string>

    <key>NSUserNotificationsUsageDescription</key>
    <string>Get reminders for tasks and planning steps.</string>

    <!-- App Transport Security (default: secure only) -->
    <!-- No ATS exceptions needed -->

    <!-- Background Modes (if needed) -->
    <key>UIBackgroundModes</key>
    <array>
        <string>remote-notification</string>
    </array>
</dict>
</plist>
```

---

## Testing Permissions

### Before Submission Checklist

1. **Fresh Install Test:**
   - Delete app from device
   - Install from Xcode
   - Verify each permission prompt appears with correct text
   - Test "Don't Allow" → feature gracefully degrades
   - Test "Allow" → feature works correctly

2. **Settings → Privacy Test:**
   - Go to Settings → Privacy & Security
   - Verify each granted permission appears under correct category
   - Toggle permissions off → verify app handles denial gracefully

3. **Accessibility Test:**
   - Enable VoiceOver
   - Verify permission dialogs are read correctly

4. **Localization Test:**
   - If you support multiple languages, test permission strings in each locale

### Common Rejection Reasons

- **Missing usage description** → Instant rejection
- **Vague description** ("We need camera access") → Rejection or request for clarification
- **Requesting permission without feature** → Rejection (e.g., microphone access but no dictation feature)
- **Permission requested on launch** → Poor UX, potential rejection (request contextually instead)

### Best Practices

1. **Request Just-in-Time:**
   - Request microphone only when user taps dictate button
   - Request local network only when user taps "Connect"

2. **Explain Before Asking:**
   - Show custom UI explaining benefit before system dialog
   - Example: "Tap to dictate your task using voice" → then request mic

3. **Handle Denial Gracefully:**
   - Provide alternative (keyboard input if mic denied)
   - Show "Go to Settings" button if permission needed for core feature

4. **Audit Annually:**
   - Review permissions before each major release
   - Remove unused permissions

---

## Privacy Manifest (iOS 17+)

**New Requirement:** Apps must include a privacy manifest (`PrivacyInfo.xcprivacy`) declaring:
- APIs that access user data
- Third-party SDKs and their purposes
- Tracking domains (if any)

**Action Required:**
1. Create `PrivacyInfo.xcprivacy` in Xcode
2. Declare "Reasons API" usage (UserDefaults, file timestamps, etc.)
3. Declare all third-party SDKs

**References:**
- [Privacy Manifest Files](https://developer.apple.com/documentation/bundleresources/privacy_manifest_files)
- [Describing Use of Required Reason API](https://developer.apple.com/documentation/bundleresources/privacy_manifest_files/describing_use_of_required_reason_api)

---

## Summary

**Minimal Required Set (for Vibe Manager v1.0):**
- ✓ `NSLocalNetworkUsageDescription` + `NSBonjourServices`
- ✓ `NSSpeechRecognitionUsageDescription` (if using dictation)
- ✓ `NSMicrophoneUsageDescription` (if using dictation)
- ✓ `NSUserNotificationsUsageDescription` (if using notifications)

**Optional (add only if implemented):**
- Camera, Photos, Location, Contacts

**Always:**
- Use clear, user-facing language
- Match usage descriptions to actual features
- Test permission flows on real devices
- Update App Privacy labels to match

---

**Last Updated:** 2025-10-13
**Review Before Submission:** Verify all permissions match implemented features. Remove any unused permission keys.
