package tv.nuvio.webhost

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.os.Build
import android.webkit.SslErrorHandler
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity
import androidx.webkit.JavaScriptReplyProxy
import androidx.webkit.WebMessageCompat
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import org.json.JSONObject
import java.lang.ref.WeakReference

class MainActivity : AppCompatActivity() {
    private lateinit var webView: WebView
    private lateinit var trustedOrigin: String

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val appUri = Uri.parse(BuildConfig.WEB_APP_URL)
        require(appUri.scheme == "https" && !appUri.host.isNullOrBlank()) {
            "NUVIO_WEB_URL precisa ser uma URL HTTPS válida. Configure -PnuvioWebUrl ou a variável NUVIO_WEB_URL."
        }
        val appPort = effectiveHttpsPort(appUri)
        trustedOrigin = buildString {
            append("https://")
            append(appUri.host)
            if (appPort != 443) append(":").append(appPort)
        }

        webView = WebView(this)
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = false
            allowFileAccess = false
            allowContentAccess = false
            javaScriptCanOpenWindowsAutomatically = false
            setSupportMultipleWindows(false)
            mixedContentMode = android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW
            mediaPlaybackRequiresUserGesture = true
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) safeBrowsingEnabled = true
        }
        webView.webChromeClient = WebChromeClient()
        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val uri = request.url
                if (request.isForMainFrame && uri.scheme == "https" && uri.host == appUri.host && effectiveHttpsPort(uri) == appPort) {
                    return false
                }
                // External top-level navigation opens outside the privileged WebView. Frames are blocked.
                if (request.isForMainFrame && uri.scheme == "https") {
                    runCatching { startActivity(Intent(Intent.ACTION_VIEW, uri)) }
                }
                return true
            }

            override fun onReceivedSslError(view: WebView, handler: SslErrorHandler, error: android.net.http.SslError) {
                handler.cancel()
            }

            override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                super.onReceivedError(view, request, error)
            }
        }

        installOriginScopedBridge()
        activeWebView = WeakReference(webView)
        setContentView(webView)
        webView.loadUrl(BuildConfig.WEB_APP_URL)
    }

    private fun effectiveHttpsPort(uri: Uri): Int = if (uri.port == -1) 443 else uri.port

    private fun installOriginScopedBridge() {
        // Older Android System WebView builds still load the website, but leave native
        // playback unavailable rather than falling back to an unrestricted JS interface.
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER) ||
            !WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) return
        WebViewCompat.addWebMessageListener(
            webView,
            "NuvioAndroidHost",
            setOf(trustedOrigin),
            object : WebViewCompat.WebMessageListener {
                override fun onPostMessage(
                    view: WebView,
                    message: WebMessageCompat,
                    sourceOrigin: Uri,
                    isMainFrame: Boolean,
                    replyProxy: JavaScriptReplyProxy
                ) {
                    if (!isMainFrame || sourceOrigin.toString() != trustedOrigin) return
                    val data = runCatching { JSONObject(message.data ?: "") }.getOrNull() ?: return
                    when (data.optString("action")) {
                        "playMedia" -> {
                            val payload = data.optJSONObject("payload") ?: return
                            val url = payload.optString("url")
                            val title = payload.optString("title", "Nuvio").take(180)
                            val requestedEngine = payload.optString("engine", "auto").lowercase()
                            val uri = Uri.parse(url)
                            val validUrl = uri.scheme == "https" && !uri.host.isNullOrBlank() &&
                                uri.userInfo == null && url.length <= 2048
                            if (!validUrl || requestedEngine !in setOf("auto", "exoplayer", "libmpv")) {
                                replyProxy.postMessage(JSONObject().put("ok", false).put("error", "URL ou engine inválida.").toString())
                                return
                            }
                            runOnUiThread {
                                startActivity(Intent(this@MainActivity, NativePlayerActivity::class.java).apply {
                                    putExtra(NativePlayerActivity.EXTRA_URL, url)
                                    putExtra(NativePlayerActivity.EXTRA_TITLE, title)
                                    putExtra(NativePlayerActivity.EXTRA_ENGINE, requestedEngine)
                                })
                            }
                            replyProxy.postMessage(JSONObject().put("ok", true).put("engine", requestedEngine).toString())
                        }
                        "stopPlayback" -> runOnUiThread { NativePlayerActivity.closeCurrent() }
                        "pausePlayback" -> runOnUiThread { NativePlayerActivity.pauseCurrent() }
                        "resumePlayback" -> runOnUiThread { NativePlayerActivity.resumeCurrent() }
                        "seekTo" -> {
                            val seconds = data.optDouble("seconds", Double.NaN)
                            if (seconds.isFinite()) runOnUiThread { NativePlayerActivity.seekCurrent(seconds) }
                        }
                    }
                }
            }
        )

        val bootstrap = """
            (() => {
              const host = window.NuvioAndroidHost;
              if (!host || window.NuvioAndroid) return;
              const send = (action, values = {}) => host.postMessage(JSON.stringify({ action, ...values }));
              window.NuvioAndroid = {
                capabilities: () => JSON.stringify({ version: '1.0.4', engines: ['exoplayer', 'libmpv'], transport: 'https-direct' }),
                playMedia: (payload) => {
                  try {
                    const value = typeof payload === 'string' ? JSON.parse(payload) : payload;
                    send('playMedia', { payload: value });
                    return JSON.stringify({ ok: true });
                  } catch (error) { return JSON.stringify({ ok: false, error: 'Não foi possível enviar a solicitação ao player nativo.' }); }
                },
                stopPlayback: () => send('stopPlayback'),
                pausePlayback: () => send('pausePlayback'),
                resumePlayback: () => send('resumePlayback'),
                seekTo: (seconds) => send('seekTo', { seconds })
              };
            })();
        """.trimIndent()
        WebViewCompat.addDocumentStartJavaScript(webView, bootstrap, setOf(trustedOrigin))
    }

    override fun onBackPressed() {
        if (::webView.isInitialized && webView.canGoBack()) webView.goBack() else super.onBackPressed()
    }

    override fun onDestroy() {
        if (::webView.isInitialized) webView.destroy()
        activeWebView = null
        super.onDestroy()
    }

    companion object {
        @Volatile private var activeWebView: WeakReference<WebView>? = null

        fun notifyNativePlayerClosed() = dispatchPlayerEvent("nuvio-native-player-closed")

        fun notifyNativePlayerFailed() = dispatchPlayerEvent("nuvio-native-player-failed")

        private fun dispatchPlayerEvent(name: String) {
            val safeName = if (name == "nuvio-native-player-failed") name else "nuvio-native-player-closed"
            activeWebView?.get()?.post {
                activeWebView?.get()?.evaluateJavascript(
                    "window.dispatchEvent(new Event('$safeName'))", null
                )
            }
        }
    }
}
