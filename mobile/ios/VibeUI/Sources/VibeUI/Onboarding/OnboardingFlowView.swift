import SwiftUI
import Core

public struct OnboardingFlowView: View {
    let onSkip: () -> Void
    let onComplete: () -> Void

    @EnvironmentObject private var container: AppContainer
    @State private var page = 0
    @State private var isLoadingManifest = true

    public init(onSkip: @escaping () -> Void, onComplete: @escaping () -> Void) {
        self.onSkip = onSkip
        self.onComplete = onComplete
    }

    private func handleComplete() {
        Task {
            await container.ensureFreshSubscriptionStatus()
            onComplete()
        }
    }

    private func handleSkip() {
        Task {
            await container.ensureFreshSubscriptionStatus()
            onSkip()
        }
    }

    public var body: some View {
        ZStack {
            // Background gradient
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

            VStack(spacing: 0) {
                // Skip Button (top-right)
                HStack {
                    Spacer()
                    Button(action: {
                        handleSkip()
                    }) {
                        Image(systemName: "xmark")
                            .font(.system(size: 18, weight: .medium))
                            .foregroundColor(.primary)
                            .frame(width: 44, height: 44)
                            .contentShape(Rectangle())
                    }
                }
                .padding(.horizontal, Theme.Spacing.lg)
                .padding(.top, Theme.Spacing.md)

                if isLoadingManifest {
                    // Loading state
                    Spacer()
                    VStack(spacing: 16) {
                        ProgressView()
                            .scaleEffect(1.5)
                        Text("Loading onboarding...")
                            .font(.system(size: 16))
                            .foregroundColor(.secondary)
                    }
                    Spacer()
                } else {
                    // TabView with Pages
                    TabView(selection: $page) {
                    // Page 0: Intro
                    if let videoURL = container.onboardingService.videoURL(for: "intro") {
                        OnboardingStepView(
                            title: "What you can do",
                            bullets: [
                                "Create implementation plans from your ideas",
                                "Stay in flow while AI handles the details",
                                "Sync seamlessly between mobile and desktop"
                            ],
                            videoURL: videoURL
                        )
                        .tag(0)
                    }

                    // Page 1: Workflow
                    if let videoURL = container.onboardingService.videoURL(for: "workflow") {
                        OnboardingStepView(
                            title: "Mobile + Desktop",
                            bullets: [
                                "Pick a project folder on your desktop",
                                "Run workflows from anywhere on mobile",
                                "Review and approve changes in real-time"
                            ],
                            videoURL: videoURL
                        )
                        .tag(1)
                    }

                    // Page 2: Voice
                    if let videoURL = container.onboardingService.videoURL(for: "voice") {
                        OnboardingStepView(
                            title: "Voice to Plan",
                            bullets: [
                                "Capture ideas by voice whenever inspiration strikes",
                                "AI transcribes and structures your thoughts",
                                "Turn rough notes into actionable implementation steps"
                            ],
                            videoURL: videoURL
                        )
                        .tag(2)
                    }

                    // Page 3: Plan
                    if let videoURL = container.onboardingService.videoURL(for: "plan") {
                        OnboardingStepView(
                            title: "From Task to Plan",
                            bullets: [
                                "Every task automatically gets a structured plan",
                                "Reduce wrong paths and unnecessary iterations",
                                "Ship features faster with AI-powered planning"
                            ],
                            videoURL: videoURL
                        )
                        .tag(3)
                    }
                    }
                    .tabViewStyle(.page(indexDisplayMode: .automatic))

                    // Bottom Continue Button
                    Button(action: {
                        if page < 3 {
                            withAnimation {
                                page += 1
                            }
                        } else {
                            handleComplete()
                        }
                    }) {
                        Text(page == 3 ? "Get Started" : "Continue")
                            .font(.system(size: 18, weight: .semibold))
                            .foregroundColor(.white)
                            .frame(maxWidth: .infinity)
                            .frame(height: 56)
                            .background(Color.primary)
                            .cornerRadius(Theme.Radii.lg)
                    }
                    .padding(.horizontal, Theme.Spacing.lg)
                    .padding(.bottom, Theme.Spacing.xxl)
                }
            }
        }
        .task {
            // Preload onboarding manifest on appear
            do {
                _ = try await container.onboardingService.load()
                isLoadingManifest = false
            } catch {
                // If loading fails, still show onboarding with skip option
                isLoadingManifest = false
            }
        }
    }
}
