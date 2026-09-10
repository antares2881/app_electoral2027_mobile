# Prueba independiente de PDF417

Estos códigos contienen exclusivamente datos inventados. No reproducen la
estructura de un documento de identidad ni permiten validar documentos reales.
No se conectan a ninguna API y no modifican la aplicación móvil.

## Reproducir

Crear un entorno virtual de Python e instalar con `pip install -r requirements.txt`.
Ejecutar `python generate_and_verify.py` desde esta carpeta. Las versiones usadas
y la comparación exacta de bytes quedan en `results.json`.

## Prueba con el iPhone

Abrir cada PNG de `fixtures` en el Mac, por separado, sin recortar sus márgenes.
Escanearlo con el lector principal y después con la cámara alternativa de la app.
Comparar el apartado «Contenido con caracteres visibles» con estos valores:

| Archivo | Texto esperado (representación JSON) |
| --- | --- |
| 01-texto.png | `"DEMO\|NUMERO=0000123456\|FIN"` |
| 02-salto-linea.png | `"DEMO\nNUMERO=0000123456\nFIN"` |
| 03-separador-nulo.png | `"DEMO\u0000NUMERO=0000123456\u0000FIN"` |
| 04-separador-grupo.png | `"DEMO\u001dNUMERO=0000123456\u001dFIN"` |

El número ficticio debe conservar sus ceros iniciales. Registrar para cada lector
si no detecta el código, devuelve todo el contenido o lo corta (y dónde).
Una lectura truncada en estas pruebas ayudaría a aislar un problema con los
separadores. No prueba que esa sea la causa del comportamiento de otros códigos.

La verificación local comprueba imágenes originales, no cámara, iluminación,
enfoque ni el motor nativo de iOS. El resultado del iPhone debe probarse aparte.
