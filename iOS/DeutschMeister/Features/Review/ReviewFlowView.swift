import SwiftUI

struct ReviewFlowView: View {
    @Environment(AppModel.self) private var model
    @State private var session: ReviewSession?
    let onClose: () -> Void

    var body: some View {
        Group {
            if let session { content(session) } else { Color.clear }
        }
        .background(AppBackground())
        .onAppear { if session == nil { session = ReviewSession(model: model) } }
        .celebrationOverlay()
    }

    @ViewBuilder private func content(_ session: ReviewSession) -> some View {
        if let entry = session.current {
            VStack(spacing: 0) {
                SessionHeader(
                    progress: "\(session.index + 1) / \(session.queue.count)", combo: session.combo.current, onClose: onClose
                )
                .padding(.horizontal, 20).padding(.top, 8)

                ScrollView {
                    WordCard(entry: entry, showAnswer: session.isRevealed)
                        .padding(.horizontal, 20).padding(.vertical, 12)
                        .id("\(entry.id)-\(session.isRevealed)")
                }

                Group {
                    if session.isRevealed {
                        HStack(spacing: 12) {
                            Button("😕 Didn't know") { session.grade(wasCorrect: false) }.buttonStyle(.pill(.secondary))
                            Button("✅ Knew it") { session.grade(wasCorrect: true) }.buttonStyle(.pill(.primary))
                        }
                    } else {
                        Button("Show answer") { session.reveal() }.buttonStyle(.pill(.primary, large: true))
                    }
                }
                .padding(.horizontal, 20).padding(.vertical, 12)
            }
        } else {
            VStack {
                Spacer()
                SessionSummary(
                    emoji: "✅", title: session.queue.isEmpty ? "Nothing to review" : "Review complete!",
                    subtitle: session.queue.isEmpty
                        ? "Come back when words are due."
                        : "\(session.correct) / \(session.queue.count) correct · +\(session.xp) XP"
                ) {
                    Button("Back to Home", action: onClose).buttonStyle(.pill(.primary, large: true))
                }
                .padding(.horizontal, 20)
                Spacer()
            }
        }
    }
}
