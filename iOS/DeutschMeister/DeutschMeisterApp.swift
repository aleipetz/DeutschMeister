import SwiftUI

@main
struct DeutschMeisterApp: App {
    @State private var launch = Launch.load()

    var body: some Scene {
        WindowGroup {
            switch launch {
            case .ready(let model):
                RootView().environment(model)
            case .failed(let message):
                ContentUnavailableView("Couldn't load vocabulary", systemImage: "exclamationmark.triangle", description: Text(message))
            }
        }
    }
}

@MainActor
private enum Launch {
    case ready(AppModel)
    case failed(String)

    static func load() -> Launch {
        do {
            let index = try ContentStore.loadBundled()
            let calendar = Calendar.current
            #if DEBUG
            if LaunchOptions.demo || LaunchOptions.fresh {
                let scratch = FileManager.default.temporaryDirectory.appendingPathComponent("dm-demo-\(UUID().uuidString)/progress.json")
                let state = LaunchOptions.demo ? DemoData.makeState(index: index, now: Date(), calendar: calendar) : AppState()
                let model = AppModel(index: index, state: state, store: ProgressStore(fileURL: scratch))
                open(LaunchOptions.screen, in: model)
                return .ready(model)
            }
            #endif
            let store = ProgressStore.standard()
            return .ready(AppModel(index: index, state: store.load(), store: store))
        } catch {
            return .failed(error.localizedDescription)
        }
    }

    #if DEBUG
    private static func open(_ screen: String?, in model: AppModel) {
        switch screen {
        case "learn": model.presentedSession = .learn
        case "review": model.presentedSession = .review
        case "quiz": model.selectedTab = .quiz
        case "progress": model.selectedTab = .progress
        case "badges": model.selectedTab = .badges
        case "settings": model.showSettings = true
        default: break
        }
    }
    #endif
}
