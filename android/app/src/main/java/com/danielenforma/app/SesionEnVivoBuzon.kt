package com.danielenforma.app

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/**
 * Buzón compartido entre la notificación y el WebView.
 *
 * Equivalente Android de `EnFormaBuzon.swift`. Aquí el servicio y el WebView
 * viven en el MISMO proceso, así que técnicamente bastaría una variable — pero
 * el sistema puede matar el proceso entre que el atleta pulsa `+` en la
 * pantalla de bloqueo y vuelve a abrir la app. Con una variable, esos toques
 * se perderían justo en el caso que este bloque venía a arreglar.
 *
 * Cada toque describe el VALOR FINAL de la celda, no un incremento: aplicarlo
 * dos veces da el mismo resultado.
 */
object SesionEnVivoBuzon {
    private const val PREFS = "enforma_sesion_en_vivo"
    private const val CLAVE = "toques_pendientes"

    private fun prefs(ctx: Context) = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun anota(ctx: Context, toque: JSONObject) {
        val actuales = leer(ctx)
        actuales.put(toque)
        // Tope de seguridad: sin esto, una app que pasa días sin abrirse
        // acumularía toques sin fin.
        val recortado = if (actuales.length() > 200) {
            JSONArray().apply {
                for (i in actuales.length() - 200 until actuales.length()) put(actuales.get(i))
            }
        } else actuales
        prefs(ctx).edit().putString(CLAVE, recortado.toString()).apply()
    }

    fun leer(ctx: Context): JSONArray =
        try { JSONArray(prefs(ctx).getString(CLAVE, "[]")) } catch (e: Exception) { JSONArray() }

    /** Lee y vacía: cada toque se aplica una sola vez. */
    fun vaciar(ctx: Context): JSONArray {
        val toques = leer(ctx)
        prefs(ctx).edit().remove(CLAVE).apply()
        return toques
    }
}
