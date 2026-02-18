import SwiftUI

struct ResultView: View {
    @EnvironmentObject private var appState: AppState
    @StateObject private var viewModel = ResultViewModel()

    let sessionDay: String

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text("Top 3 Picks")
                    .font(.title2.bold())

                ForEach(viewModel.topMeals, id: \.mealId) { meal in
                    MealCardView(meal: meal)
                }

                Text("Shopping List")
                    .font(.title2.bold())

                ForEach(viewModel.shoppingList, id: \.self) { item in
                    Text("• \(item.ingredient) \(item.quantity.map { String(format: "%.1f", $0) } ?? "") \(item.unit ?? "")")
                }

                Text("Confidence: \(Int(viewModel.confidenceScore * 100))%")
                    .font(.footnote)
                    .foregroundStyle(.secondary)

                ReminderView()
            }
            .padding()
        }
        .task {
            await viewModel.load(sessionDay: sessionDay, token: appState.accessToken)
        }
    }
}
