package com.danielenforma.app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.os.Build
import android.os.IBinder
import android.os.SystemClock
import android.widget.RemoteViews
import androidx.core.app.NotificationCompat
import org.json.JSONObject
import java.util.Locale
import kotlin.math.max
import kotlin.math.min

/**
 * Notificación persistente de la sesión de entreno — la versión Android de la
 * actividad en vivo de iOS. Vive durante TODA la sesión, no solo durante el
 * descanso.
 *
 * ── Lo que cambia respecto a RestTimerService ─────────────────────────────
 * El servicio anterior tenía un `CountDownTimer` que renotificaba cada
 * segundo. Con la app en segundo plano Android estrangula esos ticks, así que
 * la cuenta atrás se quedaba clavada en cuanto se bloqueaba la pantalla — el
 * bug que había que arreglar. Ahora se le pasa al `Chronometer` el INSTANTE de
 * fin y lo cuenta el propio sistema: cero ticks nuestros, corre con la app
 * congelada.
 *
 * Los botones son `PendingIntent` a este mismo servicio. Funcionan desde la
 * pantalla de bloqueo sin desbloquear, que es justo el objetivo.
 */
class SesionEnVivoService : Service() {

    companion object {
        const val ACTION_START = "com.danielenforma.app.SESION_START"
        const val ACTION_STOP = "com.danielenforma.app.SESION_STOP"
        const val ACTION_CAMPO = "com.danielenforma.app.SESION_CAMPO"
        const val ACTION_HECHA = "com.danielenforma.app.SESION_HECHA"
        const val ACTION_MAS30 = "com.danielenforma.app.SESION_MAS30"
        const val ACTION_EMPEZAR_YA = "com.danielenforma.app.SESION_EMPEZAR_YA"

        const val EXTRA_CAMPO = "campo"
        const val EXTRA_SIGNO = "signo"

        private const val CHANNEL_ID = "sesion_en_vivo_channel"
        private const val NOTIFICATION_ID = 90001

        /** El sello GUARDADO vive 1,4 s, como en el handoff (§4). */
        private const val GUARDADO_MS = 1400L
    }

    /** Estado de la serie en curso. Espejo de `EstadoEnVivo` en TypeScript. */
    private data class Estado(
        var exerciseName: String = "tu ejercicio",
        var exIdx: Int = 0,
        var setIdx: Int = 0,
        var setNumber: Int = 1,
        var setTotal: Int = 1,
        /** Epoch ms. En el pasado = "a por la serie N". */
        var restEndsAt: Long = 0,
        var restTotalSeconds: Int = 0,
        var reps: Int = 0,
        var weight: Double = 0.0,
        var rir: Int = 0,
        var lastReps: Int? = null,
        var lastWeight: Double? = null,
        var guardadoEn: Long = 0,
    ) {
        val enDescanso: Boolean get() = restEndsAt > System.currentTimeMillis()
    }

    private var estado = Estado()

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP -> {
                stopForeground(STOP_FOREGROUND_REMOVE)
                stopSelf()
                return START_NOT_STICKY
            }
            ACTION_START -> leeEstado(intent)
            ACTION_CAMPO -> ajustaCampo(
                intent.getStringExtra(EXTRA_CAMPO) ?: return START_STICKY,
                intent.getIntExtra(EXTRA_SIGNO, 0),
            )
            ACTION_HECHA -> serieHecha()
            ACTION_MAS30 -> sumaDescanso(30)
            ACTION_EMPEZAR_YA -> {
                estado.restEndsAt = System.currentTimeMillis()
                anotaDescanso()
            }
            else -> return START_STICKY
        }
        publica()
        return START_STICKY
    }

    private fun leeEstado(intent: Intent) {
        estado = Estado(
            exerciseName = intent.getStringExtra("exerciseName") ?: "tu ejercicio",
            exIdx = intent.getIntExtra("exIdx", 0),
            setIdx = intent.getIntExtra("setIdx", 0),
            setNumber = intent.getIntExtra("setNumber", 1),
            setTotal = intent.getIntExtra("setTotal", 1),
            restEndsAt = intent.getLongExtra("restEndsAt", 0),
            restTotalSeconds = intent.getIntExtra("restTotalSeconds", 0),
            reps = intent.getIntExtra("reps", 0),
            weight = intent.getDoubleExtra("weight", 0.0),
            rir = intent.getIntExtra("rir", 0),
            lastReps = if (intent.hasExtra("lastReps")) intent.getIntExtra("lastReps", 0) else null,
            lastWeight = if (intent.hasExtra("lastWeight")) intent.getDoubleExtra("lastWeight", 0.0) else null,
        )
    }

    /** Pasos del §3.3: reps ±1 (0-30), peso ±2,5 kg (0-300), RIR ±1 (0-5). */
    private fun ajustaCampo(campo: String, signo: Int) {
        when (campo) {
            "reps" -> estado.reps = min(30, max(0, estado.reps + signo))
            "weight" -> estado.weight = min(300.0, max(0.0, estado.weight + signo * 2.5))
            "rir" -> estado.rir = min(5, max(0, estado.rir + signo))
        }
        estado.guardadoEn = System.currentTimeMillis()
        anota(JSONObject().apply {
            put("exIdx", estado.exIdx); put("setIdx", estado.setIdx)
            put("reps", estado.reps); put("weight", estado.weight); put("rir", estado.rir)
            put("updatedAt", System.currentTimeMillis().toDouble())
        })
    }

    /** Cierra la serie, relanza el descanso completo y avanza el contador. */
    private fun serieHecha() {
        val ahora = System.currentTimeMillis()
        val fin = ahora + estado.restTotalSeconds * 1000L
        anota(JSONObject().apply {
            put("exIdx", estado.exIdx); put("setIdx", estado.setIdx)
            put("reps", estado.reps); put("weight", estado.weight); put("rir", estado.rir)
            put("done", true); put("restEndsAt", fin.toDouble())
            put("updatedAt", ahora.toDouble())
        })
        estado.restEndsAt = fin
        // Lo apuntado pasa a ser el histórico de la siguiente serie.
        estado.lastReps = estado.reps
        estado.lastWeight = estado.weight
        if (estado.setNumber < estado.setTotal) { estado.setNumber++; estado.setIdx++ }
        estado.guardadoEn = ahora
    }

    private fun sumaDescanso(segundos: Int) {
        // Si ya había llegado a 0, se suma desde AHORA, no desde un fin que
        // quedó atrás.
        val base = max(System.currentTimeMillis(), estado.restEndsAt)
        estado.restEndsAt = base + segundos * 1000L
        estado.restTotalSeconds += segundos
        anotaDescanso()
    }

    private fun anotaDescanso() = anota(JSONObject().apply {
        put("exIdx", estado.exIdx); put("setIdx", estado.setIdx)
        put("restEndsAt", estado.restEndsAt.toDouble())
        put("updatedAt", System.currentTimeMillis().toDouble())
    })

    private fun anota(toque: JSONObject) = SesionEnVivoBuzon.anota(this, toque)

    // ── Notificación ──────────────────────────────────────────────────────

    private fun aseguraCanal() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = getSystemService(NotificationManager::class.java)
        if (manager.getNotificationChannel(CHANNEL_ID) != null) return
        // IMPORTANCE_DEFAULT y no HIGH: la tarjeta se actualiza en su sitio
        // decenas de veces por sesión y no puede sonar en cada toque. El aviso
        // de fin de descanso es una notificación programada aparte.
        val canal = NotificationChannel(CHANNEL_ID, "Sesión de entreno", NotificationManager.IMPORTANCE_DEFAULT)
        canal.description = "Serie en curso y descanso, en la pantalla de bloqueo"
        canal.setShowBadge(false)
        manager.createNotificationChannel(canal)
    }

    private fun pending(action: String, requestCode: Int, extras: (Intent) -> Unit = {}): PendingIntent {
        val intent = Intent(this, SesionEnVivoService::class.java).apply {
            this.action = action
            extras(this)
        }
        return PendingIntent.getService(
            this, requestCode, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }

    private fun vistas(): RemoteViews {
        val v = RemoteViews(packageName, R.layout.sesion_en_vivo)

        v.setTextViewText(R.id.ef_titulo,
            if (estado.enDescanso) "EN FORMA · DESCANSO" else "A POR LA SERIE ${estado.setNumber}")
        v.setTextColor(R.id.ef_titulo, if (estado.enDescanso) 0x73FFFFFF.toInt() else 0xFFFFC72C.toInt())

        // EL ARREGLO: base en el reloj monótono del sistema y cuenta atrás
        // llevada por el propio Chronometer. No hay ticks nuestros que
        // Android pueda estrangular con la pantalla apagada.
        val restanteMs = estado.restEndsAt - System.currentTimeMillis()
        v.setChronometer(R.id.ef_crono, SystemClock.elapsedRealtime() + restanteMs, null, true)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            v.setChronometerCountDown(R.id.ef_crono, estado.enDescanso)
        }
        // Pasado el fin cuenta hacia arriba, en gris: la tarjeta no
        // desaparece nunca sola (§3.2).
        v.setTextColor(R.id.ef_crono, if (estado.enDescanso) 0xFFFFC72C.toInt() else 0x73FFFFFF.toInt())

        v.setTextViewText(R.id.ef_ejercicio, estado.exerciseName)
        v.setTextViewText(R.id.ef_serie,
            "SERIE ${estado.setNumber} DE ${estado.setTotal} · DE ${minutos(estado.restTotalSeconds)}")

        val progreso = if (estado.restTotalSeconds <= 0) 0
        else (restanteMs * 100 / (estado.restTotalSeconds * 1000L)).toInt().coerceIn(0, 100)
        v.setProgressBar(R.id.ef_barra, 100, progreso, false)
        v.setViewVisibility(R.id.ef_barra, if (estado.enDescanso) android.view.View.VISIBLE else android.view.View.GONE)

        v.setTextViewText(R.id.ef_reps, estado.reps.toString())
        v.setTextViewText(R.id.ef_peso, peso(estado.weight))
        v.setTextViewText(R.id.ef_rir, estado.rir.toString())

        val r = estado.lastReps
        val w = estado.lastWeight
        if (r != null && w != null) {
            v.setTextViewText(R.id.ef_ultima, "ARRANCA DESDE LO DE LA ÚLTIMA VEZ · $r × ${peso(w)} KG")
            v.setViewVisibility(R.id.ef_ultima, android.view.View.VISIBLE)
        } else {
            // Sin histórico la línea se OMITE, no se inventa.
            v.setViewVisibility(R.id.ef_ultima, android.view.View.GONE)
        }

        val mostrarGuardado = System.currentTimeMillis() - estado.guardadoEn < GUARDADO_MS
        v.setViewVisibility(R.id.ef_guardado,
            if (mostrarGuardado) android.view.View.VISIBLE else android.view.View.GONE)

        // Un requestCode distinto por botón: con el mismo, Android reutiliza
        // el PendingIntent y los seis steppers acabarían haciendo lo mismo.
        var codigo = 100
        for ((campo, ids) in listOf(
            "reps" to (R.id.ef_reps_menos to R.id.ef_reps_mas),
            "weight" to (R.id.ef_peso_menos to R.id.ef_peso_mas),
            "rir" to (R.id.ef_rir_menos to R.id.ef_rir_mas),
        )) {
            v.setOnClickPendingIntent(ids.first, pending(ACTION_CAMPO, codigo++) {
                it.putExtra(EXTRA_CAMPO, campo); it.putExtra(EXTRA_SIGNO, -1)
            })
            v.setOnClickPendingIntent(ids.second, pending(ACTION_CAMPO, codigo++) {
                it.putExtra(EXTRA_CAMPO, campo); it.putExtra(EXTRA_SIGNO, 1)
            })
        }

        v.setOnClickPendingIntent(R.id.ef_mas30, pending(ACTION_MAS30, 200))
        if (estado.enDescanso) {
            v.setTextViewText(R.id.ef_principal, "EMPEZAR YA")
            v.setOnClickPendingIntent(R.id.ef_principal, pending(ACTION_EMPEZAR_YA, 201))
        } else {
            v.setTextViewText(R.id.ef_principal, "HECHA")
            v.setOnClickPendingIntent(R.id.ef_principal, pending(ACTION_HECHA, 202))
        }
        return v
    }

    private fun construye(): Notification {
        val abrir = packageManager.getLaunchIntentForPackage(packageName)
        val alTocar = PendingIntent.getActivity(
            this, 0, abrir,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val v = vistas()
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setCustomContentView(v)
            .setCustomBigContentView(v)
            .setStyle(NotificationCompat.DecoratedCustomViewStyle())
            .setOngoing(true)
            // Sin esto cada actualización vuelve a sonar y a vibrar: decenas
            // de veces por sesión.
            .setOnlyAlertOnce(true)
            // La tarjeta tiene que verse ENTERA en la pantalla de bloqueo:
            // es su razón de ser.
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setContentIntent(alTocar)
            .build()
    }

    private fun publica() {
        aseguraCanal()
        startForeground(NOTIFICATION_ID, construye())
    }

    private fun minutos(segundos: Int) = String.format(Locale.US, "%d:%02d", segundos / 60, segundos % 60)

    /** Coma decimal española y sin decimales cuando es redondo: `57,5`, `60`. */
    private fun peso(kg: Double): String =
        if (kg == kg.toLong().toDouble()) kg.toLong().toString()
        else String.format(Locale("es", "ES"), "%.1f", kg)
}
