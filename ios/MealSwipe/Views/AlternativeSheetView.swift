import SwiftUI

struct AlternativeSheetView: View {
    let alternatives: [MealCard]

    var body: some View {
        NavigationStack {
            List(alternatives, id: \.mealId) { meal in
                VStack(alignment: .leading, spacing: 4) {
                    Text(meal.title).font(.headline)
                    if !meal.warningFlags.isEmpty {
                        Text("Warning: \(meal.warningFlags.joined(separator: ", "))")
                            .font(.footnote)
                            .foregroundStyle(.orange)
                    }
                }
            }
            .navigationTitle("Alternatives")
        }
    }
}
