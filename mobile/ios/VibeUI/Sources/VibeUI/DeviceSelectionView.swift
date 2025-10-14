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
    @State private var showingDiagnostics = false
    @State private var diagnosticsDeviceId: UUID?

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
                        VStack(spacing: 8) {
                            StatusAlertView(variant: .destructive, title: "Connection Error", message: errorMessage)

                            if let deviceId = selectedDeviceId {
                                Button(action: {
                                    diagnosticsDeviceId = deviceId
                                    showingDiagnostics = true
                                }) {
                                    HStack {
                                        Image(systemName: "stethoscope")
                                        Text("Why can't I connect?")
                                    }
                                    .small()
                                }
                                .buttonStyle(SecondaryButtonStyle())
                            }
                        }
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

                                VStack(alignment: .leading, spacing: 12) {
                                    Text("To connect your mobile device:")
                                        .paragraph()
                                        .foregroundColor(Color.cardForeground)
                                        .fontWeight(.medium)

                                    VStack(alignment: .leading, spacing: 8) {
                                        HStack(alignment: .top, spacing: 8) {
                                            Text("1.")
                                                .paragraph()
                                                .foregroundColor(Color.mutedForeground)
                                                .frame(width: 20, alignment: .leading)
                                            Text("Open Vibe Manager on your desktop")
                                                .paragraph()
                                                .foregroundColor(Color.mutedForeground)
                                        }

                                        HStack(alignment: .top, spacing: 8) {
                                            Text("2.")
                                                .paragraph()
                                                .foregroundColor(Color.mutedForeground)
                                                .frame(width: 20, alignment: .leading)
                                            Text("Sign in with the same account")
                                                .paragraph()
                                                .foregroundColor(Color.mutedForeground)
                                                .fontWeight(.semibold)
                                        }

                                        HStack(alignment: .top, spacing: 8) {
                                            Text("3.")
                                                .paragraph()
                                                .foregroundColor(Color.mutedForeground)
                                                .frame(width: 20, alignment: .leading)
                                            Text("Enable 'Allow Remote Access' and 'Discoverable' in Settings")
                                                .paragraph()
                                                .foregroundColor(Color.mutedForeground)
                                        }
                                    }
                                }
                                .padding(.horizontal, 8)
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
            // Reset local connection state when view appears
            // (in case we navigated back after a connection was established)
            if let selectedId = selectedDeviceId,
               let state = multiConnectionManager.connectionStates[selectedId],
               case .connected(_) = state {
                print("[DeviceSelection] View appeared with existing connection, resetting local state")
                isConnecting = false
                selectedDeviceId = nil
            }

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
        .toolbar {
            ToolbarItem(placement: .navigationBarLeading) {
                if let deviceId = selectedDeviceId, errorMessage != nil {
                    Button(action: {
                        diagnosticsDeviceId = deviceId
                        showingDiagnostics = true
                    }) {
                        Image(systemName: "stethoscope")
                    }
                    .buttonStyle(ToolbarButtonStyle())
                }
            }

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
        .sheet(isPresented: $showingDiagnostics) {
            if let deviceId = diagnosticsDeviceId {
                ConnectionDiagnosticsView(deviceId: deviceId)
            }
        }
        .onChange(of: multiConnectionManager.connectionStates) { states in
            // Reset local connecting state if the connection transitions to a terminal state
            if let deviceId = selectedDeviceId,
               let state = states[deviceId] {
                switch state {
                case .connected(_), .failed(_):
                    // Connection reached a terminal state, reset local UI state
                    if isConnecting {
                        print("[DeviceSelection] Connection reached terminal state, resetting UI")
                        isConnecting = false
                        selectedDeviceId = nil
                    }
                default:
                    break
                }
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
                    print("[DeviceSelection] Connection successful, running bootstrap")
                    // Run bootstrap to initialize project and sessions, which will set state to .ready
                    await InitializationOrchestrator.shared.run()
                    // Note: AuthFlowCoordinator advances to workspace based on connection state and bootstrap state
                    await MainActor.run {
                        appState.selectedDeviceId = device.deviceId
                        appState.navigateToMainApp()
                        // Reset local state now that connection is established
                        isConnecting = false
                        selectedDeviceId = nil
                    }
                case .failure(let error):
                    print("[DeviceSelection] Connection failed: \(error.localizedDescription)")
                    await MainActor.run {
                        // Map specific errors to user-friendly messages
                        if let multiError = error as? MultiConnectionError {
                            switch multiError {
                            case .authenticationRequired:
                                errorMessage = "Authentication required. Please sign in."
                            case .invalidConfiguration:
                                errorMessage = "Initialization required. Please restart the app."
                            default:
                                errorMessage = error.localizedDescription
                            }
                        } else if let relayError = error as? ServerRelayError {
                            errorMessage = ConnectivityDiagnostics.userFriendlyMessage(for: relayError)
                        } else {
                            errorMessage = error.localizedDescription
                        }
                        isConnecting = false
                        // Keep selectedDeviceId for diagnostics button
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
            VStack(alignment: .leading, spacing: 12) {
                // Device name and platform
                HStack {
                    Image(systemName: deviceIcon)
                        .font(.system(size: 24))
                        .foregroundColor(Color.primary)

                    VStack(alignment: .leading, spacing: 2) {
                        Text(device.deviceName)
                            .h4()
                            .foregroundColor(Color.cardForeground)

                        Text("\(platformName) • \(device.appVersion)")
                            .small()
                            .foregroundColor(Color.mutedForeground)
                    }

                    Spacer()

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

                // Connection status with clear messaging
                if let state = multiConnectionManager.connectionStates[device.deviceId] {
                    connectionStatusMessage(for: state)
                } else if !device.status.isAvailable {
                    statusMessage(
                        text: "Device Offline",
                        detail: "The desktop device is not connected to the server. Make sure the desktop app is running and connected.",
                        color: Color.mutedForeground
                    )
                } else {
                    statusMessage(
                        text: "Ready to Connect",
                        detail: "Tap to establish connection with this device",
                        color: Color.success
                    )
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
    }

    @ViewBuilder
    private func connectionStatusMessage(for state: ConnectionState) -> some View {
        switch state {
        case .connected:
            statusMessage(
                text: "Connected",
                detail: "Successfully connected to desktop device",
                color: Color.success
            )
        case .connecting:
            statusMessage(
                text: "Connecting...",
                detail: "Establishing WebSocket connection to relay server",
                color: Color.warning
            )
        case .reconnecting:
            statusMessage(
                text: "Reconnecting...",
                detail: "Connection interrupted, attempting to reconnect",
                color: Color.warning
            )
        case .disconnected:
            statusMessage(
                text: "Disconnected",
                detail: "Connection closed. Tap to reconnect.",
                color: Color.mutedForeground
            )
        case .failed(let error):
            let (message, detail) = connectionErrorDetails(error)
            statusMessage(
                text: message,
                detail: detail,
                color: Color.destructive
            )
        default:
            statusMessage(
                text: "Unknown Status",
                detail: "Connection state unclear",
                color: Color.mutedForeground
            )
        }
    }

    @ViewBuilder
    private func statusMessage(text: String, detail: String, color: Color) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(text)
                .font(.system(size: 13, weight: .semibold))
                .foregroundColor(color)

            Text(detail)
                .font(.system(size: 12))
                .foregroundColor(Color.mutedForeground)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(8)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(color.opacity(0.1))
        .cornerRadius(6)
    }

    private func connectionErrorDetails(_ error: Error) -> (String, String) {
        if let relayError = error as? ServerRelayError {
            switch relayError {
            case .timeout:
                return ("Connection Timed Out", "Server did not respond within 20 seconds. Check if desktop is running and authenticated with the same account.")
            case .notConnected:
                return ("Not Connected", "WebSocket connection failed. Check your internet connection.")
            case .invalidURL:
                return ("Configuration Error", "Invalid server URL. Please check your settings.")
            case .invalidState(let message):
                return ("Invalid State", message)
            case .networkError(let underlyingError):
                return ("Network Error", underlyingError.localizedDescription)
            case .encodingError:
                return ("Data Error", "Failed to encode connection data. Try restarting the app.")
            case .disconnected:
                return ("Disconnected", "Connection closed by server. Tap to reconnect.")
            case .serverError(let code, let message):
                switch code {
                case "device_ownership_failed":
                    return ("Device Ownership Mismatch", "This device is registered to a different account. Sign in with the correct account on desktop.")
                case "auth_required":
                    return ("Authentication Failed", "Desktop device authentication failed. Make sure you're signed in on desktop.")
                case "invalid_device_id", "missing_device_id":
                    return ("Invalid Device", "Device ID format is invalid. Try reinstalling the app.")
                case "missing_scope":
                    return ("Permission Denied", "Missing required permissions. Make sure you're signed in correctly.")
                default:
                    return ("Server Error", message.isEmpty ? "Server returned error: \(code). Contact support if this persists." : message)
                }
            }
        } else if let multiError = error as? MultiConnectionError {
            switch multiError {
            case .authenticationRequired:
                return ("Authentication Required", "Please sign in again. Your session may have expired.")
            case .invalidConfiguration:
                return ("Configuration Error", "App not initialized properly. Try restarting the app.")
            case .deviceNotFound:
                return ("Device Not Found", "The desktop device is no longer registered. Make sure it's connected.")
            case .connectionFailed(let reason):
                return ("Connection Failed", reason)
            }
        }

        return ("Connection Failed", error.localizedDescription)
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

    private var platformName: String {
        switch device.platform.lowercased() {
        case "macos":
            return "macOS"
        case "windows":
            return "Windows"
        case "linux":
            return "Linux"
        default:
            return device.platform
        }
    }
}

#Preview {
    DeviceSelectionView()
}
