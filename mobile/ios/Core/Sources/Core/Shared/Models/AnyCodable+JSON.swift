import Foundation

public extension AnyCodable {
    var jsonValue: Any {
        JSONSanitizer.sanitize(self.value)
    }
}
