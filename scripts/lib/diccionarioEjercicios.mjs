/* ═══════════════════════════════════════════════════════════════════════════
   Diccionario y reglas de traducción EN→ES para nombres de ejercicios.

   No es una traducción palabra por palabra ingenua: el inglés de estos
   nombres sigue el orden [Equipo]_[Postura]_[Modificador]_[Movimiento+Parte]
   y el español pide [Movimiento] de [Parte] [postura] con [Equipo]. Este
   fichero separa el vocabulario en categorías (equipo, postura, movimiento,
   parte del cuerpo, lateralidad, modificador) para que quien arma la frase
   (armarNombre en traducirEjercicios.mjs) pueda reordenar en vez de solo
   sustituir.

   Construido a mano a partir del vocabulario real de los 1.681 ficheros
   (scripts/out/catalogo-videos.json). Cualquier palabra que NO esté aquí se
   deja en inglés entre corchetes en el nombre generado, para que salte a la
   vista en la revisión en vez de colarse silenciosamente sin traducir.
   ═══════════════════════════════════════════════════════════════════════════ */

// ── Equipo ────────────────────────────────────────────────────────────────────
// Valores alineados con EQUIPMENT_OPTIONS de ExerciseLibraryScreen.tsx donde
// hay equivalente directo; el resto queda como texto libre pero consistente.
export const EQUIPO = {
  dumbbell: 'mancuernas', dumbell: 'mancuernas',
  barbell: 'barra', bar: 'barra', ez: 'barra Z', cambered: 'barra curva',
  tbar: 'barra en T', vbar: 'barra en V', trap: 'barra hexagonal',
  cable: 'polea', pulley: 'polea', pulldown: 'polea alta',
  machine: 'máquina', smith: 'multipower',
  bodyweight: 'peso corporal', body: 'peso corporal',
  kettlebell: 'kettlebell', plate: 'disco', plates: 'discos',
  band: 'banda elástica', banded: 'con banda elástica', bands: 'bandas elásticas',
  rope: 'cuerda', ring: 'anillas', rings: 'anillas',
  ball: 'fitball', bosu: 'bosu', box: 'cajón', bench: 'banco', benches: 'bancos',
  wall: 'pared', stool: 'taburete', chair: 'silla', chairs: 'sillas',
  towel: 'toalla', towels: 'toallas', harness: 'arnés', sled: 'trineo',
  landmine: 'landmine', parallettes: 'paralelas', table: 'mesa',
  pin: 'pin', block: 'bloque', blocks: 'bloques', chains: 'cadenas',
  belt: 'cinturón', pillow: 'cojín', slackline: 'slackline',
  zercher: 'agarre zercher', olympic: 'olímpica', weight: 'peso', weighted: 'lastrado',
  gravity: 'gravedad', antigravity: 'anti-gravedad', pad: 'almohadilla', pads: 'almohadillas',
  strap: 'correa', straps: 'correas', attachment: 'accesorio', gripper: 'gripper',
  door: 'puerta', doorway: 'marco de puerta', spot: 'apoyo', partner: 'compañero',
  bars: 'paralelas', parallettes: 'paralelas', rack: 'rack', yoga: 'yoga',
};

// ── Postura / posición ───────────────────────────────────────────────────────
export const POSTURA = {
  standing: 'de pie', stand: 'de pie', standingup: 'de pie',
  seated: 'sentado', sitting: 'sentado', sit: 'sentado', siting: 'sentado',
  lying: 'tumbado', lyine: 'tumbado', lie: 'tumbado',
  kneeling: 'de rodillas', kneel: 'de rodillas', kneeup: 'de rodillas',
  prone: 'boca abajo', supine: 'boca arriba',
  incline: 'inclinado', inclime: 'inclinado', decline: 'declinado',
  bent: 'flexionado', staggered: 'escalonado', split: 'en split',
  hanging: 'colgado', hang: 'colgado', inverted: 'invertido',
  quadruped: 'en cuadrupedia', prisoner: 'con manos en la nuca',
  elevated: 'elevado', elevanted: 'elevado', floor: 'en el suelo',
  supported: 'apoyado', support: 'con apoyo', assisted: 'asistido',
  overhead: 'por encima de la cabeza', pike: 'en pica',
  handstand: 'en pino', hovering: 'suspendido',
};

// ── Lateralidad / cantidad ───────────────────────────────────────────────────
export const LATERALIDAD = {
  single: 'a una pierna', one: 'a una', double: 'a dos', alternate: 'alterno',
  alternating: 'alterno', unilateral: 'unilateral', ipsilateral: 'ipsilateral',
  contralateral: 'contralateral', legged: 'a una pierna',
};

// ── Movimiento (la palabra que casi siempre encabeza el nombre en español) ──
export const MOVIMIENTO = {
  squat: 'sentadilla', squats: 'sentadillas',
  raise: 'elevación', raises: 'elevaciones', raised: 'elevación', yraise: 'elevación en Y',
  press: 'press', presses: 'presses', pressup: 'flexión', zpress: 'press Z',
  curl: 'curl', curls: 'curl',
  row: 'remo', rows: 'remo',
  pushup: 'flexión', pushups: 'flexiones', muscleup: 'dominada con fondo',
  extension: 'extensión', extensions: 'extensión',
  lift: 'elevación', lifts: 'elevación',
  fly: 'apertura', flys: 'aperturas',
  crunch: 'crunch', crunches: 'crunch', crunchy: 'crunch',
  lunge: 'zancada', plank: 'plancha', planked: 'en plancha',
  bridge: 'puente', twist: 'giro', twisted: 'giro', twisting: 'con giro',
  thrust: 'empuje', thrusts: 'empuje', thruster: 'thruster',
  deadlift: 'peso muerto', pulldown: 'jalón', pullover: 'pullover',
  kick: 'patada', kicks: 'patadas', kickback: 'patada atrás', kickbacks: 'patadas atrás',
  kickout: 'patada hacia fuera',
  shrug: 'encogimiento de hombros', dip: 'fondo', dips: 'fondos',
  hyperextension: 'hiperextensión',
  situp: 'abdominal', stepup: 'subida al cajón', stepout: 'paso lateral', stepback: 'paso atrás',
  walk: 'paseo', walks: 'paseo',
  squeeze: 'contracción', squeezes: 'contracción', squeez: 'contracción',
  swing: 'swing', reach: 'alcance', reaches: 'alcance', reachup: 'alcance hacia arriba',
  touch: 'toque', taps: 'toques', tap: 'toque',
  rollout: 'rodada', rollup: 'incorporación', rollover: 'giro completo', roll: 'rodada', rolls: 'rodada',
  rotation: 'rotación', rotational: 'rotación', rotate: 'rotación', rotating: 'con rotación',
  abduction: 'abducción', adduction: 'aducción', flexion: 'flexión', eversion: 'eversión', inversion: 'inversión',
  pullup: 'dominada', pullups: 'dominadas', chinup: 'dominada supina',
  superman: 'superman', hollow: 'hollow hold', scissors: 'tijera', scissor: 'tijera',
  march: 'marcha', marches: 'marcha', climber: 'escalador',
  crawl: 'gateo', rock: 'mecida', pulse: 'pulso', pulsing: 'con pulso',
  circle: 'círculo', snatch: 'arrancada', clean: 'cargada',
  spider: 'flexión araña', woodchopper: 'leñador', woodchop: 'leñador', woodchops: 'leñador',
  pallof: 'pallof press', pistol: 'sentadilla a una pierna',
  inchworm: 'gusano', getup: 'incorporación turca', vup: 'v-up', yup: 'v-up',
  jackknife: 'navaja', deadbug: 'bicho muerto', bird: 'perro-pájaro',
  clamshell: 'almeja', clam: 'almeja', donkey: 'patada de burro',
  jab: 'jab', punch: 'golpe', punches: 'golpes', uppercut: 'uppercut', boxing: 'boxeo',
  bicycle: 'bicicleta', mountain: 'escalador', crossover: 'cruzado', crossovers: 'cruzados',
  cross: 'cruzado', crossed: 'cruzado', criss: 'cruzado',
  hold: 'mantenimiento isométrico', isometric: 'isométrico',
  pushdown: 'extensión en polea', pull: 'tirón', drag: 'arrastre',
  goodmorning: 'buenos días', morning: 'buenos días',
  swimmer: 'nadador', swim: 'nadador', swimming: 'nadador',
  cobra: 'cobra', dog: 'perro', frog: 'rana', bear: 'oso', crab: 'cangrejo',
  starfish: 'estrella de mar', star: 'estrella', windshield: 'limpiaparabrisas', wipers: 'limpiaparabrisas', wiper: 'limpiaparabrisas',
  archer: 'arquero', spiderman: 'spiderman', commando: 'commando',
  butterfly: 'mariposa', boat: 'barca', teaser: 'teaser', flutter: 'flutter kick',
  hydrant: 'hidrante', getdown: 'bajada', drive: 'impulso', drives: 'impulso',
  chop: 'leñador', chopper: 'leñador', driver: 'impulso',
  carry: 'transporte', suitcase: 'maletín', waiter: 'camarero',
  scoop: 'scoop', scoops: 'scoop', spin: 'giro', skater: 'patinador', sprinter: 'esprín',
  hug: 'abrazo', hugger: 'abrazo', hula: 'hula-hoop', hoop: 'hula-hoop',
  swipe: 'barrido', swipes: 'barrido', shuffle: 'shuffle', slide: 'deslizamiento', sliding: 'deslizante',
  flip: 'volteo', flinging: 'lanzamiento', throw: 'lanzamiento',
  release: 'liberación', tuck: 'encogido', tuckup: 'encogido', tucked: 'encogido',
  handshakes: 'apretón de manos', handshake: 'apretón de manos',
  kayak: 'kayak', judo: 'judo pushup', diver: 'buceador', dive: 'buceador', dives: 'buceador',
  fistup: 'incorporación con puño', elbowup: 'incorporación con codo',
  openup: 'apertura', open: 'apertura',
  arnold: 'arnold press', zottman: 'zottman curl', larsen: 'larsen press',
  reeves: 'reeves deadlift', jefferson: 'jefferson squat', cossack: 'cossack squat',
  cuban: 'cuban press', devils: 'devil press', maltese: 'push-up maltés',
  viking: 'viking press', powell: 'powell raise', svend: 'svend press',
  nordic: 'nordic curl', hindu: 'hindu pushup', aztec: 'aztec sit-up',
  scott: 'scott curl', spider: 'spider curl', preacher: 'predicador',
  push: 'empuje', step: 'paso', lever: 'palanca', bend: 'flexión', bends: 'flexión',
  turn: 'giro', clap: 'con palmada', balance: 'equilibrio', stretch: 'estiramiento',
};

// ── Partes del cuerpo ─────────────────────────────────────────────────────────
export const PARTE = {
  leg: 'pierna', legs: 'piernas', thigh: 'muslo', thighs: 'muslos',
  hip: 'cadera', hips: 'cadera', knee: 'rodilla', knees: 'rodillas',
  arm: 'brazo', arms: 'brazos', shoulder: 'hombro', shoulders: 'hombros',
  calf: 'gemelo', calves: 'gemelos', chest: 'pecho',
  glute: 'glúteo', glutes: 'glúteos', gluteham: 'glúteo-femoral',
  triceps: 'tríceps', tricep: 'tríceps', biceps: 'bíceps',
  lat: 'dorsal', lats: 'dorsales', delt: 'deltoides', delts: 'deltoides', deltoid: 'deltoides',
  elbow: 'codo', elbows: 'codos', grip: 'agarre', gripless: 'sin agarre',
  wrist: 'muñeca', wrists: 'muñecas', scapula: 'escápula', scapular: 'escapular',
  heel: 'talón', heels: 'talones', toe: 'dedo del pie', toes: 'dedos del pie',
  foot: 'pie', forefoot: 'antepié', plantar: 'plantar',
  neck: 'cuello', abdominal: 'abdominal', abdominis: 'abdominal', abs: 'abdominales', ab: 'abdominal',
  oblique: 'oblicuo', obliques: 'oblicuos', hamstring: 'femoral', hamstrings: 'femoral',
  pec: 'pectoral', forearm: 'antebrazo', forearms: 'antebrazos',
  torso: 'torso', finger: 'dedo', fingers: 'dedos', face: 'cara', head: 'cabeza', core: 'core',
  trapezius: 'trapecio', tspine: 'columna torácica', serratus: 'serrato',
  flexor: 'flexor', tibialis: 'tibial', tibialias: 'tibial', ankle: 'tobillo',
  hand: 'mano', hands: 'manos', palm: 'palma', palms: 'palmas', body: 'cuerpo',
};

// ── Modificadores (adjetivos que se cuelan al final del nombre en español) ──
export const MODIFICADOR = {
  reverse: 'inverso', wide: 'abierto', narrow: 'cerrado', close: 'cerrado',
  front: 'frontal', rear: 'trasero', back: 'de espalda', backward: 'hacia atrás',
  forward: 'hacia delante', froward: 'hacia delante',
  diagonal: 'diagonal', straight: 'recto', bent: 'flexionado',
  neutral: 'neutro', pronated: 'pronado', supinated: 'supinado', supination: 'supinación', pronation: 'pronación', pronate: 'pronado',
  underhand: 'agarre supino', overhand: 'agarre prono',
  parallel: 'paralelo', high: 'alto', low: 'bajo', half: 'medio', quarter: 'un cuarto',
  full: 'completo', deep: 'profundo', deficit: 'con déficit', deficite: 'con déficit',
  sumo: 'sumo', bulgarian: 'búlgaro', romanian: 'rumano', stiff: 'con piernas rígidas',
  hack: 'hack', goblet: 'goblet', sissy: 'sissy', pike: 'en pica',
  internal: 'interna', external: 'externa', vertical: 'vertical', horizontal: 'horizontal',
  upright: 'erguido', upper: 'superior', lower: 'inferior', inner: 'interno',
  weighted: 'lastrado', assisted: 'asistido', banded: 'con banda elástica',
  paused: 'con pausa', negative: 'negativo', dynamic: 'dinámico', static: 'estático',
  isometric: 'isométrico', explosive: 'explosivo', power: 'de potencia',
  slow: 'lento', fast: 'rápido', partial: 'parcial', modified: 'modificado',
  advanced: 'avanzado', beginner: 'iniciación', basic: 'básico',
  military: 'militar', olympic: 'olímpico', arched: 'arqueado',
  angled: 'angulado', angle: 'con ángulo', slight: 'ligero',
  turned: 'girado', tight: 'apretado', loose: 'suelto',
  behind: 'por detrás', against: 'contra', overhead: 'por encima de la cabeza',
  cross: 'cruzado', crossed: 'cruzado', mixed: 'mixto', double: 'doble',
  triple: 'triple', wide: 'ancho', open: 'abierto', flat: 'plano',
  supported: 'con apoyo', unsupported: 'sin apoyo',
  elevated: 'elevado', declined: 'declinado', inclined: 'inclinado',
  standing: 'de pie', kneeling: 'de rodillas',
  self: 'con autoasistencia', counterbalanced: 'contrapesado',
  uneven: 'desigual', staggered: 'escalonado',
  bottom: 'desde abajo', top: 'desde arriba',
  spot: 'con apoyo puntual',
  lateral: 'lateral', side: 'lateral', padded: 'acolchado', hammer: 'martillo',
  prayer: 'en oración', curtsey: 'curtsey', stance: 'con postura amplia',
  planche: 'planche', russian: 'ruso', concentration: 'concentrado',
  lean: 'inclinado', pendulum: 'pendular', world: 'del mundo', inverse: 'inverso',
  flag: 'bandera', opposite: 'opuesto', under: 'por debajo',
};

// Palabras de relleno o sin significado propio en el nombre final: se quitan
// sin más (números de catálogo, preposiciones inglesas, conectores).
export const IGNORAR = new Set([
  'a', 'an', 'the', 'to', 'with', 'and', 'on', 'at', 'of', 'in', 'from',
  'over', 'out', 'up', 'down', 'through', 'between', 'around', 'off', 'by',
  'w', 't', 'y', 'l', 'v', 'exercise', 'variation', 'position', 'pose',
  'attachment', 'equipment', 'motion', 'range', 'point', 'tip', 'top',
  'good', 'degrees', 'degree',
]);

// Dígitos sueltos (45, 90, 180…) son ángulos — se ignoran del nombre, el
// ángulo exacto no cambia qué ES el ejercicio a efectos de catalogación.
