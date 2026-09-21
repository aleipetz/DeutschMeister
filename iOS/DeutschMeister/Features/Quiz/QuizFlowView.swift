import SwiftUI

/// One quiz question at a time. Shared by the post-Learn quiz and the Quiz tab.
struct QuizFlowView: View {
    @Environment(AppModel.self) private var model
    let runner: QuizRunner
    var headerTitle: String?
    var onClose: (() -> Void)?
    let onFinished: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            SessionHeader(
                progress: "\(min(runner.index + 1, runner.questions.count)) / \(runner.questions.count)",
                combo: runner.combo.current, onClose: onClose
            )
            .padding(.horizontal, 20).padding(.top, 8)

            if let question = runner.current {
                ScrollView {
                    QuestionCard(question: question, runner: runner)
                        .padding(.horizontal, 20).padding(.vertical, 12)
                        .id(question.id)
                }
                if let answer = runner.answer {
                    Button(runner.index == runner.questions.count - 1 ? "Finish" : "Next →") {
                        if runner.advance() { onFinished() }
                    }
                    .buttonStyle(.pill(.primary, large: true))
                    .padding(.horizontal, 20).padding(.vertical, 12)
                    .accessibilityHint(answer.wasCorrect ? "Correct" : "Incorrect")
                }
            }
        }
        .task(id: runner.current?.id) {
            guard let question = runner.current, question.kind == .listening, let text = question.audioText else { return }
            try? await Task.sleep(for: .milliseconds(300))
            if !Task.isCancelled { model.speak(text) }
        }
    }
}

private struct QuestionCard: View {
    @Environment(AppModel.self) private var model
    let question: QuizQuestion
    let runner: QuizRunner

    private let columns = [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)]

    var body: some View {
        let entry = question.entry
        let palette = model.palette(for: entry)
        VStack(spacing: 6) {
            ThemeChip(theme: model.theme(for: entry), palette: palette).padding(.bottom, 6)
            Text(question.promptLabel).font(.footnote).foregroundStyle(.secondary).multilineTextAlignment(.center)

            if question.kind == .listening, let audio = question.audioText {
                SpeakButton(text: audio).padding(.vertical, 10)
            } else if let prompt = question.prompt {
                Text(prompt)
                    .font(question.kind == .cloze ? .title3.weight(.bold) : .system(size: 30, weight: .heavy))
                    .multilineTextAlignment(.center).minimumScaleFactor(0.7)
                    .padding(.vertical, 4)
            }

            LazyVGrid(columns: columns, spacing: 10) {
                ForEach(Array(question.options.enumerated()), id: \.offset) { i, option in
                    Button { runner.choose(i) } label: {
                        Text(option)
                            .font(.subheadline.weight(.bold))
                            .multilineTextAlignment(.center)
                            .frame(maxWidth: .infinity, minHeight: 52)
                            .padding(.horizontal, 6)
                    }
                    .buttonStyle(OptionButtonStyle(state: state(for: i)))
                    .disabled(runner.answer != nil)
                }
            }
            .padding(.top, 14)

            if let answer = runner.answer { feedback(answer) }
        }
        .padding(.horizontal, 20).padding(.vertical, 24)
        .frame(maxWidth: .infinity)
        .overlay(alignment: .top) { Rectangle().fill(palette.main).frame(height: 6) }
        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
        .background(Palette.surface, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        .shadow(color: .black.opacity(0.10), radius: 16, y: 8)
    }

    private func state(for i: Int) -> OptionButtonStyle.State {
        guard let answer = runner.answer else { return .idle }
        if question.options[i] == question.correctAnswer { return .correct }
        return i == answer.selectedIndex ? .wrong : .dimmed
    }

    @ViewBuilder private func feedback(_ answer: QuizRunner.Answer) -> some View {
        Text(answer.wasCorrect ? "✅ Correct!" : "❌ Not quite — correct answer: \(question.correctAnswer)")
            .font(.headline)
            .foregroundStyle(answer.wasCorrect ? Palette.greenText : Palette.red)
            .multilineTextAlignment(.center).padding(.top, 14)
        VStack(alignment: .leading, spacing: 2) {
            Text(question.entry.exampleDE).font(.subheadline.weight(.semibold))
            Text(question.entry.exampleEN).font(.footnote).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading).padding(12).softPanel().padding(.top, 6)
    }
}

private struct OptionButtonStyle: ButtonStyle {
    enum State { case idle, correct, wrong, dimmed }
    let state: State

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .foregroundStyle(foreground)
            .background(fill, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay { RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(stroke, lineWidth: 2) }
            .opacity(state == .dimmed ? 0.55 : 1)
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
            .animation(.easeOut(duration: 0.1), value: configuration.isPressed)
    }

    private var fill: Color {
        switch state {
        case .correct: Palette.greenSoft
        case .wrong: Palette.redSoft
        default: Palette.surfaceAlt
        }
    }

    private var stroke: Color {
        switch state {
        case .correct: Palette.green
        case .wrong: Palette.red
        default: Palette.border
        }
    }

    private var foreground: Color {
        switch state {
        case .correct: Palette.greenText
        case .wrong: Palette.red
        default: .primary
        }
    }
}
