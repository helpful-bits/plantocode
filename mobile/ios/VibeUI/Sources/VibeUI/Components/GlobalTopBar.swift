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
                            .font(.system(size: 20))
                            .foregroundColor(Color.foreground)
                            .frame(width: 44, height: 44)
                    }

                    Button(action: { showingDeviceSelection = true }) {
                        Image(systemName: "arrow.triangle.2.circlepath")
                            .font(.system(size: 20))
                            .foregroundColor(Color.foreground)
                            .frame(width: 44, height: 44)
                    }

                    Button(action: { showingSettings = true }) {
                        Image(systemName: "gearshape")
                            .font(.system(size: 20))
                            .foregroundColor(Color.foreground)
                            .frame(width: 44, height: 44)
                    }
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
            NavigationView {
                Text("Settings")
                    .navigationTitle("Settings")
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar {
                        ToolbarItem(placement: .navigationBarTrailing) {
                            Button("Done") {
                                showingSettings = false
                            }
                        }
                    }
            }
        }
        .sheet(isPresented: $showingDeviceSelection) {
            NavigationView {
                DeviceSelectionView()
                    .navigationTitle("Switch Device")
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar {
                        ToolbarItem(placement: .navigationBarTrailing) {
                            Button("Done") {
                                showingDeviceSelection = false
                            }
                        }
                    }
            }
        }
        .sheet(isPresented: $showingRegion) {
            NavigationView {
                ServerSelectionView()
                    .navigationTitle("Select Region")
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar {
                        ToolbarItem(placement: .navigationBarTrailing) {
                            Button("Done") {
                                showingRegion = false
                            }
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
