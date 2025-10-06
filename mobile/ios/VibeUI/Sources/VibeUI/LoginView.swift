import SwiftUI
import Core

public struct LoginView: View {
  @ObservedObject private var appState = AppState.shared
  @State private var errorMessage: String?
  @State private var loadingProvider: String?
  @State private var showingRegionSelector = false
  private let columns = [GridItem(.flexible()), GridItem(.flexible())]

  public init() {}

  public var body: some View {
    ZStack {
      LinearGradient(
        colors: [
          Color.background,
          Color.background.opacity(0.95),
          Color.card
        ],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
      )
      .ignoresSafeArea()

      VStack {
        Spacer()

        VStack(alignment: .leading, spacing: 20) {
          Text("Vibe Manager")
            .h1()

          Text("Sign in with your preferred provider")
            .paragraph()

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
              .small()
            if let termsURL = URL(string: "https://vibemanager.app/terms") {
              Link("Terms of Service", destination: termsURL)
                .small()
            }
            Text("and")
              .small()
            if let privacyURL = URL(string: "https://vibemanager.app/privacy") {
              Link("Privacy Policy", destination: privacyURL)
                .small()
            }
          }
          .padding(.top, 8)
        }
        .padding(24)
        .background(
          Color.background
            .opacity(0.95)
        )
        .overlay(
          RoundedRectangle(cornerRadius: 20)
            .stroke(Color.border.opacity(0.6), lineWidth: 1)
        )
        .cornerRadius(20)
        .shadow(color: Color.background.opacity(0.05), radius: 3, x: 0, y: 1)
        .shadow(color: Color.background.opacity(0.03), radius: 2, x: 0, y: 1)
        .frame(maxWidth: 520)

        Spacer()
      }
      .padding(.horizontal, 16)
    }
    .navigationTitle("Sign In")
    .toolbar {
      ToolbarItem(placement: .navigationBarTrailing) {
        Button("Change Region") {
          showingRegionSelector = true
        }
      }
    }
    .sheet(isPresented: $showingRegionSelector) {
      ServerSelectionView()
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
      HStack(spacing: 12) {
        if isLoading {
          ProgressView()
            .progressViewStyle(CircularProgressViewStyle(tint: .white))
            .scaleEffect(0.8)
        } else {
          icon.foregroundStyle(.white)
        }
        Text(name)
          .paragraph()
        Spacer()
      }
      .frame(height: 44)
    }
    .buttonStyle(CompactButtonStyle(
      backgroundColor: backgroundColor,
      foregroundColor: .white
    ))
    .disabled(isLoading)
  }
}
