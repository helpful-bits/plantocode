import SwiftUI
import Core

public struct TroubleshootingView: View {
  @Environment(\.dismiss) private var dismiss
  @EnvironmentObject private var appState: AppState
  @State private var showDeviceSelection = false
  @State private var showRegion = false

  public init() {}

  public var body: some View {
    NavigationStack {
      VStack {
        List {
          Section("Connection Issues") {
            VStack(alignment: .leading, spacing: 12) {
              HStack(alignment: .top, spacing: 8) {
                Image(systemName: "1.circle.fill")
                  .foregroundColor(Color.primary)
                Text("Ensure desktop app is running")
                  .paragraph()
              }

              HStack(alignment: .top, spacing: 8) {
                Image(systemName: "2.circle.fill")
                  .foregroundColor(Color.primary)
                Text("Verify same account on mobile and desktop")
                  .paragraph()
              }

              HStack(alignment: .top, spacing: 8) {
                Image(systemName: "3.circle.fill")
                  .foregroundColor(Color.primary)
                Text("Check network connectivity")
                  .paragraph()
              }
            }
            .padding(.vertical, 8)
          }

          Section("Status Indicators") {
            VStack(alignment: .leading, spacing: 16) {
              // Connection Status Legend
              VStack(alignment: .leading, spacing: 8) {
                Text("Connection Status")
                  .font(.system(size: 14, weight: .semibold))
                  .foregroundColor(Color.cardForeground)

                VStack(alignment: .leading, spacing: 6) {
                  StatusIndicatorRow(
                    color: Color.success,
                    label: "Connected",
                    description: "Relay connection active"
                  )

                  StatusIndicatorRow(
                    color: Color.warning,
                    label: "Connecting",
                    description: "Establishing connection"
                  )

                  StatusIndicatorRow(
                    color: Color.destructive,
                    label: "Disconnected",
                    description: "Connection lost or failed"
                  )

                  StatusIndicatorRow(
                    color: Color.mutedForeground,
                    label: "Unknown",
                    description: "Status unavailable"
                  )
                }
              }

              Divider()

              // Device Status Legend
              VStack(alignment: .leading, spacing: 8) {
                Text("Device Status")
                  .font(.system(size: 14, weight: .semibold))
                  .foregroundColor(Color.cardForeground)

                VStack(alignment: .leading, spacing: 6) {
                  StatusIndicatorRow(
                    color: Color.success,
                    label: "Online",
                    description: "Device active and ready"
                  )

                  StatusIndicatorRow(
                    color: Color.warning,
                    label: "Away",
                    description: "Device idle or inactive"
                  )

                  StatusIndicatorRow(
                    color: Color.mutedForeground,
                    label: "Offline",
                    description: "Device not responding"
                  )
                }
              }

              Divider()

              // Platform Icons Legend
              VStack(alignment: .leading, spacing: 8) {
                Text("Platform Icons")
                  .font(.system(size: 14, weight: .semibold))
                  .foregroundColor(Color.cardForeground)

                VStack(alignment: .leading, spacing: 6) {
                  HStack(spacing: 8) {
                    Image(systemName: "laptopcomputer")
                      .font(.system(size: 16))
                      .foregroundColor(Color.primary)
                      .frame(width: 24)

                    Text("macOS")
                      .font(.system(size: 13))
                      .foregroundColor(Color.mutedForeground)
                  }
                  .accessibilityLabel("macOS: laptop computer icon")

                  HStack(spacing: 8) {
                    Image(systemName: "desktopcomputer")
                      .font(.system(size: 16))
                      .foregroundColor(Color.primary)
                      .frame(width: 24)

                    Text("Windows")
                      .font(.system(size: 13))
                      .foregroundColor(Color.mutedForeground)
                  }
                  .accessibilityLabel("Windows: desktop computer icon")

                  HStack(spacing: 8) {
                    Image(systemName: "server.rack")
                      .font(.system(size: 16))
                      .foregroundColor(Color.primary)
                      .frame(width: 24)

                    Text("Linux")
                      .font(.system(size: 13))
                      .foregroundColor(Color.mutedForeground)
                  }
                  .accessibilityLabel("Linux: server rack icon")
                }
              }

              Divider()

              // Action Icons Legend
              VStack(alignment: .leading, spacing: 8) {
                Text("Action Indicators")
                  .font(.system(size: 14, weight: .semibold))
                  .foregroundColor(Color.cardForeground)

                VStack(alignment: .leading, spacing: 6) {
                  HStack(spacing: 8) {
                    Image(systemName: "checkmark.circle.fill")
                      .font(.system(size: 16))
                      .foregroundColor(Color.primary)
                      .frame(width: 24)

                    Text("Selected device")
                      .font(.system(size: 13))
                      .foregroundColor(Color.mutedForeground)
                  }
                  .accessibilityLabel("Selected: checkmark circle icon")

                  HStack(spacing: 8) {
                    Image(systemName: "arrow.right.circle")
                      .font(.system(size: 16))
                      .foregroundColor(Color.mutedForeground)
                      .frame(width: 24)

                    Text("Tap to connect")
                      .font(.system(size: 13))
                      .foregroundColor(Color.mutedForeground)
                  }
                  .accessibilityLabel("Available to connect: arrow right circle icon")
                }
              }
            }
            .padding(.vertical, 8)
          }

          Section("Quick Actions") {
            Button("Open Device Selection") {
              showDeviceSelection = true
            }
            .buttonStyle(SecondaryButtonStyle())

            Button("Change Region") {
              showRegion = true
            }
            .buttonStyle(SecondaryButtonStyle())

            Button("Sign Out", role: .destructive) {
              Task {
                await appState.signOut()
              }
            }
            .buttonStyle(DestructiveButtonStyle())
          }
        }
      }
      .navigationTitle("Help")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .navigationBarTrailing) {
          Button("Done") {
            dismiss()
          }
          .buttonStyle(ToolbarButtonStyle())
        }
      }
      .sheet(isPresented: $showDeviceSelection) {
        DeviceSelectionView()
      }
      .sheet(isPresented: $showRegion) {
        ServerSelectionView(isModal: true)
      }
    }
  }
}

// MARK: - Helper Views

private struct StatusIndicatorRow: View {
  let color: Color
  let label: String
  let description: String

  var body: some View {
    HStack(spacing: 8) {
      Circle()
        .fill(color)
        .frame(width: 10, height: 10)

      VStack(alignment: .leading, spacing: 2) {
        Text(label)
          .font(.system(size: 13, weight: .medium))
          .foregroundColor(Color.cardForeground)

        Text(description)
          .font(.system(size: 12))
          .foregroundColor(Color.mutedForeground)
      }
    }
    .accessibilityElement(children: .combine)
    .accessibilityLabel("\(label): \(description)")
  }
}

#Preview {
  TroubleshootingView()
    .environmentObject(AppState.shared)
}
