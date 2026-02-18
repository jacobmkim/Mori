import SwiftUI

struct OnboardingView: View {
    @EnvironmentObject private var appState: AppState
    @StateObject private var viewModel = OnboardingViewModel()

    var body: some View {
        Form {
            Picker("Diet", selection: $viewModel.dietType) {
                ForEach(DietType.allCases) { type in
                    Text(type.rawValue.capitalized).tag(type)
                }
            }

            TextField("Allergies (comma separated)", text: $viewModel.allergensText)
            Text("Max cook time: \(Int(viewModel.maxCookMinutes)) min")
            Slider(value: $viewModel.maxCookMinutes, in: 10...90, step: 5)
            TextField("Disliked ingredients (comma separated)", text: $viewModel.dislikedIngredientsText)

            Button("Save and continue") {
                Task { await viewModel.submit(appState: appState) }
            }
            .disabled(viewModel.isSaving)

            if let error = viewModel.errorMessage {
                Text(error).foregroundStyle(.red)
            }
        }
        .navigationTitle("Your Preferences")
    }
}
