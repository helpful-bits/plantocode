import * as React from "react";
import "./vibe_manager_ad_mobile.css";

interface PanelProps {
  glow?: boolean;
  accent?: boolean;
  children: React.ReactNode;
}

export default function VibeManagerAdMobile() {
  const Panel = ({ glow, accent, children }: PanelProps) => (
    <div
      className={`panel-mobile ${accent ? 'panel-mobile--accent' : ''} ${glow ? 'panel-mobile--glow' : ''}`}
    >
      {children}
    </div>
  );

  const Chevron = () => (
    <div className="chevron-mobile">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
        <path
          d="M8 5l7 7-7 7"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );

  const models = [
    { name: "Claude 4", progress: 85, status: "Analyzing patterns..." },
    { name: "GPT-5", progress: 72, status: "Structuring approach..." },
    { name: "Gemini 2.5 Pro", progress: 91, status: "Reviewing trade-offs..." }
  ];

  return (
    <div className="ad-container-mobile">
      <header className="header-mobile">
        <h1 className="title-mobile">
          From idea to solid plan. Fast.
        </h1>
        <p className="subtitle-mobile">
          AI finds the right files. Then builds you a plan.
        </p>
      </header>

      <main className="main-content-mobile">
        <Panel>
          <h2 className="panel-mobile__title">Find Files</h2>
          
          <div className="intent-box-mobile">
            <div className="intent-box-mobile__item">
              <svg className="intent-box-mobile__check" width="18" height="18" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
                <path d="M8 12l3 3 5-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Regex Filter
            </div>
            <div className="intent-box-mobile__item">
              <svg className="intent-box-mobile__check" width="18" height="18" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
                <path d="M8 12l3 3 5-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              File Content Relevance
            </div>
            <div className="intent-box-mobile__item">
              <svg className="intent-box-mobile__check" width="18" height="18" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
                <path d="M8 12l3 3 5-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Dependencies
            </div>
          </div>

          <p className="panel-mobile__description">
            AI reads actual code content. From 1,000 files to the 10 that matter.
          </p>
        </Panel>

        <Chevron />

        <Panel accent glow>
          <h2 className="panel-mobile__title panel-mobile__title--accent">Parallel Planning</h2>
          
          <div className="models-container-mobile">
            {models.map((model) => (
              <div key={model.name} className="model-card-mobile">
                <div className="model-card-mobile__header">
                  <span className="model-card-mobile__name">{model.name}</span>
                  <span className="model-card-mobile__progress">{model.progress}%</span>
                </div>
                <div className="progress-bar-mobile">
                  <div 
                    className="progress-bar-mobile__fill" 
                    style={{ width: `${model.progress}%` }}
                  />
                </div>
                <div className="model-card-mobile__status">{model.status}</div>
              </div>
            ))}
          </div>

          <p className="panel-mobile__description">
            Click multiple times for more plans. Merge the best ideas.
          </p>
        </Panel>

        <Chevron />

        <Panel>
          <h2 className="panel-mobile__title">Plan for Claude Code</h2>
          
          <div className="code-block-mobile">
            <pre className="code-block-mobile__content">
{`<plan>
  <step>
    <file_operation>
      <path>src/components/</path>
      <changes>...</changes>
      <validation>tests</validation>
    </file_operation>
  </step>
  <step>
    <file_operation>
      <path>docs/README.md</path>
    </file_operation>
  </step>
</plan>`}
            </pre>
          </div>

          <p className="panel-mobile__description">
            Copy straight to Claude Code or Cursor. Ready to ship.
          </p>
        </Panel>
      </main>

      <footer className="footer-mobile">
        Local-first. Free credits. No subscriptions.
      </footer>
    </div>
  );
}