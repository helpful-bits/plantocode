import SwiftUI
import Core

public struct GlobalTopBar: View {
    let title: String
    let breadcrumb: [String]
    let trailingActions: AnyView?

    @State private var showingSettings = false
    @State private var showingDeviceSelection = false
    @State private var showingRegion = false

    public init(
        title: String,
        breadcrumb: [String] = [],
        trailingActions: AnyView? = nil
    ) {
        self.title = title
        self.breadcrumb = breadcrumb
        self.trailingActions = trailingActions
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    if !breadcrumb.isEmpty {
                        Text(breadcrumb.joined(separator: " › "))
                            .small()
                            .foregroundColor(Color.mutedForeground)
                    }

                    Text(title)
                        .h2()
                        .foregroundColor(Color.foreground)
                }

                Spacer()

                HStack(spacing: 8) {
                    if let actions = trailingActions {
                        actions
                    }

                    Button(action: { showingRegion = true }) {
                        Image(systemName: "globe")
                            .h4()
                    }
                    .buttonStyle(ToolbarButtonStyle())

                    Button(action: { showingDeviceSelection = true }) {
                        Image(systemName: "arrow.triangle.2.circlepath")
                            .h4()
                    }
                    .buttonStyle(ToolbarButtonStyle())

                    Button(action: { showingSettings = true }) {
                        Image(systemName: "gearshape")
                            .h4()
                    }
                    .buttonStyle(ToolbarButtonStyle())
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .background(Color.card)
            .overlay(
                Rectangle()
                    .fill(Color.border)
                    .frame(height: 1),
                alignment: .bottom
            )
        }
        .sheet(isPresented: $showingSettings) {
            NavigationStack {
                SettingsView()
                    .navigationTitle("Settings")
                    .toolbar {
                        ToolbarItem(placement: .navigationBarTrailing) {
                            Button("Done") {
                                showingSettings = false
                            }
                            .buttonStyle(ToolbarButtonStyle())
                        }
                    }
            }
        }
        .sheet(isPresented: $showingDeviceSelection) {
            NavigationStack {
                DeviceSelectionView()
                    .navigationTitle("Switch Device")
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar {
                        ToolbarItem(placement: .navigationBarTrailing) {
                            Button("Done") {
                                showingDeviceSelection = false
                            }
                            .buttonStyle(ToolbarButtonStyle())
                        }
                    }
            }
        }
        .sheet(isPresented: $showingRegion) {
            NavigationStack {
                ServerSelectionView()
                    .navigationTitle("Select Region")
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar {
                        ToolbarItem(placement: .navigationBarTrailing) {
                            Button("Done") {
                                showingRegion = false
                            }
                            .buttonStyle(ToolbarButtonStyle())
                        }
                    }
            }
        }
    }
}

#Preview {
    GlobalTopBar(
        title: "Implementation Plans",
        breadcrumb: ["Workspace", "Plans"]
    )
}
