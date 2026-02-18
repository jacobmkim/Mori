import Foundation

struct DeckResponse: Codable {
    let meals: [MealCard]
}

struct AlternativeRequest: Codable {
    let baseMealId: Int
    let sessionDay: String

    enum CodingKeys: String, CodingKey {
        case baseMealId = "base_meal_id"
        case sessionDay = "session_day"
    }
}

struct ReminderRequest: Codable {
    let reminderTime: String
    let timezone: String
    let enabled: Bool

    enum CodingKeys: String, CodingKey {
        case reminderTime = "reminder_time"
        case timezone
        case enabled
    }
}

final class DeckService {
    private let client = APIClient()

    func generateDeck(token: String) async throws -> [MealCard] {
        let response: DeckResponse = try await client.send(path: "/deck-generate", token: token, body: Optional<Int>.none)
        return response.meals
    }

    func recordSwipe(event: SwipeEvent, token: String) async throws {
        _ = try await client.send(path: "/swipe-record", token: token, body: event) as EmptyResponse
    }

    func suggestAlternative(baseMealId: Int, sessionDay: String, token: String) async throws -> AlternativeSuggestion {
        let request = AlternativeRequest(baseMealId: baseMealId, sessionDay: sessionDay)
        return try await client.send(path: "/alternative-suggest", token: token, body: request)
    }

    func fetchDayResult(sessionDay: String, token: String) async throws -> DayResultResponse {
        return try await client.sendNoBody(path: "/day-result?session_day=\(sessionDay)", token: token)
    }

    func buildShoppingList(sessionDay: String, topMealIds: [Int], token: String) async throws -> ShoppingListResponse {
        struct Body: Codable {
            let sessionDay: String
            let topMealIds: [Int]

            enum CodingKeys: String, CodingKey {
                case sessionDay = "session_day"
                case topMealIds = "top_meal_ids"
            }
        }
        return try await client.send(path: "/shopping-list-build", token: token, body: Body(sessionDay: sessionDay, topMealIds: topMealIds))
    }

    func upsertProfile(profile: UserProfile, token: String) async throws {
        _ = try await client.send(path: "/profile-upsert", token: token, body: profile) as EmptyResponse
    }

    func saveReminder(time: String, timezone: String, enabled: Bool, token: String) async throws {
        _ = try await client.send(path: "/reminder-set-time", token: token, body: ReminderRequest(reminderTime: time, timezone: timezone, enabled: enabled)) as EmptyResponse
    }
}
