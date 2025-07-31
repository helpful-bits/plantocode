---
title: "Vibe Manager | Stop Babysitting Your AI Coder"
description: "A rather civilized solution for AI agents experiencing mild navigational difficulties in your codebase. We provide gentle context curation to help them find their way. Built by a developer, for developers, from the trenches."
imageUrl: "https://vibe-manager-media.s3.amazonaws.com/og-image.png"
keywords: ["AI coding assistant", "context curation", "vibe coding", "multi-model AI", "codebase analysis", "implementation plans", "developer tools", "local AI", "private AI coding", "Claude Code", "Gemini"]
---

# Vibe Manager: The Polite Context Guidance Centre for Somewhat Bewildered AI Agents

You know the feeling. You're "vibe coding" with an AI agent—the ideas are flowing, and it's magical... until it's not. The agent gets hopelessly lost in your large codebase, starts ignoring instructions, hallucinates APIs, and writes code that feels like it belongs in a different project entirely.

That magic moment is gone. Now you're a babysitter.

You find yourself writing novels of documentation just to keep the agent on track. You create endless rule lists, turning your creative flow into a tedious game of "Simon Says." This isn't what AI-assisted development was supposed to be.

I built Vibe Manager because I hit that wall. Hard. My own project, this very app, was a mess of bugs and instability because the agents I used couldn't see the big picture. I realized agents don't need more rules; they need gentle guidance—a polite context service, if you will. They need assistance finding the *exact* files, understanding the *real* context, and receiving crystal-clear, specific tasks.

Vibe Manager is that polite guidance centre. You're the visionary with the grand plan. Vibe Manager provides the discreet contextual support. The LLMs are your somewhat bewildered but talented agents, executing perfectly curated plans once properly oriented.

## How It Works: Giving Your AI a Brain (and a Map)

Vibe Manager doesn't just throw files at an LLM. It's a multi-stage workflow engine that thinks like a senior developer. It's the app I built to fix my own development workflow, and it's how this very app and website were created.

#### Step 1: The Briefing (Task Input &amp; Refinement)
A great plan starts with a clear goal. We make it effortless to capture yours.
*   **Voice Dictation:** Just talk. Explain your complex logic, walk through the bug, or brainstorm out loud. GPT-4 transcribes everything and drops the text exactly where your cursor was. Faster than typing, better than forgetting.
*   **Screen Recording with AI Analysis:** Can't explain it in words? Show it. Record your screen, add narration if you want. Gemini extracts every technical detail—error messages, UI patterns, console outputs—and adds it all to your task description. Because sometimes "look at this mess" is the clearest specification.
*   **AI-Powered Text Improvement:** Select any text in the app—your task, a system prompt, even a plan you're editing—and our AI will improve its clarity and quality on the spot.
*   **Task Refinement Analysis:** Our AI analyzes your codebase to clarify ambiguous requirements, identify exact boundaries, and specify which components are actually involved—turning vague ideas into precise specifications.

#### Step 2: The Recon Mission (Finding What Matters)
This is where Vibe Manager earns its keep. Forget vector databases that go stale. We rely on something far superior: the raw intelligence of modern LLMs. It's faster, more accurate, and doesn't require you to constantly re-index your project. Our **File Finder Workflow** acts like a senior dev dropped into your project, using a 4-stage process (Regex Filtering → AI Content Assessment → Extended Path Finding → Path Correction) to pinpoint only the essential files.

#### Step 3: Phoning a Friend (Deep Research Workflow)
Your codebase doesn't exist in a vacuum, but your LLM's knowledge is frozen in time. We fix that. I faced this exact problem when I needed to integrate FeatureBase for user feedback. I told Vibe Manager: *"I learned on X that FeatureBase is cool... how do I integrate it into our system? Which code parts need to be adjusted?"* It understood my code, figured out the right questions to ask the internet, and came back with a solid, up-to-date implementation plan—and after several iterations, it worked.

We search for current documentation to fill knowledge gaps. You can run the full research workflow or choose **"Just Prompts"** to generate the search queries for your own review—a lighter, faster first step.

#### Step 4: The Board Meeting (The Council of LLMs)
One model's genius is another's blind spot. We leverage a "Council of LLMs" for a superior strategy.
*   **Multi-Model, Multi-Run Generation:** We generate plans from multiple top-tier models (Gemini, Claude, Grok, etc.) simultaneously. Running the *same* model multiple times is also incredibly valuable—it often uncovers different bugs and details in each pass.
*   **Intelligent Merging &amp; Ergonomic Review:** Our architect AI doesn't just combine plans—it performs **deep synthesis intelligence**: detecting blind spots no individual plan caught, creating emergent solutions that transcend individual limitations, and ensuring architectural coherence throughout. As you review, jot down your thoughts in a **floating notes window**. You can even edit the plans directly. The merge AI will incorporate your feedback.
*   **Execute with Confidence:** Take the final, superior plan to your agent of choice (we love Claude Code's sub-agents). You're the CEO, setting the vision. We handle the management.

## You Are in Control. Always.

This isn't a black box. Your code and your data are yours. Period.

*   **Your Code Stays Local:** The app runs on your desktop. Your code never leaves your machine except when you a-ok it to be sent directly to the LLM providers. It lives in your Git repo, where it belongs.
*   **Your Data Stays Local:** All sessions, task descriptions, and file selections are stored in a local SQLite database on your computer. No cloud storage. No remote backups. Your work history never leaves your machine.
*   **Persistent Sessions:** Every project gets its own persistent sessions. Your task descriptions, file selections, search terms, and model preferences are all preserved. Close the app, come back days later—everything is exactly where you left it. Never start from scratch.
*   **Complete History Tracking:** Every task description edit, every file selection change, every workflow result—it's all tracked with timestamps. Need to see what you tried last week? It's there. Want to restore a previous file selection? One click.
*   **Full Customization:** You are the CEO. You can override *any* system prompt for any task. You can even customize the text for the "Copy Button" instructions to perfectly match your workflow. Your customizations are saved per project.
*   **Truly Parallel Work:** While one implementation plan is generating, switch to another session and kick off a different workflow. Vibe Manager runs jobs in the background so you're never blocked. Each session maintains its own complete state.

## The Intelligence Under the Hood

*   **Pattern Recognition:** Decomposes your task into logical functionality areas, creating targeted search patterns for each aspect.
*   **Ambiguity Resolution:** Analyzes your actual code to clarify vague requirements and identify exact boundaries.
*   **Conflict Resolution:** When AI models disagree, applies principle-based resolution—choosing approaches that follow SOLID principles and integrate cleanly.
*   **Emergent Solutions:** The merge process doesn't just combine—it synthesizes, creating solutions better than any individual plan could achieve.
*   **Authority First:** Web research uses only official documentation. No guesswork, no outdated tutorials—just facts from the source.

## FAQ: "Alright, but apart from the files, what has Vibe Manager ever done for us?"

*   **Q:** "So it just finds the right files?"
*   **A:** "Well, yes, it finds the *right* set of files. But also..."
*   **Q:** "What else?"
*   **A:** "It integrates up-to-the-minute web documentation with your codebase. And it generates implementation plans from a council of AI models, then merges them into a single, bulletproof strategy."
*   **Q:** "Okay, but apart from finding files, doing web research, and creating merged multi-model plans...?"
*   **A:** "It keeps your code completely private on your local machine. And lets you customize every single system prompt and copy-paste instruction. And it has voice dictation and screen recording with AI analysis. And it runs all its workflows in parallel so you can work on multiple tasks at once. And it remembers everything—your sessions, your file selections, your task history—so you never lose context."
*   **Q:** "Alright, I'll grant you that the file finding, web research, multi-model plans, privacy, custom prompts, voice dictation, screen recording, parallel workflows, and persistent sessions are nice. But apart from ALL THAT, what has Vibe Manager ever done for us?"
*   **A:** "It gave you your weekend back."

## "All Right, But Apart From the Sanitation, Medicine, Education, Wine, Public Order, Irrigation, Roads, the Fresh-Water System, and Public Health, What Have the Romans Ever Done for Us?"

1.  **Three-Pronged Attack:** Code Analysis (File Finder) + Web Intelligence (Deep Research) + Architectural Synthesis (Council of LLMs). It's a complete strategy.
2.  **Actually Efficient:** Smart filtering happens first, expensive AI analysis second. Your tokens (and money) only get spent on files that matter.
3.  **No-Nonsense Cost Tracking:** See costs in real-time, for every single operation. No magic numbers.
4.  **You're in Control:** Customize everything. Your project, your rules. Edit plans directly.
5.  **Your Code Stays Yours:** Local-first. Privacy-first. Period.
6.  **Council of LLMs:** Multiple AI models analyze your problem from different angles. We synthesize all their insights into one superior plan.
7.  **Never Start from Scratch:** Persistent sessions with complete history. Your task descriptions, file selections, search terms—everything is preserved. Close the app, come back next week, pick up exactly where you left off.
8.  **Truly Parallel:** Built for the impatient developer. Run everything at once. Never wait.

## Built for You, With You

Look, I built this because I was drowning in AI babysitting duty. But this isn't just my tool—it's ours. I want us all to be more productive, to spend less time wrestling with context and more time building cool stuff.

**Got ideas? Hit a bug? Something not working quite right?** Head over to our [FeatureBase portal](https://vibemanager.featurebase.app) to:
- Submit feature requests and bug reports
- Vote on what we should build next
- See what's in development
- Connect with other developers who get it

This is a tool built by a developer who wanted their weekends back, for developers who miss building cool stuff. Let's make development fun again—together.

## Getting Started

1.  **Download and Install:** Get the app for your OS (Windows, macOS, Linux).
2.  **Authenticate:** Log in with Google, GitHub, Microsoft, or Apple.
3.  **Select Your Project:** Point it to your local Git repository.
4.  **Describe Your Task:** Use your voice or keyboard. Let the AI refine it.
5.  **Curate Context:** Run the File Finder and/or Deep Research workflows.
6.  **Generate &amp; Merge Plans:** Create plans from your favorite models and merge them.
7.  **Execute:** Copy the final plan into your AI agent of choice and watch it build correctly the first time.

## Pricing

Let's be frank: with heavy use, this can cost $300+ a month. But this investment pays for itself in productivity and peace of mind. Every operation reports its exact cost in real-time, so you are always in control of your budget.

### Free Credits
- New users receive free credits to try everything out (3-day expiration).
- Full access to all features and AI models.

### Paid Credits
- Pay-as-you-go for what you use. No subscriptions.
- Auto top-off option available.
- Processing fees on credit purchases, which are lower for larger amounts:
  - Under $30: 20% fee
  - $30-$300: 10% fee
  - Over $300: 5% fee

### Enterprise
- Custom system prompts, admin controls, and volume pricing are available. Contact us for details.

No subscriptions. No hidden fees. Pay only for what you use.

---

[Download](#) | [Documentation](#) | [API Reference](#) | [Contact](#)