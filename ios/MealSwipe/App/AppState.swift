import Foundation

@MainActor
final class AppState: ObservableObject {
    @Published var isAuthenticated = false
    @Published var hasOnboarded = false
    @Published var accessToken: String = ""

    var aiAlternativesEnabled = false
}
