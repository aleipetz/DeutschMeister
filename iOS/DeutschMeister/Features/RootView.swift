import SwiftUI

/// Temporary shell: proves content and progress load. Replaced by the real tab UI next.
struct RootView: View {
    @State private var summary = "Loading…"

    var body: some View {
        VStack(spacing: 12) {
            Text("🦉").font(.system(size: 64))
            Text("Deutsch Meister").font(.largeTitle.bold())
            Text(summary).foregroundStyle(.secondary)
        }
        .padding()
        .task {
            do {
                let index = try ContentStore.loadBundled()
                let state = ProgressStore.standard().load()
                let due = StudyPlanner(index: index).dueQueue(state: state, now: .now).count
                summary = "\(index.entries.count) words loaded · \(due) due"
            } catch {
                summary = "Couldn't load content: \(error.localizedDescription)"
            }
        }
    }
}
