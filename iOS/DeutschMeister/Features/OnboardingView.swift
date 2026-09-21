import SwiftUI

/// First launch: pick a starting level.
struct OnboardingView: View {
    @Environment(AppModel.self) private var model
    private let columns = Array(repeating: GridItem(.flexible(), spacing: 10), count: 3)

    var body: some View {
        VStack(spacing: 10) {
            Spacer()
            Text("🦉").font(.system(size: 56))
            Text("What's your German level?").font(.title2.weight(.heavy)).multilineTextAlignment(.center)
            Text("We'll pull new words from here. You can change this anytime in Settings.")
                .foregroundStyle(.secondary).multilineTextAlignment(.center).padding(.horizontal, 30)
            LazyVGrid(columns: columns, spacing: 10) {
                ForEach(CEFRLevel.allCases, id: \.self) { level in
                    Button(level.rawValue) {
                        model.update {
                            $0.settings.levelOverride = .level(level)
                            $0.settings.onboarded = true
                        }
                    }
                    .font(.title3.weight(.heavy))
                    .foregroundStyle(Palette.primaryStrong)
                    .frame(maxWidth: .infinity).padding(.vertical, 16)
                    .background(Palette.primarySoft, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                }
            }
            .padding(.horizontal, 30).padding(.top, 16)
            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(AppBackground())
    }
}
