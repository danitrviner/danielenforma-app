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
 * Ya no lleva XP ni «Lv». Había DOS sistemas de niveles en la app y los dos
 * salían en esta misma pantalla: el numérico —que nadie leía fuera de esta
 * tarjeta, que subía viendo lecciones y cuyos dos escritores ni siquiera se
 * ponían de acuerdo en cuántos puntos vale un nivel— y la escalera con nombres
 * y criterios de `LevelLadderCard`, que es la que significa algo. «Lv 3» al
 * lado de «Nivel: Guerrero» no se entendía (Dani, 10-09-2026).
 *
 * El numérico se fue; la escalera se queda, justo encima de esta tarjeta.
 */
export default function TarjetaIdentidadAtleta({ profile }: { profile: UserProfile }) {
  return (
    <div className="bg-surface border border-hairline rounded-canvas p-5 relative overflow-hidden flex flex-col gap-5">
      <div className="absolute top-0 right-0 w-32 h-32 bg-accent/5 blur-3xl rounded-full pointer-events-none"></div>

      <div className="flex items-center gap-4">
        <div className="w-16 h-16 rounded-full border-2 border-accent overflow-hidden flex-shrink-0">
          <Avatar src={profile.avatarUrl} name={profile.displayName} alt="Avatar" className="w-full h-full object-cover" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-sans font-bold text-title-m text-ink">{profile.displayName}</h3>
          <p className="font-mono text-caption text-ink-2 truncate">{profile.email}</p>
        </div>
      </div>

      {profile.targetWeight > 0 && (
        <StatTile icon="flag" label="Meta" value={`${profile.targetWeight}kg`} />
      )}
    </div>
  );
}
