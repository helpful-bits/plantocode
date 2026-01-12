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
    const clampedCursor = clamp(localCursor, 0, remote.length);
    return { merged: remote, newCursor: clampedCursor };
  }
  if (base === remote) {
    const clampedCursor = clamp(localCursor, 0, local.length);
    return { merged: local, newCursor: clampedCursor };
  }

  const prefixLen = Math.min(commonPrefix(base, local), commonPrefix(base, remote));
  const suffixLen = Math.min(commonSuffix(base, local), commonSuffix(base, remote));
  const maxSuffixBase = Math.max(0, base.length - prefixLen);
  const maxSuffixLocal = Math.max(0, local.length - prefixLen);
  const maxSuffixRemote = Math.max(0, remote.length - prefixLen);
  const effectiveSuffixLen = Math.min(suffixLen, maxSuffixBase, maxSuffixLocal, maxSuffixRemote);

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
    mergedMiddle = localMiddle + '\n' + remoteMiddle;
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
