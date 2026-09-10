# PDF417Lab para iPhone

Aplicación nativa independiente de la app Expo. Usa el paquete oficial ZXingCpp
2.3.0 mediante Swift Package Manager y procesa fotogramas de la cámara trasera.
Solo muestra resultados cuando los bytes coinciden exactamente con una de las
cuatro muestras ficticias de `../fixtures`. No guarda imágenes ni lecturas y no
consulta APIs. No interpreta documentos reales.

Abrir `PDF417Lab.xcodeproj` en Xcode, seleccionar el equipo de desarrollo propio
en Signing & Capabilities y elegir el iPhone como destino. Compilar con Run.
El dispositivo necesita modo de desarrollador y un perfil de firma válido.

Para regenerar el proyecto se requiere la gema Ruby `xcodeproj`:
`PDF417_TEAM=TU_EQUIPO ruby generate_project.rb`.

## Comprobación física

1. Abrir en el Mac una imagen de `../fixtures`, con sus márgenes completos.
2. Abrir PDF417Lab en el iPhone y permitir la cámara.
3. Enfocar la imagen hasta ver «PRUEBA …: CORRECTA».
4. Verificar el texto escapado y los bytes hexadecimales: el separador nulo debe
   aparecer como `00`, y debe conservarse también el contenido que sigue a él.
5. Pulsar «Volver a escanear» y repetir con las cuatro imágenes.

La prueba física es independiente del éxito de la compilación. La lectura local
en Python ya verificó las cuatro imágenes, pero usa otra versión del lector;
no garantiza que todas se lean con la cámara del iPhone.

Fuente de la integración: https://github.com/zxing-cpp/zxing-cpp/tree/v2.3.0/wrappers/ios
