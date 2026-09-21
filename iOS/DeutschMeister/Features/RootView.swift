import SwiftUI

/// Tabs, the Learn/Review full-screen sessions, Settings, onboarding and the celebration popup.
struct RootView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        @Bindable var model = model
        TabView(selection: $model.selectedTab) {
            Tab("Home", systemImage: "house.fill", value: AppTab.home) { HomeView() }
            Tab("Quiz", systemImage: "brain.head.profile", value: AppTab.quiz) { QuizTabView() }
            Tab("Progress", systemImage: "chart.bar.fill", value: AppTab.progress) { ProgressScreen() }
            Tab("Badges", systemImage: "trophy.fill", value: AppTab.badges) { BadgesView() }
        }
        .fullScreenCover(item: $model.presentedSession) { kind in
            switch kind {
            case .learn: LearnFlowView { model.presentedSession = nil }
            case .review: ReviewFlowView { model.presentedSession = nil }
            }
        }
        .sheet(isPresented: $model.showSettings) { SettingsView() }
        .fullScreenCover(isPresented: Binding(
            get: { !model.state.settings.onboarded }, set: { _ in }
        )) { OnboardingView() }
        .celebrationOverlay()
        .onChange(of: scenePhase) { _, phase in if phase == .active { model.refreshDay() } }
    }
}
