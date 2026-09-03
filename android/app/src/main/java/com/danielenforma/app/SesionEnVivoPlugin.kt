package com.danielenforma.app

import android.content.Intent
import android.os.Build
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

/**
 * Puente React → SesionEnVivoService. Mismo nombre de plugin y misma API que
 * el `SesionEnVivoPlugin.swift` de iOS, para que `sesionEnVivo.ts` no tenga
 * que preguntar en qué plataforma está.
 */
@CapacitorPlugin(name = "SesionEnVivo")
class SesionEnVivoPlugin : Plugin() {

    private fun arranca(call: PluginCall) {
        val intent = Intent(context, SesionEnVivoService::class.java).apply {
            action = SesionEnVivoService.ACTION_START
            putExtra("exerciseName", call.getString("exerciseName", "tu ejercicio"))
            putExtra("exIdx", call.getInt("exIdx", 0) ?: 0)
            putExtra("setIdx", call.getInt("setIdx", 0) ?: 0)
            putExtra("setNumber", call.getInt("setNumber", 1) ?: 1)
            putExtra("setTotal", call.getInt("setTotal", 1) ?: 1)
            // El fin del descanso viaja en epoch MILISEGUNDOS, que es lo que
            // produce `Date.now()` en JS. `getDouble` y no `getInt`: un
            // timestamp en ms no cabe en un Int.
            putExtra("restEndsAt", (call.getDouble("restEndsAt") ?: 0.0).toLong())
            putExtra("restTotalSeconds", call.getInt("restTotalSeconds", 0) ?: 0)
            putExtra("reps", call.getInt("reps", 0) ?: 0)
            putExtra("weight", call.getDouble("weight") ?: 0.0)
            putExtra("rir", call.getInt("rir", 0) ?: 0)
            // Solo se ponen si existen: el servicio distingue "no hay
            // histórico" de "cero" con hasExtra, y esa diferencia es la que
            // decide si se enseña la línea de "la última vez".
            call.getInt("lastReps")?.let { putExtra("lastReps", it) }
            call.getDouble("lastWeight")?.let { putExtra("lastWeight", it) }
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(intent)
        else context.startService(intent)
        call.resolve()
    }

    @PluginMethod fun start(call: PluginCall) = arranca(call)

    /** `update` y `start` son lo mismo: el servicio ya reemplaza su estado y
     *  reutiliza la misma notificación, así que nunca hay dos tarjetas. */
    @PluginMethod fun update(call: PluginCall) = arranca(call)

    @PluginMethod
    fun stop(call: PluginCall) {
        context.startService(Intent(context, SesionEnVivoService::class.java).apply {
            action = SesionEnVivoService.ACTION_STOP
        })
        call.resolve()
    }

    @PluginMethod
    fun leerBuzon(call: PluginCall) {
        val toques = SesionEnVivoBuzon.vaciar(context)
        call.resolve(JSObject().put("toques", JSArray.from(toques)))
    }
}
