#!/usr/bin/env ruby
# ══════════════════════════════════════════════════════════════════════════════
# Crea el target de Widget Extension "RestTimerWidget" en App.xcodeproj.
#
# `02-9` / `01-21`. El código Swift de la Live Activity está escrito desde el
# 21 de julio (`ios/App/RestTimerWidget/*.swift`, más `LiveActivityPlugin.swift`
# en el target principal), pero NUNCA estuvo dentro de ningún target: entonces
# no había Xcode en esta máquina, solo las Command Line Tools, así que no se
# pudo crear la extensión. Mientras tanto `Info.plist` declaraba
# `NSSupportsLiveActivities = true`, o sea que la app anunciaba una capacidad
# que no existía — incoherencia que un revisor de Apple mira.
#
# Se hace con un script y no a mano en Xcode por dos motivos: queda registrado
# qué se creó exactamente, y se puede volver a ejecutar si el proyecto se
# regenera (Capacitor reescribe partes del .pbxproj en algunos `cap sync`).
#
# Es IDEMPOTENTE: si el target ya existe, no hace nada.
#
#   ruby scripts/crear-target-widget.rb
# ══════════════════════════════════════════════════════════════════════════════

require 'xcodeproj'

RUTA      = File.expand_path('../ios/App/App.xcodeproj', __dir__)
NOMBRE    = 'RestTimerWidget'
BUNDLE_ID = 'com.danielenforma.app.RestTimerWidget'
EQUIPO    = 'CTHTC98W9A'
# iOS 16.1 es el mínimo de ActivityKit. Ponerlo más bajo no compila.
DEPLOYMENT = '16.1'

proyecto = Xcodeproj::Project.open(RUTA)

if proyecto.targets.any? { |t| t.name == NOMBRE }
  puts "El target #{NOMBRE} ya existe. No se toca nada."
  exit 0
end

app = proyecto.targets.find { |t| t.name == 'App' } or abort 'No se encuentra el target App'

# ── El target de extensión ────────────────────────────────────────────────────
widget = proyecto.new_target(:app_extension, NOMBRE, :ios, DEPLOYMENT)

# ── Info.plist de la extensión ────────────────────────────────────────────────
# NSExtensionPointIdentifier = widgetkit-extension es lo que convierte esto en
# un widget y no en cualquier otra extensión.
plist = <<~PLIST
  <?xml version="1.0" encoding="UTF-8"?>
  <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
  <plist version="1.0">
  <dict>
  	<key>CFBundleDisplayName</key>
  	<string>Descanso</string>
  	<key>CFBundleName</key>
  	<string>$(PRODUCT_NAME)</string>
  	<key>CFBundleIdentifier</key>
  	<string>$(PRODUCT_BUNDLE_IDENTIFIER)</string>
  	<!-- Sin CFBundleExecutable el .appex compila y se empotra, pero la
  	     instalación falla con "missing or invalid CFBundleExecutable". Lo
  	     rellena el build con el nombre real del binario. -->
  	<key>CFBundleExecutable</key>
  	<string>$(EXECUTABLE_NAME)</string>
  	<!-- XPC! es el tipo de paquete de una extensión; APPL es el de una app. -->
  	<key>CFBundlePackageType</key>
  	<string>XPC!</string>
  	<key>CFBundleInfoDictionaryVersion</key>
  	<string>6.0</string>
  	<key>CFBundleShortVersionString</key>
  	<string>$(MARKETING_VERSION)</string>
  	<key>CFBundleVersion</key>
  	<string>$(CURRENT_PROJECT_VERSION)</string>
  	<key>NSExtension</key>
  	<dict>
  		<key>NSExtensionPointIdentifier</key>
  		<string>com.apple.widgetkit-extension</string>
  	</dict>
  </dict>
  </plist>
PLIST
ruta_plist = File.join(File.dirname(RUTA), NOMBRE, 'Info.plist')
File.write(ruta_plist, plist)

# ── Ajustes de build ──────────────────────────────────────────────────────────
widget.build_configurations.each do |config|
  s = config.build_settings
  s['PRODUCT_BUNDLE_IDENTIFIER']            = BUNDLE_ID
  s['PRODUCT_NAME']                         = '$(TARGET_NAME)'
  s['INFOPLIST_FILE']                       = "#{NOMBRE}/Info.plist"
  s['IPHONEOS_DEPLOYMENT_TARGET']           = DEPLOYMENT
  s['DEVELOPMENT_TEAM']                     = EQUIPO
  s['SWIFT_VERSION']                        = '5.0'
  s['TARGETED_DEVICE_FAMILY']               = '1,2'
  s['SKIP_INSTALL']                         = 'YES'
  s['CODE_SIGN_STYLE']                      = 'Automatic'
  s['GENERATE_INFOPLIST_FILE']              = 'NO'
  s['MARKETING_VERSION']                    = '1.0'
  s['CURRENT_PROJECT_VERSION']              = '1'
  # Sin esto el binario de la extensión no encuentra SwiftUI/WidgetKit en runtime.
  s['LD_RUNPATH_SEARCH_PATHS']              = ['$(inherited)', '@executable_path/Frameworks', '@executable_path/../../Frameworks']
  s['ASSETCATALOG_COMPILER_WIDGET_BACKGROUND_COLOR_NAME'] = 'WidgetBackground'
end

# ── Grupo y ficheros ──────────────────────────────────────────────────────────
grupo = proyecto.main_group.find_subpath(NOMBRE, true)
grupo.set_source_tree('SOURCE_ROOT')
grupo.set_path(NOMBRE)

# RestTimerAttributes.swift pertenece a DOS targets a la vez: el principal lo
# necesita para arrancar la activity desde el plugin, y la extensión para
# renderizarla. Es exactamente lo que el comentario del propio fichero pedía
# marcar a mano en el inspector de Xcode.
compartidos = ['RestTimerAttributes.swift']
solo_widget = ['RestTimerWidgetBundle.swift', 'RestTimerWidgetLiveActivity.swift']

(compartidos + solo_widget).each do |nombre|
  ref = grupo.new_reference(nombre)
  widget.add_file_references([ref])
  app.add_file_references([ref]) if compartidos.include?(nombre)
end

# ── El puente JS → Swift, que tampoco estaba en ningún target ─────────────────
# `LiveActivityPlugin.swift` lleva en `ios/App/App/` desde el 21 de julio y NO
# estaba en el target principal: `grep -c` sobre el .pbxproj daba 0. Es decir,
# el plugin de Capacitor nunca se compiló, así que aunque la extensión hubiera
# existido, `startRestTimer()` desde React no habría tenido con qué hablar.
grupo_app = proyecto.main_group.find_subpath('App', true)
ya_esta = app.source_build_phase.files_references.any? { |r| r.path.to_s.end_with?('LiveActivityPlugin.swift') }
unless ya_esta
  ref_plugin = grupo_app.files.find { |f| f.path.to_s == 'LiveActivityPlugin.swift' } ||
               grupo_app.new_reference('LiveActivityPlugin.swift')
  app.add_file_references([ref_plugin])
  puts '  + LiveActivityPlugin.swift añadido al target App (no estaba en ninguno)'
end

# ── Empotrar la extensión dentro de la app ────────────────────────────────────
# Sin esta fase, la extensión compila pero no viaja dentro del .app y la Live
# Activity no aparece nunca.
fase = app.build_phases.find { |f| f.display_name == 'Embed Foundation Extensions' }
fase ||= begin
  f = proyecto.new(Xcodeproj::Project::Object::PBXCopyFilesBuildPhase)
  f.name = 'Embed Foundation Extensions'
  f.symbol_dst_subfolder_spec = :plug_ins
  f.run_only_for_deployment_postprocessing = '0'
  app.build_phases << f
  f
end
build_file = fase.add_file_reference(widget.product_reference)
build_file.settings = { 'ATTRIBUTES' => ['RemoveHeadersOnCopy'] }

app.add_dependency(widget)

proyecto.save
puts "Target #{NOMBRE} creado y empotrado en App."
puts "  bundle id : #{BUNDLE_ID}"
puts "  deployment: iOS #{DEPLOYMENT}"
puts "  ficheros  : #{(compartidos + solo_widget).join(', ')}"
