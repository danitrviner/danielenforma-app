import React from 'react';
import { Sheet, Button, Icon } from '../ui';
import { CAT_LABEL, CAT_BG, CAT_COLOR } from '../../utils/exchangeHelpers';
import type { FoodCategory } from '../../types';

/* ═══════════════════════════════════════════════════════════════════════════
   Cómo funcionan los intercambios, explicado dentro de la pantalla

   Todo lo que hay aquí es conocimiento que hasta ahora vivía en la cabeza de
   Dani y en lo que le contaba a cada cliente por WhatsApp: por qué 40 g de pan
   y 150 g de patata son lo mismo, por qué el huevo no es proteína a secas, por
   qué la lechuga no está en ninguna lista. Un atleta que no lo sabe no comete
   un error pequeño: apunta mal el día entero y encima cree que va bien.

   Va dentro del buscador —no en un tutorial de bienvenida que se pasa a toque
   de "siguiente" y se olvida— y se puede reabrir siempre desde el botón de
   arriba, porque esto no se aprende de una sentada.
   ═══════════════════════════════════════════════════════════════════════════ */

const GRUPOS: { cat: FoodCategory; ejemplo: string }[] = [
  { cat: 'HC',        ejemplo: 'Pan, arroz, pasta, patata, fruta, avena' },
  { cat: 'PROT',      ejemplo: 'Pollo, pescado blanco, claras, proteína en polvo' },
  { cat: 'GRASA',     ejemplo: 'Aceite, frutos secos, aguacate, aceitunas' },
  { cat: 'MIX_HC',    ejemplo: 'Legumbres, leche, yogur natural' },
  { cat: 'MIX_GRASA', ejemplo: 'Huevo entero, queso, salmón, jamón serrano' },
];

interface Props { onClose: () => void; }

export default function GuiaDeIntercambios({ onClose }: Props) {
  return (
    <Sheet
      open
      onClose={onClose}
      title="Cómo funcionan los intercambios"
      alto="completo"
      footer={<Button onClick={onClose} fullWidth>Entendido</Button>}
    >
      <div className="space-y-7 pt-2 pb-2">

        {/* ── 1. La idea ────────────────────────────────────────────────── */}
        <section className="space-y-2">
          <h3 className="font-mono text-caption font-semibold uppercase tracking-[.16em] text-ink-3">
            Qué es un intercambio
          </h3>
          <p className="font-sans text-body-s text-ink-2">
            Una ración. Un intercambio de hidratos son 40 g de pan, o 150 g de patata,
            o 100 g de plátano: cantidades distintas del mismo valor. Por eso puedes
            cambiar unos por otros sin recalcular nada — de ahí el nombre.
          </p>
          <p className="font-sans text-body-s text-ink-2">
            Tu coach te dice cuántos intercambios de cada tipo te tocan al día. Tú
            decides con qué alimentos los llenas y en qué comidas.
          </p>
        </section>

        {/* ── 2. Los grupos ─────────────────────────────────────────────── */}
        <section className="space-y-3">
          <h3 className="font-mono text-caption font-semibold uppercase tracking-[.16em] text-ink-3">
            Los cinco grupos
          </h3>
          <div className="space-y-2">
            {GRUPOS.map(({ cat, ejemplo }) => (
              <div key={cat} className="flex items-start gap-3 rounded-control border border-hairline bg-surface p-3">
                <span className={`flex-shrink-0 rounded-control border px-2 py-1 font-mono text-caption font-bold ${CAT_BG[cat]} ${CAT_COLOR[cat]}`}>
                  {CAT_LABEL[cat]}
                </span>
                <span className="font-sans text-body-s text-ink-2">{ejemplo}</span>
              </div>
            ))}
          </div>
          <p className="font-sans text-caption text-ink-3">
            Los dos últimos son mixtos: cuentan mitad y mitad. Un huevo entero no es
            solo proteína — lleva la grasa de la yema, así que gasta media proteína
            y media grasa.
          </p>
        </section>

        {/* ── 3. Buscar ─────────────────────────────────────────────────── */}
        <section className="space-y-2">
          <h3 className="font-mono text-caption font-semibold uppercase tracking-[.16em] text-ink-3">
            Busca por el nombre de siempre
          </h3>
          <p className="font-sans text-body-s text-ink-2">
            La lista agrupa alimentos parecidos, así que a veces no se llaman como tú
            los llamas. No importa: escribe lo que comes y te lleva al sitio.
          </p>
          <div className="rounded-control border border-hairline bg-surface divide-y divide-hairline">
            {[
              ['lentejas', 'legumbre cocida'],
              ['fiambre de pavo', 'carne blanca sin piel'],
              ['manchego', 'queso curado, semicurado…'],
              ['salmón', 'pescado azul'],
            ].map(([escribes, sale]) => (
              <div key={escribes} className="flex items-center gap-2 p-3">
                <span className="font-sans text-body-s font-semibold text-ink">{escribes}</span>
                <Icon name="arrow_forward" size="s" className="text-ink-3" />
                <span className="font-sans text-body-s text-ink-2">{sale}</span>
              </div>
            ))}
          </div>
          <p className="font-sans text-caption text-ink-3">
            Cuando pase, verás arriba una nota explicándote por qué sale eso.
          </p>
        </section>

        {/* ── 4. Lo libre ───────────────────────────────────────────────── */}
        <section className="space-y-2">
          <h3 className="font-mono text-caption font-semibold uppercase tracking-[.16em] text-ink-3">
            Lo que no cuenta
          </h3>
          <div className="rounded-control border border-success/25 bg-success/8 p-3">
            <p className="font-sans text-body-s text-ink-2">
              <span className="font-semibold text-success">Las verduras frescas son libres.</span>{' '}
              Brócoli, lechuga, calabacín, espinacas, pimiento, tomate, cebolla… no se
              pesan ni se apuntan. Tampoco el agua, el café, las infusiones, las
              especias, el vinagre ni los edulcorantes.
            </p>
          </div>
          <div className="rounded-control border border-accent/25 bg-accent-bg p-3">
            <p className="font-sans text-body-s text-ink-2">
              <span className="font-semibold text-accent">Con cuatro excepciones.</span>{' '}
              La judía verde, la alcachofa, la menestra y los espárragos sí cuentan, a
              400 g por intercambio. Y la verdura deja de ser libre en cuanto lleva
              aceite o viene concentrada: el tomate frito y los pimientos en bote
              también cuentan.
            </p>
          </div>
        </section>

        {/* ── 5. Crear el tuyo ──────────────────────────────────────────── */}
        <section className="space-y-2">
          <h3 className="font-mono text-caption font-semibold uppercase tracking-[.16em] text-ink-3">
            Si no encuentras algo, créalo
          </h3>
          <p className="font-sans text-body-s text-ink-2">
            Al final de la lista tienes <span className="text-ink font-semibold">«¿No está? Crear
            alimento desde su etiqueta»</span>. Copia del envase las calorías y los macros
            por 100 g y ya está: los gramos que son un intercambio y el grupo al que
            pertenece se calculan solos.
          </p>
          <p className="font-sans text-body-s text-ink-2">
            Tus alimentos salen los primeros en la lista y llevan la marca{' '}
            <span className="font-mono text-caption font-bold uppercase text-accent">tuyo</span>.
            Para cambiar uno, toca el lápiz de su fila: puedes corregir cualquier dato
            y, si ya no lo quieres, borrarlo desde ahí dentro. Solo los veis tú y tu coach.
          </p>
        </section>

        {/* ── 6. La letra pequeña honesta ───────────────────────────────── */}
        <section className="space-y-2">
          <h3 className="font-mono text-caption font-semibold uppercase tracking-[.16em] text-ink-3">
            Una cosa más
          </h3>
          <p className="font-sans text-body-s text-ink-2">
            Esto son raciones, no química de precisión: un intercambio ronda las
            100 kcal y los gramos están redondeados a cifras que se puedan pesar. No
            hace falta que cuadre al decimal. Lo que mueve la aguja es que apuntes
            todos los días, no que afines el gramaje.
          </p>
        </section>
      </div>
    </Sheet>
  );
}
