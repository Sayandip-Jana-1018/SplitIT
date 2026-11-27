package expo.modules.paymentalerts

import android.content.ActivityNotFoundException
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.service.notification.NotificationListenerService
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * The app's side of payment capture: whether it's on and has access, what it has kept, turning it
 * on (with the apps it may read) and off (deleting everything), and the two system screens it
 * needs: Notification access, and App info for "Allow restricted settings" on a sideloaded app.
 */
class PaymentAlertsModule : Module() {
  private val context: Context
    get() = requireNotNull(appContext.reactContext) { "SplitIT isn't ready yet" }

  override fun definition() = ModuleDefinition {
    Name("PaymentAlerts")

    Function("status") { AlertStore.status(context) }

    Function("list") { AlertStore.list(context) }

    Function("start") { apps: List<String> ->
      AlertStore.start(context, apps)
      // If access was already given, make sure Android is handing notifications over.
      rebind()
      Unit
    }

    Function("stop") { AlertStore.stop(context) }

    /** Asks Android to hand notifications over again, after it paused the listener. */
    Function("rebind") { rebind() }

    /** Whether a "payment noticed" notification is shown. */
    Function("setNotify") { on: Boolean -> Notifier.setEnabled(context, on) }

    Function("openAccessSettings") {
      val component = ComponentName(context, AlertListener::class.java).flattenToString()
      val direct =
        if (Build.VERSION.SDK_INT >= 30) {
          Intent(Settings.ACTION_NOTIFICATION_LISTENER_DETAIL_SETTINGS).putExtra(Settings.EXTRA_NOTIFICATION_LISTENER_COMPONENT_NAME, component)
        } else {
          Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)
        }
      open(direct) || open(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))
    }

    Function("openAppInfo") {
      open(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", context.packageName, null)))
    }
  }

  private fun rebind(): Boolean {
    if (!AlertStore.hasAccess(context)) return false
    return try {
      NotificationListenerService.requestRebind(ComponentName(context, AlertListener::class.java))
      true
    } catch (ignored: Exception) {
      false
    }
  }

  private fun open(intent: Intent): Boolean =
    try {
      val activity = appContext.currentActivity
      if (activity != null) activity.startActivity(intent) else context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
      true
    } catch (ignored: ActivityNotFoundException) {
      false
    }
}
