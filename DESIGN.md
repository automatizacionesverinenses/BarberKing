# Sistema de Diseño: "Latón y Carbón" (BarberKing)

Este sistema de diseño fue creado para transmitir la experiencia de una barbería clásica premium, alejándose de estéticas genéricas ("hechas con IA") y apostando por una identidad sobria, elegante y con mucha personalidad.

## 1. Paleta de Colores
Inspirada en el interior de una barbería tradicional de lujo: sillas de cuero, navajas de acero al carbono, espejos envejecidos y detalles en latón.

- **Fondo Principal (`--color-bg-primary`): `#0F1014`** - Un "carbón oscuro" con un levísimo matiz azul, más profundo y elegante que un gris oscuro o negro puro.
- **Superficie (`--color-bg-secondary`): `#16181D`** - Un gris oscuro utilizado para tarjetas y fondos de sección secundarios, aportando profundidad sin contrastes agresivos.
- **Texto Principal (`--color-text-primary`): `#F4F4F5`** - Blanco roto ahumado, garantiza legibilidad sin cansar la vista (evitamos el blanco `#FFFFFF` puro).
- **Texto Secundario (`--color-text-secondary`): `#A1A1AA`** - Gris neutro para metadatos, descripciones secundarias e información de contacto.
- **Acento Principal ("Latón", `--color-gold-primary`): `#D4AF37`** - Un dorado/latón apagado y mate, no un amarillo chillón. Se usa para botones principales, estrellas, y el "razor line".
- **Acento Secundario (`--color-gold-muted`): `rgba(212, 175, 55, 0.15)`** - Para estados de hover sutiles o fondos de iconos, manteniendo la esencia del latón pero sin competir por atención.

## 2. Tipografía
Combinación de fuentes self-hosted / Google Fonts para equilibrar tradición y legibilidad moderna:

- **Display / Títulos: `DM Serif Display`**
  - Uso: Títulos de secciones, el Hero y nombres del equipo.
  - Carácter: Una serif con mucha presencia y contraste en sus trazos, evocando revistas editoriales clásicas y letreros tradicionales.
- **Cuerpo / Textos: `Outfit`**
  - Uso: Párrafos, descripciones de servicios, textos largos.
  - Carácter: Sans-serif geométrica moderna que aporta legibilidad absoluta en tamaños pequeños y contraste perfecto con la fuente Display.
- **Utilidad / Datos: `JetBrains Mono` (Opcional)**
  - Uso: Precios (`15€`), horas (`40 min`), números de teléfono.
  - Carácter: Monoespaciada que facilita el escaneo rápido de tarifas y horarios.

## 3. Iconografía
**Adiós a los Emojis.** 
Se han sustituido por completo todos los emojis (✂️, 🧔, ✅) por **iconografía SVG limpia de línea unificada** (estilo Lucide). Esto evita la asociación con webs no pulidas o plantillas genéricas. Los iconos utilizan el color de texto secundario o el latón, y comparten el mismo `stroke-width` (1.5px a 2px) para mantener coherencia visual.

## 4. Elemento Firma: "The Razor Line"
En lugar de abusar de ornamentos por toda la página, el elemento distintivo de la marca es un separador fino ("The Razor Line") — una línea sutil con un icono de navaja o tijeras en el centro. Este elemento se ubica **únicamente** separando el Hero del resto del contenido (y sutilmente en el footer o títulos principales), proporcionando un ancla visual memorable pero contenida.

## 5. Layout y Composición
- **Hero:** Tratamiento fotográfico cinemático con un gradiente superpuesto muy sutil (`linear-gradient(to right, rgba(15,16,20,0.95), rgba(15,16,20,0.5))`). Esto permite que la tipografía de alto contraste respire. Las estadísticas (5K+, 8 años) se han integrado en una barra de metacrilato oscuro (`backdrop-filter`) en la base.
- **Nosotros / Filosofía:** Layout asimétrico. Texto a la izquierda con mucho aire (espacio en blanco) y la imagen a la derecha, con sutiles acentos en latón.
- **Tarjetas de Equipo & Servicios:** Eliminación de sombras difusas (box-shadows pesadas). Se ha optado por bordes muy finos (`1px solid rgba(255,255,255,0.05)`) y un cambio de fondo al hacer hover.
- **Reserva (Booking):** Enfoque absoluto en la limpieza del formulario. Stepper minimalista, inputs con focus states en color latón, y transiciones suaves entre los pasos sin parpadeos bruscos.
