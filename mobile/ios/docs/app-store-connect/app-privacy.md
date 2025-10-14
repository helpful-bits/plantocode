# App Privacy – Data Collection Disclosure

This document outlines the data collection practices for Vibe Manager iOS app as required by Apple's App Privacy "nutrition labels."

## Overview

Vibe Manager for iOS collects minimal data necessary for account operation, security, and app reliability. **No file contents or terminal output from your Mac are uploaded or stored by the iOS app.**

## Privacy Stance Summary

```
Data used to track you: None

Data linked to you (for app functionality):
• Contact Info: Email address (account)
• Identifiers: User ID (account), Device ID (security/anti-abuse, trusted device list)
• Usage Data: Product interaction (analytics to improve reliability)
• Diagnostics: Crash data and performance data

Data not linked to you: Optional aggregated analytics

We do NOT collect: Financial info, contacts, photos, precise location, health data, or the contents of your files/terminal output. Those remain on the user's Mac and are not uploaded by the iOS app.
```

## Detailed Data Types (for App Store Connect)

### Data Used to Track You
**None** – We do not track users across apps and websites owned by other companies.

### Data Linked to You

#### 1. Contact Info
- **Email Address**
  - **Purpose:** Account registration and authentication
  - **Used for:** User account management, password reset, account recovery
  - **Not used for:** Marketing emails without consent, third-party advertising

#### 2. Identifiers
- **User ID**
  - **Purpose:** Account identification and session management
  - **Used for:** Associating user data with account, syncing across devices

- **Device ID**
  - **Purpose:** Security and fraud prevention
  - **Used for:** Maintaining trusted device list, detecting unauthorized access, anti-abuse measures
  - **Not used for:** Advertising or third-party tracking

#### 3. Usage Data
- **Product Interaction**
  - **Data collected:** Button taps, screen views, feature usage
  - **Purpose:** Analytics to understand feature usage and improve app reliability
  - **Storage:** Aggregated and anonymized where possible
  - **Not shared:** With advertisers or data brokers

**Examples:**
- Which screens are viewed most frequently
- Which features are used/unused
- User flow patterns (e.g., connection → tasks → terminal)

#### 4. Diagnostics
- **Crash Data**
  - **Data collected:** Stack traces, device model, OS version, app version
  - **Purpose:** Identify and fix crashes
  - **Tool:** Apple's crash reporting or similar privacy-respecting service

- **Performance Data**
  - **Data collected:** App launch time, screen load time, memory usage
  - **Purpose:** Optimize app performance
  - **No PII included:** Performance metrics are technical only

### Data Not Linked to You
- **Aggregated Analytics** (if implemented)
  - **Data:** Aggregate feature usage counts, aggregate session duration
  - **Cannot be linked:** To individual users
  - **Purpose:** High-level product decisions

### Data We Do NOT Collect

- **Financial Information** – No payment info collected in app
- **Contacts** – No access to address book
- **Photos/Videos** – No media library access (unless user explicitly shares screenshots for support)
- **Precise Location** – No GPS or location services
- **Health & Fitness** – No HealthKit data
- **Browsing History** – No web tracking
- **Search History** – Not tracked
- **Sensitive Info** – No government IDs, financial records, etc.

**File Contents & Terminal Output:**
Your files and terminal output remain on your Mac. The iOS app displays them but does not upload, store, or transmit this content to our servers or third parties.

## Third-Party SDK Disclosure

**IMPORTANT:** If you use any third-party SDKs for analytics, crash reporting, or authentication, you must disclose their data practices in App Store Connect.

### Common SDKs to Disclose (if used):
- **Firebase Analytics/Crashlytics** → Disclose usage data & diagnostics
- **Sentry** → Disclose crash data
- **Auth0 / Clerk / Supabase** → Disclose contact info & identifiers
- **Amplitude / Mixpanel** → Disclose usage data

**Action Required:**
1. Review all SDKs in your Podfile/SPM dependencies
2. Check each SDK's privacy policy
3. Update App Store Connect selections accordingly

## Age Rating Impact

Given the minimal data collection and no sensitive content:
- **Expected Age Rating:** 4+ (or equivalent)
- **No restrictions** for children's apps if age-gated properly

## GDPR / CCPA Compliance Notes

- **Right to Access:** Users can request data via support email
- **Right to Deletion:** Users can delete account via app settings or support request
- **Data Retention:** Account data retained until deletion; diagnostics retained per policy (e.g., 90 days)
- **Third-Party Sharing:** No data sold to third parties

## Privacy Policy

**URL:** `https://vibemanager.app/privacy`

**Must Include:**
- What data is collected (match this document)
- How data is used
- Third-party services (if any)
- User rights (access, deletion, export)
- Contact info for privacy questions

---

## App Store Connect Instructions

When filling out the App Privacy questionnaire:

### Section: Data Used to Track You
- **Does your app or third-party partners collect data to track users?** → **No**

### Section: Data Linked to You
Select these categories:

**Contact Info**
- ✓ Email Address → Account functionality

**Identifiers**
- ✓ User ID → Account functionality
- ✓ Device ID → App functionality (security/anti-abuse)

**Usage Data**
- ✓ Product Interaction → Analytics

**Diagnostics**
- ✓ Crash Data → App functionality
- ✓ Performance Data → App functionality

### Section: Data Not Linked to You
- Optional: Aggregated analytics (if implemented and truly not linkable)

### Section: Tracking Domains
- **Do you use the Advertising Identifier (IDFA)?** → **No**
- **Do you track users across apps/websites?** → **No**

---

**References:**
- [App Privacy Details on the App Store](https://developer.apple.com/app-store/app-privacy-details/)
- [User Privacy and Data Use](https://developer.apple.com/documentation/uikit/protecting_the_user_s_privacy)

---

**Last Updated:** 2025-10-13
**Review Before Submission:** Ensure all third-party SDKs are audited and disclosed.
