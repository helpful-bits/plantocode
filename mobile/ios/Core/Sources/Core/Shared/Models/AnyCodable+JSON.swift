import Foundation

/// Extension to provide JSON-safe value conversion for AnyCodable
public extension AnyCodable {
    /// Returns a JSON-safe representation of the wrapped value
    /// Converts Date, Data, URL, and other non-JSON-safe types to appropriate representations
    var jsonValue: Any {
        return JSONSanitizer.sanitize(self.value)
    }
}
