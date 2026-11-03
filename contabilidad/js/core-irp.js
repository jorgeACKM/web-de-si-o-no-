/* Impuesto a la Renta Personal: Formulario 515 (servicios personales, IRP-RSP) y
 * Formulario 516 (rentas y ganancias del capital, IRP-RGC), según sus instructivos oficiales. Sin DOM. */
(function (root) {
  'use strict';
  const C = root.Conta || (typeof require !== 'undefined' ? require('./core-cierre.js') : null);
  const vacio = v => v === undefined || v === null || v === '';
  const n0 = v => C.r0(C.num(v));
  const enAnio = (x, anio) => x.fecha && x.fecha.slice(0, 4) === String(anio);

  /* ======================= FORMULARIO 515 – IRP RSP ======================= */
  C.TIPOS_FAMILIAR = { a: 'Cónyuge', b: 'Hijos menores de edad', c: 'Hijos mayores de edad estudiando en educación superior', d: 'Hermanos menores de edad', e: 'Padres', f: 'Abuelos', g: 'Suegros', h: 'Otra persona con obligación legal de alimentos' };
  // Valores que se pueden tomar de la contabilidad del cliente (sugerencias).
  C.sugerencias515 = function (data, anio) {
    let ingresos = 0, egresos = 0;
    (data.ventas || []).filter(v => enAnio(v, anio)).forEach(v => { const d = C.desglose(v); ingresos += C.signo(v) * (d.base10 + d.base5 + d.exenta + d.exportacion); });
    (data.compras || []).filter(c => enAnio(c, anio) && !c.noImputa).forEach(c => { const d = C.desglose(c); egresos += C.signo(c) * (d.base10 + d.base5 + d.exenta + (c.afectacion === 'EXENTA' ? d.iva : 0)); });
    let patronal = 0;
    Object.keys(data.planillas || {}).filter(p => p.slice(0, 4) === String(anio)).forEach(p => { const r = C.calcularPlanilla(data, p); if (r) patronal += r.t.ipsPatronal; });
    const retenciones = C.retencionesDelPeriodo ? C.retencionesDelPeriodo(data, `${anio}-01-01`, `${anio}-12-31`, 'IRP') : 0;
    const ant = ((data.irp515 || {})[anio - 1]);
    const prev = ant ? C.f515(data, anio - 1) : null;
    return { c12: Math.round(ingresos), c15: Math.round(egresos), c19: Math.round(patronal), c41: retenciones, c40: prev ? prev.k.c44 : 0, c34: prev ? prev.k.c39 : 0 };
  };

  C.f515 = function (data, anio) {
    const cfg = C.config(data);
    const e = ((data.irp515 || {})[anio]) || {};
    const sg = C.sugerencias515(data, anio);
    const val = (k, auto) => vacio(e[k]) ? (auto === undefined ? 0 : auto) : n0(e[k]);
    const k = {};
    const alertas = [];
    // RUBRO 1 – Ingresos (sin IVA)
    k.c10 = val('c10'); k.c11 = val('c11');
    k.c12 = val('c12', e.usarSugeridos === false ? 0 : sg.c12); k.c13 = val('c13');
    k.c14 = k.c12 + k.c13;
    // RUBRO 2 – Egresos deducibles
    ['c15', 'c16', 'c17', 'c18', 'c19', 'c20', 'c21', 'c23'].forEach(c => { k[c] = val(c, c === 'c15' && e.usarSugeridos !== false ? sg.c15 : c === 'c19' && e.usarSugeridos !== false ? sg.c19 : 0); });
    const tope21 = Math.round(k.c14 * 0.05);
    if (k.c21 > tope21) { alertas.push(`Cuotas, aportes y donaciones (cas. 21) limitadas al 5% de la renta bruta gravada: ${tope21.toLocaleString('es-PY')}.`); k.c21 = tope21; }
    k.c22 = k.c15 + k.c16 + k.c17 + k.c18 + k.c19 + k.c20 + k.c21;
    k.c24 = k.c22 + k.c23;
    // ANEXO cuadro 1 – préstamos y remanentes utilizados
    const prestamos = (e.prestamos || []).slice(0, 10).map((p, i) => ({ tipo: p.tipo || 'PRESTAMO', ruc: p.ruc || '', fecha: p.fecha || '', monto: n0(p.monto), utilizado: n0(p.utilizado), cas: [52 + i, 62 + i, 72 + i, 82 + i, 92 + i] }));
    k.c102 = prestamos.reduce((s, p) => s + p.utilizado, 0);
    // RUBRO 3 – Resultado
    k.c25 = k.c14;
    k.c26 = Math.min(k.c22, k.c25);
    k.c27 = k.c25 - k.c26;
    k.c28 = Math.min(k.c23, k.c27);
    k.c29 = k.c27 - k.c28;
    const exceso = Math.max(0, k.c23 - k.c27);
    k.c30 = exceso > 0 ? Math.min(k.c102, exceso) : 0;
    k.c32 = k.c30;                 // pérdida arrastrable: lo cubierto con préstamos o remanentes
    k.c31 = exceso - k.c30;        // pérdida no arrastrable
    // RUBRO 4 – Pérdida fiscal arrastrable por inmueble para la vivienda
    k.c33 = k.c32;
    k.c34 = val('c34', sg.c34);
    k.c35 = k.c33 + k.c34;
    k.c36 = Math.min(val('c36'), k.c35);
    k.c37 = k.c35 - k.c36;
    const tope38 = Math.round(k.c29 * 0.2);
    k.c38 = vacio(e.c38) ? Math.min(k.c34 - Math.min(k.c36, k.c34), tope38) : Math.min(n0(e.c38), tope38, k.c37);
    k.c38 = Math.max(0, k.c38);
    k.c39 = k.c37 - k.c38;
    // RUBRO 5 – Liquidación
    k.c45 = k.c29 - k.c38;
    const tr = C.tramosIRP(cfg.irpTramos); // 50.000.000 al 8%, hasta 150.000.000 al 9%, exceso al 10%
    const t = C.impuestoPorTramos(Math.max(0, k.c45), tr);
    k.c46 = (t.detalle[0] || {}).impuesto || 0; k.c47 = (t.detalle[1] || {}).impuesto || 0; k.c48 = (t.detalle[2] || {}).impuesto || 0;
    k.c40 = val('c40', sg.c40); k.c41 = val('c41', sg.c41); k.c42 = val('c42'); k.c49 = val('c49');
    k.c43 = k.c40 + k.c41 + k.c42;
    k.c50 = k.c46 + k.c47 + k.c48 + k.c49;
    k.c44 = k.c43 > k.c50 ? k.c43 - k.c50 : 0;
    k.c51 = k.c50 > k.c43 ? k.c50 - k.c43 : 0;
    // ANEXO cuadro 2 – familiares a cargo
    const familiares = (e.familiares || []).filter(f => f && f.tipo);
    const cant = {}; Object.keys(C.TIPOS_FAMILIAR).forEach(x => { cant[x] = familiares.filter(f => f.tipo === x).length; });
    Object.keys(cant).forEach((x, i) => { k['c' + (147 + i)] = cant[x]; });
    if (k.c18 && !e.autoUltimo) alertas.push('Autovehículo (cas. 18): deducible una vez cada 3 años; verifique la fecha de la última deducción.');
    if (k.c23) alertas.push('Inmueble para vivienda (cas. 23): deducible una vez cada 5 años, adquirido al contado.');
    if (k.c10 + k.c11 + k.c14 === 0) alertas.push('No hay ingresos cargados para el ejercicio.');
    return { anio, k, sugeridos: sg, prestamos, familiares, alertas, tramos: t.detalle, rubros: C.estructura515(k) };
  };

  C.estructura515 = function (k) {
    const c = n => [n, k['c' + n]];
    return [
      { titulo: 'RUBRO 1 – INGRESOS OBTENIDOS POR LA PRESTACIÓN DE SERVICIOS PERSONALES', cols: ['Exonerados -I-', 'Gravados -II-'], filas: [
        ['a', 'Ingresos del ejercicio fiscal por la prestación de servicios personales (Art. 62 de la Ley N° 6.380/2019)', [c(10), c(12)]],
        ['b', 'Ingresos en carácter de padres, tutores o curadores por rentas de hijos bajo patria potestad o personas bajo tutela o curatela (Art. 4° Anexo Decreto N° 3.184/2019)', [c(11), c(13)]],
        ['c', 'TOTAL INGRESOS BRUTOS GRAVADOS PERCIBIDOS EN EL EJERCICIO FISCAL', [null, c(14)], 1]] },
      { titulo: 'RUBRO 2 – EGRESOS DEDUCIBLES DEL EJERCICIO FISCAL', cols: ['Importe'], filas: [
        ['a', 'Egresos directamente relacionados con la actividad gravada', [c(15)]],
        ['b', 'Egresos personales y a favor de familiares a cargo realizados en el país (excepto incisos d e i)', [c(16)]],
        ['c', 'Egresos personales y de familiares a cargo realizados en el exterior, exclusivamente salud y educación', [c(17)]],
        ['d', 'Egreso personal por la adquisición de un autovehículo cada 3 (tres) años', [c(18)]],
        ['e', 'Aporte patronal a favor del trabajador al Sistema de Seguridad Social', [c(19)]],
        ['f', 'Aporte a un sistema privado de seguridad social del prestador de servicio personal independiente', [c(20)]],
        ['g', 'Cuotas, aportes, diezmos y donaciones a favor del Estado y demás asociaciones (hasta el 5% de la renta bruta gravada)', [c(21)]],
        ['h', 'EGRESOS DEDUCIDOS EN EL EJERCICIO FISCAL (sumatoria de las casillas 15 al 21; sus resultados negativos no se compensan ni arrastran)', [c(22)], 1],
        ['i', 'EGRESO PERSONAL POR LA ADQUISICIÓN AL CONTADO DE UN INMUEBLE PARA LA VIVIENDA CADA 5 AÑOS (sus resultados negativos pueden compensarse o arrastrarse)', [c(23)]],
        ['j', 'TOTAL DE EGRESOS DEDUCIBLES EN EL EJERCICIO FISCAL (casillas 22 + 23)', [c(24)], 1]] },
      { titulo: 'RUBRO 3 – RESULTADO OBTENIDO LUEGO DE APLICAR LAS DEDUCCIONES ADMITIDAS', cols: ['Importe'], filas: [
        ['a', 'Ingresos brutos gravados del ejercicio fiscal (casilla 14)', [c(25)]],
        ['b', 'Menos: egresos deducidos (casilla 22, limitada al monto de la casilla 25)', [c(26)]],
        ['c', 'Resultado después de descontar los egresos deducibles (25 − 26)', [c(27)]],
        ['d', 'Menos: egreso por adquisición al contado de inmueble para la vivienda (casilla 23, hasta el monto de la 27)', [c(28)]],
        ['e', 'SUBTOTAL RENTA NETA IMPONIBLE ANTES DEL SALDO ARRASTRABLE DE PÉRDIDAS (27 − 28)', [c(29)], 1],
        ['f', 'Préstamos/financiaciones o remanente de ingresos gravados de los 5 últimos ejercicios utilizados (casilla 102 del Anexo, solo si el egreso por inmueble supera la casilla 27)', [c(30)]],
        ['g', 'Saldo de egresos por inmueble no arrastrable (pérdida fiscal no arrastrable, Art. 66 de la Ley)', [c(31)]],
        ['h', 'Pérdida fiscal por adquisición de inmueble, arrastrable al siguiente ejercicio (cubierta con préstamos o remanentes)', [c(32)]]] },
      { titulo: 'RUBRO 4 – PÉRDIDA FISCAL ARRASTRABLE POR LA ADQUISICIÓN DE UN INMUEBLE PARA LA VIVIENDA', cols: ['Importe'], filas: [
        ['a', 'Pérdida fiscal arrastrable producida en el ejercicio (casilla 32)', [c(33)]],
        ['b', 'Más: pérdida fiscal arrastrable proveniente del ejercicio anterior', [c(34)]],
        ['c', 'Acumulado de pérdida fiscal por adquisición de inmueble (33 + 34)', [c(35)]],
        ['d', 'Menos: porción que debe excluirse por superar los 5 años de arrastre', [c(36)]],
        ['e', 'Saldo de pérdida fiscal susceptible de ser compensado (35 − 36)', [c(37)]],
        ['f', 'Menos: porción de pérdida de ejercicios anteriores que se compensa con la renta neta (casilla 29), limitada al 20% de dicha renta', [c(38)]],
        ['g', 'Saldo de pérdida fiscal a trasladar al ejercicio siguiente, casilla 34 (37 − 38)', [c(39)], 1]] },
      { titulo: 'RUBRO 5 – DETERMINACIÓN DEL IMPUESTO Y LIQUIDACIÓN FINAL', cols: ['Contribuyente -I-', 'Fisco -II-'], filas: [
        ['a', 'RENTA NETA IMPONIBLE (29 − 38)', [null, c(45)], 1],
        ['b', 'Impuesto determinado a la tasa del 8% por la porción de la renta neta hasta ₲ 50.000.000', [null, c(46)]],
        ['c', 'Impuesto determinado a la tasa del 9% por la porción desde ₲ 50.000.001 hasta ₲ 150.000.000', [null, c(47)]],
        ['d', 'Impuesto determinado a la tasa del 10% por la porción mayor a ₲ 150.000.000', [null, c(48)]],
        ['e', 'Saldo a favor del contribuyente del ejercicio anterior (casilla 44 de la DJ anterior)', [c(40), null]],
        ['f', 'RETENCIONES: retenciones computables a favor del contribuyente', [c(41), null]],
        ['g', 'PERCEPCIONES: percepciones computables a favor del contribuyente', [c(42), null]],
        ['h', 'Multa por presentar la declaración jurada con posterioridad al vencimiento', [null, c(49)]],
        ['i', 'SUBTOTAL (Col. I: 40 al 42; Col. II: 46 al 49)', [c(43), c(50)], 1],
        ['j', 'SALDO A FAVOR DEL CONTRIBUYENTE (43 − 50, cuando la 43 sea mayor)', [c(44), null], 1],
        ['k', 'SALDO A INGRESAR A FAVOR DEL FISCO (50 − 43, cuando la 50 sea mayor)', [null, c(51)], 1]] }
    ];
  };

  /* ======================= FORMULARIO 516 – IRP RGC ======================= */
  // Operación: {rubro: 1|2|3, tipo, descripcion, ingreso (col. I, sin IVA), costo (col. II)}
  C.TIPOS_516 = {
    1: ['Bienes muebles', 'Inmuebles a plazo (cuotas cobradas)', 'Acciones', 'Cuotas de capital', 'Cesión de derechos y similares', 'Autovehículo con costo totalmente deducido'],
    2: ['Arrendamiento de inmuebles', 'Subarrendamiento de inmuebles'],
    3: ['Rescate de acciones', 'Rescate de cuotas partes']
  };
  C.calcularOperacion516 = function (o) {
    const I = n0(o.ingreso), II = n0(o.costo);
    if (+o.rubro === 3) { const imp = Math.max(0, I - II); return { I, II, real: imp, presunta: null, imponible: imp, grupo: I > II ? 'a' : 'b' }; }
    if (o.tipo === 'Autovehículo con costo totalmente deducido') {
      // V1 del instructivo: CD + (PV − CD) × 30% si PV > CD; caso contrario, CD
      const imp = I > II ? Math.round(II + (I - II) * 0.3) : II;
      return { I, II, real: null, presunta: null, imponible: imp, grupo: I > II ? 'd' : 'e' };
    }
    const real = Math.max(0, I - II), presunta = Math.round(I * 0.3);
    const grupo = presunta < real ? 'a' : (I > II ? 'b' : 'c');
    return { I, II, real, presunta, imponible: Math.min(real, presunta), grupo };
  };
  C.f516 = function (data, anio) {
    const cfg = C.config(data);
    const e = ((data.irp516 || {})[anio]) || {};
    const ops = (e.operaciones || []).map(o => Object.assign({}, o, C.calcularOperacion516(o)));
    const NOMBRE_GRUPO = {
      a: 'Por renta neta presunta (la presunta resultó menor que la real)',
      b: 'Por renta neta real, cuando el precio de venta es mayor que el precio de compra y gastos',
      c: 'Por renta neta real, cuando el precio de venta es menor o igual que el precio de compra',
      d: 'Autovehículo con costo deducido: precio de venta mayor que el costo deducido',
      e: 'Autovehículo con costo deducido: precio de venta menor o igual que el costo deducido'
    };
    const NOMBRE_RESCATE = { a: 'Importe del rescate mayor que el costo', b: 'Importe del rescate menor o igual que el costo' };
    const consolidar = rubro => {
      const filas = [];
      const porTipo = {};
      ops.filter(o => +o.rubro === rubro).forEach(o => { const key = `${o.tipo}|${o.grupo}`; const x = porTipo[key] || (porTipo[key] = { tipo: o.tipo, grupo: o.grupo, I: 0, II: 0, real: 0, presunta: 0, imponible: 0, n: 0 }); x.I += o.I; x.II += o.II; x.real += o.real || 0; x.presunta += o.presunta || 0; x.imponible += o.imponible; x.n++; });
      Object.values(porTipo).sort((a, b) => a.tipo.localeCompare(b.tipo) || a.grupo.localeCompare(b.grupo)).forEach(x => filas.push(Object.assign(x, { nombre: `${x.tipo} – ${(rubro === 3 ? NOMBRE_RESCATE : NOMBRE_GRUPO)[x.grupo]}` })));
      return filas;
    };
    const r1 = consolidar(1), r2 = consolidar(2), r3 = consolidar(3);
    const k = {};
    k.c76 = r1.reduce((s, x) => s + x.imponible, 0);
    k.c107 = r2.reduce((s, x) => s + x.imponible, 0);
    k.c120 = r3.reduce((s, x) => s + x.imponible, 0);
    k.c122 = Math.round(n0(e.regalias) * 0.7);
    k.c124 = n0(e.incorporacion); k.c126 = n0(e.indemnizaciones); k.c127 = n0(e.otros);
    k.c128 = k.c122 + k.c124 + k.c126 + k.c127;
    k.c129 = k.c76 + k.c107 + k.c120 + k.c128;
    k.c130 = Math.round(k.c129 * (+cfg.tasaIRPCapital || 8) / 100);
    k.c131 = n0(e.multa);
    k.c132 = k.c130 + k.c131;
    const alertas = [];
    const ventasMuebles = ops.filter(o => +o.rubro === 1 && o.tipo === 'Bienes muebles').reduce((s, o) => s + o.I, 0);
    if (ventasMuebles && ventasMuebles <= 20000000) alertas.push('Las ventas de bienes muebles del año no superan ₲ 20.000.000: según el instructivo, los incisos de bienes muebles se completan solo si superan ese monto.');
    if (e.regalias) alertas.push('Regalías (cas. 122): se consigna el 70% del monto percibido cuando hay aprovechamiento parcial en el país y en el exterior.');
    return { anio, k, operaciones: ops, r1, r2, r3, alertas, regalias: n0(e.regalias) };
  };

  if (typeof module !== 'undefined') module.exports = C;
})(typeof window !== 'undefined' ? window : globalThis);
