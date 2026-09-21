import SwiftUI

struct LearnFlowView: View {
    @Environment(AppModel.self) private var model
    @State private var session: LearnSession?
    let onClose: () -> Void

    var body: some View {
        Group {
            if let session {
                content(session)
            } else {
                Color.clear
            }
        }
        .background(AppBackground())
        .onAppear { if session == nil { session = LearnSession(model: model) } }
        .celebrationOverlay()
    }

    @ViewBuilder private func content(_ session: LearnSession) -> some View {
        switch session.phase {
        case .cards:
            if let entry = session.current {
                VStack(spacing: 0) {
                    SessionHeader(progress: "\(session.index + 1) / \(session.queue.count)", onClose: onClose)
                        .padding(.horizontal, 20).padding(.top, 8)
                    ScrollView {
                        WordCard(entry: entry, showAnswer: true)
                            .padding(.horizontal, 20).padding(.vertical, 12)
                            .id(entry.id)
                    }
                    Button("Got it → Next") { session.confirmCurrent() }
                        .buttonStyle(.pill(.primary, large: true))
                        .padding(.horizontal, 20).padding(.vertical, 12)
                }
                .task(id: entry.id) {
                    try? await Task.sleep(for: .milliseconds(300))
                    if !Task.isCancelled { model.speak(entry.lemmaDE) }
                }
            }

        case .quiz:
            if let quiz = session.quiz {
                QuizFlowView(runner: quiz, headerTitle: "Quick quiz", onClose: onClose) { session.quizFinished() }
            }

        case .done:
            VStack {
                Spacer()
                SessionSummary(
                    emoji: "🎉", title: "Session complete!",
                    subtitle: summary(session)
                ) {
                    Button("Back to Home", action: onClose).buttonStyle(.pill(.primary, large: true))
                }
                .padding(.horizontal, 20)
                Spacer()
            }
        }
    }

    private func summary(_ session: LearnSession) -> String {
        var text = "\(session.learned) new word\(session.learned == 1 ? "" : "s") learned"
        if let stats = session.quizStats { text += " · quiz: \(stats.correct)/\(stats.total) correct (+\(stats.xp) XP)" }
        return text
    }
}
