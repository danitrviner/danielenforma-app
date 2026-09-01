/* ═══════════════════════════════════════════════════════════════════════════
   Fuentes científicas de las recomendaciones de salud

   Por qué existe este fichero. Apple rechazó la versión 1.0 (4) por la
   directriz 1.4.1 (Safety — Physical Harm): «The app includes medical
   information but does not include citations… the app provides health or
   medical recommendations in the nutrition section without citations». La
   exigencia literal es doble: que las citas existan y que sean FÁCILES DE
   ENCONTRAR. De ahí que no vivan en una página web externa ni al fondo de
   Ajustes, sino a un toque desde la propia sección de Nutrición.

   Regla al tocar esto: cada número que la app le enseña al usuario como
   recomendación de salud —kcal de mantenimiento, gramos de proteína, IDR de
   un micronutriente, zonas de frecuencia cardiaca— tiene que poder trazarse
   hasta una entrada de aquí. Si añades una fórmula nueva en `utils/`, añade
   su fuente aquí en el mismo commit; si cambias un valor, cambia la cita.

   Las URLs están comprobadas (200) y apuntan a la ficha del organismo o al
   registro de PubMed, no a resúmenes de terceros.
   ═══════════════════════════════════════════════════════════════════════════ */

export interface Fuente {
  /** Qué hace la app con esta fuente, en cristiano. */
  usoEnLaApp: string;
  /** Referencia completa: autores, título, publicación y año. */
  cita: string;
  url: string;
}

export interface BloqueDeFuentes {
  id: string;
  titulo: string;
  icono: string;
  intro: string;
  fuentes: Fuente[];
}

/** Aviso que acompaña SIEMPRE a las citas: son referencias, no una consulta médica. */
export const AVISO_MEDICO =
  'En Forma es una herramienta de apoyo al entrenamiento y la alimentación, no un producto ' +
  'sanitario ni un servicio de diagnóstico. La información que ves es de carácter educativo y ' +
  'general, está basada en las fuentes que se listan aquí abajo y no sustituye la valoración de ' +
  'un médico, un dietista-nutricionista u otro profesional sanitario colegiado. Consulta con un ' +
  'profesional antes de empezar una dieta o un programa de ejercicio, y especialmente si estás ' +
  'embarazada, en periodo de lactancia, eres menor de edad, tomas medicación o tienes cualquier ' +
  'patología o lesión. Ante un síntoma que te preocupe, acude a tu médico.';

/** Nota sobre el papel del entrenador: los valores concretos los fija una persona. */
export const AVISO_ENTRENADOR =
  'Los objetivos concretos de tu plan (calorías, intercambios, series o zonas) los fija tu ' +
  'entrenador a partir de tu situación real. Las fórmulas y valores de referencia de abajo son ' +
  'el punto de partida que la app calcula, no una prescripción automática.';

export const FUENTES: BloqueDeFuentes[] = [
  {
    id: 'energia',
    titulo: 'Energía y peso corporal',
    icono: 'local_fire_department',
    intro:
      'De aquí salen el gasto estimado («mantenimiento»), el objetivo de calorías de cada fase y ' +
      'la proyección de peso de la pestaña Periodización.',
    fuentes: [
      {
        usoEnLaApp:
          'Metabolismo basal estimado a partir de peso, altura, edad y sexo (ecuación de Mifflin-St Jeor).',
        cita:
          'Mifflin MD, St Jeor ST, Hill LA, Scott BJ, Daugherty SA, Koh YO. A new predictive equation ' +
          'for resting energy expenditure in healthy individuals. Am J Clin Nutr. 1990;51(2):241-247.',
        url: 'https://pubmed.ncbi.nlm.nih.gov/2305711/',
      },
      {
        usoEnLaApp:
          'Factores de actividad (1,2 sedentario · 1,375 poco activo · 1,55 activo · 1,725 muy activo) que multiplican el basal para estimar el gasto diario total.',
        cita:
          'FAO/WHO/UNU. Human energy requirements. Report of a Joint FAO/WHO/UNU Expert Consultation. ' +
          'FAO Food and Nutrition Technical Report Series 1. Roma, 2004.',
        url: 'https://www.fao.org/4/y5686e/y5686e00.htm',
      },
      {
        usoEnLaApp:
          'Equivalencia aproximada de 7.700 kcal acumuladas por cada kilo de peso corporal, usada para proyectar la evolución del peso. Es una aproximación lineal: el propio trabajo citado explica por qué el gasto se adapta y la pérdida real se frena con el tiempo.',
        cita:
          'Hall KD. What is the required energy deficit per unit weight loss? Int J Obes (Lond). 2008;32(3):573-576.',
        url: 'https://pubmed.ncbi.nlm.nih.gov/17848938/',
      },
      {
        usoEnLaApp:
          'Ritmo de pérdida de grasa moderado y déficits sostenibles en lugar de dietas muy agresivas.',
        cita:
          'Helms ER, Aragon AA, Fitschen PJ. Evidence-based recommendations for natural bodybuilding ' +
          'contest preparation: nutrition and supplementation. J Int Soc Sports Nutr. 2014;11:20.',
        url: 'https://pubmed.ncbi.nlm.nih.gov/24864135/',
      },
    ],
  },
  {
    id: 'macros',
    titulo: 'Proteína, grasa e hidratos',
    icono: 'egg_alt',
    intro:
      'De aquí sale el reparto de macronutrientes que propone el alta y el tamaño de los intercambios ' +
      '(HC y proteína 25 g · grasa 11 g, ~100 kcal cada uno).',
    fuentes: [
      {
        usoEnLaApp:
          'Objetivo de proteína en torno a 1,4-2,0 g por kilo de peso al día en personas que entrenan fuerza.',
        cita:
          'Jäger R, Kerksick CM, Campbell BI, et al. International Society of Sports Nutrition Position ' +
          'Stand: protein and exercise. J Int Soc Sports Nutr. 2017;14:20.',
        url: 'https://pubmed.ncbi.nlm.nih.gov/28642676/',
      },
      {
        usoEnLaApp:
          'Reparto general de energía, hidratos según la carga de entrenamiento y pautas de nutrición deportiva.',
        cita:
          'Thomas DT, Erdman KA, Burke LM. American College of Sports Medicine Joint Position Statement: ' +
          'Nutrition and Athletic Performance. Med Sci Sports Exerc. 2016;48(3):543-568.',
        url: 'https://pubmed.ncbi.nlm.nih.gov/26891166/',
      },
      {
        usoEnLaApp:
          'Techo de ganancia de masa muscular atribuible a más proteína, que es la razón de no subir el objetivo indefinidamente.',
        cita:
          'Morton RW, Murphy KT, McKellar SR, et al. A systematic review, meta-analysis and meta-regression ' +
          'of the effect of protein supplementation on resistance training-induced gains in muscle mass and ' +
          'strength in healthy adults. Br J Sports Med. 2018;52(6):376-384.',
        url: 'https://pubmed.ncbi.nlm.nih.gov/28698222/',
      },
      {
        usoEnLaApp:
          'Porcentaje de energía procedente de la grasa (20-35 %) y valores de referencia de macronutrientes para población europea.',
        cita: 'EFSA. Dietary Reference Values for the EU (DRV Finder). European Food Safety Authority.',
        url: 'https://multimedia.efsa.europa.eu/drvs/index.htm',
      },
    ],
  },
  {
    id: 'micros',
    titulo: 'Micronutrientes y valores de referencia',
    icono: 'nutrition',
    intro:
      'De aquí salen las ingestas diarias de referencia con las que el semáforo de micronutrientes ' +
      'marca posibles déficits o excesos. Es una ESTIMACIÓN a partir de porciones tipo, no una analítica.',
    fuentes: [
      {
        usoEnLaApp:
          'Ingestas de referencia de calcio, hierro, magnesio, zinc, potasio, folato y vitaminas A, C, D y B12 para población adulta.',
        cita: 'EFSA. Dietary Reference Values for nutrients — Summary report. EFSA Supporting Publication, 2017.',
        url: 'https://www.efsa.europa.eu/en/topics/topic/dietary-reference-values',
      },
      {
        usoEnLaApp: 'Límite de sodio (menos de 2 g al día, ≈5 g de sal) que dispara el aviso de exceso.',
        cita: 'World Health Organization. Guideline: Sodium intake for adults and children. Ginebra: OMS, 2012.',
        url: 'https://www.who.int/publications/i/item/9789241504836',
      },
      {
        usoEnLaApp:
          'Objetivo de fibra, consumo de fruta y verdura y pautas generales de alimentación saludable.',
        cita: 'World Health Organization. Healthy diet — Fact sheet. OMS, 2020.',
        url: 'https://www.who.int/news-room/fact-sheets/detail/healthy-diet',
      },
    ],
  },
  {
    id: 'alimentos',
    titulo: 'Composición de los alimentos',
    icono: 'grocery',
    intro:
      'Las kcal y los nutrientes que la app atribuye a cada alimento y a cada receta salen de tablas ' +
      'de composición publicadas, no de valores inventados.',
    fuentes: [
      {
        usoEnLaApp: 'Composición de los alimentos del banco de intercambios (base española).',
        cita: 'BEDCA — Base de Datos Española de Composición de Alimentos. Ministerio de Ciencia e Innovación / AESAN.',
        url: 'https://www.bedca.net/',
      },
      {
        usoEnLaApp: 'Composición de alimentos y contraste de micronutrientes no cubiertos por BEDCA.',
        cita: 'U.S. Department of Agriculture, Agricultural Research Service. FoodData Central.',
        url: 'https://fdc.nal.usda.gov/',
      },
    ],
  },
  {
    id: 'actividad',
    titulo: 'Actividad diaria y pasos',
    icono: 'directions_walk',
    intro:
      'De aquí sale el gasto que la app suma por los pasos del día (≈46 kcal por cada 1.000 pasos, ' +
      'ajustable por tu entrenador).',
    fuentes: [
      {
        usoEnLaApp: 'Coste energético (METs) de caminar y del resto de actividades cotidianas.',
        cita:
          'Herrmann SD, Willis EA, Ainsworth BE, et al. 2024 Adult Compendium of Physical Activities: ' +
          'a third update of the energy costs of human activities. J Sport Health Sci. 2024;13(1):6-12.',
        url: 'https://pubmed.ncbi.nlm.nih.gov/38242596/',
      },
      {
        usoEnLaApp: 'Recomendación de actividad física semanal en la que se apoyan los objetivos de pasos y cardio.',
        cita: 'World Health Organization. WHO guidelines on physical activity and sedentary behaviour. Ginebra: OMS, 2020.',
        url: 'https://www.who.int/publications/i/item/9789240015128',
      },
    ],
  },
  {
    id: 'cardio',
    titulo: 'Frecuencia cardiaca y cardio',
    icono: 'monitor_heart',
    intro:
      'De aquí salen tu frecuencia cardiaca máxima estimada, las zonas de intensidad y los programas ' +
      'progresivos de Zona 2 y VO₂máx.',
    fuentes: [
      {
        usoEnLaApp: 'Frecuencia cardiaca máxima estimada por edad: 208 − 0,7 × edad (más precisa que el clásico 220 − edad).',
        cita: 'Tanaka H, Monahan KD, Seals DR. Age-predicted maximal heart rate revisited. J Am Coll Cardiol. 2001;37(1):153-156.',
        url: 'https://pubmed.ncbi.nlm.nih.gov/11153730/',
      },
      {
        usoEnLaApp: 'Definición de las zonas de intensidad y criterios de prescripción de ejercicio cardiovascular.',
        cita: 'American College of Sports Medicine. ACSM’s Guidelines for Exercise Testing and Prescription. 11.ª ed. Wolters Kluwer.',
        url: 'https://www.acsm.org/education-resources/books/guidelines-exercise-testing-prescription',
      },
    ],
  },
  {
    id: 'fuerza',
    titulo: 'Entrenamiento de fuerza',
    icono: 'fitness_center',
    intro:
      'De aquí salen el balance de series por grupo muscular, la progresión de los mesociclos y la ' +
      'escala de esfuerzo (RIR) con la que registras cada serie.',
    fuentes: [
      {
        usoEnLaApp: 'Relación entre volumen semanal de series por grupo muscular y ganancia de masa muscular.',
        cita:
          'Schoenfeld BJ, Contreras B, Krieger J, et al. Resistance training volume enhances muscle hypertrophy ' +
          'but not strength in trained men. Med Sci Sports Exerc. 2019;51(1):94-103.',
        url: 'https://pubmed.ncbi.nlm.nih.gov/30153194/',
      },
      {
        usoEnLaApp: 'Frecuencia de entrenamiento por grupo muscular en el reparto semanal de las rutinas.',
        cita:
          'Schoenfeld BJ, Ogborn D, Krieger JW. Effects of resistance training frequency on measures of muscle ' +
          'hypertrophy: a systematic review and meta-analysis. Sports Med. 2016;46(11):1689-1697.',
        url: 'https://pubmed.ncbi.nlm.nih.gov/27102172/',
      },
      {
        usoEnLaApp: 'Escala de repeticiones en recámara (RIR) que usas para valorar el esfuerzo de cada serie.',
        cita:
          'Zourdos MC, Klemp A, Dolan C, et al. Novel resistance training-specific rating of perceived exertion ' +
          'scale measuring repetitions in reserve. J Strength Cond Res. 2016;30(1):267-275.',
        url: 'https://pubmed.ncbi.nlm.nih.gov/26049792/',
      },
    ],
  },
];
