import SwiftUI
import Core

public struct ConnectionDiagnosticsView: View {
    let deviceId: UUID
    @Environment(\.dismiss) var dismiss
    @State private var diagnosticsReport: DiagnosticsReport?
    @State private var isLoading = true
    @State private var isRetrying = false

    public init(deviceId: UUID) {
        self.deviceId = deviceId
    }

    public var body: some View {
        NavigationView {
            ZStack {
                Color.background.ignoresSafeArea()

                if isLoading {
                    VStack(spacing: 16) {
                        ProgressView()
                            .progressViewStyle(CircularProgressViewStyle(tint: Color.primary))
                            .scaleEffect(1.2)
                        Text("Running diagnostics...")
                            .paragraph()
                            .foregroundColor(Color.mutedForeground)
                    }
                } else if let report = diagnosticsReport {
                    ScrollView {
                        VStack(alignment: .leading, spacing: 24) {
                            // Header
                            VStack(alignment: .leading, spacing: 8) {
                                HStack {
                                    Image(systemName: "network")
                                        .font(.system(size: 32))
                                        .foregroundColor(Color.primary)
                                    Spacer()
                                }
                                Text("Connection Diagnostics")
                                    .h2()
                                    .foregroundColor(Color.cardForeground)
                                Text("Troubleshooting information for your connection")
                                    .paragraph()
                                    .foregroundColor(Color.mutedForeground)
                            }
                            .padding(.bottom, 8)

                            // Suggested Fix Callout
                            VStack(alignment: .leading, spacing: 12) {
                                HStack(spacing: 8) {
                                    Image(systemName: suggestedFixIcon(report))
                                        .foregroundColor(suggestedFixColor(report))
                                    Text("Suggested Fix")
                                        .h4()
                                        .foregroundColor(Color.cardForeground)
                                }

                                Text(report.suggestedFix)
                                    .paragraph()
                                    .foregroundColor(Color.cardForeground)
                            }
                            .padding(16)
                            .background(
                                RoundedRectangle(cornerRadius: 12)
                                    .fill(suggestedFixColor(report).opacity(0.1))
                            )
                            .overlay(
                                RoundedRectangle(cornerRadius: 12)
                                    .stroke(suggestedFixColor(report).opacity(0.3), lineWidth: 1)
                            )

                            // Diagnostic Details
                            VStack(alignment: .leading, spacing: 16) {
                                Text("Diagnostic Details")
                                    .h4()
                                    .foregroundColor(Color.cardForeground)

                                DiagnosticRow(
                                    icon: "server.rack",
                                    label: "Server URL",
                                    value: report.serverURL.absoluteString,
                                    status: .neutral
                                )

                                DiagnosticRow(
                                    icon: "person.circle",
                                    label: "Authentication",
                                    value: report.isAuthenticated ? "Signed In" : "Not Signed In",
                                    status: report.isAuthenticated ? .success : .error
                                )

                                DiagnosticRow(
                                    icon: "antenna.radiowaves.left.and.right",
                                    label: "Relay Connection",
                                    value: report.relayReachable ? "Connected" : "Not Connected",
                                    status: report.relayReachable ? .success : .warning
                                )

                                DiagnosticRow(
                                    icon: "desktopcomputer",
                                    label: "Desktop Device",
                                    value: report.devicePresent ? "Found" : "Not Found",
                                    status: report.devicePresent ? .success : .error
                                )

                                DiagnosticRow(
                                    icon: "circle.fill",
                                    label: "Device Status",
                                    value: report.deviceStatus.displayName,
                                    status: deviceStatusToStatus(report.deviceStatus)
                                )

                                if let error = report.lastRelayError {
                                    VStack(alignment: .leading, spacing: 8) {
                                        HStack(spacing: 8) {
                                            Image(systemName: "exclamationmark.triangle")
                                                .foregroundColor(Color.destructive)
                                            Text("Last Error")
                                                .h4()
                                                .foregroundColor(Color.cardForeground)
                                        }

                                        VStack(alignment: .leading, spacing: 4) {
                                            Text("Code: \(error.code)")
                                                .small()
                                                .foregroundColor(Color.mutedForeground)
                                                .fontWeight(.medium)

                                            Text(error.message)
                                                .small()
                                                .foregroundColor(Color.mutedForeground)
                                        }
                                        .padding(12)
                                        .background(
                                            RoundedRectangle(cornerRadius: 8)
                                                .fill(Color.destructive.opacity(0.1))
                                        )
                                    }
                                }
                            }
                            .padding(16)
                            .background(
                                RoundedRectangle(cornerRadius: 12)
                                    .fill(Color.card)
                            )
                            .overlay(
                                RoundedRectangle(cornerRadius: 12)
                                    .stroke(Color.border, lineWidth: 1)
                            )

                            // Retry Button
                            Button(action: retryConnection) {
                                HStack {
                                    if isRetrying {
                                        ProgressView()
                                            .progressViewStyle(CircularProgressViewStyle(tint: .white))
                                            .scaleEffect(0.8)
                                    } else {
                                        Image(systemName: "arrow.clockwise")
                                    }
                                    Text(isRetrying ? "Retrying..." : "Retry Connection")
                                }
                                .frame(maxWidth: .infinity)
                            }
                            .buttonStyle(PrimaryButtonStyle())
                            .disabled(isRetrying)
                        }
                        .padding(24)
                    }
                }
            }
            .navigationTitle("Diagnostics")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Close") {
                        dismiss()
                    }
                    .buttonStyle(ToolbarButtonStyle())
                }
            }
        }
        .onAppear {
            runDiagnostics()
        }
    }

    private func runDiagnostics() {
        isLoading = true
        Task {
            let report = await ConnectivityDiagnostics.run(for: deviceId)
            await MainActor.run {
                diagnosticsReport = report
                isLoading = false
            }
        }
    }

    private func retryConnection() {
        isRetrying = true
        Task {
            let result = await MultiConnectionManager.shared.addConnection(for: deviceId)
            await MainActor.run {
                isRetrying = false
                switch result {
                case .success:
                    // Connection successful, dismiss diagnostics
                    dismiss()
                case .failure:
                    // Re-run diagnostics to show updated status
                    runDiagnostics()
                }
            }
        }
    }

    private func suggestedFixIcon(_ report: DiagnosticsReport) -> String {
        if !report.isAuthenticated {
            return "exclamationmark.triangle.fill"
        } else if !report.devicePresent || report.deviceStatus == .offline {
            return "exclamationmark.circle.fill"
        } else if !report.relayReachable {
            return "wifi.exclamationmark"
        } else {
            return "info.circle.fill"
        }
    }

    private func suggestedFixColor(_ report: DiagnosticsReport) -> Color {
        if !report.isAuthenticated {
            return Color.destructive
        } else if !report.devicePresent || report.deviceStatus == .offline {
            return Color.warning
        } else if !report.relayReachable {
            return Color.warning
        } else {
            return Color.primary
        }
    }

    private func deviceStatusToStatus(_ status: DeviceConnectionStatus) -> DiagnosticStatus {
        switch status {
        case .online:
            return .success
        case .away:
            return .warning
        case .offline:
            return .error
        case .unknown:
            return .neutral
        }
    }
}

// MARK: - Supporting Views

private struct DiagnosticRow: View {
    let icon: String
    let label: String
    let value: String
    let status: DiagnosticStatus

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 20))
                .foregroundColor(Color.mutedForeground)
                .frame(width: 24)

            VStack(alignment: .leading, spacing: 2) {
                Text(label)
                    .small()
                    .foregroundColor(Color.mutedForeground)
                Text(value)
                    .paragraph()
                    .foregroundColor(Color.cardForeground)
                    .fontWeight(.medium)
            }

            Spacer()

            Circle()
                .fill(status.color)
                .frame(width: 8, height: 8)
        }
    }
}

private enum DiagnosticStatus {
    case success
    case warning
    case error
    case neutral

    var color: Color {
        switch self {
        case .success:
            return Color.success
        case .warning:
            return Color.warning
        case .error:
            return Color.destructive
        case .neutral:
            return Color.mutedForeground
        }
    }
}

#Preview {
    ConnectionDiagnosticsView(deviceId: UUID())
}
