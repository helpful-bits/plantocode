import SwiftUI
import Core

public struct NotificationsSettingsView: View {
    @ObservedObject var dataService: SettingsDataService

    public init(dataService: SettingsDataService) {
        self.dataService = dataService
    }

    public var body: some View {
        Form {
            Section("Notifications") {
                Toggle("File Finder Results", isOn: $dataService.notifyFileFinderResultsEnabled)
                    .onChange(of: dataService.notifyFileFinderResultsEnabled) { newValue in
                        Task {
                            try? await dataService.saveNotifyFileFinderEnabled(newValue)
                        }
                    }

                Toggle("Implementation Plan Ready", isOn: $dataService.notifyPlanReadyEnabled)
                    .onChange(of: dataService.notifyPlanReadyEnabled) { newValue in
                        Task {
                            try? await dataService.saveNotifyPlanReadyEnabled(newValue)
                        }
                    }

                Toggle("Terminal Inactivity", isOn: $dataService.notifyTerminalInactivityEnabled)
                    .onChange(of: dataService.notifyTerminalInactivityEnabled) { newValue in
                        Task {
                            try? await dataService.saveNotifyTerminalInactivityEnabled(newValue)
                        }
                    }
            }
        }
        .navigationTitle("Notifications")
        .task {
            try? await dataService.loadNotificationSettings()
        }
    }
}
