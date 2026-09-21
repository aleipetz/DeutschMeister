import SwiftUI

struct ProgressScreen: View {
    @Environment(AppModel.self) private var model
    @State private var level: CEFRLevel?
    @State private var pos: PartOfSpeech?

    private var levels: [CEFRLevel] { level.map { [$0] } ?? CEFRLevel.allCases }

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 12) {
                    filters
                    ForEach(levels, id: \.self) { CoverageRow(level: $0, coverage: model.planner.coverage(at: $0, pos: pos, state: model.state)) }
                    legend

                    SectionTitle("🔥 Activity")
                    Heatmap(days: heatmapDays)

                    let tricky = trickyWords
                    if !tricky.isEmpty {
                        SectionTitle("🐢 Tricky words")
                        Text("Words you've reviewed many times and still miss more than half the time.")
                            .font(.footnote).foregroundStyle(.secondary)
                        ForEach(tricky, id: \.entry.id) { item in
                            HStack {
                                Text(item.entry.lemmaDE).font(.subheadline.weight(.semibold))
                                Text(item.entry.primaryTranslation).font(.subheadline).foregroundStyle(.secondary).lineLimit(1)
                                Spacer()
                                Text("\(item.progress.totalCorrect)/\(item.progress.totalReviews)").font(.footnote.monospacedDigit()).foregroundStyle(Palette.red)
                            }
                            .padding(12).cardSurface(radius: 12, shadow: false)
                        }
                    }

                    SectionTitle("🧩 Verb Families")
                    Text("Separable & composite verbs grouped by their base verb, so you see the pattern instead of memorising each one alone.")
                        .font(.footnote).foregroundStyle(.secondary)
                    let families = model.index.verbFamilies.filter { $0.members.count > 1 }
                    if families.isEmpty {
                        EmptyState(emoji: "🧩", message: "No verb families yet.")
                    } else {
                        ForEach(families) { FamilyCard(family: $0) }
                    }
                }
                .padding(.horizontal, 20).padding(.bottom, 24)
            }
            .background(AppBackground())
            .navigationTitle("Your Coverage")
            .toolbarTitleDisplayMode(.inline)
        }
    }

    private var filters: some View {
        HStack(spacing: 10) {
            Picker("Level", selection: $level) {
                Text("All levels").tag(CEFRLevel?.none)
                ForEach(CEFRLevel.allCases, id: \.self) { Text($0.rawValue).tag(CEFRLevel?.some($0)) }
            }
            Picker("Word type", selection: $pos) {
                Text("All word types").tag(PartOfSpeech?.none)
                ForEach(PartOfSpeech.allCases, id: \.self) { Text($0.label).tag(PartOfSpeech?.some($0)) }
            }
            Spacer(minLength: 0)
        }
        .pickerStyle(.menu)
    }

    private var legend: some View {
        HStack(spacing: 14) {
            LegendDot(color: Palette.green, text: "Mastered")
            LegendDot(color: Palette.teal, text: "Familiar")
            LegendDot(color: Palette.orange, text: "Learning")
            LegendDot(color: Palette.border, text: "Not started")
        }
        .font(.caption).foregroundStyle(.secondary).padding(.top, 4)
    }

    /// The last 84 days, oldest first, as XP per day.
    private var heatmapDays: [Heatmap.Day] {
        (0..<84).reversed().map { offset in
            let date = model.calendar.date(byAdding: .day, value: -offset, to: model.now) ?? model.now
            let key = DayKey.string(for: date, calendar: model.calendar)
            return Heatmap.Day(key: key, xp: model.state.dailyActivity[key]?.xpEarned ?? 0)
        }
    }

    private var trickyWords: [(entry: VocabEntry, progress: VocabProgress)] {
        model.state.progress.values
            .filter(\.isLeech)
            .compactMap { p in model.index.entriesByID[p.id].map { ($0, p) } }
            .sorted { $0.0.lemmaDE < $1.0.lemmaDE }
    }
}

private struct SectionTitle: View {
    let text: String
    init(_ text: String) { self.text = text }
    var body: some View { Text(text).font(.headline).padding(.top, 18) }
}

private struct LegendDot: View {
    let color: Color
    let text: String
    var body: some View {
        HStack(spacing: 4) { Circle().fill(color).frame(width: 9, height: 9); Text(text) }
    }
}

private struct CoverageRow: View {
    let level: CEFRLevel
    let coverage: StudyPlanner.Coverage

    var body: some View {
        VStack(spacing: 8) {
            HStack {
                Text(level.rawValue).font(.subheadline.weight(.bold))
                Spacer()
                Text("\(coverage.mastered) mastered · \(coverage.started) / \(coverage.total) started")
                    .font(.footnote.weight(.semibold)).foregroundStyle(.secondary)
            }
            GeometryReader { geo in
                let total = max(1, coverage.total)
                HStack(spacing: 0) {
                    segment(Palette.green, coverage.mastered, total, geo.size.width)
                    segment(Palette.teal, coverage.familiar, total, geo.size.width)
                    segment(Palette.orange, coverage.learning, total, geo.size.width)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Palette.border)
                .clipShape(Capsule())
            }
            .frame(height: 12)
        }
        .padding(14).cardSurface(radius: 12)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(level.rawValue): \(coverage.mastered) mastered, \(coverage.started) of \(coverage.total) started")
    }

    private func segment(_ color: Color, _ count: Int, _ total: Int, _ width: CGFloat) -> some View {
        Rectangle().fill(color).frame(width: width * CGFloat(count) / CGFloat(total))
    }
}

struct Heatmap: View {
    struct Day: Hashable { let key: String; let xp: Int }
    let days: [Day]

    private let columns = Array(repeating: GridItem(.flexible(), spacing: 4), count: 14)

    var body: some View {
        LazyVGrid(columns: columns, spacing: 4) {
            ForEach(days, id: \.key) { day in
                RoundedRectangle(cornerRadius: 4).fill(color(day.xp)).aspectRatio(1, contentMode: .fit)
                    .accessibilityLabel("\(day.key): \(day.xp) XP")
            }
        }
        .padding(14).cardSurface(radius: 12, shadow: false)
    }

    private func color(_ xp: Int) -> Color {
        switch xp {
        case 100...: Palette.green
        case 50...: Color(hex: 0x4FCE87)
        case 20...: Color(hex: 0x9BE6B8)
        case 1...: Color(hex: 0xD6F5E3)
        default: Palette.border
        }
    }
}

private struct FamilyCard: View {
    @Environment(AppModel.self) private var model
    let family: VerbFamily

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(model.index.entriesByID[family.baseVerbID]?.lemmaDE ?? family.baseVerbID.replacingOccurrences(of: "_verb", with: ""))
                .font(.headline).padding(.bottom, 8)
            ForEach(family.members, id: \.id) { member in
                Divider()
                HStack(alignment: .firstTextBaseline) {
                    Text(member.lemmaDE).font(.subheadline)
                    Spacer(minLength: 12)
                    Text([member.particle, member.particleMeaningHint].compactMap { $0 }.joined(separator: " — "))
                        .font(.footnote.weight(.semibold)).foregroundStyle(Palette.tealText).multilineTextAlignment(.trailing)
                }
                .padding(.vertical, 6)
            }
        }
        .padding(14).cardSurface(radius: 12)
    }
}
