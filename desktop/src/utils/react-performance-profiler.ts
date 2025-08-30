import type { ProfilerOnRenderCallback } from "react";
import React from "react";
import { appendToLogFile } from "./tauri-fs";

const DEFAULT_THRESHOLD_MS = 16;
const LOG_REL_DIR = "logs/react-profiler";
const LOG_FILENAME = "react-perf.jsonl";
const LOG_REL_PATH = `${LOG_REL_DIR}/${LOG_FILENAME}`;

type SummaryStats = {
  count: number;
  slowCount: number;
  totalMs: number;
  maxMs: number;
};

let thresholdMs = DEFAULT_THRESHOLD_MS;
let isRecording = false;
let summary: Map<string, SummaryStats> = new Map();

// Shared onRender for React.Profiler
export const onRender: ProfilerOnRenderCallback = (
  id,
  phase,
  actualDuration,
  baseDuration,
  startTime,
  commitTime
) => {
  if (!isRecording) return;
  const slow = actualDuration >= thresholdMs;
  const evt = {
    t: Date.now(),
    type: "react_commit",
    id,
    phase,
    actualMs: Number(actualDuration.toFixed(3)),
    baseMs: Number(baseDuration.toFixed(3)),
    startAt: Number(startTime.toFixed(3)),
    commitAt: Number(commitTime.toFixed(3)),
    slow
  };
  // Fire-and-forget append (no buffering, one line per event)
  appendToLogFile(LOG_REL_PATH, JSON.stringify(evt)).catch(() => {});

  // In-memory summary
  const s = summary.get(id) ?? { count: 0, slowCount: 0, totalMs: 0, maxMs: 0 };
  s.count += 1;
  if (slow) s.slowCount += 1;
  s.totalMs += actualDuration;
  s.maxMs = Math.max(s.maxMs, actualDuration);
  summary.set(id, s);
};

// Optional HOC to detect unnecessary re-renders for specific components
function shallowEqual(objA: any, objB: any): boolean {
  if (objA === objB) return true;
  if (typeof objA !== "object" || objA === null || typeof objB !== "object" || objB === null) return false;
  const keysA = Object.keys(objA);
  const keysB = Object.keys(objB);
  if (keysA.length !== keysB.length) return false;
  for (const k of keysA) {
    if (!Object.prototype.hasOwnProperty.call(objB, k) || objA[k] !== objB[k]) return false;
  }
  return true;
}

export function withProfiler<P extends object>(Comp: React.ComponentType<P>, id?: string): React.ComponentType<P> {
  const name = id ?? Comp.displayName ?? Comp.name ?? "Anonymous";
  const Wrapped = (props: P) => {
    const prevRef = React.useRef<P | null>(null);
    const start = performance.now();
    const phase = prevRef.current ? "update" : "mount";
    const unnecessary = prevRef.current ? shallowEqual(prevRef.current, props) : false;
    React.useEffect(() => {
      const renderMs = performance.now() - start;
      if (isRecording && (renderMs >= thresholdMs || unnecessary)) {
        const evt = {
          t: Date.now(),
          type: "component_render",
          id: name,
          phase,
          renderMs: Number(renderMs.toFixed(3)),
          propsChanged: !unnecessary,
          slow: renderMs >= thresholdMs
        };
        appendToLogFile(LOG_REL_PATH, JSON.stringify(evt)).catch(() => {});
        const s = summary.get(name) ?? { count: 0, slowCount: 0, totalMs: 0, maxMs: 0 };
        s.count += 1;
        if (evt.slow) s.slowCount += 1;
        s.totalMs += renderMs;
        s.maxMs = Math.max(s.maxMs, renderMs);
        summary.set(name, s);
      }
      prevRef.current = props;
    });
    return React.createElement(Comp as any, props as any);
  };
  Wrapped.displayName = `Profiled(${name})`;
  return Wrapped as React.ComponentType<P>;
}

// Console API
function printUsage() {
  // eslint-disable-next-line no-console
  console.log("[Perf] API: __PERF__.start(), __PERF__.stop(), __PERF__.summary(), __PERF__.setThreshold(ms), __PERF__.logPath()");
}

export function initReactProfiler() {
  if (typeof window !== "undefined") {
    (window as any).__PERF__ = {
      start: () => { isRecording = true; printUsage(); },
      stop: () => { isRecording = false; },
      summary: () => {
        const rows = Array.from(summary.entries()).map(([id, s]) => ({
          id,
          count: s.count,
          slow: s.slowCount,
          avgMs: Number((s.totalMs / s.count).toFixed(3)),
          maxMs: Number(s.maxMs.toFixed(3)),
        })).sort((a, b) => b.avgMs - a.avgMs);
        // eslint-disable-next-line no-console
        console.table(rows);
        return rows;
      },
      setThreshold: (ms: number) => { thresholdMs = ms; },
      logPath: () => LOG_REL_PATH
    };
    printUsage();
  }
}