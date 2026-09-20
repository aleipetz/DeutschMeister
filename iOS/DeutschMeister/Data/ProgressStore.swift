import Foundation

/// Saves and loads the learner's `AppState` as a single JSON file in Application Support.
struct ProgressStore {
    let fileURL: URL

    static let fileName = "progress.json"

    init(fileURL: URL) {
        self.fileURL = fileURL
    }

    /// `~/Library/Application Support/DeutschMeister/progress.json` (inside the app's sandbox).
    static func standard() -> ProgressStore {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        return ProgressStore(fileURL: base.appendingPathComponent("DeutschMeister").appendingPathComponent(fileName))
    }

    /// Returns the saved state, or a fresh one if there is none. If the file exists but can't be
    /// read, it is moved aside to `progress.corrupt-<timestamp>.json` (never silently overwritten).
    func load() -> AppState {
        guard let data = try? Data(contentsOf: fileURL) else { return AppState() }
        do {
            return try StateCoding.decoder().decode(AppState.self, from: data)
        } catch {
            let stamp = Int(Date().timeIntervalSince1970)
            let backup = fileURL.deletingLastPathComponent().appendingPathComponent("progress.corrupt-\(stamp).json")
            try? FileManager.default.moveItem(at: fileURL, to: backup)
            return AppState()
        }
    }

    func save(_ state: AppState) throws {
        try FileManager.default.createDirectory(
            at: fileURL.deletingLastPathComponent(), withIntermediateDirectories: true)
        let data = try StateCoding.encoder().encode(state)
        try data.write(to: fileURL, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    }

    /// The state as export-ready JSON (same format the prototype exported).
    static func exportData(_ state: AppState) throws -> Data {
        try StateCoding.encoder().encode(state)
    }

    /// Parses an export file. Throws without changing anything if it isn't a valid progress file.
    static func importState(from data: Data) throws -> AppState {
        try StateCoding.decodeImport(data)
    }
}
