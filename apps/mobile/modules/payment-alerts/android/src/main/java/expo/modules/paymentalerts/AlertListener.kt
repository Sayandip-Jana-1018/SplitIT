package expo.modules.paymentalerts

import android.app.Notification
import android.os.Bundle
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification

/**
 * Android hands every notification to this service once you switch SplitIT on in Notification
 * access. It stops at once, before reading a word, unless capture is on and the notification is
 * from an app on the list you agreed to (a UPI app, a bank's app, the SMS app). What's left is
 * kept by [AlertStore] only if it is about money, and never leaves the phone.
 */
class AlertListener : NotificationListenerService() {
  override fun onListenerConnected() {
    AlertStore.connected(this)
  }

  override fun onListenerDisconnected() {
    AlertStore.disconnected(this)
  }

  override fun onNotificationPosted(sbn: StatusBarNotification?) {
    if (sbn == null || !AlertStore.wants(this, sbn.packageName)) return
    val notification = sbn.notification ?: return
    // A group's summary repeats its children ("3 new messages"): the children are read instead.
    if (notification.flags and Notification.FLAG_GROUP_SUMMARY != 0) return
    val extras = notification.extras ?: return
    val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString().orEmpty()
    val text = lastMessage(extras)
      ?: (extras.getCharSequence(Notification.EXTRA_BIG_TEXT) ?: extras.getCharSequence(Notification.EXTRA_TEXT))?.toString()
      ?: return
    AlertStore.add(this, sbn.packageName, title.trim().take(200), text.trim().take(1000), sbn.postTime)
  }

  /** An SMS app shows a conversation: the newest message in it is the alert. */
  private fun lastMessage(extras: Bundle): String? {
    @Suppress("DEPRECATION")
    val messages = extras.getParcelableArray(Notification.EXTRA_MESSAGES) ?: return null
    val last = messages.lastOrNull() as? Bundle ?: return null
    return last.getCharSequence("text")?.toString()
  }
}
