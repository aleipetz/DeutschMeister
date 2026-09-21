import SwiftUI

struct HomeView: View {
    @Environment(AppModel.self) private var model

    private var greeting: String {
        switch Calendar.current.component(.hour, from: model.now) {
        case 5..<11: "Guten Morgen!"
        case 11..<18: "Guten Tag!"
        default: "Guten Abend!"
        }
    }

    private var subtitle: String {
        let n = model.newWordCount
        return n > 0
            ? "\(n) new word\(n == 1 ? "" : "s") ready in \(model.currentLevel.rawValue)"
            : "You're caught up on new words for \(model.currentLevel.rawValue). Nice work!"
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    hero
                    statRow
                    VStack(spacing: 12) {
                        Button { model.presentedSession = .review } label: {
                            HStack {
                                Text("🎯 Review")
                                Text("\(model.dueCount)")
                                    .font(.subheadline.weight(.bold)).monospacedDigit()
                                    .padding(.horizontal, 8).padding(.vertical, 2)
                                    .background(.white.opacity(0.25), in: Capsule())
                            }
                        }
                        .buttonStyle(.pill(.primary, large: true))
                        .disabled(model.dueCount == 0)

                        Button("✨ Learn new words") { model.presentedSession = .learn }
                            .buttonStyle(.pill(.secondary, large: true))
                            .disabled(model.newWordCount == 0)
                    }
                    if model.dueCount == 0 && model.startedCount > 0 {
                        Text("Nothing is due for review right now.").font(.footnote).foregroundStyle(.secondary)
                    }
                }
                .padding(.horizontal, 20).padding(.bottom, 24)
            }
            .background(AppBackground())
            .toolbar {
                ToolbarItemGroup(placement: .topBarTrailing) {
                    Chip(text: "\(model.state.profile.currentStreakDays)", systemImage: "flame.fill")
                        .accessibilityLabel("\(model.state.profile.currentStreakDays) day streak")
                    Button { model.showSettings = true } label: { Image(systemName: "gearshape.fill") }
                        .accessibilityLabel("Settings")
                }
            }
            .navigationTitle("🦉 Deutsch Meister")
            .toolbarTitleDisplayMode(.inline)
        }
    }

    private var hero: some View {
        let profile = model.state.profile
        return HStack(spacing: 20) {
            ProgressRing(
                progress: Double(profile.todayXP) / Double(max(1, profile.dailyGoalXP)),
                value: "\(profile.todayXP)", caption: "XP today")
            VStack(alignment: .leading, spacing: 4) {
                Text(greeting).font(.title2.weight(.heavy))
                Text(subtitle).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                Text("Goal: \(profile.dailyGoalXP) XP").font(.footnote.weight(.semibold)).foregroundStyle(Palette.primaryStrong)
            }
            Spacer(minLength: 0)
        }
        .padding(20)
        .cardSurface()
    }

    private var statRow: some View {
        HStack(spacing: 10) {
            StatCard(value: "\(model.dueCount)", label: "Due for review")
            StatCard(value: "\(model.masteredTotal)", label: "Words mastered")
            StatCard(value: model.currentLevel.rawValue, label: "Current level")
        }
    }
}

private struct StatCard: View {
    let value: String
    let label: String

    var body: some View {
        VStack(spacing: 2) {
            Text(value).font(.title2.weight(.heavy)).foregroundStyle(Palette.primaryStrong).monospacedDigit()
            Text(label).font(.caption).foregroundStyle(.secondary).multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 14).padding(.horizontal, 6)
        .cardSurface(radius: 12)
        .accessibilityElement(children: .combine)
    }
}
