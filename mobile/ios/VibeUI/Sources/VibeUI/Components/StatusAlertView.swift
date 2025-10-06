import SwiftUI

public enum StatusVariant {
  case destructive
  case warning
  case info
}

public struct StatusAlertView: View {
  let variant: StatusVariant
  let title: String
  let message: String

  public init(variant: StatusVariant, title: String, message: String) {
    self.variant = variant
    self.title = title
    self.message = message
  }

  public var body: some View {
    HStack(alignment: .top, spacing: 12) {
      Image(systemName: iconName)
        .foregroundColor(iconColor)
        .font(.system(size: 16))

      VStack(alignment: .leading, spacing: 4) {
        Text(title)
          .h4()
          .foregroundColor(textColor)

        Text(message)
          .small()
          .foregroundColor(Color.mutedForeground)
      }

      Spacer(minLength: 0)
    }
    .padding(12)
    .background(
      RoundedRectangle(cornerRadius: 8)
        .fill(backgroundColor)
    )
    .overlay(
      RoundedRectangle(cornerRadius: 8)
        .stroke(borderColor, lineWidth: 1)
    )
  }

  private var iconColor: Color {
    switch variant {
    case .destructive: return Color.destructive
    case .warning: return Color.warning
    case .info: return Color.info
    }
  }

  private var textColor: Color {
    switch variant {
    case .destructive: return Color.destructiveForeground
    case .warning: return Color.warningForeground
    case .info: return Color.infoForeground
    }
  }

  private var backgroundColor: Color {
    switch variant {
    case .destructive:
      return Color.destructive.opacity(0.1)
    case .warning:
      return Color.warningBackground
    case .info:
      return Color.infoBackground
    }
  }

  private var borderColor: Color {
    switch variant {
    case .destructive:
      return Color.destructive.opacity(0.3)
    case .warning:
      return Color.warningBorder
    case .info:
      return Color.infoBorder
    }
  }

  private var iconName: String {
    switch variant {
    case .destructive: return "exclamationmark.octagon.fill"
    case .warning: return "exclamationmark.triangle.fill"
    case .info: return "info.circle.fill"
    }
  }
}