// Pruebas de los anexos de la RG 49: node contabilidad/tests/rg49.test.js
const assert = require('assert');
const PD = require('../js/plan-default.js');
const C = require('../js/core.js');
require('../js/core-ext.js'); require('../js/core-cierre.js'); require('../js/core-irp.js'); require('../js/rg49-estructura.js'); require('../js/rg49.js');
let n = 0;
const t = (name, fn) => { fn(); n++; console.log('✓', name); };
const plan = C.prepararPlan(PD.PLAN_DEFAULT);
function datos() {
  const d = { cliente: { cierreMes: 12 }, cuentas: PD.PLAN_DEFAULT.map(c => Object.assign({}, c)), ventas: [], compras: [], asientos: [], tiposCambio: {}, config: {} };
  d.asientos.push({ id: 'a', fecha: '2025-01-02', concepto: 'Capital', lineas: [{ cuenta: '1.1.1.02.01', debe: 100000000, haber: 0 }, { cuenta: '3.1.1.01.01', debe: 0, haber: 100000000 }] });
  d.ventas.push({ id: 1, fecha: '2025-06-01', tipoDoc: 'FACTURA', condicion: 'CONTADO', g10: 55000000 });
  d.compras.push({ id: 2, fecha: '2025-06-02', tipoDoc: 'FACTURA', condicion: 'CONTADO', g10: 22000000, cuenta: '5.1.1.01.02', afectacion: 'GRAVADA' });
  d.ventas.push({ id: 3, fecha: '2026-03-01', tipoDoc: 'FACTURA', condicion: 'CREDITO', g10: 33000000, ruc: 'X' });
  d.compras.push({ id: 4, fecha: '2026-03-05', tipoDoc: 'FACTURA', condicion: 'CONTADO', g10: 11000000, cuenta: '1.2.3.01.04', afectacion: 'GRAVADA' });
  d.bienes = [{ id: 'b', descripcion: 'Computadora', fechaAlta: '2026-03-05', valor: 10000000, vidaUtil: 4, ctaDepAcum: '1.2.3.02.04', ctaGasto: '5.2.1.03.01' }];
  d.planillas = { '2026-04': { lineas: [{ nombre: 'Ana', salario: 3000000 }] } };
  d.pagos = [{ id: 'p1', fecha: '2026-04-30', tipo: 'PAGO', monto: 2730000, cuenta: '1.1.1.02.01', contra: '2.1.3.02.01' }, { id: 'p2', fecha: '2026-05-10', tipo: 'COBRO', ruc: 'X', monto: 20000000, cuenta: '1.1.1.02.01' }];
  d.dividendos = [{ id: 'd', fecha: '2026-04-15', socio: 'S', residente: true, monto: 5000000 }];
  d.coefRevaluo = { 2026: 1.05 };
  return d;
}

t('Anexo 1: balance con códigos oficiales, cuadra y respeta la estructura', () => {
  const d = datos(), b = C.rg49Balance(d, plan, '2026-12-31');
  assert.strictEqual(b.diferencia, 0);
  assert.ok(b.total['1.01.01.04'] > 0, 'bancos');
  assert.strictEqual(b.total['1.01.03.01'], 33000000 - 20000000); // facturado menos cobrado
  assert.strictEqual(b.total['1.02.04.05'], 10000000);
  assert.ok(b.total['1.02.04.99'] < 0, 'depreciación acumulada negativa');
  assert.strictEqual(b.total['1.01'], ['1.01.01', '1.01.02', '1.01.03', '1.01.04', '1.01.05', '1.01.06'].reduce((s, k) => s + (b.total[k] || 0), 0));
  assert.strictEqual(b.total['3.01.01.01'], 100000000);
});

t('Anexo 2: subtotales oficiales y resultado igual al contable', () => {
  const d = datos(), r = C.rg49Resultados(d, plan, '2026-12-31');
  assert.strictEqual(r.diferencia, 0);
  assert.strictEqual(r.total['4.01.01'], 30000000);
  assert.strictEqual(r.total['6'], r.total['4'] - r.total['5']);
  assert.ok(r.total['15.01'] > 0); assert.ok(r.total['11.01.01'] > 0);
  const r25 = C.rg49Resultados(d, plan, '2025-12-31');
  assert.strictEqual(r25.total['20'], 50000000 - 20000000);
});

t('Anexo 3: flujo de efectivo directo concilia con la variación de caja', () => {
  const d = datos(), f = C.rg49Flujo(d, plan, '2026-12-31');
  assert.strictEqual(f.diferencia, 0);
  assert.strictEqual(f.ventas, 20000000);
  assert.strictEqual(f.ppe, -11000000);
  assert.strictEqual(f.empleados, -2730000);
  const f25 = C.rg49Flujo(d, plan, '2025-12-31');
  assert.strictEqual(f25.capital, 100000000); assert.strictEqual(f25.diferencia, 0);
});

t('Anexo 4: cambios del patrimonio neto (X1-1 y X1) cuadran con el balance', () => {
  const d = datos(), p = C.rg49PN(d, plan, '2026-12-31');
  const ult = p.filas[p.filas.length - 1][1];
  assert.strictEqual(ult[6], C.rg49Balance(d, plan, '2026-12-31').pn);
  // cada tramo: saldo inicial + movimientos = saldo final, por columna
  const i0 = 0, f0 = p.filas.findIndex(x => /E INICIO DEL EJERCICIO/.test(x[0]));
  for (let c = 0; c < 7; c++) {
    const suma = (a, b) => p.filas.slice(a, b).filter(x => x[1] && x[2] !== 'total' && x[2] !== 'gran').reduce((s, x) => s + x[1][c], 0);
    assert.strictEqual(p.filas[i0][1][c] + suma(i0 + 1, f0), p.filas[f0][1][c], 'tramo X1-1 col ' + c);
    assert.strictEqual(p.filas[f0][1][c] + suma(f0 + 1, p.filas.length - 1), ult[c], 'tramo X1 col ' + c);
  }
  assert.ok(p.filas.some(x => x[0] === 'TRANSFERENCIA A DIVIDENDOS A PAGAR' && x[1][4] === -5000000));
});

t('Anexo 6: revalúo con coeficiente y depreciación fiscal', () => {
  const d = datos(), r = C.rg49Revaluo(d, 2026);
  assert.strictEqual(r.filas[0].costo, 10000000); assert.strictEqual(r.filas[0].coeficiente, 1.05);
  assert.ok(r.filas[0].cuotaDeducible > 0); assert.strictEqual(r.filas[0].netoFiscal, r.filas[0].fiscal - r.filas[0].depFiscal);
});

t('Cuenta asignada a un grupo se informa como cuenta nueva dentro del grupo', () => {
  const d = datos(); d.cuentas.find(c => c.codigo === '1.1.6.01.01').rg49cod = '1.01.06';
  d.asientos.push({ id: 'x', fecha: '2026-02-01', concepto: 'Seguro', lineas: [{ cuenta: '1.1.6.01.01', debe: 700000, haber: 0 }, { cuenta: '1.1.1.02.01', debe: 0, haber: 700000 }] });
  const p2 = C.prepararPlan(d.cuentas), b = C.rg49Balance(d, p2, '2026-12-31');
  assert.strictEqual(b.extras['1.01.06'][0].nombre, 'Seguros pagados por adelantado'); assert.strictEqual(b.total['1.01.06'], 700000);
});

console.log(`\n${n} pruebas OK`);
