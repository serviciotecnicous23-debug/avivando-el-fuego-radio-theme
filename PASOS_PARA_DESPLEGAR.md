# Avivando el Fuego — Tema personalizado de AzuraCast

Este repositorio contiene el tema visual personalizado para la radio **Avivando el Fuego** que corre sobre AzuraCast en https://40.160.2.176.sslip.io/public/avivando_el_fuego

## Archivos

- **avivando_custom.css** — Hoja de estilos para el reproductor publico. Va pegada en AzuraCast Admin -> Custom Branding -> Custom CSS for Public Pages.
- **avivando_custom.js** — JavaScript que inyecta el logo SVG animado y el visualizador. Va pegado en Custom JS for Public Pages.

## Como aplicar cambios

1. Edita el archivo aqui en GitHub o en local.
2. Copia el contenido completo del archivo modificado.
3. Entra a https://40.160.2.176.sslip.io/admin/branding (login admin).
4. Pega el contenido en el editor correspondiente (Ctrl+A para seleccionar lo viejo, Ctrl+V para pegar).
5. Click en SAVE CHANGES al final.
6. Recarga la pagina publica con Ctrl+Shift+R para ver los cambios.

## Identidad visual

Paleta basada en el logo del Ministerio:
- Violetas: #13062a, #2d1147, #4a2070, #6b3290
- Naranjas/fuego: #cc1100, #ff4500, #ff6b00, #ff8800
- Amarillos/dorados: #ffaa00, #ffd700, #ffe066

Animaciones SVG: el logo cobra vida (llamas que ondulan, halo pulsante, chispas que ascienden) sin ser una imagen pegada.

## Stack

- AzuraCast self-hosted en VPS
- Vue 3 + CodeMirror 6 en el panel admin
- SVG inline + CSS animations en el publico
