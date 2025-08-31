# Goal & Guardrails

* **Primary goal (next 30 days):** Reach **25–40 successful first-wins** (users who install, run a guided task, and see correct file edits suggested in the right places) and **5–10 genuine product conversations** with qualified developers.
* **North-star signal:** % of new users who complete the **5‑Minute First Win** (5MFW) and say "this fixes my AI-agent file chaos" (thumbs-up prompt).
* **Guardrails:** Avoid vanity metrics (impressions, likes). Ship only assets that push users to download/try or give feedback.

---

# Ideal Users & Core JTBD

* **Who:** Individual devs / indie teams on macOS who use AI coding tools (Cursor, Windsurf, Claude Code, Cline) and work in **growing codebases/monorepos**.
* **Pain:** AI agents create files/folders in wrong places, duplicate functions, or get stuck in loops while editing across files.
* **Job-to-be-done:** “When I ask an AI to implement a change, I want it to **touch the right files** and **only the right files**, so I ship quickly without cleanup.”
* **Positioning:** *Vibe Manager = implementation‑plan‑first coding agent* (no diffs), with bold strategies to deduplicate, pick correct files, and edit precisely.

---

# Messaging Pillars (use everywhere)

1. **Edit in the right place.** Stop duplicate files & messy folders.
2. **Plan before code.** Implementation plan > blind multi-file edits.
3. **Safe acceleration.** Fast iterations without repo chaos.

**One‑liner examples:**

* “Ship features without file chaos. Vibe Manager edits **exactly** where it should.”
* “Your AI can code. Vibe makes it **place**.”
* “From plan → precise edits. No diff floods.”

---

# 5‑Minute First Win (5MFW)

**Objective:** A deterministic, delightful path from download → success in \~5 minutes.

**Scenario:**

* Repo: A small sample repo you provide (e.g., Todo app).
* Task: “Add a new settings toggle and wire it to an existing component.”
* Agent flow:

    1. Detects relevant files/folders.
    2. Produces an **implementation plan** (not diffs).
    3. Shows exactly which lines/files will change.
    4. Executes & shows result.
* **Success marker:** Plan accepted + files correctly edited + run passes.

**Assets to ship for 5MFW:**

* Sample repo (GitHub public) with `README: Try Vibe Manager in 5 minutes`.
* 45s video: cold open (problem), click‑through (plan→edits), end card (Download for macOS).
* Troubleshooting note: Rosetta, permissions, or Gatekeeper steps if needed.

---

# Instrumentation & Measurement

**Stack:** Plausible (web), in‑app telemetry (first-run + 5MFW events).

**Web (Plausible) goals:**

* `view_download_button` (CTA hero)
* `click_download`
* `click_docs_or_github`
* `view_5mfw_page`

**In‑app events:**

* `install_completed`
* `repo_loaded`
* `plan_generated`
* `plan_accepted`
* `edits_applied`
* `5mfw_success` (composite)
* `thumbs_up` / `thumbs_down`

**UTM convention:** `utm_source` (twitter|reddit|github|hn|ph|ads), `utm_medium` (organic|reply|thread|sponsor), `utm_campaign` (feature\_intro|5mfw|launch), `utm_content` (asset slug).

**Weekly metrics dashboard:**

* Visitors → Download CTR
* Downloads → Installs
* Installs → 5MFW success
* 5MFW success → thumbs\_up
* \#Feedback calls booked

---

# Conversion Surface (Landing Page)

**Above the fold:**

* Headline mapped to pillar #1 (edit in the right place)
* 45s autoplay‑muted demo (5MFW).
* Primary CTA: **Download for macOS**; Secondary: **Try 5‑min demo repo**.

**Mid-page:**

* 3 cards for pillars + 15‑sec micro‑loop GIFs (plan view, file targeting, execute & result).
* Social proof slots (Tweets/Reddit comments once you have them).

**Bottom:**

* "Will it work on my repo?" explainer + troubleshooting.
* Email capture: "Send me the 5‑min demo + sample repo" (for nurturing).

---

# Content & Assets (2‑Week Production)

**Videos:**

1. 45s homepage demo (problem → plan → precise edits → CTA).
2. 20s loop: “Duplicate files? Not anymore.”
3. 20s loop: “Plan before code. No diffs.”
4. 30s walkthrough of 5MFW using the sample repo.

**Posts (templates you can reuse):**

* X/LinkedIn thread: *“Why agents break your repo”* (with 3 code screenshots; end in demo link).
* Reddit post (r/programming, r/reactjs, r/rust, niche language subs): *“We built an implementation‑plan‑first agent to stop duplicate files — looking for feedback.”* Include sample repo.
* GitHub README and `docs/5mfw.md` with step‑by‑step.

**Comparison pages (SEO + trust):**

* `/compare/cursor` — “Cursor codes, Vibe places.”
* `/compare/windsurf`
* `/compare/claude-code`
* Focus on *file selection & multi‑file planning* differences; keep it respectful.

---

# Distribution Plays (Repeat Weekly)

## 1) X (Twitter)

* Post 3x/week: 1 demo, 1 engineering insight, 1 founder note.
* Daily: reply to 5–10 relevant conversations (agents, codebase chaos, monorepos). Link **only** after value.
* Pin the 45s demo; ask for repo‑specific trials in replies.

## 2) Reddit

* 2 posts/week across 2–3 subs where multi‑file editing pain appears.
* Format: problem story + GIF + sample repo + “feedback welcome”.
* Follow up in comments with technical detail; avoid sales tone.

## 3) GitHub

* Host sample repo + a second “language variant.”
* Create minimal issues like “Try 5MFW and leave feedback.”
* Add a CI badge “Vibe plan passed” for the repo’s demo task.

## 4) Hacker News / Show HN

* Prepare a neutral, technical title: *“Show HN: Implementation‑plan‑first AI that edits the right files (macOS)”*
* Link to the 5MFW page; be ready in comments with deep answers.

## 5) Product Hunt (optional after week 3)

* Only after: homepage, 5MFW, and 2–3 proof posts exist.
* Assets: 60–90s video, 4–6 screenshots, clear bullets on file‑targeting.

## 6) Micro‑sponsorships (tiny tests)

* 1–2 tweets/newsletters from dev micro‑creators with 5k–30k reach.
* Ask for CPC or fixed with guaranteed click‑through to 5MFW.

---

# Paid Experiments (Tiny & Targeted)

* **Dev networks** (e.g., code‑site native ads) with €200–€300 test per week for 2 weeks. Use a single CTA: *“Try the 5‑min demo repo on macOS.”*
* Kill or scale based on **Downloads → 5MFW success** (not clicks).

---

# Outreach & Community Scripts

**GitHub Issues/Discussions (template):**

> We’re experimenting with an implementation‑plan‑first agent that prevents duplicate files and touches only the right places. If you’ve seen AI agents scatter files or loop in your repo, here’s a 5‑minute demo repo to try. Would love brutal feedback.

**DM to creators:**

> I built a macOS tool that forces AI to plan before edits, so it stops placing files in the wrong folders. Could you try the 5‑min demo repo and tell me what’s missing? Happy to sponsor a short post if it resonates.

---

# Weekly Operating Cadence (30‑Day Sprint)

**Week 1 – Foundation**

* Ship 5MFW sample repo + README.
* Record 45s homepage demo + 20s loops.
* Implement Plausible goals + in‑app events.
* Update homepage hero + CTA + demo.

**Week 2 – Soft Launch**

* Publish GitHub repo and /5mfw page.
* Post 2 Reddit threads + 3 X posts; engage daily.
* Start 5 feedback calls (Calendly link on site).
* Run first €200 micro‑ad test to 5MFW page.

**Week 3 – Momentum**

* Ship 2 comparison pages.
* “Show HN” with founder in comments.
* Second €200 micro‑ad test; keep or kill based on 5MFW.

**Week 4 – Scale/Decide**

* If **≥25 5MFW successes** and **≥5 calls**, prep Product Hunt.
* If below threshold, run a friction audit (install failure, Gatekeeper, unclear CTA) and improve 5MFW before any broad launch.

---

# Quant Targets & Gates

* **Site → Download CTR:** 1.5–3%
* **Download → Install:** 60–80% (macOS)
* **Install → 5MFW success:** 30–50%
* **Per‑week target:** 6–10 5MFW successes by Week 4.
* **Go/No‑Go for PH:** ≥25 successes + 2 public proof posts (Reddit/X) + 1 external mention.

---

# Troubleshooting Checklist (when numbers are low)

* Video not immediately communicating *file‑placement precision*.
* Download path wrong / Gatekeeper blocking (show fix inline).
* Sample repo too heavy; shrink to a crisp task.
* In‑app copy unclear: plan vs diff; show “why this file?” hints.
* No social proof—pin a real user comment ASAP.

---

# Lightweight ROI Model (for any spend or contractor)

* Define **LTV** (even rough). Require **LTV\:CAC ≥ 3:1** to scale.
* Gate on **5MFW successes** attributed to that channel/contractor.
* Example: Spend €600 → need **≥20** 5MFW successes if your free→paid conversion is \~15% and LTV is €200 (600/(0.15\*200) ≈ 20).

---

# Your Next Actions (checklist)

* [ ] Build & publish 5MFW sample repo + README.
* [ ] Add Plausible goals, UTMs, in‑app events above.
* [ ] Replace homepage hero with 45s demo + tight headline.
* [ ] Record 20s loops; export as MP4/WebM/GIF.
* [ ] Ship /5mfw page with step‑by‑step + troubleshooting.
* [ ] Post first Reddit thread + X thread; pin demo on X.
* [ ] Book 5 calls via a Calendly link on site.
* [ ] Run first €200 dev‑network micro‑ad to /5mfw.
* [ ] Review weekly metrics; adjust.

---

# Appendix: Search Patterns (use to find conversations)

**X (Twitter):**

* ("Cursor" OR "Windsurf" OR "Cline" OR "Claude Code") ("multi‑file" OR monorepo OR "repo" OR "large codebase") (agent OR planning OR planner OR refactor) lang\:en
* ("duplicate files" OR "wrong folder" OR "file chaos") (AI OR agent OR "code assistant") lang\:en

**Reddit:**

* title:(agent OR agents) AND ("duplicate files" OR monorepo OR "wrong folder")
* (Cursor OR Windsurf OR "Claude Code" OR Cline) AND (monorepo OR multi‑file OR planner)

**GitHub (issues):**

* `"duplicate file" OR "wrong folder" in:issue is:open language:TypeScript`
* `"multi file" OR "multi-file" in:issue repo:<popular-repo>`
* `agent in:issue is:open created:>2025-06-01`
