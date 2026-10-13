// Pruebas de inventario, liquidación de IVA, cierre de ejercicio y regímenes IRE: node contabilidad/tests/cierre.test.js
const assert = require('assert');
const PD = require('../js/plan-default.js');
const C = require('../js/core.js');
require('../js/core-ext.js');
require('../js/core-cierre.js');

let n = 0;
const t = (name, fn) => { fn(); n++; console.log('✓', name); };
const plan = C.prepararPlan(PD.PLAN_DEFAULT);
const base = () => ({ cliente: { cierreMes: 12, ruc: '80000519-8' }, cuentas: PD.PLAN_DEFAULT.map(c => Object.assign({}, c)), ventas: [], compras: [], asientos: [], tiposCambio: {}, f120: {}, config: {} });
const balancea = d => C.todosLosAsientos(d).forEach(a => {
  const de = a.lineas.reduce((s, l) => s + l.debe, 0), ha = a.lineas.reduce((s, l) => s + l.haber, 0);
  assert.strictEqual(de, ha, a.concepto);
});
const saldo = (d, cta, hasta) => { let s = 0; C.todosLosAsientos(d).forEach(a => { if (a.fecha <= hasta) a.lineas.forEach(l => { if (l.cuenta === cta) s += l.debe - l.haber; }); }); return s; };

t('Kardex con costo promedio ponderado', () => {
  const d = base();
  d.productos = [{ codigo: 'A', descripcion: 'Arroz', unidad: 'kg' }];
  d.movInventario = [
    { fecha: '2026-01-01', tipo: 'INICIAL', codigo: 'A', cantidad: 10, costoUnit: 100 },
    { fecha: '2026-01-05', tipo: 'ENTRADA', codigo: 'A', cantidad: 10, costoUnit: 120 },
    { fecha: '2026-01-10', tipo: 'SALIDA', codigo: 'A', cantidad: 5 }];
  const k = C.kardex(d, 'A');
  assert.strictEqual(k.filas[2].costoUnit, 110); assert.strictEqual(k.filas[2].importe, 550);
  assert.strictEqual(k.cantidad, 15); assert.strictEqual(k.valor, 1650);
  assert.strictEqual(C.valuacionInventario(d, '2026-01-31').total, 1650);
});

t('Método permanente: asiento de costo de ventas por mes', () => {
  const d = base(); d.config.inventarioMetodo = 'PERMANENTE'; d.config.liquidarIVA = false;
  d.productos = [{ codigo: 'A' }];
  d.movInventario = [{ fecha: '2026-01-05', tipo: 'ENTRADA', codigo: 'A', cantidad: 10, costoUnit: 100 }, { fecha: '2026-01-10', tipo: 'SALIDA', codigo: 'A', cantidad: 4 }, { fecha: '2026-01-20', tipo: 'AJUSTE_NEG', codigo: 'A', cantidad: 1 }];
  const a = C.todosLosAsientos(d).find(x => x.origen === 'inventario');
  assert.strictEqual(a.lineas.find(l => l.cuenta === '5.1.1.01.01').debe, 400);
  assert.strictEqual(a.lineas.find(l => l.cuenta === '5.1.1.01.04').debe, 100);
  balancea(d);
});

t('Método periódico: costo de ventas = inventario inicial + compras − inventario final', () => {
  const d = base(); d.config.liquidarIVA = false;
  d.asientos.push({ id: 'ap', fecha: '2026-01-01', concepto: 'Apertura', lineas: [{ cuenta: '1.1.5.01.01', debe: 200000, haber: 0 }, { cuenta: '1.1.1.01.01', debe: 5000000, haber: 0 }, { cuenta: '3.1.1.01.01', debe: 0, haber: 5200000 }] });
  d.compras.push({ id: 1, fecha: '2026-03-01', tipoDoc: 'FACTURA', exenta: 1000000, cuenta: '5.1.1.01.02', afectacion: 'GRAVADA' });
  d.conteos = [{ id: 'c1', fecha: '2026-12-31', monto: 300000 }];
  balancea(d);
  assert.strictEqual(saldo(d, '1.1.5.01.01', '2026-12-31'), 300000);
  assert.strictEqual(saldo(d, '5.1.1.01.01', '2026-12-31'), 200000 + 1000000 - 300000);
  assert.strictEqual(saldo(d, '5.1.1.01.02', '2026-12-31'), 0);
  assert.strictEqual(C.rubrosAl(d, plan, '2026-12-31').tot.diferencia, 0);
});

t('Liquidación mensual de IVA: a pagar, saldo a favor y compensación', () => {
  const d = base();
  d.ventas.push({ id: 1, fecha: '2026-01-10', tipoDoc: 'FACTURA', g10: 11000000 });
  d.compras.push({ id: 1, fecha: '2026-01-11', tipoDoc: 'FACTURA', g10: 5500000, afectacion: 'GRAVADA' });
  d.compras.push({ id: 2, fecha: '2026-02-11', tipoDoc: 'FACTURA', g10: 2200000, afectacion: 'GRAVADA' });
  d.ventas.push({ id: 2, fecha: '2026-03-10', tipoDoc: 'FACTURA', g10: 11000000 });
  balancea(d);
  assert.strictEqual(saldo(d, '2.1.3.01.03', '2026-01-31'), -500000);   // IVA a pagar enero
  assert.strictEqual(saldo(d, '1.1.4.01.06', '2026-02-28'), 200000);    // saldo a favor febrero
  assert.strictEqual(saldo(d, '1.1.4.01.06', '2026-03-31'), 0);         // compensado en marzo
  assert.strictEqual(saldo(d, '2.1.3.01.03', '2026-03-31'), -500000 - 800000);
  ['2.1.3.01.01', '1.1.4.01.01'].forEach(c => assert.strictEqual(saldo(d, c, '2026-03-31'), 0));
});

t('Cierre de ejercicio: previsión, vacaciones, IRE con anticipos y reserva legal', () => {
  const d = base(); d.config.liquidarIVA = false;
  d.asientos.push({ id: 'ap', fecha: '2026-01-01', concepto: 'Capital', lineas: [{ cuenta: '1.1.1.01.01', debe: 100000000, haber: 0 }, { cuenta: '3.1.1.01.01', debe: 0, haber: 100000000 }] });
  d.ventas.push({ id: 1, fecha: '2026-02-01', tipoDoc: 'FACTURA', condicion: 'CREDITO', exenta: 300000000, ruc: 'X1', numero: '1' });
  d.pagos = [{ id: 1, fecha: '2026-03-01', tipo: 'COBRO', ruc: 'X1', monto: 290000000, cuenta: '1.1.1.01.01' }];
  d.asientos.push({ id: 'an', fecha: '2026-06-30', concepto: 'Anticipo IRE', lineas: [{ cuenta: '1.1.4.01.04', debe: 1000000, haber: 0 }, { cuenta: '1.1.1.01.01', debe: 0, haber: 1000000 }] });
  d.empleados = [{ id: 'e', nombre: 'Ana', salario: 3000000, ingreso: '2020-01-01', activo: true }];
  d.cierresEjercicio = { 2026: { prevision: true, vacaciones: true, ire: true, reservaLegal: true } };
  balancea(d);
  const a = C.todosLosAsientos(d).filter(x => x.origen === 'cierre');
  const prev = a.find(x => x.id === 'Z12026'), vac = a.find(x => x.id === 'Z22026'), ire = a.find(x => x.id === 'Z32026'), res = a.find(x => x.id === 'Z42026');
  assert.strictEqual(prev.lineas.find(l => l.cuenta === '1.1.3.01.03').haber, 10000000); // saldo vencido > 180 días al 100%
  assert.strictEqual(vac.lineas[0].debe, Math.round(3000000 / 30 * 18 * 12 / 12)); // 6 años de antigüedad → 18 días
  const resultadoAntes = 300000000 - 10000000 - 1800000;
  assert.strictEqual(ire.lineas.find(l => l.cuenta === '5.5.1.01.01').debe, Math.round(resultadoAntes * 0.1));
  assert.strictEqual(saldo(d, '1.1.4.01.04', '2026-12-31'), 0); // anticipo compensado
  assert.strictEqual(res.fecha, '2027-01-01');
  const neto = resultadoAntes - Math.round(resultadoAntes * 0.1);
  assert.strictEqual(res.lineas.find(l => l.cuenta === '3.2.1.01.01').haber, Math.min(Math.round(neto * 0.05), 20000000));
  assert.strictEqual(C.rubrosAl(d, plan, '2027-01-31').tot.diferencia, 0);
});

t('Saldos iniciales con diferencia a resultados acumulados', () => {
  const r = C.asientoSaldosIniciales([{ codigo: '1.1.1.01.01', saldo: 1000 }, { codigo: '3.1.1.01.01', haber: 900 }, { codigo: '9.9', debe: 1 }], plan, '2026-01-01', '3.3.1.01.01');
  assert.strictEqual(r.errores.length, 1);
  assert.strictEqual(r.diferencia, 100);
  const tot = r.asiento.lineas.reduce((s, l) => s + l.debe - l.haber, 0);
  assert.strictEqual(tot, 0);
});

t('Libro Diario con apertura, refundición y cierre informativos', () => {
  const d = base(); d.config.liquidarIVA = false;
  d.asientos.push({ id: 'ap', fecha: '2025-06-01', concepto: 'Capital', lineas: [{ cuenta: '1.1.1.01.01', debe: 1000000, haber: 0 }, { cuenta: '3.1.1.01.01', debe: 0, haber: 1000000 }] });
  d.ventas.push({ id: 1, fecha: '2025-07-01', tipoDoc: 'FACTURA', exenta: 400000 });
  d.ventas.push({ id: 2, fecha: '2026-07-01', tipoDoc: 'FACTURA', exenta: 100000 });
  const lib = C.libroDiario(d, plan, '2026-01-01', '2026-12-31', true);
  assert.strictEqual(lib[0].origen, 'apertura');
  assert.strictEqual(lib[lib.length - 1].origen, 'cierre');
  lib.forEach(a => assert.strictEqual(a.lineas.reduce((s, l) => s + l.debe - l.haber, 0), 0, a.concepto));
  const ap = lib[0];
  assert.strictEqual(ap.lineas.find(l => l.cuenta === '3.3.1.01.01').haber, 400000); // resultado 2025 a acumulados
  // los informativos no alteran los saldos
  assert.strictEqual(C.rubrosAl(d, plan, '2026-12-31').tot.diferencia, 0);
});

t('Libro Inventario: secciones y detalle de inventario y bienes', () => {
  const d = base(); d.config.inventarioMetodo = 'PERMANENTE'; d.config.liquidarIVA = false;
  d.productos = [{ codigo: 'A', descripcion: 'Arroz', unidad: 'kg' }];
  d.movInventario = [{ fecha: '2026-01-01', tipo: 'INICIAL', codigo: 'A', cantidad: 10, costoUnit: 100 }];
  d.asientos.push({ id: 'ap', fecha: '2026-01-01', concepto: 'Apertura', lineas: [{ cuenta: '1.1.5.01.01', debe: 1000, haber: 0 }, { cuenta: '3.1.1.01.01', debe: 0, haber: 1000 }] });
  const li = C.libroInventario(d, plan, '2026-12-31');
  const inv = li.secciones.find(s => s.key === 'AC_INVENT');
  assert.strictEqual(inv.total, 1000); assert.strictEqual(inv.detalle[0][2], 1000);
});

t('IRE SIMPLE: renta real o presunta y alerta de tope', () => {
  const d = base(); d.config.regimenIRE = 'SIMPLE'; d.config.liquidarIVA = false;
  d.ventas.push({ id: 1, fecha: '2026-05-01', tipoDoc: 'FACTURA', exenta: 2100000000 });
  d.compras.push({ id: 1, fecha: '2026-05-02', tipoDoc: 'FACTURA', exenta: 1800000000, cuenta: '5.1.1.01.02' });
  const r = C.ireSimple(d, plan, 2026);
  assert.strictEqual(r.rentaReal, 300000000); assert.strictEqual(r.rentaPresunta, 630000000);
  assert.strictEqual(r.impuesto, 30000000); assert.strictEqual(r.conveniente, 'REAL');
  assert.strictEqual(r.alertas.length, 1);
  d.cierresEjercicio = { 2026: { ire: true } };
  const ire = C.todosLosAsientos(d).find(x => x.id === 'Z32026');
  assert.strictEqual(ire.lineas.find(l => l.cuenta === '5.5.1.01.01').debe, 30000000);
});

t('IRE RESIMPLE: cuota según ingresos y alerta de tope', () => {
  const d = base(); d.config.regimenIRE = 'RESIMPLE';
  d.ventas.push({ id: 1, fecha: '2025-05-01', tipoDoc: 'FACTURA', exenta: 35000000 });
  d.ventas.push({ id: 2, fecha: '2026-05-01', tipoDoc: 'FACTURA', exenta: 90000000 });
  const r = C.ireResimple(d, plan, 2026);
  assert.strictEqual(r.cuotaMensualActual, 40000); assert.strictEqual(r.cuotasDelAnio, 480000);
  assert.strictEqual(r.alertas.length, 1);
});

t('Ítems del XML SIFEN generan movimientos de inventario', () => {
  const xml = `<rDE><DE Id="${'1'.repeat(44)}"><gTimb><iTiDE>1</iTiDE><dNumTim>1</dNumTim><dEst>001</dEst><dPunExp>001</dPunExp><dNumDoc>0000001</dNumDoc></gTimb>
    <gDatGralOpe><dFeEmiDE>2026-01-15T10:00:00</dFeEmiDE><gEmis><dRucEm>80012345</dRucEm><dDVEmi>0</dDVEmi><dNomEmi>PROV</dNomEmi></gEmis><gDatRec><dRucRec>80000519</dRucRec><dDVRec>8</dDVRec></gDatRec></gDatGralOpe>
    <gDtipDE><gCamItem><dCodInt>A</dCodInt><dDesProSer>Arroz</dDesProSer><dDesUniMed>KG</dDesUniMed><dCantProSer>10</dCantProSer><dPUniProSer>11000</dPUniProSer><gCamIVA><dTasaIVA>10</dTasaIVA><dBasGravIVA>100000</dBasGravIVA></gCamIVA></gCamItem></gDtipDE>
    <gTotSub><dSub10>110000</dSub10><dTotGralOpe>110000</dTotGralOpe></gTotSub></DE></rDE>`;
  const r = C.parseSifenXML(xml, '80000519-8');
  assert.strictEqual(r.doc.items.length, 1);
  const m = C.movimientosDesdeDoc(r.doc, r.esCompra);
  assert.strictEqual(m[0].tipo, 'ENTRADA'); assert.strictEqual(m[0].cantidad, 10); assert.strictEqual(m[0].costoUnit, 10000);
});

console.log(`\n${n} pruebas OK`);
