import React, { useEffect, useRef } from "react";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal, type IDisposable } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";

interface TerminalViewProps {
  onData?: (data: string) => void;
  onReady?: (term: import('@xterm/xterm').Terminal) => void;
  onResize?: (cols: number, rows: number) => void;
  height?: number | string;
}

export const TerminalView: React.FC<TerminalViewProps> = ({ onData, onReady, onResize, height = "100%" }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const dataListenerRef = useRef<IDisposable | null>(null);
  const resizeListenerRef = useRef<IDisposable | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const disposedRef = useRef<boolean>(false);
  
  // Store callbacks in refs to avoid re-creation issues
  const onDataRef = useRef<((data: string) => void) | undefined>(onData);
  const onReadyRef = useRef<((term: Terminal) => void) | undefined>(onReady);
  const onResizeRef = useRef<((cols: number, rows: number) => void) | undefined>(onResize);
  
  // Update callback refs when props change
  onDataRef.current = onData;
  onReadyRef.current = onReady;
  onResizeRef.current = onResize;

  // Safe fit function with guards
  const safeFit = () => {
    if (disposedRef.current || !fitAddonRef.current || !containerRef.current) return;
    
    const container = containerRef.current;
    const rect = container.getBoundingClientRect();
    
    // Guard against zero dimensions to prevent "_renderer.value.dimensions" errors
    if (rect.width > 0 && rect.height > 0) {
      try {
        fitAddonRef.current.fit();
      } catch (error) {
        // Silently ignore fit errors that can occur during rapid resize or disposal
        if (import.meta.env.DEV) {
          console.warn('Terminal fit error:', error);
        }
      }
    }
  };

  useEffect(() => {
    if (!containerRef.current || disposedRef.current) return;

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

    // Use callback refs to prevent re-creation
    dataListenerRef.current = term.onData((data) => {
      if (!disposedRef.current) {
        onDataRef.current?.(data);
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

    // Setup resize observer with safe fit
    const resizeObserver = new ResizeObserver(() => {
      if (!disposedRef.current) {
        safeFit();
      }
    });
    resizeObserverRef.current = resizeObserver;
    resizeObserver.observe(containerRef.current);

    return () => {
      disposedRef.current = true;
      
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
};