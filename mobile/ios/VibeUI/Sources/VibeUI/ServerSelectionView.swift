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

          VStack(alignment: .leading, spacing: 20) {
            Text("Choose Your Server Region")
              .h1()

            Text("Pick the closest region for best performance.")
              .paragraph()

            VStack(spacing: 12) {
              ForEach(appState.availableRegions, id: \.id) { region in
                Button {
                  selected = region
                } label: {
                  HStack(spacing: 12) {
                    VStack(alignment: .leading, spacing: 4) {
                      Text(region.name)
                        .h3()
                      Text(region.baseURL.absoluteString)
                        .small()
                    }
                    Spacer()
                    if selected?.id == region.id {
                      Image(systemName: "checkmark.circle.fill")
                        .foregroundColor(Color.primary)
                    }
                  }
                }
                .padding(16)
                .background(selected?.id == region.id ? Color.primary.opacity(0.1) : Color.card)
                .overlay(
                    RoundedRectangle(cornerRadius: 8)
                        .stroke(selected?.id == region.id ? Color.primary : Color.border, lineWidth: 1)
                )
                .cornerRadius(8)
              }
            }

            Button {
              if let s = selected {
                appState.setActiveRegion(s)
                appState.markRegionSelectionCompleted()
              }
            } label: {
              Text("Continue")
                .frame(maxWidth: .infinity)
            }
            .buttonStyle(PrimaryButtonStyle())
            .disabled(selected == nil)
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
