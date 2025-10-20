import React from 'react';

export default function TechnicalAccuracy() {
  return (
    <section aria-labelledby="technical-accuracy-title" className="mt-12 border rounded-lg p-5 bg-muted/30">
      <h2 id="technical-accuracy-title" className="text-xl font-semibold">Technical Details</h2>
      <p className="text-sm text-muted-foreground mt-1">
        This section provides accurate technical information about what PlanToCode actually does.
      </p>

      <div className="mt-4 space-y-3">
        <div>
          <h3 className="font-medium">Core Architecture</h3>
          <ul className="list-disc pl-5 text-sm">
            <li>Desktop application built with Tauri (Rust backend + TypeScript frontend)</li>
            <li>Local SQLite database for session persistence and job management</li>
            <li>Background job system with streaming support for long-running tasks</li>
            <li>Secure token storage using macOS Keychain</li>
          </ul>
        </div>

        <div>
          <h3 className="font-medium">Workflows &amp; Features</h3>
          <ul className="list-disc pl-5 text-sm">
            <li><strong>File Finder:</strong> Multi-stage processor pipeline (regex generation → relevance assessment → path finding → validation)</li>
            <li><strong>Web Search:</strong> Prompt generation and aggregated search execution</li>
            <li><strong>Implementation Planning:</strong> Generate and merge plans from multiple models</li>
            <li><strong>Video Analysis:</strong> Process and analyze video content</li>
            <li>All workflows run as queued background jobs with progress tracking</li>
          </ul>
        </div>

        <div>
          <h3 className="font-medium">Models &amp; Providers</h3>
          <ul className="list-disc pl-5 text-sm">
            <li>Server-configured model selection across multiple providers (OpenAI, Anthropic, Google, xAI)</li>
            <li>No local model configuration - all models validated and managed server-side</li>
            <li>Per-task model selection with configurable parameters</li>
            <li>Usage-based credits system via Stripe for billing</li>
          </ul>
        </div>

        <div>
          <h3 className="font-medium">Integration &amp; Compatibility</h3>
          <ul className="list-disc pl-5 text-sm">
            <li>Works alongside CLI tools like Claude CLI - complements, not replaces</li>
            <li>No MCP (Model Context Protocol) or router configuration required</li>
            <li>Not an IDE plugin - standalone desktop application</li>
            <li>Auth0 authentication for secure access to LLM features</li>
          </ul>
        </div>

        <div>
          <h3 className="font-medium">Platform Support</h3>
          <ul className="list-disc pl-5 text-sm">
            <li>macOS: Currently available with full feature support</li>
            <li>Windows: Support planned and in development</li>
            <li>Linux: Under consideration for future releases</li>
          </ul>
        </div>

        <div>
          <h3 className="font-medium">Important Limitations</h3>
          <ul className="list-disc pl-5 text-sm">
            <li>Does not execute models simultaneously - processes sequentially with optional plan merging</li>
            <li>Requires internet connection for LLM features</li>
            <li>Local file operations are explicit and user-controlled</li>
            <li>Not a replacement for IDE extensions or code editors</li>
          </ul>
        </div>
      </div>
    </section>
  );
}