package expo.modules.shareintent

import android.content.Intent
import android.net.Uri
import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * What another app shared to SplitIT: a payment message (text) or a screenshot or bill (an image).
 * The app reads the share that opened it once, at start (takeInitial), and hears shares that arrive
 * while it is open (onShare). Text is capped; an image is handed over as the content:// address the
 * sharing app granted, never copied here.
 */
class ShareIntentModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ShareIntent")

    Events("onShare")

    // The share the app was opened with, once: the intent is then made an ordinary launch, so a
    // reload doesn't add the same payment again.
    Function("takeInitial") {
      val activity = appContext.currentActivity ?: return@Function null
      val shared = read(activity.intent) ?: return@Function null
      activity.intent = Intent(Intent.ACTION_MAIN)
      shared
    }

    OnNewIntent { intent ->
      val shared = read(intent)
      if (shared != null) {
        sendEvent("onShare", shared)
      }
    }
  }

  private fun read(intent: Intent?): Map<String, Any?>? {
    if (intent == null || intent.action != Intent.ACTION_SEND) return null
    val type = intent.type ?: return null
    if (type.startsWith("text/")) {
      val text = intent.getStringExtra(Intent.EXTRA_TEXT) ?: return null
      return mapOf("kind" to "text", "text" to text.take(2000))
    }
    if (type.startsWith("image/")) {
      val uri: Uri? =
        if (Build.VERSION.SDK_INT >= 33) {
          intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java)
        } else {
          @Suppress("DEPRECATION")
          intent.getParcelableExtra<Uri>(Intent.EXTRA_STREAM)
        }
      return uri?.let { mapOf("kind" to "image", "uri" to it.toString(), "mimeType" to type) }
    }
    return null
  }
}
