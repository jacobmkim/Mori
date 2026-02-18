import Foundation

struct EmptyResponse: Codable {
    let ok: Bool?
}

final class AuthService {
    // Placeholder for Supabase Auth SDK wiring.
    func signInWithApple() async throws -> String {
        return "mock-token"
    }

    func signInWithEmailMagicLink(_ email: String) async throws {
        _ = email
    }

    func restoreSessionToken() -> String? {
        nil
    }
}
