import SwiftUI

struct BadgesView: View {
    @Environment(AppModel.self) private var model

    private let columns = Array(repeating: GridItem(.flexible(), spacing: 12), count: 3)

    var body: some View {
        NavigationStack {
            let unlocked = Set(model.state.achievements.map(\.id))
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    Text("\(unlocked.count) of \(Achievements.catalog.count) unlocked").font(.subheadline).foregroundStyle(.secondary)
                    LazyVGrid(columns: columns, spacing: 12) {
                        ForEach(Achievements.catalog) { badge in
                            let isUnlocked = unlocked.contains(badge.id)
                            VStack(spacing: 6) {
                                Text(badge.emoji).font(.system(size: 34))
                                Text(badge.title).font(.caption.weight(.bold)).multilineTextAlignment(.center)
                                Text(badge.detail).font(.system(size: 10)).foregroundStyle(.secondary).multilineTextAlignment(.center)
                            }
                            .frame(maxWidth: .infinity, minHeight: 116)
                            .padding(.horizontal, 6).padding(.vertical, 12)
                            .cardSurface(radius: 12, shadow: isUnlocked)
                            .opacity(isUnlocked ? 1 : 0.5)
                            .saturation(isUnlocked ? 1 : 0.2)
                            .accessibilityElement(children: .combine)
                            .accessibilityValue(isUnlocked ? "Unlocked" : "Locked")
                        }
                    }
                }
                .padding(.horizontal, 20).padding(.bottom, 24)
            }
            .background(AppBackground())
            .navigationTitle("🏆 Achievements")
            .toolbarTitleDisplayMode(.inline)
            .onAppear { model.evaluateAchievements(announce: false) }
        }
    }
}
