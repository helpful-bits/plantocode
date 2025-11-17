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
        let prefixLen = commonPrefix(local, remote)
        let suffixLen = commonSuffix(local, remote)

        let localMid = mid(local, prefixLen, suffixLen)
        let remoteMid = mid(remote, prefixLen, suffixLen)

        let mergedMiddle: String
        if localMid.isEmpty && !remoteMid.isEmpty {
            mergedMiddle = remoteMid
        } else if !localMid.isEmpty && remoteMid.isEmpty {
            mergedMiddle = localMid
        } else if localMid == remoteMid {
            mergedMiddle = localMid
        } else {
            let baseMid = mid(base, min(prefixLen, base.count), min(suffixLen, base.count))
            if baseMid == localMid {
                mergedMiddle = remoteMid
            } else if baseMid == remoteMid {
                mergedMiddle = localMid
            } else {
                mergedMiddle = localMid + remoteMid
            }
        }

        let prefix = String(local.prefix(prefixLen))
        let suffix = String(local.suffix(suffixLen))
        let merged = prefix + mergedMiddle + suffix

        let localLen = local.count
        let remoteLen = remote.count
        let delta = remoteLen - localLen
        let newCursor = max(0, min(merged.count, cursorOffset + delta))

        return TextMergeResult(mergedText: merged, newCursorOffset: newCursor)
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

    private static func mid(_ s: String, _ prefixLen: Int, _ suffixLen: Int) -> String {
        let chars = Array(s)
        let len = chars.count
        let start = min(prefixLen, len)
        let end = max(start, len - suffixLen)
        if start >= end {
            return ""
        }
        return String(chars[start..<end])
    }
}
