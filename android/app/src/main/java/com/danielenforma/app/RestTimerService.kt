package com.danielenforma.app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.os.Build
import android.os.CountDownTimer
import android.os.IBinder
import androidx.core.app.NotificationCompat

// Foreground service que sostiene el temporizador de descanso en la barra de
// notificaciones mientras la app está en segundo plano o la pantalla
// bloqueada — la versión Android del "widget de pantalla de bloqueo" del
// plan (§6.1). Arrancado/parado desde RestTimerPlugin.kt (puente Capacitor).
class RestTimerService : Service() {

    companion object {
        const val ACTION_START = "com.danielenforma.app.RESTTIMER_START"
        const val ACTION_STOP = "com.danielenforma.app.RESTTIMER_STOP"
        const val EXTRA_EXERCISE_NAME = "exerciseName"
        const val EXTRA_SECONDS = "seconds"
        private const val CHANNEL_ID = "rest_timer_channel"
        private const val NOTIFICATION_ID = 90001
    }

    private var countDownTimer: CountDownTimer? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP -> {
                stopSelf()
                return START_NOT_STICKY
            }
            ACTION_START -> {
                val exerciseName = intent.getStringExtra(EXTRA_EXERCISE_NAME) ?: "tu ejercicio"
                val seconds = intent.getIntExtra(EXTRA_SECONDS, 0)
                startTimer(exerciseName, seconds)
            }
        }
        return START_NOT_STICKY
    }

    private fun ensureChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = getSystemService(NotificationManager::class.java)
        if (manager.getNotificationChannel(CHANNEL_ID) != null) return
        val channel = NotificationChannel(CHANNEL_ID, "Descanso entre series", NotificationManager.IMPORTANCE_HIGH)
        channel.description = "Cuenta atrás del descanso durante el entrenamiento"
        manager.createNotificationChannel(channel)
    }

    private fun buildNotification(exerciseName: String, secondsLeft: Int): Notification {
        val openAppIntent = packageManager.getLaunchIntentForPackage(packageName)
        val contentIntent = PendingIntent.getActivity(
            this, 0, openAppIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val mins = secondsLeft / 60
        val secs = secondsLeft % 60
        val timeStr = String.format("%d:%02d", mins, secs)
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(if (secondsLeft > 0) "Descanso — $timeStr" else "¡Descanso terminado!")
            .setContentText("Siguiente: $exerciseName")
            .setOngoing(secondsLeft > 0)
            .setOnlyAlertOnce(true)
            .setContentIntent(contentIntent)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .build()
    }

    private fun startTimer(exerciseName: String, seconds: Int) {
        ensureChannel()
        countDownTimer?.cancel()
        startForeground(NOTIFICATION_ID, buildNotification(exerciseName, seconds))

        if (seconds <= 0) { stopSelf(); return }

        countDownTimer = object : CountDownTimer(seconds * 1000L, 1000L) {
            override fun onTick(millisUntilFinished: Long) {
                val secondsLeft = (millisUntilFinished / 1000L).toInt()
                val manager = getSystemService(NotificationManager::class.java)
                manager.notify(NOTIFICATION_ID, buildNotification(exerciseName, secondsLeft))
            }

            override fun onFinish() {
                val manager = getSystemService(NotificationManager::class.java)
                manager.notify(NOTIFICATION_ID, buildNotification(exerciseName, 0))
                // Se queda unos segundos visible como aviso de "listo" y luego se retira sola.
                android.os.Handler(mainLooper).postDelayed({ stopSelf() }, 4000)
            }
        }.start()
    }

    override fun onDestroy() {
        countDownTimer?.cancel()
        super.onDestroy()
    }
}
