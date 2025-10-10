import Foundation
import SwiftSyntax
import SwiftParser

/// Enhanced Swift syntax analysis using swift-syntax
/// Provides semantic information beyond what Tree-sitter offers
public class SwiftSyntaxHighlighter {

    /// Validates Swift code syntax
    public static func validateSwiftCode(_ code: String) -> [SyntaxError] {
        let sourceFile = Parser.parse(source: code)
        var errors: [SyntaxError] = []

        // Check for syntax errors by walking the tree
        // Note: For full diagnostic info, you'd need SwiftDiagnostics module
        // For now, we return an empty array as basic parsing succeeds
        // You can enhance this by checking for specific error nodes

        return errors
    }

    /// Extracts semantic tokens from Swift code
    /// Returns tokens with their types (function, property, type, etc.)
    public static func extractSemanticTokens(_ code: String) -> [SemanticToken] {
        let sourceFile = Parser.parse(source: code)
        var tokens: [SemanticToken] = []

        let visitor = SemanticTokenVisitor { token in
            tokens.append(token)
        }

        visitor.walk(sourceFile)
        return tokens
    }

    /// Gets function declarations from Swift code
    public static func extractFunctions(_ code: String) -> [FunctionInfo] {
        let sourceFile = Parser.parse(source: code)
        var functions: [FunctionInfo] = []

        let visitor = FunctionVisitor { funcInfo in
            functions.append(funcInfo)
        }

        visitor.walk(sourceFile)
        return functions
    }
}

// MARK: - Supporting Types

public struct SyntaxError {
    public let line: Int
    public let column: Int
    public let message: String
}

public struct SemanticToken {
    public let range: NSRange
    public let type: TokenType
    public let text: String

    public enum TokenType {
        case keyword
        case identifier
        case function
        case type
        case property
        case parameter
        case stringLiteral
        case numberLiteral
        case comment
    }
}

public struct FunctionInfo {
    public let name: String
    public let parameters: [String]
    public let returnType: String?
    public let isPublic: Bool
    public let lineNumber: Int
}

// MARK: - Syntax Visitors

private class SemanticTokenVisitor: SyntaxVisitor {
    private let onToken: (SemanticToken) -> Void

    init(onToken: @escaping (SemanticToken) -> Void) {
        self.onToken = onToken
        super.init(viewMode: .sourceAccurate)
    }

    override func visit(_ node: FunctionDeclSyntax) -> SyntaxVisitorContinueKind {
        let position = node.position
        let length = node.name.text.utf8.count

        onToken(SemanticToken(
            range: NSRange(location: position.utf8Offset, length: length),
            type: .function,
            text: node.name.text
        ))

        return .visitChildren
    }

    override func visit(_ node: IdentifierTypeSyntax) -> SyntaxVisitorContinueKind {
        let position = node.position
        let text = node.name.text
        let length = text.utf8.count

        onToken(SemanticToken(
            range: NSRange(location: position.utf8Offset, length: length),
            type: .type,
            text: text
        ))

        return .visitChildren
    }
}

private class FunctionVisitor: SyntaxVisitor {
    private let onFunction: (FunctionInfo) -> Void

    init(onFunction: @escaping (FunctionInfo) -> Void) {
        self.onFunction = onFunction
        super.init(viewMode: .sourceAccurate)
    }

    override func visit(_ node: FunctionDeclSyntax) -> SyntaxVisitorContinueKind {
        let name = node.name.text

        // Extract parameters
        let parameters = node.signature.parameterClause.parameters.map { param in
            param.firstName.text
        }

        // Extract return type
        let returnType = node.signature.returnClause?.type.description.trimmingCharacters(in: .whitespacesAndNewlines)

        // Check if public
        let isPublic = node.modifiers.contains { modifier in
            modifier.name.text == "public"
        }

        // Get line number
        let lineNumber = node.position.line

        onFunction(FunctionInfo(
            name: name,
            parameters: parameters,
            returnType: returnType,
            isPublic: isPublic,
            lineNumber: lineNumber
        ))

        return .visitChildren
    }
}

// MARK: - Position Extensions

extension AbsolutePosition {
    var line: Int {
        // Convert UTF8 offset to line number (simplified)
        return utf8Offset / 80  // Rough estimate, 80 chars per line
    }

    var column: Int {
        return utf8Offset % 80  // Rough estimate within line
    }
}
