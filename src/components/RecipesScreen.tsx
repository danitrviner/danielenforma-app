import React, { useState } from 'react';
import { UserProfile, Recipe } from '../types';
import { RECIPES } from '../data';

interface RecipesScreenProps {
  profile: UserProfile;
}

export default function RecipesScreen({ profile }: RecipesScreenProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [activeRecipe, setActiveRecipe] = useState<Recipe | null>(null);
  
  // Track checklist states for the details view
  const [checkedIngredients, setCheckedIngredients] = useState<Record<string, boolean>>({});
  const [checkedSteps, setCheckedSteps] = useState<Record<number, boolean>>({});
  const [addedToast, setAddedToast] = useState(false);

  // Filter recipes based on tab selection
  const filteredRecipes = selectedCategory === 'all' 
    ? RECIPES 
    : RECIPES.filter(r => r.category === selectedCategory);

  const handleOpenRecipeDetail = (recipe: Recipe) => {
    setActiveRecipe(recipe);
    setCheckedIngredients({});
    setCheckedSteps({});
    setAddedToast(false);
  };

  const toggleIngredient = (ing: string) => {
    setCheckedIngredients(prev => ({
      ...prev,
      [ing]: !prev[ing]
    }));
  };

  const toggleStep = (idx: number) => {
    setCheckedSteps(prev => ({
      ...prev,
      [idx]: !prev[idx]
    }));
  };

  const triggerAddToMyDay = () => {
    setAddedToast(true);
    setTimeout(() => {
      setAddedToast(false);
    }, 2500);
  };

  return (
    <div className="space-y-6">
      {!activeRecipe ? (
        /* RECIPE EXPLORER HUB SCREEN */
        <>
          <div>
            <h1 className="font-sans font-extrabold text-3xl tracking-tight text-white">Recipe Explorer</h1>
            <p className="text-[#c6c9ab] text-sm mt-1">Alimenta tu musculatura y optimiza tu digestión con platos altos en proteínas.</p>
          </div>

          {/* Categories Pill Scroll */}
          <div className="w-full overflow-x-auto hide-scrollbar -mx-4 px-4 md:mx-0 md:px-0">
            <div className="flex gap-2.5 w-max">
              {[
                { id: 'all', name: 'Todos' },
                { id: 'high-protein', name: 'Alto en Proteína' },
                { id: 'fast-prep', name: 'Preparación Rápida' },
                { id: 'pre-workout', name: 'Pre-Entreno' },
                { id: 'recovery', name: 'Recuperación / Post' }
              ].map((category) => (
                <button
                  key={category.id}
                  onClick={() => setSelectedCategory(category.id)}
                  className={`px-4 py-2 rounded-full font-mono text-[10px] font-bold uppercase transition-all tracking-wider whitespace-nowrap ${selectedCategory === category.id ? 'bg-[#e2ff00] text-black shadow-md' : 'bg-[#1c1b1b] border border-[#2a2a2a] text-[#c6c9ab] hover:border-[#c6c9ab]/40'}`}
                >
                  {category.name}
                </button>
              ))}
            </div>
          </div>

          {/* Bento Grid Gallery */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
            
            {/* Featured Large Card */}
            {filteredRecipes.length > 0 && (
              <article 
                onClick={() => handleOpenRecipeDetail(filteredRecipes[0])}
                className="col-span-1 md:col-span-8 group relative rounded-xl overflow-hidden bg-[#201f1f] border border-[#2a2a2a] min-h-[310px] md:min-h-[380px] flex flex-col justify-end p-6 cursor-pointer hover:border-[#e2ff00]/40 transition-all shadow-md"
              >
                <img 
                  alt={filteredRecipes[0].title}
                  src={filteredRecipes[0].imageUrl} 
                  className="absolute inset-0 w-full h-full object-cover opacity-60 group-hover:scale-105 transition-transform duration-500"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-transparent"></div>
                
                <div className="relative z-10 space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <span className="inline-flex items-center gap-1 bg-[#e2ff00] text-black px-2 py-0.5 rounded font-mono text-[9px] font-bold uppercase tracking-wider">
                      <span className="material-symbols-outlined text-[12px]" style={{ fontVariationSettings: "'FILL' 1" }}>verified</span>
                      Cumple con tus MACROS
                    </span>
                    <span className="inline-block bg-[#121212]/80 backdrop-blur-sm text-white px-2 py-0.5 rounded font-mono text-[9px] font-bold uppercase tracking-wider border border-[#2a2a2a]">
                      Alto en Proteínas
                    </span>
                  </div>
                  <h3 className="font-sans font-black text-2xl text-white group-hover:text-[#e2ff00] transition-colors">{filteredRecipes[0].title}</h3>
                  <div className="flex items-center gap-4 text-xs font-mono text-[#c6c9ab]">
                    <div className="flex items-center gap-1">
                      <span className="material-symbols-outlined text-sm text-[#e2ff00]">schedule</span>
                      <span>{filteredRecipes[0].time}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="material-symbols-outlined text-sm text-[#e2ff00]">local_fire_department</span>
                      <span>{filteredRecipes[0].calories} kcal</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="font-bold text-[#e2ff00]">PRO:</span>
                      <span>{filteredRecipes[0].macros.pro}</span>
                    </div>
                  </div>
                </div>
              </article>
            )}

            {/* Small card list bento expansion */}
            {filteredRecipes.slice(1).map((recipe) => (
              <article 
                key={recipe.id}
                onClick={() => handleOpenRecipeDetail(recipe)}
                className="col-span-1 md:col-span-4 group relative rounded-xl overflow-hidden bg-[#201f1f] border border-[#2a2a2a] min-h-[250px] md:min-h-[380px] flex flex-col justify-end p-5 cursor-pointer hover:border-[#e2ff00]/40 transition-all shadow-md"
              >
                <img 
                  alt={recipe.title}
                  src={recipe.imageUrl} 
                  className="absolute inset-0 w-full h-full object-cover opacity-50 group-hover:scale-105 transition-transform duration-500"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-transparent"></div>
                
                <div className="relative z-10 space-y-2">
                  <span className="inline-block bg-[#1c1b1b]/80 backdrop-blur-sm text-white px-2 py-0.5 rounded font-mono text-[9px] font-bold uppercase tracking-wider border border-[#2a2a2a] mb-1">
                    {recipe.category === 'pre-workout' ? 'Pre-Entreno' : recipe.category === 'recovery' ? 'Post-Entreno' : 'Fácil Preparación'}
                  </span>
                  <h3 className="font-sans font-bold text-lg text-white leading-tight group-hover:text-[#e2ff00] transition-[#e2ff00]">{recipe.title}</h3>
                  <div className="grid grid-cols-2 gap-2 mt-2 text-xs font-mono text-[#c6c9ab] pt-2 border-t border-[#2a2a2a]/40">
                    <div className="flex items-center gap-1">
                      <span className="material-symbols-outlined text-xs">schedule</span>
                      <span>{recipe.time}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="font-bold text-[#e2ff00]">PRO:</span>
                      <span>{recipe.macros.pro}</span>
                    </div>
                  </div>
                </div>
              </article>
            ))}

            {filteredRecipes.length === 0 && (
              <div className="col-span-12 text-[#c6c9ab] text-center italic py-24 select-none">
                No se encontraron recetas optimizadas en esta categoría.
              </div>
            )}

          </div>
        </>
      ) : (
        /* RECIPE DETAIL VIEW (HIGH-FIDELITY SINGLE RECIPE VIEW) */
        <div className="space-y-6">
          {/* Detailed top navigation info slider */}
          <div className="flex justify-between items-center bg-[#1c1b1b] p-3 rounded-lg border border-[#2a2a2a]">
            <button 
              onClick={() => setActiveRecipe(null)}
              className="text-[#c6c9ab] hover:text-[#e2ff00] transition-colors p-2 rounded-full hover:bg-[#201f1f] flex items-center justify-center gap-2 text-xs font-mono"
            >
              <span className="material-symbols-outlined text-sm font-bold">arrow_back</span>
              Volver a Recetas
            </button>
            <span className="font-mono text-[10px] text-[#e2ff00] font-bold tracking-widest uppercase">FICHA TÉCNICA NUTRICIONAL</span>
          </div>

          {addedToast && (
            <div className="bg-[#00eefc]/15 border border-[#00eefc]/30 text-white p-3 rounded-lg text-sm flex items-center gap-3 animate-pulse">
              <span className="material-symbols-outlined text-[#00eefc]">add_task</span>
              <p className="font-bold">¡Receta guardada en tu plan del día! Macros anexados.</p>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* Left Column: Hero & Ingredients Checkboxes */}
            <div className="lg:col-span-5 space-y-6">
              <div className="relative w-full aspect-[4/3] rounded-xl overflow-hidden bg-[#201f1f] border border-[#2a2a2a] shadow-lg">
                <img 
                  alt={activeRecipe.title} 
                  src={activeRecipe.imageUrl} 
                  className="w-full h-full object-cover"
                />
                {/* Macro badging overlay */}
                <div className="absolute bottom-4 left-4 flex gap-2">
                  <span className="bg-[#131313]/90 backdrop-blur-sm px-2.5 py-1 rounded font-mono text-[10px] font-bold text-[#e2ff00] border border-[#e2ff00]/20">
                    {activeRecipe.macros.pro.toUpperCase()} PRO
                  </span>
                  <span className="bg-[#131313]/90 backdrop-blur-sm px-2.5 py-1 rounded font-mono text-[10px] font-bold text-[#00eefc] border border-[#00eefc]/20">
                    {activeRecipe.macros.carb.toUpperCase()} HC
                  </span>
                  <span className="bg-[#131313]/90 backdrop-blur-sm px-2.5 py-1 rounded font-mono text-[10px] font-bold text-red-300 border border-red-400/20">
                    {activeRecipe.macros.fat.toUpperCase()} FAT
                  </span>
                </div>
              </div>

              <div>
                <h2 className="font-sans font-black text-2xl text-[#e2ff00] mb-2">{activeRecipe.title}</h2>
                <div className="flex items-center gap-4 text-xs font-mono text-[#c6c9ab] uppercase tracking-wider">
                  <span className="flex items-center gap-1">
                    <span className="material-symbols-outlined text-sm">schedule</span>
                    {activeRecipe.time}
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="material-symbols-outlined text-sm">local_fire_department</span>
                    {activeRecipe.calories} KCAL
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="material-symbols-outlined text-sm text-[#e2ff00]">fitness_center</span>
                    {activeRecipe.difficulty}
                  </span>
                </div>
              </div>

              {/* Add to Day CTA action */}
              <button
                onClick={triggerAddToMyDay}
                className="w-full h-[48px] bg-[#e2ff00] hover:bg-[#bad200] text-black font-mono font-bold text-xs uppercase rounded-lg flex items-center justify-center gap-2 volt-glow active:scale-95 transition-all tracking-wider"
              >
                <span className="material-symbols-outlined text-base" style={{ fontVariationSettings: "'FILL' 1" }}>add_circle</span>
                Guardar en mi Almuerzo
              </button>

              {/* Ingredients card */}
              <section className="bg-[#121212] border border-[#2a2a2a] rounded-xl p-4 space-y-4">
                <h3 className="font-sans font-bold text-sm text-white uppercase tracking-wider border-b border-[#2a2a2a]/60 pb-2 flex items-center gap-2 select-none">
                  <span className="material-symbols-outlined text-[#e2ff00] text-lg">recipe</span>
                  Ingredientes Requeridos
                </h3>

                <ul className="space-y-1">
                  {activeRecipe.ingredients.map((ing, i) => {
                    const isChecked = !!checkedIngredients[ing];
                    return (
                      <li key={i}>
                        <label 
                          onClick={() => toggleIngredient(ing)}
                          className={`flex items-center justify-between p-2.5 rounded hover:bg-[#201f1f] cursor-pointer border border-transparent transition-all ${isChecked ? 'bg-[#1c1b1b] border-[#e2ff00]/10 text-[#c6c9ab]/60' : 'text-white'}`}
                        >
                          <div className="flex items-center gap-3">
                            <div className={`w-5 h-5 rounded border flex items-center justify-center transition-all ${isChecked ? 'bg-[#e2ff00] border-transparent text-black' : 'border-[#2a2a2a]'}`}>
                              {isChecked && <span className="material-symbols-outlined text-xs font-bold leading-none select-none">check</span>}
                            </div>
                            <span className={`text-xs font-sans ${isChecked ? 'line-through' : ''}`}>
                              {ing.split(' - ')[0]}
                            </span>
                          </div>
                          
                          <span className="font-mono text-[10px] text-[#c6c9ab] tracking-wider select-none shrink-0 font-bold">
                            {ing.split(' - ')[1] || ''}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </section>
            </div>

            {/* Right Column: Steps & Telemetry Table */}
            <div className="lg:col-span-7 space-y-6">
              
              {/* Protocol Execution Timeline */}
              <section className="bg-[#121212] border border-[#2a2a2a] rounded-xl p-5 space-y-6">
                <h3 className="font-sans font-bold text-sm text-[#e2ff00] uppercase tracking-wider pb-2 border-b border-[#2a2a2a]/60 flex items-center gap-2 select-none">
                  <span className="material-symbols-outlined text-base">format_list_numbered</span>
                  Protocolo de Preparación
                </h3>

                <div className="space-y-6">
                  {activeRecipe.protocol.map((step, idx) => {
                    const isChecked = !!checkedSteps[idx];
                    return (
                      <div 
                        key={idx} 
                        onClick={() => toggleStep(idx)}
                        className="flex gap-4 group cursor-pointer"
                      >
                        <div className="flex flex-col items-center">
                          <div className={`w-7 h-7 rounded-full border flex items-center justify-center font-mono text-[11px] font-bold shrink-0 transition-colors ${isChecked ? 'bg-[#e2ff00] border-transparent text-black shadow-md' : 'bg-transparent border-[#2a2a2a] text-[#c6c9ab] group-hover:border-[#e2ff00] group-hover:text-white'}`}>
                            {idx + 1}
                          </div>
                          <div className="w-[1px] h-full bg-[#2a2a2a] mt-2 group-last:hidden"></div>
                        </div>
                        <div className="pb-2">
                          <h4 className={`font-sans font-semibold text-xs mb-1 transition-colors ${isChecked ? 'text-[#c6c9ab]/60 line-through' : 'text-white'}`}>Paso Opcional {idx + 1}</h4>
                          <p className={`text-xs font-sans leading-relaxed transition-colors ${isChecked ? 'text-[#c6c9ab]/50' : 'text-[#c6c9ab]'}`}>{step}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* Advanced Dense Telemetry Table */}
              <section className="bg-[#121212] border border-[#2a2a2a] rounded-xl p-5 space-y-4">
                <h3 className="font-sans font-bold text-sm text-[#00eefc] uppercase tracking-wider pb-2 border-b border-[#2a2a2a]/60 flex items-center gap-2 select-none">
                  <span className="material-symbols-outlined text-base">analytics</span>
                  Nutritional Telemetry
                </h3>

                <div className="overflow-x-auto hide-scrollbar">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-[#2a2a2a]">
                        <th className="py-2.5 px-3 font-mono text-[10px] text-[#c6c9ab] uppercase tracking-wider">Métrica</th>
                        <th className="py-2.5 px-3 font-mono text-[10px] text-[#c6c9ab] uppercase tracking-wider text-right">Porción</th>
                        <th className="py-2.5 px-3 font-mono text-[10px] text-[#c6c9ab] uppercase tracking-wider text-right">% Diaria VQD</th>
                      </tr>
                    </thead>
                    <tbody className="font-mono text-xs text-[#e5e2e1]">
                      <tr className="hover:bg-[#1c1b1b] border-b border-[#2a2a2a]/40">
                        <td className="py-3 px-3">Calorías Totales</td>
                        <td className="py-3 px-3 text-right text-[#e2ff00] font-bold">{activeRecipe.calories} kcal</td>
                        <td className="py-3 px-3 text-right text-[#c6c9ab]">32%</td>
                      </tr>
                      <tr className="hover:bg-[#1c1b1b] border-b border-[#2a2a2a]/40">
                        <td className="py-3 px-3">Proteínas Puras</td>
                        <td className="py-3 px-3 text-right">{activeRecipe.macros.pro}</td>
                        <td className="py-3 px-3 text-right text-[#c6c9ab]">90%</td>
                      </tr>
                      <tr className="hover:bg-[#1c1b1b] border-b border-[#2a2a2a]/40">
                        <td className="py-3 px-3">Carbohidratos</td>
                        <td className="py-3 px-3 text-right">{activeRecipe.macros.carb}</td>
                        <td className="py-3 px-3 text-right text-[#c6c9ab]">22%</td>
                      </tr>
                      <tr className="hover:bg-[#1c1b1b] border-b border-[#2a2a2a]/40">
                        <td className="py-3 px-3">Grasas Totales</td>
                        <td className="py-3 px-3 text-right text-red-300">{activeRecipe.macros.fat}</td>
                        <td className="py-3 px-3 text-right text-[#c6c9ab]">23%</td>
                      </tr>
                      <tr className="hover:bg-[#1c1b1b]">
                        <td className="py-3 px-3 text-[#c6c9ab] text-[11px] pl-6">Fibra Alimentaria</td>
                        <td className="py-3 px-3 text-right text-[#c6c9ab] text-[11px]">~9g</td>
                        <td className="py-3 px-3 text-right text-[#c6c9ab] text-[11px]">36%</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </section>

            </div>

          </div>
        </div>
      )}
    </div>
  );
}
