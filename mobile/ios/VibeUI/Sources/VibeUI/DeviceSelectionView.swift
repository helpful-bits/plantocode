import SwiftUI
import Core

public struct DeviceSelectionView: View {
    @ObservedObject private var deviceDiscovery = DeviceDiscoveryService.shared
    @ObservedObject private var appState = AppState.shared
    @StateObject private var multiConnectionManager = MultiConnectionManager.shared
    @State private var isConnecting = false
    @State private var errorMessage: String?
    @State private var selectedDeviceId: UUID?
    @State private var showingRegionSelector = false

    private var filteredDevices: [RegisteredDevice] {
        let filtered = deviceDiscovery.devices.filter {
            let isDesktop = $0.deviceType.lowercased() == "desktop"
            let isAvailable = $0.status.isAvailable
            print("[DeviceSelection] Device: \($0.deviceName) - Type: \($0.deviceType) (isDesktop: \(isDesktop)), Status: \($0.status) (isAvailable: \(isAvailable))")
            return isDesktop && isAvailable
        }
        print("[DeviceSelection] Filtered devices: \(filtered.count) of \(deviceDiscovery.devices.count)")
        return filtered
    }

    public init() {}

    public var body: some View {
        ZStack {
            // Match login view gradient
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
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Select Desktop Device")
                            .h1()
                            .foregroundColor(Color.cardForeground)

                        Text("Choose a desktop device to connect to")
                            .paragraph()
                            .foregroundColor(Color.mutedForeground)
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
                                .progressViewStyle(CircularProgressViewStyle(tint: Color.mutedForeground))
                                .scaleEffect(0.8)
                            Text("Discovering devices...")
                                .paragraph()
                                .foregroundColor(Color.mutedForeground)
                        }
                        .padding(.vertical)
                    }

                    if filteredDevices.isEmpty && !deviceDiscovery.isLoading {
                        VStack(spacing: 16) {
                            Image(systemName: "desktopcomputer.trianglebadge.exclamationmark")
                                .font(.system(size: 48))
                                .foregroundColor(Color.mutedForeground)

                            VStack(spacing: 8) {
                                Text("No Devices Found")
                                    .h3()
                                    .foregroundColor(Color.cardForeground)

                                Text("Open the Vibe Manager desktop app, sign in with the same account, and enable 'Allow Remote Access' and 'Discoverable' in Settings.")
                                    .paragraph()
                                    .foregroundColor(Color.mutedForeground)
                                    .multilineTextAlignment(.center)
                            }

                            Button("Refresh") {
                                refreshDevices()
                            }
                            .buttonStyle(PrimaryButtonStyle())
                            .accessibilityLabel("Refresh")
                            .accessibilityHint("Searches for available devices")
                        }
                        .padding(.vertical)
                    }

                    if !filteredDevices.isEmpty {
                        VStack(spacing: 12) {
                            ForEach(filteredDevices) { device in
                                DeviceRow(
                                    device: device,
                                    isSelected: selectedDeviceId == device.deviceId,
                                    isConnecting: isConnecting && selectedDeviceId == device.deviceId
                                ) {
                                    connectToDevice(device)
                                }
                            }
                        }

                        HStack {
                            Button("Refresh") {
                                refreshDevices()
                            }
                            .buttonStyle(SecondaryButtonStyle())
                            .disabled(deviceDiscovery.isLoading || isConnecting)
                            .accessibilityLabel("Refresh")
                            .accessibilityHint("Searches for available devices")

                            Spacer()

                            Text("\(filteredDevices.count) device\(filteredDevices.count == 1 ? "" : "s") found")
                                .small()
                                .foregroundColor(Color.mutedForeground)
                        }
                        .padding(.top, 8)
                    }
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
        .onAppear {
            Task {
                // Only restore/refresh if initialized and authenticated
                if VibeManagerCore.shared.isInitialized && AuthService.shared.isAuthenticated {
                    await multiConnectionManager.restoreConnections()
                    await deviceDiscovery.refreshDevices()
                } else {
                    print("[DeviceSelection] Skipping device operations: not initialized or authenticated")
                }
            }
        }
        .navigationTitle("Select Device")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button("Change Region") {
                    showingRegionSelector = true
                }
                .buttonStyle(ToolbarButtonStyle())
            }
        }
        .sheet(isPresented: $showingRegionSelector) {
            NavigationStack {
                ServerSelectionView(isModal: true)
            }
        }
    }

    private func refreshDevices() {
        if isConnecting, let deviceId = selectedDeviceId {
            print("[DeviceSelection] Refresh requested while connecting; cancelling pending connection")
            MultiConnectionManager.shared.removeConnection(deviceId: deviceId)
            selectedDeviceId = nil
            isConnecting = false
        }
        Task {
            await deviceDiscovery.refreshDevices()
        }
    }

    private func connectToDevice(_ device: RegisteredDevice) {
        guard !isConnecting else { return }

        // Validate prerequisites before attempting connection
        if !VibeManagerCore.shared.isInitialized {
            errorMessage = "Initialization required. Please restart the app."
            isConnecting = false
            return
        }

        if AuthService.shared.isAuthenticated == false {
            errorMessage = "Please sign in before connecting."
            isConnecting = false
            return
        }

        print("[DeviceSelection] Initiating connection to device: \(device.deviceName) (\(device.deviceId))")
        selectedDeviceId = device.deviceId
        isConnecting = true
        errorMessage = nil

        Task {
            do {
                let result = await MultiConnectionManager.shared.addConnection(for: device.deviceId)

                switch result {
                case .success:
                    print("[DeviceSelection] Connection successful, navigating to main app")
                    // Note: AuthFlowCoordinator advances to workspace based on connection state; this view does not perform hard navigation.
                    await MainActor.run {
                        appState.selectedDeviceId = device.deviceId
                        appState.navigateToMainApp()
                    }
                case .failure(let error):
                    print("[DeviceSelection] Connection failed: \(error.localizedDescription)")
                    await MainActor.run {
                        // Map specific errors to user-friendly messages
                        if let multiError = error as? MultiConnectionError {
                            switch multiError {
                            case .authenticationRequired:
                                errorMessage = "Please sign in before connecting."
                            case .invalidConfiguration:
                                errorMessage = "Initialization required. Please restart the app."
                            default:
                                errorMessage = error.localizedDescription
                            }
                        } else {
                            errorMessage = error.localizedDescription
                        }
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
    @StateObject private var multiConnectionManager = MultiConnectionManager.shared

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 16) {
                // Connection indicator
                if let state = multiConnectionManager.connectionStates[device.deviceId] {
                    Circle()
                        .fill(connectionIndicatorColor(for: state))
                        .frame(width: 8, height: 8)
                }

                // Device icon
                VStack {
                    Image(systemName: deviceIcon)
                        .font(.system(size: 48))
                        .foregroundColor(device.status.isAvailable ? Color.primary : Color.mutedForeground)
                }
                .frame(width: 40)

                VStack(alignment: .leading, spacing: 4) {
                    HStack {
                        Text(device.deviceName)
                            .h4()
                            .foregroundColor(Color.cardForeground)

                        Spacer()

                        // Status indicator
                        HStack(spacing: 4) {
                            Circle()
                                .fill(statusColor)
                                .frame(width: 8, height: 8)
                            Text(device.status.displayName)
                                .small()
                                .foregroundColor(Color.mutedForeground)
                        }
                    }

                    HStack {
                        Text("\(device.platform) • \(device.appVersion)")
                            .small()
                            .foregroundColor(Color.mutedForeground)

                        Spacer()

                        if let health = device.health {
                            HStack(spacing: 4) {
                                Image(systemName: healthIcon(health.healthStatus))
                                    .small()
                                    .foregroundColor(healthColor(health.healthStatus))
                                Text(String(format: "%.0f%%", health.healthScore))
                                    .small()
                                    .foregroundColor(Color.mutedForeground)
                            }
                        }
                    }
                }

                if isConnecting {
                    ProgressView()
                        .progressViewStyle(CircularProgressViewStyle(tint: Color.primary))
                        .scaleEffect(0.8)
                } else if isSelected {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.system(size: 24))
                        .foregroundColor(Color.primary)
                } else {
                    Image(systemName: "arrow.right.circle")
                        .font(.system(size: 24))
                        .foregroundColor(Color.mutedForeground)
                        .opacity(device.status.isAvailable ? 1.0 : 0.5)
                }
            }
            .padding(16)
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .fill(isSelected ? Color.primary.opacity(0.1) : Color.card)
                    .overlay(
                        RoundedRectangle(cornerRadius: 12)
                            .stroke(
                                isSelected ? Color.primary : Color.border,
                                lineWidth: isSelected ? 2 : 1
                            )
                    )
            )
        }
        .disabled(!device.status.isAvailable || isConnecting)
        .buttonStyle(PlainButtonStyle())
        .accessibilityLabel("\(device.deviceName), \(device.platform), \(device.status.displayName)")
        .accessibilityHint("Connects to this device")
        .accessibilityValue(isSelected ? "Selected" : (isConnecting ? "Connecting" : ""))
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
            return Color.success
        case .away:
            return Color.warning
        case .offline:
            return Color.mutedForeground
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
            return Color.success
        case .good:
            return Color.primary
        case .fair:
            return Color.warning
        case .poor:
            return Color.destructive
        }
    }

    private func connectionIndicatorColor(for state: ConnectionState) -> Color {
        switch state {
        case .connected: return Color.success
        case .connecting, .reconnecting: return Color.warning
        case .disconnected, .failed: return Color.destructive
        default: return Color.mutedForeground
        }
    }
}

#Preview {
    DeviceSelectionView()
}
