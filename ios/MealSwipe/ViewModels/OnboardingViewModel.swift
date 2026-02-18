import Foundation

@MainActor
final class OnboardingViewModel: ObservableObject {
    @Published var dietType: DietType = .omnivore
    @Published var allergensText = ""
    @Published var maxCookMinutes: Double = 30
    @Published var dislikedIngredientsText = ""
    @Published var isSaving = false
    @Published var errorMessage: String?

    private let deckService = DeckService()

    func submit(appState: AppState) async {
        guard !appState.accessToken.isEmpty else { return }
        isSaving = true
        defer { isSaving = false }

        let profile = UserProfile(
            userId: nil,
            dietType: dietType,
            allergens: splitCSV(allergensText),
            maxCookMinutes: Int(maxCookMinutes),
            dislikedIngredients: splitCSV(dislikedIngredientsText)
        )

        do {
            try await deckService.upsertProfile(profile: profile, token: appState.accessToken)
            appState.hasOnboarded = true
        } catch {
            errorMessage = "Unable to save onboarding profile."
        }
    }

    private func splitCSV(_ value: String) -> [String] {
        value
            .split(separator: ",")
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
    }
}
