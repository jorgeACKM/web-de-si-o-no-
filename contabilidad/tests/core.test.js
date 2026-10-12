// Pruebas del motor contable: node contabilidad/tests/core.test.js
const assert = require('assert');
const PD = require('../js/plan-default.js');
const C = require('../js/core.js');

let n = 0;
const t = (name, fn) => { fn(); n++; console.log('✓', name); };

const plan = C.prepararPlan(PD.PLAN_DEFAULT);

t('IVA incluido 10% y 5%', () => {
  const d = C.desglose({ g10: 1100000, g5: 210000, exenta: 50000 });
  assert.strictEqual(d.iva10, 100000);
  assert.strictEqual(d.base10, 1000000);
  assert.strictEqual(d.iva5, 10000);
  assert.strictEqual(d.base5, 200000);
  assert.strictEqual(d.total, 1360000);
});

t('DV de RUC (módulo 11)', () => {
  assert.strictEqual(C.dvRuc('80000519'), 8); // ejemplo conocido: 80000519-8
  assert.strictEqual(C.rucValido('80000519-8'), true);
  assert.strictEqual(C.rucValido('80000519-1'), false);
});

t('Números con formato paraguayo', () => {
  assert.strictEqual(C.num('1.234.567'), 1234567);
  assert.strictEqual(C.num('7.350,50'), 7350.5);
  assert.strictEqual(C.parseFecha('05/03/2026'), '2026-03-05');
  assert.strictEqual(C.formatearNumeroComprobante('1-1-123'), '001-001-0000123');
  assert.strictEqual(C.siguienteNumero('001-001-0000123'), '001-001-0000124');
});

t('Plan: niveles, imputables y rubros heredados', () => {
  const c = plan.by['1.1.1.01.01'];
  assert.strictEqual(c.nivel, 5);
  assert.strictEqual(c.imputable, true);
  assert.strictEqual(c.rubro, 'AC_DISP');
  assert.strictEqual(plan.by['1.1.1.01'].nivel, 4);
  assert.strictEqual(plan.by['1.1.1.01'].imputable, false);
  assert.deepStrictEqual(plan.avisos, []);
});

t('Plan sin puntos usa prefijos', () => {
  const p = C.prepararPlan([{ codigo: '1' }, { codigo: '11' }, { codigo: '1101' }, { codigo: '110101', rg49: 'AC_DISP' }]);
  assert.strictEqual(p.by['110101'].padre, '1101');
  assert.strictEqual(p.by['110101'].nivel, 4);
});

t('Ejercicio fiscal con cierre en junio', () => {
  assert.strictEqual(C.inicioEjercicio('2026-03-15', 6), '2025-07-01');
  assert.strictEqual(C.inicioEjercicio('2026-08-15', 6), '2026-07-01');
  assert.strictEqual(C.inicioEjercicio('2026-08-15', 12), '2026-01-01');
});

function datos() {
  return {
    cliente: { cierreMes: 12 },
    ventas: [
      { id: 1, fecha: '2026-01-10', tipoDoc: 'FACTURA', numero: '001-001-0000001', condicion: 'CONTADO', g10: 11000000, g5: 0, exenta: 1000000 },
      { id: 2, fecha: '2026-01-20', tipoDoc: 'NOTA_CREDITO', numero: '001-001-0000001', condicion: 'CONTADO', g10: 1100000 }
    ],
    compras: [
      { id: 1, fecha: '2026-01-05', tipoDoc: 'FACTURA', condicion: 'CREDITO', g10: 5500000, afectacion: 'GRAVADA', cuenta: '5.1.1.01.02' },
      { id: 2, fecha: '2026-01-06', tipoDoc: 'FACTURA', condicion: 'CONTADO', g10: 1100000, afectacion: 'MIXTA', cuenta: '5.2.1.02.01' },
      { id: 3, fecha: '2026-02-06', tipoDoc: 'FACTURA', condicion: 'CONTADO', g10: 22000000, afectacion: 'GRAVADA', cuenta: '5.1.1.01.02' }
    ],
    asientos: [
      { id: 'a1', fecha: '2026-01-01', concepto: 'Apertura', lineas: [{ cuenta: '1.1.1.01.01', debe: 50000000, haber: 0 }, { cuenta: '3.1.1.01.01', debe: 0, haber: 50000000 }] }
    ],
    f120: { '2026-01': { retenciones: 50000 } }
  };
}

t('Asientos automáticos balancean', () => {
  const d = datos();
  C.todosLosAsientos(d).forEach(a => {
    const de = a.lineas.reduce((s, l) => s + l.debe, 0), ha = a.lineas.reduce((s, l) => s + l.haber, 0);
    assert.strictEqual(de, ha, a.concepto);
  });
});

t('Formulario 120 V4: casillas, prorrateo y saldos encadenados', () => {
  const d = datos();
  const f = C.f120(d, '2026-01'), k = f.k;
  assert.strictEqual(k.c10, 10000000); assert.strictEqual(k.c22, 1000000); assert.strictEqual(k.c12, 1000000);
  assert.strictEqual(k.c44, 1000000);                 // débito: facturas emitidas
  assert.strictEqual(k.c37, 1000000); assert.strictEqual(k.c42, 100000); // NC emitida → Rubro 3 inc. e
  assert.strictEqual(k.c38, 500000); assert.strictEqual(k.c39, 100000);
  assert.strictEqual(k.c160, 10000000); assert.strictEqual(k.c27, 11000000);
  assert.strictEqual(k.c164, Math.round(100000 * 10 / 11));
  assert.strictEqual(k.c43, 500000 + 90909 + 100000);
  assert.strictEqual(k.c48, 1000000 - 690909); assert.strictEqual(k.c50, k.c48);
  assert.strictEqual(k.c58, k.c50 - 50000);
  assert.strictEqual(k.c64, 100000 - 90909);           // IVA no computable del prorrateo
  const feb = C.f120(d, '2026-02').k;
  assert.strictEqual(feb.c46, 0); assert.strictEqual(feb.c47, 2000000);
  assert.strictEqual(C.f120(d, '2026-03').k.c46, 2000000);
});

t('Formulario 120: NC recibida va al débito (Rubro 1 inc. h)', () => {
  const d = { cliente: {}, ventas: [], compras: [{ id: 1, fecha: '2026-05-02', tipoDoc: 'NOTA_CREDITO', g10: 220000 }] };
  const k = C.f120(d, '2026-05').k;
  assert.strictEqual(k.c15, 200000); assert.strictEqual(k.c23, 20000); assert.strictEqual(k.c44, 20000);
});

t('RG 90: líneas, identificación, exclusión de electrónicos y nombre de archivo', () => {
  const d = { cliente: {}, ventas: [
    { id: 1, fecha: '2026-01-10', tipoDoc: 'FACTURA', timbrado: '12345678', numero: '001-001-0000001', ruc: '80000519-8', razon: 'Cliente, S.A.', condicion: 'CREDITO', g10: 1100000, exenta: 5000 },
    { id: 2, fecha: '2026-01-11', tipoDoc: 'NOTA_CREDITO', timbrado: '12345678', numero: '001-001-0000002', ruc: 'X', g10: 110000, asocNumero: '001-001-0000001', asocTimbrado: '12345678' },
    { id: 3, fecha: '2026-01-12', tipoDoc: 'FACTURA', electronico: true, g10: 1000 }],
    compras: [{ id: 4, fecha: '2026-01-05', tipoDoc: 'FACTURA', timbrado: '87654321', numero: '001-002-0000456', ruc: '1234567', razon: 'Juan', g5: 210000 }] };
  const r = C.rg90(d, '2026-01');
  assert.deepStrictEqual(r.errores, []);
  assert.strictEqual(r.excluidos.length, 1);
  const L = r.csv.trim().split('\r\n');
  assert.strictEqual(L[0], '1,11,80000519,Cliente S.A.,109,10/01/2026,12345678,001-001-0000001,1100000,0,5000,1105000,2,N,S,S,N,,');
  assert.strictEqual(L[1].split(',').length, 19);
  assert.ok(L[1].endsWith(',001-001-0000001,12345678'));
  assert.strictEqual(L[2].split(',').length, 20);
  assert.ok(L[2].startsWith('2,12,1234567,Juan,109,'));
  assert.strictEqual(C.rg90NombreArchivo('80000519-8', '2026-01', 1), '80000519_REG_012026_V0001');
  assert.strictEqual(C.rg90NombreArchivo('80000519-8', '2026-01', 3, true), '80000519_REG_2026_V0003');
});

t('Balance cuadra (nivel 4 y RG49)', () => {
  const d = datos();
  const b = C.balanceComparativo(d, plan, [{ hasta: '2026-01-31', tc: 7500 }, { hasta: '2026-02-28', tc: 7400 }], 4);
  b.totales.forEach(tt => assert.strictEqual(tt.diferencia, 0));
  const r = C.rubrosAl(d, plan, '2026-02-28');
  assert.strictEqual(r.tot.diferencia, 0);
  const caja = b.filas.find(f => f.codigo === '1.1.1.01');
  assert.ok(caja.usd[0] > 0);
});

t('Resultados de ejercicios anteriores pasan a resultados acumulados', () => {
  const d = datos();
  const r = C.rubrosAl(d, plan, '2027-01-31');
  assert.strictEqual(r.tot.diferencia, 0);
  assert.ok(r.rubros.PN_RESACUM !== 0);
  assert.strictEqual(Math.round(r.rubros.PN_RESEJ), 0);
});

t('Formulario 500', () => {
  const d = datos();
  d.asientos.push({ id: 'a2', fecha: '2026-12-31', concepto: 'Multa', lineas: [{ cuenta: '5.4.1.01.02', debe: 100000, haber: 0 }, { cuenta: '1.1.1.01.01', debe: 0, haber: 100000 }] });
  d.f500 = { 2026: { quebrantoAnterior: 10000000 } };
  const f = C.f500(d, plan, 2026);
  assert.strictEqual(f.noDeducibles, 100000);
  assert.strictEqual(f.rentaNeta, f.resultadoAntesIRE + 100000);
  if (f.rentaNeta > 0) assert.strictEqual(f.quebrantoCompensado, Math.min(10000000, Math.round(f.rentaNeta * 0.2)));
  assert.strictEqual(f.impuesto, Math.round(f.rentaNetaImponible * 0.1));
  assert.strictEqual(Math.round(f.ventasF120), Math.round(f.R.er.ventas));
});

console.log(`\n${n} pruebas OK`);
