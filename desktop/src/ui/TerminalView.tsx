import React, { useEffect, useRef } from "react";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal, type IDisposable } from "@xterm/xterm";
import { Command, Child } from "@tauri-apps/plugin-shell";
import "@xterm/xterm/css/xterm.css";

interface TerminalViewProps {
  command: Command<string> | null;
  initialPrompt?: string;
}

export const TerminalView: React.FC<TerminalViewProps> = ({ command, initialPrompt }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const dataListenerRef = useRef<IDisposable | null>(null);
  const childProcessRef = useRef<Child | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new Terminal({
      theme: {
        background: "#1e1e1e",
        foreground: "#cccccc",
        cursor: "#ffffff",
        cursorAccent: "#000000",
        selectionBackground: "#3399ff",
      },
      fontSize: 14,
      fontFamily: "Menlo, Monaco, 'Courier New', monospace",
      cursorBlink: true,
      scrollback: 10000,
      convertEol: true,
    });
    const fitAddon = new FitAddon();

    termRef.current = term;
    fitAddonRef.current = fitAddon;

    term.loadAddon(fitAddon);
    term.open(containerRef.current);

    requestAnimationFrame(() => {
      fitAddon.fit();
    });

    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      term.dispose();
    };
  }, []);

  useEffect(() => {
    if (!command || !termRef.current) return;

    const terminal = termRef.current;
    let isClaudeReady = false;

    dataListenerRef.current = terminal.onData((data) => {
      if (childProcessRef.current) {
        childProcessRef.current.write(data).catch((err) => {
          console.error("Failed to write to stdin:", err);
        });
      }
    });

    command.stdout.on("data", (data: string) => {
      terminal.write(data);
      
      if (!isClaudeReady && (data.includes("You:") || data.includes(">") || data.includes("Claude:"))) {
        isClaudeReady = true;
        
        if (initialPrompt && childProcessRef.current) {
          setTimeout(() => {
            childProcessRef.current?.write(initialPrompt + "\n").catch((err) => {
              console.error("Failed to send initial prompt:", err);
            });
          }, 100);
        }
      }
    });

    command.stderr.on("data", (data: string) => {
      terminal.write(data);
    });

    command.on("close", (data) => {
      terminal.writeln(`\n\x1b[33mClaude session ended (exit code: ${data.code})\x1b[0m`);
    });

    command.on("error", (error: string) => {
      terminal.writeln(`\x1b[31mError: ${error}\x1b[0m`);
    });

    command.spawn()
      .then((childProcess) => {
        childProcessRef.current = childProcess;
      })
      .catch((error) => {
        terminal.writeln(`\x1b[31mFailed to start Claude: ${error}\x1b[0m`);
      });

    return () => {
      if (dataListenerRef.current) {
        dataListenerRef.current.dispose();
      }

      if (childProcessRef.current) {
        childProcessRef.current.kill().catch(() => {});
        childProcessRef.current = null;
      }
      
      command.stdout.removeAllListeners();
      command.stderr.removeAllListeners();
      command.removeAllListeners();
    };
  }, [command, initialPrompt]);

  return (
    <div 
      ref={containerRef} 
      style={{ width: "100%", height: "100%", backgroundColor: "#1e1e1e" }}
    />
  );
};