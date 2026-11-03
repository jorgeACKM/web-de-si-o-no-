// Pruebas de los formularios 515 y 516 del IRP: node contabilidad/tests/irp.test.js
const assert = require('assert');
require('../js/plan-default.js');
const C = require('../js/core.js');
require('../js/core-ext.js'); require('../js/core-cierre.js'); require('../js/core-irp.js');
let n = 0;
const t = (name, fn) => { fn(); n++; console.log('✓', name); };
const base = () => ({ cliente: { cierreMes: 12 }, ventas: [], compras: [], asientos: [], config: {} });

t('515: ejemplo 1 del instructivo (renta neta 210.000.000)', () => {
  const d = base(); d.irp515 = { 2026: { usarSugeridos: false, c12: 260000000, c15: 50000000 } };
  const k = C.f515(d, 2026).k;
  assert.strictEqual(k.c14, 260000000); assert.strictEqual(k.c22, 50000000); assert.strictEqual(k.c45, 210000000);
  assert.strictEqual(k.c46, 4000000); assert.strictEqual(k.c47, 9000000); assert.strictEqual(k.c48, 6000000);
  assert.strictEqual(k.c50, 19000000); assert.strictEqual(k.c51, 19000000);
});

t('515: ejemplo 2 del instructivo (renta neta 60.000.000) con retenciones y saldo anterior', () => {
  const d = base(); d.irp515 = { 2026: { usarSugeridos: false, c12: 60000000, c40: 300000, c41: 600000 } };
  const k = C.f515(d, 2026).k;
  assert.strictEqual(k.c46, 4000000); assert.strictEqual(k.c47, 900000); assert.strictEqual(k.c48, 0);
  assert.strictEqual(k.c43, 900000); assert.strictEqual(k.c51, 4900000 - 900000);
});

t('515: egresos limitados a los ingresos, inmueble con préstamo y pérdida arrastrable', () => {
  const d = base(); d.irp515 = { 2026: { usarSugeridos: false, c12: 100000000, c16: 70000000, c23: 80000000, prestamos: [{ tipo: 'PRESTAMO', ruc: '80000000', fecha: '2026-03-01', monto: 60000000, utilizado: 45000000 }] } };
  const k = C.f515(d, 2026).k;
  assert.strictEqual(k.c26, 70000000); assert.strictEqual(k.c27, 30000000); assert.strictEqual(k.c28, 30000000); assert.strictEqual(k.c29, 0);
  assert.strictEqual(k.c102, 45000000); assert.strictEqual(k.c30, 45000000); assert.strictEqual(k.c32, 45000000); assert.strictEqual(k.c31, 5000000);
  assert.strictEqual(k.c39, 45000000); assert.strictEqual(k.c51, 0);
});

t('515: compensación de pérdida anterior limitada al 20% y donaciones al 5%', () => {
  const d = base(); d.irp515 = { 2026: { usarSugeridos: false, c12: 100000000, c21: 9000000, c34: 50000000 } };
  const r = C.f515(d, 2026), k = r.k;
  assert.strictEqual(k.c21, 5000000); assert.ok(r.alertas.some(a => a.includes('5%')));
  assert.strictEqual(k.c29, 95000000); assert.strictEqual(k.c38, 19000000); assert.strictEqual(k.c39, 31000000); assert.strictEqual(k.c45, 76000000);
});

t('515: sugerencias desde comprobantes, IPS patronal y retenciones IRP', () => {
  const d = base();
  d.ventas.push({ id: 1, fecha: '2026-02-01', tipoDoc: 'FACTURA', g10: 11000000 });
  d.compras.push({ id: 2, fecha: '2026-02-02', tipoDoc: 'FACTURA', g10: 1100000, afectacion: 'GRAVADA' });
  d.planillas = { '2026-03': { lineas: [{ nombre: 'A', salario: 2000000 }] } };
  d.retenciones = [{ id: 3, fecha: '2026-04-01', tipo: 'RECIBIDA', impuesto: 'IRP', monto: 150000 }];
  const k = C.f515(d, 2026).k;
  assert.strictEqual(k.c12, 10000000); assert.strictEqual(k.c15, 1000000); assert.strictEqual(k.c19, 330000); assert.strictEqual(k.c41, 150000);
});

t('516: agrupación por incisos, renta real/presunta y liquidación al 8%', () => {
  const d = base(); d.irp516 = { 2026: { operaciones: [
    { rubro: 1, tipo: 'Bienes muebles', ingreso: 50000000, costo: 10000000 },   // real 40M, presunta 15M → a, 15M
    { rubro: 1, tipo: 'Bienes muebles', ingreso: 30000000, costo: 25000000 },   // real 5M, presunta 9M → b, 5M
    { rubro: 1, tipo: 'Bienes muebles', ingreso: 10000000, costo: 12000000 },   // c, 0
    { rubro: 2, tipo: 'Arrendamiento de inmuebles', ingreso: 24000000, costo: 4000000 }, // presunta 7,2M
    { rubro: 3, tipo: 'Rescate de acciones', ingreso: 10000000, costo: 7000000 },
    { rubro: 1, tipo: 'Autovehículo con costo totalmente deducido', ingreso: 100000000, costo: 60000000 } ], regalias: 10000000, otros: 1000000 } };
  const r = C.f516(d, 2026), k = r.k;
  assert.deepStrictEqual(r.operaciones.map(o => o.grupo), ['a', 'b', 'c', 'a', 'a', 'd']);
  assert.strictEqual(k.c76, 15000000 + 5000000 + 0 + 72000000);
  assert.strictEqual(k.c107, 7200000); assert.strictEqual(k.c120, 3000000);
  assert.strictEqual(k.c122, 7000000); assert.strictEqual(k.c128, 8000000);
  assert.strictEqual(k.c129, 92000000 + 7200000 + 3000000 + 8000000);
  assert.strictEqual(k.c130, Math.round(k.c129 * 0.08)); assert.strictEqual(k.c132, k.c130);
});

console.log(`\n${n} pruebas OK`);
