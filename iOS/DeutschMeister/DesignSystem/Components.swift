import SwiftUI

// MARK: - Backgrounds and surfaces

/// The soft gradient behind every screen (plain system background in dark mode).
struct AppBackground: View {
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        Group {
            if scheme == .dark {
                Color(.systemBackground)
            } else {
                LinearGradient(
                    colors: [Color(hex: 0xF6F4FF), Color(hex: 0xEEF7FF), Color(hex: 0xFFF7F0)],
                    startPoint: .topLeading, endPoint: .bottomTrailing)
            }
        }
        .ignoresSafeArea()
    }
}

extension View {
    /// White (or dark-grey) rounded card with a soft shadow.
    func cardSurface(radius: CGFloat = 18, shadow: Bool = true) -> some View {
        background(Palette.surface, in: RoundedRectangle(cornerRadius: radius, style: .continuous))
            .shadow(color: .black.opacity(shadow ? 0.07 : 0), radius: 10, y: 4)
    }

    func softPanel(radius: CGFloat = 12) -> some View {
        background(Palette.surfaceAlt, in: RoundedRectangle(cornerRadius: radius, style: .continuous))
    }
}

// MARK: - Buttons

struct PillButtonStyle: ButtonStyle {
    enum Kind { case primary, secondary, danger, success }
    var kind: Kind = .primary
    var large = false

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(large ? .headline : .subheadline.weight(.bold))
            .frame(maxWidth: .infinity)
            .padding(.vertical, large ? 16 : 12)
            .padding(.horizontal, 18)
            .foregroundStyle(foreground)
            .background(background, in: Capsule())
            .overlay { if kind == .secondary { Capsule().strokeBorder(Palette.primarySoft, lineWidth: 2) } }
            .shadow(color: kind == .primary ? Palette.primary.opacity(0.35) : .clear, radius: 8, y: 4)
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
            .animation(.easeOut(duration: 0.1), value: configuration.isPressed)
            .opacity(isEnabledFallback ? 1 : 0.5)
    }

    @Environment(\.isEnabled) private var isEnabledFallback

    private var foreground: Color {
        switch kind {
        case .primary, .success: .white
        case .secondary: Palette.primaryStrong
        case .danger: Palette.red
        }
    }

    private var background: Color {
        switch kind {
        case .primary: Palette.primary
        case .secondary: Palette.surface
        case .danger: Palette.redSoft
        case .success: Palette.green
        }
    }
}

extension ButtonStyle where Self == PillButtonStyle {
    static var pill: PillButtonStyle { .init() }
    static func pill(_ kind: PillButtonStyle.Kind, large: Bool = false) -> PillButtonStyle { .init(kind: kind, large: large) }
}

// MARK: - Small components

struct Chip: View {
    let text: String
    var systemImage: String?
    var fill: Color = Palette.orangeSoft
    var foreground: Color = Palette.orangeText

    var body: some View {
        HStack(spacing: 5) {
            if let systemImage { Image(systemName: systemImage) }
            Text(text).monospacedDigit()
        }
        .font(.subheadline.weight(.bold))
        .foregroundStyle(foreground)
        .padding(.horizontal, 12).padding(.vertical, 6)
        .background(fill, in: Capsule())
    }
}

struct ComboBadge: View {
    let count: Int

    var body: some View {
        Chip(text: "🔥 \(count) combo")
            .transition(.scale.combined(with: .opacity))
            .accessibilityLabel("\(count) in a row")
    }
}

struct ThemeChip: View {
    let theme: Theme
    let palette: ThemePalette

    var body: some View {
        Text("\(theme.icon) \(theme.labelEN)")
            .font(.caption.weight(.bold))
            .foregroundStyle(palette.text)
            .padding(.horizontal, 12).padding(.vertical, 5)
            .background(palette.soft, in: Capsule())
    }
}

struct GenderBadge: View {
    let gender: Gender

    var body: some View {
        Text(gender.rawValue)
            .font(.subheadline.weight(.heavy))
            .foregroundStyle(gender.tint.text)
            .padding(.horizontal, 10).padding(.vertical, 3)
            .background(gender.tint.fill, in: Capsule())
    }
}

struct PartOfSpeechBadge: View {
    let pos: PartOfSpeech

    var body: some View {
        Text(pos.label)
            .font(.caption.weight(.bold))
            .foregroundStyle(.secondary)
            .padding(.horizontal, 10).padding(.vertical, 3)
            .background(Palette.surfaceAlt, in: Capsule())
    }
}

struct ProgressRing: View {
    let progress: Double
    let value: String
    let caption: String

    var body: some View {
        ZStack {
            Circle().stroke(Palette.border, lineWidth: 10)
            Circle()
                .trim(from: 0, to: min(max(progress, 0), 1))
                .stroke(Palette.primary, style: StrokeStyle(lineWidth: 10, lineCap: .round))
                .rotationEffect(.degrees(-90))
                .animation(.easeOut(duration: 0.6), value: progress)
            VStack(spacing: 1) {
                Text(value).font(.title3.weight(.heavy)).monospacedDigit()
                Text(caption).font(.system(size: 10)).foregroundStyle(.secondary)
            }
        }
        .frame(width: 96, height: 96)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(value) \(caption)")
    }
}

/// Round speaker button. Pulses while speech is playing.
struct SpeakButton: View {
    @Environment(AppModel.self) private var model
    let text: String

    var body: some View {
        Button {
            model.speak(text)
        } label: {
            Image(systemName: "speaker.wave.2.fill")
                .font(.title2)
                .foregroundStyle(Palette.primaryStrong)
                .frame(width: 56, height: 56)
                .background(Palette.primarySoft, in: Circle())
                .symbolEffect(.variableColor.iterative, isActive: model.speech.isSpeaking)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Play pronunciation")
    }
}

/// Top bar shared by Learn, Review and Quiz sessions.
struct SessionHeader: View {
    let progress: String
    var combo: Int = 0
    var onClose: (() -> Void)?

    var body: some View {
        HStack {
            if let onClose {
                Button(action: onClose) {
                    Label("Home", systemImage: "chevron.left").labelStyle(.titleAndIcon)
                }
                .buttonStyle(.plain)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.secondary)
            }
            Spacer()
            if combo >= 3 { ComboBadge(count: combo) }
            Spacer()
            Text(progress).font(.subheadline.weight(.bold)).foregroundStyle(.secondary).monospacedDigit()
        }
        .frame(minHeight: 36)
        .animation(.spring(duration: 0.3), value: combo >= 3)
    }
}

/// Emoji, title, subtitle and buttons shown when a session ends.
struct SessionSummary<Buttons: View>: View {
    let emoji: String
    let title: String
    let subtitle: String
    @ViewBuilder var buttons: Buttons

    var body: some View {
        VStack(spacing: 10) {
            Text(emoji).font(.system(size: 56))
            Text(title).font(.title2.weight(.bold))
            Text(subtitle).foregroundStyle(.secondary).multilineTextAlignment(.center)
            VStack(spacing: 12) { buttons }.padding(.top, 20)
        }
        .padding(.vertical, 30)
        .frame(maxWidth: .infinity)
    }
}

struct EmptyState: View {
    let emoji: String
    let message: String

    var body: some View {
        VStack(spacing: 10) {
            Text(emoji).font(.system(size: 42))
            Text(message).foregroundStyle(.secondary).multilineTextAlignment(.center)
        }
        .padding(40)
        .frame(maxWidth: .infinity)
    }
}

// MARK: - Celebration popup

struct Celebration: Identifiable, Equatable {
    let id = UUID()
    let emoji: String
    let title: String
    let subtitle: String
}

private struct CelebrationOverlay: ViewModifier {
    @Environment(AppModel.self) private var model

    func body(content: Content) -> some View {
        content.overlay {
            if let celebration = model.celebration {
                ZStack {
                    Color.black.opacity(0.5).ignoresSafeArea()
                        .onTapGesture { model.celebration = nil }
                    VStack(spacing: 8) {
                        Text(celebration.emoji).font(.system(size: 52))
                        Text(celebration.title).font(.title3.weight(.heavy)).multilineTextAlignment(.center)
                        Text(celebration.subtitle).foregroundStyle(.secondary).padding(.bottom, 10)
                        Button("Nice!") { model.celebration = nil }.buttonStyle(.pill)
                    }
                    .padding(28)
                    .frame(maxWidth: 320)
                    .cardSurface(radius: 24)
                    .transition(.scale(scale: 0.8).combined(with: .opacity))
                }
                .accessibilityAddTraits(.isModal)
            }
        }
        .animation(.spring(duration: 0.35, bounce: 0.3), value: model.celebration)
    }
}

extension View {
    /// Shows `AppModel.celebration` above this view. Apply at the root and inside every full-screen cover.
    func celebrationOverlay() -> some View { modifier(CelebrationOverlay()) }
}
