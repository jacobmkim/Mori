import SwiftUI

struct AuthView: View {
    @EnvironmentObject private var appState: AppState
    @StateObject private var viewModel = AuthViewModel()

    var body: some View {
        Form {
            Section("Sign in") {
                Button("Continue with Apple") {
                    Task { await viewModel.signInWithApple(appState: appState) }
                }
                .disabled(viewModel.isLoading)
            }

            Section("Magic link") {
                TextField("Email", text: $viewModel.email)
                    .keyboardType(.emailAddress)
                    .textInputAutocapitalization(.never)
                Button("Send Link") {
                    Task { await viewModel.sendMagicLink() }
                }
                .disabled(viewModel.email.isEmpty || viewModel.isLoading)
            }

            if let error = viewModel.errorMessage {
                Text(error).foregroundStyle(.red)
            }
        }
        .navigationTitle("MealSwipe")
    }
}
