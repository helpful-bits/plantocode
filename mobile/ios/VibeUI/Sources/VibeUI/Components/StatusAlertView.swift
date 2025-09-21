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
          .font(.subheadline)
          .fontWeight(.medium)
          .foregroundColor(textColor)

        Text(message)
          .font(.caption)
          .foregroundColor(Color("MutedForeground"))
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
    case .destructive: return Color("Destructive")
    case .warning: return Color("Warning")
    case .info: return Color("Info")
    }
  }

  private var textColor: Color {
    switch variant {
    case .destructive: return Color("DestructiveForeground")
    case .warning: return Color("WarningForeground")
    case .info: return Color("InfoForeground")
    }
  }

  private var backgroundColor: Color {
    switch variant {
    case .destructive:
      return Color("Destructive").opacity(0.1)
    case .warning:
      // Match desktop: warning-background
      return Color("Warning").opacity(0.1)
    case .info:
      // Match desktop: info-background
      return Color("Info").opacity(0.1)
    }
  }

  private var borderColor: Color {
    switch variant {
    case .destructive:
      return Color("Destructive").opacity(0.3)
    case .warning:
      return Color("Warning").opacity(0.3)
    case .info:
      return Color("Info").opacity(0.3)
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