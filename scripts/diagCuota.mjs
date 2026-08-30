/* Consumo real de lectura de Firestore, día a día.
 *
 * Va contra Cloud Monitoring, NO contra Firestore: no gasta cuota, y funciona
 * aunque la base esté cortada.
 *
 * OJO CON LA MÉTRICA (aprendido a las malas el 2026-08-30):
 *
 *  · `api/billable_realtime_read_units` mide lo FACTURABLE. En una base con
 *    tramo gratuito eso es casi cero SIEMPRE — daba 99/día el mismo día que la
 *    base estaba cortada por exceso de cuota. Sirve para la factura, no para
 *    saber si te acercas al tope. No la uses aquí.
 *  · `read_units_per_project` no existe en este proyecto (404).
 *  · `document/read_count` es la que refleja el consumo real. Es la que se usa.
 *
 * Matiz: el tope del tramo gratuito se cuenta en UNIDADES de lectura (tramos de
 * 4 KiB), no en documentos, así que este número es un suelo — las unidades
 * reales son iguales o mayores. Una consulta que escanea una colección grande
 * gasta miles de unidades devolviendo pocos documentos.
 *
 * Tope del grupo «AI shared quota» de AI Studio: 50.000/día. Al llegar, la base
 * se PAUSA en vez de cobrar.
 *
 * Uso: node scripts/diagCuota.mjs [dias]
 */
import { readFileSync } from 'fs';
import { GoogleAuth } from 'google-auth-library';

const sa = JSON.parse(readFileSync(new URL('../serviceAccount.json', import.meta.url), 'utf8'));
const cfg = JSON.parse(readFileSync(new URL('../firebase-applet-config.json', import.meta.url), 'utf8'));
const DIAS = Number(process.argv[2] || 14);
const TOPE = 50_000;

const auth = new GoogleAuth({
  credentials: sa,
  scopes: ['https://www.googleapis.com/auth/monitoring.read'],
});
const client = await auth.getClient();

const fin = new Date();
const ini = new Date(fin.getTime() - DIAS * 86400_000);

const url =
  `https://monitoring.googleapis.com/v3/projects/${cfg.projectId}/timeSeries` +
  `?filter=${encodeURIComponent('metric.type="firestore.googleapis.com/document/read_count"')}` +
  `&interval.startTime=${ini.toISOString()}&interval.endTime=${fin.toISOString()}` +
  `&aggregation.alignmentPeriod=86400s` +
  `&aggregation.perSeriesAligner=ALIGN_SUM` +
  `&aggregation.crossSeriesReducer=REDUCE_SUM`;

const { data } = await client.request({ url });
const puntos = (data.timeSeries?.[0]?.points ?? [])
  .map(p => ({
    dia: p.interval.startTime.slice(0, 10),
    n: Number(p.value.int64Value ?? p.value.doubleValue ?? 0),
  }))
  .sort((a, b) => a.dia.localeCompare(b.dia));

if (!puntos.length) { console.log('Sin datos de la métrica (¿permiso de monitoring en la cuenta de servicio?)'); process.exit(0); }

console.log(`Documentos leídos de Firestore por día — tope del tramo gratuito: ${TOPE.toLocaleString('es')}\n`);
for (const { dia, n } of puntos) {
  const pct = (n / TOPE) * 100;
  const barra = '█'.repeat(Math.min(40, Math.round(pct / 2.5)));
  console.log(`${dia}  ${String(n).padStart(7)}  ${pct.toFixed(1).padStart(5)}%  ${barra}${pct >= 99 ? '  ← TOPE' : ''}`);
}

const hoy = puntos[puntos.length - 1];
console.log(
  `\nHoy (${hoy.dia}): ${hoy.n.toLocaleString('es')} documentos leídos.` +
  (hoy.n >= TOPE * 0.99
    ? '\n\nSuperado el tope. Si la base se ha CORTADO en vez de facturar, sigue en el\n' +
      'grupo «AI shared quota» de AI Studio — el «Upgrade database» no ha surtido efecto.'
    : '\n\nPor debajo del tope.')
);
