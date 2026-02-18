import SwiftUI

struct DeckView: View {
    @EnvironmentObject private var appState: AppState
    @StateObject private var viewModel = DeckViewModel()

    var body: some View {
        VStack(spacing: 16) {
            if viewModel.isLoading {
                ProgressView("Loading meals...")
            } else if let current = viewModel.meals.first {
                MealCardView(meal: current)

                HStack {
                    Button("No") {
                        Task { await viewModel.swipeCurrent(decision: "no", token: appState.accessToken) }
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.red)

                    Button("Yes") {
                        Task { await viewModel.swipeCurrent(decision: "yes", token: appState.accessToken) }
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.green)
                }
            } else {
                ResultView(sessionDay: String(viewModel.today))
            }

            if let error = viewModel.errorMessage {
                Text(error).foregroundStyle(.red)
            }
        }
        .padding()
        .navigationTitle("Today")
        .task {
            await viewModel.loadDeck(token: appState.accessToken)
        }
        .sheet(isPresented: $viewModel.showAlternatives) {
            AlternativeSheetView(alternatives: viewModel.alternatives)
        }
    }
}
