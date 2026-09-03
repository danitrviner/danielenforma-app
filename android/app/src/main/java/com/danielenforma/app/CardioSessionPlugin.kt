package com.danielenforma.app

import android.content.Intent
import android.os.Build
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

// Puente React → CardioSessionService. Espejo de
// src/services/cardioLiveActivity.ts y de SesionEnVivoPlugin.kt: start()
// arranca el foreground service con la notificación persistente; update()
// la redibuja con el dato más reciente (el throttle de "cada 2s como mucho"
// vive en TypeScript, aquí se hace caso siempre); stop() la retira al
// guardar/descartar la sesión.
@CapacitorPlugin(name = "CardioSession")
class CardioSessionPlugin : Plugin() {

    private fun buildIntent(action: String, call: PluginCall): Intent {
        return Intent(context, CardioSessionService::class.java).apply {
            this.action = action
            putExtra(CardioSessionService.EXTRA_SESSION_TITLE, call.getString("sessionTitle", "Cardio"))
            putExtra(CardioSessionService.EXTRA_ELAPSED_SEC, call.getInt("elapsedSec", 0) ?: 0)
            putExtra(CardioSessionService.EXTRA_BPM, call.getInt("bpm", 0) ?: 0)
            putExtra(CardioSessionService.EXTRA_ZONE_LABEL, call.getString("zoneLabel", ""))
            putExtra(CardioSessionService.EXTRA_PHASE_TEXT, call.getString("phaseText", ""))
        }
    }

    @PluginMethod
    fun start(call: PluginCall) {
        val intent = buildIntent(CardioSessionService.ACTION_START, call)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(intent)
        } else {
            context.startService(intent)
        }
        call.resolve()
    }

    @PluginMethod
    fun update(call: PluginCall) {
        context.startService(buildIntent(CardioSessionService.ACTION_UPDATE, call))
        call.resolve()
    }

    @PluginMethod
    fun stop(call: PluginCall) {
        val intent = Intent(context, CardioSessionService::class.java).apply {
            action = CardioSessionService.ACTION_STOP
        }
        context.startService(intent)
        call.resolve()
    }
}
