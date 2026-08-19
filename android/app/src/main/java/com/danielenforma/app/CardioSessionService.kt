package com.danielenforma.app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat

// Foreground service que sostiene la sesión de cardio en la barra de
// notificaciones mientras la app está en segundo plano o la pantalla
// bloqueada — F5 del plan de réplica FITIV, la versión Android de
// "la sesión sobrevive al bolsillo". Arrancado/parado/actualizado desde
// CardioSessionPlugin.kt.
//
// Diferencias con RestTimerService.kt, que sostiene el descanso entre
// series (no se toca: está en producción):
// - El cronómetro SUBE (sesión en curso), no baja — no hay CountDownTimer
//   aquí, la app manda el tiempo transcurrido en cada `update()` desde su
//   propio reloj de pared (mismo motor que ya lleva la cuenta en
//   useCardioSession.tsx); el service solo redibuja la notificación con el
//   último dato recibido, no lleva su propio cronómetro.
// - `START_STICKY`, no `START_NOT_STICKY`: si Android mata el proceso para
//   liberar memoria durante una sesión larga, interesa que el sistema
//   intente revivirlo — al contrario que un descanso de 90s, una sesión de
//   cardio de 40 min sí merece ese esfuerzo.
// - Notificación con ID y canal propios (90002 / cardio_session_channel):
//   90001 ya lo usa el descanso entre series, y las dos pueden coexistir
//   (cardio + fuerza en la misma sesión de app no es el caso normal, pero
//   compartir ID borraría una notificación con la otra sin avisar).
class CardioSessionService : Service() {

    companion object {
        const val ACTION_START = "com.danielenforma.app.CARDIO_START"
        const val ACTION_UPDATE = "com.danielenforma.app.CARDIO_UPDATE"
        const val ACTION_STOP = "com.danielenforma.app.CARDIO_STOP"
        const val EXTRA_SESSION_TITLE = "sessionTitle"
        const val EXTRA_ELAPSED_SEC = "elapsedSec"
        const val EXTRA_BPM = "bpm"
        const val EXTRA_ZONE_LABEL = "zoneLabel"
        const val EXTRA_PHASE_TEXT = "phaseText"
        private const val CHANNEL_ID = "cardio_session_channel"
        private const val NOTIFICATION_ID = 90002
    }

    private var sessionTitle = "Cardio"

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP -> {
                stopSelf()
                return START_NOT_STICKY
            }
            ACTION_START, ACTION_UPDATE -> {
                sessionTitle = intent.getStringExtra(EXTRA_SESSION_TITLE) ?: sessionTitle
                val elapsedSec = intent.getIntExtra(EXTRA_ELAPSED_SEC, 0)
                val bpm = intent.getIntExtra(EXTRA_BPM, 0)
                val zoneLabel = intent.getStringExtra(EXTRA_ZONE_LABEL) ?: ""
                val phaseText = intent.getStringExtra(EXTRA_PHASE_TEXT) ?: ""
                ensureChannel()
                val notification = buildNotification(elapsedSec, bpm, zoneLabel, phaseText)
                if (intent.action == ACTION_START) {
                    startForeground(NOTIFICATION_ID, notification)
                } else {
                    getSystemService(NotificationManager::class.java).notify(NOTIFICATION_ID, notification)
                }
            }
        }
        return START_STICKY
    }

    private fun ensureChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = getSystemService(NotificationManager::class.java)
        if (manager.getNotificationChannel(CHANNEL_ID) != null) return
        val channel = NotificationChannel(CHANNEL_ID, "Sesión de cardio", NotificationManager.IMPORTANCE_HIGH)
        channel.description = "Frecuencia cardíaca y cronómetro mientras dura la sesión de cardio"
        manager.createNotificationChannel(channel)
    }

    private fun buildNotification(elapsedSec: Int, bpm: Int, zoneLabel: String, phaseText: String): Notification {
        val openAppIntent = packageManager.getLaunchIntentForPackage(packageName)
        val contentIntent = PendingIntent.getActivity(
            this, 0, openAppIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val mins = elapsedSec / 60
        val secs = elapsedSec % 60
        val timeStr = String.format("%d:%02d", mins, secs)
        val text = if (phaseText.isNotEmpty()) phaseText else if (zoneLabel.isNotEmpty()) "$bpm ppm · $zoneLabel" else "$bpm ppm"
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle("$sessionTitle — $timeStr")
            .setContentText(text)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setContentIntent(contentIntent)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .build()
    }

    override fun onDestroy() {
        super.onDestroy()
    }
}
