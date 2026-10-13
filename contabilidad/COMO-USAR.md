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
