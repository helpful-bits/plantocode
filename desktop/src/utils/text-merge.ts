function commonPrefix(a: string, b: string): number {
  let i = 0;
  const len = Math.min(a.length, b.length);
  while (i < len && a[i] === b[i]) i++;
  return i;
}

function commonSuffix(a: string, b: string): number {
  let i = 0;
  const maxLen = Math.min(a.length, b.length);
  while (i < maxLen && a[a.length - 1 - i] === b[b.length - 1 - i]) i++;
  return i;
}

function computeDeltaBeforeCursor(base: string, local: string, cursorPos: number): number {
  const prefixLen = commonPrefix(base, local);
  if (cursorPos <= prefixLen) return 0;

  const suffixLen = commonSuffix(base, local);
  const baseMiddleStart = prefixLen;
  const baseMiddleEnd = base.length - suffixLen;
  const localMiddleStart = prefixLen;
  const localMiddleEnd = local.length - suffixLen;

  const baseMiddle = base.slice(baseMiddleStart, baseMiddleEnd);
  const localMiddle = local.slice(localMiddleStart, localMiddleEnd);

  const deltaLength = localMiddle.length - baseMiddle.length;
  if (cursorPos <= localMiddleEnd) return deltaLength;

  return deltaLength;
}

function computeDeltaWindow(base: string, _remote: string, localCursorInBase: number, windowChars: number): { start: number; end: number } {
  const start = Math.max(0, localCursorInBase - windowChars);
  const end = Math.min(base.length, localCursorInBase + windowChars);
  return { start, end };
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(val, max));
}

export function mergeThreeWayWithCursor(
  base: string,
  local: string,
  remote: string,
  localCursor: number
): { merged: string; newCursor: number } {
  if (base === local) {
    return { merged: remote, newCursor: localCursor };
  }
  if (base === remote) {
    return { merged: local, newCursor: localCursor };
  }

  const prefixLen = Math.min(commonPrefix(base, local), commonPrefix(base, remote));
  const suffixLen = Math.min(commonSuffix(base, local), commonSuffix(base, remote));

  const effectiveSuffixLen = Math.min(suffixLen, base.length - prefixLen);

  const prefix = base.slice(0, prefixLen);
  const suffix = base.slice(base.length - effectiveSuffixLen);

  const baseMiddle = base.slice(prefixLen, base.length - effectiveSuffixLen);
  const localMiddle = local.slice(prefixLen, local.length - effectiveSuffixLen);
  const remoteMiddle = remote.slice(prefixLen, remote.length - effectiveSuffixLen);

  let mergedMiddle: string;
  if (localMiddle === remoteMiddle) {
    mergedMiddle = localMiddle;
  } else if (baseMiddle === localMiddle) {
    mergedMiddle = remoteMiddle;
  } else if (baseMiddle === remoteMiddle) {
    mergedMiddle = localMiddle;
  } else {
    const WINDOW_CHARS = 50;
    const localDelta = computeDeltaBeforeCursor(base, local, localCursor);
    const localCursorInBase = localCursor - localDelta;
    const { start: wStart, end: wEnd } = computeDeltaWindow(base, remote, localCursorInBase, WINDOW_CHARS);

    const baseWindow = base.slice(wStart, wEnd);
    const remoteWindow = remote.slice(wStart, wEnd + (remote.length - base.length));

    if (baseWindow === remoteWindow) {
      mergedMiddle = localMiddle;
    } else {
      mergedMiddle = localMiddle + '\n' + remoteMiddle;
    }
  }

  const merged = prefix + mergedMiddle + suffix;

  let newCursor = localCursor;
  if (localCursor <= prefixLen) {
    newCursor = localCursor;
  } else if (localCursor >= local.length - effectiveSuffixLen) {
    const offsetInSuffix = localCursor - (local.length - effectiveSuffixLen);
    newCursor = merged.length - effectiveSuffixLen + offsetInSuffix;
  } else {
    const prefixDelta = prefix.length - prefixLen;
    const middleDelta = mergedMiddle.length - localMiddle.length;
    newCursor = localCursor + prefixDelta + middleDelta;
  }

  newCursor = clamp(newCursor, 0, merged.length);

  return { merged, newCursor };
}
