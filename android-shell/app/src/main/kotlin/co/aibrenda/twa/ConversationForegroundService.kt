package co.aibrenda.twa

import android.Manifest
import android.app.Notification
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.net.wifi.WifiManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat

/**
 * Part C, Layer 2 — keeps the conversation alive against the power button,
 * app switching, and aggressive OEM battery managers. Layer 1
 * (FLAG_KEEP_SCREEN_ON, handled in MainActivity) only covers screen timeout;
 * this layer is what survives the screen actually locking.
 *
 * Deliberately self-contained: every action here (starting, ending, the
 * notification's own "End conversation" button, and the safety timeout)
 * fully cleans up its own locks/notification without depending on
 * MainActivity being alive. [endRequestedListener] is a best-effort extra —
 * if it's set (Activity alive), the web page also gets told; if not, the
 * service still stops itself correctly.
 */
class ConversationForegroundService : Service() {

    companion object {
        const val ACTION_START = "co.aibrenda.twa.action.START_CONVERSATION"
        const val ACTION_END = "co.aibrenda.twa.action.END_CONVERSATION"
        const val ACTION_END_REQUESTED = "co.aibrenda.twa.action.END_REQUESTED"

        private const val NOTIFICATION_ID = 4201

        // Backstop only — a real conversation should never approach this.
        // Both the WakeLock's own acquire() timeout below and this handler
        // enforce it independently, so one implementation slipping doesn't
        // leave a lock stuck forever.
        private const val SAFETY_TIMEOUT_MS = 2 * 60 * 60 * 1000L // 2 hours

        /** Set/cleared by MainActivity in onCreate/onDestroy. Always call the
         *  end-requested action through the service (see [stop]/[requestEnd]
         *  companions) rather than relying on this alone — it's a bridge to
         *  the web page, not the source of truth for cleanup. */
        var endRequestedListener: (() -> Unit)? = null

        fun start(context: Context) {
            val intent = Intent(context, ConversationForegroundService::class.java)
                .setAction(ACTION_START)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }

        fun stop(context: Context) {
            context.startService(
                Intent(context, ConversationForegroundService::class.java).setAction(ACTION_END)
            )
        }
    }

    private var wakeLock: PowerManager.WakeLock? = null
    private var wifiLock: WifiManager.WifiLock? = null
    private val safetyHandler = Handler(Looper.getMainLooper())
    private val safetyTimeoutRunnable = Runnable { releaseLocksAndStop() }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START -> beginConversation()
            ACTION_END -> releaseLocksAndStop()
            ACTION_END_REQUESTED -> {
                // Notification's own "End conversation" tap. Tell the web
                // page if MainActivity is around to hear it, but release
                // and stop regardless — never depend on that call succeeding.
                try { endRequestedListener?.invoke() } catch (_: Exception) { }
                releaseLocksAndStop()
            }
        }
        return START_NOT_STICKY
    }

    private fun beginConversation() {
        // Android 14+ throws SecurityException if a "microphone" FGS starts
        // before RECORD_AUDIO is granted — and "conversation:start" arrives
        // before the page's getUserMedia() prompt. So start as mediaPlayback
        // only until the mic is granted; MainActivity calls start() again
        // after the grant, and this re-promotes to include "microphone"
        // (which is what keeps mic capture alive once the screen is off).
        val hasMic = ContextCompat.checkSelfPermission(
            this, Manifest.permission.RECORD_AUDIO
        ) == PackageManager.PERMISSION_GRANTED
        val types = if (hasMic) {
            ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE or
                ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK
        } else {
            ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK
        }
        ServiceCompat.startForeground(this, NOTIFICATION_ID, buildNotification(), types)
        acquireLocks()
        safetyHandler.removeCallbacks(safetyTimeoutRunnable)
        safetyHandler.postDelayed(safetyTimeoutRunnable, SAFETY_TIMEOUT_MS)
    }

    private fun acquireLocks() {
        if (wakeLock == null) {
            val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
            wakeLock = pm.newWakeLock(
                PowerManager.PARTIAL_WAKE_LOCK, "Brenda:ConversationWakeLock"
            ).apply {
                setReferenceCounted(false)
                acquire(SAFETY_TIMEOUT_MS)
            }
        }
        if (wifiLock == null) {
            val wm = applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
            // LOW_LATENCY only exists from API 29; minSdk is 26, so older
            // devices fall back to the (API-29-deprecated) HIGH_PERF mode.
            val lockType = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                WifiManager.WIFI_MODE_FULL_LOW_LATENCY
            } else {
                @Suppress("DEPRECATION")
                WifiManager.WIFI_MODE_FULL_HIGH_PERF
            }
            wifiLock = wm.createWifiLock(lockType, "Brenda:ConversationWifiLock").apply {
                setReferenceCounted(false)
                acquire()
            }
        }
    }

    private fun releaseLocksAndStop() {
        safetyHandler.removeCallbacks(safetyTimeoutRunnable)
        try {
            if (wakeLock?.isHeld == true) wakeLock?.release()
        } catch (_: Exception) { }
        wakeLock = null
        try {
            if (wifiLock?.isHeld == true) wifiLock?.release()
        } catch (_: Exception) { }
        wifiLock = null
        try {
            stopForeground(STOP_FOREGROUND_REMOVE)
        } catch (_: Exception) { }
        stopSelf()
    }

    override fun onDestroy() {
        // Process-death / unexpected-kill backstop — the screen/notification/
        // lock must never get stuck on, no matter how this service goes away.
        releaseLocksAndStop()
        super.onDestroy()
    }

    private fun buildNotification(): Notification {
        val contentIntent = packageManager.getLaunchIntentForPackage(packageName)?.let {
            PendingIntent.getActivity(
                this, 0, it,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
        }

        val endIntent = Intent(this, ConversationForegroundService::class.java)
            .setAction(ACTION_END_REQUESTED)
        val endPendingIntent = PendingIntent.getService(
            this, 0, endIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        return NotificationCompat.Builder(this, BrendaShellApplication.CONVERSATION_CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(getString(R.string.notif_title))
            .setContentText(getString(R.string.notif_text))
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setContentIntent(contentIntent)
            .addAction(0, getString(R.string.notif_action_end), endPendingIntent)
            .build()
    }
}
