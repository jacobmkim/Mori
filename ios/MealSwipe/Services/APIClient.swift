import Foundation

struct APIConfig {
    static let baseURL = URL(string: "https://YOUR_SUPABASE_PROJECT.functions.supabase.co")!
}

enum APIError: Error {
    case invalidResponse
    case server(String)
}

final class APIClient {
    private let session: URLSession

    init(session: URLSession = .shared) {
        self.session = session
    }

    func send<T: Decodable, B: Encodable>(path: String, method: String = "POST", token: String, body: B?) async throws -> T {
        var request = URLRequest(url: APIConfig.baseURL.appending(path: path))
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")

        if let body {
            request.httpBody = try JSONEncoder().encode(body)
        }

        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }

        guard (200..<300).contains(http.statusCode) else {
            let message = String(data: data, encoding: .utf8) ?? "Server error"
            throw APIError.server(message)
        }

        return try JSONDecoder().decode(T.self, from: data)
    }

    func sendNoBody<T: Decodable>(path: String, method: String = "GET", token: String) async throws -> T {
        var request = URLRequest(url: APIConfig.baseURL.appending(path: path))
        request.httpMethod = method
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")

        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }

        guard (200..<300).contains(http.statusCode) else {
            let message = String(data: data, encoding: .utf8) ?? "Server error"
            throw APIError.server(message)
        }

        return try JSONDecoder().decode(T.self, from: data)
    }
}
