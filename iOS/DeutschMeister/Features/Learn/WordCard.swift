import SwiftUI

/// The vocabulary card shared by Learn (always answered) and Review (hidden until revealed).
struct WordCard: View {
    @Environment(AppModel.self) private var model
    let entry: VocabEntry
    let showAnswer: Bool

    var body: some View {
        let palette = model.palette(for: entry)
        VStack(spacing: 6) {
            ThemeChip(theme: model.theme(for: entry), palette: palette).padding(.bottom, 8)
            PartOfSpeechBadge(pos: entry.pos)

            HStack(spacing: 8) {
                if let gender = entry.noun?.gender { GenderBadge(gender: gender) }
                Text(entry.lemmaDE)
                    .font(.system(size: 34, weight: .heavy))
                    .minimumScaleFactor(0.6).lineLimit(2).multilineTextAlignment(.center)
            }
            if let plural = entry.noun?.pluralDE {
                Text("Plural: \(plural)").font(.footnote).foregroundStyle(.secondary)
            }
            SpeakButton(text: entry.lemmaDE).padding(.vertical, 6)

            if showAnswer {
                answer
            } else {
                Text("Try to recall the meaning, then reveal.").font(.subheadline).foregroundStyle(.secondary).padding(.top, 10)
            }
        }
        .padding(.horizontal, 22).padding(.vertical, 26)
        .frame(maxWidth: .infinity)
        .overlay(alignment: .top) { Rectangle().fill(palette.main).frame(height: 6) }
        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
        .background(Palette.surface, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        .shadow(color: .black.opacity(0.10), radius: 16, y: 8)
    }

    @ViewBuilder private var answer: some View {
        Text(entry.translationsEN.joined(separator: ", "))
            .font(.title3.weight(.semibold)).foregroundStyle(Palette.primaryStrong)
            .multilineTextAlignment(.center).padding(.top, 4)

        VStack(alignment: .leading, spacing: 4) {
            Text(entry.exampleDE).font(.body.weight(.bold))
            Text(entry.exampleEN).font(.subheadline).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14).softPanel().padding(.top, 10)

        if let verb = entry.verb {
            if let particle = verb.particle, let hint = verb.particleMeaningHint {
                Text("🧩 **\(particle)**: \(hint)")
                    .font(.subheadline).foregroundStyle(Palette.tealText)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(12).background(Palette.tealSoft, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                    .padding(.top, 6)
            }
            Text("**Present:** \(verb.present3sg)   **Perfekt:** \(verb.perfekt)")
                .font(.footnote).foregroundStyle(.secondary)
                .frame(maxWidth: .infinity, alignment: .leading).padding(.top, 6)
        }
        if let adjective = entry.adjective, adjective.comparativeIrregular != nil || adjective.superlativeIrregular != nil {
            Text("**Comparative:** \(adjective.comparativeIrregular ?? "—")   **Superlative:** \(adjective.superlativeIrregular ?? "—")")
                .font(.footnote).foregroundStyle(.secondary)
                .frame(maxWidth: .infinity, alignment: .leading).padding(.top, 6)
        }
        if let notes = entry.notes {
            Text("💡 \(notes)").font(.footnote).foregroundStyle(.secondary)
                .frame(maxWidth: .infinity, alignment: .leading).padding(.top, 6)
        }
    }
}
