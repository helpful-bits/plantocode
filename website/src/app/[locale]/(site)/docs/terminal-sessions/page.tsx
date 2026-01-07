import type { Metadata } from 'next';
import { DocsArticle } from '@/components/docs/DocsArticle';
import { DocsMediaBlock } from '@/components/docs/DocsMediaBlock';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { loadMessages, type Locale } from '@/lib/i18n';
import { locales } from '@/i18n/config';
import { generatePageMetadata } from '@/content/metadata';

export async function generateMetadata({ params }: { params: Promise<{ locale: Locale }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await loadMessages(locale);

  return generatePageMetadata({
    locale,
    slug: '/docs/terminal-sessions',
    title: t['terminalSessions.meta.title'] || 'Terminal Sessions - PlanToCode',
    description: t['terminalSessions.meta.description'] || 'Technical guide to PTY terminal implementation: portable-pty management, output buffering, session states, and mobile connectivity.',
  });
}

export function generateStaticParams() {
  return locales.map((locale: Locale) => ({ locale }));
}

export default async function TerminalSessionsDocPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  const t = await loadMessages(locale);

  // Session states for the state machine section
  const sessionStates = [
    { state: 'Initializing', description: 'PTY spawn in progress, not yet ready for input' },
    { state: 'Running', description: 'PTY active, accepting input and producing output' },
    { state: 'Suspended', description: 'PTY paused (SIGSTOP), can be resumed' },
    { state: 'Exited', description: 'PTY process terminated with exit code' },
    { state: 'Killed', description: 'PTY forcibly terminated (SIGKILL)' },
    { state: 'Error', description: 'PTY encountered unrecoverable error' },
    { state: 'Restored', description: 'Session recovered from SQLite after app restart' },
  ];

  return (
    <DocsArticle
      title={t['terminalSessions.title'] || 'Terminal Sessions'}
      description={t['terminalSessions.description'] || 'PTY-based terminal emulation with dual output routing, 32MB buffering, and SQLite persistence.'}
      date={t['terminalSessions.date'] || '2025-09-22'}
      readTime={t['terminalSessions.readTime'] || '12 min'}
      category={t['terminalSessions.category'] || 'Execution'}
    >
      <p className="text-base text-muted-foreground leading-relaxed mb-6">
        Terminal sessions are managed by <code className="px-1.5 py-0.5 rounded bg-muted text-sm font-mono">terminal_manager.rs</code> (41KB),
        which provides PTY-based terminal emulation using the <code className="px-1.5 py-0.5 rounded bg-muted text-sm font-mono">portable-pty</code> crate.
        Each session maintains dual output channels for local consumption and remote WebSocket clients, with a 32MB in-memory buffer
        per session and automatic SQLite persistence every 10 seconds.
      </p>

      <DocsMediaBlock
        className="mb-12"
        title={t['terminalSessions.visuals.sessionView.title'] || 'Terminal session architecture'}
        description={t['terminalSessions.visuals.sessionView.description'] || 'PTY process lifecycle, output routing, and persistence layers.'}
        imageSrc={t['terminalSessions.visuals.sessionView.imageSrc'] || '/images/docs/terminal-sessions/session-view.png'}
        imageAlt={t['terminalSessions.visuals.sessionView.imageAlt'] || 'Terminal session architecture showing PTY, channels, and persistence'}
        caption={t['terminalSessions.visuals.sessionView.caption']}
      />

      {/* PTY Management Section */}
      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">PTY Management with portable-pty</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed mb-4">
            The terminal manager uses the <code className="px-1.5 py-0.5 rounded bg-muted text-sm font-mono">portable-pty</code> crate
            to spawn pseudo-terminal processes. Each PTY is configured with the user's default shell, working directory, and environment
            variables. The manager maintains a HashMap of active sessions keyed by session_id.
          </p>
          <div className="bg-muted/30 rounded-lg p-4 mt-4">
            <h4 className="text-sm font-semibold text-foreground mb-2">PTY Operations</h4>
            <ul className="text-sm text-muted-foreground space-y-2">
              <li>• <strong>PTY spawning:</strong> CommandBuilder with shell path, args, cwd, and env vars passed to PtySystem::default().openpty()</li>
              <li>• <strong>Terminal sizing:</strong> PtySize struct with rows, cols, pixel_width, pixel_height sent via master.resize()</li>
              <li>• <strong>Output reading:</strong> Blocking read loop on master.try_clone_reader() with configurable buffer size</li>
              <li>• <strong>Input writing:</strong> master.take_writer() for stdin, supporting raw bytes and escape sequences</li>
            </ul>
          </div>
        </GlassCard>
      </section>

      {/* Dual Output Routing Section */}
      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">Dual Output Routing</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed mb-4">
            Each session maintains two output destinations: a local Channel for UI consumption and WebSocket connections for mobile clients.
            Output is broadcast to all connected receivers without blocking the PTY read loop.
          </p>
          <div className="grid md:grid-cols-2 gap-4 mt-4">
            <div className="bg-muted/30 rounded-lg p-4">
              <h4 className="text-sm font-semibold text-foreground mb-2">Local Channel</h4>
              <p className="text-sm text-muted-foreground">
                tokio::sync::mpsc::channel with 1024-message buffer for UI updates. The React TerminalView component
                consumes this channel and renders output in real-time.
              </p>
            </div>
            <div className="bg-muted/30 rounded-lg p-4">
              <h4 className="text-sm font-semibold text-foreground mb-2">Remote WebSocket</h4>
              <p className="text-sm text-muted-foreground">
                Binary frames sent to connected mobile clients via device link. Uses PTC1 framing protocol for
                efficient multiplexed streaming.
              </p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground mt-4">
            <strong>Broadcast pattern:</strong> Output is cloned to each receiver; slow consumers are dropped to prevent backpressure
            from affecting the PTY read loop.
          </p>
        </GlassCard>
      </section>

      {/* 32MB Buffer Section */}
      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">32MB In-Memory Buffer</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed mb-4">
            Each session maintains a 32MB circular buffer for output history. This allows clients to reconnect and receive recent
            output without querying the database. The buffer automatically evicts oldest content when full.
          </p>
          <div className="bg-slate-900 rounded-lg p-4 mt-4 border border-slate-700">
            <pre className="text-slate-100 text-sm"><code>{`// Buffer configuration
const BUFFER_SIZE: usize = 32 * 1024 * 1024; // 32MB per session

struct SessionBuffer {
    data: VecDeque<u8>,
    write_offset: usize,
}

impl SessionBuffer {
    fn push(&mut self, bytes: &[u8]) {
        // Evict from front if buffer full
        while self.data.len() + bytes.len() > BUFFER_SIZE {
            self.data.pop_front();
        }
        self.data.extend(bytes);
        self.write_offset += bytes.len();
    }

    fn get_since(&self, offset: usize) -> &[u8] {
        // Return bytes from offset to current end
    }
}`}</code></pre>
          </div>
        </GlassCard>
      </section>

      {/* PTC1 Binary Framing Section */}
      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">PTC1 Binary Framing for Mobile</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed mb-4">
            Mobile clients receive terminal output using the PTC1 binary framing protocol. This compact format includes message type,
            session ID, and payload length to support multiplexed session streams over a single WebSocket connection.
          </p>
          <div className="bg-slate-900 rounded-lg p-4 mt-4 border border-slate-700">
            <pre className="text-slate-100 text-sm"><code>{`// PTC1 Frame Structure
┌─────────────────────────────────────────────────────┐
│  Type   │     Session UUID      │  Payload Length   │
│ (1 byte)│     (16 bytes)        │   (4 bytes LE)    │
├─────────────────────────────────────────────────────┤
│                   Payload Data                      │
│                 (variable length)                   │
└─────────────────────────────────────────────────────┘

Message Types:
  0x01 = Terminal output
  0x02 = Resize notification
  0x03 = Input acknowledgment
  0x04 = State change event`}</code></pre>
          </div>
          <p className="text-sm text-muted-foreground mt-4">
            The compact header (21 bytes) minimizes overhead for real-time streaming to bandwidth-constrained mobile clients.
          </p>
        </GlassCard>
      </section>

      {/* Session State Machine Section */}
      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">Session State Machine</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed mb-4">
            Sessions transition through defined states that reflect the PTY process lifecycle and recovery status.
          </p>
          <div className="grid gap-3 mt-4">
            {sessionStates.map((item) => (
              <div key={item.state} className="flex items-start gap-3 bg-muted/30 rounded-lg p-3">
                <span className="px-2 py-1 rounded bg-primary/10 text-primary text-xs font-mono font-semibold">
                  {item.state}
                </span>
                <span className="text-sm text-muted-foreground">{item.description}</span>
              </div>
            ))}
          </div>
        </GlassCard>
      </section>

      {/* SQLite Persistence Section */}
      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">SQLite Persistence with 10-Second Flush</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed mb-4">
            Session state and output logs are flushed to SQLite every 10 seconds. This provides durability without impacting PTY performance.
            On app restart, sessions in Running or Suspended state are restored from the database.
          </p>
          <div className="bg-slate-900 rounded-lg p-4 mt-4 border border-slate-700">
            <pre className="text-slate-100 text-sm"><code>{`-- terminal_sessions table schema
CREATE TABLE terminal_sessions (
    session_id      TEXT PRIMARY KEY,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL,
    status          TEXT NOT NULL,  -- Initializing|Running|Suspended|Exited|...
    exit_code       INTEGER,
    working_dir     TEXT NOT NULL,
    env_vars        TEXT,           -- JSON object
    output_log      BLOB            -- Full session output for restoration
);

-- Restoration query on startup
SELECT * FROM terminal_sessions
WHERE status IN ('Running', 'Suspended');`}</code></pre>
          </div>
          <div className="bg-muted/30 rounded-lg p-4 mt-4">
            <h4 className="text-sm font-semibold text-foreground mb-2">Persistence Details</h4>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>• <strong>Flush interval:</strong> 10 seconds via tokio::time::interval</li>
              <li>• <strong>Output log:</strong> BLOB column containing full session output history</li>
              <li>• <strong>Restoration:</strong> Replay output_log to buffer, resume PTY monitoring</li>
            </ul>
          </div>
        </GlassCard>
      </section>

      {/* Health Checks Section */}
      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">Health Checks: PTY + Database</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed mb-4">
            Health checks combine PTY process status with database records to determine session liveness. This dual-source approach
            handles edge cases where the PTY dies without updating the database.
          </p>
          <div className="bg-muted/30 rounded-lg p-4 mt-4">
            <h4 className="text-sm font-semibold text-foreground mb-2">Health Check Process</h4>
            <ul className="text-sm text-muted-foreground space-y-2">
              <li>• <strong>PTY check:</strong> try_wait() on child process to detect exit without blocking</li>
              <li>• <strong>Database check:</strong> Query terminal_sessions for status and updated_at timestamp</li>
              <li>• <strong>Reconciliation:</strong> If PTY dead but DB shows Running, update status to Exited with detected exit code</li>
            </ul>
          </div>
        </GlassCard>
      </section>

      {/* Session Lifecycle Section */}
      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">Session Lifecycle</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed mb-4">
            Sessions follow a predictable lifecycle from creation through termination or restoration. The UI component initiates sessions,
            the terminal manager handles PTY operations, and the persistence layer ensures durability.
          </p>
          <div className="space-y-4 mt-4">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">1</div>
              <div>
                <h4 className="font-semibold">Create</h4>
                <p className="text-sm text-muted-foreground">UI calls create_terminal_session command with working_dir and env overrides</p>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">2</div>
              <div>
                <h4 className="font-semibold">Stream</h4>
                <p className="text-sm text-muted-foreground">Output flows through mpsc channel to TerminalView component for rendering</p>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">3</div>
              <div>
                <h4 className="font-semibold">Input</h4>
                <p className="text-sm text-muted-foreground">Keystrokes sent via write_to_terminal command, supporting raw mode and escape sequences</p>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">4</div>
              <div>
                <h4 className="font-semibold">Terminate</h4>
                <p className="text-sm text-muted-foreground">close_terminal_session sends SIGTERM, waits 5s, then SIGKILL if needed</p>
              </div>
            </div>
          </div>
        </GlassCard>
      </section>

      {/* Agent Attention Detection Section */}
      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">Agent Attention Detection</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed mb-4">
            The terminal monitors agent activity through a two-level inactivity detection system. When an agent stops producing output,
            the system progressively alerts you to check what has happened:
          </p>
          <div className="space-y-3 mt-4">
            <div className="bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
              <h4 className="text-sm font-semibold text-yellow-800 dark:text-yellow-200">Level 1 (30 seconds)</h4>
              <p className="text-sm text-yellow-700 dark:text-yellow-300">Agent idle - may have completed task. Yellow indicator displayed.</p>
            </div>
            <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg p-4">
              <h4 className="text-sm font-semibold text-red-800 dark:text-red-200">Level 2 (2 minutes)</h4>
              <p className="text-sm text-red-700 dark:text-red-300">Agent requires attention - check terminal. Red indicator and desktop notification.</p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground mt-4">
            Attention indicators clear automatically when new output is received. This helps track when agents have finished tasks
            or need guidance without guessing why they stopped.
          </p>
        </GlassCard>
      </section>

      {/* Dependency Checks Section */}
      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">Dependency and Shell Detection</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed mb-4">
            Before launching commands, the terminal checks for configured CLI tools and reports the default shell. This ensures users
            know which environment will run and whether required tools are available.
          </p>
          <div className="bg-muted/30 rounded-lg p-4 mt-4">
            <ul className="text-sm text-muted-foreground space-y-2">
              <li>• <strong>Shell detection:</strong> SHELL env var on Unix, ComSpec on Windows, fallback to /bin/sh or cmd.exe</li>
              <li>• <strong>Tool checks:</strong> which/where command for configured CLI binaries (claude, aider, cursor, etc.)</li>
              <li>• <strong>Reporting:</strong> Missing tools surfaced in UI before session creation to prevent failed executions</li>
            </ul>
          </div>
        </GlassCard>
      </section>

      {/* Voice and Recovery Section */}
      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">Voice Transcription and Recovery</h2>
        <div className="grid md:grid-cols-2 gap-6">
          <GlassCard className="p-6">
            <h3 className="text-lg font-semibold mb-3">Voice Input</h3>
            <p className="text-muted-foreground leading-relaxed">
              Voice transcription can capture speech and paste it into the terminal input area. The recording hook looks up
              project-level transcription settings, tracks recording state, and streams recognized text into the active plan session.
            </p>
          </GlassCard>
          <GlassCard className="p-6">
            <h3 className="text-lg font-semibold mb-3">Session Recovery</h3>
            <p className="text-muted-foreground leading-relaxed">
              If a PTY session disconnects, the terminal surface displays recovery controls and retries with exponential backoff.
              Health checks continue monitoring session state and provide automatic recovery actions when connection issues are detected.
            </p>
          </GlassCard>
        </div>
      </section>

      {/* CTA Section */}
      <div className="mt-16">
        <GlassCard className="p-6" highlighted>
          <h2 className="text-xl font-semibold mb-3">Connect terminals to execution</h2>
          <p className="text-muted-foreground leading-relaxed mb-4">
            See how copy buttons hand off plan content to terminal sessions for agent execution.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <Button asChild size="lg">
              <Link href="/docs/copy-buttons">Copy buttons</Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href="/docs/architecture">Architecture docs</Link>
            </Button>
          </div>
        </GlassCard>
      </div>
    </DocsArticle>
  );
}
