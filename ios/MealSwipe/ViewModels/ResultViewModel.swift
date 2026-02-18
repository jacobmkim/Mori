import Foundation

@MainActor
final class ResultViewModel: ObservableObject {
    @Published var topMeals: [MealCard] = []
    @Published var shoppingList: [ShoppingItem] = []
    @Published var confidenceScore: Double = 0
    @Published var isLoading = false
    @Published var errorMessage: String?

    private let deckService = DeckService()

    func load(sessionDay: String, token: String) async {
        isLoading = true
        defer { isLoading = false }

        do {
            let dayResult = try await deckService.fetchDayResult(sessionDay: sessionDay, token: token)
            topMeals = dayResult.topMeals
            confidenceScore = dayResult.confidenceScore

            let shopping = try await deckService.buildShoppingList(sessionDay: sessionDay, topMealIds: topMeals.map(\.mealId), token: token)
            shoppingList = shopping.shoppingList
        } catch {
            errorMessage = "Unable to load results."
        }
    }
}
