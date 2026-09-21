import { describe, it, expect } from 'vitest';
import { SYSTEM_FOODS } from '../nutricion_seed_en_forma';
import { normalizarTexto, coincideBusqueda } from './busqueda';
import {
  EQUIVALENCIAS,
  equivalenciasPara,
  coincidePorEquivalencia,
  explicacionesPara,
  esAlimentoLibre,
} from './equivalenciasDeAlimentos';

const LABELS = [...new Set(SYSTEM_FOODS.map(f => f.label))];

/** Lo que vería el atleta al escribir `termino`: literal o por equivalencia. */
function resultados(termino: string): string[] {
  return LABELS.filter(l => coincideBusqueda(l, termino) || coincidePorEquivalencia(l, termino));
}

describe('el diccionario apunta a alimentos que existen', () => {
  /* La trampa de un diccionario escrito a mano es que apunte a un alimento que
   * no está o que se llame distinto de como se recordaba: la búsqueda seguiría
   * dando cero, pero ahora en silencio y con un módulo entero de por medio.
   * Este test lo hace imposible de mantener roto. */
  it('cada fragmento de `cubiertoPor` casa con al menos un alimento del banco', () => {
    const huerfanos: string[] = [];
    for (const eq of EQUIVALENCIAS) {
      for (const frag of eq.cubiertoPor ?? []) {
        const casa = LABELS.some(l => normalizarTexto(l).includes(normalizarTexto(frag)));
        if (!casa) huerfanos.push(`${eq.busca[0]} → "${frag}"`);
      }
    }
    expect(huerfanos, `Fragmentos que no existen en el banco:\n${huerfanos.join('\n')}`).toEqual([]);
  });

  it('ninguna entrada se queda sin explicación', () => {
    expect(EQUIVALENCIAS.filter(eq => !eq.explica.trim())).toEqual([]);
  });
});

describe('el diccionario no se contradice con el banco', () => {
  /* El fallo más caro que puede tener este módulo no es no encontrar algo: es
   * decir que algo es LIBRE cuando el banco lo cobra. El atleta se come un
   * plato de espárragos convencido de que no cuenta y se le va el día.
   *
   * Encontrados así el 21-09: «espárragos» estaba declarado libre y está en el
   * banco a 400 g por intercambio; «tomate» y «pimiento» lo mismo con el
   * tomate frito y los pimientos en bote. */
  /* Choques que hemos mirado uno a uno y son inofensivos: la palabra aparece
   * DENTRO del nombre de otro alimento, no como el alimento en sí. Se declaran
   * aquí, con su motivo, en vez de relajar el test — mismo criterio que
   * `SIN_DATOS_DEL_ATLETA` en `db/borradoCuenta.test.ts`. */
  const CHOQUES_ACEPTADOS: Record<string, string> = {
    calabaza: 'sale dentro de «pipas o semillas (girasol, lino, calabaza, chía)»: ahí es la pipa, no la verdura',
  };

  it('nada declarado libre aparece en el banco sin explicar la excepción', () => {
    // Palabra a palabra, no por subcadena: buscar "sal" no puede saltar por
    // "salmón" ni "agua" por "paraguayo".
    const palabras = (t: string) => new Set(
      normalizarTexto(t).split(/[\s,()]+/).filter(p => p.length > 2)
        .map(p => (p.length > 4 && p.endsWith('es') ? p.slice(0, -2)
                 : p.length > 3 && p.endsWith('s') ? p.slice(0, -1) : p)));

    const mentiras: string[] = [];
    for (const eq of EQUIVALENCIAS) {
      if (eq.cubiertoPor?.length) continue;
      for (const b of eq.busca) {
        if (b in CHOQUES_ACEPTADOS) continue;
        const clave = [...palabras(b)];
        const enBanco = LABELS.find(l => {
          const w = palabras(l);
          return clave.length > 0 && clave.every(p => w.has(p));
        });
        // Vale que esté en el banco SI hay otra entrada que explique la
        // excepción: es justo el caso de «tomate» y el tomate frito.
        const hayExcepcion = equivalenciasPara(b).some(e => e.cubiertoPor?.length);
        if (enBanco && !hayExcepcion) {
          mentiras.push(`«${b}» se declara libre, el banco tiene «${enBanco}» y nada lo explica`);
        }
      }
    }
    expect(mentiras, mentiras.join('\n')).toEqual([]);
  });

  it('ninguna palabra del diccionario es demasiado corta para casar nunca', () => {
    // `palabrasClave` descarta lo de 2 letras o menos, así que una entrada
    // como «té» entra en el fichero y no se activa jamás: código muerto que
    // parece cobertura. Pasó con «te» el 21-09.
    const muertas = EQUIVALENCIAS.flatMap(eq =>
      eq.busca.filter(b => equivalenciasPara(b).length === 0).map(b => `${eq.busca[0]}: «${b}»`));
    expect(muertas, `Entradas que nunca casan:\n${muertas.join('\n')}`).toEqual([]);
  });
});

describe('las excepciones de la verdura, que son la trampa del sistema', () => {
  it.each([
    ['esparragos', 'judía verde, alcachofa, menestra'],
    ['alcachofa', 'judía verde, alcachofa, menestra'],
    ['menestra', 'judía verde, alcachofa, menestra'],
    ['judias verdes', 'judía verde, alcachofa, menestra'],
    ['tomate frito', 'tomate frito'],
    ['pimientos en bote', 'pimientos en bote'],
  ])('«%s» NO es libre y encuentra «%s»', (termino, esperado) => {
    expect(esAlimentoLibre(termino)).toBe(false);
    expect(resultados(termino).some(l => l.includes(esperado))).toBe(true);
  });

  it('el tomate a secas sigue siendo libre, y lo dice', () => {
    expect(explicacionesPara('tomate')[0]).toMatch(/libre/i);
  });

  it('«tomate frito» avisa de la excepción, no de que sea libre', () => {
    expect(explicacionesPara('tomate frito').some(e => /aceite/i.test(e))).toBe(true);
  });
});

describe('una palabra no arrastra grupos que no vienen a cuento', () => {
  it('«huevo cocido» no habla de legumbres', () => {
    expect(explicacionesPara('huevo cocido').some(e => /legumbre/i.test(e))).toBe(false);
  });

  it('«jamon cocido» tampoco', () => {
    expect(explicacionesPara('jamon cocido').some(e => /legumbre/i.test(e))).toBe(false);
  });

  it('«calabaza» es la verdura, no las pipas', () => {
    expect(explicacionesPara('calabaza').some(e => /semilla/i.test(e))).toBe(false);
    expect(esAlimentoLibre('calabaza')).toBe(true);
  });

  it('pero «pipas de calabaza» sí son las pipas', () => {
    expect(resultados('pipas de calabaza').some(l => l.includes('pipas o semillas'))).toBe(true);
  });
});

describe('lo que pidió Dani', () => {
  it('«lentejas» encuentra la legumbre', () => {
    const r = resultados('lentejas');
    expect(r.some(l => l.includes('legumbre cocida'))).toBe(true);
    expect(r.some(l => l.includes('legumbre en seco'))).toBe(true);
  });

  it('«fiambre de pavo» encuentra la carne blanca', () => {
    expect(resultados('fiambre de pavo').some(l => l.includes('carne blanca'))).toBe(true);
  });

  it('y además lo explica en pantalla, no solo lo encuentra', () => {
    expect(explicacionesPara('lentejas')[0]).toMatch(/legumbre/i);
    expect(explicacionesPara('fiambre de pavo')[0]).toMatch(/carne blanca/i);
  });
});

describe('otros saltos que el atleta no tiene por qué saber', () => {
  it.each([
    ['garbanzos', 'legumbre cocida'],
    ['merluza', 'pescado blanco'],
    ['salmon', 'pescado azul'],
    ['pulpo', 'cefalópodos'],
    ['almendras', 'frutos secos sin freír'],
    ['crema de cacahuete', 'crema de frutos secos'],
    ['espaguetis', 'arroz, pasta, couscous o quinoa'],
    ['avena', 'cereales (corn flakes'],
    ['manchego', 'queso (curado'],
    ['ternera', 'carne roja magra'],
    ['cordero', 'carne roja grasa'],
    ['jamon serrano', 'jamón serrano'],
    ['batata', 'boniato'],
    ['palta', 'aguacate'],
    ['fresas', 'frutos rojos'],
    ['aove', 'aceite'],
    ['ñoquis', 'gnocchi'],
    ['quark', 'queso fresco batido'],
  ])('«%s» encuentra «%s»', (termino, esperado) => {
    expect(resultados(termino).some(l => l.includes(esperado))).toBe(true);
  });
});

describe('el singular y el plural son la misma palabra', () => {
  it.each(['lenteja', 'lentejas', 'garbanzo', 'garbanzos', 'almendra', 'almendras'])(
    '«%s» funciona igual',
    termino => {
      expect(equivalenciasPara(termino).length).toBeGreaterThan(0);
    },
  );
});

describe('lo que es libre se dice, no se calla', () => {
  it.each(['brocoli', 'brócoli', 'lechuga', 'calabacin', 'espinacas', 'ensalada'])(
    '«%s» se declara libre',
    termino => {
      expect(esAlimentoLibre(termino)).toBe(true);
      expect(explicacionesPara(termino)[0]).toMatch(/libre/i);
    },
  );

  it('el café y las especias también', () => {
    expect(esAlimentoLibre('cafe')).toBe(true);
    expect(esAlimentoLibre('vinagre')).toBe(true);
  });

  it('un alimento que SÍ cuenta no se declara libre', () => {
    expect(esAlimentoLibre('lentejas')).toBe(false);
    expect(esAlimentoLibre('pollo')).toBe(false);
  });
});

describe('no arrastra de más', () => {
  it('una palabra que no está en el diccionario no explica nada', () => {
    expect(equivalenciasPara('cosaquenoexiste')).toEqual([]);
    expect(esAlimentoLibre('cosaquenoexiste')).toBe(false);
  });

  it('un término vacío no dispara ninguna equivalencia', () => {
    expect(equivalenciasPara('')).toEqual([]);
    expect(equivalenciasPara('   ')).toEqual([]);
  });

  it('«pollo» no arrastra el pescado', () => {
    expect(resultados('pollo').some(l => l.includes('pescado'))).toBe(false);
  });

  it('las dos letras sueltas no valen como palabra clave', () => {
    expect(equivalenciasPara('de')).toEqual([]);
  });
});
