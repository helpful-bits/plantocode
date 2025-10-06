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
    ZStack {
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
                .buttonStyle(SelectableCardButtonStyle(isSelected: selected?.id == region.id))
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
            .buttonStyle(.borderedProminent)
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
          }
        }
      }
  }
}

#Preview {
  ServerSelectionView()
}
