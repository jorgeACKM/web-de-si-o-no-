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
