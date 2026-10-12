/* Motor contable: cálculos puros, sin DOM. Se puede probar con Node. */
(function (root) {
  'use strict';
  const PD = root.PlanDefault || (typeof require !== 'undefined' ? require('./plan-default.js') : null);
  const C = {};

  C.num = v => {
    if (typeof v === 'number') return isFinite(v) ? v : 0;
    if (v === null || v === undefined || v === '') return 0;
    // Acepta "1.234.567" (formato PY) y "1234567,50"
    let s = String(v).trim().replace(/\s/g, '');
    if (/^-?[\d.]+,\d+$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
    else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
    else s = s.replace(/,/g, '');
    const n = parseFloat(s);
    return isFinite(n) ? n : 0;
  };
  C.r0 = n => Math.round(C.num(n));
  C.r2 = n => Math.round(C.num(n) * 100) / 100;

  /* ---------- Fechas ---------- */
  C.pad = n => String(n).padStart(2, '0');
  C.parseFecha = function (v) {
    if (!v && v !== 0) return '';
    if (v instanceof Date && !isNaN(v)) return `${v.getFullYear()}-${C.pad(v.getMonth() + 1)}-${C.pad(v.getDate())}`;
    if (typeof v === 'number') { // serial de Excel
      const d = new Date(Math.round((v - 25569) * 86400000));
      return `${d.getUTCFullYear()}-${C.pad(d.getUTCMonth() + 1)}-${C.pad(d.getUTCDate())}`;
    }
    const s = String(v).trim();
    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return `${m[1]}-${C.pad(m[2])}-${C.pad(m[3])}`;
    m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
    if (m) { const y = m[3].length === 2 ? '20' + m[3] : m[3]; return `${y}-${C.pad(m[2])}-${C.pad(m[1])}`; }
    return '';
  };
  C.finDeMes = function (periodo) { // 'YYYY-MM' -> 'YYYY-MM-DD'
    const [y, m] = periodo.split('-').map(Number);
    return `${periodo}-${C.pad(new Date(y, m, 0).getDate())}`;
  };
  C.mesAnterior = function (periodo) {
    let [y, m] = periodo.split('-').map(Number);
    m -= 1; if (m === 0) { m = 12; y -= 1; }
    return `${y}-${C.pad(m)}`;
  };
  // Inicio del ejercicio fiscal que contiene la fecha, según mes de cierre (1-12).
  C.inicioEjercicio = function (fecha, cierreMes) {
    cierreMes = +cierreMes || 12;
    const y = +fecha.slice(0, 4), m = +fecha.slice(5, 7);
    const mesIni = cierreMes === 12 ? 1 : cierreMes + 1;
    const yIni = m >= mesIni ? y : y - 1;
    return `${yIni}-${C.pad(mesIni)}-01`;
  };
  // Ejercicio que cierra en el año dado.
  C.rangoEjercicio = function (anio, cierreMes) {
    cierreMes = +cierreMes || 12;
    const hasta = C.finDeMes(`${anio}-${C.pad(cierreMes)}`);
    return { desde: C.inicioEjercicio(hasta, cierreMes), hasta };
  };

  /* ---------- RUC ---------- */
  // Dígito verificador módulo 11 (algoritmo de la SET/DNIT).
  C.dvRuc = function (ruc) {
    const s = String(ruc).toUpperCase().replace(/[^0-9A-Z]/g, '');
    if (!s) return null;
    let digits = '';
    for (const ch of s) digits += /\d/.test(ch) ? ch : String(ch.charCodeAt(0));
    let k = 2, total = 0;
    for (let i = digits.length - 1; i >= 0; i--) {
      if (k > 11) k = 2;
      total += (+digits[i]) * k++;
    }
    const r = total % 11;
    return r > 1 ? 11 - r : 0;
  };
  C.normalizarRuc = function (v) {
    const s = String(v || '').trim().replace(/\s/g, '');
    if (!s) return '';
    if (s.includes('-')) return s;
    if (/^\d+$/.test(s) && s.length >= 4) return s; // sin DV, se respeta
    return s;
  };
  C.rucValido = function (v) {
    const m = String(v || '').match(/^([0-9A-Za-z]+)-(\d)$/);
    if (!m) return null; // no se puede validar (sin DV)
    return C.dvRuc(m[1]) === +m[2];
  };

  /* ---------- Comprobantes ---------- */
  C.ivaIncluido = (total, tasa) => tasa === 10 ? Math.round(total / 11) : tasa === 5 ? Math.round(total / 21) : 0;
  C.esNC = doc => doc.tipoDoc === 'NOTA_CREDITO';
  C.signo = doc => C.esNC(doc) ? -1 : 1;
  // Montos de la factura: g10 y g5 son totales IVA incluido (como en el comprobante paraguayo).
  C.desglose = function (doc) {
    const g10 = C.r0(doc.g10), g5 = C.r0(doc.g5), exenta = C.r0(doc.exenta), exportacion = C.r0(doc.exportacion);
    const iva10 = doc.iva10 !== undefined && doc.iva10 !== '' && doc.iva10 !== null ? C.r0(doc.iva10) : C.ivaIncluido(g10, 10);
    const iva5 = doc.iva5 !== undefined && doc.iva5 !== '' && doc.iva5 !== null ? C.r0(doc.iva5) : C.ivaIncluido(g5, 5);
    return {
      g10, g5, exenta, exportacion, iva10, iva5,
      base10: g10 - iva10, base5: g5 - iva5,
      iva: iva10 + iva5, total: g10 + g5 + exenta + exportacion
    };
  };
  C.validarNumeroComprobante = n => /^\d{3}-\d{3}-\d{7}$/.test(String(n || ''));
  C.formatearNumeroComprobante = function (n) {
    const s = String(n || '').trim();
    const m = s.match(/^(\d{1,3})-(\d{1,3})-(\d{1,7})$/);
    if (m) return `${m[1].padStart(3, '0')}-${m[2].padStart(3, '0')}-${m[3].padStart(7, '0')}`;
    const d = s.replace(/\D/g, '');
    if (d.length === 13) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
    return s;
  };
  C.siguienteNumero = function (n) {
    const f = C.formatearNumeroComprobante(n);
    const m = f.match(/^(\d{3}-\d{3}-)(\d{7})$/);
    return m ? m[1] + String(+m[2] + 1).padStart(7, '0') : '';
  };

  /* ---------- Plan de cuentas ---------- */
  C.cmpCodigo = function (a, b) {
    const pa = String(a).split('.'), pb = String(b).split('.');
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      if (pa[i] === undefined) return -1;
      if (pb[i] === undefined) return 1;
      const na = +pa[i], nb = +pb[i];
      if (!isNaN(na) && !isNaN(nb) && na !== nb) return na - nb;
      if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1;
    }
    return 0;
  };
  C.tipoPorCodigo = function (codigo) {
    const d = String(codigo).trim()[0];
    return { 1: 'A', 2: 'P', 3: 'PN', 4: 'I' }[d] || 'E';
  };
  const RG49_FALLBACK = { A: 'AC_OTROS', P: 'PC_OTRAS', PN: 'PN_RESACUM', I: 'ER_OTROS', E: 'ER_ADM' };

  // Construye índice jerárquico: nivel, padre, ancestros, imputable, tipo y rubro heredado.
  C.prepararPlan = function (cuentas) {
    const list = (cuentas || []).filter(c => c && String(c.codigo || '').trim())
      .map(c => Object.assign({}, c, { codigo: String(c.codigo).trim() }));
    list.sort((a, b) => C.cmpCodigo(a.codigo, b.codigo));
    const by = {};
    list.forEach(c => { by[c.codigo] = c; c.hijos = []; });
    const conPuntos = list.some(c => c.codigo.includes('.'));
    list.forEach(c => {
      let p = null, code = c.codigo;
      while (!p) {
        if (conPuntos) { const i = code.lastIndexOf('.'); if (i < 0) break; code = code.slice(0, i); }
        else { if (code.length <= 1) break; code = code.slice(0, -1); }
        if (by[code]) p = by[code];
      }
      c.padre = p ? p.codigo : null;
      if (p) p.hijos.push(c.codigo);
    });
    const avisos = [];
    list.forEach(c => {
      c.ancestros = [];
      let p = c.padre;
      while (p) { c.ancestros.push(p); p = by[p].padre; }
      if (c.nivel) c.nivel = +c.nivel;
      else if (conPuntos) c.nivel = c.codigo.split('.').length;
      else c.nivel = c.ancestros.length + 1;
      if (c.imputable === undefined || c.imputable === null || c.imputable === '') c.imputable = c.hijos.length === 0;
      c.imputable = c.imputable === true || /^(s|si|sí|x|1|true)$/i.test(String(c.imputable));
      c.tipo = c.tipo && /^(A|P|PN|I|E)$/.test(c.tipo) ? c.tipo : C.tipoPorCodigo(c.codigo);
      let rubro = c.rg49 || '';
      for (let i = 0; !rubro && i < c.ancestros.length; i++) rubro = by[c.ancestros[i]].rg49 || '';
      if (!rubro && c.imputable) avisos.push(`Cuenta ${c.codigo} sin rubro RG49 (se asigna ${RG49_FALLBACK[c.tipo]})`);
      c.rubro = rubro || RG49_FALLBACK[c.tipo];
      c.noDeducible = !!c.noDeducible && c.noDeducible !== 'N';
      c.noGravado = !!c.noGravado && c.noGravado !== 'N';
    });
    return { list, by, avisos };
  };

  C.signoNatural = tipo => (tipo === 'A' || tipo === 'E') ? 1 : -1;

  /* ---------- Asientos ---------- */
  function linea(cuenta, debe, haber) { return { cuenta, debe: C.r0(debe), haber: C.r0(haber) }; }
  function compactar(lineas) {
    // Une líneas de la misma cuenta y lado; elimina importes cero; invierte negativos.
    const m = new Map();
    lineas.forEach(l => {
      let d = l.debe || 0, h = l.haber || 0;
      if (d < 0) { h -= d; d = 0; }
      if (h < 0) { d -= h; h = 0; }
      const neto = d - h;
      if (!neto) return;
      m.set(l.cuenta, (m.get(l.cuenta) || 0) + neto);
    });
    const out = [];
    m.forEach((neto, cuenta) => { if (neto) out.push(neto > 0 ? linea(cuenta, neto, 0) : linea(cuenta, 0, -neto)); });
    out.sort((a, b) => (b.debe - a.debe) || 0);
    return out;
  }

  C.asientoVenta = function (v, cfg) {
    const d = C.desglose(v), s = C.signo(v);
    const contra = v.condicion === 'CREDITO' ? cfg.ctaClientes : cfg.ctaCaja;
    const L = [
      linea(contra, s * d.total, 0),
      linea(v.cuenta || cfg.ctaVentas10, 0, s * d.base10),
      linea(v.cuenta || cfg.ctaVentas5, 0, s * d.base5),
      linea(v.cuenta || cfg.ctaVentasEx, 0, s * d.exenta),
      linea(cfg.ctaExportaciones, 0, s * d.exportacion),
      linea(cfg.ctaIvaDF10, 0, s * d.iva10),
      linea(cfg.ctaIvaDF5, 0, s * d.iva5)
    ];
    return {
      id: 'V' + v.id, fecha: v.fecha, origen: 'venta', ref: v.id,
      concepto: `${C.esNC(v) ? 'NC emitida' : 'Venta'} ${v.numero || ''} ${v.razon || ''}`.trim(),
      lineas: compactar(L)
    };
  };

  C.asientoCompra = function (c, cfg) {
    const d = C.desglose(c), s = C.signo(c);
    const contra = c.condicion === 'CREDITO' ? cfg.ctaProveedores : cfg.ctaCaja;
    const cta = c.cuenta || cfg.ctaCompras;
    const sinCredito = c.afectacion === 'EXENTA'; // IVA no computable: va al costo/gasto
    const L = [
      linea(cta, s * (d.base10 + d.base5 + d.exenta + d.exportacion + (sinCredito ? d.iva : 0)), 0),
      linea(cfg.ctaIvaCF10, sinCredito ? 0 : s * d.iva10, 0),
      linea(cfg.ctaIvaCF5, sinCredito ? 0 : s * d.iva5, 0),
      linea(contra, 0, s * d.total)
    ];
    return {
      id: 'C' + c.id, fecha: c.fecha, origen: 'compra', ref: c.id,
      concepto: `${C.esNC(c) ? 'NC recibida' : c.tipoDoc === 'DESPACHO' ? 'Importación' : 'Compra'} ${c.numero || ''} ${c.razon || ''}`.trim(),
      lineas: compactar(L)
    };
  };

  C.periodosConDatos = function (data) {
    const s = new Set();
    (data.ventas || []).forEach(v => v.fecha && s.add(v.fecha.slice(0, 7)));
    (data.compras || []).forEach(v => v.fecha && s.add(v.fecha.slice(0, 7)));
    Object.keys(data.f120 || {}).forEach(p => s.add(p));
    return [...s].sort();
  };

  // Ajuste mensual por prorrateo de IVA (crédito fiscal no computable de compras mixtas).
  C.asientosProrrateo = function (data, cfg) {
    const out = [];
    C.periodosConDatos(data).forEach(p => {
      const f = C.f120(data, p, cfg);
      if (f.cfMixtoNoComputable10 || f.cfMixtoNoComputable5) {
        out.push({
          id: 'P' + p, fecha: C.finDeMes(p), origen: 'prorrateo', ref: p,
          concepto: `Ajuste prorrateo IVA ${p} (coef. ${(f.coeficiente * 100).toFixed(2)}%)`,
          lineas: compactar([
            linea(cfg.ctaIvaCosto, f.cfMixtoNoComputable10 + f.cfMixtoNoComputable5, 0),
            linea(cfg.ctaIvaCF10, 0, f.cfMixtoNoComputable10),
            linea(cfg.ctaIvaCF5, 0, f.cfMixtoNoComputable5)
          ])
        });
      }
    });
    return out;
  };

  C.config = data => Object.assign({}, PD.CONFIG_DEFAULT, data.config || {});

  C.todosLosAsientos = function (data) {
    const cfg = C.config(data);
    const a = [];
    (data.asientos || []).forEach(x => a.push(Object.assign({ origen: 'manual' }, x)));
    (data.ventas || []).forEach(v => a.push(C.asientoVenta(v, cfg)));
    (data.compras || []).forEach(c => a.push(C.asientoCompra(c, cfg)));
    C.asientosProrrateo(data, cfg).forEach(x => a.push(x));
    a.sort((x, y) => (x.fecha < y.fecha ? -1 : x.fecha > y.fecha ? 1 : 0));
    return a;
  };

  C.validarAsiento = function (a, plan) {
    const errores = [];
    let d = 0, h = 0;
    (a.lineas || []).forEach((l, i) => {
      d += C.num(l.debe); h += C.num(l.haber);
      const c = plan && plan.by[l.cuenta];
      if (plan && !c) errores.push(`Línea ${i + 1}: la cuenta ${l.cuenta} no existe`);
      else if (c && !c.imputable) errores.push(`Línea ${i + 1}: la cuenta ${l.cuenta} no es imputable`);
    });
    if (Math.round(d) !== Math.round(h)) errores.push(`El asiento no balancea: Debe ${d} ≠ Haber ${h}`);
    if (!a.fecha) errores.push('Falta la fecha');
    return errores;
  };

  /* ---------- Saldos y balances ---------- */
  // Saldos (debe - haber) por cuenta imputable para la fecha de corte.
  // Cuentas patrimoniales: acumuladas hasta 'hasta'. Cuentas de resultado: desde inicio del ejercicio.
  // Los resultados de ejercicios anteriores no refundidos se suman a la cuenta de resultados acumulados.
  C.saldosAl = function (data, plan, hasta, asientos) {
    const cfg = C.config(data);
    const desde = C.inicioEjercicio(hasta, data.cierreMes || (data.cliente && data.cliente.cierreMes) || 12);
    asientos = asientos || C.todosLosAsientos(data);
    const saldo = {}, mov = {};
    let resAnterior = 0, sinCuenta = 0;
    asientos.forEach(a => {
      if (!a.fecha || a.fecha > hasta || a.cierre) return;
      a.lineas.forEach(l => {
        const c = plan.by[l.cuenta];
        const n = C.num(l.debe) - C.num(l.haber);
        if (!c) { sinCuenta += n; return; }
        const esResultado = c.tipo === 'I' || c.tipo === 'E';
        if (esResultado && a.fecha < desde) { resAnterior += n; return; }
        saldo[c.codigo] = (saldo[c.codigo] || 0) + n;
        const m = mov[c.codigo] || (mov[c.codigo] = { debe: 0, haber: 0 });
        m.debe += C.num(l.debe); m.haber += C.num(l.haber);
      });
    });
    if (resAnterior) saldo[cfg.ctaResultadosAcum] = (saldo[cfg.ctaResultadosAcum] || 0) + resAnterior;
    return { saldo, mov, desde, hasta, resultadoAnterior: -resAnterior, sinCuenta };
  };

  C.totalesPorTipo = function (plan, saldo) {
    const t = { A: 0, P: 0, PN: 0, I: 0, E: 0 };
    Object.keys(saldo).forEach(k => { const c = plan.by[k]; if (c) t[c.tipo] += saldo[k] * C.signoNatural(c.tipo); });
    t.resultado = t.I - t.E;
    t.diferencia = Math.round(t.A - t.P - t.PN - t.resultado);
    return t;
  };

  // Saldos agregados hasta el nivel indicado (signo natural de cada cuenta).
  C.agregarPorNivel = function (plan, saldo, nivelMax) {
    const agg = {};
    Object.keys(saldo).forEach(k => {
      const c = plan.by[k]; if (!c) return;
      [k].concat(c.ancestros).forEach(code => {
        const a = plan.by[code];
        if (a.nivel <= nivelMax) agg[code] = (agg[code] || 0) + saldo[k];
      });
    });
    return agg;
  };

  // Balance comparativo por nivel en Gs. y USD para N fechas de corte.
  // cortes: [{hasta, tc}] ; tc = guaraníes por dólar al cierre (opcional).
  C.balanceComparativo = function (data, plan, cortes, nivelMax) {
    nivelMax = nivelMax || 4;
    const asientos = C.todosLosAsientos(data);
    const res = cortes.map(k => {
      const s = C.saldosAl(data, plan, k.hasta, asientos);
      return { corte: k, s, agg: C.agregarPorNivel(plan, s.saldo, nivelMax), tot: C.totalesPorTipo(plan, s.saldo) };
    });
    const filas = plan.list.filter(c => c.nivel <= nivelMax)
      .filter(c => res.some(r => Math.round(r.agg[c.codigo] || 0) !== 0))
      .map(c => ({
        codigo: c.codigo, nombre: c.nombre, nivel: c.nivel, tipo: c.tipo,
        gs: res.map(r => C.r0((r.agg[c.codigo] || 0) * C.signoNatural(c.tipo))),
        usd: res.map(r => r.corte.tc ? C.r2((r.agg[c.codigo] || 0) * C.signoNatural(c.tipo) / r.corte.tc) : null)
      }));
    return { filas, totales: res.map(r => r.tot), periodos: res.map(r => ({ desde: r.s.desde, hasta: r.s.hasta, tc: r.corte.tc, resultadoAnterior: r.s.resultadoAnterior })) };
  };

  // Montos por rubro RG49 (signo natural: activos/pasivos positivos; en ER ingresos + y egresos -).
  C.rubrosAl = function (data, plan, hasta, asientos) {
    const s = C.saldosAl(data, plan, hasta, asientos);
    const r = {};
    PD.RUBROS_RG49.forEach(x => { r[x.key] = 0; });
    Object.keys(s.saldo).forEach(k => {
      const c = plan.by[k]; if (!c) return;
      const grupo = (PD.RUBROS_RG49.find(x => x.key === c.rubro) || {}).grupo;
      const v = grupo === 'ER' ? -s.saldo[k] : s.saldo[k] * C.signoNatural(c.tipo);
      r[c.rubro] = (r[c.rubro] || 0) + v;
    });
    const t = C.totalesPorTipo(plan, s.saldo);
    r.PN_RESEJ = (r.PN_RESEJ || 0) + t.resultado;
    const sum = g => PD.RUBROS_RG49.filter(x => x.grupo === g).reduce((a, x) => a + r[x.key], 0);
    const er = {
      ventas: r.ER_VENTAS, costo: r.ER_COSTO,
      gastosVentas: r.ER_VTAS, gastosAdm: r.ER_ADM,
      ingFin: r.ER_FIN, gastosFin: r.ER_GFIN, otrosIng: r.ER_OTROS, otrosEg: r.ER_OTROSEG, ire: r.ER_IRE
    };
    er.utilidadBruta = er.ventas + er.costo;
    er.resultadoOperativo = er.utilidadBruta + er.gastosVentas + er.gastosAdm;
    er.resultadoFinanciero = er.ingFin + er.gastosFin;
    er.otrosNeto = er.otrosIng + er.otrosEg;
    er.antesImpuesto = er.resultadoOperativo + er.resultadoFinanciero + er.otrosNeto;
    er.neto = er.antesImpuesto + er.ire;
    const tot = { AC: sum('AC'), ANC: sum('ANC'), PC: sum('PC'), PNC: sum('PNC'), PN: sum('PN') };
    tot.A = tot.AC + tot.ANC; tot.P = tot.PC + tot.PNC; tot.PPN = tot.P + tot.PN;
    tot.diferencia = Math.round(tot.A - tot.PPN);
    return { rubros: r, er, tot, desde: s.desde, hasta, saldo: s.saldo, mov: s.mov };
  };

  // Estructura de presentación del Balance General RG 49 (comparativo).
  C.estructuraRG49 = function () {
    const R = k => ({ tipo: 'rubro', key: k, nombre: PD.RUBROS_RG49.find(x => x.key === k).nombre });
    const rub = g => PD.RUBROS_RG49.filter(x => x.grupo === g).map(x => R(x.key));
    return [
      { tipo: 'titulo', nombre: 'ACTIVO' },
      { tipo: 'subtitulo', nombre: 'ACTIVO CORRIENTE' }, ...rub('AC'), { tipo: 'total', nombre: 'Total activo corriente', val: t => t.tot.AC },
      { tipo: 'subtitulo', nombre: 'ACTIVO NO CORRIENTE' }, ...rub('ANC'), { tipo: 'total', nombre: 'Total activo no corriente', val: t => t.tot.ANC },
      { tipo: 'gran', nombre: 'TOTAL ACTIVO', val: t => t.tot.A },
      { tipo: 'titulo', nombre: 'PASIVO' },
      { tipo: 'subtitulo', nombre: 'PASIVO CORRIENTE' }, ...rub('PC'), { tipo: 'total', nombre: 'Total pasivo corriente', val: t => t.tot.PC },
      { tipo: 'subtitulo', nombre: 'PASIVO NO CORRIENTE' }, ...rub('PNC'), { tipo: 'total', nombre: 'Total pasivo no corriente', val: t => t.tot.PNC },
      { tipo: 'gran', nombre: 'TOTAL PASIVO', val: t => t.tot.P },
      { tipo: 'titulo', nombre: 'PATRIMONIO NETO' }, ...rub('PN'),
      { tipo: 'gran', nombre: 'TOTAL PATRIMONIO NETO', val: t => t.tot.PN },
      { tipo: 'gran', nombre: 'TOTAL PASIVO Y PATRIMONIO NETO', val: t => t.tot.PPN }
    ];
  };
  C.estructuraER = function () {
    return [
      ['Ventas netas', t => t.er.ventas], ['Costo de ventas', t => t.er.costo],
      ['UTILIDAD BRUTA', t => t.er.utilidadBruta, 1],
      ['Gastos de ventas', t => t.er.gastosVentas], ['Gastos de administración', t => t.er.gastosAdm],
      ['RESULTADO OPERATIVO', t => t.er.resultadoOperativo, 1],
      ['Ingresos financieros', t => t.er.ingFin], ['Gastos financieros', t => t.er.gastosFin],
      ['Otros ingresos', t => t.er.otrosIng], ['Otros egresos', t => t.er.otrosEg],
      ['RESULTADO ANTES DEL IMPUESTO A LA RENTA', t => t.er.antesImpuesto, 1],
      ['Impuesto a la renta (IRE)', t => t.er.ire],
      ['RESULTADO NETO DEL EJERCICIO', t => t.er.neto, 1]
    ].map(([nombre, val, total]) => ({ nombre, val, total: !!total }));
  };

  /* ---------- Formulario 120 (IVA General, mensual) ---------- */
  C.f120 = function (data, periodo, cfg, _memo) {
    cfg = cfg || C.config(data);
    const memo = _memo || {};
    if (memo[periodo]) return memo[periodo];
    const ent = (data.f120 && data.f120[periodo]) || {};
    const enMes = x => x.fecha && x.fecha.slice(0, 7) === periodo;
    const z = () => ({ base10: 0, iva10: 0, base5: 0, iva5: 0, exenta: 0, exportacion: 0, total: 0 });
    const add = (acc, d, s) => { ['base10', 'iva10', 'base5', 'iva5', 'exenta', 'exportacion', 'total'].forEach(k => { acc[k] += s * d[k]; }); };

    const V = { fac: z(), nc: z() };
    (data.ventas || []).filter(enMes).forEach(v => add(C.esNC(v) ? V.nc : V.fac, C.desglose(v), 1));
    const Cm = { loc: z(), imp: z(), nc: z(), afGrav: z(), afEx: z(), afMix: z() };
    (data.compras || []).filter(enMes).forEach(c => {
      const d = C.desglose(c), s = C.signo(c);
      add(C.esNC(c) ? Cm.nc : c.tipoDoc === 'DESPACHO' ? Cm.imp : Cm.loc, d, 1);
      add(c.afectacion === 'EXENTA' ? Cm.afEx : c.afectacion === 'MIXTA' ? Cm.afMix : Cm.afGrav, d, s);
    });

    const baseGravNeta = V.fac.base10 + V.fac.base5 - V.nc.base10 - V.nc.base5;
    const exportNeta = V.fac.exportacion - V.nc.exportacion;
    const exentaNeta = V.fac.exenta - V.nc.exenta;
    const debito10 = V.fac.iva10 - V.nc.iva10, debito5 = V.fac.iva5 - V.nc.iva5;
    const debito = debito10 + debito5;

    const totalOps = baseGravNeta + exportNeta + exentaNeta;
    let coeficiente = ent.coeficiente !== undefined && ent.coeficiente !== '' && ent.coeficiente !== null
      ? C.num(ent.coeficiente) / 100
      : (totalOps > 0 ? (baseGravNeta + exportNeta) / totalOps : 1);
    coeficiente = Math.max(0, Math.min(1, coeficiente));

    const cfDirecto = Cm.afGrav.iva10 + Cm.afGrav.iva5;
    const cfExentas = Cm.afEx.iva10 + Cm.afEx.iva5;
    const cfMixto = Cm.afMix.iva10 + Cm.afMix.iva5;
    const cfMixtoComputable10 = Math.round(Cm.afMix.iva10 * coeficiente);
    const cfMixtoComputable5 = Math.round(Cm.afMix.iva5 * coeficiente);
    const cfMixtoComputable = cfMixtoComputable10 + cfMixtoComputable5;
    const cfComputable = cfDirecto + cfMixtoComputable;
    const cfTotal = cfDirecto + cfExentas + cfMixto;

    // Saldo a favor del período anterior: encadenado automáticamente salvo que se cargue a mano.
    let saldoAnterior;
    if (ent.saldoAnterior !== undefined && ent.saldoAnterior !== '' && ent.saldoAnterior !== null) saldoAnterior = C.r0(ent.saldoAnterior);
    else {
      const ps = C.periodosConDatos(data);
      const prev = C.mesAnterior(periodo);
      saldoAnterior = ps.length && prev >= ps[0] ? C.f120(data, prev, cfg, memo).saldoFavorSiguiente : 0;
    }
    const retenciones = C.r0(ent.retenciones), percepciones = C.r0(ent.percepciones), otrosCreditos = C.r0(ent.otrosCreditos);
    const resultado = debito - cfComputable - saldoAnterior - retenciones - percepciones - otrosCreditos;

    const r = {
      periodo, V, Cm, debito10, debito5, debito,
      baseGravNeta, exportNeta, exentaNeta, coeficiente,
      cfDirecto, cfExentas, cfMixto, cfMixtoComputable, cfComputable, cfTotal,
      cfMixtoNoComputable10: Cm.afMix.iva10 - cfMixtoComputable10,
      cfMixtoNoComputable5: Cm.afMix.iva5 - cfMixtoComputable5,
      saldoAnterior, retenciones, percepciones, otrosCreditos,
      impuestoAIngresar: resultado > 0 ? resultado : 0,
      saldoFavorSiguiente: resultado < 0 ? -resultado : 0,
      ventasTotales: baseGravNeta + exportNeta + exentaNeta
    };
    r.lineas = C.lineasF120(r);
    memo[periodo] = r;
    return r;
  };

  C.lineasF120 = function (r) {
    const V = r.V, Cm = r.Cm;
    const L = (rubro, concepto, base, impuesto, opts) => Object.assign({ rubro, concepto, base, impuesto }, opts || {});
    return [
      L(1, 'Ventas gravadas a la tasa del 10%', V.fac.base10, V.fac.iva10),
      L(1, 'Ventas gravadas a la tasa del 5%', V.fac.base5, V.fac.iva5),
      L(1, 'Exportaciones', V.fac.exportacion, 0),
      L(1, 'Ventas exentas', V.fac.exenta, null),
      L(1, '(−) Notas de crédito emitidas – gravadas 10%', -V.nc.base10, -V.nc.iva10),
      L(1, '(−) Notas de crédito emitidas – gravadas 5%', -V.nc.base5, -V.nc.iva5),
      L(1, '(−) Notas de crédito emitidas – exentas/exportación', -(V.nc.exenta + V.nc.exportacion), null),
      L(1, 'TOTAL OPERACIONES / DÉBITO FISCAL DEL MES', r.ventasTotales, r.debito, { total: true }),
      L(2, 'Compras locales gravadas al 10%', Cm.loc.base10, Cm.loc.iva10),
      L(2, 'Compras locales gravadas al 5%', Cm.loc.base5, Cm.loc.iva5),
      L(2, 'Importaciones gravadas al 10%', Cm.imp.base10, Cm.imp.iva10),
      L(2, 'Importaciones gravadas al 5%', Cm.imp.base5, Cm.imp.iva5),
      L(2, 'Compras exentas / no gravadas', Cm.loc.exenta + Cm.imp.exenta, null),
      L(2, '(−) Notas de crédito recibidas', -(Cm.nc.base10 + Cm.nc.base5 + Cm.nc.exenta), -(Cm.nc.iva10 + Cm.nc.iva5)),
      L(2, 'TOTAL COMPRAS / CRÉDITO FISCAL DEL MES', null, r.cfTotal, { total: true }),
      L(2, 'Crédito fiscal afectado exclusivamente a operaciones gravadas y exportaciones', null, r.cfDirecto),
      L(2, 'Crédito fiscal afectado exclusivamente a operaciones exentas (no computable)', null, r.cfExentas),
      L(2, 'Crédito fiscal afectado indistintamente (sujeto a prorrateo)', null, r.cfMixto),
      L(2, `Coeficiente de prorrateo: ${(r.coeficiente * 100).toFixed(2)}%`, null, null, { info: true }),
      L(2, 'Crédito fiscal computable por prorrateo', null, r.cfMixtoComputable),
      L(2, 'TOTAL CRÉDITO FISCAL COMPUTABLE', null, r.cfComputable, { total: true }),
      L(3, 'Débito fiscal del mes', null, r.debito),
      L(3, '(−) Crédito fiscal computable', null, -r.cfComputable),
      L(3, '(−) Saldo a favor del contribuyente del período anterior', null, -r.saldoAnterior),
      L(3, '(−) Retenciones de IVA recibidas', null, -r.retenciones),
      L(3, '(−) Percepciones de IVA', null, -r.percepciones),
      L(3, '(−) Otros créditos (pagos previos, compensaciones)', null, -r.otrosCreditos),
      L(3, 'SALDO A FAVOR DEL CONTRIBUYENTE (para el período siguiente)', null, r.saldoFavorSiguiente, { total: true }),
      L(3, 'IMPUESTO A INGRESAR', null, r.impuestoAIngresar, { total: true })
    ];
  };

  /* ---------- Formulario 500 (IRE General, anual) ---------- */
  C.f500 = function (data, plan, anio) {
    const cfg = C.config(data);
    const cierreMes = data.cierreMes || (data.cliente && data.cliente.cierreMes) || 12;
    const { desde, hasta } = C.rangoEjercicio(anio, cierreMes);
    const ent = (data.f500 && data.f500[anio]) || {};
    const asientos = C.todosLosAsientos(data);
    const R = C.rubrosAl(data, plan, hasta, asientos);
    const s = R.saldo;

    let ingresos = 0, egresos = 0, noGravados = 0, noDeducibles = 0, ireContab = 0;
    Object.keys(s).forEach(k => {
      const c = plan.by[k]; if (!c) return;
      if (c.tipo === 'I') { ingresos += -s[k]; if (c.noGravado) noGravados += -s[k]; }
      if (c.tipo === 'E') {
        egresos += s[k];
        if (c.noDeducible) noDeducibles += s[k];
        if (c.rubro === 'ER_IRE') ireContab += s[k];
      }
    });
    const resultadoContable = ingresos - egresos;          // después de IRE contabilizado
    const resultadoAntesIRE = resultadoContable + ireContab;

    // Donaciones: deducibles hasta el límite % de la renta neta (se calcula sobre la renta antes de donaciones).
    const donaciones = ent.donaciones !== undefined && ent.donaciones !== '' ? C.r0(ent.donaciones) : C.r0(s[cfg.ctaDonaciones] || 0);
    const ajustesMas = C.r0(ent.ajustesMas), ajustesMenos = C.r0(ent.ajustesMenos);
    const difDepreciacion = C.r0(ent.difDepreciacion); // + si la depreciación contable supera a la fiscal

    // noDeducibles ya incluye el IRE contabilizado si la cuenta está marcada; evitamos duplicarlo.
    const ndSinIRE = noDeducibles - (plan.list.some(c => c.rubro === 'ER_IRE' && c.noDeducible) ? ireContab : 0);
    const rentaAntesDonaciones = resultadoAntesIRE + ndSinIRE - noGravados + ajustesMas - ajustesMenos + difDepreciacion + donaciones;
    const limiteDonaciones = Math.max(0, Math.round(rentaAntesDonaciones * cfg.limiteDonacionesPct / 100));
    const donacionesDeducibles = Math.min(donaciones, limiteDonaciones);
    const excesoDonaciones = donaciones - donacionesDeducibles;
    const rentaNeta = rentaAntesDonaciones - donacionesDeducibles;

    const quebrantoAnterior = C.r0(ent.quebrantoAnterior);
    const limiteQuebranto = rentaNeta > 0 ? Math.round(rentaNeta * cfg.limiteQuebrantoPct / 100) : 0;
    const quebrantoCompensado = Math.min(quebrantoAnterior, limiteQuebranto);
    const rentaNetaImponible = Math.max(0, rentaNeta - quebrantoCompensado);
    const quebrantoEjercicio = rentaNeta < 0 ? -rentaNeta : 0;
    const quebrantoRemanente = quebrantoAnterior - quebrantoCompensado + quebrantoEjercicio;

    const impuesto = Math.round(rentaNetaImponible * cfg.tasaIRE / 100);
    const debeEnPeriodo = cta => {
      let t = 0;
      asientos.forEach(a => { if (a.fecha >= desde && a.fecha <= hasta && !a.cierre) a.lineas.forEach(l => { if (l.cuenta === cta) t += C.num(l.debe); }); });
      return Math.round(t);
    };
    const anticipos = ent.anticipos !== undefined && ent.anticipos !== '' ? C.r0(ent.anticipos) : debeEnPeriodo(cfg.ctaAnticiposIRE);
    const retenciones = ent.retenciones !== undefined && ent.retenciones !== '' ? C.r0(ent.retenciones) : debeEnPeriodo(cfg.ctaRetencionesIRE);
    const saldoFavorAnterior = C.r0(ent.saldoFavorAnterior);
    const neto = impuesto - anticipos - retenciones - saldoFavorAnterior;

    const baseAnticipo = Math.max(0, impuesto - retenciones);
    const anticipo = Math.round(baseAnticipo * cfg.pctAnticipo / 100);

    // Conciliación IVA (F120 del ejercicio) vs ingresos contables
    let ventasF120 = 0, debitoF120 = 0, creditoF120 = 0;
    const memo = {};
    let p = desde.slice(0, 7);
    for (let i = 0; i < 12; i++) {
      const f = C.f120(data, p, cfg, memo);
      ventasF120 += f.ventasTotales; debitoF120 += f.debito; creditoF120 += f.cfComputable;
      let [y, m] = p.split('-').map(Number); m++; if (m > 12) { m = 1; y++; } p = `${y}-${C.pad(m)}`;
    }

    const T = R.tot, E = R.er;
    const div = (a, b) => b ? a / b : null;
    const inventarios = R.rubros.AC_INVENT;
    const indicadores = [
      ['Liquidez corriente (AC / PC)', div(T.AC, T.PC), 'x'],
      ['Prueba ácida ((AC − Inventarios) / PC)', div(T.AC - inventarios, T.PC), 'x'],
      ['Capital de trabajo (AC − PC)', T.AC - T.PC, 'gs'],
      ['Endeudamiento total (Pasivo / Activo)', div(T.P, T.A), '%'],
      ['Endeudamiento sobre patrimonio (Pasivo / PN)', div(T.P, T.PN), 'x'],
      ['Solvencia (Activo / Pasivo)', div(T.A, T.P), 'x'],
      ['Margen bruto (Utilidad bruta / Ventas)', div(E.utilidadBruta, E.ventas), '%'],
      ['Margen operativo (Resultado operativo / Ventas)', div(E.resultadoOperativo, E.ventas), '%'],
      ['Margen neto (Resultado neto / Ventas)', div(E.neto, E.ventas), '%'],
      ['Rentabilidad del patrimonio – ROE (Resultado neto / PN)', div(E.neto, T.PN), '%'],
      ['Rentabilidad del activo – ROA (Resultado neto / Activo)', div(E.neto, T.A), '%'],
      ['Rotación de activos (Ventas / Activo)', div(E.ventas, T.A), 'x'],
      ['Presión fiscal IRE (Impuesto / Ventas)', div(impuesto, E.ventas), '%'],
      ['Tasa efectiva IRE (Impuesto / Resultado antes IRE)', div(impuesto, resultadoAntesIRE), '%']
    ].map(([nombre, valor, fmt]) => ({ nombre, valor, fmt }));

    const lineas = [
      ['1', 'ESTADO DE SITUACIÓN PATRIMONIAL AL CIERRE', null, 'titulo'],
      ['1', 'Activo corriente', T.AC], ['1', 'Activo no corriente', T.ANC], ['1', 'TOTAL ACTIVO', T.A, 'total'],
      ['1', 'Pasivo corriente', T.PC], ['1', 'Pasivo no corriente', T.PNC], ['1', 'TOTAL PASIVO', T.P, 'total'],
      ['1', 'Patrimonio neto', T.PN, 'total'],
      ['2', 'ESTADO DE RESULTADOS DEL EJERCICIO', null, 'titulo'],
      ['2', 'Ventas netas de bienes y servicios', E.ventas], ['2', 'Costo de ventas', -E.costo],
      ['2', 'Utilidad bruta', E.utilidadBruta, 'total'],
      ['2', 'Gastos de ventas', -E.gastosVentas], ['2', 'Gastos de administración', -E.gastosAdm],
      ['2', 'Ingresos financieros', E.ingFin], ['2', 'Gastos financieros', -E.gastosFin],
      ['2', 'Otros ingresos', E.otrosIng], ['2', 'Otros egresos', -E.otrosEg],
      ['2', 'Total ingresos del ejercicio', ingresos], ['2', 'Total costos y gastos (incluye IRE contabilizado)', egresos],
      ['2', 'RESULTADO CONTABLE ANTES DEL IRE', resultadoAntesIRE, 'total'],
      ['3', 'DETERMINACIÓN DE LA RENTA NETA', null, 'titulo'],
      ['3', 'Resultado contable antes del IRE', resultadoAntesIRE],
      ['3', '(+) Gastos no deducibles (cuentas marcadas ND, sin IRE)', ndSinIRE],
      ['3', '(+) Diferencia depreciación contable vs. fiscal', difDepreciacion],
      ['3', '(+) Otros ajustes positivos', ajustesMas],
      ['3', '(−) Ingresos no gravados / exentos (cuentas marcadas NG)', -noGravados],
      ['3', '(−) Otros ajustes negativos', -ajustesMenos],
      ['3', `(+) Donaciones contabilizadas`, donaciones],
      ['3', `(−) Donaciones deducibles (límite ${cfg.limiteDonacionesPct}% de la renta neta: ${fmtGs(limiteDonaciones)})`, -donacionesDeducibles],
      ['3', 'RENTA NETA DEL EJERCICIO (o quebranto)', rentaNeta, 'total'],
      ['3', 'Quebranto fiscal de ejercicios anteriores disponible', quebrantoAnterior],
      ['3', `(−) Quebranto compensado (límite ${cfg.limiteQuebrantoPct}% de la renta neta)`, -quebrantoCompensado],
      ['3', 'RENTA NETA IMPONIBLE', rentaNetaImponible, 'total'],
      ['4', 'LIQUIDACIÓN DEL IMPUESTO', null, 'titulo'],
      ['4', `Impuesto liquidado (${cfg.tasaIRE}% s/ renta neta imponible)`, impuesto, 'total'],
      ['4', '(−) Anticipos ingresados', -anticipos],
      ['4', '(−) Retenciones de IRE sufridas', -retenciones],
      ['4', '(−) Saldo a favor del ejercicio anterior', -saldoFavorAnterior],
      ['4', 'SALDO A INGRESAR', neto > 0 ? neto : 0, 'total'],
      ['4', 'SALDO A FAVOR DEL CONTRIBUYENTE', neto < 0 ? -neto : 0, 'total'],
      ['5', 'INFORMACIÓN COMPLEMENTARIA', null, 'titulo'],
      ['5', 'Quebranto fiscal del ejercicio', quebrantoEjercicio],
      ['5', 'Quebranto acumulado a trasladar a ejercicios siguientes', quebrantoRemanente],
      ['5', `Anticipo para el ejercicio siguiente (${cfg.cantAnticipos} cuotas de ${cfg.pctAnticipo}%)`, anticipo],
      ['5', 'Exceso de donaciones no deducible', excesoDonaciones],
      ['5', 'Ingresos declarados en Form. 120 del ejercicio (ventas netas sin IVA)', ventasF120],
      ['5', 'Ventas netas contables', E.ventas],
      ['5', 'Diferencia ventas F120 vs. contabilidad (debe explicarse)', ventasF120 - E.ventas, 'alerta'],
      ['5', 'Débito fiscal IVA del ejercicio (Σ F120)', debitoF120],
      ['5', 'Crédito fiscal IVA computable del ejercicio (Σ F120)', creditoF120]
    ].map(([rubro, concepto, monto, estilo]) => ({ rubro, concepto, monto: monto === null ? null : Math.round(monto), estilo: estilo || '' }));

    const controles = [];
    if (R.tot.diferencia) controles.push(`El balance no cuadra: diferencia de ${fmtGs(R.tot.diferencia)} entre Activo y Pasivo + PN.`);
    if (Math.abs(ventasF120 - E.ventas) > 1) controles.push('Las ventas del Form. 120 no coinciden con las ventas contables del ejercicio. Revise ventas registradas por asiento manual o cuentas de ventas mal imputadas.');
    if (quebrantoAnterior && rentaNeta > 0 && quebrantoCompensado < quebrantoAnterior) controles.push('Quebranto anterior compensado parcialmente por el límite legal; verifique la antigüedad (máx. 5 ejercicios).');
    if (!E.ventas) controles.push('No hay ventas registradas en el ejercicio.');

    return {
      anio, desde, hasta, cfg, R, lineas, indicadores, controles,
      ingresos, egresos, noGravados, noDeducibles: ndSinIRE, resultadoAntesIRE, rentaNeta, rentaNetaImponible,
      quebrantoCompensado, quebrantoEjercicio, quebrantoRemanente, impuesto, anticipos, retenciones, neto, anticipo,
      donaciones, donacionesDeducibles, ventasF120
    };
  };

  function fmtGs(n) { return 'Gs. ' + Math.round(n).toLocaleString('es-PY'); }
  C.fmtGs = fmtGs;

  root.Conta = C;
  if (typeof module !== 'undefined') module.exports = C;
})(typeof window !== 'undefined' ? window : globalThis);
