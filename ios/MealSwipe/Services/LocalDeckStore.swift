import Foundation

final class LocalDeckStore {
    private let key = "mealswipe.deck.cache"

    func save(_ meals: [MealCard]) {
        let encoder = JSONEncoder()
        if let data = try? encoder.encode(meals) {
            UserDefaults.standard.set(data, forKey: key)
        }
    }

    func load() -> [MealCard] {
        guard let data = UserDefaults.standard.data(forKey: key) else { return [] }
        return (try? JSONDecoder().decode([MealCard].self, from: data)) ?? []
    }
}
