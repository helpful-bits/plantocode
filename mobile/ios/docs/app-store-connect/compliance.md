# Compliance – Export, Encryption, Tracking & Sign-in

This document covers regulatory and guideline compliance for App Store submission.

---

## 1. Export Compliance & Encryption

### Overview
Apple requires disclosure about encryption usage to comply with U.S. export regulations.

### Questionnaire Answers

**In App Store Connect → App Information → App Encryption:**

**Q: Does your app use encryption?**
**A: Yes** (uses standard ATS/TLS for network connections)

**Q: Is your app exempt from encryption documentation?**
**A: Yes** (standard mass-market encryption; no custom crypto)

### Exemption Details

Vibe Manager iOS qualifies for the **"Standard Encryption Exemption"** because:
- Uses only iOS-provided HTTPS/TLS (URLSession with ATS)
- No custom cryptographic algorithms
- No VPN/NEPacketTunnel provider
- No end-to-end encryption beyond standard TLS
- No non-Apple crypto libraries (OpenSSL, libsodium, etc.)

**Exemption Category:** App uses standard TLS for network communication only.

### If Your App Uses Additional Crypto

If you add any of the following, **revisit this section**:
- Custom crypto libraries (OpenSSL, libsodium, CryptoSwift, etc.)
- VPN functionality (NEPacketTunnelProvider)
- End-to-end encryption of user data (beyond TLS in transit)
- Encryption of local database with custom keys
- WebRTC with custom DTLS/SRTP implementation

**Action:** Complete the expanded export compliance questionnaire and potentially file CCATS documentation.

### References
- [Complying with Encryption Export Regulations](https://developer.apple.com/documentation/security/complying-with-encryption-export-regulations)
- [App Store Connect Help: Export Compliance](https://help.apple.com/app-store-connect/#/devc3f64248f)

---

## 2. Advertising Identifier (IDFA) & Tracking

### Overview
Apple requires disclosure if your app uses the Advertising Identifier (IDFA) or tracks users across apps/websites.

### Questionnaire Answers

**In App Store Connect → App Information → Privacy:**

**Q: Does your app use the Advertising Identifier (IDFA)?**
**A: No**

**Q: Does your app track users across apps and websites owned by other companies for advertising or data broker purposes?**
**A: No**

### App Tracking Transparency (ATT)

**Current Status:** Not required (we don't track)

**If You Add Tracking:**
- Must implement `ATTrackingManager.requestTrackingAuthorization()`
- Must update `Info.plist` with `NSUserTrackingUsageDescription`
- Must update App Privacy labels

### What Counts as "Tracking"?

**Tracking = Linking user data from your app with data from other companies' apps/websites/offline properties for:**
- Targeted advertising
- Advertising measurement
- Data broker purposes

**NOT Tracking:**
- Analytics confined to your own app
- Fraud prevention
- Security purposes
- Complying with legal obligations

### Third-Party SDK Tracking

**Action Required:**
Review all SDKs for tracking behavior:
- Firebase Analytics (with AdSupport) → May require ATT
- Facebook SDK → Requires ATT if used for ads
- Google AdMob → Requires ATT
- Amplitude, Mixpanel (standard configs) → Usually OK without ATT

**Check SDK privacy manifests** (required as of iOS 17+).

### References
- [User Privacy and Data Use](https://developer.apple.com/documentation/uikit/protecting_the_user_s_privacy)
- [App Tracking Transparency](https://developer.apple.com/documentation/apptrackingtransparency)

---

## 3. Sign In with Apple (Guideline 4.8)

### Overview
If your app uses third-party or social login services to set up or authenticate a primary account, you **must also offer Sign in with Apple** (or equivalent privacy-protective option).

### Guideline 4.8 Requirements

**From [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/) § 4.8:**

> "Apps that use a third-party or social login service (such as Facebook Login, Google Sign-In, Sign in with Twitter, Sign In with LinkedIn, Login with Amazon, or WeChat Login) to set up or authenticate the user's primary account with the app must also offer Sign in with Apple as an equivalent option."

**"Equivalent option"** means a login method that:
- Limits data collection to name and email address
- Allows users to keep their email address private
- Does not collect user interactions for advertising without consent

**Sign in with Apple satisfies all requirements.**

### Implementation Checklist

**If you use Google, GitHub, Facebook, or other OAuth:**

- [ ] Add Sign in with Apple button to login screen
- [ ] Position Sign in with Apple **above or equal to** other sign-in options (Apple's HIG)
- [ ] Use official Apple button styles (don't customize logo)
- [ ] Implement `AuthenticationServices` framework
- [ ] Handle relay email addresses (`privaterelay.appleid.com`)
- [ ] Test with multiple Apple IDs (not just your developer account)

**Code Reference:**
```swift
import AuthenticationServices

// Add ASAuthorizationAppleIDButton to your login view
// Handle ASAuthorizationControllerDelegate callbacks
```

### Exceptions to Sign in with Apple Requirement

**You do NOT need Sign in with Apple if:**
- Your app is education, enterprise, or business app requiring existing education/enterprise accounts
- Your app is a client for a specific third-party service (e.g., mail client for Gmail)
- Government/industry-backed citizen ID or electronic ID system
- Your app uses only its own proprietary account system (no third-party logins)

**Vibe Manager Status:**
- [ ] **Review:** Does Vibe Manager use Google/GitHub/other OAuth?
  - **YES** → Implement Sign in with Apple
  - **NO** (proprietary accounts only) → Not required

### Testing for Review

**Apple will test:**
1. Presence of Sign in with Apple button
2. Functionality of Sign in with Apple flow
3. That it creates the same account experience as other login methods

**Common Rejection Reasons:**
- Sign in with Apple button missing
- Button styled incorrectly or too small
- Button positioned below other sign-in options
- Flow doesn't work or crashes
- Creates different account type than Google/Facebook login

### References
- [App Review Guidelines § 4.8](https://developer.apple.com/app-store/review/guidelines/#sign-in-with-apple)
- [Human Interface Guidelines: Sign in with Apple](https://developer.apple.com/design/human-interface-guidelines/sign-in-with-apple)
- [AuthenticationServices Documentation](https://developer.apple.com/documentation/authenticationservices)

---

## 4. Remote Desktop Clients (Guideline 4.2.7)

### Overview
Apple has specific rules for apps that provide remote desktop functionality.

### Is Vibe Manager a "Remote Desktop Client"?

**NO** – Vibe Manager iOS is a **companion controller**, not a screen-mirroring client.

**Key Distinctions:**

| Remote Desktop Client | Vibe Manager iOS |
|----------------------|------------------|
| Mirrors desktop screen | Native iOS UI (SwiftUI) |
| Shows external store UI | No store UI shown |
| Displays desktop apps | Controls desktop app via commands |
| Full desktop interaction | Specific feature controls only |

**From Guideline 4.2.7:**
> "Remote Desktop Clients: If your remote desktop app acts as a mirror or remote access to a host device, it must comply with [...] the software must be owned and fully paid for by the user, or requires a subscription with authentication."

**Vibe Manager Compliance:**
- ✓ Does not mirror UI
- ✓ Does not expose external software stores
- ✓ Requires authentication (user owns the desktop software)
- ✓ All software (desktop Vibe Manager) is fully owned by the user

### Reviewer Clarification

**If asked, explain:**
> "Vibe Manager iOS is not a remote desktop client. It does not mirror or stream the desktop UI. Instead, it provides a native iOS interface to send commands to the Vibe Manager desktop app (create task, toggle file, etc.) and receive lightweight text responses (task status, terminal output text). All UI is native SwiftUI. The desktop app is separately installed and owned by the user."

### References
- [App Review Guidelines § 4.2.7](https://developer.apple.com/app-store/review/guidelines/#minimum-functionality)

---

## 5. Age Rating

### Recommended Answers

Complete the **Age Rating Questionnaire** in App Store Connect honestly:

**Common Questions:**
- **Violence / Realistic Violence:** None
- **Sexual Content / Nudity:** None
- **Profanity / Crude Humor:** None
- **Alcohol, Tobacco, Drugs:** None
- **Medical/Treatment Information:** No
- **Gambling / Contests:** No
- **Unrestricted Web Access:** No (app does not embed a web browser)
- **User Generated Content (UGC) viewable by others:** No
- **Location Services:** No (unless you add it)
- **Mature/Suggestive Themes:** None

**Expected Age Rating:** **4+** (or equivalent in your region)

### If You Add Features

**Features that change age rating:**
- Web browser view → May increase rating
- Social features / user chat → May require higher rating + moderation
- In-app purchases → Requires correct declarations
- Access to mature content (e.g., unfiltered terminal output with potential profanity) → May require rating increase

### References
- [App Store Connect Help: Age Ratings](https://developer.apple.com/help/app-store-connect/manage-app-information/set-an-app-age-rating)

---

## 6. Subscription / Monetization (if applicable)

### Current Status
**Free app / No IAP**

### If You Add In-App Purchases or Subscriptions

**Must comply with:**
- [App Store Guidelines § 3.1](https://developer.apple.com/app-store/review/guidelines/#in-app-purchase) (In-App Purchase)
- Display accurate subscription terms
- Implement restore purchases
- Handle subscription management via App Store
- No external payment links (per 3.1.1)

**Exceptions:**
- Reader apps (§ 3.1.3(a)) may link to external account management
- Business/enterprise apps may have different rules

### References
- [In-App Purchase Guidelines](https://developer.apple.com/app-store/review/guidelines/#payments)

---

## Summary Checklist

**For Vibe Manager iOS v1.0:**

- [x] Encryption: Standard TLS only → **Exempt**
- [x] IDFA: Not used → **No tracking**
- [ ] Sign in with Apple: **Required if using OAuth** (check your auth implementation)
- [x] Remote Desktop: **Not applicable** (companion controller, not screen mirror)
- [x] Age Rating: **4+** (no sensitive content)
- [x] IAP: **Not applicable** (free app)

---

**Last Updated:** 2025-10-13
**Review Before Submission:** Verify auth implementation and finalize Sign in with Apple decision.
