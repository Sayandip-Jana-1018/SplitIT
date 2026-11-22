package expo.modules.textreader

import android.net.Uri
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Reads the text in a photo on the phone (Google ML Kit, Latin script), with no connection: every
 * recognised line with its box on the photo, so the app can put a bill's columns back into rows
 * (src/lib/receiptRows.ts). The photo is read where it is (a file:// or content:// address).
 */
class TextReaderModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("TextReader")

    AsyncFunction("read") { uri: String, promise: Promise ->
      val context = appContext.reactContext
      if (context == null) {
        promise.reject("E_NOT_READY", "The app isn't ready to read photos yet.", null)
        return@AsyncFunction
      }
      val image = try {
        InputImage.fromFilePath(context, Uri.parse(uri))
      } catch (error: Exception) {
        promise.reject("E_IMAGE", "That photo couldn't be opened.", error)
        return@AsyncFunction
      }
      val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
      recognizer.process(image)
        .addOnSuccessListener { text ->
          val lines = ArrayList<Map<String, Any>>()
          for (block in text.textBlocks) {
            for (line in block.lines) {
              val box = line.boundingBox ?: continue
              lines.add(mapOf("text" to line.text, "left" to box.left, "top" to box.top, "right" to box.right, "bottom" to box.bottom))
            }
          }
          promise.resolve(lines)
        }
        .addOnFailureListener { error -> promise.reject("E_READ", "That photo couldn't be read.", error) }
        .addOnCompleteListener { recognizer.close() }
    }
  }
}
