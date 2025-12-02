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

        VStack(alignment: .leading, spacing: Theme.Spacing.xl) {
          Text("PlanToCode")
            .h1()

          Text("Sign in with your preferred provider")
            .paragraph()
            .foregroundColor(Color.mutedForeground)

          // Show status messages when needed with smooth animation
          if let err = errorMessage ?? appState.authError {
            StatusAlertView(variant: .destructive, title: "Error", message: err)
              .transition(.move(edge: .top).combined(with: .opacity))
          } else if loadingProvider != nil {
            StatusAlertView(variant: .info, title: "Signing In...", message: "Complete the sign-in in your browser.")
              .transition(.move(edge: .top).combined(with: .opacity))
          }

          if errorMessage != nil || appState.authError != nil || loadingProvider != nil {
            Divider().padding(.vertical, Theme.Spacing.xs)
          }

          LazyVGrid(columns: columns, spacing: Theme.Spacing.md) {
            Button(action: { handleSignIn("google-oauth2") }) {
              HStack(spacing: Theme.Spacing.md) {
                if loadingProvider == "google-oauth2" {
                  ProgressView()
                    .progressViewStyle(CircularProgressViewStyle(tint: .white))
                    .scaleEffect(0.8)
                } else {
                  Image("GoogleIcon")
                    .resizable()
                    .aspectRatio(contentMode: .fit)
                    .frame(width: 18, height: 18)
                    .padding(3)
                    .background(Color.white)
                    .clipShape(Circle())
                }
                Text("Google")
                Spacer()
              }
            }
            .buttonStyle(SocialLoginButtonStyle(provider: .google))
            .disabled(loadingProvider == "google-oauth2")

            Button(action: { handleSignIn("github") }) {
              HStack(spacing: Theme.Spacing.md) {
                if loadingProvider == "github" {
                  ProgressView()
                    .progressViewStyle(CircularProgressViewStyle(tint: .white))
                    .scaleEffect(0.8)
                } else {
                  Image("GitHubIcon")
                    .resizable()
                    .renderingMode(.template)
                    .aspectRatio(contentMode: .fit)
                    .frame(width: 20, height: 20)
                }
                Text("GitHub")
                Spacer()
              }
            }
            .buttonStyle(SocialLoginButtonStyle(provider: .github))
            .disabled(loadingProvider == "github")

            Button(action: { handleSignIn("windowslive") }) {
              HStack(spacing: Theme.Spacing.md) {
                if loadingProvider == "windowslive" {
                  ProgressView()
                    .progressViewStyle(CircularProgressViewStyle(tint: .white))
                    .scaleEffect(0.8)
                } else {
                  Image("MicrosoftIcon")
                    .resizable()
                    .aspectRatio(contentMode: .fit)
                    .frame(width: 20, height: 20)
                }
                Text("Microsoft")
                Spacer()
              }
            }
            .buttonStyle(SocialLoginButtonStyle(provider: .microsoft))
            .disabled(loadingProvider == "windowslive")

            Button(action: { handleSignIn("apple") }) {
              HStack(spacing: Theme.Spacing.md) {
                if loadingProvider == "apple" {
                  ProgressView()
                    .progressViewStyle(CircularProgressViewStyle(tint: .white))
                    .scaleEffect(0.8)
                } else {
                  Image(systemName: "apple.logo")
                    .font(.system(size: 20))
                }
                Text("Apple")
                Spacer()
              }
            }
            .buttonStyle(SocialLoginButtonStyle(provider: .apple))
            .disabled(loadingProvider == "apple")
          }

          VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
            Text("By signing in you agree to our")
              .font(.footnote)
              .foregroundColor(Color.mutedForeground)

            HStack(spacing: Theme.Spacing.xs) {
              if let termsURL = URL(string: "https://plantocode.com/terms") {
                Link("Terms of Service", destination: termsURL)
                  .font(.footnote)
                  .foregroundColor(Color.primary)
              }
              Text("and")
                .font(.footnote)
                .foregroundColor(Color.mutedForeground)
              if let privacyURL = URL(string: "https://plantocode.com/privacy") {
                Link("Privacy Policy", destination: privacyURL)
                  .font(.footnote)
                  .foregroundColor(Color.primary)
              }
            }
          }
          .padding(.top, Theme.Spacing.sm)
        }
        .padding(Theme.Spacing.xxl)
        .background(
          Color.background
            .opacity(0.95)
        )
        .overlay(
          RoundedRectangle(cornerRadius: Theme.Radii.lg * 2.5)
            .stroke(Color.border.opacity(0.6), lineWidth: 1)
        )
        .cornerRadius(Theme.Radii.lg * 2.5)
        .shadow(color: Color.border.opacity(0.1), radius: 3, x: 0, y: 1)
        .shadow(color: Color.border.opacity(0.05), radius: 2, x: 0, y: 1)
        .frame(maxWidth: 520)

        Spacer()
      }
      .padding(.horizontal, Theme.Spacing.lg)
    }
    .toolbar {
      ToolbarItem(placement: .navigationBarTrailing) {
        Button("Change Region") {
          showingRegionSelector = true
        }
      }
    }
    .sheet(isPresented: $showingRegionSelector) {
      ServerSelectionView(isModal: true)
    }
  }

  private func handleSignIn(_ provider: String) {
    withAnimation(.easeInOut(duration: 0.3)) {
      errorMessage = nil
      loadingProvider = provider
    }
    Task {
      do {
        try await appState.signIn(providerHint: provider)
      } catch {
        withAnimation(.easeInOut(duration: 0.3)) {
          errorMessage = error.localizedDescription
        }
      }
      withAnimation(.easeInOut(duration: 0.3)) {
        loadingProvider = nil
      }
    }
  }
}
