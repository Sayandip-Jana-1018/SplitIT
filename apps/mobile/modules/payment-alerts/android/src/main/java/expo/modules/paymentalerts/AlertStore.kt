package expo.modules.paymentalerts

import android.content.ComponentName
import android.content.Context
import android.provider.Settings
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import kotlin.math.abs

/**
 * What capture has noticed, kept in the app's own storage on this phone (no other app can read it,
 * and nothing here is ever sent anywhere): the 300 newest alerts about money from the last 14
 * days. Whether capture is on, and the apps it may read, are kept beside it.
 */
internal object AlertStore {
  private const val FILE = "payment-alerts.json"
  private const val KEEP_MS = 14L * 24 * 60 * 60 * 1000
  private const val MAX = 300
  private const val SAME_ALERT_MS = 10L * 60 * 1000

  /** About money: a sum ("Rs 450", "₹450", "INR 450") or a money verb before a number ("debited by 450.0"). */
  private val MONEY = Regex("""(?i)(?:\brs\.?|\binr\b|₹)\s*[0-9]|\b(?:debited|credited|sent|received|paid|spent|withdrawn|refunded)\b[^0-9\n]{0,24}[0-9]""")

  /** One-time codes are never kept, even from a bank (Android 15 hides most of them anyway). */
  private val CODE = Regex("""(?i)\botp\b|one[- ]time password|verification code|\bpasscode\b""")

  private fun prefs(context: Context) = context.getSharedPreferences("splitit.capture", Context.MODE_PRIVATE)

  /** Whether a notification from this app may be read at all. Checked before anything else. */
  fun wants(context: Context, app: String?): Boolean {
    if (app == null) return false
    val prefs = prefs(context)
    return prefs.getBoolean("capturing", false) && prefs.getStringSet("apps", emptySet())?.contains(app) == true
  }

  fun connected(context: Context) {
    prefs(context).edit().putLong("connectedAt", System.currentTimeMillis()).apply()
  }

  /** Android stopped handing notifications over (a phone that puts apps to sleep, or an update). */
  fun disconnected(context: Context) {
    prefs(context).edit().putLong("disconnectedAt", System.currentTimeMillis()).apply()
  }

  @Synchronized
  fun add(context: Context, app: String, title: String, text: String, at: Long) {
    if (text.isEmpty() || !MONEY.containsMatchIn("$title\n$text") || CODE.containsMatchIn("$title\n$text")) return
    val now = System.currentTimeMillis()
    val alerts = load(context).filter { now - it.optLong("at") < KEEP_MS }.toMutableList()
    // The same alert posted again (an app updating its notification): kept once.
    val again = alerts.any { it.optString("app") == app && it.optString("title") == title && it.optString("text") == text && abs(it.optLong("at") - at) < SAME_ALERT_MS }
    if (again) return
    alerts.add(
      JSONObject()
        .put("id", "$app:$at:${text.hashCode()}")
        .put("app", app)
        .put("title", title)
        .put("text", text)
        .put("at", at)
    )
    save(context, alerts.takeLast(MAX))
    prefs(context).edit().putLong("lastAt", now).apply()
    Notifier.maybeNotify(context, "$title\n$text", at)
  }

  @Synchronized
  fun list(context: Context): List<Map<String, Any?>> {
    val now = System.currentTimeMillis()
    return load(context)
      .filter { now - it.optLong("at") < KEEP_MS }
      .map { mapOf("id" to it.optString("id"), "app" to it.optString("app"), "title" to it.optString("title"), "text" to it.optString("text"), "at" to it.optLong("at").toDouble()) }
  }

  fun start(context: Context, apps: List<String>) {
    val prefs = prefs(context)
    prefs.edit()
      .putBoolean("capturing", true)
      .putStringSet("apps", apps.toSet())
      .putLong("since", prefs.getLong("since", 0L).takeIf { it > 0 } ?: System.currentTimeMillis())
      .apply()
  }

  /** Off, and everything it kept is deleted. */
  @Synchronized
  fun stop(context: Context) {
    prefs(context).edit().clear().apply()
    file(context).delete()
  }

  fun status(context: Context): Map<String, Any?> {
    val prefs = prefs(context)
    fun time(key: String) = prefs.getLong(key, 0L).takeIf { it > 0 }?.toDouble()
    return mapOf(
      "access" to hasAccess(context),
      "capturing" to prefs.getBoolean("capturing", false),
      "since" to time("since"),
      "lastAt" to time("lastAt"),
      "connectedAt" to time("connectedAt"),
      "disconnectedAt" to time("disconnectedAt"),
      "notify" to Notifier.enabled(context),
      "count" to list(context).size,
    )
  }

  fun hasAccess(context: Context): Boolean {
    val enabled = Settings.Secure.getString(context.contentResolver, "enabled_notification_listeners") ?: return false
    val me = ComponentName(context, AlertListener::class.java)
    return enabled.split(':').any { ComponentName.unflattenFromString(it) == me }
  }

  private fun file(context: Context) = File(context.filesDir, FILE)

  private fun load(context: Context): List<JSONObject> {
    val file = file(context)
    if (!file.exists()) return emptyList()
    return try {
      val array = JSONArray(file.readText())
      (0 until array.length()).mapNotNull { array.optJSONObject(it) }
    } catch (ignored: Exception) {
      emptyList()
    }
  }

  private fun save(context: Context, alerts: List<JSONObject>) {
    val file = file(context)
    val next = File(context.filesDir, "$FILE.new")
    next.writeText(JSONArray(alerts).toString())
    if (!next.renameTo(file)) {
      file.delete()
      next.renameTo(file)
    }
  }
}
