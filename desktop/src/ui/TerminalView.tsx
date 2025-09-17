import React, { useEffect, useRef } from "react";
import { FitAddon } from "@xterm/addon-fit";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { WebglAddon } from "@xterm/addon-webgl";
import { Terminal, type IDisposable } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";

interface TerminalViewProps {
  onData?: (data: string) => void;
  onReady?: (term: import('@xterm/xterm').Terminal) => void;
  onResize?: (cols: number, rows: number) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  height?: number | string;
}

// Use React.memo to prevent unnecessary re-renders
export const TerminalView = React.memo<TerminalViewProps>(({ onData, onReady, onResize, onFocus, onBlur, height = "100%" }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const dataListenerRef = useRef<IDisposable | null>(null);
  const resizeListenerRef = useRef<IDisposable | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const disposedRef = useRef<boolean>(false);
  const resizeTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Store callbacks in refs to avoid re-creation issues
  const onDataRef = useRef<((data: string) => void) | undefined>(onData);
  const onReadyRef = useRef<((term: Terminal) => void) | undefined>(onReady);
  const onResizeRef = useRef<((cols: number, rows: number) => void) | undefined>(onResize);
  
  // Update callback refs when props change
  onDataRef.current = onData;
  onReadyRef.current = onReady;
  onResizeRef.current = onResize;


  // Note: enqueueWrite is currently unused but kept for potential future use
  // const enqueueWrite = (data: string) => {
  //   if (disposedRef.current || !termRef.current) return;
  //   outputQueueRef.current.push(data);
  //   if (!rafIdRef.current) {
  //     rafIdRef.current = requestAnimationFrame(flushOutputQueue);
  //   }
  // };

  const scheduleFit = (cb: () => void) => {
    const anyWindow: any = window;
    if (typeof anyWindow.requestIdleCallback === 'function') {
      anyWindow.requestIdleCallback(cb, { timeout: 250 });
    } else {
      requestAnimationFrame(() => cb());
      if (import.meta.env.DEV) console.warn('[terminal] requestIdleCallback unavailable; using RAF');
    }
  };

  const safeFit = () => {
    if (disposedRef.current || !fitAddonRef.current || !containerRef.current) return;

    const container = containerRef.current;
    const rect = container.getBoundingClientRect();

    if (rect.width > 0 && rect.height > 0) {
      scheduleFit(() => {
        try {
          fitAddonRef.current?.fit();
          // After fit, notify parent about size change
          if (termRef.current) {
            const cols = termRef.current.cols;
            const rows = termRef.current.rows;
            if (cols > 0 && rows > 0) {
              onResizeRef.current?.(cols, rows);
            }
          }
        } catch (error) {
          if (import.meta.env.DEV) {
            console.warn('Terminal fit error:', error);
          }
        }
      });
    }
  };

  useEffect(() => {
    if (!containerRef.current || disposedRef.current) return;

    // Platform detection for macOS-specific features
    const isMacOS = navigator.platform.toUpperCase().indexOf('MAC') >= 0;

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
      scrollback: 10000, // Reduced from 20000 for better performance
      convertEol: false,
      allowProposedApi: true,
      fastScrollModifier: 'ctrl', // Allow fast scrolling with ctrl
      // macOS: Option key acts as Meta like in Terminal.app
      macOptionIsMeta: isMacOS,
      windowsMode: navigator.platform.toLowerCase().includes("win"),
    });
    const fitAddon = new FitAddon();
    const unicode11Addon = new Unicode11Addon();

    termRef.current = term;
    fitAddonRef.current = fitAddon;

    // Load addons
    term.loadAddon(fitAddon);
    term.loadAddon(unicode11Addon);
    term.open(containerRef.current);

    // Stop propagation in capture phase for critical keys so modal doesn't intercept
    const stopCriticalKeys = (ev: KeyboardEvent) => {
      const isCtrlC = ev.ctrlKey && (ev.key === "c" || ev.key === "C");
      if (ev.key === "Escape" || ev.key === "Backspace" || ev.key === "Tab" || isCtrlC) {
        ev.stopPropagation();
      }
    };
    containerRef.current?.addEventListener("keydown", stopCriticalKeys, { capture: true });

    // Ensure terminal focuses on pointer interactions
    containerRef.current?.addEventListener("mousedown", () => term.focus(), { passive: true });

    // Enable Unicode 11 width tables for proper CJK/emoji alignment
    term.unicode.activeVersion = '11';

    // Prevent browser from intercepting critical keys, but let xterm handle everything
    term.attachCustomKeyEventHandler((e) => {
      // Prevent browser defaults for critical keys
      if (
        e.key === "Escape" ||
        e.key === "Backspace" ||
        e.key === "Tab" ||
        (e.ctrlKey && (e.key === "c" || e.key === "C"))
      ) {
        e.preventDefault?.();
      }
      // Always return true - xterm handles the key and fires onData
      // The PTY will echo back what should be displayed
      return true;
    });

    // Try to load WebGL renderer only if explicitly enabled
    if (typeof window !== "undefined" && window.localStorage?.getItem("terminal.renderer") === "webgl") {
      try {
        const webglAddon = new WebglAddon();
        term.loadAddon(webglAddon);
      } catch (error) {
        if (import.meta.env.DEV) {
          console.info('WebGL renderer not available, using canvas renderer');
        }
      }
    }

    // Use callback refs to prevent re-creation
    dataListenerRef.current = term.onData((data) => {
      if (!disposedRef.current) {
        onDataRef.current?.(data);
      }
    });

    // Add focus and blur event handlers
    term.textarea?.addEventListener('focus', () => {
      onFocus?.();
    });

    term.textarea?.addEventListener('blur', () => {
      onBlur?.();
    });

    // Right-click paste support (respects bracketed paste mode)
    containerRef.current.addEventListener('contextmenu', async (e) => {
      e.preventDefault();
      try {
        const text = await navigator.clipboard.readText();
        if (text && termRef.current) {
          // Use term.paste() to respect bracketed paste mode
          termRef.current.paste(text);
        }
      } catch (error) {
        // Clipboard access may be denied
        if (import.meta.env.DEV) {
          console.warn('Clipboard paste failed:', error);
        }
      }
    });

    // Initial fit with proper timing and guards
    requestAnimationFrame(() => {
      if (disposedRef.current) return;
      
      safeFit();
      
      if (!disposedRef.current && termRef.current) {
        termRef.current.focus();
        
        // Register resize handler after fit
        resizeListenerRef.current = termRef.current.onResize(({ cols, rows }) => {
          if (!disposedRef.current) {
            onResizeRef.current?.(cols, rows);
          }
        });
        
        onReadyRef.current?.(termRef.current);
      }
    });

    // Setup resize observer with throttled safe fit
    const resizeObserver = new ResizeObserver(() => {
      if (!disposedRef.current) {
        // Throttle resize handling for better performance
        if (resizeTimeoutRef.current) {
          clearTimeout(resizeTimeoutRef.current);
        }
        resizeTimeoutRef.current = setTimeout(() => {
          safeFit();
          resizeTimeoutRef.current = null;
        }, 100); // Throttle to 100ms
      }
    });
    resizeObserverRef.current = resizeObserver;
    resizeObserver.observe(containerRef.current);

    return () => {
      disposedRef.current = true;

      containerRef.current?.removeEventListener("keydown", stopCriticalKeys, { capture: true });

      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current);
        resizeTimeoutRef.current = null;
      }

      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
        resizeObserverRef.current = null;
      }

      if (resizeListenerRef.current) {
        resizeListenerRef.current.dispose();
        resizeListenerRef.current = null;
      }

      if (dataListenerRef.current) {
        dataListenerRef.current.dispose();
        dataListenerRef.current = null;
      }

      if (termRef.current) {
        termRef.current.dispose();
        termRef.current = null;
      }

      fitAddonRef.current = null;
    };
  }, []); // Empty dependency array ensures terminal is created only once


  return (
    <div
      ref={containerRef}
      style={{ width: "100%", height: height, backgroundColor: "#1e1e1e" }}
    />
  );
});

TerminalView.displayName = 'TerminalView';