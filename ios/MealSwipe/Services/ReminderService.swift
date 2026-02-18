import Foundation
import UserNotifications

final class ReminderService {
    func requestPermission() async {
        _ = try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge])
    }

    func scheduleDailyReminder(hour: Int, minute: Int) async {
        let content = UNMutableNotificationContent()
        content.title = "MealSwipe"
        content.body = "Time to pick meals for today."
        content.sound = .default

        var date = DateComponents()
        date.hour = hour
        date.minute = minute

        let trigger = UNCalendarNotificationTrigger(dateMatching: date, repeats: true)
        let request = UNNotificationRequest(identifier: "mealswipe.daily", content: content, trigger: trigger)

        UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: ["mealswipe.daily"])
        try? await UNUserNotificationCenter.current().add(request)
    }
}
