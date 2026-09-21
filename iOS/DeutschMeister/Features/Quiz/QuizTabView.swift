import SwiftUI

/// The Quiz tab: test yourself on everything you've started.
struct QuizTabView: View {
    @Environment(AppModel.self) private var model
    @State private var runner: QuizRunner?
    @State private var summary: QuizStats?

    private var eligible: [VocabEntry] {
        model.state.progress.keys.compactMap { model.index.entriesByID[$0] }
    }

    var body: some View {
        NavigationStack {
            Group {
                if let summary {
                    summaryView(summary)
                } else if let runner {
                    QuizFlowView(runner: runner) {
                        let stats = runner.stats
                        let now = model.now, calendar = model.calendar
                        model.update { SessionRules.finishQuiz(stats: stats, countsAsReviews: true, state: &$0, now: now, calendar: calendar) }
                        model.evaluateAchievements(announce: true)
                        summary = stats
                    }
                } else {
                    hub
                }
            }
            .background(AppBackground())
            .navigationTitle("Quiz")
            .toolbarTitleDisplayMode(.inline)
            .toolbar {
                if runner != nil && summary == nil {
                    ToolbarItem(placement: .topBarLeading) { Button("Quit") { runner = nil } }
                }
            }
        }
    }

    private var hub: some View {
        let count = eligible.count
        let size = min(20, count)
        return ScrollView {
            if count == 0 {
                EmptyState(emoji: "🧠", message: "Learn some words first, then come back here to quiz yourself on everything you know.")
            } else {
                VStack(spacing: 8) {
                    Text("🧠 Review Everything").font(.headline)
                    Text("Multiple-choice questions drawn from every word you've started.")
                        .foregroundStyle(.secondary).multilineTextAlignment(.center)
                    Text("\(count)").font(.system(size: 44, weight: .heavy)).foregroundStyle(Palette.primaryStrong).monospacedDigit()
                    Text("word\(count == 1 ? "" : "s") started so far").font(.footnote).foregroundStyle(.secondary)
                    Button("Start Quiz (\(size) questions)") { start(size: size) }
                        .buttonStyle(.pill(.primary, large: true)).padding(.top, 12)
                }
                .padding(24).cardSurface(radius: 22).padding(20)
            }
        }
    }

    private func start(size: Int) {
        let questions = QuizGenerator.makeSession(targets: eligible, pool: model.index.entries, limit: size, rng: SystemRandomSource())
        runner = QuizRunner(questions: questions, model: model)
    }

    private func summaryView(_ stats: QuizStats) -> some View {
        VStack {
            Spacer()
            SessionSummary(emoji: "🧠", title: "Quiz complete!", subtitle: "\(stats.correct) / \(stats.total) correct · +\(stats.xp) XP") {
                Button("Take another quiz") { summary = nil; runner = nil; start(size: min(20, eligible.count)) }
                    .buttonStyle(.pill(.primary, large: true))
                Button("Done") { summary = nil; runner = nil }.buttonStyle(.pill(.secondary, large: true))
            }
            .padding(.horizontal, 20)
            Spacer()
        }
    }
}
