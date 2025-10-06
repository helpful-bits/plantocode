import SwiftUI
import Core

public struct AccountView: View {
  @ObservedObject var appState = AppState.shared

  public init() {}

  public var body: some View {
    VStack(alignment: .leading, spacing: 16) {
      if let user = appState.currentUser {
        if let name = user.name {
          Text(name)
            .h4()
        }

        if let email = user.email {
          Text(email)
            .subtle()
        }
      }

      Button("Sign Out") {
        Task {
          await appState.signOut()
        }
      }
      .buttonStyle(SecondaryButtonStyle())

      Spacer()
    }
    .padding()
  }
}
