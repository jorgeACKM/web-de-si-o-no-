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
| **Form. 120 (IVA)** | Preliquidación mensual: ventas 10%/5%/exentas/exportaciones, notas de crédito, compras locales e importaciones, crédito fiscal por afectación (gravadas / exentas / mixta), **coeficiente de prorrateo**, saldo a favor encadenado mes a mes, retenciones y percepciones. Exporta el formulario con el detalle del mes y un resumen anual. |
| **Form. 500 (IRE)** | Situación patrimonial, estado de resultados, determinación de la renta neta (gastos no deducibles, ingresos no gravados, diferencia de depreciación, ajustes, límite de donaciones), compensación de quebrantos con límite, impuesto (10%), anticipos y retenciones, saldo, quebranto a trasladar, anticipos del ejercicio siguiente, **conciliación ventas F120 vs. contabilidad**, controles de consistencia e indicadores financieros (liquidez, prueba ácida, endeudamiento, márgenes, ROE, ROA, presión fiscal, tasa efectiva). |

## Cómo se arma la contabilidad

- Asiento de venta: Caja (contado) o Clientes (crédito) contra Ventas por tasa e IVA débito fiscal. Notas de crédito: asiento inverso.
- Asiento de compra: cuenta elegida + IVA crédito fiscal contra Caja o Proveedores. Si la compra está afectada a operaciones exentas el IVA va al costo. Si es mixta, el sistema genera al cierre del mes el ajuste por prorrateo.
- No hace falta asiento de refundición: al iniciar cada ejercicio el resultado anterior se presenta en *Resultados acumulados*.
- El rubro RG 49 se asigna en el plan de cuentas (alcanza con el nivel 3 o 4; las subcuentas lo heredan).
- Cuentas de resultado marcadas **ND** (no deducible) y **NG** (no gravado) alimentan el Form. 500.

## Importante

- Los formularios 120 y 500 son **preliquidaciones** con los conceptos de cada rubro. Antes de transcribir, verifique el número de casilla en el formulario vigente del sistema Marangatu (DNIT), ya que puede cambiar entre versiones.
- Los parámetros del IRE (tasa 10%, límite de quebrantos 20%, donaciones 1%, anticipos 4 × 25%) son editables en *Clientes*; confirme la normativa vigente para cada ejercicio.
- La conversión a dólares usa el tipo de cambio de cierre de cada fecha de corte.
- Los comprobantes se cargan en guaraníes.

## Desarrollo

- `js/core.js`: motor contable sin dependencias del navegador (IVA, asientos, balances, F120, F500).
- `js/plan-default.js`: plan de cuentas estándar y rubros RG 49.
- `js/excel.js`, `js/store.js`, `js/app.js`: Excel, almacenamiento e interfaz.
- `vendor/xlsx.full.min.js`: SheetJS 0.18.5 (Apache 2.0) incluido para funcionar sin internet.
- Pruebas: `node contabilidad/tests/core.test.js`
