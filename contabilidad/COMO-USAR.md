# Cómo usar ContaPY

## Opción A – Una sola persona, sin instalar nada
1. Descomprima la carpeta `contabilidad` en su PC (por ejemplo en Documentos).
2. Abra el archivo **`index.html`** con doble clic (se abre en Chrome, Edge o Firefox).
3. Cree el primer cliente en la pestaña **Clientes** y empiece a cargar.

Los datos quedan guardados **en ese navegador de esa PC**. Haga seguido
**Clientes → Descargar respaldo** y guarde el archivo en un pendrive o en la nube.

## Opción B – Estudio contable con varias personas (recomendado)
1. En la PC que hará de "servidor" (la que queda siempre encendida), instale
   **Node.js** desde https://nodejs.org (versión LTS, opciones por defecto).
2. Haga doble clic en **`Iniciar ContaPY (Windows).bat`**
   (en Mac: `Iniciar ContaPY (Mac).command`).
3. La primera vez la ventana negra muestra la contraseña del usuario **admin**: anótela.
   Se abre el navegador en http://localhost:3000 → ingrese con `admin` y esa contraseña.
4. Cree los usuarios del equipo (en la misma carpeta, desde una ventana de comandos):

       node server/server.js usuario-agregar maria Clave123 editor
       node server/server.js usuario-agregar admin NuevaClave admin

   Roles: `admin` (todo y descarga de respaldos), `editor` (carga), `lectura` (solo consulta).
5. Las otras PCs de la oficina entran con la dirección que muestra la ventana negra
   ("Desde otras PCs: http://192.168.x.x:3000").

**No cierre la ventana negra** mientras se use el sistema. Los datos y los respaldos
automáticos quedan en `contabilidad/server/datos/`: copie esa carpeta a un disco
externo o a la nube una vez por semana.

## Cómo se trabaja día a día
- **Inicio** muestra el mes de trabajo: ventas, compras, IVA a pagar, resultado, la lista de
  tareas del mes (con su estado) y alertas (RUC mal escrito, duplicados, falta tipo de cambio,
  balance que no cuadra, vencimientos de la semana). Abajo, un resumen de todos los clientes.
- El **período** se elige una sola vez arriba y vale para todas las pantallas.
- **Ctrl + K** (o el botón "Ir a…") busca cualquier pantalla escribiendo su nombre.
- El menú está ordenado en desplegables: **Cliente**, **Operaciones**, **Tesorería**,
  **Impuestos** (IVA, IRE, IRP e IDU), **Informes** y **Cierre**. Cada opción tiene una
  descripción corta. En **Inicio → Personalizar menú** puede ocultar los módulos que no use.
- En cada venta o compra se marca **a qué impuesto imputa** (IVA, IRE, IRP) y se puede
  escribir un **concepto**. El proveedor o cliente recuerda la última imputación. Los valores
  por defecto de cada cliente se eligen en Cliente → Clientes ("Impuestos de los comprobantes").
  Lo que no imputa al IVA no entra en el Form. 120 y su IVA va al gasto.
- **Cuentas de IRP**: el plan estándar trae los grupos 4.3 (ingresos IRP) y 5.6 (egresos
  personales IRP), cada cuenta con su casilla del Form. 515 (columna "Cas. IRP"). Para clientes
  creados antes, use Plan de cuentas → "Agregar cuentas de IRP".
- **IRP**: Impuestos → IRP → Form. 515 (servicios personales) o Form. 516 (rentas del capital).
  En el 515, las casillas en azul son valores sugeridos por la contabilidad; escriba encima para cambiarlos.
- En el **Form. 120**, toque el número de una casilla para ver qué va ahí según el instructivo
  y de dónde lo toma el sistema. **Imprimir proforma** arma la hoja para transcribir en Marangatu.
- **Descargas en PDF o Excel**: todo informe (balances, libros, formularios, mayores, etc.)
  pregunta el formato al descargar (teclas **P** = PDF, **E** = Excel). Ambos salen con el
  encabezado de la empresa, títulos, totales resaltados, número de página y, en los balances,
  líneas de firma del representante legal y del contador. Las plantillas para importar siguen
  bajando directo en Excel.
- **Formularios** (120, 500, 501 Simple, Resimple, 515 y 516): en pantalla y al descargar
  (PDF o Excel) salen con el formato de la proforma: recuadro con el número de formulario,
  rubros, incisos y cada importe en su casilla.
- **Moneda**: los estados RG 49 se descargan en guaraníes **o** en dólares (selector "Moneda").
  El balance comparativo por niveles muestra guaraníes y dólares juntos, sin variaciones.
- **Estados financieros RG 49** (Informes → Balances): "Ver estados RG 49" muestra los 6 anexos
  del formato oficial (Balance General, Estado de Resultados, Flujo de efectivo, Variación del
  patrimonio neto, Notas y Cuadro de revalúo) con la codificación de la DNIT; "Descargar" los
  baja en PDF o Excel. Para completarlos:
  - En Cliente → Clientes cargue el **RUC del contador** y, si corresponde, el **auditor**.
  - En Plan de cuentas, la columna **Código RG 49** permite elegir el código oficial de cada
    cuenta (en gris se ve el que toma automáticamente). También se importa desde Excel con la
    columna "Codigo RG49".
  - Las **notas** se escriben en Balances → "Notas a los estados financieros".
  - El **coeficiente de revalúo** del año se carga en Bienes de uso.

## Controles y obligaciones adicionales
- **Impuestos → Antes de presentar → Controles del mes**: cuadre de IVA, RG 90, RUC y timbrados.
  Para validar RUC, importe la lista de la DNIT (archivos ruc0 a ruc9, en ZIP o TXT); después, al
  escribir un RUC en la carga rápida se completa la razón social y avisa si está cancelado.
  En la tabla de timbrados cargue el inicio y fin de vigencia para detectar facturas fuera de plazo.
- **Cruce con terceros**: descargue de Marangatu los comprobantes que otros informaron a su nombre
  e impórtelos; los faltantes se pueden cargar con un clic.
- **Retenciones → Archivo para Tesaka**: retenciones emitidas del mes en JSON (cada una debe tener
  su factura de compra cargada).
- **Form. 500**: abajo aparecen los anticipos del ejercicio; márquelos cuando se paguen.
- **Auditoría y partes relacionadas**: umbral de ingresos (configurable), paquete para el auditor y
  marca de partes relacionadas.
- **Sueldos**: N° patronal, datos de cada empleado, planilla IPS, planillas del Ministerio de Trabajo,
  aguinaldo y recibos.
- **Estudio**: calendario de todos los clientes, honorarios y cobros, tareas del mes por cliente.
- Puede arrastrar archivos XML de facturas electrónicas a cualquier pantalla para cargarlos.

## Primeros pasos con un cliente
1. **Clientes**: razón social, RUC, mes de cierre, representante y contador.
2. **Plan de cuentas**: use el estándar o importe el suyo desde Excel.
3. **Cierre de ejercicio → Saldos iniciales** si el cliente viene de otro sistema.
4. **Tipos de cambio**: cotización de cierre de cada mes (si opera en dólares).
5. Cargue **Ventas** y **Compras** (o impórtelas: XML, RG 90, Excel de Marangatu).
6. Cada mes: **Form. 120**, **RG 90** y luego **Cierre de períodos**.
7. Al cierre: **Inventario** (recuento), **Cierre de ejercicio**, **Balances**, **IRE** y **Libros rubricados**.

Antes de presentar declaraciones, verifique los parámetros marcados como
"verificar" (tasas, topes y tramos) en **Clientes → Parámetros**.
