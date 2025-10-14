import SwiftUI
import Core

public struct FolderPickerView: View {
    @Environment(\.dismiss) private var dismiss

    let onFolderSelected: (String) -> Void

    @State private var currentPath: String = ""
    @State private var parentPath: String? = nil
    @State private var folders: [FolderItem] = []
    @State private var isLoading = false
    @State private var errorMessage: String?

    public init(onFolderSelected: @escaping (String) -> Void) {
        self.onFolderSelected = onFolderSelected
    }

    public var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                // Current Path Display
                VStack(spacing: 8) {
                    HStack(spacing: 8) {
                        Image(systemName: "folder.fill")
                            .foregroundColor(Color.primary)
                            .frame(width: 20)

                        ScrollView(.horizontal, showsIndicators: false) {
                            Text(currentPath.isEmpty ? "Loading..." : currentPath)
                                .font(.system(size: 13, design: .monospaced))
                                .foregroundColor(Color.cardForeground)
                                .lineLimit(1)
                                .fixedSize(horizontal: true, vertical: false)
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 12)
                    .background(Color.card)

                    Divider()
                }

                // Folder List
                if isLoading {
                    VStack {
                        Spacer()
                        ProgressView()
                            .progressViewStyle(CircularProgressViewStyle(tint: Color.primary))
                        Text("Loading folders...")
                            .paragraph()
                            .foregroundColor(Color.mutedForeground)
                            .padding(.top, 8)
                        Spacer()
                    }
                } else if let errorMessage = errorMessage {
                    VStack {
                        Spacer()
                        StatusAlertView(variant: .destructive, title: "Error", message: errorMessage)
                        Button("Try Again") {
                            if !currentPath.isEmpty {
                                loadFolders(at: currentPath)
                            } else {
                                loadHomeDirectory()
                            }
                        }
                        .buttonStyle(SecondaryButtonStyle())
                        .padding(.top)
                        Spacer()
                    }
                    .padding()
                } else {
                    ScrollView {
                        LazyVStack(spacing: 0) {
                            // Parent directory navigation
                            if let parentPath = parentPath {
                                Button(action: { loadFolders(at: parentPath) }) {
                                    HStack {
                                        Image(systemName: "arrow.up")
                                            .foregroundColor(Color.primary)

                                        Text("..")
                                            .paragraph()
                                            .foregroundColor(Color.cardForeground)

                                        Spacer()

                                        Image(systemName: "chevron.right")
                                            .small()
                                            .foregroundColor(Color.mutedForeground)
                                    }
                                    .padding(.horizontal, 16)
                                    .padding(.vertical, 12)
                                    .background(Color.background)
                                }
                                .buttonStyle(PlainButtonStyle())

                                Divider()
                                    .padding(.leading, 16)
                            }

                            // Folder list
                            ForEach(folders) { folder in
                                Button(action: { loadFolders(at: folder.path) }) {
                                    HStack {
                                        Image(systemName: "folder.fill")
                                            .foregroundColor(Color.accent)

                                        Text(folder.name)
                                            .paragraph()
                                            .foregroundColor(Color.cardForeground)

                                        Spacer()

                                        Image(systemName: "chevron.right")
                                            .small()
                                            .foregroundColor(Color.mutedForeground)
                                    }
                                    .padding(.horizontal, 16)
                                    .padding(.vertical, 12)
                                    .background(Color.background)
                                }
                                .buttonStyle(PlainButtonStyle())

                                Divider()
                                    .padding(.leading, 16)
                            }

                            // Empty state
                            if folders.isEmpty && parentPath == nil {
                                VStack(spacing: 16) {
                                    Spacer()

                                    Image(systemName: "folder.badge.questionmark")
                                        .font(.system(size: 48))
                                        .foregroundColor(Color.mutedForeground)

                                    Text("No Folders")
                                        .h3()
                                        .foregroundColor(Color.cardForeground)

                                    Text("This directory contains no subfolders")
                                        .paragraph()
                                        .foregroundColor(Color.mutedForeground)
                                        .multilineTextAlignment(.center)

                                    Spacer()
                                }
                                .padding()
                            }
                        }
                    }
                }

                Divider()

                // Action buttons
                HStack(spacing: 12) {
                    Button(action: { dismiss() }) {
                        Text("Cancel")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(SecondaryButtonStyle())

                    Button(action: selectCurrentFolder) {
                        HStack {
                            Image(systemName: "checkmark.circle.fill")
                            Text("Select This Folder")
                        }
                        .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(PrimaryButtonStyle())
                    .disabled(currentPath.isEmpty)
                }
                .padding(16)
                .background(Color.background)
            }
            .background(Color.background)
            .navigationTitle("Select Project Folder")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") {
                        dismiss()
                    }
                    .buttonStyle(ToolbarButtonStyle())
                }
            }
        }
        .onAppear {
            loadHomeDirectory()
        }
    }

    private func loadHomeDirectory() {
        isLoading = true
        errorMessage = nil

        Task {
            do {
                for try await response in CommandRouter.appGetUserHomeDirectory() {
                    if let result = response.result?.value as? [String: Any],
                       let homeDir = result["homeDirectory"] as? String {
                        await MainActor.run {
                            loadFolders(at: homeDir)
                        }
                        return
                    }

                    if let error = response.error {
                        await MainActor.run {
                            errorMessage = error.message
                            isLoading = false
                        }
                        return
                    }
                }
            } catch {
                await MainActor.run {
                    errorMessage = "Failed to get home directory: \(error.localizedDescription)"
                    isLoading = false
                }
            }
        }
    }

    private func loadFolders(at path: String) {
        isLoading = true
        errorMessage = nil

        Task {
            do {
                for try await response in CommandRouter.appListFolders(path) {
                    if let result = response.result?.value as? [String: Any] {
                        let currentPath = result["currentPath"] as? String ?? path
                        let parentPath = result["parentPath"] as? String
                        let foldersData = result["folders"] as? [[String: Any]] ?? []

                        let folders = foldersData.compactMap { dict -> FolderItem? in
                            guard let name = dict["name"] as? String,
                                  let path = dict["path"] as? String else {
                                return nil
                            }
                            return FolderItem(name: name, path: path)
                        }

                        await MainActor.run {
                            self.currentPath = currentPath
                            self.parentPath = parentPath
                            self.folders = folders
                            self.isLoading = false
                        }
                        return
                    }

                    if let error = response.error {
                        await MainActor.run {
                            errorMessage = error.message
                            isLoading = false
                        }
                        return
                    }
                }
            } catch {
                await MainActor.run {
                    errorMessage = "Failed to load folders: \(error.localizedDescription)"
                    isLoading = false
                }
            }
        }
    }

    private func selectCurrentFolder() {
        guard !currentPath.isEmpty else { return }
        onFolderSelected(currentPath)
        dismiss()
    }
}

// MARK: - Supporting Types

struct FolderItem: Identifiable {
    let id = UUID()
    let name: String
    let path: String
}

#Preview {
    FolderPickerView(onFolderSelected: { path in
        print("Selected: \(path)")
    })
}
