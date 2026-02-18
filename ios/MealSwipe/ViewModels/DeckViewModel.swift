import Foundation

@MainActor
final class DeckViewModel: ObservableObject {
    @Published var meals: [MealCard] = []
    @Published var alternatives: [MealCard] = []
    @Published var showAlternatives = false
    @Published var isLoading = false
    @Published var errorMessage: String?

    let today = ISO8601DateFormatter().string(from: Date()).prefix(10)

    private let deckService = DeckService()
    private let store = LocalDeckStore()

    func loadDeck(token: String) async {
        isLoading = true
        defer { isLoading = false }

        do {
            meals = try await deckService.generateDeck(token: token)
            store.save(meals)
        } catch {
            meals = store.load()
            if meals.isEmpty {
                errorMessage = "Unable to load meal deck."
            }
        }
    }

    func swipeCurrent(decision: String, token: String) async {
        guard let meal = meals.first else { return }

        let event = SwipeEvent(
            eventId: UUID(),
            mealId: meal.mealId,
            decision: decision,
            timestamp: ISO8601DateFormatter().string(from: Date()),
            sessionDay: String(today)
        )

        do {
            try await deckService.recordSwipe(event: event, token: token)
            meals.removeFirst()

            if decision == "no" {
                let suggestion = try await deckService.suggestAlternative(baseMealId: meal.mealId, sessionDay: String(today), token: token)
                alternatives = suggestion.alternatives
                showAlternatives = !alternatives.isEmpty
            }
        } catch {
            errorMessage = "Unable to submit swipe."
        }
    }
}
