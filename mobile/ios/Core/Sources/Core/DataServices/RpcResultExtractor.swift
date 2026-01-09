import Foundation

/// Utility to normalize relay-decoded RPC result values into Swift collections.
/// Handles AnyCodable wrappers, NSDictionary/NSArray bridging, and NSNull values.
enum RpcResultExtractor {

    /// Unwraps a value that may be wrapped in AnyCodable, NSNull, or bridged types.
    /// Recursively unwraps nested structures to ensure clean Swift collections.
    /// IMPORTANT: NSNull values are preserved (not dropped) so envelope detection can
    /// treat "jobs": NSNull as "present but empty".
    static func unwrap(_ value: Any?) -> Any? {
        guard let value = value else { return nil }

        // Preserve NSNull so that envelope detection can see "jobs": NSNull as present
        if value is NSNull { return value }

        // Use Mirror for reflection to handle AnyCodable and similar wrapper types.
        // Attempt Mirror-based unwrapping first: if Mirror has a child labeled "value", unwrap it.
        let mirror = Mirror(reflecting: value)
        for child in mirror.children {
            if child.label == "value" {
                // Found a .value property, recursively unwrap
                return unwrap(child.value)
            }
        }

        // Handle NSDictionary -> [String: Any] while stringifying non-String keys
        if let nsDict = value as? NSDictionary {
            var result: [String: Any] = [:]
            for (key, val) in nsDict {
                let stringKey: String
                if let sk = key as? String {
                    stringKey = sk
                } else {
                    // Stringify non-String keys
                    stringKey = String(describing: key)
                }
                // Keep NSNull values; unwrap others
                if let unwrapped = unwrap(val) {
                    result[stringKey] = unwrapped
                }
            }
            return result
        }

        // Handle [AnyHashable: Any] -> [String: Any] similarly
        if let anyHashableDict = value as? [AnyHashable: Any] {
            var result: [String: Any] = [:]
            for (key, val) in anyHashableDict {
                let stringKey: String
                if let sk = key as? String {
                    stringKey = sk
                } else {
                    // Stringify non-String keys
                    stringKey = String(describing: key)
                }
                // Keep NSNull values; unwrap others
                if let unwrapped = unwrap(val) {
                    result[stringKey] = unwrapped
                }
            }
            return result
        }

        // Handle [String: Any] with potentially wrapped values
        if let dict = value as? [String: Any] {
            var result: [String: Any] = [:]
            for (key, val) in dict {
                // Keep NSNull values; unwrap others
                if let unwrapped = unwrap(val) {
                    result[key] = unwrapped
                }
            }
            return result
        }

        // Handle NSArray -> [Any] with unwrap mapped across elements
        if let nsArray = value as? NSArray {
            return nsArray.map { unwrap($0) ?? NSNull() }
        }

        // Handle [Any] with potentially wrapped values
        if let array = value as? [Any] {
            return array.map { unwrap($0) ?? NSNull() }
        }

        // Return primitive values as-is
        return value
    }

    /// Extracts an envelope dictionary from a result value if it contains any of the required keys.
    /// Handles nested wrappers under "result" or "data" keys.
    static func envelopeDict(from resultValue: Any?, requiredKeys: Set<String>) -> [String: Any]? {
        let unwrapped = unwrap(resultValue)

        // If unwrapped is [String: Any], check if it contains any requiredKeys
        if let dict = unwrapped as? [String: Any] {
            let hasRequiredKey = requiredKeys.contains { dict[$0] != nil }
            if hasRequiredKey {
                return dict
            }

            // Check for nested dict under "result" key
            if let nestedResult = dict["result"] {
                let nestedUnwrapped = unwrap(nestedResult)
                if let nestedDict = nestedUnwrapped as? [String: Any] {
                    let nestedHasRequiredKey = requiredKeys.contains { nestedDict[$0] != nil }
                    if nestedHasRequiredKey {
                        return nestedDict
                    }
                }
            }

            // Check for nested dict under "data" key
            if let nestedData = dict["data"] {
                let nestedUnwrapped = unwrap(nestedData)
                if let nestedDict = nestedUnwrapped as? [String: Any] {
                    let nestedHasRequiredKey = requiredKeys.contains { nestedDict[$0] != nil }
                    if nestedHasRequiredKey {
                        return nestedDict
                    }
                }
            }
        }

        return nil
    }

    /// Converts a value to a dictionary [String: Any]
    static func asDict(_ value: Any?) -> [String: Any]? {
        guard let unwrapped = unwrap(value) else { return nil }

        // NSNull is not a dictionary
        if unwrapped is NSNull { return nil }

        if let dict = unwrapped as? [String: Any] {
            return dict
        }

        // Handle NSDictionary that wasn't fully converted
        if let nsDict = unwrapped as? NSDictionary {
            var result: [String: Any] = [:]
            for (key, val) in nsDict {
                if let stringKey = key as? String {
                    result[stringKey] = val
                }
            }
            return result.isEmpty ? nil : result
        }

        return nil
    }

    /// Converts a value to an array of dictionaries.
    /// Returns empty array for NSNull or nil input (not nil itself).
    static func asArrayOfDicts(_ value: Any?) -> [[String: Any]]? {
        let unwrapped = unwrap(value)

        // NSNull or nil means we don't have array data
        if unwrapped == nil || unwrapped is NSNull {
            return nil
        }

        if let array = unwrapped as? [[String: Any]] {
            return array
        }

        if let nsArray = unwrapped as? NSArray {
            let result = nsArray.compactMap { asDict($0) }
            // Return empty array if input was array but no valid dicts
            return result
        }

        if let anyArray = unwrapped as? [Any] {
            let result = anyArray.compactMap { asDict($0) }
            // Return empty array if input was array but no valid dicts
            return result
        }

        return nil
    }

    /// Extracts a job list envelope dictionary from an RPC result value.
    /// Handles various response formats including nested wrappers.
    /// Normalizes empty responses: nil, NSNull, or empty jobs arrays are all valid.
    static func jobListEnvelopeDict(from resultValue: Any?) -> [String: Any]? {
        // Handle nil or NSNull at top level - normalized empty envelope
        let unwrapped = unwrap(resultValue)
        if unwrapped == nil || unwrapped is NSNull {
            return ["jobs": []]
        }

        // Required keys for job list envelope detection
        let requiredKeys: Set<String> = ["jobs", "totalCount", "page", "pageSize", "hasMore"]

        // Try to get envelope dict containing any of the required keys
        if let dict = envelopeDict(from: resultValue, requiredKeys: requiredKeys) {
            // Check if dict has "jobs" key (even if value is NSNull or empty)
            if let jobsValue = dict["jobs"] {
                var normalizedDict = dict

                // If jobs is NSNull, treat as empty list
                if jobsValue is NSNull {
                    normalizedDict["jobs"] = []
                    return normalizedDict
                }

                // Try to convert jobs to array of dicts
                if let jobsArray = asArrayOfDicts(jobsValue) {
                    // Accept empty arrays as valid
                    normalizedDict["jobs"] = jobsArray
                    return normalizedDict
                }

                // If jobs value exists but isn't convertible, treat as empty
                // (this handles edge cases like jobs being an unexpected type)
                normalizedDict["jobs"] = []
                return normalizedDict
            } else {
                // No "jobs" key but pagination keys exist - add empty jobs array
                var normalizedDict = dict
                normalizedDict["jobs"] = []
                return normalizedDict
            }
        }

        // Check if unwrapped is a list of job dictionaries directly
        if let array = unwrapped as? [[String: Any]] {
            return ["jobs": array]
        }

        if let nsArray = unwrapped as? NSArray {
            // Check if it's an array of dicts
            var jobDicts: [[String: Any]] = []
            for item in nsArray {
                if let dict = asDict(item) {
                    jobDicts.append(dict)
                }
            }
            // Return wrapped array (even if empty)
            return ["jobs": jobDicts]
        }

        if let anyArray = unwrapped as? [Any] {
            var jobDicts: [[String: Any]] = []
            for item in anyArray {
                if let dict = asDict(item) {
                    jobDicts.append(dict)
                }
            }
            // Return wrapped array (even if empty)
            return ["jobs": jobDicts]
        }

        return nil
    }

    /// Extracts a string value from a potentially wrapped value
    static func asString(_ value: Any?) -> String? {
        guard let unwrapped = unwrap(value) else { return nil }
        if unwrapped is NSNull { return nil }
        return unwrapped as? String
    }

    /// Extracts an integer value from a potentially wrapped value
    static func asInt(_ value: Any?) -> Int? {
        guard let unwrapped = unwrap(value) else { return nil }
        if unwrapped is NSNull { return nil }
        if let intVal = unwrapped as? Int {
            return intVal
        }
        if let int64Val = unwrapped as? Int64 {
            return Int(int64Val)
        }
        if let doubleVal = unwrapped as? Double {
            return Int(doubleVal)
        }
        if let nsNumber = unwrapped as? NSNumber {
            return nsNumber.intValue
        }
        return nil
    }

    /// Extracts a boolean value from a potentially wrapped value
    static func asBool(_ value: Any?) -> Bool? {
        guard let unwrapped = unwrap(value) else { return nil }
        if unwrapped is NSNull { return nil }
        if let boolVal = unwrapped as? Bool {
            return boolVal
        }
        if let nsNumber = unwrapped as? NSNumber {
            return nsNumber.boolValue
        }
        return nil
    }
}
