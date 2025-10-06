import SwiftUI
import Core

public struct SettingsView: View {
  @Environment(\.dismiss) private var dismiss
  @EnvironmentObject private var appState: AppState
  @State private var showRegion = false
  @State private var showDevices = false
  @State private var showAccount = false

  public init() {}

  public var body: some View {
    NavigationView {
      VStack {
        Form {
          Section("Account") {
            Text(appState.currentUser?.email ?? "Unknown")
              .paragraph()
              .foregroundColor(.secondary)

            NavigationLink("Profile") {
              AccountView()
            }

            Button("Sign Out", role: .destructive) {
              Task {
                await appState.signOut()
              }
            }
          }

          Section("Connection") {
            Button("Change Region") {
              showRegion = true
            }

            Button("Switch Device") {
              showDevices = true
            }
          }

          Section("Legal") {
            if let termsURL = URL(string: "https://vibemanager.app/terms") {
              Link("Terms of Service", destination: termsURL)
            }
            if let privacyURL = URL(string: "https://vibemanager.app/privacy") {
              Link("Privacy Policy", destination: privacyURL)
            }
          }
        }
      }
      .navigationTitle("Settings")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .navigationBarTrailing) {
          Button("Done") {
            dismiss()
          }
        }
      }
      .sheet(isPresented: $showRegion) {
        ServerSelectionView(isModal: true)
      }
      .sheet(isPresented: $showDevices) {
        DeviceSelectionView()
      }
    }
  }
}

#Preview {
  SettingsView()
    .environmentObject(AppState.shared)
}
