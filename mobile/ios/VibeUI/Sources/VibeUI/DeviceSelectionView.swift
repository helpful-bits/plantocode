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
        let allowedPlatforms = Set(["macos", "windows", "linux"])
        let filtered = deviceDiscovery.devices.filter { device in
            let isDesktop = device.deviceType.lowercased() == "desktop"
            let isAllowedPlatform = allowedPlatforms.contains(device.platform.lowercased())
            let isValidName = device.deviceName.lowercased() != "unknown"

            print("[DeviceSelection] Device: \(device.deviceName) - Type: \(device.deviceType) (isDesktop: \(isDesktop)), Status: \(device.status), Platform: \(device.platform) (allowed: \(isAllowedPlatform)), Name valid: \(isValidName)")

            return isDesktop && isAllowedPlatform && isValidName
        }

        // Sort: online devices first, then by name
        let sorted = filtered.sorted { first, second in
            if first.status.isAvailable != second.status.isAvailable {
                return first.status.isAvailable
            }
            return first.deviceName.localizedCaseInsensitiveCompare(second.deviceName) == .orderedAscending
        }

        print("[DeviceSelection] Filtered and sorted devices: \(sorted.count) of \(deviceDiscovery.devices.count)")
        return sorted
    }

    private var identityText: String {
        if let user = appState.currentUser {
            let name = (user.name ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            let email = (user.email ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            if !name.isEmpty && !email.isEmpty { return "\(name) — \(email)" }
            if !name.isEmpty { return name }
            if !email.isEmpty { return email }
        }
        return ""
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

                        if appState.isAuthenticated, let user = appState.currentUser {
                            HStack(alignment: .top, spacing: 8) {
                                Image(systemName: "person.circle")
                                    .font(.system(size: 16, weight: .regular))
                                    .foregroundColor(Color.mutedForeground)
                                VStack(alignment: .leading, spacing: 2) {
                                    if let name = user.name, !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                                        Text(name)
                                            .font(.footnote)
                                            .foregroundColor(Color.mutedForeground)
                                            .lineLimit(1)
                                            .truncationMode(.tail)
                                    }
                                    if let email = user.email, !email.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                                        Text(email)
                                            .font(.footnote)
                                            .foregroundColor(Color.mutedForeground)
                                            .lineLimit(1)
                                            .truncationMode(.tail)
                                    }
                                }
                                Spacer()
                            }
                            .padding(.top, 4)
                        }
                    }

                    if let errorMessage = errorMessage {
                        VStack(spacing: 8) {
                            StatusAlertView(variant: .destructive, title: "Connection Error", message: errorMessage)

                            if diagnosticsDeviceId != nil {
                                Button(action: {
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
                                            Text("Open PlanToCode on your desktop")
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
                        ScrollView {
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
                        }
                        .frame(maxHeight: 400)

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
                errorMessage = nil
                diagnosticsDeviceId = nil
            }

            Task {
                // Only restore/refresh if initialized and authenticated
                if PlanToCodeCore.shared.isInitialized && AuthService.shared.isAuthenticated {
                    await multiConnectionManager.restoreConnections()
                    await deviceDiscovery.refreshDevices()
                } else {
                    print("[DeviceSelection] Skipping device operations: not initialized or authenticated")
                }
            }
        }
        .toolbar {
            ToolbarItem(placement: .navigationBarLeading) {
                if diagnosticsDeviceId != nil && errorMessage != nil {
                    Button(action: {
                        showingDiagnostics = true
                    }) {
                        Image(systemName: "stethoscope")
                    }
                    .buttonStyle(ToolbarButtonStyle())
                }
            }

            ToolbarItemGroup(placement: .navigationBarTrailing) {
                if appState.isAuthenticated {
                    Button("Log Out") {
                        showingRegionSelector = false
                        showingDiagnostics = false
                        Task { await appState.signOut() }
                    }
                    .accessibilityLabel("Log Out")
                    .accessibilityHint("Signs out the current user")
                }

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
            } else {
                // Fallback in case deviceId is nil
                NavigationView {
                    VStack(spacing: 16) {
                        Image(systemName: "exclamationmark.triangle")
                            .font(.system(size: 48))
                            .foregroundColor(Color.destructive)

                        Text("Device Not Selected")
                            .h3()
                            .foregroundColor(Color.cardForeground)

                        Text("Please select a device before viewing diagnostics")
                            .paragraph()
                            .foregroundColor(Color.mutedForeground)
                            .multilineTextAlignment(.center)
                    }
                    .padding(24)
                    .navigationTitle("Diagnostics")
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar {
                        ToolbarItem(placement: .navigationBarTrailing) {
                            Button("Close") {
                                showingDiagnostics = false
                            }
                            .buttonStyle(ToolbarButtonStyle())
                        }
                    }
                }
            }
        }
        .onChange(of: multiConnectionManager.connectionStates) { states in
            // Reset local connecting state if the connection transitions to a terminal state
            if let deviceId = selectedDeviceId,
               let state = states[deviceId] {
                switch state {
                case .connected(_):
                    // Connection successful, reset local UI state and clear any errors
                    if isConnecting {
                        print("[DeviceSelection] Connection reached terminal state, resetting UI")
                        isConnecting = false
                        selectedDeviceId = nil
                        errorMessage = nil
                        diagnosticsDeviceId = nil
                    }
                case .failed(_):
                    // Connection failed, reset connecting state but keep error info for diagnostics
                    if isConnecting {
                        print("[DeviceSelection] Connection failed, keeping error state for diagnostics")
                        isConnecting = false
                        // errorMessage and diagnosticsDeviceId already set in connectToDevice error handler
                    }
                default:
                    break
                }
            }
        }
        .onChange(of: appState.isAuthenticated) { isAuth in
            if isAuth {
                Task { await deviceDiscovery.refreshDevices() }
            }
        }
        .onChange(of: appState.activeRegion) { _ in
            if appState.isAuthenticated {
                Task { await deviceDiscovery.refreshDevices() }
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
        // Clear error state when refreshing
        errorMessage = nil
        diagnosticsDeviceId = nil

        Task {
            await deviceDiscovery.refreshDevices()
        }
    }

    private func connectToDevice(_ device: RegisteredDevice) {
        // Guard against rapid re-entrant calls
        guard !isConnecting else {
            print("[DeviceSelection] Already connecting, ignoring duplicate call")
            return
        }

        // Validate prerequisites before attempting connection
        if !device.status.isAvailable {
            errorMessage = "Desktop device is offline"
            return
        }

        if !PlanToCodeCore.shared.isInitialized {
            errorMessage = "Initialization required. Please restart the app."
            return
        }

        if AuthService.shared.isAuthenticated == false {
            errorMessage = "Please sign in on mobile before connecting"
            return
        }

        print("[DeviceSelection] Switching to device: \(device.deviceName) (\(device.deviceId))")
        selectedDeviceId = device.deviceId
        isConnecting = true
        errorMessage = nil
        diagnosticsDeviceId = nil

        Task {
            do {
                // Check if we're switching from a different device
                let currentActive = MultiConnectionManager.shared.activeDeviceId
                let isSwitching = currentActive != nil && currentActive != device.deviceId

                if isSwitching {
                    print("[DeviceSelection] Switching from \(currentActive!.uuidString) to \(device.deviceId.uuidString)")
                }

                // Use switchActiveDevice for device switching
                let result = await MultiConnectionManager.shared.switchActiveDevice(to: device.deviceId)

                switch result {
                case .success(_):
                    print("[DeviceSelection] Switch successful, triggering state reset")

                    // Trigger full state reset
                    await MainActor.run {
                        PlanToCodeCore.shared.dataServices?.onActiveDeviceSwitch(newId: device.deviceId)
                    }

                    // Run bootstrap to fetch fresh state
                    print("[DeviceSelection] Running bootstrap for new device")
                    await InitializationOrchestrator.shared.run()

                    // Wait for bootstrap to complete
                    let deadline = Date().addingTimeInterval(8.0)
                    while Date() < deadline {
                        try? await Task.sleep(nanoseconds: 200_000_000) // 200ms
                        let state = AppState.shared.bootstrapState
                        if case .ready = state { break }
                        if case .needsConfiguration = state { break }
                    }

                    let finalState = AppState.shared.bootstrapState
                    switch finalState {
                    case .ready, .needsConfiguration:
                        await MainActor.run {
                            appState.selectedDeviceId = device.deviceId
                            isConnecting = false
                            selectedDeviceId = nil
                            errorMessage = nil
                            print("[DeviceSelection] Device switch complete")
                        }
                    default:
                        await MainActor.run {
                            errorMessage = "Desktop did not respond in time. Check that the desktop app is running and signed in with the same account."
                            isConnecting = false
                            diagnosticsDeviceId = device.deviceId
                        }
                    }

                case .failure(let error):
                    print("[DeviceSelection] Switch failed: \(error.localizedDescription)")
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
                        diagnosticsDeviceId = device.deviceId
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

                    // Get effective state from MultiConnectionManager
                    let effectiveState = multiConnectionManager.effectiveConnectionState(for: device.deviceId)

                    if isConnecting || effectiveState.isConnecting {
                        ProgressView()
                            .progressViewStyle(CircularProgressViewStyle(tint: Color.primary))
                            .scaleEffect(0.8)
                    } else if case .connected = effectiveState {
                        Image(systemName: "checkmark.circle.fill")
                            .font(.system(size: 24))
                            .foregroundColor(Color.success)
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
        case .handshaking:
            statusMessage(
                text: "Verifying connection…",
                detail: "Completing secure handshake with desktop",
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
