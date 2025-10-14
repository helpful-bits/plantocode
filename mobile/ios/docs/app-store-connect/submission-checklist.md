# App Store Submission Checklist

Complete this checklist before submitting Vibe Manager for iOS to App Review.

---

## Pre-Submission Checklist

### 1. App Store Connect Metadata

- [ ] **App name** entered (≤30 characters): "Vibe Manager"
- [ ] **Subtitle** entered (≤30 characters): "Control Vibe Manager remotely"
- [ ] **Description** pasted from `app-information.md` (≤4000 characters)
- [ ] **Keywords** entered (≤100 characters, comma-separated)
- [ ] **Primary category** selected: Productivity
- [ ] **Secondary category** selected (optional): Utilities
- [ ] **Screenshots** uploaded for all required device sizes:
  - [ ] 6.7" iPhone (iPhone 15 Pro Max, 14 Pro Max, etc.)
  - [ ] 6.5" iPhone (if supporting older devices)
  - [ ] 5.5" iPhone (if supporting older devices)
  - [ ] 12.9" iPad Pro (if supporting iPad)
  - [ ] 11" iPad Pro (if supporting iPad)
- [ ] **App Preview videos** uploaded (optional but recommended)
- [ ] **Promotional text** entered (≤170 characters, updateable without new build)
- [ ] **Support URL** entered: `https://vibemanager.app/support`
- [ ] **Marketing URL** entered (optional): `https://vibemanager.app`
- [ ] **Privacy Policy URL** verified live: `https://vibemanager.app/privacy`

### 2. App Review Information

- [ ] **Demo account** created with:
  - [ ] Username/email: `demo@vibemanager.app`
  - [ ] Password: `<DEMO_PASSWORD>` (stored securely)
  - [ ] Account **does not expire**
  - [ ] Account has full feature access
- [ ] **Review notes** pasted from `app-review-notes.md`
- [ ] **Demo environment** verified working:
  - [ ] Mac mini (or demo host) running Vibe Manager desktop
  - [ ] Seeded with sample data (tasks, files, plans, terminal output)
  - [ ] Network accessible 24/7
  - [ ] Connection tested from iOS Simulator and real device
- [ ] **Demo video** recorded (60-90 seconds) and link added to review notes
- [ ] **Contact information** provided:
  - [ ] Name
  - [ ] Phone number (monitored during review)
  - [ ] Email address (checked daily during review)

### 3. App Privacy (Data Collection)

- [ ] **App Privacy questionnaire** completed in App Store Connect
- [ ] **Data Used to Track You:** None selected
- [ ] **Data Linked to You:** Selected correctly:
  - [ ] Contact Info → Email Address
  - [ ] Identifiers → User ID, Device ID
  - [ ] Usage Data → Product Interaction
  - [ ] Diagnostics → Crash Data, Performance Data
- [ ] **Third-party SDK data practices** disclosed (if using Firebase, Sentry, etc.)
- [ ] **Privacy Policy URL** accessible and up-to-date
- [ ] Privacy labels match `app-privacy.md`

### 4. Age Rating

- [ ] **Age Rating questionnaire** completed honestly
- [ ] Confirmed answers:
  - [ ] Violence: None
  - [ ] Sexual Content: None
  - [ ] Profanity: None
  - [ ] Gambling: No
  - [ ] Unrestricted Web Access: No
  - [ ] User Generated Content: No
- [ ] Expected rating: **4+** (or equivalent)

### 5. Compliance

- [ ] **Export Compliance (Encryption)** questionnaire completed:
  - [ ] Uses encryption: Yes
  - [ ] Exempt from documentation: Yes (standard TLS only)
- [ ] **IDFA / Tracking:**
  - [ ] Does not use Advertising Identifier: Confirmed
  - [ ] Does not track users: Confirmed
- [ ] **Sign in with Apple** (if using third-party OAuth):
  - [ ] Button implemented and visible on login screen
  - [ ] Positioned above or equal to other sign-in options
  - [ ] Tested with multiple Apple IDs
  - [ ] Relay email addresses handled correctly
  - [ ] *(Skip if only using proprietary account system)*

### 6. Info.plist & Permissions

- [ ] **Permission strings** added from `info-plist-permissions.md`:
  - [ ] `NSLocalNetworkUsageDescription`
  - [ ] `NSBonjourServices` (with correct service type: `_vibemanager._tcp`)
  - [ ] `NSSpeechRecognitionUsageDescription` (if using dictation)
  - [ ] `NSMicrophoneUsageDescription` (if using dictation)
  - [ ] `NSUserNotificationsUsageDescription` (if using notifications)
- [ ] **No unused permissions** requested (remove any you don't use)
- [ ] **Permission prompts tested** on real device:
  - [ ] Appear at correct time (just-in-time, not on launch)
  - [ ] Show correct text
  - [ ] App handles "Don't Allow" gracefully
- [ ] **Privacy Manifest** (`PrivacyInfo.xcprivacy`) added for iOS 17+ (if required)
- [ ] **Background Modes** enabled only if needed (remote-notification, processing, etc.)

### 7. Build Quality

- [ ] **No crashes** on supported iOS versions (test on iOS 15, 16, 17, 18+)
- [ ] **No console errors** or warnings in Xcode
- [ ] **No placeholder text** ("Lorem ipsum", "TODO", etc.)
- [ ] **No test/debug code** left in production build
- [ ] **No hardcoded credentials** or API keys visible in code
- [ ] **Version number** and **build number** incremented correctly
  - [ ] Version: 1.0.0 (or `CFBundleShortVersionString`)
  - [ ] Build: 1 (or higher, `CFBundleVersion`)
- [ ] **Archive created** in Xcode successfully
- [ ] **Build validated** via Xcode Organizer (no errors)
- [ ] **Build uploaded** to App Store Connect
- [ ] **Build processing completed** in App Store Connect (wait for "Ready to Submit")

### 8. Device & OS Testing

- [ ] **iPhone testing:**
  - [ ] iPhone SE (small screen)
  - [ ] iPhone 13/14/15 (standard size)
  - [ ] iPhone 14 Pro Max / 15 Pro Max (large screen)
- [ ] **iPad testing (if supported):**
  - [ ] iPad (9th/10th gen)
  - [ ] iPad Pro 11"
  - [ ] iPad Pro 12.9"
- [ ] **iOS versions tested:**
  - [ ] Minimum supported version (e.g., iOS 15.0)
  - [ ] Latest stable iOS (e.g., iOS 18.1)
  - [ ] Beta iOS (optional, but good to check)
- [ ] **Orientation testing:**
  - [ ] Portrait
  - [ ] Landscape (if supported)
  - [ ] Rotation transitions smooth
- [ ] **Accessibility testing:**
  - [ ] VoiceOver enabled → all UI navigable
  - [ ] Dynamic Type → text scales correctly
  - [ ] Dark Mode → UI renders correctly

### 9. Feature Testing (Real Device)

- [ ] **Sign-in flow:**
  - [ ] Email/password works
  - [ ] OAuth (Google/GitHub/etc.) works (if applicable)
  - [ ] Sign in with Apple works (if applicable)
  - [ ] Password reset flow works
  - [ ] Error messages clear and helpful
- [ ] **Connection:**
  - [ ] Discovers Mac via Bonjour
  - [ ] Connects via manual IP entry
  - [ ] Handles connection failure gracefully
  - [ ] Reconnects after network interruption
  - [ ] Disconnects cleanly
- [ ] **Task management:**
  - [ ] Create task
  - [ ] Edit task description
  - [ ] Reorder tasks (drag & drop)
  - [ ] Mark task status (pending/in progress/completed)
  - [ ] Delete task
  - [ ] Start/stop timer
- [ ] **File operations:**
  - [ ] View file list
  - [ ] Toggle file on/off
  - [ ] File status updates in real-time
- [ ] **Planning:**
  - [ ] Create implementation plan
  - [ ] Edit plan details
  - [ ] View plan steps
  - [ ] Mark steps complete
- [ ] **Voice dictation (if implemented):**
  - [ ] Microphone permission requested
  - [ ] Speech recognition permission requested
  - [ ] Dictation works for task titles
  - [ ] Dictation works for notes
  - [ ] Handles denial gracefully (fallback to keyboard)
- [ ] **Terminal output:**
  - [ ] Displays text from Mac
  - [ ] Scrolls smoothly
  - [ ] Handles long output (100+ lines)
  - [ ] Handles ANSI color codes (if applicable)
- [ ] **Settings:**
  - [ ] Connection settings editable
  - [ ] Account settings accessible
  - [ ] Logout works
  - [ ] Version number visible

### 10. Network & Performance

- [ ] **Local network (Wi-Fi):**
  - [ ] Discovers Mac within 5 seconds
  - [ ] Connection stable
  - [ ] Low latency (< 200ms)
- [ ] **Remote network (Internet):**
  - [ ] Connects via secure relay
  - [ ] Connection stable
  - [ ] Handles high latency gracefully
- [ ] **Offline behavior:**
  - [ ] Shows "Offline" status
  - [ ] Doesn't crash
  - [ ] Reconnects automatically when online
- [ ] **App launch time:**
  - [ ] Cold launch < 3 seconds
  - [ ] Warm launch < 1 second
- [ ] **Memory usage:**
  - [ ] No memory leaks (test with Instruments)
  - [ ] Handles memory warnings gracefully
- [ ] **Battery usage:**
  - [ ] No excessive drain (check with Xcode Energy Log)
  - [ ] Background activity minimal

### 11. Security

- [ ] **No sensitive data** in logs (run app, check Xcode console)
- [ ] **HTTPS only** (no HTTP connections, unless ATS exception justified)
- [ ] **Tokens stored securely** (Keychain, not UserDefaults)
- [ ] **Certificate pinning** (optional, if using custom backend)
- [ ] **No SQL injection** vulnerabilities (if using local SQLite)
- [ ] **Input validation** on all user input (task titles, notes, etc.)

### 12. Legal & Compliance

- [ ] **Terms of Service** accessible (if applicable)
- [ ] **Privacy Policy** accessible and accurate
- [ ] **Open Source Licenses** disclosed (if using OSS libraries)
- [ ] **Copyright notices** correct (© 2025 Vibe Manager)
- [ ] **No trademarked content** without permission (logos, brand names)
- [ ] **No offensive content** in sample data, screenshots, or code

### 13. App Store Assets

- [ ] **App Icon:**
  - [ ] 1024x1024 PNG (no alpha channel)
  - [ ] Uploaded to App Store Connect
  - [ ] Matches in-app icon
  - [ ] High quality, recognizable at small sizes
- [ ] **Screenshots:**
  - [ ] Show app in use (not just login screen)
  - [ ] No placeholder/lorem ipsum text
  - [ ] Text legible at thumbnail size
  - [ ] Accurate representation of app (no mockups of unimplemented features)
  - [ ] Localized (if supporting multiple languages)
- [ ] **App Preview Video (optional):**
  - [ ] 15-30 seconds
  - [ ] Shows key features
  - [ ] No voiceover or music required (subtitles recommended)
  - [ ] Accurate representation of app

### 14. Localization (if supporting multiple languages)

- [ ] **Languages selected** in App Store Connect
- [ ] **Metadata translated** (name, description, keywords, screenshots)
- [ ] **In-app strings translated** (all user-facing text)
- [ ] **Tested in each locale:**
  - [ ] UI layout doesn't break with longer text
  - [ ] Date/time formats correct
  - [ ] Currency formats correct (if applicable)

### 15. Final Submission Steps

- [ ] **Build selected** in App Store Connect (under "Build" section)
- [ ] **Release schedule** chosen:
  - [ ] Manual release (you control when app goes live after approval)
  - [ ] Automatic release (app goes live immediately after approval)
- [ ] **Phased release** enabled (optional, rolls out to 1% → 100% over 7 days)
- [ ] **Version information** filled:
  - [ ] Copyright: © 2025 Vibe Manager
  - [ ] What's New in This Version (release notes)
- [ ] **Pricing & availability:**
  - [ ] Free (or price tier selected)
  - [ ] Countries selected (all, or specific regions)
  - [ ] Pre-order disabled (or configured if using)
- [ ] **App Review Information:**
  - [ ] All fields completed (see section 2 above)
- [ ] **Version rights** confirmed:
  - [ ] Standard Apple EULA selected (or custom EULA uploaded)
- [ ] **Submit for Review** button clicked
- [ ] **Submission confirmation** email received from Apple

---

## Post-Submission Checklist

### During Review (1-3 days typically)

- [ ] **Monitor email** for App Review questions
- [ ] **Keep demo environment running** 24/7
- [ ] **Keep contact phone available**
- [ ] **Check App Store Connect** daily for status updates
- [ ] **Do not push** new builds unless reviewer requests changes

### If Rejected

- [ ] **Read rejection reason** carefully in Resolution Center
- [ ] **Reply in Resolution Center** (not email) if clarification needed
- [ ] **Fix issues** based on feedback
- [ ] **Test fixes** thoroughly on real devices
- [ ] **Increment build number** (e.g., 1 → 2)
- [ ] **Upload new build** to App Store Connect
- [ ] **Resubmit for review** with explanation of changes

### If Approved

- [ ] **Release app** (if manual release selected)
- [ ] **Verify app is live** on App Store
- [ ] **Test installation** from App Store (not TestFlight)
- [ ] **Monitor crash reports** in App Store Connect
- [ ] **Monitor user reviews** and respond professionally
- [ ] **Monitor support email** for user questions
- [ ] **Announce launch** (social media, website, email, etc.)
- [ ] **Update website** with App Store badge and link

---

## Common Rejection Reasons & How to Avoid

### 1. Guideline 2.1 – App Completeness
**Issue:** App crashes, missing features, placeholder content
**Fix:** Thorough testing on real devices, remove all TODOs, ensure demo works

### 2. Guideline 2.3 – Accurate Metadata
**Issue:** Screenshots show unimplemented features, description doesn't match app
**Fix:** Screenshots from actual app, accurate description

### 3. Guideline 4.2 – Minimum Functionality
**Issue:** App does very little, or is just a web wrapper
**Fix:** Native iOS UI, real functionality, not just a website in WebView

### 4. Guideline 4.8 – Sign in with Apple
**Issue:** Uses Google/Facebook login but doesn't offer Sign in with Apple
**Fix:** Add Sign in with Apple if using any third-party auth

### 5. Guideline 5.1.1 – Privacy
**Issue:** Missing permission descriptions, collecting data without disclosure
**Fix:** All Info.plist keys present, App Privacy labels accurate

### 6. Guideline 5.1.2 – Data Use and Sharing
**Issue:** Privacy Policy missing or doesn't match app behavior
**Fix:** Live Privacy Policy URL, matches App Privacy labels

---

## Quick Reference: Timeline

**Week 1-2: Prepare**
- Complete all development
- Write all metadata documents
- Create demo environment
- Record demo video

**Week 3: Test & Polish**
- Test on real devices (all sizes, iOS versions)
- Fix bugs
- Create screenshots
- Finalize Info.plist

**Week 4: Submit**
- Upload build to App Store Connect
- Complete this checklist
- Submit for review

**Week 5: Review & Release**
- Wait for review (1-3 days typical, up to 7 days possible)
- Respond to any questions
- Release app when approved

---

## Resources

**Official Apple Docs:**
- [App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [App Store Connect Help](https://developer.apple.com/help/app-store-connect/)
- [Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/)
- [App Review Process](https://developer.apple.com/distribute/app-review/)

**Internal Docs:**
- `app-information.md` – Metadata text
- `app-review-notes.md` – Reviewer instructions
- `app-privacy.md` – Privacy disclosures
- `compliance.md` – Encryption, tracking, Sign in with Apple
- `info-plist-permissions.md` – Permission strings

**Support:**
- App Review questions: Use Resolution Center in App Store Connect
- Technical issues: https://developer.apple.com/support/
- General questions: https://forums.developer.apple.com/

---

**Last Updated:** 2025-10-13
**Version:** 1.0 (Initial submission)

---

## Sign-Off

**Prepared by:** ___________________________
**Reviewed by:** ___________________________
**Date:** ___________________________

**Ready for submission:** [ ] Yes [ ] No
**Submission date:** ___________________________
**App Store Connect submission ID:** ___________________________
