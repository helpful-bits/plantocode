import SwiftUI
import Core

public struct ServerSelectionView: View {
  @ObservedObject private var appState = AppState.shared
  @State private var selected: Region? = nil

  public init() {}

  public var body: some View {
    ZStack {
      // Match desktop gradient: from-background via-background/95 to-card
      LinearGradient(
        colors: [
          Color("Background"),
          Color("Background").opacity(0.95),
          Color("Card")
        ],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
      )
      .ignoresSafeArea()

      VStack {
        Spacer()

        VStack(alignment: .leading, spacing: 20) {
          Text("Choose Your Server Region")
            .font(.largeTitle)
            .fontWeight(.bold)
            .foregroundColor(Color("CardForeground"))

          Text("Pick the closest region for best performance.")
            .font(.body)
            .foregroundColor(Color("MutedForeground"))

          VStack(spacing: 12) {
            ForEach(appState.availableRegions, id: \.id) { region in
              Button {
                selected = region
              } label: {
                HStack {
                  VStack(alignment: .leading) {
                    Text(region.name)
                      .fontWeight(.semibold)
                      .foregroundColor(Color("Foreground"))
                    Text(region.baseURL.absoluteString)
                      .font(.caption)
                      .foregroundColor(Color("MutedForeground"))
                  }
                  Spacer()
                  Image(systemName: selected?.id == region.id ? "checkmark.circle.fill" : "circle")
                    .foregroundColor(selected?.id == region.id ? Color("Primary") : Color("MutedForeground"))
                }
                .padding(12)
                .background(RoundedRectangle(cornerRadius: 12).fill(Color("Card")))
                .overlay(
                  RoundedRectangle(cornerRadius: 12)
                    .stroke(selected?.id == region.id ? Color("Primary") : Color("Border").opacity(0.5),
                           lineWidth: selected?.id == region.id ? 2 : 1)
                )
              }
            }
          }

          Button {
            if let s = selected {
              appState.setActiveRegion(s)
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
          Color("Background")
            .opacity(0.95)
        )
        .overlay(
          RoundedRectangle(cornerRadius: 20)
            .stroke(Color("Border").opacity(0.6), lineWidth: 1)
        )
        .cornerRadius(20)
        .shadow(color: Color.black.opacity(0.05), radius: 3, x: 0, y: 1)
        .shadow(color: Color.black.opacity(0.03), radius: 2, x: 0, y: 1)
        .frame(maxWidth: 520)

        Spacer()
      }
      .padding(.horizontal, 16)
    }
  }
}

#Preview {
  ServerSelectionView()
}