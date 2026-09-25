import React, { useMemo, useState } from 'react';
import type { DietMode, MealItem } from '../../types';
import { Sheet, Button, Input, Banner, Icon, SegmentedControl } from '../ui';
import GuiaDeEtiquetas from './GuiaDeEtiquetas';
import {
  calcularAlimento,
  etiquetaDeBanco,
  TEXTO_DE_AVISO,
  type MacrosPorCien,
} from '../../utils/alimentoDesdeMacros';
import { CAT_LABEL, CAT_BG, CAT_COLOR, fmtQty, foodNameWithoutGrams } from '../../utils/exchangeHelpers';

/* ═══════════════════════════════════════════════════════════════════════════
   Crear un alimento a partir de su etiqueta

   Lo que se le pide a quien la abre es lo que pone en el envase y nada más:
   nombre, kcal y macros por 100 g. La categoría y los gramos que hacen un
   intercambio NO se preguntan — los calcula `utils/alimentoDesdeMacros` y se
   enseñan mientras se escribe, para que se vea lo que va a entrar en el banco
   antes de guardarlo.

   El desglose por macro está a la vista a propósito. Es lo que hace la hoja de
   cálculo de Dani y es lo que explica la decisión: "0,80 de hidrato, 0,14 de
   proteína y 0,05 de grasa" dice por qué esto acaba en HC mucho mejor que la
   palabra "HC" sola.
   ═══════════════════════════════════════════════════════════════════════════ */

const VACIO = { nombre: '', kcal: '', hc: '', prot: '', grasa: '' };

/** Acepta la coma decimal: en un móvil español es lo que sale del teclado. */
function aNumero(texto: string): number {
  const n = parseFloat(texto.replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/** Rellena el formulario con un alimento que ya existe, para editarlo.
 *
 *  Los macros salen de `porCien`, que es lo que se tecleó al crearlo: así se
 *  corrige un dígito mal puesto sin volver a copiar la etiqueta entera. El
 *  nombre se saca quitándole los gramos del principio —van dentro de `label`
 *  porque es de ahí de donde los lee la app— para que el campo enseñe el
 *  nombre a secas y los gramos se recalculen solos. */
function desdeAlimento(item: MealItem | undefined): { form: typeof VACIO; unidad: 'g' | 'ml' } {
  if (!item) return { form: VACIO, unidad: 'g' };
  const n = (v: number | undefined) => (v == null ? '' : String(v));
  return {
    form: {
      nombre: foodNameWithoutGrams(item.label),
      kcal: n(item.porCien?.kcal),
      hc: n(item.porCien?.hc),
      prot: n(item.porCien?.prot),
      grasa: n(item.porCien?.grasa),
    },
    unidad: /\d\s*ml\b/i.test(item.label) ? 'ml' : 'g',
  };
}

interface Props {
  /** Modo de dieta al que se añade — el que el atleta tenga activo. */
  mode: DietMode;
  onClose: () => void;
  onGuardar: (data: Omit<MealItem, 'id'>) => Promise<void>;
  /** Dónde va a acabar el alimento, para decirlo en la hoja sin ambigüedad. */
  destino: 'personal' | 'banco';
  /** Alimento que se está editando. Sin esto, la hoja crea uno nuevo. */
  editando?: MealItem;
  /** Borrar el alimento que se está editando. Solo se pinta si se pasa. */
  onEliminar?: () => void;
}

export default function CrearAlimentoSheet({ mode, onClose, onGuardar, destino, editando, onEliminar }: Props) {
  const inicial = useMemo(() => desdeAlimento(editando), [editando]);
  const [form, setForm] = useState(inicial.form);
  const [unidad, setUnidad] = useState<'g' | 'ml'>(inicial.unidad);
  const [guardando, setGuardando] = useState(false);
  const [guiaAbierta, setGuiaAbierta] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const macros: MacrosPorCien = useMemo(() => ({
    kcal: aNumero(form.kcal),
    hc: aNumero(form.hc),
    prot: aNumero(form.prot),
    grasa: aNumero(form.grasa),
  }), [form]);

  const calculo = useMemo(() => calcularAlimento(macros), [macros]);

  const sinDatos = calculo.avisos.includes('sin-datos');
  const puedeGuardar = !!form.nombre.trim() && !sinDatos && !guardando;

  const set = (campo: keyof typeof VACIO) => (valor: string) =>
    setForm(f => ({ ...f, [campo]: valor }));

  const guardar = async () => {
    if (!puedeGuardar) return;
    setGuardando(true);
    setError(null);
    try {
      await onGuardar({
        mode,
        category: calculo.category,
        // Los gramos van DENTRO del nombre porque es de ahí de donde los lee
        // toda la app (`parseBaseGrams`). Sin eso el alimento entra mudo: sin
        // peso en el plan y sin gramaje para el generador de menús.
        label: etiquetaDeBanco(form.nombre, calculo.gramosPorIntercambio, unidad),
        porCien: macros,
        gramosPorIntercambio: calculo.gramosPorIntercambio,
      });
      onClose();
    } catch {
      // Un fallo de permisos llega hasta aquí: el alimento NO se ha guardado en
      // ningún sitio del que se vaya a poder leer luego, así que la hoja se
      // queda abierta con lo escrito en vez de cerrarse fingiendo que sí.
      setError('No se ha podido guardar. Comprueba la conexión y vuelve a intentarlo.');
      setGuardando(false);
    }
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={editando ? 'Editar alimento' : 'Crear alimento'}
      alto="completo"
      footer={
        <Button onClick={guardar} disabled={!puedeGuardar} fullWidth>
          {guardando ? 'Guardando…' : editando ? 'Guardar cambios' : 'Guardar alimento'}
        </Button>
      }
    >
      <div className="space-y-5 pt-2">
        <p className="font-sans text-body-s text-ink-2">
          {editando
            ? `Corrige lo que haga falta. Los gramos del intercambio y el grupo se vuelven a calcular solos.`
            : `Copia lo que pone la etiqueta por 100 ${unidad}. Los gramos que son un intercambio y el grupo al que pertenece se calculan solos.`}
        </p>

        {/* Al editar, el grupo puede cambiar: si tocas los macros lo bastante,
            un alimento deja de ser proteína y pasa a mixto. Vale avisar de que
            eso va a pasar, porque el atleta lo tiene ya colocado en comidas. */}
        {editando && editando.category !== calculo.category && !sinDatos && (
          <Banner tone="info">
            Con estos datos cambia de grupo: de {CAT_LABEL[editando.category]} a {CAT_LABEL[calculo.category]}.
          </Banner>
        )}

        <Input
          label="Nombre del alimento"
          value={form.nombre}
          onChange={set('nombre')}
          placeholder="Pan de centeno Mercadona"
          required
        />

        <SegmentedControl
          label="Unidad de medida"
          value={unidad}
          onChange={(v) => setUnidad(v as 'g' | 'ml')}
          options={[
            { value: 'g', label: 'Sólido (g)' },
            { value: 'ml', label: 'Líquido (ml)' },
          ]}
        />

        <div className="grid grid-cols-2 gap-3">
          <Input
            label={`Kcal / 100 ${unidad}`}
            value={form.kcal}
            onChange={set('kcal')}
            inputMode="decimal"
            placeholder="250"
          />
          <Input
            label={`Hidratos / 100 ${unidad}`}
            value={form.hc}
            onChange={set('hc')}
            inputMode="decimal"
            placeholder="49"
          />
          <Input
            label={`Proteínas / 100 ${unidad}`}
            value={form.prot}
            onChange={set('prot')}
            inputMode="decimal"
            placeholder="8"
          />
          <Input
            label={`Grasas / 100 ${unidad}`}
            value={form.grasa}
            onChange={set('grasa')}
            inputMode="decimal"
            placeholder="3"
          />
        </div>

        {/* El resultado, en vivo. Mientras no haya datos suficientes se queda
            en gris diciendo qué falta, en vez de enseñar un 0g · HC que
            parecería un cálculo hecho. */}
        <div className="rounded-surface border border-hairline bg-surface p-4">
          <p className="font-mono text-caption font-semibold uppercase tracking-[.16em] text-ink-3">
            1 intercambio
          </p>

          {sinDatos ? (
            <p className="pt-2 font-sans text-body-s text-ink-3">
              Escribe las calorías y los macros y aquí verás la porción.
            </p>
          ) : (
            <>
              <div className="flex items-baseline gap-3 pt-1">
                <span className="font-mono text-display text-ink">
                  {calculo.gramosPorIntercambio}{unidad}
                </span>
                <span className={`rounded-control border px-2 py-1 font-mono text-caption font-bold ${CAT_BG[calculo.category]} ${CAT_COLOR[calculo.category]}`}>
                  {CAT_LABEL[calculo.category]}
                </span>
              </div>

              {/* El desglose: de dónde salen esas ~100 kcal. Es lo que explica
                  el grupo elegido, y lo que deja ver de un vistazo cuando un
                  alimento está a caballo entre dos. */}
              <dl className="grid grid-cols-3 gap-2 pt-4">
                {([
                  ['Hidratos', calculo.desglose.HC],
                  ['Proteína', calculo.desglose.PROT],
                  ['Grasa', calculo.desglose.GRASA],
                ] as const).map(([nombre, valor]) => (
                  <div key={nombre} className="rounded-control bg-raised p-2 text-center">
                    <dt className="font-sans text-caption text-ink-3">{nombre}</dt>
                    <dd className="font-mono text-title-s text-ink">{fmtQty(valor)}</dd>
                  </div>
                ))}
              </dl>
              <p className="pt-2 font-sans text-caption text-ink-3">
                Suma {fmtQty(calculo.desglose.total)} intercambios · {calculo.kcalUsadas} kcal / 100 {unidad}
              </p>
            </>
          )}
        </div>

        {calculo.avisos
          .filter(a => a !== 'sin-datos')
          .map(aviso => (
            <div key={aviso}>
              <Banner tone={aviso === 'kcal-no-cuadra' ? 'danger' : 'info'}>
                {TEXTO_DE_AVISO[aviso]}
              </Banner>
            </div>
          ))}

        {error && <Banner tone="danger">{error}</Banner>}

        <p className="flex items-start gap-2 font-sans text-caption text-ink-3">
          <Icon name={destino === 'personal' ? 'lock' : 'group'} size="s" />
          {destino === 'personal'
            ? 'Este alimento lo veréis solo tú y tu coach.'
            : 'Este alimento entra en el banco común: lo verán todos los atletas.'}
        </p>

        {/* La guía de etiquetas, justo donde se está tecleando. Los fallos que
            de verdad se cometen no son de cálculo —coger la columna «por
            ración», apuntar «de los cuales azúcares», pesar un líquido— y
            ninguno chirría en pantalla: dan un alimento que parece bien puesto.
            Por eso está pegada al formulario y no en un apartado de ayuda. */}
        <button
          type="button"
          onClick={() => setGuiaAbierta(true)}
          className="flex w-full items-center gap-3 rounded-control border border-accent/25 bg-accent-bg p-3 text-left transition-colors hover:bg-accent/20"
        >
          <Icon name="menu_book" size="s" className="flex-shrink-0 text-accent" />
          <span className="min-w-0 flex-1">
            <span className="block font-sans text-body-s font-semibold text-ink">Ver guía</span>
            <span className="block font-sans text-caption text-ink-2">
              Qué columna mirar, sólidos y líquidos, y dónde está el truco de cada macro.
            </span>
          </span>
          <Icon name="chevron_right" size="s" className="flex-shrink-0 text-ink-3" />
        </button>

        {/* Borrar vive AQUÍ dentro y no en la fila de la lista, que es donde
            estaba: en la lista ocupaba el sitio que en todos los demás
            alimentos tiene el «+», así que el gesto de añadir borraba (Dani,
            24-09). Aquí hay que haber entrado a propósito, va al final, en
            contorno y sin relleno rojo — la acción de esta hoja es guardar. */}
        {editando && onEliminar && (
          <div className="border-t border-hairline pt-5">
            <Button variant="secondary" onClick={onEliminar} fullWidth>
              <span className="text-danger">Eliminar este alimento</span>
            </Button>
            <p className="pt-2 text-center font-sans text-caption text-ink-3">
              Se te preguntará antes de borrarlo.
            </p>
          </div>
        )}
      </div>

      {guiaAbierta && <GuiaDeEtiquetas onClose={() => setGuiaAbierta(false)} />}
    </Sheet>
  );
}
