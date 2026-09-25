import React from 'react';
import { Sheet, Button, Icon } from '../ui';

/* ═══════════════════════════════════════════════════════════════════════════
   Cómo copiar una etiqueta sin equivocarse

   La calculadora es fiable; lo que no lo es son los cuatro números que se le
   dan. Los fallos que se ven de verdad no son de cálculo:

     · coger la columna «por ración» en vez de la de 100 g,
     · apuntar «de los cuales azúcares» como si fueran los hidratos,
     · apuntar el arroz crudo y pesarlo cocido (355 kcal frente a 130),
     · medir un líquido en la báscula.

   Los cuatro dan un alimento que parece bien puesto y descuadra el día entero,
   sin que nada chirríe en pantalla. Por eso esta guía va pegada al formulario
   y no en un apartado de ayuda: se lee mientras se teclea, que es el único
   momento en el que sirve de algo.
   ═══════════════════════════════════════════════════════════════════════════ */

interface Props { onClose: () => void; }

/** Un aviso con su icono. El tono `alerta` es para lo que descuadra la cuenta
 *  sin avisar; el neutro, para lo que solo hay que saber. */
function Punto({ icono, titulo, children, alerta = false }: {
  icono: string;
  titulo: string;
  children: React.ReactNode;
  alerta?: boolean;
}) {
  return (
    <div className={`flex items-start gap-3 rounded-control border p-3 ${
      alerta ? 'border-accent/25 bg-accent-bg' : 'border-hairline bg-surface'
    }`}>
      <Icon name={icono} size="s" className={`mt-0.5 flex-shrink-0 ${alerta ? 'text-accent' : 'text-ink-3'}`} />
      <div className="min-w-0 space-y-1">
        <p className="font-sans text-body-s font-semibold text-ink">{titulo}</p>
        <p className="font-sans text-body-s text-ink-2">{children}</p>
      </div>
    </div>
  );
}

export default function GuiaDeEtiquetas({ onClose }: Props) {
  return (
    <Sheet
      open
      onClose={onClose}
      title="Cómo copiar la etiqueta"
      alto="completo"
      footer={<Button onClick={onClose} fullWidth>Entendido</Button>}
    >
      <div className="space-y-7 pt-2 pb-2">

        {/* ── Qué columna ───────────────────────────────────────────────── */}
        <section className="space-y-3">
          <h3 className="font-mono text-caption font-semibold uppercase tracking-[.16em] text-ink-3">
            Lo primero: la columna correcta
          </h3>
          <Punto icono="warning" titulo="Siempre la de 100 g o 100 ml" alerta>
            Casi todos los envases traen dos columnas: una por 100 y otra «por ración»
            o «por unidad». Coge la de 100 <b>siempre</b>. Si copias la de la ración,
            el alimento sale con el triple de gramos y no hay forma de notarlo luego.
          </Punto>
          <Punto icono="bolt" titulo="Las calorías son las kcal, no los kJ">
            El «valor energético» viene con dos cifras: 1.046 kJ y 250 kcal, por ejemplo.
            La que va aquí es la segunda, la de kcal — siempre la más pequeña.
          </Punto>
        </section>

        {/* ── Los tres macros ───────────────────────────────────────────── */}
        <section className="space-y-3">
          <h3 className="font-mono text-caption font-semibold uppercase tracking-[.16em] text-ink-3">
            Proteínas, grasas e hidratos
          </h3>
          <Punto icono="warning" titulo="Los totales, no las líneas de debajo" alerta>
            La etiqueta pone «Grasas 12 g, <i>de las cuales saturadas</i> 3 g» y «Hidratos
            de carbono 45 g, <i>de los cuales azúcares</i> 8 g». Aquí van el <b>12</b> y el
            <b> 45</b>: los totales. Las líneas sangradas ya están contadas dentro.
          </Punto>
          <Punto icono="check_circle" titulo="Proteínas, tal cual">
            Esa no tiene truco: el número que ponga, sin más.
          </Punto>
          <Punto icono="visibility_off" titulo="La fibra y la sal no se apuntan">
            No tienen casilla porque no cuentan intercambios. Si el envase separa la
            fibra de los hidratos, deja los hidratos como vengan.
          </Punto>
          <Punto icono="rule" titulo="Si algo no viene, pon 0">
            Un aceite no lleva hidratos ni proteína. Deja el 0, no lo dejes vacío
            a medias con otros campos rellenos.
          </Punto>
        </section>

        {/* ── Sólidos ───────────────────────────────────────────────────── */}
        <section className="space-y-3">
          <h3 className="font-mono text-caption font-semibold uppercase tracking-[.16em] text-ink-3">
            Si es un sólido
          </h3>
          <Punto icono="warning" titulo="Crudo y cocido no son lo mismo" alerta>
            100 g de arroz crudo son 355 kcal; cocido, unas 130. El agua no engorda,
            pero cambia el peso. Apunta la etiqueta del estado en el que lo vas a
            <b> pesar</b>, y dilo en el nombre: «arroz cocido», «lentejas de bote».
          </Punto>
          <Punto icono="water_drop" titulo="Escurrido, si lo vas a escurrir">
            El atún, el maíz o los garbanzos de bote suelen traer el dato del producto
            escurrido. Si lo escurres, vale; si te comes el líquido, ya no.
          </Punto>
          <Punto icono="scale" titulo="Se pesa en báscula, en gramos">
            El alimento entrará en tu lista como «40g pan integral». Eso son 40 g de
            báscula, no una rebanada a ojo.
          </Punto>
        </section>

        {/* ── Líquidos ──────────────────────────────────────────────────── */}
        <section className="space-y-3">
          <h3 className="font-mono text-caption font-semibold uppercase tracking-[.16em] text-ink-3">
            Si es un líquido
          </h3>
          <Punto icono="warning" titulo="Cambia el selector a «Líquido (ml)»" alerta>
            Arriba del formulario tienes el interruptor. Si lo dejas en sólido, el
            alimento te pedirá gramos y tú vas a servir con un vaso.
          </Punto>
          <Punto icono="local_drink" titulo="Por 100 ml, no por vaso">
            Muchas bebidas vegetales y batidos dan los valores «por vaso (200 ml)» o
            «por envase». Si es así, divide entre 2 los de 200 ml, o entre 2,5 los de
            250 ml, antes de escribirlos.
          </Punto>
          <Punto icono="cyclone" titulo="Agita antes de servir">
            Las bebidas vegetales se separan. Sin agitar, el primer vaso y el último
            no tienen la misma grasa aunque la etiqueta diga una sola cosa.
          </Punto>
          <Punto icono="straighten" titulo="Se mide, no se pesa">
            Un vaso medidor o el tapón graduado. 100 ml de aceite no pesan 100 g, así
            que la báscula aquí te miente.
          </Punto>
        </section>

        {/* ── Comprobación ──────────────────────────────────────────────── */}
        <section className="space-y-3">
          <h3 className="font-mono text-caption font-semibold uppercase tracking-[.16em] text-ink-3">
            Antes de guardar
          </h3>
          <Punto icono="fact_check" titulo="Mira el recuadro del intercambio">
            Te dice los gramos que salen y en qué grupo cae. Si ves algo raro —3 g de
            pan, 900 g de pollo— hay un número mal puesto.
          </Punto>
          <Punto icono="error" titulo="«Las calorías no cuadran con los macros»">
            Ese aviso salta cuando las kcal no encajan con lo demás. Casi siempre es
            una de dos: un dígito de más, o haber mezclado la columna de la ración con
            la de 100 g.
          </Punto>
          <Punto icono="edit" titulo="Todo esto se puede corregir después">
            Si te equivocas, el alimento lleva el lápiz en su fila: se abre esta misma
            pantalla con lo que escribiste y se arregla el dato suelto.
          </Punto>
        </section>
      </div>
    </Sheet>
  );
}
