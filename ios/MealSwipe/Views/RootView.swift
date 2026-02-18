import SwiftUI

struct RootView: View {
    @EnvironmentObject private var appState: AppState

    var body: some View {
        NavigationStack {
            if !appState.isAuthenticated {
                AuthView()
            } else if !appState.hasOnboarded {
                OnboardingView()
            } else {
                DeckView()
            }
        }
    }
}
