import SwiftUI
import Core

private func dynamicColor(_ pair: Theme.DynamicColorPair) -> Color {
    Color(UIColor { traitCollection in
        traitCollection.userInterfaceStyle == .dark ? UIColor(pair.dark) : UIColor(pair.light)
    })
}

public enum StatusVariant {
  case success
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
          .fixedSize(horizontal: false, vertical: true)

        Text(message)
          .font(.caption)
          .foregroundColor(.textMuted)
          .fixedSize(horizontal: false, vertical: true)
          .lineLimit(nil)
      }

      Spacer(minLength: 0)
    }
    .padding(12)
    .background(backgroundColor)
    .cornerRadius(Theme.Radii.md)
    .overlay(
      RoundedRectangle(cornerRadius: Theme.Radii.md)
        .stroke(borderColor, lineWidth: 1)
    )
  }

  private var iconColor: Color {
    switch variant {
    case .success: return dynamicColor(Theme.Semantic.Status.successForeground)
    case .destructive: return dynamicColor(Theme.Semantic.Status.destructiveForeground)
    case .warning: return dynamicColor(Theme.Semantic.Status.warningForeground)
    case .info: return dynamicColor(Theme.Semantic.Status.infoForeground)
    }
  }

  private var textColor: Color {
    switch variant {
    case .success: return dynamicColor(Theme.Semantic.Status.successForeground)
    case .destructive: return dynamicColor(Theme.Semantic.Status.destructiveForeground)
    case .warning: return dynamicColor(Theme.Semantic.Status.warningForeground)
    case .info: return dynamicColor(Theme.Semantic.Status.infoForeground)
    }
  }

  private var backgroundColor: Color {
    switch variant {
    case .success:
      return dynamicColor(Theme.Semantic.Status.successBackground)
    case .destructive:
      return dynamicColor(Theme.Semantic.Status.destructiveBackground)
    case .warning:
      return dynamicColor(Theme.Semantic.Status.warningBackground)
    case .info:
      return dynamicColor(Theme.Semantic.Status.infoBackground)
    }
  }

  private var borderColor: Color {
    switch variant {
    case .success:
      return dynamicColor(Theme.Semantic.Status.successBorder)
    case .destructive:
      return dynamicColor(Theme.Semantic.Status.destructiveBorder)
    case .warning:
      return dynamicColor(Theme.Semantic.Status.warningBorder)
    case .info:
      return dynamicColor(Theme.Semantic.Status.infoBorder)
    }
  }

  private var iconName: String {
    switch variant {
    case .success: return "checkmark.circle.fill"
    case .destructive: return "exclamationmark.octagon.fill"
    case .warning: return "exclamationmark.triangle.fill"
    case .info: return "info.circle.fill"
    }
  }
}
