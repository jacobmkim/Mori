import SwiftUI

struct ReminderView: View {
    @EnvironmentObject private var appState: AppState
    @State private var time = Date()
    @State private var enabled = true

    private let reminderService = ReminderService()
    private let deckService = DeckService()

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Daily Reminder")
                .font(.headline)

            Toggle("Enabled", isOn: $enabled)
            DatePicker("Time", selection: $time, displayedComponents: .hourAndMinute)

            Button("Save Reminder") {
                Task {
                    await reminderService.requestPermission()

                    let components = Calendar.current.dateComponents([.hour, .minute], from: time)
                    await reminderService.scheduleDailyReminder(hour: components.hour ?? 18, minute: components.minute ?? 0)

                    let formatter = DateFormatter()
                    formatter.dateFormat = "HH:mm"
                    try? await deckService.saveReminder(
                        time: formatter.string(from: time),
                        timezone: TimeZone.current.identifier,
                        enabled: enabled,
                        token: appState.accessToken
                    )
                }
            }
            .buttonStyle(.bordered)
        }
    }
}
