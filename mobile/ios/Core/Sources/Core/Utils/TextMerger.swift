import Foundation

public struct TextMergeResult {
    public let mergedText: String
    public let newCursorOffset: Int

    public init(mergedText: String, newCursorOffset: Int) {
        self.mergedText = mergedText
        self.newCursorOffset = newCursorOffset
    }
}

public enum TextMerger {
    public static func merge(base: String, local: String, remote: String, cursorOffset: Int) -> TextMergeResult {
        let baseLen = base.count
        let localLen = local.count
        let remoteLen = remote.count
        let safeCursor = clamp(cursorOffset, 0, localLen)

        if base == local {
            return TextMergeResult(mergedText: remote, newCursorOffset: clamp(safeCursor, 0, remoteLen))
        }
        if base == remote {
            return TextMergeResult(mergedText: local, newCursorOffset: clamp(safeCursor, 0, localLen))
        }

        let prefixLen = min(commonPrefix(base, local), commonPrefix(base, remote))
        let suffixLen = min(commonSuffix(base, local), commonSuffix(base, remote))
        let maxSuffixBase = max(0, baseLen - prefixLen)
        let maxSuffixLocal = max(0, localLen - prefixLen)
        let maxSuffixRemote = max(0, remoteLen - prefixLen)
        let effectiveSuffixLen = min(suffixLen, maxSuffixBase, maxSuffixLocal, maxSuffixRemote)

        let prefix = slice(base, 0, prefixLen)
        let suffix = slice(base, baseLen - effectiveSuffixLen, baseLen)

        let baseMid = slice(base, prefixLen, baseLen - effectiveSuffixLen)
        let localMid = slice(local, prefixLen, localLen - effectiveSuffixLen)
        let remoteMid = slice(remote, prefixLen, remoteLen - effectiveSuffixLen)

        let mergedMiddle: String
        if localMid == remoteMid {
            mergedMiddle = localMid
        } else if baseMid == localMid {
            mergedMiddle = remoteMid
        } else if baseMid == remoteMid {
            mergedMiddle = localMid
        } else {
            mergedMiddle = localMid + "\n" + remoteMid
        }

        let merged = prefix + mergedMiddle + suffix

        let newCursor: Int
        if safeCursor <= prefixLen {
            newCursor = safeCursor
        } else if safeCursor >= localLen - effectiveSuffixLen {
            let offsetInSuffix = safeCursor - (localLen - effectiveSuffixLen)
            newCursor = merged.count - effectiveSuffixLen + offsetInSuffix
        } else {
            let middleDelta = mergedMiddle.count - localMid.count
            newCursor = safeCursor + middleDelta
        }

        return TextMergeResult(mergedText: merged, newCursorOffset: clamp(newCursor, 0, merged.count))
    }

    private static func commonPrefix(_ a: String, _ b: String) -> Int {
        var i = 0
        let aChars = Array(a)
        let bChars = Array(b)
        let minLen = min(aChars.count, bChars.count)
        while i < minLen && aChars[i] == bChars[i] {
            i += 1
        }
        return i
    }

    private static func commonSuffix(_ a: String, _ b: String) -> Int {
        var i = 0
        let aChars = Array(a)
        let bChars = Array(b)
        let aLen = aChars.count
        let bLen = bChars.count
        let minLen = min(aLen, bLen)
        while i < minLen && aChars[aLen - 1 - i] == bChars[bLen - 1 - i] {
            i += 1
        }
        return i
    }

    private static func slice(_ s: String, _ start: Int, _ end: Int) -> String {
        let chars = Array(s)
        let len = chars.count
        let safeStart = max(0, min(start, len))
        let safeEnd = max(safeStart, min(end, len))
        if safeStart >= safeEnd {
            return ""
        }
        return String(chars[safeStart..<safeEnd])
    }

    private static func clamp(_ value: Int, _ minVal: Int, _ maxVal: Int) -> Int {
        return max(minVal, min(value, maxVal))
    }
}
