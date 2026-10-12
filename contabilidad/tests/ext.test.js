// Pruebas de los módulos adicionales: node contabilidad/tests/ext.test.js
const assert = require('assert');
const PD = require('../js/plan-default.js');
const C = require('../js/core.js');
require('../js/core-ext.js');

let n = 0;
const t = (name, fn) => { fn(); n++; console.log('✓', name); };
const plan = C.prepararPlan(PD.PLAN_DEFAULT);
const base = () => ({ cliente: { cierreMes: 12, ruc: '80000519-8' }, cuentas: PD.PLAN_DEFAULT.map(c => Object.assign({}, c)), ventas: [], compras: [], asientos: [], tiposCambio: {}, f120: {} });
const balancea = d => C.todosLosAsientos(d).forEach(a => {
  const de = a.lineas.reduce((s, l) => s + l.debe, 0), ha = a.lineas.reduce((s, l) => s + l.haber, 0);
  assert.strictEqual(de, ha, a.concepto);
});

t('Comprobante en US$: conversión, asiento en cuenta M/E y diferencia de cambio', () => {
  const d = base();
  d.ventas.push({ id: 1, fecha: '2026-01-15', tipoDoc: 'FACTURA', condicion: 'CREDITO', moneda: 'USD', tc: 7000, g10: 1100, numero: '001-001-0000001' });
  d.tiposCambio['2026-01'] = 7200;
  const des = C.desglose(d.ventas[0]);
  assert.strictEqual(des.g10, 7700000); assert.strictEqual(des.iva10, 700000);
  balancea(d);
  const dc = C.todosLosAsientos(d).find(a => a.origen === 'dif. cambio');
  assert.ok(dc, 'debe generar diferencia de cambio');
  assert.strictEqual(dc.lineas.find(l => l.cuenta === '1.1.3.01.04').debe, 1100 * 7200 - 7700000);
  const pos = C.posicionME(d, '2026-01-31')[0];
  assert.strictEqual(pos.me, 1100); assert.strictEqual(Math.round(pos.gs), 1100 * 7200);
  assert.strictEqual(C.rubrosAl(d, plan, '2026-01-31').tot.diferencia, 0);
});

t('Retenciones: asiento y casilla 52 automática del Form. 120', () => {
  const d = base();
  d.ventas.push({ id: 1, fecha: '2026-03-10', tipoDoc: 'FACTURA', condicion: 'CREDITO', g10: 11000000, ruc: '80012345-0', numero: '001-001-0000010' });
  d.retenciones = [{ id: 1, fecha: '2026-03-20', tipo: 'RECIBIDA', impuesto: 'IVA', ruc: '80012345-0', monto: 300000, docNumero: '001-001-0000010' }];
  balancea(d);
  assert.strictEqual(C.f120(d, '2026-03').k.c52, 300000);
  const cc = C.cuentasCorrientes(d, 'CLIENTES', '2026-03-31');
  assert.strictEqual(cc[0].saldo, 11000000 - 300000);
});

t('Cuentas corrientes: cobros imputados, FIFO y antigüedad', () => {
  const d = base();
  d.ventas.push({ id: 1, fecha: '2026-01-01', tipoDoc: 'FACTURA', condicion: 'CREDITO', g10: 1000000, ruc: 'A', numero: '1' });
  d.ventas.push({ id: 2, fecha: '2026-03-01', tipoDoc: 'FACTURA', condicion: 'CREDITO', g10: 500000, ruc: 'A', numero: '2' });
  d.pagos = [{ id: 1, fecha: '2026-03-05', tipo: 'COBRO', ruc: 'A', monto: 400000, cuenta: '1.1.1.02.01' }];
  balancea(d);
  const [x] = C.cuentasCorrientes(d, 'CLIENTES', '2026-04-15');
  assert.strictEqual(x.saldo, 1100000);
  assert.strictEqual(x.pendientes[0].saldo, 600000);   // FIFO: el cobro cancela primero la más antigua
  assert.strictEqual(x.mas90 + x.d60 + x.d30 + x.aVencer + x.d90, 1100000);
  assert.strictEqual(x.d90, 600000);                    // vencida el 31/01 → 74 días (61-90)
});

t('Depreciación lineal mensual y cuadro de bienes', () => {
  const d = base();
  d.bienes = [{ id: 1, descripcion: 'Camioneta', fechaAlta: '2026-01-10', valor: 120000000, residual: 0, vidaUtil: 5, ctaActivo: '1.2.3.01.02', ctaDepAcum: '1.2.3.02.02', ctaGasto: '5.2.1.03.01' }];
  assert.strictEqual(C.cuotaMensual(d.bienes[0]), 2000000);
  assert.strictEqual(C.depAcumulada(d.bienes[0], '2026-12'), 24000000);
  const dep = C.todosLosAsientos(d).filter(a => a.origen === 'depreciación' && a.fecha <= '2026-12-31');
  assert.strictEqual(dep.length, 12);
  const q = C.cuadroBienes(d, '2026-01-01', '2026-12-31')[0];
  assert.strictEqual(q.altas, 120000000); assert.strictEqual(q.depEjercicio, 24000000); assert.strictEqual(q.neto, 96000000);
});

t('Planilla de sueldos: IPS 9% + 16,5% y aguinaldo', () => {
  const d = base();
  d.planillas = { '2026-02': { lineas: [{ nombre: 'Ana', salario: 3000000, extras: 0, descuentos: 100000 }] } };
  const r = C.calcularPlanilla(d, '2026-02');
  assert.strictEqual(r.t.ipsObrero, 270000); assert.strictEqual(r.t.ipsPatronal, 495000);
  assert.strictEqual(r.t.neto, 3000000 - 270000 - 100000); assert.strictEqual(r.t.provAguinaldo, 250000);
  balancea(d);
});

t('Asientos recurrentes mensuales', () => {
  const d = base();
  d.recurrentes = [{ id: 'r1', concepto: 'Alquiler', dia: 31, desde: '2026-01', hasta: '2026-03', lineas: [{ cuenta: '5.2.1.02.01', debe: 5000000, haber: 0 }, { cuenta: '1.1.1.02.01', debe: 0, haber: 5000000 }] }];
  const r = C.todosLosAsientos(d).filter(a => a.origen === 'recurrente');
  assert.deepStrictEqual(r.map(a => a.fecha), ['2026-01-31', '2026-02-28', '2026-03-31']);
});

t('IDU 8% / 15% y asiento de distribución', () => {
  const d = base();
  d.dividendos = [{ id: 1, fecha: '2026-05-10', socio: 'Socio A', residente: true, monto: 10000000 }, { id: 2, fecha: '2026-05-10', socio: 'Socio B', residente: false, monto: 10000000 }];
  const l = C.liquidacionIDU(d, '2026-05');
  assert.strictEqual(l.total, 800000 + 1500000);
  balancea(d);
});

t('IRP por tramos 8% / 9% / 10%', () => {
  const r = C.impuestoPorTramos(200000000, C.tramosIRP('50000000:8;150000000:9;:10'));
  assert.strictEqual(r.impuesto, 4000000 + 9000000 + 5000000);
  const d = base();
  d.ventas.push({ id: 1, fecha: '2026-06-01', tipoDoc: 'FACTURA', g10: 110000000 });
  d.compras.push({ id: 1, fecha: '2026-06-01', tipoDoc: 'FACTURA', g10: 11000000 });
  const i = C.irp(d, 2026);
  assert.strictEqual(i.rentaNeta, 100000000 - 11000000);
});

t('Flujo de efectivo cuadra con la variación de disponibilidades; evolución del PN', () => {
  const d = base();
  d.asientos.push({ id: 'a', fecha: '2025-12-31', concepto: 'Apertura', lineas: [{ cuenta: '1.1.1.01.01', debe: 50000000, haber: 0 }, { cuenta: '3.1.1.01.01', debe: 0, haber: 50000000 }] });
  d.ventas.push({ id: 1, fecha: '2026-02-01', tipoDoc: 'FACTURA', condicion: 'CREDITO', g10: 11000000 });
  d.compras.push({ id: 1, fecha: '2026-02-02', tipoDoc: 'FACTURA', condicion: 'CONTADO', g10: 33000000, cuenta: '1.2.3.01.02' });
  d.bienes = [{ id: 1, fechaAlta: '2026-02-02', valor: 30000000, vidaUtil: 5, ctaDepAcum: '1.2.3.02.02', ctaGasto: '5.2.1.03.01' }];
  d.dividendos = [{ id: 1, fecha: '2026-03-01', monto: 1000000, residente: true }];
  const f = C.flujoEfectivo(d, plan, '2025-12-31', '2026-12-31');
  assert.strictEqual(f.control, 0);
  assert.strictEqual(Math.round(f.final - f.inicial), Math.round(f.variacion));
  const e = C.evolucionPN(d, plan, '2025-12-31', '2026-12-31');
  const tot = e.filas.slice(0, 6).reduce((s, r) => s + r[1][4], 0);
  assert.strictEqual(Math.round(tot), Math.round(e.filas[6][1][4]));
});

t('Vencimientos según terminación del RUC, corridos a día hábil', () => {
  const v = C.vencimientos('80000519-8', 2026, 12, { mesesAnticiposIRE: '6,8,10,12' });
  assert.strictEqual(v.dia, 25); // terminación 9
  const iva = v.items.find(x => x.obligacion.startsWith('IVA') && x.periodo === '2026-01');
  assert.strictEqual(iva.fecha, '2026-02-25');
  assert.strictEqual(C.diaHabil('2026-03-01'), '2026-03-02'); // feriado 1/3 (domingo) → lunes
});

t('Cierre de períodos', () => {
  const d = base(); d.config = { cerradoHasta: '2026-03-31' };
  assert.strictEqual(C.periodoCerrado(d, '2026-03-15'), true);
  assert.strictEqual(C.periodoCerrado(d, '2026-04-01'), false);
});

t('Sugerencia de cuenta por historial y por rubro', () => {
  const d = base();
  d.compras.push({ id: 1, ruc: '1-1', razon: 'Ferretería Sol', cuenta: '5.2.1.02.08' }, { id: 2, ruc: '1-1', razon: 'Ferretería Sol', cuenta: '5.2.1.02.08' });
  assert.strictEqual(C.sugerirCuenta(d, '1-1', '', plan).cuenta, '5.2.1.02.08');
  assert.strictEqual(C.sugerirCuenta(d, '9-9', 'ANDE', plan).cuenta, '5.2.1.02.02');
  assert.strictEqual(C.sugerirCuenta(d, '9-9', 'Estación PETROBRAS', plan).cuenta, '5.2.1.02.07');
});

t('XML SIFEN: compra y nota de crédito', () => {
  const xml = `<?xml version="1.0"?><rDE xmlns="http://ekuatia.set.gov.py/sifen/xsd"><DE Id="01800005198001001000012322026011512345678901">
    <gTimb><iTiDE>1</iTiDE><dNumTim>12560123</dNumTim><dEst>001</dEst><dPunExp>001</dPunExp><dNumDoc>0000123</dNumDoc></gTimb>
    <gDatGralOpe><dFeEmiDE>2026-01-15T10:00:00</dFeEmiDE><gOpeCom><cMoneOpe>PYG</cMoneOpe></gOpeCom>
    <gEmis><dRucEm>80012345</dRucEm><dDVEmi>0</dDVEmi><dNomEmi>PROVEEDOR SA</dNomEmi></gEmis>
    <gDatRec><dRucRec>80000519</dRucRec><dDVRec>8</dDVRec><dNomRec>MI EMPRESA</dNomRec></gDatRec></gDatGralOpe>
    <gDtipDE><gCamCond><iCondOpe>2</iCondOpe></gCamCond></gDtipDE>
    <gTotSub><dSubExe>5000</dSubExe><dSubExo>0</dSubExo><dSub5>0</dSub5><dSub10>110000</dSub10><dTotGralOpe>115000</dTotGralOpe></gTotSub></DE></rDE>`;
  const r = C.parseSifenXML(xml, '80000519-8');
  assert.strictEqual(r.esCompra, true);
  assert.strictEqual(r.doc.numero, '001-001-0000123');
  assert.strictEqual(r.doc.ruc, '80012345-0'); assert.strictEqual(r.doc.g10, 110000); assert.strictEqual(r.doc.exenta, 5000);
  assert.strictEqual(r.doc.condicion, 'CREDITO'); assert.strictEqual(r.doc.electronico, true);
  assert.strictEqual(r.doc.cdc.length, 44); assert.ok(!r.doc.observacion);
});

t('Importación de archivo RG 90 (ida y vuelta)', () => {
  const d = base();
  d.ventas.push({ id: 1, fecha: '2026-01-10', tipoDoc: 'FACTURA', timbrado: '12345678', numero: '001-001-0000001', ruc: '80000519-8', razon: 'Cliente', condicion: 'CREDITO', g10: 1100000 });
  d.compras.push({ id: 2, fecha: '2026-01-05', tipoDoc: 'FACTURA', timbrado: '87654321', numero: '001-002-0000456', ruc: '1234567', razon: 'Juan', g5: 210000 });
  const r = C.importarRG90(C.rg90(d, '2026-01').csv);
  assert.strictEqual(r.ventas.length, 1); assert.strictEqual(r.compras.length, 1);
  assert.strictEqual(r.ventas[0].ruc, '80000519-8'); assert.strictEqual(r.ventas[0].g10, 1100000); assert.strictEqual(r.ventas[0].condicion, 'CREDITO');
  assert.strictEqual(r.compras[0].ruc, '1234567'); assert.strictEqual(r.compras[0].g5, 210000);
});

console.log(`\n${n} pruebas OK`);
