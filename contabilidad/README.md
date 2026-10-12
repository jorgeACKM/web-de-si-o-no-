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
- Los parámetros del IRE (tasa 10%, límite de quebrantos 20%, donaciones 1%, anticipos 4 × 25%) son editables en *Clientes*; confirme la normativa vigente para cada ejercicio.
- La conversión a dólares usa el tipo de cambio de cierre de cada fecha de corte.
- Los comprobantes se cargan en guaraníes.

## Desarrollo

- `js/core.js`: motor contable sin dependencias del navegador (IVA, asientos, balances, F120, F500).
- `js/plan-default.js`: plan de cuentas estándar y rubros RG 49.
- `js/excel.js`, `js/store.js`, `js/app.js`: Excel, almacenamiento e interfaz.
- `vendor/xlsx.full.min.js`: SheetJS 0.18.5 (Apache 2.0) incluido para funcionar sin internet.
- Pruebas: `node contabilidad/tests/core.test.js`
