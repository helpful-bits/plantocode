// swift-tools-version: 5.9
import PackageDescription

let package = Package(
  name: "VibeUI",
  platforms: [.iOS(.v16)],
  products: [
    .library(name: "VibeUI", targets: ["VibeUI"])
  ],
  dependencies: [
    .package(path: "../Core")
  ],
  targets: [
    .target(
      name: "VibeUI",
      dependencies: [
        .product(name: "Core", package: "Core")
      ],
      path: "Sources/VibeUI"
    )
  ]
)