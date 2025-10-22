# App Store Connect Documentation

Complete submission guide for **PlanToCode for iOS** to the Apple App Store.

---

## Overview

This directory contains all documentation needed to submit PlanToCode iOS to App Store Connect for review. The documents are organized by App Store Connect sections and compliance requirements.

**App Type:** Companion controller for PlanToCode desktop app (macOS)
**Primary Function:** Remote control and management of development workflows
**Architecture:** Native iOS/SwiftUI app, no UI streaming/mirroring

---

## Document Index

### 1. [App Information](./app-information.md)
**Purpose:** All metadata for the App Store product page

**Contents:**
- App name, subtitle, description
- Keywords, categories
- URLs (support, marketing, privacy)
- Copyright and license info
- Screenshot guidance
- Release notes template

**Use this for:** Filling out the "App Information" section in App Store Connect

---

### 2. [App Review Notes](./app-review-notes.md)
**Purpose:** Instructions and credentials for App Review team

**Contents:**
- Demo account credentials (non-expiring)
- Step-by-step testing guide for reviewers
- Demo environment details
- Video walkthrough link placeholder
- Architecture clarification (companion vs remote desktop)
- Contact information for review issues

**Use this for:** Pasting into "App Review Information" → "Notes" field

---

### 3. [App Privacy](./app-privacy.md)
**Purpose:** Data collection disclosures (Apple's "nutrition labels")

**Contents:**
- Privacy stance summary
- Detailed data types collected
- What is linked vs not linked to users
- What is NOT collected
- Third-party SDK disclosure requirements
- GDPR/CCPA compliance notes
- App Store Connect questionnaire guidance

**Use this for:** Completing the "App Privacy" questionnaire in App Store Connect

---

### 4. [Compliance](./compliance.md)
**Purpose:** Regulatory and guideline compliance

**Contents:**
- **Export Compliance & Encryption** (standard TLS exemption)
- **IDFA / Tracking** (not used)
- **Sign in with Apple** (Guideline 4.8 requirements)
- **Remote Desktop Clients** (Guideline 4.2.7 clarification)
- **Age Rating** (expected 4+)
- **Subscription / Monetization** (if applicable)

**Use this for:** Completing compliance questionnaires, understanding special rules

---

### 5. [Info.plist Permissions](./info-plist-permissions.md)
**Purpose:** Required permission strings and usage descriptions

**Contents:**
- Local network access (Bonjour)
- Speech recognition & microphone (dictation)
- User notifications
- Conditional permissions (camera, photos, location, contacts)
- Complete Info.plist example
- Testing guidance
- Privacy Manifest requirements (iOS 17+)

**Use this for:** Adding required keys to `Info.plist` in Xcode

---

### 6. [Submission Checklist](./submission-checklist.md)
**Purpose:** Step-by-step pre-submission verification

**Contents:**
- 15-section comprehensive checklist
- App Store Connect metadata verification
- Build quality checks
- Device & OS testing matrix
- Feature testing (real device)
- Network & performance validation
- Security audit
- Legal & compliance verification
- Post-submission guidance
- Common rejection reasons & fixes

**Use this for:** Final verification before hitting "Submit for Review"

---

## Quick Start Guide

### First-Time Submission

**Step 1: Prepare Metadata (Week 1-2)**
1. Read [`app-information.md`](./app-information.md)
2. Customize placeholders (`<YOUR_EMAIL>`, `<DEMO_PASSWORD>`, etc.)
3. Verify all URLs are live (support, privacy policy, marketing)
4. Create demo account (non-expiring)
5. Set up demo Mac mini environment
6. Record 60-90s demo video

**Step 2: Configure App (Week 3)**
1. Read [`info-plist-permissions.md`](./info-plist-permissions.md)
2. Add required permission strings to `Info.plist`
3. Remove any unused permissions
4. Test permission prompts on real device
5. Add Privacy Manifest if targeting iOS 17+

**Step 3: Test Thoroughly (Week 3-4)**
1. Follow device testing matrix in [`submission-checklist.md`](./submission-checklist.md)
2. Test on iPhone SE, standard iPhone, Pro Max
3. Test on iPad (if supported)
4. Test all iOS versions (minimum to latest)
5. Run Accessibility audit (VoiceOver, Dynamic Type, Dark Mode)
6. Check for crashes, memory leaks, battery drain

**Step 4: Fill App Store Connect (Week 4)**
1. Log in to [App Store Connect](https://appstoreconnect.apple.com)
2. Create new app (if not created)
3. Fill metadata from [`app-information.md`](./app-information.md)
4. Complete App Privacy questionnaire using [`app-privacy.md`](./app-privacy.md)
5. Complete compliance questionnaires using [`compliance.md`](./compliance.md)
6. Paste review notes from [`app-review-notes.md`](./app-review-notes.md)
7. Upload screenshots and app preview video
8. Select build

**Step 5: Final Verification (Week 4)**
1. Go through entire [`submission-checklist.md`](./submission-checklist.md)
2. Check every box (don't skip any!)
3. Fix any issues found
4. Re-test on real device after fixes

**Step 6: Submit**
1. Review all sections one final time
2. Click "Submit for Review"
3. Monitor email and App Store Connect for 1-3 days
4. Keep demo environment running 24/7
5. Keep contact phone available

---

## Update Submission (v1.1+)

**For minor updates (bug fixes, small features):**
1. Update [`app-information.md`](./app-information.md) → "What's New" section
2. Review [`compliance.md`](./compliance.md) for any new compliance requirements
3. Update [`app-privacy.md`](./app-privacy.md) if data collection changed
4. Run abbreviated checklist from [`submission-checklist.md`](./submission-checklist.md) (sections 1, 7-10, 15)
5. Submit

**For major updates (new features, redesigns):**
- Follow full first-time submission process
- Update all screenshots
- Record new demo video
- Update review notes with new feature highlights
- Full testing on all devices

---

## Key Placeholders to Customize

Before submission, find and replace these placeholders throughout all documents:

- `<YOUR NAME>` → Your name or company contact name
- `<YOUR EMAIL>` → Support/contact email address
- `<YOUR PHONE>` → Phone number for App Review contact
- `<DEMO_PASSWORD>` → Password for demo@plantocode.com account
- `<LINK TO 60-90s DEMO VIDEO>` → YouTube/Vimeo link to demo video
- `_plantocode._tcp` → Your actual Bonjour service type (if different)

**URLs to verify live:**
- `https://plantocode.com` → Marketing website
- `https://plantocode.com/support` → Support/help page
- `https://plantocode.com/privacy` → Privacy policy (required)

---

## Special Considerations for PlanToCode

### 1. Companion App Architecture
PlanToCode iOS is a **companion controller**, NOT a remote desktop client. It sends commands to the desktop app and displays text responses. No UI streaming. Clarify this in review notes to avoid Guideline 4.2.7 confusion.

### 2. Sign in with Apple Requirement
**Action Required:** Determine if your app uses Google, GitHub, or other OAuth providers. If YES, you MUST implement Sign in with Apple per Guideline 4.8. See [`compliance.md`](./compliance.md) § 3 for full details.

### 3. Local Network Permission
Required for Bonjour discovery. Ensure `NSLocalNetworkUsageDescription` and `NSBonjourServices` are in `Info.plist`. See [`info-plist-permissions.md`](./info-plist-permissions.md) § 1.

### 4. Voice Dictation (Optional)
If implemented, requires both `NSSpeechRecognitionUsageDescription` and `NSMicrophoneUsageDescription`. Test permission flow thoroughly.

### 5. Demo Environment Uptime
App Review will test your demo account. **Critical:** Keep demo Mac mini running 24/7 during review period (typically 3-7 days). Monitor connectivity.

---

## Common Issues & Solutions

### Issue: "Sign in with Apple Required"
**Solution:** If using Google/GitHub login, add Sign in with Apple button above other options. See [`compliance.md`](./compliance.md) § 3.

### Issue: "Missing Permission Description"
**Solution:** Check `Info.plist` for all required keys from [`info-plist-permissions.md`](./info-plist-permissions.md). Even if not using a feature, if the capability is enabled in Xcode, you need the key.

### Issue: "App Does Not Function"
**Solution:** Verify demo account in [`app-review-notes.md`](./app-review-notes.md) works. Test fresh install → sign in → connect → use features. Record video for proof.

### Issue: "Inaccurate Screenshots"
**Solution:** Screenshots must show actual app in use. No mockups, no unimplemented features. See [`app-information.md`](./app-information.md) → Screenshot Guidance.

### Issue: "Privacy Policy Inaccessible"
**Solution:** Ensure `https://plantocode.com/privacy` returns HTTP 200, not 404. Must be accessible without login.

---

## Timeline

**Typical App Store review:** 1-3 days (can be up to 7 days)

**Preparation timeline:**
- Week 1-2: Development, metadata writing
- Week 3: Testing, screenshot creation
- Week 4: App Store Connect submission
- Week 5: Review, approval, release

**Expedited review:** Available for critical bug fixes. Request via App Store Connect (use sparingly).

---

## Post-Approval

### Immediate Actions
1. Release app (if manual release selected)
2. Verify live on App Store
3. Test fresh install from App Store (not TestFlight)
4. Update website with App Store badge
5. Announce launch

### Ongoing Monitoring
1. **App Store Connect Analytics:** Downloads, crashes, usage
2. **User Reviews:** Respond professionally within 24-48 hours
3. **Crash Reports:** Check weekly, fix critical crashes immediately
4. **Support Email:** Monitor `support@plantocode.com` daily
5. **Server Logs:** Monitor backend for errors from iOS app

### Planning Next Release
- **Bug fixes:** Release every 2-4 weeks
- **Minor features:** Release every 1-2 months
- **Major updates:** Release every 3-6 months

---

## Resources

### Official Apple Resources
- [App Store Connect](https://appstoreconnect.apple.com) – Submission portal
- [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/) – Full rulebook
- [Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/) – Design standards
- [App Store Review](https://developer.apple.com/distribute/app-review/) – Process overview
- [Developer Forums](https://forums.developer.apple.com/) – Community help

### Internal Resources
- **Xcode Project:** `/mobile/ios/App/` (or your path)
- **Info.plist:** `/mobile/ios/App/Info.plist` (or your path)
- **Assets:** `/mobile/ios/App/Assets.xcassets/`
- **Marketing Site:** `https://plantocode.com`

### Support Contacts
- **App Review Questions:** Use Resolution Center in App Store Connect
- **Technical Issues:** [Apple Developer Support](https://developer.apple.com/support/)
- **Account Issues:** [Apple Developer Account Support](https://developer.apple.com/support/account/)

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2025-10-13 | Initial documentation for first submission |

---

## Contributing

**Updating these docs:**
1. Make changes in `/mobile/ios/docs/app-store-connect/`
2. Update "Last Updated" date in each modified file
3. Update this README's "Version History" table
4. Commit with clear message: "docs(ios): update App Store Connect submission guide"

**Document owners:**
- `app-information.md` → Marketing team
- `app-review-notes.md` → Engineering team
- `app-privacy.md` → Legal/compliance team
- `compliance.md` → Legal/compliance team
- `info-plist-permissions.md` → Engineering team
- `submission-checklist.md` → Engineering lead / Product manager

---

## License

These documentation files are part of the PlanToCode project.

© 2025 PlanToCode. All rights reserved.

---

## Questions?

**Before submission:**
- Read all 6 documents thoroughly
- Complete entire submission checklist
- Test on real devices

**Need help?**
- Check [Apple's App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- Post in [Apple Developer Forums](https://forums.developer.apple.com/)
- Contact internal team lead

**Ready to submit?**
Open [`submission-checklist.md`](./submission-checklist.md) and start checking boxes!

---

**Good luck with your submission!** 🚀
