package co.aibrenda.twa

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.view.WindowManager
import android.webkit.CookieManager
import android.webkit.JsResult
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.addCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.webkit.WebMessageCompat
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import co.aibrenda.twa.databinding.ActivityMainBinding
import org.json.JSONObject

/**
 * Single-activity WebView shell. See docs/ANDROID_SHELL.md for the full
 * architecture; the inline comments below map back to the Part B/C spec
 * headings they implement.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding

    /** True between a received "conversation:start" and "conversation:end"
     *  bridge message. Drives back-button behavior and whether WebView
     *  pausing is allowed in onPause/onStop (Part C). */
    private var isConversationActive = false

    /** Set while WebChromeClient.onPermissionRequest() is waiting on a
     *  runtime permission result, so the callback can grant/deny the
     *  original WebView request once we know the answer. */
    private var pendingWebPermissionRequest: PermissionRequest? = null

    private val micPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        val request = pendingWebPermissionRequest
        pendingWebPermissionRequest = null
        if (request == null) return@registerForActivityResult
        if (granted) {
            request.grant(arrayOf(PermissionRequest.RESOURCE_AUDIO_CAPTURE))
            // The service was started as mediaPlayback-only (mic not yet
            // granted); re-start it so it re-promotes to include "microphone".
            if (isConversationActive) ConversationForegroundService.start(this)
        } else {
            request.deny()
            showMicDenied()
        }
        // Asked only after the mic dialog closes — a second permission
        // request launched while one is showing is auto-cancelled.
        requestNotificationPermissionIfNeeded()
    }

    /** Android 13+: without this the "Brenda is listening" notification (and
     *  its "End conversation" action) is silently hidden. Denial is fine —
     *  the foreground service still runs, just without a visible notification. */
    private val notificationPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { /* no-op either way — see doc comment above */ }

    private fun requestNotificationPermissionIfNeeded() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return
        val granted = ContextCompat.checkSelfPermission(
            this, Manifest.permission.POST_NOTIFICATIONS
        ) == PackageManager.PERMISSION_GRANTED
        if (!granted) notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)
        fitContentBetweenSystemBars()

        // Best-effort bridge from the foreground service's notification
        // "End conversation" action back into the web page (Part C). The
        // service cleans itself up regardless of whether this fires — see
        // ConversationForegroundService's own doc comment.
        ConversationForegroundService.endRequestedListener = {
            runOnUiThread { postToWeb("conversation:endRequested") }
        }

        binding.retryButton.setOnClickListener {
            binding.offlineOverlay.visibility = android.view.View.GONE
            binding.webView.reload()
        }
        binding.openSettingsButton.setOnClickListener {
            val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                data = Uri.fromParts("package", packageName, null)
            }
            startActivity(intent)
        }

        configureWebView()
        binding.webView.loadUrl(BuildConfig.SERVER_BASE_URL)

        onBackPressedDispatcher.addCallback(this) {
            when {
                // Keep the conversation running in the background rather
                // than destroying the activity out from under it (Part B).
                isConversationActive -> moveTaskToBack(true)
                binding.webView.canGoBack() -> binding.webView.goBack()
                else -> {
                    isEnabled = false
                    onBackPressedDispatcher.onBackPressed()
                }
            }
        }
    }

    /** Last system-bar insets in CSS px, re-sent to the page after every
     *  page load (CSS custom properties set from here don't survive a
     *  navigation/reload). */
    private var safeTopCssPx = 0f
    private var safeBottomCssPx = 0f

    /** targetSdk 35+ forces edge-to-edge, so the page draws under the
     *  status bar, camera cutout and navigation bar. That's kept on purpose
     *  — Brenda's background image fills the whole screen — but the page is
     *  told the bar heights as CSS vars (--shell-safe-top/-bottom, used by
     *  .container's padding in styles.css) so buttons and text stay in the
     *  readable area. The keyboard is still handled natively: edge-to-edge
     *  disables adjustResize, so the WebView is padded by the IME height
     *  (otherwise the TEXT input would sit behind it). */
    private fun fitContentBetweenSystemBars() {
        WindowCompat.getInsetsController(window, binding.root).apply {
            isAppearanceLightStatusBars = true
            isAppearanceLightNavigationBars = true
        }
        ViewCompat.setOnApplyWindowInsetsListener(binding.root) { view, insets ->
            val bars = insets.getInsets(
                WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout()
            )
            val ime = insets.getInsets(WindowInsetsCompat.Type.ime())
            val imeVisible = ime.bottom > bars.bottom
            view.setPadding(bars.left, 0, bars.right, if (imeVisible) ime.bottom else 0)

            val density = resources.displayMetrics.density
            safeTopCssPx = bars.top / density
            // Keyboard open: the WebView already ends above it (and above
            // the nav bar), so no extra bottom inset inside the page.
            safeBottomCssPx = if (imeVisible) 0f else bars.bottom / density
            pushSafeAreaToPage()
            WindowInsetsCompat.CONSUMED
        }
    }

    private fun pushSafeAreaToPage() {
        val js = "(function(s){s.setProperty('--shell-safe-top','${safeTopCssPx}px');" +
            "s.setProperty('--shell-safe-bottom','${safeBottomCssPx}px');})" +
            "(document.documentElement.style);"
        binding.webView.evaluateJavascript(js, null)
    }

    @Suppress("SetJavaScriptEnabled")
    private fun configureWebView() {
        val webView = binding.webView
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false
            mixedContentMode = android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW
            // WebView otherwise multiplies every font by the phone's system
            // font scale (e.g. 1.15×) on top of CSS that's already sized
            // large for seniors. Pin to 100% so the CSS alone decides — same
            // as the page renders in Chrome/the old TWA.
            textZoom = 100
        }
        webView.settings.userAgentString = webView.settings.userAgentString +" BrendaAndroid/${BuildConfig.VERSION_NAME}"

        CookieManager.getInstance().setAcceptCookie(true)

        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)

        webView.webViewClient = BrendaWebViewClient()
        webView.webChromeClient = BrendaWebChromeClient()

        // Renderer keeps priority even when the app isn't visible, so a
        // backgrounded conversation doesn't get starved (Part C).
        webView.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, false)

        setUpNativeBridge(webView)
    }

    private fun setUpNativeBridge(webView: WebView) {
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            // Old WebView build on this device — the shell keep-alive bridge
            // simply won't activate. The page still loads and works as a
            // plain browser view; conversations just won't benefit from
            // Layers 1/2. Not fatal, so no user-facing error here.
            return
        }
        val allowedOrigins = if (BuildConfig.DEBUG) {
            setOf("https://aibrenda.co", BuildConfig.SERVER_BASE_URL)
        } else {
            setOf("https://aibrenda.co")
        }
        WebViewCompat.addWebMessageListener(
            webView,
            "BrendaNativeBridge",
            allowedOrigins,
        ) { _, message, _, _, _ ->
            val body = message.data ?: return@addWebMessageListener
            handleBridgeMessage(body)
        }
    }

    private fun handleBridgeMessage(raw: String) {
        val type = try {
            JSONObject(raw).optString("type")
        } catch (_: Exception) {
            return
        }
        when (type) {
            "conversation:start" -> {
                isConversationActive = true
                window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                ConversationForegroundService.start(this)
                // Mic already granted → no mic dialog will open, so it's safe
                // to ask for notifications now. Otherwise the mic callback
                // asks once that dialog closes.
                if (ContextCompat.checkSelfPermission(
                        this, Manifest.permission.RECORD_AUDIO
                    ) == PackageManager.PERMISSION_GRANTED
                ) requestNotificationPermissionIfNeeded()
            }
            "conversation:end" -> {
                isConversationActive = false
                window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                restoreBrightness()
                ConversationForegroundService.stop(this)
            }
            "screen:dim" -> setBrightness(0.05f)
            "screen:undim" -> restoreBrightness()
        }
    }

    private fun setBrightness(level: Float) {
        val params = window.attributes
        params.screenBrightness = level
        window.attributes = params
    }

    private fun restoreBrightness() {
        val params = window.attributes
        params.screenBrightness = WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE
        window.attributes = params
    }

    /** Native → web (Part C). No reply-proxy dependency, so this can fire at
     *  any time the WebView is alive, not just in response to a received
     *  message — e.g. from the foreground service's notification action. */
    private fun postToWeb(type: String) {
        val json = JSONObject().put("type", type).toString()
        val js = "window.dispatchEvent(new CustomEvent('brenda:native', " +
            "{ detail: $json }));"
        binding.webView.evaluateJavascript(js, null)
    }

    private fun showMicDenied() {
        binding.micDeniedOverlay.visibility = android.view.View.VISIBLE
    }

    override fun onResume() {
        super.onResume()
        binding.webView.onResume()
    }

    override fun onPause() {
        // Part C: never pause the WebView (or its timers) while a
        // conversation is active — only when nothing is running.
        if (!isConversationActive) {
            binding.webView.onPause()
        }
        CookieManager.getInstance().flush()
        super.onPause()
    }

    override fun onStop() {
        CookieManager.getInstance().flush()
        super.onStop()
    }

    override fun onDestroy() {
        // Safety net — if we're going away, never leave the screen pinned on.
        window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        ConversationForegroundService.endRequestedListener = null
        binding.webView.destroy()
        super.onDestroy()
    }

    private inner class BrendaWebViewClient : WebViewClient() {

        override fun shouldOverrideUrlLoading(
            view: WebView,
            request: WebResourceRequest
        ): Boolean {
            val url = request.url
            val scheme = url.scheme
            val host = url.host

            val isOwnDomain = host == "aibrenda.co" ||
                (BuildConfig.DEBUG && (host == "localhost" || host == "10.0.2.2"))

            if ((scheme == "http" || scheme == "https") && isOwnDomain) {
                return false // let the WebView load it
            }

            // Everything else — mailto:, other domains, etc. — hand off
            // externally rather than trying to load it in-app (Part B).
            return try {
                startActivity(Intent(Intent.ACTION_VIEW, url))
                true
            } catch (_: Exception) {
                true // no app can handle it; swallow rather than crash
            }
        }

        override fun onReceivedError(
            view: WebView,
            request: WebResourceRequest,
            error: WebResourceError
        ) {
            super.onReceivedError(view, request, error)
            if (request.isForMainFrame) {
                binding.offlineOverlay.visibility = android.view.View.VISIBLE
            }
        }

        override fun onPageFinished(view: WebView, url: String) {
            super.onPageFinished(view, url)
            binding.offlineOverlay.visibility = android.view.View.GONE
            pushSafeAreaToPage()
        }

        override fun onRenderProcessGone(
            view: WebView,
            detail: android.webkit.RenderProcessGoneDetail
        ): Boolean {
            // Default behavior is letting the whole app crash. Recreate
            // instead (Part B) — simplest reliable recovery for a
            // single-activity shell.
            recreate()
            return true
        }
    }

    private inner class BrendaWebChromeClient : WebChromeClient() {

        // Replaces WebView's default JS dialog header ("The page at
        // http://… says:") with the app name. Stopgap for the Android shell
        // only — the long-term plan is replacing alert()/confirm() in the
        // web app itself with Brenda-styled, per-message-titled popups.
        // OK/Cancel use android.R.string, so they follow the phone language.
        override fun onJsAlert(
            view: WebView, url: String?, message: String?, result: JsResult
        ): Boolean {
            if (isFinishing) return false
            AlertDialog.Builder(this@MainActivity)
                .setTitle(R.string.app_name)
                .setMessage(message)
                .setPositiveButton(android.R.string.ok) { _, _ -> result.confirm() }
                .setOnCancelListener { result.confirm() }
                .show()
            return true
        }

        override fun onJsConfirm(
            view: WebView, url: String?, message: String?, result: JsResult
        ): Boolean {
            if (isFinishing) return false
            AlertDialog.Builder(this@MainActivity)
                .setTitle(R.string.app_name)
                .setMessage(message)
                .setPositiveButton(android.R.string.ok) { _, _ -> result.confirm() }
                .setNegativeButton(android.R.string.cancel) { _, _ -> result.cancel() }
                .setOnCancelListener { result.cancel() }
                .show()
            return true
        }

        override fun onPermissionRequest(request: PermissionRequest) {
            val origin = request.origin.toString().trimEnd('/')
            val isOwnOrigin = origin == "https://aibrenda.co" ||
                (BuildConfig.DEBUG && origin == BuildConfig.SERVER_BASE_URL)

            val wantsAudioOnly = request.resources.size == 1 &&
                request.resources[0] == PermissionRequest.RESOURCE_AUDIO_CAPTURE

            if (!isOwnOrigin || !wantsAudioOnly) {
                request.deny()
                return
            }

            val hasRuntimePermission = ContextCompat.checkSelfPermission(
                this@MainActivity, Manifest.permission.RECORD_AUDIO
            ) == PackageManager.PERMISSION_GRANTED

            if (hasRuntimePermission) {
                request.grant(arrayOf(PermissionRequest.RESOURCE_AUDIO_CAPTURE))
            } else {
                pendingWebPermissionRequest = request
                micPermissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
            }
        }
    }
}
