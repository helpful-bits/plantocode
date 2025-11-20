import SwiftUI
import Core

public struct MissingConfigurationView: View {
    @ObservedObject private var appState = AppState.shared
    @ObservedObject private var multiConnectionManager = MultiConnectionManager.shared
    @EnvironmentObject private var container: AppContainer
    @State private var showingDeviceSelector = false
    @State private var isRetrying = false
    @State private var hasAutoShownDeviceSelector = false

    public init() {}

    public var body: some View {
        Group {
            if case .running = appState.bootstrapState {
                loadingView
            } else if case .failed(let message) = appState.bootstrapState {
                failedView(message: message)
            } else if case let .needsConfiguration(missing) = appState.bootstrapState {
                configurationView(missing: missing)
            } else {
                idleView
            }
        }
        .onAppear {
            // Auto-present device selector if no device is configured
            if multiConnectionManager.activeDeviceId == nil && !hasAutoShownDeviceSelector {
                hasAutoShownDeviceSelector = true
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
                    showingDeviceSelector = true
                }
            }
        }
        .sheet(isPresented: $showingDeviceSelector) {
            DeviceSelectionView()
        }
    }

    // MARK: - View Components

    private var loadingView: some View {
        VStack(spacing: 24) {
            Spacer()

            VStack(spacing: 16) {
                ProgressView()
                    .progressViewStyle(CircularProgressViewStyle(tint: Color.primary))
                    .scaleEffect(1.2)

                Text("Initializing...")
                    .font(.title3)
                    .fontWeight(.medium)

                VStack(spacing: 8) {
                    if multiConnectionManager.activeDeviceId == nil {
                        LoadingStep(text: "Waiting for device selection", isActive: true)
                    } else if !multiConnectionManager.isActiveDeviceConnected {
                        LoadingStep(text: "Connecting to desktop...", isActive: true)
                    } else if !container.hasCompletedInitialLoad {
                        LoadingStep(text: "Loading project data...", isActive: true)
                    } else {
                        LoadingStep(text: "Syncing workspace...", isActive: true)
                    }
                }
                .padding(.top, 8)
            }

            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.backgroundSecondary)
    }

    private var idleView: some View {
        VStack(spacing: 16) {
            Spacer()
            Text("Preparing workspace...")
                .font(.title3)
                .foregroundColor(.secondary)
            Spacer()
        }
    }

    private func failedView(message: String) -> some View {
        VStack(spacing: 24) {
            Spacer()

            VStack(spacing: 16) {
                Image(systemName: "exclamationmark.triangle.fill")
                    .font(.system(size: 48))
                    .foregroundColor(.orange)

                Text("Initialization Failed")
                    .font(.title2)
                    .fontWeight(.semibold)

                Text(message)
                    .font(.body)
                    .foregroundColor(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 32)

                Button("Retry") {
                    Task { @MainActor in
                        isRetrying = true
                        await InitializationOrchestrator.shared.run()
                        isRetrying = false
                    }
                }
                .buttonStyle(PrimaryButtonStyle())
                .disabled(isRetrying)
                .padding(.top, 8)
            }

            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.backgroundSecondary)
    }

    private func configurationView(missing: AppState.MissingConfig) -> some View {
        VStack(spacing: 24) {
            Spacer()

            VStack(spacing: 16) {
                Image(systemName: "gearshape.2")
                    .font(.system(size: 48))
                    .foregroundColor(.blue)

                Text("Setup Required")
                    .font(.title2)
                    .fontWeight(.semibold)

                VStack(spacing: 12) {
                    if missing.projectMissing {
                        SetupStep(
                            icon: "desktopcomputer",
                            title: "Connect to Desktop",
                            description: "Select your desktop device to get started"
                        )
                    }
                    if missing.sessionsEmpty {
                        SetupStep(
                            icon: "folder",
                            title: "No Sessions Available",
                            description: "Create a session on your desktop to continue"
                        )
                    }
                }
                .padding(.horizontal, 24)
            }

            VStack(spacing: 12) {
                if missing.projectMissing {
                    Button("Select Device") {
                        showingDeviceSelector = true
                    }
                    .buttonStyle(PrimaryButtonStyle())
                    .padding(.horizontal)
                }

                if !missing.projectMissing && missing.sessionsEmpty {
                    Text("Create a session in the desktop app, then retry here")
                        .font(.footnote)
                        .foregroundColor(.secondary)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 32)
                }

                Button(isRetrying ? "Retrying..." : "Retry") {
                    Task { @MainActor in
                        isRetrying = true
                        await InitializationOrchestrator.shared.run()
                        isRetrying = false
                    }
                }
                .buttonStyle(SecondaryButtonStyle())
                .disabled(isRetrying)
                .padding(.horizontal)
            }

            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.backgroundSecondary)
    }
}

// MARK: - Supporting Views

private struct LoadingStep: View {
    let text: String
    let isActive: Bool

    var body: some View {
        HStack(spacing: 8) {
            if isActive {
                ProgressView()
                    .progressViewStyle(CircularProgressViewStyle(tint: Color.primary))
                    .scaleEffect(0.7)
            } else {
                Image(systemName: "checkmark.circle.fill")
                    .foregroundColor(.green)
                    .font(.footnote)
            }

            Text(text)
                .font(.subheadline)
                .foregroundColor(isActive ? .primary : .secondary)
        }
    }
}

private struct SetupStep: View {
    let icon: String
    let title: String
    let description: String

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: icon)
                .font(.title3)
                .foregroundColor(.blue)
                .frame(width: 32)

            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .font(.subheadline)
                    .fontWeight(.medium)

                Text(description)
                    .font(.footnote)
                    .foregroundColor(.secondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}
