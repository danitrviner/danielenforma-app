import React from 'react';
import { UserProfile } from '../types';
import { Avatar } from './ui';
import StatTile from './StatTile';

/**
 * Identidad del atleta: avatar, nombre, nivel, barra de XP y meta de peso.
 *
 * Vivía encima de las pestañas del Perfil, ocupando la primera pantalla entera
 * antes de que se pudiera llegar a nada. Ahora va al final del Road map, que es
 * donde tiene sentido: después del calendario y de los logros, cerrando el
 * relato de por dónde va (Dani, 10-09-2026).
 *
 * OJO con el denominador de XP. Aquí se pinta `/400` porque es lo que hace el
 * único escritor real de niveles (`db/profiles.ts`, +50 por revisión y vuelta a
 * empezar al llegar a 400). `utils/xp.ts` cuenta de otra manera (XP acumulado,
 * `XP_PER_LEVEL = 100`) y las dos son incompatibles entre sí, pero unificarlas
 * cambia el nivel que ya tienen los atletas: es una migración de datos, no un
 * cambio de constante, y no entra aquí.
 */
export default function TarjetaIdentidadAtleta({ profile }: { profile: UserProfile }) {
  return (
    <div className="bg-surface border border-hairline rounded-canvas p-5 relative overflow-hidden flex flex-col gap-5">
      <div className="absolute top-0 right-0 w-32 h-32 bg-accent/5 blur-3xl rounded-full pointer-events-none"></div>

      <div className="flex items-center gap-4">
        <div className="relative inline-block flex-shrink-0">
          <div className="w-16 h-16 rounded-full border-2 border-accent overflow-hidden">
            <Avatar src={profile.avatarUrl} name={profile.displayName} alt="Avatar" className="w-full h-full object-cover" />
          </div>
          <div className="absolute -bottom-1 -right-1 bg-accent text-black text-caption font-bold px-2 rounded-full leading-tight whitespace-nowrap shadow">Lv {profile.level}</div>
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-sans font-bold text-title-m text-ink">{profile.displayName}</h3>
          <p className="font-mono text-caption text-ink-2 truncate">{profile.email}</p>
          <div className="flex items-center gap-2 mt-2">
            <div className="flex-1 h-2 bg-raised rounded-full overflow-hidden">
              <div className="h-full bg-accent" style={{ width: `${Math.min(100, (profile.xp / 400) * 100)}%` }}></div>
            </div>
            <span className="font-mono text-caption text-ink-2 flex-shrink-0">{profile.xp}/400 XP</span>
          </div>
        </div>
      </div>

      <div className={`grid gap-3 ${profile.targetWeight > 0 ? 'grid-cols-2' : 'grid-cols-1'}`}>
        <StatTile icon="workspace_premium" label="Nivel" value={profile.level} />
        {profile.targetWeight > 0 && (
          <StatTile icon="flag" label="Meta" value={`${profile.targetWeight}kg`} />
        )}
      </div>
    </div>
  );
}
