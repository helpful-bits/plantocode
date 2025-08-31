import * as React from "react";
import "./vibe_manager_ad.css";

interface PanelProps {
  x: number;
  y: number;
  glow?: boolean;
  accent?: boolean;
  children: React.ReactNode;
}

interface ChevronProps {
  cx: number;
  cy: number;
}

export default function VibeManagerAd() {
  const Panel = ({ x, y, glow, accent, children }: PanelProps) => (
    <div
      className={`panel ${accent ? 'panel--accent' : ''} ${glow ? 'panel--glow' : ''}`}
      style={{ left: x, top: y }}
    >
      {children}
    </div>
  );

  const Chevron = ({ cx, cy }: ChevronProps) => (
    <div
      className="chevron"
      style={{ left: cx - 20, top: cy - 20 }}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
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
    <div className="ad-container">
      {/* Title */}
      <h1 className="title">
        From idea to solid plan. Fast.
      </h1>

      {/* Subtitle */}
      <p className="subtitle">
        AI finds the right files. Then builds you a plan.
      </p>

      {/* Panels */}
      <Panel x={40} y={145}>
        <h2 className="panel__title">Find Files</h2>
        
        <div className="intent-box">
          <div className="intent-box__item">
            <svg className="intent-box__check" width="20" height="20" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
              <path d="M8 12l3 3 5-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Regex Filter
          </div>
          <div className="intent-box__item">
            <svg className="intent-box__check" width="20" height="20" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
              <path d="M8 12l3 3 5-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            File Content Relevance
          </div>
          <div className="intent-box__item">
            <svg className="intent-box__check" width="20" height="20" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
              <path d="M8 12l3 3 5-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Dependencies
          </div>
        </div>

        <p className="panel__description">
          AI reads actual code content. From 1,000 files to the 10 that matter.
        </p>
      </Panel>

      <Panel x={440} y={145} accent glow>
        <h2 className="panel__title panel__title--accent">Parallel Planning</h2>
        
        <div className="models-container">
          {models.map((model, i) => (
            <div key={model.name} className="model-card" style={{ top: i * 48 }}>
              <div className="model-card__header">
                <span className="model-card__name">{model.name}</span>
                <span className="model-card__progress">{model.progress}%</span>
              </div>
              <div className="progress-bar">
                <div 
                  className="progress-bar__fill" 
                  style={{ width: `${model.progress}%` }}
                />
              </div>
              <div className="model-card__status">{model.status}</div>
            </div>
          ))}
        </div>

        <p className="panel__description">
          Click multiple times for more plans. Merge the best ideas.
        </p>
      </Panel>

      <Panel x={840} y={145}>
        <h2 className="panel__title">Plan for Claude Code</h2>
        
        <div className="code-block">
          <pre className="code-block__content">
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

        <p className="panel__description">
          Copy straight to Claude Code or Cursor. Ready to ship.
        </p>
      </Panel>

      {/* Chevrons */}
      <Chevron cx={420} cy={385} />
      <Chevron cx={820} cy={385} />

      {/* Footer tagline */}
      <footer className="footer">
        Local-first. Free credits. No subscriptions.
      </footer>
    </div>
  );
}