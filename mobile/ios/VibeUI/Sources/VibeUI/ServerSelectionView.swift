import SwiftUI
import Core

public struct ServerSelectionView: View {
  @ObservedObject private var appState = AppState.shared
  @State private var selected: Region? = nil
  @Environment(\.presentationMode) var presentationMode
  @Environment(\.dismiss) private var dismiss
  let isModal: Bool

  public init(isModal: Bool = false) {
    self.isModal = isModal
  }

  public var body: some View {
    let gradient = LinearGradient(
      colors: [
        Color.background,
        Color.background.opacity(0.95),
        Color.card
      ],
      startPoint: .topLeading,
      endPoint: .bottomTrailing
    )

    ZStack {
        gradient
        .ignoresSafeArea()

        VStack {
          Spacer()

          VStack(alignment: .leading, spacing: Theme.Spacing.xl) {
            Text("Choose Your Server Region")
              .h1()

            Text("Pick the closest region for best performance.")
              .paragraph()
              .foregroundColor(Color.mutedForeground)

            VStack(spacing: Theme.Spacing.md) {
              ForEach(appState.availableRegions, id: \.id) { region in
                Button {
                  selected = region
                } label: {
                  HStack(spacing: Theme.Spacing.md) {
                    VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
                      Text(region.name)
                        .h3()
                        .foregroundColor(Color.foreground)
                      Text(region.baseURL.absoluteString)
                        .small()
                        .foregroundColor(Color.mutedForeground)
                    }
                    Spacer()
                    if selected?.id == region.id {
                      Image(systemName: "checkmark.circle.fill")
                        .foregroundColor(Color.primary)
                    }
                  }
                }
                .padding(Theme.Spacing.lg)
                .background(selected?.id == region.id ? Color.primary.opacity(0.1) : Color.card)
                .overlay(
                    RoundedRectangle(cornerRadius: Theme.Radii.lg)
                        .stroke(selected?.id == region.id ? Color.primary : Color.border, lineWidth: 1)
                )
                .cornerRadius(Theme.Radii.lg)
              }
            }

            Button {
              if let s = selected {
                appState.setActiveRegion(s)
                appState.markRegionSelectionCompleted()
                if isModal {
                  dismiss()
                }
              }
            } label: {
              Text("Continue")
                .frame(maxWidth: .infinity)
            }
            .buttonStyle(PrimaryButtonStyle())
            .disabled(selected == nil)
          }
          .padding(Theme.Spacing.xxl)
          .background(
            Color.background
              .opacity(0.95)
          )
          .overlay(
            RoundedRectangle(cornerRadius: Theme.Radii.lg * 2.5)
              .stroke(Color.border.opacity(0.6), lineWidth: 1)
          )
          .cornerRadius(Theme.Radii.lg * 2.5)
          .shadow(color: Color.border.opacity(0.1), radius: 3, x: 0, y: 1)
          .shadow(color: Color.border.opacity(0.05), radius: 2, x: 0, y: 1)
          .frame(maxWidth: 520)

          Spacer()
        }
        .padding(.horizontal, Theme.Spacing.lg)
      }
      .navigationTitle("Server Region")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        if isModal {
          ToolbarItem(placement: .navigationBarTrailing) {
            Button("Done") {
              dismiss()
            }
            .buttonStyle(ToolbarButtonStyle())
          }
        }
      }
  }
}

#Preview {
  ServerSelectionView()
}
