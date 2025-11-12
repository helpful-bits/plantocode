import SwiftUI
import AVKit

public struct OnboardingStepView: View {
    let title: String
    let bullets: [String]
    let videoURL: URL

    public init(title: String, bullets: [String], videoURL: URL) {
        self.title = title
        self.bullets = bullets
        self.videoURL = videoURL
    }

    public var body: some View {
        VStack(spacing: 16) {
            // Video Player
            VideoPlayer(player: AVPlayer(url: videoURL))
                .frame(height: 240)
                .cornerRadius(12)
                .padding(.top, 8)

            // Title
            Text(title)
                .font(.system(size: 24, weight: .bold))
                .foregroundColor(.primary)
                .multilineTextAlignment(.center)
                .padding(.top, 8)

            // Bullet Points
            VStack(alignment: .leading, spacing: 12) {
                ForEach(bullets, id: \.self) { bullet in
                    HStack(alignment: .top, spacing: 12) {
                        Circle()
                            .fill(Color.primary)
                            .frame(width: 6, height: 6)
                            .padding(.top, 8)

                        Text(bullet)
                            .font(.system(size: 16))
                            .foregroundColor(.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 8)

            Spacer()
        }
        .padding(.horizontal, Theme.Spacing.lg)
    }
}
