import Foundation

@MainActor
final class AuthViewModel: ObservableObject {
    @Published var email = ""
    @Published var isLoading = false
    @Published var errorMessage: String?

    private let authService = AuthService()

    func signInWithApple(appState: AppState) async {
        isLoading = true
        defer { isLoading = false }

        do {
            let token = try await authService.signInWithApple()
            appState.accessToken = token
            appState.isAuthenticated = true
        } catch {
            errorMessage = "Apple sign-in failed."
        }
    }

    func sendMagicLink() async {
        isLoading = true
        defer { isLoading = false }

        do {
            try await authService.signInWithEmailMagicLink(email)
        } catch {
            errorMessage = "Unable to send magic link."
        }
    }
}
