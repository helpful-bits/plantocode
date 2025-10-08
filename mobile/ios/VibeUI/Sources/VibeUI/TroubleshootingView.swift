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

#Preview {
  TroubleshootingView()
    .environmentObject(AppState.shared)
}
