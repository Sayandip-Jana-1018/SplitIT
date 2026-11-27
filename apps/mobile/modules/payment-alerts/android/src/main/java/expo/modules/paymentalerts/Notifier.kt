package expo.modules.paymentalerts

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import kotlin.math.abs

/**
 * "₹450 sent: split it or ignore it". When capture keeps an alert that moved money, a quiet
 * notification of SplitIT's own opens Payment capture's inbox. Only the amount and its direction
 * are shown; one payment's other alerts (the same amount within ten minutes) don't notify again.
 *
 * A deliberately small check: the full reader is the app's (src/lib/payments/alert.ts), which
 * decides what the inbox shows. This one only has to avoid a notification for an offer, a code,
 * a bill due or a failure, so it refuses the same kinds of text.
 */
internal object Notifier {
  private const val CHANNEL = "capture"
  private const val ID = 4100
  private const val SAME_PAYMENT_MS = 10L * 60 * 1000
  private const val LATE_ALERT_MS = 6L * 60 * 60 * 1000

  /** A UPI or bank reference in the text: such an alert names its own payment. */
  private val REFERENCE = Regex("""(?i)\b(ref|utr|rrn)\b|\b[0-9]{12}\b""")

  private val NOT_A_PAYMENT = Regex(
    """(?i)\botp\b|one[- ]time password|verification code|cash ?back|\boffer\b|\bwin\b|reward|coupon|voucher|discount|\bdeal\b|\bsale\b|\b(is|are|falls?|payment) due\b|\bdue (on|date|by)\b|\boverdue\b|minimum amount|total amount due|\bstatement\b|\bwill be (debited|deducted|charged)\b|\bscheduled\b|\bupcoming\b|\bmandate\b|\bfailed\b|\bdeclined\b|\bunsuccessful\b|\bnot (been )?(processed|completed)\b|\bcould not be\b|\binsufficient\b|\brequest(ed|s)? (money|payment|for)\b|\bcollect request\b|\bhas requested\b|\bpre-?approved\b|\bloan of\b|\beligible\b"""
  )
  private val DEBIT = Regex("""(?i)\b(debited|deducted|sent|paid|spent|withdrawn|withdrawal|purchase|transferred|charged)\b""")
  private val CREDIT = Regex("""(?i)\b(credited|received|deposited|refund(ed)?|reversed)\b""")
  private val SUM = Regex("""(?i)(?:\brs\.?|\binr\b|₹)\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)""")
  private val VERB_SUM = Regex("""(?i)\b(?:debited|credited)\s+(?:by|with|for)?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)""")
  private val BALANCE_BEFORE = Regex("""(?i)\b(bal|balance|avl|available|lmt|limit)\b[^0-9]{0,12}$""")

  private fun prefs(context: Context) = context.getSharedPreferences("splitit.capture", Context.MODE_PRIVATE)

  fun enabled(context: Context) = prefs(context).getBoolean("notify", true)

  fun setEnabled(context: Context, on: Boolean) {
    prefs(context).edit().putBoolean("notify", on).apply()
  }

  /** The sum moved: the first that isn't a balance or a limit, or SBI's "debited by 450.0". */
  private fun amountOf(text: String): String? {
    val sum = SUM.findAll(text).firstOrNull { !BALANCE_BEFORE.containsMatchIn(text.substring(maxOf(0, it.range.first - 24), it.range.first)) }
    val raw = sum?.groupValues?.get(1) ?: VERB_SUM.find(text)?.groupValues?.get(1) ?: return null
    return raw.removeSuffix(".00").removeSuffix(".0")
  }

  fun maybeNotify(context: Context, app: String, text: String, at: Long) {
    if (!enabled(context) || NOT_A_PAYMENT.containsMatchIn(text)) return
    val debit = DEBIT.find(text)
    val credit = CREDIT.find(text)
    if (debit == null && credit == null) return
    val sent = credit == null || (debit != null && debit.range.first < credit.range.first)
    val amount = amountOf(text) ?: return
    val prefs = prefs(context)
    val sameAmount = prefs.getString("notifiedAmount", null) == amount
    val gap = abs(at - prefs.getLong("notifiedAt", 0L))
    // One payment, one notification: its other alerts come within ten minutes, or, from another app
    // and with no reference of their own, hours later (PhonePe after the bank's SMS), as the inbox merges them.
    val late = gap < LATE_ALERT_MS && prefs.getString("notifiedApp", null) != app && !REFERENCE.containsMatchIn(text)
    if (sameAmount && (gap < SAME_PAYMENT_MS || late)) return
    prefs.edit().putString("notifiedAmount", amount).putLong("notifiedAt", at).putString("notifiedApp", app).apply()
    post(
      context,
      if (sent) "₹$amount sent" else "₹$amount received",
      if (sent) "Split it or ignore it in SplitIT." else "If someone paid you back, settle it up in SplitIT.",
    )
  }

  private fun post(context: Context, title: String, body: String) {
    val manager = context.getSystemService(NotificationManager::class.java) ?: return
    if (Build.VERSION.SDK_INT >= 33 && context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return
    if (Build.VERSION.SDK_INT >= 26) {
      val channel = NotificationChannel(CHANNEL, "Payments noticed", NotificationManager.IMPORTANCE_DEFAULT)
      channel.description = "When payment capture notices a payment, to split it or settle up."
      manager.createNotificationChannel(channel)
    }
    val open = Intent(Intent.ACTION_VIEW, Uri.parse("splitit://capture")).setPackage(context.packageName).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    val tap = PendingIntent.getActivity(context, ID, open, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    val icon = context.resources.getIdentifier("notification_icon", "drawable", context.packageName).takeIf { it != 0 } ?: context.applicationInfo.icon
    val builder =
      if (Build.VERSION.SDK_INT >= 26) {
        Notification.Builder(context, CHANNEL)
      } else {
        @Suppress("DEPRECATION")
        Notification.Builder(context)
      }
    val notification = builder
      .setSmallIcon(icon)
      .setContentTitle(title)
      .setContentText(body)
      .setContentIntent(tap)
      .setAutoCancel(true)
      .build()
    manager.notify(ID, notification)
  }
}
