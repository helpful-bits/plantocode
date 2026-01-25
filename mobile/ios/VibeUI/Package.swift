// swift-tools-version: 5.9
import PackageDescription

let package = Package(
  name: "VibeUI",
  platforms: [.iOS(.v16)],
  products: [
    .library(name: "VibeUI", targets: ["VibeUI"])
  ],
  dependencies: [
    .package(path: "../Core"),
    .package(url: "https://github.com/simonbs/Runestone.git", from: "0.5.1"),
    .package(url: "https://github.com/simonbs/TreeSitterLanguages.git", from: "0.1.10"),
    .package(path: "ThirdParty/SwiftTerm"),
    .package(url: "https://github.com/apple/swift-syntax.git", from: "600.0.0"),
    .package(url: "https://github.com/gonzalezreal/swift-markdown-ui", from: "2.0.0")
  ],
  targets: [
    .target(
      name: "VibeUI",
      dependencies: [
        .product(name: "Core", package: "Core"),
        .product(name: "Runestone", package: "Runestone"),
        .product(name: "TreeSitterHTMLRunestone", package: "TreeSitterLanguages"),
        .product(name: "TreeSitterMarkdownRunestone", package: "TreeSitterLanguages"),
        .product(name: "TreeSitterJavaScriptRunestone", package: "TreeSitterLanguages"),
        .product(name: "TreeSitterJSONRunestone", package: "TreeSitterLanguages"),
        .product(name: "TreeSitterPythonRunestone", package: "TreeSitterLanguages"),
        .product(name: "TreeSitterSwiftRunestone", package: "TreeSitterLanguages"),
        .product(name: "TreeSitterYAMLRunestone", package: "TreeSitterLanguages"),
        .product(name: "TreeSitterCSSRunestone", package: "TreeSitterLanguages"),
        .product(name: "TreeSitterRustRunestone", package: "TreeSitterLanguages"),
        .product(name: "TreeSitterGoRunestone", package: "TreeSitterLanguages"),
        .product(name: "SwiftTerm", package: "SwiftTerm"),
        .product(name: "SwiftSyntax", package: "swift-syntax"),
        .product(name: "SwiftParser", package: "swift-syntax"),
        .product(name: "MarkdownUI", package: "swift-markdown-ui")
      ],
      path: "Sources/VibeUI"
    )
  ]
)
