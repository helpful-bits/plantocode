import SwiftUI
import Core

public struct DeviceSelectionView: View {
    @ObservedObject private var deviceDiscovery = DeviceDiscoveryService.shared
    @ObservedObject private var appState = AppState.shared
    @State private var isConnecting = false
    @State private var errorMessage: String?
    @State private var selectedDeviceId: UUID?

    public init() {}

    public var body: some View {
        ZStack {
            // Match login view gradient
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
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Select Desktop Device")
                            .font(.largeTitle)
                            .fontWeight(.bold)
                            .foregroundColor(Color("CardForeground"))

                        Text("Choose a desktop device to connect to")
                            .font(.body)
                            .foregroundColor(Color("MutedForeground"))
                    }

                    if let errorMessage = errorMessage {
                        StatusAlertView(variant: .destructive, title: "Connection Error", message: errorMessage)
                    }

                    if isConnecting {
                        StatusAlertView(variant: .info, title: "Connecting...", message: "Establishing connection to desktop device")
                    }

                    if deviceDiscovery.isLoading {
                        HStack {
                            ProgressView()
                                .progressViewStyle(CircularProgressViewStyle(tint: Color("MutedForeground")))
                                .scaleEffect(0.8)
                            Text("Discovering devices...")
                                .font(.body)
                                .foregroundColor(Color("MutedForeground"))
                        }
                        .padding(.vertical)
                    }

                    if deviceDiscovery.devices.isEmpty && !deviceDiscovery.isLoading {
                        VStack(spacing: 16) {
                            Image(systemName: "desktopcomputer.trianglebadge.exclamationmark")
                                .font(.system(size: 48))
                                .foregroundColor(Color("MutedForeground"))

                            VStack(spacing: 8) {
                                Text("No Devices Found")
                                    .font(.headline)
                                    .foregroundColor(Color("CardForeground"))

                                Text("Make sure at least one Vibe Manager desktop app is running and signed in with the same account.")
                                    .font(.body)
                                    .foregroundColor(Color("MutedForeground"))
                                    .multilineTextAlignment(.center)
                            }

                            Button("Refresh") {
                                refreshDevices()
                            }
                            .buttonStyle(PrimaryButtonStyle())
                        }
                        .padding(.vertical)
                    }

                    if !deviceDiscovery.devices.isEmpty {
                        VStack(spacing: 12) {
                            ForEach(deviceDiscovery.devices) { device in
                                DeviceRow(
                                    device: device,
                                    isSelected: selectedDeviceId == device.deviceId,
                                    isConnecting: isConnecting && selectedDeviceId == device.deviceId
                                ) {
                                    connectToDevice(device)
                                }
                            }
                        }
                    }

                    HStack {
                        Button("Refresh") {
                            refreshDevices()
                        }
                        .buttonStyle(SecondaryButtonStyle())
                        .disabled(deviceDiscovery.isLoading || isConnecting)

                        Spacer()

                        if !deviceDiscovery.devices.isEmpty {
                            Text("\(deviceDiscovery.devices.count) device\(deviceDiscovery.devices.count == 1 ? "" : "s") found")
                                .font(.caption)
                                .foregroundColor(Color("MutedForeground"))
                        }
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
        .onAppear {
            Task {
                await deviceDiscovery.refreshDevices()
            }
        }
    }

    private func refreshDevices() {
        Task {
            await deviceDiscovery.refreshDevices()
        }
    }

    private func connectToDevice(_ device: RegisteredDevice) {
        guard !isConnecting else { return }

        selectedDeviceId = device.deviceId
        isConnecting = true
        errorMessage = nil

        Task {
            do {
                let result = await MultiConnectionManager.shared.addConnection(for: device.deviceId)

                switch result {
                case .success:
                    // Connection successful, proceed to main UI
                    await MainActor.run {
                        appState.selectedDeviceId = device.deviceId
                        appState.navigateToMainApp()
                    }
                case .failure(let error):
                    await MainActor.run {
                        errorMessage = error.localizedDescription
                        isConnecting = false
                        selectedDeviceId = nil
                    }
                }
            }
        }
    }
}

private struct DeviceRow: View {
    let device: RegisteredDevice
    let isSelected: Bool
    let isConnecting: Bool
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 16) {
                // Device icon
                VStack {
                    Image(systemName: deviceIcon)
                        .font(.system(size: 24))
                        .foregroundColor(device.status.isAvailable ? Color("Primary") : Color("MutedForeground"))
                }
                .frame(width: 40)

                VStack(alignment: .leading, spacing: 4) {
                    HStack {
                        Text(device.deviceName)
                            .font(.headline)
                            .foregroundColor(Color("CardForeground"))

                        Spacer()

                        // Status indicator
                        HStack(spacing: 4) {
                            Circle()
                                .fill(statusColor)
                                .frame(width: 8, height: 8)
                            Text(device.status.displayName)
                                .font(.caption)
                                .foregroundColor(Color("MutedForeground"))
                        }
                    }

                    HStack {
                        Text("\(device.platform) • \(device.appVersion)")
                            .font(.caption)
                            .foregroundColor(Color("MutedForeground"))

                        Spacer()

                        if let health = device.health {
                            HStack(spacing: 4) {
                                Image(systemName: healthIcon(health.healthStatus))
                                    .font(.caption2)
                                    .foregroundColor(healthColor(health.healthStatus))
                                Text(String(format: "%.0f%%", health.healthScore))
                                    .font(.caption2)
                                    .foregroundColor(Color("MutedForeground"))
                            }
                        }
                    }
                }

                if isConnecting {
                    ProgressView()
                        .progressViewStyle(CircularProgressViewStyle(tint: Color("Primary")))
                        .scaleEffect(0.8)
                } else if isSelected {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.title2)
                        .foregroundColor(Color("Primary"))
                } else {
                    Image(systemName: "arrow.right.circle")
                        .font(.title2)
                        .foregroundColor(Color("MutedForeground"))
                        .opacity(device.status.isAvailable ? 1.0 : 0.5)
                }
            }
            .padding(16)
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .fill(isSelected ? Color("Primary").opacity(0.1) : Color("Card"))
                    .overlay(
                        RoundedRectangle(cornerRadius: 12)
                            .stroke(
                                isSelected ? Color("Primary") : Color("Border"),
                                lineWidth: isSelected ? 2 : 1
                            )
                    )
            )
        }
        .disabled(!device.status.isAvailable || isConnecting)
        .buttonStyle(PlainButtonStyle())
    }

    private var deviceIcon: String {
        switch device.platform.lowercased() {
        case "macos":
            return "laptopcomputer"
        case "windows":
            return "desktopcomputer"
        case "linux":
            return "server.rack"
        default:
            return "desktopcomputer"
        }
    }

    private var statusColor: Color {
        switch device.status {
        case .online:
            return .green
        case .away:
            return .orange
        case .offline:
            return .gray
        }
    }

    private func healthIcon(_ status: HealthStatus) -> String {
        switch status {
        case .excellent:
            return "checkmark.circle.fill"
        case .good:
            return "checkmark.circle"
        case .fair:
            return "exclamationmark.triangle"
        case .poor:
            return "xmark.circle"
        }
    }

    private func healthColor(_ status: HealthStatus) -> Color {
        switch status {
        case .excellent:
            return .green
        case .good:
            return .blue
        case .fair:
            return .orange
        case .poor:
            return .red
        }
    }
}

// Button Styles
private struct PrimaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .padding(.horizontal, 24)
            .padding(.vertical, 12)
            .background(Color("Primary"))
            .foregroundColor(.white)
            .cornerRadius(8)
            .scaleEffect(configuration.isPressed ? 0.95 : 1.0)
            .animation(.easeInOut(duration: 0.1), value: configuration.isPressed)
    }
}

private struct SecondaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
            .background(Color("Secondary"))
            .foregroundColor(Color("SecondaryForeground"))
            .cornerRadius(6)
            .scaleEffect(configuration.isPressed ? 0.95 : 1.0)
            .animation(.easeInOut(duration: 0.1), value: configuration.isPressed)
    }
}

#Preview {
    DeviceSelectionView()
}