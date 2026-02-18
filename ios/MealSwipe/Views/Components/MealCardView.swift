import SwiftUI

struct MealCardView: View {
    let meal: MealCard

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            AsyncImage(url: URL(string: meal.imageURL ?? "")) { image in
                image
                    .resizable()
                    .scaledToFill()
            } placeholder: {
                Color.gray.opacity(0.2)
            }
            .frame(height: 220)
            .clipShape(RoundedRectangle(cornerRadius: 12))

            Text(meal.title)
                .font(.title3.bold())

            HStack {
                if let cook = meal.cookMinutes { Text("\(cook) min") }
                if let calories = meal.calories { Text("\(calories) cal") }
            }
            .font(.subheadline)
            .foregroundStyle(.secondary)

            if !meal.warningFlags.isEmpty {
                Text("Warning: \(meal.warningFlags.joined(separator: ", "))")
                    .font(.footnote)
                    .foregroundStyle(.orange)
            }
        }
    }
}
