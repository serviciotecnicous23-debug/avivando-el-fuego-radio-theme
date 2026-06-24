# Avivando el Fuego — Tema personalizado de AzuraCast (v6)

Tema visual profesional para la radio **Avivando el Fuego** sobre AzuraCast en
https://40.160.2.176.sslip.io/public/avivando_el_fuego

## Archivos

- **avivando_custom.css** — Estilos del reproductor público. Va en
  AzuraCast Admin → Branding → *Custom CSS for Public Pages*.
- **avivando_custom.js** — Inyecta el logo de fuego 3D (WebGL), el visualizador
  audio-reactivo, los modales y la Media Session. Va en *Custom JS for Public Pages*.
- **dev/preview.html** — Banco de pruebas local: imita el DOM de AzuraCast para
  ver el tema sin tocar producción. Ábrelo con un servidor estático:
  `python -m http.server 8137` → http://127.0.0.1:8137/dev/preview.html

## Cómo desplegar

1. Copia el contenido COMPLETO de `avivando_custom.css`.
2. Entra a https://40.160.2.176.sslip.io/admin/branding (login admin).
3. Pega en *Custom CSS for Public Pages* (Ctrl+A para borrar lo viejo, Ctrl+V).
4. Repite con `avivando_custom.js` en *Custom JS for Public Pages*.
5. **SAVE CHANGES**.
6. Recarga la página pública con Ctrl+Shift+R.

## Qué hace la v6 (técnica profesional actual)

- **Logo de fuego 3D**: shader WebGL (fragment shader con ruido fbm). Es una
  llama real calculada en la GPU, no una imagen. Muy liviana en móvil.
- **Visualizador audio-reactivo**: Web Audio API (`AnalyserNode`). Si no puede
  leer el audio (CORS, etc.) cae a un movimiento sintético — nunca corta el audio.
- **Media Session API**: metadatos en la pantalla de bloqueo y audio de fondo.
- **Rendimiento**: pausa TODO el render cuando la pestaña se oculta
  (Page Visibility API) → evita que el teléfono se ralentice en segundo plano.
  Respeta `prefers-reduced-motion`.
- **Un solo CSS limpio** (sin los triplicados de versiones anteriores) y JS modular.

## Selectores nativos de AzuraCast usados

`.now-playing-title`, `.now-playing-artist`, `img.album_art`, `a.album-art`,
`.progress-bar`, `.time-display-played`, `.time-display-total`,
`.radio-control-play-button` (play), `.form-range` (volumen).
> Nota: en versiones nuevas de AzuraCast el botón play es `.radio-control-play-button`
> (antes `.btn-play`, ya obsoleto).

## Identidad visual

- Violetas: `#13062a` `#2d1147` `#4a2070` `#6b3290`
- Fuego: `#cc1100` `#ff4500` `#ff6b00` `#ff8800`
- Dorados: `#ffaa00` `#ffd700` `#ffe066`

## Stack

- AzuraCast self-hosted en VPS
- Público: WebGL + Web Audio API + SVG/CSS, vanilla JS (sin dependencias)
