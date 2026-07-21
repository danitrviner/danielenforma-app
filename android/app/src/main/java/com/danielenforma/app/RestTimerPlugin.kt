package com.danielenforma.app

import android.content.Intent
import android.os.Build
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

// Puente React → RestTimerService. Espejo de src/services/restTimer.ts:
// start(exerciseName, seconds) arranca el foreground service con la
// notificación persistente; stop() la retira si el atleta cancela el
// descanso a mano (p.ej. saltárselo) antes de que termine solo.
@CapacitorPlugin(name = "RestTimer")
class RestTimerPlugin : Plugin() {

    @PluginMethod
    fun start(call: PluginCall) {
        val exerciseName = call.getString("exerciseName", "tu ejercicio")
        val seconds = call.getInt("seconds", 0) ?: 0
        val intent = Intent(context, RestTimerService::class.java).apply {
            action = RestTimerService.ACTION_START
            putExtra(RestTimerService.EXTRA_EXERCISE_NAME, exerciseName)
            putExtra(RestTimerService.EXTRA_SECONDS, seconds)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(intent)
        } else {
            context.startService(intent)
        }
        call.resolve()
    }

    @PluginMethod
    fun stop(call: PluginCall) {
        val intent = Intent(context, RestTimerService::class.java).apply {
            action = RestTimerService.ACTION_STOP
        }
        context.startService(intent)
        call.resolve()
    }
}
