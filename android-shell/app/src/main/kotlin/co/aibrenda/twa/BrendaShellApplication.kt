package co.aibrenda.twa

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build

/**
 * Minimal Application subclass. Its only job is creating the notification
 * channel for the Layer 2 foreground service (Part C) once, at process
 * start, so ConversationForegroundService never has to worry about whether
 * the channel exists yet.
 */
class BrendaShellApplication : Application() {

    companion object {
        const val CONVERSATION_CHANNEL_ID = "brenda_conversation"
    }

    override fun onCreate() {
        super.onCreate()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val manager = getSystemService(NotificationManager::class.java)
            val channel = NotificationChannel(
                CONVERSATION_CHANNEL_ID,
                getString(R.string.notif_channel_name),
                NotificationManager.IMPORTANCE_LOW // low priority: no sound/heads-up,
                                                    // just a persistent, quiet indicator
            ).apply {
                description = getString(R.string.notif_channel_description)
                setShowBadge(false)
            }
            manager.createNotificationChannel(channel)
        }
    }
}
