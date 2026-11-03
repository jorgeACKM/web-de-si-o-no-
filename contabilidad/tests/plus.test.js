// Pruebas de controles, Tesaka, cruce con terceros, anticipos y laboral: node tests/plus.test.js
const assert = require('assert');
const PD = require('../js/plan-default.js');
const C = require('../js/core.js');
require('../js/core-ext.js'); require('../js/core-cierre.js'); require('../js/core-plus.js');

let n = 0;
const t = (name, fn) => { fn(); n++; console.log('✓', name); };
const plan = C.prepararPlan(PD.PLAN_DEFAULT);
const base = () => ({ cliente: { cierreMes: 12, ruc: '80000519-8' }, cuentas: PD.PLAN_DEFAULT.map(c => Object.assign({}, c)), ventas: [], compras: [], asientos: [], tiposCambio: {}, f120: {}, f500: {}, terceros: {}, retenciones: [], empleados: [], planillas: {} });

t('Feriados: Jueves y Viernes Santo 2026 y día hábil siguiente', () => {
  assert.strictEqual(C.pascua(2026), '2026-04-05');
  const f = C.feriados(2026); assert.ok(f.includes('2026-04-02') && f.includes('2026-04-03'));
  assert.strictEqual(C.diaHabil('2026-04-02'), '2026-04-06');
  assert.strictEqual(C.diaHabil('2026-12-25'), '2026-12-28');
});
t('Número en letras', () => {
  assert.strictEqual(C.numeroEnLetras(2550307), 'dos millones quinientos cincuenta mil trescientos siete');
  assert.strictEqual(C.numeroEnLetras(1000000), 'un millón');
  assert.strictEqual(C.numeroEnLetras(21000), 'veintiún mil');
});
t('Cuadre del mes: libro, Form. 120 y contabilidad coinciden', () => {
  const d = base();
  d.ventas.push({ id: 'v', fecha: '2026-03-10', tipoDoc: 'FACTURA', g10: 1100000, timbrado: '12345678', numero: '001-001-0000001', ruc: '80012345-0', razon: 'X' });
  d.compras.push({ id: 'c', fecha: '2026-03-11', tipoDoc: 'FACTURA', g10: 550000, cuenta: '5.1.1.01.02', afectacion: 'GRAVADA', timbrado: '87654321', numero: '001-001-0000002', ruc: '80000005-6', razon: 'P' });
  const r = C.cuadreMes(d, '2026-03');
  assert.deepStrictEqual(r.filas.map(f => [f.libro, f.f120, f.contable]), [[100000, 100000, 100000], [50000, 50000, 50000]]);
  assert.strictEqual(r.rg90.lineas, 2);
});
t('Timbrado vencido según el registro', () => {
  const d = base();
  d.compras.push({ id: 'c', fecha: '2026-03-11', tipoDoc: 'FACTURA', g10: 550000, timbrado: '87654321', numero: '001-001-0000002', ruc: '80000005-6' });
  d.timbrados = { [C.claveTimbrado('80000005-6', '87654321')]: { vence: '2026-02-28' } };
  assert.strictEqual(C.controlTimbrados(d, '2026-03').length, 1);
  assert.strictEqual(C.timbradosUsados(d)[0].cantidad, 1);
});
t('Cruce con terceros: faltantes, diferencias y coincidencias', () => {
  const p = [{ ruc: '80000005-6', numero: '001-001-0000002', g10: 550000 }, { ruc: '80000006-4', numero: '001-001-0000009', g10: 110000 }];
  const i = [{ ruc: '80000005', numero: '1-1-2', g10: 550000 }, { ruc: '80000007-2', numero: '001-001-0000003', g10: 220000 }];
  const r = C.cruceTerceros(p, i);
  assert.strictEqual(r.coinciden.length, 1); assert.strictEqual(r.faltanEnSistema.length, 1); assert.strictEqual(r.faltanEnTerceros.length, 1);
});
t('Tesaka: retención de IVA 30% con su factura', () => {
  const d = base();
  d.compras.push({ id: 'c', fecha: '2026-03-11', tipoDoc: 'FACTURA', g10: 1100000, timbrado: '87654321', numero: '001-001-0000002', ruc: '80000005-6', razon: 'Prov' });
  d.retenciones.push({ id: 'r', fecha: '2026-03-12', tipo: 'EMITIDA', impuesto: 'IVA', ruc: '80000005-6', numero: '1', docNumero: '001-001-0000002', monto: 30000 });
  const r = C.tesaka(d, '2026-03');
  assert.strictEqual(r.errores.length, 0);
  assert.strictEqual(r.retenciones[0].retencion.ivaPorcentaje10, 30);
  assert.strictEqual(r.retenciones[0].informado.ruc, '80000005');
});
t('Anticipos de IRE: 4 cuotas del 25% del impuesto del ejercicio anterior', () => {
  const d = base();
  d.ventas.push({ id: 'v', fecha: '2025-05-10', tipoDoc: 'FACTURA', g10: 110000000, timbrado: '12345678', numero: '001-001-0000001' });
  const r = C.anticiposIRE(d, plan, 2026);
  assert.strictEqual(r.cuotas.length, 4);
  assert.strictEqual(r.cuota, Math.round(r.base * 0.25));
  assert.ok(r.cuotas[0].fecha.startsWith('2026-06'));
});
t('Aguinaldo y planillas del Ministerio de Trabajo', () => {
  const d = base();
  d.empleados.push({ id: 'e1', nombre: 'Ana', ci: '123', salario: 3000000, ingreso: '2026-07-01', sexo: 'F', nacimiento: '1990-01-01' });
  assert.strictEqual(C.aguinaldo(d, 2026)[0].aguinaldo, 1500000);
  d.planillas['2026-07'] = { lineas: [{ empId: 'e1', nombre: 'Ana', ci: '123', salario: 3000000, extras: 0, descuentos: 0, aguinaldo: 0 }] };
  const m = C.planillasMTESS(d, 2026);
  assert.strictEqual(m.resumen.mujeres, 1); assert.strictEqual(m.sueldos[0].meses[6], 3000000);
  assert.strictEqual(C.planillaIPS(d, '2026-07').t.obrero, 270000);
  assert.strictEqual(C.recibosSalario(d, '2026-07')[0].neto, 2730000);
});
t('Honorarios del estudio', () => {
  const r = C.estadoHonorarios({ honorario: 500000, honorariosDesde: '2026-01', cobrosHonorarios: [{ monto: 1000000 }] }, '2026-04');
  assert.deepStrictEqual([r.devengado, r.saldo, r.mesesAdeudados], [2000000, 1000000, 2]);
});
console.log(`\n${n} pruebas OK`);
