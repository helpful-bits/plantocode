import SwiftUI
import Core

public struct TerminalSettingsView: View {
    @ObservedObject public var dataService: SettingsDataService
    @State private var shells: [String] = []
    @State private var selected: String = ""

    public init(dataService: SettingsDataService) {
        self.dataService = dataService
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Default Shell")
                .font(.headline)

            if !shells.isEmpty {
                Picker("Shell", selection: $selected) {
                    ForEach(shells, id: \.self) { shell in
                        Text(shell).tag(shell)
                    }
                }
                .pickerStyle(.menu)
            } else {
                Text("Loading available shells...")
                    .foregroundColor(Color.mutedForeground)
            }

            HStack(spacing: 12) {
                Button("Save") {
                    Task {
                        try? await dataService.savePreferredTerminal(value: selected)
                    }
                }
                .buttonStyle(PrimaryButtonStyle())
                .disabled(selected.isEmpty)

                Button("Reload") {
                    Task {
                        try? await reload()
                    }
                }
                .buttonStyle(SecondaryButtonStyle())
            }

            Text("This selection is stored on the remote desktop (terminal.defaultShell).")
                .font(.caption)
                .foregroundColor(Color.mutedForeground)

            Spacer()
        }
        .padding()
        .navigationTitle("Terminal Settings")
        .onAppear {
            Task {
                try? await reload()
            }
        }
    }

    private func reload() async throws {
        shells = []
        for try await res in CommandRouter.terminalGetAvailableShells() {
            if let dict = res.resultDict, let arr = dict["shells"] as? [String] {
                shells = arr
            }
        }
        try await dataService.loadPreferredTerminal()
        selected = dataService.preferredTerminal ?? (shells.first ?? "")
    }
}
