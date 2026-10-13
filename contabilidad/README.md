# ContaPY – Sistema contable para clientes (Paraguay)

Aplicación web que funciona sin servidor ni instalación: abrir `contabilidad/index.html` en el navegador (Chrome, Edge o Firefox).
Los datos quedan guardados en el navegador; use **Clientes → Descargar respaldo** con frecuencia.

## Funciones

| Módulo | Qué hace |
|---|---|
| **Clientes** | Varios clientes (RUC con validación de DV, mes de cierre del ejercicio). Cuentas de los asientos automáticos y parámetros del IRE editables por cliente. Respaldo y restauración en JSON. |
| **Plan de cuentas** | Plan estándar incluido. **Importa el plan desde Excel** (Código, Nombre y opcionalmente Nivel, Imputable, Tipo, Rubro RG49, No deducible, No gravado). Acepta códigos con puntos (`1.1.1.01.01`) o sin puntos (`11101001`). Exporta el plan y una plantilla. |
| **Ventas / Compras** | **Carga rápida con teclado**: Enter guarda y deja lista la siguiente fila, el número de factura se incrementa solo, el RUC conocido completa razón social, timbrado, cuenta y afectación. IVA calculado desde montos con IVA incluido (÷11 y ÷21). Importación desde Excel, **pegar filas copiadas de Excel**, plantilla, libro IVA mensual/anual a Excel. Control de duplicados. |
| **Asientos y mayor** | Cada comprobante genera su asiento automáticamente. Asientos manuales (apertura, sueldos, depreciaciones…), importación de asientos desde Excel, libro diario y libro mayor a Excel. |
| **Tipos de cambio** | Cotización Gs/US$ de cierre por mes (carga manual o Excel). |
| **Balances** | **Balance comparativo nivel 4 (o 1–6) en guaraníes y dólares** entre dos fechas de corte, con variación absoluta y %. **Balance General y Estado de Resultados comparativos formato RG 49/2014** (Gs. y opcionalmente US$) con hoja de composición por rubro para notas. |
| **Form. 120 V4 (IVA)** | Formato oficial (V.4 Enero/2020) con **todas las casillas** de los Rubros 1 a 6: ventas 10%/5% (agrícolas y otros), exoneradas, exportaciones (agrícolas, flete, otros), NC recibidas en Rubro 1 h–k, acumulado de 6 meses del Rubro 2, crédito directo/indistinto y **prorrateo** (cas. 164/165), NC emitidas en Rubro 3 e, saldo técnico (47→46) y saldo financiero (54→51) encadenados mes a mes, retenciones (52), percepciones (169), multa (56), Rubro 6 con IVA costo (64). Exporta el formulario con casillas y un resumen anual por casilla. |
| **RG 90 Marangatu** | Genera el archivo de **registro de comprobantes** (obligación 955 mensual o 956 anual): CSV por comas, UTF‑8, sin encabezado, 19 campos en ventas y 20 en compras, comprimido en ZIP con el nombre `RUC_REG_MMAAAA_V0001`. Excluye comprobantes electrónicos/virtuales, informa NC con comprobante asociado, valida timbrado, número, DV del RUC y totales antes de generar. |
| **Form. 500 (IRE)** | Situación patrimonial, estado de resultados, determinación de la renta neta (gastos no deducibles, ingresos no gravados, diferencia de depreciación, ajustes, límite de donaciones), compensación de quebrantos con límite, impuesto (10%), anticipos y retenciones, saldo, quebranto a trasladar, anticipos del ejercicio siguiente, **conciliación ventas F120 vs. contabilidad**, controles de consistencia e indicadores financieros (liquidez, prueba ácida, endeudamiento, márgenes, ROE, ROA, presión fiscal, tasa efectiva). |

## Módulos de automatización y control

| Módulo | Qué hace |
|---|---|
| **Importar (XML / Marangatu)** | Facturas electrónicas desde los **XML de SIFEN** (varios a la vez; detecta compra o venta por el RUC, las marca electrónicas y asigna cuenta). Archivo **RG 90** (CSV o ZIP). Planillas **Excel/CSV descargadas de Marangatu** (reconoce Fecha de emisión, Timbrado, Número, RUC, Monto gravado 10%/5%, Exento, CDC). Omite duplicados por CDC o número. |
| **Cuenta sugerida** | Al cargar una compra propone la cuenta más usada con ese proveedor, la de proveedores con nombre similar o una por rubro (ANDE → energía, ESSAP → agua, Tigo/Claro/Personal/Copaco → teléfono, Petrobras/Copetrol/Shell → combustible, etc.). |
| **Moneda extranjera** | Comprobantes en US$ con su tipo de cambio (cuentas Clientes/Proveedores/Caja M/E). **Diferencia de cambio automática** al cierre de cada mes para las cuentas marcadas M/E. Columna US$ en los asientos manuales. |
| **Cobros, pagos y cuentas corrientes** | Cobros y pagos imputados a comprobantes; **antigüedad de saldos** (a vencer, 1–30, 31–60, 61–90, +90 días) de clientes y proveedores; botón para cobrar/pagar el saldo; exportación. |
| **Conciliación bancaria** | Importa el extracto (Excel/CSV), concilia solo por importe y fecha, muestra partidas pendientes y permite registrar con un clic los débitos/créditos bancarios no contabilizados. |
| **Retenciones** | Recibidas y emitidas de IVA, IRE e IRP con su asiento. Las de IVA completan la **casilla 52** del Form. 120; las de IRE pasan al Form. 500. |
| **Bienes de uso** | Registro con vida útil y valor residual; **depreciación mensual automática** (línea recta) y cuadro de bienes para notas. |
| **Sueldos e IPS** | Empleados y planilla mensual: IPS obrero 9% y patronal 16,5%, provisión de aguinaldo 1/12, descuentos y pago de aguinaldo; asiento automático y planilla en Excel. |
| **Asientos recurrentes** | Alquileres, cuotas, honorarios: se generan solos cada mes. |
| **IRP e IDU** | Preliquidación anual del IRP por tramos (8% / 9% / 10%, configurables). Distribución de dividendos con IDU 8% (residentes) y 15% (no residentes), asiento y liquidación mensual. |
| **Estados RG 49 completos** | Además del balance y resultados: **flujo de efectivo** (método indirecto, controlado contra la variación de disponibilidades), **evolución del patrimonio neto** y **notas** (información general, bases, criterios, bienes de uso, posición en moneda extranjera, texto libre). |
| **Vencimientos** | Calendario anual por terminación del RUC (día 7 al 25, corrido al día hábil): IVA, RG 90, retenciones/IDU, IPS, DJ IRE y anticipos; vista de los próximos 30 días de **todos los clientes**. |
| **Cierre de períodos** | Bloquea altas, cambios y bajas con fecha dentro de los meses ya declarados. |
| **Tipos de cambio** | Además de la carga manual: completar meses vacíos y obtener una cotización **referencial** en línea. |

## Cierre contable e inventario

| Módulo | Qué hace |
|---|---|
| **Inventario y costo de ventas** | Productos, movimientos (inicial, entradas, salidas, devoluciones, ajustes) y **kardex con costo promedio ponderado**. Método **periódico** (cada recuento pasa las compras a Mercaderías y la diferencia a Costo de ventas: CMV = inventario inicial + compras − inventario final) o **permanente** (costo de cada salida al promedio, asiento mensual; faltantes y sobrantes a "Diferencias de inventario"). Inventario valorizado y kardex en Excel. Los XML de facturas electrónicas con ítems crean los productos y movimientos solos. |
| **Liquidación mensual de IVA** | Asiento automático a fin de cada mes: cierra IVA débito, crédito y retenciones contra **IVA a pagar** o **IVA saldo a favor**, que se compensa solo en los meses siguientes. |
| **Asientos de cierre del ejercicio** | Se marcan por ejercicio y se recalculan solos: **previsión para incobrables** (saldos vencidos > N días al %), **provisión de vacaciones** (12/18/30 días según antigüedad), **impuesto a la renta** del régimen del cliente (compensa anticipos y retenciones de IRE) y **reserva legal** (5% de la utilidad hasta el 20% del capital, al inicio del ejercicio siguiente). |
| **Apertura y saldos iniciales** | Los saldos pasan solos de un ejercicio a otro. El Libro Diario muestra los asientos de **apertura, refundición y cierre**. Importación de **saldos iniciales** desde Excel (Código, Cuenta, Debe, Haber o Saldo) para clientes que vienen de otro sistema. |
| **Libros rubricados** | **Libro Diario** (con "van / vienen"), **Libro Mayor** y **Libro Inventario** (cada rubro con sus cuentas, saldos de clientes y proveedores, mercaderías valorizadas, bienes de uso y estado de resultados) en hojas A4 con **folio inicial configurable** y firmas del representante legal y del contador, listos para imprimir o guardar en PDF. |
| **IRE por régimen** | **GENERAL** (Form. 500), **SIMPLE** (renta real = ingresos − egresos, o presunta como % de los ingresos, con comparación de cuál conviene) y **RESIMPLE** (cuota fija mensual según los ingresos del ejercicio anterior). Alertas cuando los ingresos superan el tope del régimen. |

## Trabajo en equipo: servidor con usuarios y respaldos

Sin servidor, los datos quedan en el navegador. Para trabajar varias personas sobre la misma base, con usuarios y respaldos automáticos, en una PC de la oficina con Node.js 18+:

```bash
cd contabilidad
node server/server.js usuario-agregar ana MiClave123 admin     # roles: admin | editor | lectura
node server/server.js                                         # http://localhost:3000
```

- La primera vez, si no hay usuarios, se crea `admin` con una contraseña que se muestra en la consola.
- Cada guardado se envía al servidor; si otro usuario guardó antes, se avisa y se carga la versión más reciente. Los cambios de los demás aparecen solos cada 15 segundos.
- **Respaldos automáticos** en `server/datos/respaldos` (como máximo uno cada 10 minutos y uno diario, se conservan los últimos 200). El administrador los descarga desde el botón *Respaldos*.
- Registro de auditoría (quién ingresó y quién guardó cada versión) en `server/datos/auditoria.log`.
- Variables: `PORT`, `DATOS` (carpeta de datos), `RESPALDOS_MAX`, `RESPALDO_MINUTOS`.
- Para acceder desde otras PCs use la IP del servidor (`http://192.168.x.x:3000`). Para acceso por internet, publíquelo detrás de HTTPS.

## Cómo se arma la contabilidad

- Asiento de venta: Caja (contado) o Clientes (crédito) contra Ventas por tasa e IVA débito fiscal. Notas de crédito: asiento inverso.
- Asiento de compra: cuenta elegida + IVA crédito fiscal contra Caja o Proveedores. Si la compra está afectada a operaciones exentas el IVA va al costo. Si es mixta, el sistema genera al cierre del mes el ajuste por prorrateo.
- No hace falta asiento de refundición: al iniciar cada ejercicio el resultado anterior se presenta en *Resultados acumulados*.
- El rubro RG 49 se asigna en el plan de cuentas (alcanza con el nivel 3 o 4; las subcuentas lo heredan).
- Cuentas de resultado marcadas **ND** (no deducible) y **NG** (no gravado) alimentan el Form. 500.

## Importante

- El Form. 120 sigue la versión 4 del formulario (casillas tomadas de una DJ presentada). El Form. 500 es una preliquidación por conceptos: verifique las casillas en Marangatu.
- RG 90: códigos de comprobante usados 109 factura, 110 nota de crédito, 111 nota de débito, 101 autofactura, 103 boleta, 107 despacho; identificación 11 RUC, 12 cédula, 13 pasaporte, 15 sin nombre (escriba `X` en el RUC). Revise la especificación técnica vigente de la DNIT si Marangatu rechaza un código.
- En la carga, marque **Electrónico/virtual** los comprobantes SIFEN (no van al RG 90). Para clasificar operaciones agrícolas o de flete internacional use la columna *Clase* del Excel o la opción del Form. 120.
- Los parámetros del IRE (tasa 10%, límite de quebrantos 20%, donaciones 1%, anticipos 4 × 25% en los meses 6/8/10/12 posteriores al cierre), IPS (9% / 16,5%), IDU (8% / 15%) y tramos del IRP son editables en *Clientes*; confirme la normativa vigente para cada ejercicio.
- El calendario de vencimientos no contempla feriados móviles; verifique con el calendario oficial de la DNIT.
- Regímenes SIMPLE y RESIMPLE: los topes (Gs. 2.000 millones y Gs. 80 millones) surgen de la Ley 6380/2019; el porcentaje de renta presunta del SIMPLE (30%) y los tramos de cuota del RESIMPLE (Gs. 20.000 a 80.000 mensuales) son configurables y deben verificarse con la reglamentación vigente.
- Reserva legal (5% hasta el 20% del capital), previsión de incobrables y vacaciones: parámetros configurables; revise el tratamiento fiscal (deducibilidad) de cada previsión.
- La conversión a dólares usa el tipo de cambio de cierre de cada fecha de corte.
- Los comprobantes pueden cargarse en guaraníes o en US$ (con el tipo de cambio del comprobante).

## Desarrollo

- `js/core.js`: motor contable sin dependencias del navegador (IVA, asientos, balances, F120, F500).
- `js/plan-default.js`: plan de cuentas estándar y rubros RG 49.
- `js/excel.js`, `js/store.js`, `js/app.js`: Excel, almacenamiento e interfaz.
- `vendor/xlsx.full.min.js`: SheetJS 0.18.5 (Apache 2.0) incluido para funcionar sin internet.
- `js/core-ext.js`: módulos de tesorería, personal, impuestos, estados RG 49, vencimientos, importaciones.
- `js/core-cierre.js` y `js/app-cierre.js`: inventario, liquidación de IVA, cierre de ejercicio, libros rubricados y regímenes del IRE.
- `js/app-ext.js`: pantallas de esos módulos. `server/server.js`: servidor multiusuario sin dependencias.
- Pruebas: `cd contabilidad && npm test`
