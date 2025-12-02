import SwiftUI
import Core

public struct SettingsView: View {
  @Environment(\.dismiss) private var dismiss
  @EnvironmentObject private var appState: AppState
  @EnvironmentObject private var container: AppContainer

  @State private var showRegion = false
  @State private var showDevices = false
  @State private var showAccount = false
  @State private var selectedCliTool = "claude"
  @State private var customCommand = ""
  @State private var additionalArgs = ""
  @State private var isLoadingCliSettings = false
  @State private var hasLoadedInitialSettings = false
  @State private var showFolderPicker = false
  @State private var externalFoldersError: String?
  @FocusState private var focusedField: Field?

  @StateObject private var accountDataService = AccountDataService()
  @State private var showDeleteAccountDialog = false
  @State private var deleteErrorMessage: String?

  enum Field {
    case customCommand
    case additionalArgs
  }

  private var currentProjectDirectory: String? {
    if let d = container.currentProject?.directory, !d.isEmpty { return d }
    if let d = container.sessionService.currentSession?.projectDirectory, !d.isEmpty { return d }
    if let d = appState.selectedProjectDirectory, !d.isEmpty { return d }
    return nil
  }

  private var currentExternalFolders: [String] {
    guard let projectDir = currentProjectDirectory else { return [] }
    return container.settingsService.externalFolders(for: projectDir)
  }

  public init() {}

  public var body: some View {
    NavigationStack {
      VStack {
        Form {
          Section("Active Project") {
            ProjectSelectionHeaderView(onProjectChanged: nil)
            .environmentObject(appState)
            .environmentObject(container)

            if currentProjectDirectory != nil {
              Button(action: { showFolderPicker = true }) {
                HStack {
                  Image(systemName: "folder.badge.plus")
                    .foregroundColor(.accentColor)
                  Text("Add External Folder")
                    .foregroundColor(.primary)
                  Spacer()
                }
              }

              if !currentExternalFolders.isEmpty {
                ForEach(currentExternalFolders, id: \.self) { folder in
                  HStack {
                    Image(systemName: "folder.fill")
                      .foregroundColor(.accentColor)
                    Text(relativePath(for: folder))
                      .font(.system(size: 14))
                      .lineLimit(1)
                    Spacer()
                    Button(role: .destructive) {
                      removeExternalFolder(folder)
                    } label: {
                      Image(systemName: "trash")
                    }
                    .buttonStyle(.borderless)
                  }
                }
              }
            }
          }

          Section("Account") {
            HStack {
              Image(systemName: "person.circle.fill")
                .font(.system(size: 20))
                .foregroundColor(.secondary)
              Text(appState.currentUser?.email ?? "Unknown")
                .paragraph()
                .foregroundColor(.primary)
            }

            Button("Sign Out", role: .destructive) {
              Task {
                await appState.signOut()
              }
            }
            .buttonStyle(DestructiveButtonStyle())
          }

          Section("Connection") {
            Button("Change Region") {
              showRegion = true
            }
            .buttonStyle(SecondaryButtonStyle())

            Button("Switch Device") {
              showDevices = true
            }
            .buttonStyle(SecondaryButtonStyle())
          }

          Section("Subscription") {
            NavigationLink {
              SubscriptionSettingsView()
                .environmentObject(container)
            } label: {
              VStack(alignment: .leading, spacing: 4) {
                Text("Subscription")
                if let status = container.subscriptionManager.status.isActive ? "Active" : nil {
                  Text(status)
                    .font(.caption)
                    .foregroundColor(.green)
                } else {
                  Text("Not Subscribed")
                    .font(.caption)
                    .foregroundColor(Color.mutedForeground)
                }
              }
            }
          }

          Section("Notifications") {
            NavigationLink("Notifications") {
              NotificationsSettingsView(dataService: container.settingsService)
            }
          }

          Section("AI Settings") {
            NavigationLink("Configure AI Models") {
              AISettingsView(dataService: container.settingsService)
                .environmentObject(appState)
                .environmentObject(container)
            }

            NavigationLink("Copy Buttons") {
              CopyButtonListEditorView(
                projectDirectory: container.sessionService.currentSession?.projectDirectory ?? "",
                dataService: container.settingsService
              )
              .navigationTitle("Copy Buttons")
              .navigationBarTitleDisplayMode(.inline)
            }
          }

          Section(header: Text("Terminal"), footer: Text("CLI tool will auto-launch when opening terminal")) {
            Picker("CLI Tool", selection: $selectedCliTool) {
              Text("Claude Code").tag("claude")
              Text("Cursor").tag("cursor")
              Text("Codex").tag("codex")
              Text("Gemini").tag("gemini")
              Text("Custom").tag("custom")
            }
            .onChange(of: selectedCliTool) { newValue in
              if hasLoadedInitialSettings {
                saveCliTool(newValue)
              }
            }

            if selectedCliTool == "custom" {
              HStack {
                Text("Command:")
                  .font(.caption)
                  .foregroundColor(Color.mutedForeground)
                DismissableTextField("custom-cli", text: $customCommand, autocapitalization: .none, autocorrection: .no, onSubmit: {
                    saveCustomCommand()
                    focusedField = nil
                })
                .padding(8)
                .background(Color.inputBackground)
                .cornerRadius(8)
                .focused($focusedField, equals: .customCommand)
              }
            }

            HStack {
              Text("Args:")
                .font(.caption)
                .foregroundColor(Color.mutedForeground)
              DismissableTextField("Additional arguments", text: $additionalArgs, autocapitalization: .none, autocorrection: .no, onSubmit: {
                  saveAdditionalArgs()
                  focusedField = nil
              })
              .padding(8)
              .background(Color.inputBackground)
              .cornerRadius(8)
              .focused($focusedField, equals: .additionalArgs)
            }
          }


          Section("Legal") {
            if let termsURL = URL(string: "https://plantocode.com/terms") {
              Link("Terms of Service", destination: termsURL)
                .tint(Color.primary)
            }
            if let privacyURL = URL(string: "https://plantocode.com/privacy") {
              Link("Privacy Policy", destination: privacyURL)
                .tint(Color.primary)
            }
          }

          Section(header: Text("Account Management")) {
            VStack(alignment: .leading, spacing: 12) {
              Text("Deleting your account will permanently remove your PlanToCode account data from our servers, including linked devices and workspaces. Some billing records may be retained where legally required. This action cannot be undone.")
                .small()
                .foregroundColor(Color.textSecondary)

              Button(role: .destructive) {
                if !NetworkPathObserver.shared.isOnline {
                  deleteErrorMessage = "You appear to be offline. Connect to the internet to delete your account."
                } else {
                  showDeleteAccountDialog = true
                }
              } label: {
                if accountDataService.isDeleting {
                  ProgressView()
                } else {
                  Text("Delete Account")
                }
              }
              .disabled(accountDataService.isDeleting)

              if let error = deleteErrorMessage ?? accountDataService.lastError?.localizedDescription {
                Text(error)
                  .small()
                  .foregroundColor(Color.destructive)
              }
            }
          }
        }
      }
      .navigationTitle("Settings")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .navigationBarTrailing) {
          Button("Done") {
            dismiss()
          }
          .buttonStyle(ToolbarButtonStyle())
        }
      }
      .sheet(isPresented: $showRegion) {
        ServerSelectionView(isModal: true)
      }
      .sheet(isPresented: $showDevices) {
        DeviceSelectionView()
      }
      .sheet(isPresented: $showFolderPicker) {
        FolderPickerView(onFolderSelected: addExternalFolder)
      }
      .confirmationDialog(
        "Delete Account",
        isPresented: $showDeleteAccountDialog,
        titleVisibility: .visible
      ) {
        Button("Delete Account", role: .destructive) {
          Task {
            await performAccountDeletionFlow()
          }
        }
        Button("Cancel", role: .cancel) { }
      } message: {
        Text("This will permanently delete your PlanToCode account, associated devices, workspaces, and most usage data. Some billing and invoice records may be retained as required by law. You will be signed out on all devices and this action cannot be undone.")
      }
      .onAppear {
        guard !hasLoadedInitialSettings else { return }
        loadCliToolSettings()
        loadExternalFoldersIfNeeded()
      }
      .onChange(of: currentProjectDirectory) { _ in
        loadExternalFoldersIfNeeded()
      }
    }
  }

  private func loadCliToolSettings() {
    isLoadingCliSettings = true
    Task {
      do {
        try await container.settingsService.loadCliToolSettings()
        await MainActor.run {
          selectedCliTool = container.settingsService.preferredCliTool ?? "claude"
          customCommand = container.settingsService.customCliCommand ?? ""
          additionalArgs = container.settingsService.cliAdditionalArgs ?? ""
          isLoadingCliSettings = false
          hasLoadedInitialSettings = true
        }
      } catch {
        await MainActor.run {
          isLoadingCliSettings = false
        }
      }
    }
  }

  private func saveCliTool(_ tool: String) {
    Task {
      try? await container.settingsService.saveCliToolPreference(tool)
    }
  }

  private func saveCustomCommand() {
    Task {
      try? await container.settingsService.saveCustomCliCommand(customCommand)
    }
  }

  private func saveAdditionalArgs() {
    Task {
      try? await container.settingsService.saveCliAdditionalArgs(additionalArgs)
    }
  }

  // MARK: - External Folders

  private func loadExternalFoldersIfNeeded() {
    guard let projectDir = currentProjectDirectory else { return }
    guard container.settingsService.externalFolders(for: projectDir).isEmpty else { return }

    Task {
      try? await container.settingsService.loadExternalFolders(projectDirectory: projectDir)
    }
  }

  private func addExternalFolder(_ path: String) {
    guard let projectDir = currentProjectDirectory else { return }

    // Validation: prevent main directory and duplicates
    guard path != projectDir else { return }
    guard !currentExternalFolders.contains(path) else { return }

    var updated = currentExternalFolders
    updated.append(path)

    Task {
      do {
        try await container.settingsService.saveExternalFolders(projectDirectory: projectDir, folders: updated)
        try await container.settingsService.loadExternalFolders(projectDirectory: projectDir)
      } catch {
        externalFoldersError = error.localizedDescription
      }
    }
  }

  private func removeExternalFolder(_ path: String) {
    guard let projectDir = currentProjectDirectory else { return }

    let updated = currentExternalFolders.filter { $0 != path }

    Task {
      do {
        try await container.settingsService.saveExternalFolders(projectDirectory: projectDir, folders: updated)
        try await container.settingsService.loadExternalFolders(projectDirectory: projectDir)
      } catch {
        externalFoldersError = error.localizedDescription
      }
    }
  }

  private func relativePath(for folder: String) -> String {
    guard let projectDir = currentProjectDirectory else { return folder }

    if folder.hasPrefix(projectDir) {
      let relative = folder.dropFirst(projectDir.count)
      if relative.hasPrefix("/") {
        return String(relative.dropFirst())
      }
      return String(relative)
    }

    return String(folder.split(separator: "/").last ?? folder.suffix(from: folder.firstIndex(of: "/") ?? folder.startIndex))
  }

  // MARK: - Account Deletion

  private func performAccountDeletionFlow() async {
    if !NetworkPathObserver.shared.isOnline {
      deleteErrorMessage = "You appear to be offline. Connect to the internet to delete your account."
      return
    }

    // Clear previous error
    deleteErrorMessage = nil

    do {
      try await accountDataService.deleteAccount()
      // AccountDataService handles calling appState.resetToLogin()
    } catch let error as DataServiceError {
      switch error {
      case .offline:
        deleteErrorMessage = "We couldn't reach the server. Please check your internet connection and try again."
      case .validation(let message):
        deleteErrorMessage = message
      default:
        deleteErrorMessage = "Account deletion failed. Please try again later."
      }
    } catch {
      deleteErrorMessage = "Account deletion failed. Please try again later."
    }
  }
}

// MARK: - Helper Views

private struct SettingRow: View {
  let label: String
  let value: String

  var body: some View {
    HStack {
      Text(label)
        .small()
        .foregroundColor(.secondary)

      Spacer()

      Text(value)
        .paragraph()
        .foregroundColor(.primary)
    }
  }
}

#Preview {
  SettingsView()
    .environmentObject(AppState.shared)
}
