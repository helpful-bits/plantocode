import SwiftUI
import Core

public struct LoginView: View {
  @ObservedObject private var appState = AppState.shared
  @State private var errorMessage: String?
  @State private var loadingProvider: String?
  private let columns = [GridItem(.flexible()), GridItem(.flexible())]

  public init() {}

  public var body: some View {
    ZStack {
      // Match desktop gradient: from-background via-background/95 to-card
      LinearGradient(
        colors: [
          Color("Background"),
          Color("Background").opacity(0.95),
          Color("Card")
        ],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
      )
      .ignoresSafeArea()

      VStack {
        Spacer()

        VStack(alignment: .leading, spacing: 20) {
          Text("Vibe Manager")
            .font(.largeTitle)
            .fontWeight(.bold)
            .foregroundColor(Color("CardForeground"))

          Text("Sign in with your preferred provider")
            .font(.body)
            .foregroundColor(Color("MutedForeground"))

          if let err = errorMessage ?? appState.authError {
            StatusAlertView(variant: .destructive, title: "Error", message: err)
          }

          if loadingProvider != nil {
            StatusAlertView(variant: .info, title: "Signing In...", message: "Complete the sign-in in your browser.")
          }

          Divider().padding(.vertical, 4)

          LazyVGrid(columns: columns, spacing: 12) {
            ProviderButton(
              name: "Google",
              providerHint: "google-oauth2",
              backgroundColor: Color(red: 0.259, green: 0.522, blue: 0.957),
              icon: Image(systemName: "g.circle.fill"),
              isLoading: loadingProvider == "google-oauth2",
              action: { handleSignIn("google-oauth2") }
            )

            ProviderButton(
              name: "GitHub",
              providerHint: "github",
              backgroundColor: Color(red: 0.141, green: 0.161, blue: 0.184),
              icon: Image(systemName: "chevron.left.forwardslash.chevron.right"),
              isLoading: loadingProvider == "github",
              action: { handleSignIn("github") }
            )

            ProviderButton(
              name: "Microsoft",
              providerHint: "windowslive",
              backgroundColor: Color(red: 0.0, green: 0.643, blue: 0.937),
              icon: Image(systemName: "square.grid.2x2.fill"),
              isLoading: loadingProvider == "windowslive",
              action: { handleSignIn("windowslive") }
            )

            ProviderButton(
              name: "Apple",
              providerHint: "apple",
              backgroundColor: Color(red: 0.02, green: 0.027, blue: 0.031),
              icon: Image(systemName: "apple.logo"),
              isLoading: loadingProvider == "apple",
              action: { handleSignIn("apple") }
            )
          }

          HStack(spacing: 8) {
            Text("By signing in you agree to our")
              .font(.caption)
              .foregroundColor(Color("MutedForeground"))
            Link("Terms of Service", destination: URL(string: "https://vibemanager.app/terms")!)
              .font(.caption)
            Text("and")
              .font(.caption)
              .foregroundColor(Color("MutedForeground"))
            Link("Privacy Policy", destination: URL(string: "https://vibemanager.app/privacy")!)
              .font(.caption)
          }
          .padding(.top, 8)
        }
        .padding(24)
        .background(
          Color("Background")
            .opacity(0.95)
        )
        .overlay(
          RoundedRectangle(cornerRadius: 20)
            .stroke(Color("Border").opacity(0.6), lineWidth: 1)
        )
        .cornerRadius(20)
        .shadow(color: Color.black.opacity(0.05), radius: 3, x: 0, y: 1)
        .shadow(color: Color.black.opacity(0.03), radius: 2, x: 0, y: 1)
        .frame(maxWidth: 520)

        Spacer()
      }
      .padding(.horizontal, 16)
    }
  }

  private func handleSignIn(_ provider: String) {
    errorMessage = nil
    loadingProvider = provider
    Task {
      do {
        try await appState.signIn(providerHint: provider)
      } catch {
        errorMessage = error.localizedDescription
      }
      loadingProvider = nil
    }
  }
}


private struct ProviderButton: View {
  let name: String
  let providerHint: String
  let backgroundColor: Color
  let icon: Image
  let isLoading: Bool
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      HStack {
        if isLoading {
          ProgressView()
            .progressViewStyle(CircularProgressViewStyle(tint: .white))
            .scaleEffect(0.8)
        } else {
          icon.foregroundStyle(.white)
        }
        Text(name)
          .fontWeight(.semibold)
        Spacer()
      }
      .foregroundStyle(.white)
      .padding(.horizontal, 14)
      .frame(height: 44)
      .background(RoundedRectangle(cornerRadius: 10).fill(backgroundColor))
    }
    .disabled(isLoading)
  }
}
