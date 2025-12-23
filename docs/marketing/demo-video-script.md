# 5-Minute Demo Video Script - PlanToCode
**Target Length:** 4:30-5:00 minutes
**Purpose:** Show the "first win" - preventing AI coding chaos with planning

---

## Video Format & Setup

### Recording Setup
- **Camera:** Face camera (webcam or phone)
- **Screen:** Screen recording software (OBS, Loom, or ScreenFlow)
- **Format:** Picture-in-Picture (PIP)
  - Start with **full-frame face** (0:00-0:15) - builds trust
  - Transition to **screen recording with small face bubble** (0:15-5:00)
  - Face bubble: **Bottom-right or bottom-left corner** (20% screen size)

### Technical Settings
- **Resolution:** 1920x1080 (1080p minimum)
- **Frame rate:** 30fps
- **Audio:** Clear microphone (Rode, Blue Yeti, or AirPods Pro)
- **Lighting:** Face well-lit (ring light or window light)

---

## Video Structure Overview

| Time | Section | Visual | Content |
|------|---------|--------|---------|
| 0:00-0:15 | Hook | Full-frame face | Problem statement (relatable pain) |
| 0:15-0:45 | Problem Demo | Screen + PIP | Show AI tool creating chaos |
| 0:45-1:30 | Solution Intro | Screen + PIP | Introduce PlanToCode approach |
| 1:30-3:30 | Live Demo | Screen + PIP | Show planning workflow |
| 3:30-4:30 | Key Benefits | Screen + PIP | Recap value props |
| 4:30-5:00 | CTA | Screen + PIP | Clear next steps |

---

## FULL SCRIPT WITH TIMING

---

### SEGMENT 1: HOOK (0:00 - 0:15)
**VISUAL:** Full-frame face, looking at camera
**TONE:** Conversational, slightly frustrated (relatable)

**SCRIPT:**
```
"If you've used Cursor or Copilot to refactor code, you've probably
experienced this: [slight pause] you ask AI to rename a function, and
five minutes later you're staring at duplicate files, broken imports,
and a codebase that won't compile.

[Slight smile] I built PlanToCode to fix this. Let me show you how."
```

**DIRECTION:**
- Direct eye contact with camera
- Speak naturally, not scripted
- Slight hand gesture on "duplicate files, broken imports"
- Smile on "Let me show you how"

**TRANSITION:** Cut to screen recording with face in bottom-right corner

---

### SEGMENT 2: THE PROBLEM (0:15 - 0:45)
**VISUAL:** Screen recording showing Cursor/Copilot creating chaos
**FACE:** Small bubble, bottom-right corner (20% size)

**SCRIPT:**
```
"Here's the problem. Watch what happens when I ask Cursor to refactor
user authentication in this codebase."

[Screen shows Cursor chat]
Prompt: "Refactor getUserData() to fetchUserProfile() across the codebase"

[Cursor starts generating code, creating files]

"Look—it's creating a NEW file called fetchUserProfile.ts...
but getUserData.ts already exists. Now we have duplicates.

And it's updating SOME imports but missing others. This file still
imports getUserData, which it just renamed. The build will fail."

[Show error in terminal]

"This is the chaos AI tools create. Fast, but careless."
```

**SCREEN ACTIONS:**
1. Open Cursor with existing codebase
2. Type prompt in chat
3. Show Cursor creating duplicate file
4. Highlight missed imports with cursor
5. Run build, show error

**DIRECTION:**
- Speak over the screen recording
- Use cursor/highlights to point out issues
- Keep face visible but small (engagement)

---

### SEGMENT 3: SOLUTION INTRO (0:45 - 1:30)
**VISUAL:** Screen showing PlanToCode terminal
**FACE:** Bottom-right corner

**SCRIPT:**
```
"PlanToCode solves this with one simple idea: plan BEFORE you code.

Instead of AI generating files immediately, it creates an
implementation plan first. You review it, catch the mistakes,
then execute.

Let me show you the same refactoring task, but with planning."

[Open PlanToCode terminal]

"I'll ask PlanToCode to do the same thing: refactor getUserData
to fetchUserProfile."
```

**SCREEN ACTIONS:**
1. Close Cursor
2. Open terminal with PlanToCode
3. Show clean interface
4. Prepare for demo

**DIRECTION:**
- Calm, confident tone
- "Plan BEFORE you code" - emphasize
- Smooth transition to demo

---

### SEGMENT 4: LIVE DEMO - PLANNING (1:30 - 3:30)
**VISUAL:** Screen recording of PlanToCode workflow
**FACE:** Bottom-right corner

**PART A: FILE DISCOVERY (1:30 - 2:00)**

**SCRIPT:**
```
"First, PlanToCode runs file discovery. It's finding every file that
references getUserData."

[Screen shows file discovery running]

"There—it found 12 files. That's the blast radius. If I change this
function, these 12 files are affected.

Notice it found test files too. Cursor missed those."
```

**SCREEN ACTIONS:**
1. Type: `plantocode discover getUserData`
2. Show file discovery results (12 files)
3. Highlight test files in list

---

**PART B: GENERATE PLAN (2:00 - 2:45)**

**SCRIPT:**
```
"Now I'll generate the implementation plan."

[Type command]

"PlanToCode is analyzing the codebase and creating a file-by-file
plan. This takes about 10 seconds."

[Plan appears]

"Perfect. Here's the plan. Let me walk through it.

Step 1: Update the type definition in types/User.ts
Step 2: Rename the function in services/userService.ts
Step 3: Update imports in these 8 files
Step 4: Update test mocks in __tests__/userService.test.ts

See the difference? It's SHOWING me what will change BEFORE any
code is written.

And look—no duplicate files. It's updating the existing file,
not creating a new one."
```

**SCREEN ACTIONS:**
1. Type: `plantocode plan "refactor getUserData to fetchUserProfile"`
2. Show AI thinking/loading indicator
3. Display plan output
4. Scroll through plan slowly
5. Highlight key sections:
   - Type definitions
   - Function rename
   - Import updates
   - Test updates

**DIRECTION:**
- Speak slowly, let viewer read plan
- Use cursor to point to important lines
- Emphasize "BEFORE any code is written"

---

**PART C: REVIEW & EXECUTE (2:45 - 3:30)**

**SCRIPT:**
```
"Now I can review this plan. If I see something wrong—maybe it
missed a file, or the order is off—I can edit it.

But this looks good. So I'll approve it."

[Press enter or type approve command]

"Now PlanToCode can hand this plan to Cursor or Claude Code for
execution. Or I can implement it manually.

The key is: I KNEW what would change before it happened."

[Show final result - no errors]

"Build passes. No duplicate files. All imports updated. Tests still
work. That's the difference planning makes."
```

**SCREEN ACTIONS:**
1. Show plan review interface
2. Press approve/execute
3. Show plan being passed to AI tool (optional)
4. Run build: `npm run build` - SUCCESS
5. Show file tree: no duplicates
6. Run tests: `npm test` - PASS

**DIRECTION:**
- Confident, satisfied tone
- Let success speak for itself
- Brief pause after "Build passes" for impact

---

### SEGMENT 5: KEY BENEFITS (3:30 - 4:30)
**VISUAL:** Screen showing before/after comparison or key features
**FACE:** Bottom-right corner

**SCRIPT:**
```
"So why does this matter?

Three reasons:

One: [show screen] You catch mistakes BEFORE they break your codebase.
No more debugging duplicate files for hours.

Two: [show screen] You know the blast radius. That 'simple rename'
actually touched 12 files. Planning shows you that upfront.

Three: [show screen] You stay in control. AI suggests, you approve.
Nothing happens without your review.

This is especially critical for production code, large codebases,
or team environments where breaking things has real costs.

PlanToCode works with Claude Code, Cursor, Copilot—any AI tool.
It's the planning layer they're all missing."
```

**SCREEN ACTIONS:**
1. Show split screen: Chaos (Cursor) vs Clean (PlanToCode)
2. Show file count visualization (12 files affected)
3. Show approval workflow diagram
4. Show integration with other tools (logos/screenshots)

**DIRECTION:**
- Clear, structured delivery
- "One... Two... Three" with pauses
- "Planning layer they're all missing" - key point

---

### SEGMENT 6: CALL TO ACTION (4:30 - 5:00)
**VISUAL:** Screen showing PlanToCode website or download page
**FACE:** Slightly larger (25% screen) or back to full-frame for last 5 seconds

**SCRIPT:**
```
"Ready to try it?

Download PlanToCode for free. It works on Mac, Windows, and Linux.

Generate your first plan, see what it catches, and decide if the
planning-first workflow fits your team.

Link in the description. Thanks for watching."

[Smile, slight nod]
```

**SCREEN ACTIONS:**
1. Show www.plantocode.com/downloads
2. Show download buttons for all platforms
3. Optional: Quick flash of key features

**DIRECTION:**
- Warm, inviting tone
- Make eye contact with camera on last line
- Friendly, professional close

---

## Visual Assets Needed

### Pre-record These
1. **Sample codebase** with user authentication (realistic, not too complex)
2. **Cursor creating chaos** - record this in advance, edit in
3. **PlanToCode success workflow** - record clean run-through

### Graphics/Text Overlays (Optional)
- "The Problem: AI creates chaos" (0:15)
- "The Solution: Plan first" (0:45)
- "3 Key Benefits" (3:30)
- "Download Free" (4:30)

### End Screen
- PlanToCode logo
- www.plantocode.com/downloads
- "Planning-First AI Development"

---

## Recording Tips

### DO:
✅ **Script but sound natural** - memorize key points, ad-lib details
✅ **Show real code** - realistic scenario builds trust
✅ **Pause strategically** - let viewers absorb what they see
✅ **Use cursor/highlights** - point to important parts
✅ **Smile at camera** - you're helping, not selling
✅ **Show the problem first** - pain → solution is powerful

### DON'T:
❌ Read from script robotically
❌ Go too fast (pause after key points)
❌ Show complex/messy code (keep it clean)
❌ Apologize or say "um" excessively (edit out)
❌ Make it a sales pitch (show value, don't sell)

---

## Editing Checklist

### Post-Production
- [ ] Cut dead air (pauses longer than 2 seconds)
- [ ] Remove "um"s and filler words
- [ ] Add zoom-ins on important UI elements
- [ ] Highlight cursor movements (circle/arrow annotations)
- [ ] Add subtle background music (low volume, non-distracting)
- [ ] Color grade for consistency
- [ ] Add captions/subtitles (accessibility + mobile viewing)
- [ ] Add end screen with CTA (5-10 seconds)

### Export Settings
- **Resolution:** 1920x1080 (1080p)
- **Format:** MP4 (H.264)
- **Bitrate:** 8-10 Mbps
- **Audio:** 192 kbps AAC
- **Frame rate:** 30fps

---

## Thumbnail Design

**Text Overlay:** "Stop Breaking Production with AI"
**Visual:** Split screen - Chaos (red) vs Planning (green)
**Face:** Small corner or no face (let problem/solution be focal point)
**Style:** Bold, high contrast, readable at small size

---

## Where to Use This Video

### Primary Locations
1. **Homepage hero section** (above the fold)
2. **Landing page /demos** (dedicated page)
3. **YouTube** (with SEO-optimized title/description)
4. **Product Hunt launch** (main demo)
5. **Social media** (Twitter, LinkedIn clips)

### Video Variants to Create
- **5-minute version** (full demo) - for homepage, YouTube
- **2-minute version** (cut benefits section) - for social media
- **30-second teaser** (just hook + CTA) - for ads, Twitter

---

## SEO Optimization (YouTube)

### Title
"How to Prevent AI Coding Tools from Breaking Your Codebase | PlanToCode Demo"

### Description
```
AI coding tools like Cursor and Copilot can refactor code 10x faster—but
they also break production 10x faster. Duplicate files, wrong paths,
missed imports.

PlanToCode solves this with planning-first development: AI generates an
implementation plan, you review it, THEN execute. No more chaos.

In this demo:
0:15 - The Problem: AI tools creating duplicate files
0:45 - The Solution: Planning before execution
1:30 - Live Demo: File discovery and plan generation
3:30 - 3 Key Benefits of planning-first development
4:30 - How to get started

Download PlanToCode (free): https://www.plantocode.com/downloads

Works with Claude Code, Cursor, GitHub Copilot, and any AI coding tool.

#AIcoding #softwaredevelopment #cursor #copilot #refactoring
```

### Tags
ai coding, cursor, github copilot, claude code, refactoring, software
development, ai tools, code planning, implementation planning

---

## Alternative: Screencast-Only Version (No Face)

If you prefer **no face at all**:

**OPTION 1: Voice-over only**
- Record screen first
- Add voice narration after
- More control, easier to edit
- Slightly less personal

**OPTION 2: Animated cursor + text callouts**
- No talking, just text annotations
- Music background
- Faster to produce
- Good for international audiences

**Recommendation:** Include face for trust, but keep it small (PIP)

---

## Timeline to Produce

**Realistic Schedule:**
- **Day 1:** Prepare codebase, practice script (2 hours)
- **Day 2:** Record full-frame intro + screen demos (3 hours)
- **Day 3:** Edit, add graphics, export (4 hours)
- **Day 4:** Review, refine, upload (1 hour)

**Total:** ~10 hours if done properly

**Quick Version (acceptable quality):** 3-4 hours with Loom in one session

---

## Success Metrics

After publishing, track:
- **Watch time:** Target 60%+ completion rate (3min+ of 5min video)
- **Click-through rate:** 10%+ on CTA
- **Homepage engagement:** +20% scroll depth with video vs without
- **Downloads:** Measure conversions from video viewers

---

## Final Notes

**Most Important:**
1. **Show the problem FIRST** - people need to feel the pain
2. **Demonstrate real value** - not features, but outcomes
3. **Keep it moving** - cut ruthlessly in editing
4. **End with clear action** - what should viewer do next?

**Voice/Tone:**
- Confident but not arrogant
- Helpful, like teaching a friend
- Slightly conversational, not corporate
- Show passion for solving the problem

**The "First Win" Moment:**
The magic moment is at 3:15 when the build passes and tests work—that's
when viewers realize "this actually works." Make sure that lands clearly.

Good luck! This video will be a game-changer for your landing page conversion.
