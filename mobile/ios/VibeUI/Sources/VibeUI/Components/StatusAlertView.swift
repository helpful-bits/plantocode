import SwiftUI
import Core

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
        .font(.system(size: 16, weight: .semibold))
        .foregroundColor(iconColor)

      VStack(alignment: .leading, spacing: 4) {
        Text(title)
          .font(.subheadline)
          .fontWeight(.semibold)
          .foregroundColor(textColor)

        Text(message)
          .font(.caption)
          .foregroundColor(Color.appMutedForeground)
      }

      Spacer(minLength: 0)
    }
    .padding(12)
    .background(backgroundColor)
    .cornerRadius(AppColors.radius)
    .overlay(
      RoundedRectangle(cornerRadius: AppColors.radius)
        .stroke(borderColor, lineWidth: 1)
    )
  }

  private var iconColor: Color {
    switch variant {
    case .destructive: return Color.appDestructive
    case .warning: return Color.appWarning
    case .info: return Color.appInfo
    }
  }

  private var textColor: Color {
    switch variant {
    case .destructive: return Color.appDestructiveForeground
    case .warning: return Color.appWarningForeground
    case .info: return Color.appInfoForeground
    }
  }

  private var backgroundColor: Color {
    switch variant {
    case .destructive:
      return Color.appDestructive.opacity(0.1)
    case .warning:
      return Color.appWarningBackground
    case .info:
      return Color.appInfoBackground
    }
  }

  private var borderColor: Color {
    switch variant {
    case .destructive:
      return Color.appDestructive.opacity(0.3)
    case .warning:
      return Color.appWarningBorder
    case .info:
      return Color.appInfoBorder
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
