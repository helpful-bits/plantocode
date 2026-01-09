"use client";
import React, { useCallback, useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { useTerminalSessions } from "@/contexts/terminal-sessions";
import { safeListen } from "@/utils/tauri-event-utils";

interface Props {
  sessionId: string;
  isVisible: boolean;
}

// OS-aware path quoting for terminal input
const quotePathForTerminal = (path: string): string => {
  // Detect OS from user agent or use Tauri API
  const isWindows = navigator.platform.toLowerCase().includes('win');

  if (isWindows) {
    // Windows: use double quotes if path contains spaces
    return path.includes(' ') ? `"${path}"` : path;
  } else {
    // Unix: escape spaces with backslash
    return path.replace(/ /g, '\\ ');
  }
};

// Global terminal instances that persist across modal open/close
const terminalInstances = new Map<string, {
  terminal: Terminal;
  fitAddon: FitAddon;
  cleanup: () => void;
  hydrated: boolean;
  lastCols?: number;
  lastRows?: number;
  rafFitId?: number;
}>();

// Export cleanup function for external use
export const cleanupTerminalInstance = (sessionId: string) => {
  const instance = terminalInstances.get(sessionId);
  if (instance) {
    instance.cleanup();
  }
};

const TerminalView: React.FC<Props> = ({ sessionId, isVisible }) => {
  const { setOutputBytesCallback, removeOutputBytesCallback, write, resize, ensureSessionReady, setVisibleSessionId, getHydratedSnapshotBytes } = useTerminalSessions();
  const containerRef = useRef<HTMLDivElement | null>(null);

  const parseUriListToPaths = (uriList: string): string[] => {
    const lines = uriList.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const isWindows = navigator.userAgent.includes("Windows") || navigator.platform.startsWith("Win");
    const paths: string[] = [];

    for (const line of lines) {
      if (line.startsWith('#')) continue;

      let path = line;
      if (path.startsWith('file://')) {
        path = decodeURIComponent(path.slice(7));
      }

      if (isWindows) {
        if (path.startsWith('/') && path.length > 2 && path[2] === ':') {
          path = path.slice(1);
        } else if (path.startsWith('//')) {
          path = '\\' + path.slice(1).replace(/\//g, '\\');
        }
      }

      paths.push(path);
    }

    return Array.from(new Set(paths));
  };

  const extractPathsFromDataTransfer = (dt: DataTransfer | null): string[] => {
    if (!dt) return [];

    const uriList = dt.getData('text/uri-list');
    if (uriList) {
      const paths = parseUriListToPaths(uriList);
      if (paths.length > 0) return paths;
    }

    const textPlain = dt.getData('text/plain');
    if (textPlain) {
      const paths = parseUriListToPaths(textPlain);
      if (paths.length > 0) return paths;
      if (textPlain.startsWith('/') || /^[A-Z]:\\/i.test(textPlain)) {
        return [textPlain];
      }
    }

    const filePaths: string[] = [];
    for (let i = 0; i < dt.files.length; i++) {
      const file = dt.files[i];
      const path = (file as any).path;
      if (path) filePaths.push(path);
    }

    return Array.from(new Set(filePaths));
  };

  // Define drag handlers BEFORE getOrCreateTerminal so they can be referenced
  // Use native DragEvent (not React.DragEvent) since these are attached via addEventListener
  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Set dropEffect to indicate this is a valid drop target
    e.dataTransfer!.dropEffect = 'copy';
  };

  const handleDragEnter = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragLeave = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = useCallback(async (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const dataTransfer = e.dataTransfer;
    if (!dataTransfer) {
      return;
    }

    const extractedPaths = extractPathsFromDataTransfer(dataTransfer);
    const resolvedPaths: string[] = [...extractedPaths];
    const files = Array.from(dataTransfer.files);

    for (const file of files) {
      const filePath = (file as any).path;
      if (filePath && !resolvedPaths.includes(filePath)) {
        resolvedPaths.push(filePath);
      }

      if (file.type.startsWith('image/')) {
        try {
          const arrayBuffer = await file.arrayBuffer();
          const data = new Uint8Array(arrayBuffer);

          const { savePastedImage } = await import('@/actions/image/image.actions');
          const imagePath = await savePastedImage(
            sessionId,
            data,
            file.name,
            file.type
          );

          write(sessionId, quotePathForTerminal(imagePath));
        } catch (error) {
          console.error('Failed to handle dropped image:', error);
          write(sessionId, '[Image drop failed]\r\n');
        }
      }
    }

    if (resolvedPaths.length > 0) {
      const toWrite = resolvedPaths.map(p => quotePathForTerminal(p)).join(' ');
      write(sessionId, toWrite);
      return;
    }

    const plainText = dataTransfer.getData('text/plain');
    if (plainText) {
      const instance = terminalInstances.get(sessionId);
      if (instance?.terminal) {
        instance.terminal.paste(plainText);
      } else {
        write(sessionId, plainText);
      }
    }
  }, [sessionId, write]);

  const getOrCreateTerminal = () => {
    let instance = terminalInstances.get(sessionId);

    // Check if this is a reconnection scenario (terminal exists in backend but not frontend)
    // This happens after page reload
    if (!instance) {
      const term = new Terminal({
        convertEol: false,
        scrollback: 5000,
        fontSize: 13,
        fontFamily: "Menlo, Monaco, 'Cascadia Code', 'Cascadia Mono', Consolas, 'Courier New', monospace",
        fontWeight: 500,
        fontWeightBold: 700,
        allowProposedApi: true,
        macOptionIsMeta: true,
        rightClickSelectsWord: true,
        fastScrollModifier: 'alt',
        fastScrollSensitivity: 5,
        scrollSensitivity: 1,
        ignoreBracketedPasteMode: true,
      });

      const fit = new FitAddon();
      term.loadAddon(fit);

      const onData = term.onData((d) => write(sessionId, d));
      let ro: ResizeObserver | null = null;
      let pasteHandler: ((e: ClipboardEvent) => void) | null = null;
      let dragHandlers: Record<string, (e: Event) => void> | null = null;
      let tauriFileDropUnsubs: Array<() => void> = [];

      const cleanup = () => {
        removeOutputBytesCallback(sessionId);
        onData.dispose();
        ro?.disconnect();
        // Cancel any pending resize animation frame
        const inst = terminalInstances.get(sessionId);
        if (inst?.rafFitId) {
          cancelAnimationFrame(inst.rafFitId);
        }
        if (pasteHandler && term.element) {
          term.element.removeEventListener('paste', pasteHandler as any);
        }
        if (dragHandlers && term.element) {
          term.element.removeEventListener('dragover', dragHandlers['dragover'] as any);
          term.element.removeEventListener('dragenter', dragHandlers['dragenter'] as any);
          term.element.removeEventListener('dragleave', dragHandlers['dragleave'] as any);
          term.element.removeEventListener('drop', dragHandlers['drop'] as any);
        }
        if (tauriFileDropUnsubs) {
          for (const u of tauriFileDropUnsubs) {
            try { u(); } catch {}
          }
        }
        term.dispose();
        terminalInstances.delete(sessionId);
      };

      // Handle paste events for images
      pasteHandler = async (e: ClipboardEvent) => {
        const items = e.clipboardData?.items;
        if (items) {
          for (const item of items) {
            if (item.type.startsWith('image/')) {
              e.preventDefault();
              const blob = item.getAsFile();
              if (blob) {
                try {
                  // Convert to Uint8Array
                  const arrayBuffer = await blob.arrayBuffer();
                  const data = new Uint8Array(arrayBuffer);

                  // Save image and get path
                  const { savePastedImage } = await import('@/actions/image/image.actions');
                  const imagePath = await savePastedImage(
                    sessionId,
                    data,
                    blob.name,
                    blob.type
                  );

                  // Send to PTY so shell receives it
                  write(sessionId, quotePathForTerminal(imagePath));
                } catch (error) {
                  console.error('Failed to paste image:', error);
                  // Send error message to PTY
                  write(sessionId, '[Image paste failed]\r\n');
                }
              }
              return;
            }
          }
        }
        // Let xterm handle regular text paste
      };

      // Remove existing callback to prevent duplicates
      removeOutputBytesCallback(sessionId);

      setOutputBytesCallback(sessionId, (chunk: Uint8Array) => {
        term.write(chunk);
      });

      // Ensure we're attached to this session
      // This is critical for reconnection after page reload
      ensureSessionReady(sessionId, { jobId: sessionId, origin: 'adhoc' }).catch(console.error);

      instance = { terminal: term, fitAddon: fit, cleanup, hydrated: false, lastCols: undefined, lastRows: undefined, rafFitId: undefined };
      terminalInstances.set(sessionId, instance);

      (instance as any).pasteHandler = pasteHandler;
      (instance as any).dragHandlers = {
        dragover: handleDragOver,
        dragenter: handleDragEnter,
        dragleave: handleDragLeave,
        drop: (event: Event) => handleDrop(event as DragEvent)
      };
      (instance as any).tauriFileDropUnsubs = tauriFileDropUnsubs;

      // Set up resize observer when first attached to DOM
      const setupResizeObserver = (container: HTMLElement) => {
        if (ro) ro.disconnect();
        ro = new ResizeObserver(() => {
          // Cancel any pending fit operation
          if (instance!.rafFitId) {
            cancelAnimationFrame(instance!.rafFitId);
          }

          // Schedule fit for next frame (coalesce multiple resize events)
          instance!.rafFitId = requestAnimationFrame(() => {
            instance!.rafFitId = undefined;
            fit.fit();
            const { cols, rows } = term;

            // Only send resize if dimensions actually changed
            if (cols !== instance!.lastCols || rows !== instance!.lastRows) {
              instance!.lastCols = cols;
              instance!.lastRows = rows;
              resize(sessionId, cols, rows);
            }
          });
        });
        ro.observe(container);
      };

      (instance as any).setupResizeObserver = setupResizeObserver;
    }

    return instance;
  };

  const attachToContainer = (container: HTMLElement | null) => {
    if (!container) return;

    const instance = getOrCreateTerminal();

    // Only open if not already opened
    if (!instance.terminal.element) {
      instance.terminal.open(container);

      // Hydrate from buffered output if not already done
      if (!instance.hydrated) {
        const snapshot = getHydratedSnapshotBytes(sessionId);
        if (snapshot && snapshot.length > 0) {
          instance.terminal.write(snapshot);
        }
        instance.hydrated = true;
      }

      instance.fitAddon.fit();
      (instance as any).setupResizeObserver(container);
      // Attach paste handler to terminal element
      if ((instance as any).pasteHandler && instance.terminal.element) {
        (instance.terminal.element as HTMLElement).addEventListener('paste', (instance as any).pasteHandler);
      }
      // Attach drag handlers to terminal element
      if ((instance as any).dragHandlers && instance.terminal.element) {
        const termElement = instance.terminal.element as HTMLElement;
        const handlers = (instance as any).dragHandlers;
        termElement.addEventListener('dragover', handlers.dragover);
        termElement.addEventListener('dragenter', handlers.dragenter);
        termElement.addEventListener('dragleave', handlers.dragleave);
        termElement.addEventListener('drop', handlers.drop);
      }
      (async () => {
        try {
          const unsubs = (instance as any).tauriFileDropUnsubs;
          const fileDropUnsub = await safeListen("tauri://file-drop", (event: any) => {
            try {
              const payload = event.payload;
              const paths = Array.isArray(payload) ? payload : (payload?.paths || []);
              const validPaths = paths.filter((p: any) => typeof p === 'string');
              if (validPaths.length > 0) {
                const toWrite = validPaths.map(quotePathForTerminal).join(' ');
                write(sessionId, toWrite);
              }
            } catch {}
          });
          const hoverUnsub = await safeListen("tauri://file-drop-hover", () => {});
          const cancelledUnsub = await safeListen("tauri://file-drop-cancelled", () => {});
          unsubs.push(fileDropUnsub, hoverUnsub, cancelledUnsub);
        } catch {}
      })();
    } else if (instance.terminal.element.parentNode !== container) {
      // Move to new container
      container.appendChild(instance.terminal.element);
      instance.fitAddon.fit();
      (instance as any).setupResizeObserver(container);
    }

    if (isVisible) {
      instance.terminal.focus();
      // Force a fit when becoming visible to ensure proper sizing
      requestAnimationFrame(() => {
        instance.fitAddon.fit();
        const { cols, rows } = instance.terminal;
        resize(sessionId, cols, rows);
      });
    }
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const isEventInside = (event: DragEvent) => {
      const target = event.target as Node | null;
      if (target && container.contains(target)) {
        return true;
      }
      const rect = container.getBoundingClientRect();
      const { clientX, clientY } = event;
      return (
        clientX >= rect.left &&
        clientX <= rect.right &&
        clientY >= rect.top &&
        clientY <= rect.bottom
      );
    };

    const handleWindowDrop = (event: DragEvent) => {
      if (!isEventInside(event)) return;
      handleDrop(event);
    };

    const handleWindowDragOver = (event: DragEvent) => {
      if (!isEventInside(event)) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'copy';
      }
    };

    window.addEventListener('drop', handleWindowDrop, true);
    window.addEventListener('dragover', handleWindowDragOver, true);

    return () => {
      window.removeEventListener('drop', handleWindowDrop, true);
      window.removeEventListener('dragover', handleWindowDragOver, true);
    };
  }, [handleDrop]);

  // Track terminal focus when visible
  useEffect(() => {
    if (isVisible && sessionId) {
      setVisibleSessionId(sessionId);
    }

    return () => {
      setVisibleSessionId(null);
    };
  }, [isVisible, sessionId, setVisibleSessionId]);

  return (
    <div
      ref={(el) => {
        containerRef.current = el;
        if (el) {
          attachToContainer(el);
        }
      }}
      style={{
        width: "100%",
        height: "100%",
        display: isVisible ? "block" : "none"
      }}
    />
  );
};

export default TerminalView;
