// swift-tools-version: 5.9
import PackageDescription

let package = Package(
  name: "Core",
  platforms: [.iOS(.v16)],
  products: [
    .library(name: "Core", targets: ["Core"])
  ],
  dependencies: [
    .package(url: "https://github.com/kishikawakatsumi/KeychainAccess.git", from: "4.2.2"),
    .package(url: "https://github.com/stephencelis/SQLite.swift.git", from: "0.14.1")
  ],
  targets: [
    .target(
      name: "Core",
      dependencies: [
        "KeychainAccess",
        .product(name: "SQLite", package: "SQLite.swift")
      ],
      path: "Sources/Core"
    )
  ]
)
