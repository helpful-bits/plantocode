# React Rendering Performance (Dev-only)

Console API (available in dev):
- __PERF__.start()
- __PERF__.stop()
- __PERF__.summary()
- __PERF__.setThreshold(ms)
- __PERF__.logPath()  // relative to AppData: logs/react-profiler/react-perf.jsonl

Tail the log:
- macOS/Linux: tail -f "$APP_DATA_DIR/$(__PERF__.logPath())"
- Windows (PowerShell): Get-Content -Path "$env:APPDATA\\YourApp\\$((__PERF__.logPath()))" -Wait

Entries are JSONL, one line per render event, written immediately (no buffering).

## Per-Component Profiling

To profile specific components for unnecessary re-renders:

```typescript
import { withProfiler } from "@/utils/react-performance-profiler";
export default withProfiler(YourComponent, "YourComponent");
```

This will track render times and detect when components re-render with unchanged props.