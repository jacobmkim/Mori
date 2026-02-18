import Foundation

enum DietType: String, CaseIterable, Codable, Identifiable {
    case omnivore
    case vegetarian
    case vegan
    case keto
    case paleo
    case pescatarian

    var id: String { rawValue }
}

struct UserProfile: Codable {
    let userId: UUID?
    let dietType: DietType
    let allergens: [String]
    let maxCookMinutes: Int
    let dislikedIngredients: [String]

    enum CodingKeys: String, CodingKey {
        case userId = "user_id"
        case dietType = "diet_type"
        case allergens
        case maxCookMinutes = "max_cook_minutes"
        case dislikedIngredients = "disliked_ingredients"
    }
}

struct MealIngredient: Codable, Hashable {
    let name: String
    let amount: Double?
    let unit: String?
}

struct MealCard: Codable, Identifiable, Hashable {
    var id: Int { mealId }
    let mealId: Int
    let title: String
    let imageURL: String?
    let cookMinutes: Int?
    let calories: Int?
    let ingredients: [MealIngredient]
    let dietTags: [String]
    let allergenFlags: [String]
    let warningFlags: [String]

    enum CodingKeys: String, CodingKey {
        case mealId = "meal_id"
        case title
        case imageURL = "image_url"
        case cookMinutes = "cook_minutes"
        case calories
        case ingredients
        case dietTags = "diet_tags"
        case allergenFlags = "allergen_flags"
        case warningFlags = "warning_flags"
    }
}

struct SwipeEvent: Codable {
    let eventId: UUID
    let mealId: Int
    let decision: String
    let timestamp: String
    let sessionDay: String

    enum CodingKeys: String, CodingKey {
        case eventId = "event_id"
        case mealId = "meal_id"
        case decision
        case timestamp
        case sessionDay = "session_day"
    }
}

struct AlternativeSuggestion: Codable {
    let baseMealId: Int
    let reason: String
    let alternatives: [MealCard]
    let aiEnabled: Bool?

    enum CodingKeys: String, CodingKey {
        case baseMealId = "base_meal_id"
        case reason
        case alternatives
        case aiEnabled = "ai_enabled"
    }
}

struct ShoppingItem: Codable, Hashable {
    let ingredient: String
    let quantity: Double?
    let unit: String?
}

struct DayResultResponse: Codable {
    let topMeals: [MealCard]
    let confidenceScore: Double

    enum CodingKeys: String, CodingKey {
        case topMeals = "top_meals"
        case confidenceScore = "confidence_score"
    }
}

struct ShoppingListResponse: Codable {
    let shoppingList: [ShoppingItem]

    enum CodingKeys: String, CodingKey {
        case shoppingList = "shopping_list"
    }
}
