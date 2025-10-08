import SwiftUI
import Core

public struct ModelSelectorView: View {
    public let providers: [ProviderWithModels]
    @Binding public var selectedModelId: String
    public var onSelect: (String) -> Void

    @State private var activeProviderIndex: Int = 0

    public init(providers: [ProviderWithModels], selectedModelId: Binding<String>, onSelect: @escaping (String) -> Void) {
        self.providers = providers
        self._selectedModelId = selectedModelId
        self.onSelect = onSelect
    }

    public var body: some View {
        HStack(spacing: 0) {
            if !providers.isEmpty {
                providerListView

                Divider()
                    .background(Color.appBorder)

                modelListView
            } else {
                VStack(spacing: 12) {
                    Image(systemName: "cpu.slash")
                        .font(.system(size: 48))
                        .foregroundColor(Color.appMutedForeground)

                    Text("No providers available")
                        .font(.subheadline)
                        .foregroundColor(Color.appMutedForeground)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(Color.appBackground)
            }
        }
        .background(Color.appBackground)
        .cornerRadius(AppColors.radius)
    }

    // MARK: - Subviews

    private var providerListView: some View {
        VStack(spacing: 0) {
            ForEach(0..<providers.count, id: \.self) { idx in
                ProviderButton(
                    provider: providers[idx].provider,
                    isActive: activeProviderIndex == idx,
                    action: { activeProviderIndex = idx }
                )
            }
            Spacer()
        }
        .frame(maxWidth: 160)
        .padding(8)
        .background(Color.appMuted)
        .cornerRadius(AppColors.radius)
    }

    private var modelListView: some View {
        ScrollView {
            VStack(spacing: 12) {
                ForEach(providers[activeProviderIndex].models, id: \.id) { model in
                    ModelButton(
                        model: model,
                        isSelected: model.id == selectedModelId,
                        action: {
                            selectedModelId = model.id
                            onSelect(model.id)
                        }
                    )
                }
            }
            .padding(12)
        }
        .frame(maxWidth: .infinity)
        .background(Color.appBackground)
    }

    private func formatContextWindow(_ window: Int) -> String {
        if window >= 1_000_000 {
            return String(format: "%.1fM", Double(window) / 1_000_000.0)
        } else if window >= 1000 {
            return String(format: "%.0fK", Double(window) / 1000.0)
        }
        return "\(window)"
    }
}

// MARK: - Provider Button

private struct ProviderButton: View {
    let provider: ProviderInfo
    let isActive: Bool
    let action: () -> Void

    var body: some View {
        Group {
            if isActive {
                Button(action: action) {
                    HStack {
                        Text(provider.name)
                            .font(.subheadline)
                        Spacer()
                        Image(systemName: "checkmark")
                            .font(.system(size: 12, weight: .semibold))
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 10)
                }
                .buttonStyle(PrimaryButtonStyle())
                .controlSize(.small)
            } else {
                Button(action: action) {
                    HStack {
                        Text(provider.name)
                            .font(.subheadline)
                        Spacer()
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 10)
                }
                .buttonStyle(SecondaryButtonStyle())
                .controlSize(.small)
            }
        }
    }
}

// MARK: - Model Button

private struct ModelButton: View {
    let model: ModelInfo
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Group {
            if isSelected {
                Button(action: action) {
                    HStack(alignment: .top, spacing: 12) {
                        ModelInfoView(model: model)
                        Image(systemName: "checkmark.circle.fill")
                            .font(.system(size: 24))
                    }
                    .padding(16)
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                .buttonStyle(PrimaryButtonStyle())
            } else {
                Button(action: action) {
                    HStack(alignment: .top, spacing: 12) {
                        ModelInfoView(model: model)
                    }
                    .padding(16)
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                .buttonStyle(SecondaryButtonStyle())
            }
        }
    }
}

// MARK: - Model Info View

private struct ModelInfoView: View {
    let model: ModelInfo

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            // Model name
            Text(model.name)
                .font(.system(size: 16, weight: .semibold))
                .frame(maxWidth: .infinity, alignment: .leading)

            // Provider
            HStack(spacing: 4) {
                Image(systemName: "building.2")
                    .font(.system(size: 10))
                Text(model.providerName)
                    .font(.system(size: 13))
            }

            // Context window
            if let cw = model.contextWindow {
                HStack(spacing: 4) {
                    Image(systemName: "doc.text")
                        .font(.system(size: 10))
                    Text("Context: \(formatContextWindow(cw)) tokens")
                        .font(.system(size: 13))
                }
            }

            // Pricing
            PricingInfoView(model: model)
        }
    }

    private func formatContextWindow(_ window: Int) -> String {
        if window >= 1_000_000 {
            return String(format: "%.1fM", Double(window) / 1_000_000.0)
        } else if window >= 1000 {
            return String(format: "%.0fK", Double(window) / 1000.0)
        }
        return "\(window)"
    }
}

// MARK: - Pricing Info View

private struct PricingInfoView: View {
    let model: ModelInfo

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 4) {
                Image(systemName: "arrow.down.circle")
                    .font(.system(size: 10))
                Text("Input: $\(model.priceInputPerMillion)/M tokens")
                    .font(.system(size: 13))
            }

            HStack(spacing: 4) {
                Image(systemName: "arrow.up.circle")
                    .font(.system(size: 10))
                Text("Output: $\(model.priceOutputPerMillion)/M tokens")
                    .font(.system(size: 13))
            }

            if let cacheRead = model.priceCacheRead {
                HStack(spacing: 4) {
                    Image(systemName: "externaldrive")
                        .font(.system(size: 10))
                    Text("Cache read: $\(cacheRead)/M tokens")
                        .font(.system(size: 13))
                }
            }

            if let cacheWrite = model.priceCacheWrite {
                HStack(spacing: 4) {
                    Image(systemName: "externaldrive.fill")
                        .font(.system(size: 10))
                    Text("Cache write: $\(cacheWrite)/M tokens")
                        .font(.system(size: 13))
                }
            }
        }
    }
}
