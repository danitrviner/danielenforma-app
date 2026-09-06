/* Banco de pruebas del motor de menús.
 *
 * Corre el MISMO código que la app —`utils/menuEngine`, `utils/slotWeights`,
 * `utils/escalarIngrediente`, `utils/menuShoppingList`— contra el recetario real
 * de 8.850 recetas y el banco de intercambios real. Nada aquí está simulado: si
 * el prototipo enseña un menú, es el menú que generaría la app con esas mismas
 * respuestas.
 *
 * Sirve para ver de un vistazo la cadena que va de la ficha de alta a lo que ve
 * el atleta, y qué respuesta manda cuando el alta y el perfil dicen cosas
 * distintas.
 */
import {
  slotsFromOnboarding, generateWeek, findSwapAlternatives, totalConExtras,
  recipeMatchesSlot, slotTargets, CONTEOS_COMIDAS,
  GeneratorPrefs, MealSlotSpec, SwapCandidate, ConteoComidas,
} from '../src/utils/menuEngine';
import { buildShoppingList } from '../src/utils/menuShoppingList';
import { minutosDeReceta } from '../src/utils/tiempoDeReceta';
import { ingredientesEscalables } from '../src/utils/escalarIngrediente';
import { dishType, dishTypeLabel, DISH_TYPES } from '../src/utils/dishTypes';
import { exchangeToKcal } from '../src/utils/nutritionConstants';
import { SYSTEM_FOODS } from '../src/nutricion_seed_en_forma';
import {
  Recipe, MealItem, Diet, MenuDay, MenuMeal, WeekDay, DietMode, HungerProfile,
} from '../src/types';
import RECETAS from './recetas.json';

// ─── Datos reales ────────────────────────────────────────────────────────────

const recetas = RECETAS as unknown as Recipe[];
const foods = (SYSTEM_FOODS as unknown as MealItem[]).map((f, i) => ({ ...f, id: `f${i}` }));
const porId = new Map(recetas.map(r => [r.id, r]));

const DIAS: WeekDay[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const NOMBRE_DIA: Record<WeekDay, string> = {
  mon: 'Lunes', tue: 'Martes', wed: 'Miércoles', thu: 'Jueves',
  fri: 'Viernes', sat: 'Sábado', sun: 'Domingo',
};
const DIA_CORTO: Record<WeekDay, string> = {
  mon: 'L', tue: 'M', wed: 'X', thu: 'J', fri: 'V', sat: 'S', sun: 'D',
};

const PRESETS_COMIDAS: Record<ConteoComidas, { intakeType: number; name: string; needsTupper: boolean }[]> = {
  3: [
    { intakeType: 1, name: 'Desayuno', needsTupper: false },
    { intakeType: 3, name: 'Comida', needsTupper: true },
    { intakeType: 5, name: 'Cena', needsTupper: false },
  ],
  4: [
    { intakeType: 1, name: 'Desayuno', needsTupper: false },
    { intakeType: 2, name: 'Media mañana', needsTupper: false },
    { intakeType: 3, name: 'Comida', needsTupper: true },
    { intakeType: 5, name: 'Cena', needsTupper: false },
  ],
  5: [
    { intakeType: 1, name: 'Desayuno', needsTupper: false },
    { intakeType: 2, name: 'Media mañana', needsTupper: false },
    { intakeType: 3, name: 'Comida', needsTupper: true },
    { intakeType: 4, name: 'Merienda', needsTupper: false },
    { intakeType: 5, name: 'Cena', needsTupper: false },
  ],
  6: [
    { intakeType: 1, name: 'Desayuno', needsTupper: false },
    { intakeType: 2, name: 'Media mañana', needsTupper: false },
    { intakeType: 3, name: 'Comida', needsTupper: true },
    { intakeType: 4, name: 'Merienda', needsTupper: false },
    { intakeType: 5, name: 'Cena', needsTupper: false },
    { intakeType: 5, name: 'Recena', needsTupper: false },
  ],
};

// ─── Estado: las respuestas del atleta, separadas por dónde se contestan ──────

interface Estado {
  // Ficha de alta (se contesta una vez)
  altaComidas: ConteoComidas;
  altaTiempo: number;
  alergias: string[];
  manias: string[];
  // Perfil del atleta (lo puede corregir cuando quiera; manda sobre el alta)
  perfilComidas: ConteoComidas | null;
  perfilTiempo: number | null;
  hambre: HungerProfile | '';
  variedad: number;
  tiposExcluidos: string[];
  // Coach
  kcal: number;
  modo: DietMode;
}

const estado: Estado = {
  altaComidas: 4,
  altaTiempo: 60,
  alergias: [],
  manias: [],
  perfilComidas: null,
  perfilTiempo: null,
  hambre: '',
  variedad: 3,
  tiposExcluidos: [],
  kcal: 2200,
  modo: 'OMNIVORO',
};

const ALERGIAS = ['gluten', 'lactosa', 'frutos secos', 'huevo', 'marisco', 'soja'];
const MANIAS = ['pescado', 'setas', 'cerdo', 'ternera', 'aguacate', 'legumbres', 'brócoli'];

// Lo que la app resuelve: el perfil manda, el alta es el valor de partida.
const comidasEfectivas = (): ConteoComidas => estado.perfilComidas ?? estado.altaComidas;
const tiempoEfectivo = (): number => estado.perfilTiempo ?? estado.altaTiempo;

// ─── Generación ──────────────────────────────────────────────────────────────

interface Resultado {
  dias: MenuDay[];
  slots: MealSlotSpec[];
  prefs: GeneratorPrefs;
  pools: Record<number, Recipe[]>;
  objetivo: number;
  ms: number;
}

let resultado: Resultado | null = null;

function presupuesto(kcal: number) {
  const t = kcal / 100;
  return {
    HC: Math.round(t * 0.45 * 4) / 4,
    PROT: Math.round(t * 0.3 * 4) / 4,
    GRASA: Math.round(t * 0.25 * 4) / 4,
  };
}

function generar(): Resultado {
  const t0 = performance.now();
  const count = comidasEfectivas();
  const ficha = { mealCount: estado.altaComidas, meals: PRESETS_COMIDAS[estado.altaComidas] };
  const slots = slotsFromOnboarding(
    ficha,
    estado.hambre || undefined,
    estado.perfilComidas ?? undefined,
  );
  const prefs: GeneratorPrefs = {
    allergies: estado.alergias,
    disliked: estado.manias,
    liked: [],
    cookingMaxTime: tiempoEfectivo(),
    variety: estado.variedad,
    excludedDishTypes: estado.tiposExcluidos as GeneratorPrefs['excludedDishTypes'],
  };
  const pools: Record<number, Recipe[]> = {};
  for (const s of new Set(slots.map(sl => sl.slot))) {
    pools[s] = recetas.filter(r => recipeMatchesSlot(r, s));
  }
  const b = presupuesto(estado.kcal);
  const dieta = {
    id: 'dieta', athleteId: 'atleta', name: `${estado.kcal} kcal`,
    budget: { ...b, MIX_HC: 0, MIX_GRASA: 0 }, meals: [],
  } as unknown as Diet;
  const schedule: Partial<Record<WeekDay, string>> = {};
  for (const d of DIAS) schedule[d] = 'dieta';
  const dias = generateWeek({
    schedule, diets: [dieta], slots, pools, foods, prefs, mode: estado.modo,
  });
  void count;
  return { dias, slots, prefs, pools, objetivo: b.HC + b.PROT + b.GRASA, ms: performance.now() - t0 };
}

// ─── Utilidades de presentación ──────────────────────────────────────────────

const $ = (sel: string) => document.querySelector(sel) as HTMLElement;
const el = (tag: string, cls?: string, txt?: string): HTMLElement => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (txt != null) n.textContent = txt;
  return n;
};
const num = (n: number) => (Math.round(n * 100) / 100).toString().replace('.', ',');
const kcalDe = (m: MenuMeal) => Math.round(exchangeToKcal(totalConExtras(m.exch, m.complements, m.racionesExtra)));
const totalDe = (m: MenuMeal) => {
  const t = totalConExtras(m.exch, m.complements, m.racionesExtra);
  return t.HC + t.PROT + t.GRASA;
};

function chipsMacro(v: { HC: number; PROT: number; GRASA: number }): HTMLElement {
  const wrap = el('div', 'macros');
  for (const [k, label] of [['HC', 'HC'], ['PROT', 'PR'], ['GRASA', 'GR']] as const) {
    const c = el('span', `macro macro-${k.toLowerCase()}`);
    c.append(el('b', '', label), document.createTextNode(num(v[k])));
    wrap.append(c);
  }
  return wrap;
}

// ─── Panel izquierdo: la ficha ───────────────────────────────────────────────

function fila(etiqueta: string, control: HTMLElement, nota?: string): HTMLElement {
  const f = el('div', 'fila');
  const lab = el('label', 'fila-lab', etiqueta);
  f.append(lab, control);
  if (nota) f.append(el('p', 'fila-nota', nota));
  return f;
}

function opciones(
  valores: { v: string; t: string }[],
  actual: string,
  onPick: (v: string) => void,
): HTMLElement {
  const g = el('div', 'segmentos');
  for (const o of valores) {
    const b = el('button', 'seg' + (o.v === actual ? ' seg-on' : ''), o.t);
    b.setAttribute('type', 'button');
    b.onclick = () => { onPick(o.v); pintarFicha(); };
    g.append(b);
  }
  return g;
}

function multi(valores: string[], sel: string[], onToggle: (v: string) => void): HTMLElement {
  const g = el('div', 'etiquetas');
  for (const v of valores) {
    const b = el('button', 'etiq' + (sel.includes(v) ? ' etiq-on' : ''), v);
    b.setAttribute('type', 'button');
    b.onclick = () => { onToggle(v); pintarFicha(); };
    g.append(b);
  }
  return g;
}

function pintarFicha(): void {
  const c = $('#ficha');
  c.innerHTML = '';

  // ── Coach ──
  const coach = el('section', 'grupo');
  coach.append(cabeceraGrupo('Lo pone el entrenador', 'coach'));
  coach.append(fila('Calorías al día', (() => {
    const w = el('div', 'rango');
    const i = el('input', 'slider') as HTMLInputElement;
    Object.assign(i, { type: 'range', min: '1400', max: '4000', step: '100', value: String(estado.kcal) });
    const v = el('output', 'rango-val', `${estado.kcal} kcal`);
    i.oninput = () => { estado.kcal = Number(i.value); v.textContent = `${estado.kcal} kcal`; };
    i.onchange = () => pintarFicha();
    w.append(i, v);
    return w;
  })(), `${num(presupuesto(estado.kcal).HC + presupuesto(estado.kcal).PROT + presupuesto(estado.kcal).GRASA)} intercambios al día`));
  coach.append(fila('Banco de alimentos', opciones(
    [{ v: 'OMNIVORO', t: 'Omnívoro' }, { v: 'VEGANO', t: 'Vegano' }, { v: 'SIN_PESAR', t: 'Sin pesar' }],
    estado.modo, v => { estado.modo = v as DietMode; },
  )));
  c.append(coach);

  // ── Alta ──
  const alta = el('section', 'grupo');
  alta.append(cabeceraGrupo('Lo contestó en el alta', 'alta'));
  alta.append(fila('Comidas al día', opciones(
    CONTEOS_COMIDAS.map(n => ({ v: String(n), t: String(n) })),
    String(estado.altaComidas),
    v => { estado.altaComidas = Number(v) as ConteoComidas; },
  ), estado.perfilComidas != null
    ? `Lo ha cambiado en su perfil a ${estado.perfilComidas}: manda el perfil.`
    : undefined));
  alta.append(fila('Tiempo para cocinar', opciones(
    [10, 15, 20, 30, 45, 60, 90].map(m => ({ v: String(m), t: `${m}′` })),
    String(estado.altaTiempo),
    v => { estado.altaTiempo = Number(v); },
  ), estado.perfilTiempo != null
    ? `Lo ha cambiado en su perfil a ${estado.perfilTiempo} min: manda el perfil.`
    : undefined));
  alta.append(fila('Alergias', multi(ALERGIAS, estado.alergias, v => {
    estado.alergias = estado.alergias.includes(v)
      ? estado.alergias.filter(x => x !== v) : [...estado.alergias, v];
  })));
  alta.append(fila('No le gusta', multi(MANIAS, estado.manias, v => {
    estado.manias = estado.manias.includes(v)
      ? estado.manias.filter(x => x !== v) : [...estado.manias, v];
  })));
  c.append(alta);

  // ── Perfil ──
  const perfil = el('section', 'grupo');
  perfil.append(cabeceraGrupo('Lo cambia él desde su perfil', 'perfil'));
  perfil.append(fila('Comidas al día', opciones(
    [{ v: '', t: 'Como en el alta' }, ...CONTEOS_COMIDAS.map(n => ({ v: String(n), t: String(n) }))],
    estado.perfilComidas == null ? '' : String(estado.perfilComidas),
    v => { estado.perfilComidas = v ? (Number(v) as ConteoComidas) : null; },
  )));
  perfil.append(fila('Tiempo para cocinar', opciones(
    [{ v: '', t: 'Como en el alta' }, ...[10, 15, 20, 30, 45, 60, 90].map(m => ({ v: String(m), t: `${m}′` }))],
    estado.perfilTiempo == null ? '' : String(estado.perfilTiempo),
    v => { estado.perfilTiempo = v ? Number(v) : null; },
  )));
  perfil.append(fila('Cuándo tiene más hambre', opciones(
    [{ v: '', t: 'Sin decir' }, { v: 'manana', t: 'Por la mañana' },
     { v: 'equilibrado', t: 'Equilibrado' }, { v: 'noche', t: 'Por la noche' }],
    estado.hambre, v => { estado.hambre = v as HungerProfile | ''; },
  )));
  perfil.append(fila('Variedad del menú', opciones(
    [1, 2, 3, 4, 5].map(n => ({ v: String(n), t: String(n) })),
    String(estado.variedad), v => { estado.variedad = Number(v); },
  ), '1 repite mucho · 5 no repite nada'));
  perfil.append(fila('Tipos de plato que no quiere', multi(
    DISH_TYPES.map(d => d.id), estado.tiposExcluidos, v => {
      estado.tiposExcluidos = estado.tiposExcluidos.includes(v)
        ? estado.tiposExcluidos.filter(x => x !== v) : [...estado.tiposExcluidos, v];
    },
  )));
  c.append(perfil);
}

function cabeceraGrupo(titulo: string, tono: string): HTMLElement {
  const h = el('div', 'grupo-cab');
  h.append(el('span', `punto punto-${tono}`), el('h3', '', titulo));
  return h;
}

// ─── Cuadro de mando ─────────────────────────────────────────────────────────

function pintarMando(r: Resultado): void {
  const comidas = r.dias.flatMap(d => d.meals);
  const sinReceta = comidas.filter(m => !m.recipeId).length;
  let peorDesvio = 0;
  for (const d of r.dias) {
    const puesto = d.meals.reduce((s, m) => s + totalDe(m), 0);
    peorDesvio = Math.max(peorDesvio, Math.abs(puesto - r.objetivo));
  }
  let coberturaMin = 1;
  let maxAcomp = 0;
  for (const m of comidas) {
    const t = totalDe(m);
    if (t > 0) coberturaMin = Math.min(coberturaMin, (m.exch.HC + m.exch.PROT + m.exch.GRASA) / t);
    maxAcomp = Math.max(maxAcomp, m.complements.length);
  }
  const distintas = new Set(comidas.map(m => m.recipeId)).size;

  const tiles: { k: string; v: string; sub: string; estado: 'ok' | 'mal' }[] = [
    { k: 'Sin receta', v: String(sinReceta), sub: `de ${comidas.length} comidas`, estado: sinReceta === 0 ? 'ok' : 'mal' },
    { k: 'Desvío máximo', v: num(peorDesvio), sub: `intercambios sobre ${num(r.objetivo)}`, estado: peorDesvio <= 1 ? 'ok' : 'mal' },
    { k: 'La receta cubre', v: `${Math.round(coberturaMin * 100)}%`, sub: 'en la peor comida', estado: coberturaMin >= 0.7 ? 'ok' : 'mal' },
    { k: 'Acompañamientos', v: String(maxAcomp), sub: 'como mucho, por comida', estado: maxAcomp <= 2 ? 'ok' : 'mal' },
    { k: 'Recetas distintas', v: String(distintas), sub: 'en la semana', estado: 'ok' },
    { k: 'Ha tardado', v: `${(r.ms / 1000).toFixed(1)}s`, sub: 'en montar la semana', estado: 'ok' },
  ];

  const c = $('#mando');
  c.innerHTML = '';
  for (const t of tiles) {
    const n = el('div', `tile tile-${t.estado}`);
    n.append(el('p', 'tile-k', t.k), el('p', 'tile-v', t.v), el('p', 'tile-sub', t.sub));
    c.append(n);
  }
}

// ─── Semana ──────────────────────────────────────────────────────────────────

let diaAbierto: WeekDay = 'mon';

function pintarSemana(r: Resultado): void {
  const tabs = $('#dias');
  tabs.innerHTML = '';
  for (const d of DIAS) {
    const b = el('button', 'dia-tab' + (d === diaAbierto ? ' dia-on' : ''));
    b.setAttribute('type', 'button');
    b.append(el('span', 'dia-corto', DIA_CORTO[d]), el('span', 'dia-largo', NOMBRE_DIA[d]));
    b.onclick = () => { diaAbierto = d; pintarSemana(r); };
    tabs.append(b);
  }

  const dia = r.dias.find(d => d.day === diaAbierto)!;
  const objetivos = slotTargets(dia.target, r.slots);
  const cont = $('#comidas');
  cont.innerHTML = '';

  dia.meals.forEach((m, i) => {
    const receta = m.recipeId ? porId.get(m.recipeId) : undefined;
    const card = el('article', 'comida');

    const cab = el('header', 'comida-cab');
    const izq = el('div', 'comida-cab-izq');
    izq.append(el('h4', '', m.name));
    const objetivo = objetivos[i];
    izq.append(el('p', 'comida-obj',
      `objetivo ${num(objetivo.HC + objetivo.PROT + objetivo.GRASA)} int.`));
    cab.append(izq);
    cab.append(el('p', 'comida-kcal', `${kcalDe(m)} kcal`));
    card.append(cab);

    if (!receta) {
      card.append(el('p', 'aviso', 'El recetario no tiene ninguna receta para esta comida.'));
    } else {
      const plato = el('div', 'plato');
      const t = el('div', 'plato-txt');
      t.append(el('p', 'plato-n', receta.name.trim()));
      const meta = el('p', 'plato-meta');
      const mins = minutosDeReceta(receta);
      meta.textContent = [
        m.scale !== 1 ? `ración ×${num(m.scale)}` : 'ración normal',
        mins != null ? `~${mins} min` : null,
        dishTypeLabel(dishType(receta)),
      ].filter(Boolean).join(' · ');
      t.append(meta);
      plato.append(t);
      plato.append(chipsMacro(m.exch));
      card.append(plato);
    }

    const extras = [
      ...(m.racionesExtra ?? []).map(x => `+${x.gramos} g de ${x.nombre}`),
      ...m.complements.map(x => `${num(x.quantity)} × ${x.foodLabel}`),
    ];
    if (extras.length) {
      const e = el('div', 'extras');
      e.append(el('p', 'extras-t', 'Para completar'));
      const lista = el('ul', 'extras-l');
      for (const x of extras) lista.append(el('li', '', x));
      e.append(lista);
      card.append(e);
    }

    const pie = el('footer', 'comida-pie');
    const boton = el('button', 'btn', 'Ver alternativas');
    boton.setAttribute('type', 'button');
    boton.onclick = () => abrirAlternativas(r, dia, m);
    pie.append(boton);
    if (receta) {
      const esc = ingredientesEscalables(receta.ingredientsText, foods, estado.modo);
      if (esc.length) {
        pie.append(el('p', 'pie-nota', `se le puede echar más ${esc.map(x => x.nombre).slice(0, 3).join(', ')}`));
      }
    }
    card.append(pie);
    cont.append(card);
  });

  const total = dia.meals.reduce((s, m) => s + totalDe(m), 0);
  const resumen = $('#resumen-dia');
  resumen.innerHTML = '';
  resumen.append(
    el('span', '', `${num(total)} de ${num(r.objetivo)} intercambios`),
    el('span', 'sep', '·'),
    el('span', '', `${dia.meals.reduce((s, m) => s + kcalDe(m), 0)} kcal`),
  );
}

// ─── Alternativas ────────────────────────────────────────────────────────────

let cierreCajon: (() => void) | null = null;

function abrirAlternativas(r: Resultado, dia: MenuDay, comida: MenuMeal): void {
  const cajon = $('#cajon');
  const cuerpo = $('#cajon-cuerpo');
  $('#cajon-titulo').textContent = `${comida.name} · ${NOMBRE_DIA[dia.day]}`;
  cuerpo.innerHTML = '';
  cuerpo.append(el('p', 'cargando', 'Buscando en el recetario…'));
  cajon.classList.add('abierto');
  document.body.classList.add('sin-scroll');

  cierreCajon = () => {
    cajon.classList.remove('abierto');
    document.body.classList.remove('sin-scroll');
  };

  // Un respiro para que el "buscando" llegue a pintarse: la búsqueda recorre
  // varios miles de recetas y bloquea el hilo mientras dura.
  setTimeout(() => {
    const alternativas = findSwapAlternatives(
      dia, comida.id, r.pools[comida.slot] ?? [], r.prefs, Infinity, estado.modo, foods,
    );
    cuerpo.innerHTML = '';

    const exactas = alternativas.filter(a => a.fit === 'exacto');
    const aprox = alternativas.filter(a => a.fit === 'aproximado');
    const intro = el('p', 'cajon-intro');
    intro.textContent = alternativas.length === 0
      ? 'Ninguna receta del recetario encaja aquí sin sacarle del plan.'
      : `${alternativas.length} recetas valen para esta comida: ${exactas.length} le dejan el día clavado y ${aprox.length} se desvían un poco.`;
    cuerpo.append(intro);

    const bloque = (titulo: string, nota: string, lista: SwapCandidate[]) => {
      if (!lista.length) return;
      const s = el('section', 'bloque');
      const h = el('div', 'bloque-cab');
      h.append(el('h4', '', titulo), el('p', 'bloque-nota', nota));
      s.append(h);
      const ul = el('div', 'alts');
      for (const a of lista.slice(0, 40)) {
        const n = el('div', 'alt');
        const t = el('div', 'alt-txt');
        t.append(el('p', 'alt-n', a.recipe.name.trim()));
        const mins = minutosDeReceta(a.recipe);
        t.append(el('p', 'alt-meta', [
          a.scale !== 1 ? `ración ×${num(a.scale)}` : 'ración normal',
          mins != null ? `~${mins} min` : null,
          a.raciones.length ? `+ ${a.raciones.map(x => `${x.gramos} g de ${x.nombre}`).join(', ')}` : null,
        ].filter(Boolean).join(' · ')));
        n.append(t, chipsMacro(a.exch));
        ul.append(n);
      }
      if (lista.length > 40) {
        ul.append(el('p', 'alt-mas', `y ${lista.length - 40} más`));
      }
      s.append(ul);
      cuerpo.append(s);
    };

    bloque('Le dejan el día clavado', 'mismos intercambios', exactas);
    bloque('Se desvían un poco', 'entran dentro del margen', aprox);
  }, 30);
}

// ─── Lista de la compra ──────────────────────────────────────────────────────

function pintarCompra(r: Resultado): void {
  const items = buildShoppingList(r.dias, porId);
  const c = $('#compra');
  c.innerHTML = '';
  $('#compra-n').textContent = `${items.length} cosas`;
  for (const it of items.slice(0, 60)) {
    const n = el('div', 'compra-l');
    n.append(el('span', 'compra-n2', it.name), el('span', 'compra-q', it.display));
    c.append(n);
  }
  if (items.length > 60) c.append(el('p', 'alt-mas', `y ${items.length - 60} más`));
}

// ─── Arranque ────────────────────────────────────────────────────────────────

function repintar(): void {
  const boton = $('#generar') as HTMLButtonElement;
  boton.disabled = true;
  boton.textContent = 'Montando la semana…';
  setTimeout(() => {
    resultado = generar();
    pintarMando(resultado);
    pintarSemana(resultado);
    pintarCompra(resultado);
    boton.disabled = false;
    boton.textContent = 'Generar de nuevo';
  }, 30);
}

function iniciar(): void {
  pintarFicha();
  $('#generar').onclick = repintar;
  $('#cajon-cerrar').onclick = () => cierreCajon?.();
  $('#cajon-fondo').onclick = () => cierreCajon?.();
  document.addEventListener('keydown', e => { if (e.key === 'Escape') cierreCajon?.(); });
  $('#n-recetas').textContent = recetas.length.toLocaleString('es-ES').replace(/,/g, '.');
  $('#n-alimentos').textContent = String(foods.filter(f => f.mode === 'OMNIVORO').length);
  repintar();
}

iniciar();
