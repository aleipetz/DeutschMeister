import SwiftUI
import UniformTypeIdentifiers

struct SettingsView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss

    @State private var exporting = false
    @State private var importing = false
    @State private var pendingImport: AppState?
    @State private var confirmReset = false
    @State private var message: String?

    var body: some View {
        @Bindable var model = model
        NavigationStack {
            Form {
                Section("Daily XP goal") {
                    Stepper(value: Binding(
                        get: { model.state.profile.dailyGoalXP },
                        set: { value in model.update { $0.profile.dailyGoalXP = value } }
                    ), in: 10...500, step: 10) {
                        Text("\(model.state.profile.dailyGoalXP) XP a day").monospacedDigit()
                    }
                }

                Section {
                    Picker("Level", selection: Binding(
                        get: { model.state.settings.levelOverride },
                        set: { value in model.update { $0.settings.levelOverride = value } }
                    )) {
                        Text("Auto (recommended)").tag(LevelOverride.auto)
                        ForEach(CEFRLevel.allCases, id: \.self) { Text($0.rawValue).tag(LevelOverride.level($0)) }
                    }
                } header: {
                    Text("Learning level")
                } footer: {
                    Text("New words come from this level. Auto follows your progress.")
                }

                Section {
                    Slider(value: Binding(
                        get: { model.state.settings.speechRate },
                        set: { value in model.update { $0.settings.speechRate = value } }
                    ), in: 0.5...1.3, step: 0.05) { Text("Speech rate") }
                    Button("🔊 Test voice") { model.speak("Das ist ein Test. Ich lerne Deutsch.") }
                } header: {
                    Text("Speech rate")
                } footer: {
                    Text(model.speech.hasGermanVoice
                         ? "A German voice is available on this device. ✅"
                         : "No German voice found. Download one in Settings → Accessibility → Spoken Content → Voices.")
                }

                Section {
                    Button("⬇️ Export progress") { exporting = true }
                    Button("⬆️ Import progress") { importing = true }
                } header: {
                    Text("Backup your progress")
                } footer: {
                    Text("Exports a JSON file you can keep in Files or iCloud Drive. It also imports exports from the old web prototype.")
                }

                Section("Danger zone") {
                    Button("🗑️ Reset all progress", role: .destructive) { confirmReset = true }
                }
            }
            .navigationTitle("⚙️ Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
            .fileExporter(
                isPresented: $exporting, document: ProgressDocument(state: model.state),
                contentType: .json, defaultFilename: "german-vocab-progress-\(DayKey.string(for: model.now, calendar: model.calendar))"
            ) { result in
                if case .failure(let error) = result { message = "Couldn't export: \(error.localizedDescription)" }
            }
            .fileImporter(isPresented: $importing, allowedContentTypes: [.json]) { result in
                switch result {
                case .success(let url): readImport(url)
                case .failure(let error): message = "Couldn't open that file: \(error.localizedDescription)"
                }
            }
            .confirmationDialog(
                "Replace your current progress with the imported file?", isPresented: Binding(
                    get: { pendingImport != nil }, set: { if !$0 { pendingImport = nil } }),
                titleVisibility: .visible
            ) {
                Button("Replace progress", role: .destructive) {
                    if let pendingImport { model.replaceState(with: pendingImport) }
                    pendingImport = nil
                    message = "Progress imported."
                }
            }
            .confirmationDialog(
                "This permanently deletes all your progress, XP and achievements.", isPresented: $confirmReset,
                titleVisibility: .visible
            ) {
                Button("Delete everything", role: .destructive) { model.resetProgress() }
            }
            .alert("Settings", isPresented: Binding(get: { message != nil }, set: { if !$0 { message = nil } })) {
                Button("OK", role: .cancel) {}
            } message: { Text(message ?? "") }
        }
    }

    private func readImport(_ url: URL) {
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        do {
            pendingImport = try ProgressStore.importState(from: Data(contentsOf: url))
        } catch {
            message = error.localizedDescription
        }
    }
}

/// Wraps the learner's state as a JSON file for the system file exporter.
struct ProgressDocument: FileDocument {
    static let readableContentTypes: [UTType] = [.json]
    let state: AppState

    init(state: AppState) { self.state = state }

    init(configuration: ReadConfiguration) throws {
        guard let data = configuration.file.regularFileContents else { throw CocoaError(.fileReadCorruptFile) }
        state = try StateCoding.decodeImport(data)
    }

    func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper {
        FileWrapper(regularFileWithContents: try ProgressStore.exportData(state))
    }
}
