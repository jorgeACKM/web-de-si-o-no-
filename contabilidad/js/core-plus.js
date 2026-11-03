/* Controles antes de presentar, cruce con lo informado por terceros, Tesaka, anticipos de IRE,
 * auditoría impositiva, partes relacionadas, beneficiarios finales, obligaciones laborales
 * (IPS, Ministerio de Trabajo, aguinaldo, recibos), feriados y el informe mensual para el cliente. */
(function (root) {
  'use strict';
  const C = root.Conta || (typeof require !== 'undefined' ? require('./core.js') : null);
  const num = v => C.num(v);
  const enMes = p => x => x.fecha && x.fecha.slice(0, 7) === p;
  const enAnio = a => x => x.fecha && x.fecha.slice(0, 4) === String(a);
  const rucBase = r => String(r || '').split('-')[0].replace(/\D/g, '');
  const numKey = n => { const p = String(n || '').trim().split('-'); const dg = x => x.replace(/\D/g, '');
    return p.length === 3 ? p.map((x, i) => dg(x).padStart(i < 2 ? 3 : 7, '0')).join('') : dg(String(n || '')).padStart(13, '0'); };

  /* ---------- Feriados (fijos + Jueves y Viernes Santo) ---------- */
  C.pascua = function (y) {
    const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
    const mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
    return `${y}-${C.pad(mes)}-${C.pad(dia)}`;
  };
  C.feriados = function (anio, extra) {
    const p = C.pascua(anio);
    const lista = (C.FERIADOS_FIJOS || []).map(f => `${anio}-${f}`).concat([C.addDias(p, -3), C.addDias(p, -2)]);
    (extra || []).filter(f => String(f).slice(0, 4) === String(anio)).forEach(f => lista.push(f));
    return Array.from(new Set(lista)).sort();
  };
  C.NOMBRE_FERIADO = { '01-01': 'Año Nuevo', '03-01': 'Día de los Héroes', '05-01': 'Día del Trabajador', '05-14': 'Independencia', '05-15': 'Independencia', '06-12': 'Paz del Chaco', '08-15': 'Fundación de Asunción', '09-29': 'Victoria de Boquerón', '12-08': 'Virgen de Caacupé', '12-25': 'Navidad' };
  if (C.diaHabil) {
    C.diaHabil = function (fecha, feriadosExtra) {
      let f = fecha;
      for (let i = 0; i < 15; i++) {
        const dw = new Date(f + 'T00:00:00Z').getUTCDay();
        if (dw !== 0 && dw !== 6 && !C.feriados(+f.slice(0, 4), feriadosExtra).includes(f)) return f;
        f = C.addDias(f, 1);
      }
      return f;
    };
  }
  C.vtoPorRuc = (ruc, y, m, feriados) => {
    while (m > 12) { m -= 12; y++; }
    const dig = +(rucBase(ruc).slice(-1) || 0);
    return C.diaHabil(`${y}-${C.pad(m)}-${C.pad(C.DIA_VTO[dig])}`, feriados);
  };

  /* ---------- Número en letras (recibos) ---------- */
  const U = ['', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve', 'veinte', 'veintiuno', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco', 'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve'];
  const D = ['', '', '', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
  const CEN = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos', 'ochocientos', 'novecientos'];
  function menorMil(n) {
    if (n === 100) return 'cien';
    const c = Math.floor(n / 100), r = n % 100;
    const dec = r < 30 ? U[r] : D[Math.floor(r / 10)] + (r % 10 ? ' y ' + U[r % 10] : '');
    return [CEN[c], dec].filter(Boolean).join(' ');
  }
  C.numeroEnLetras = function (n) {
    n = Math.round(Math.abs(num(n)));
    if (!n) return 'cero';
    const partes = [];
    const mm = Math.floor(n / 1e6), miles = Math.floor((n % 1e6) / 1000), resto = n % 1000;
    if (mm) partes.push(mm === 1 ? 'un millón' : C.numeroEnLetras(mm).replace(/veintiuno$/, 'veintiún').replace(/uno$/, 'un') + ' millones');
    if (miles) partes.push(miles === 1 ? 'mil' : menorMil(miles).replace(/veintiuno$/, 'veintiún').replace(/uno$/, 'un') + ' mil');
    if (resto) partes.push(menorMil(resto));
    return partes.join(' ');
  };

  /* ---------- Cuadre del mes: libro IVA, Form. 120, contabilidad y RG 90 ---------- */
  function movCuentas(data, cuentas, desde, hasta, signo) {
    let t = 0;
    C.todosLosAsientos(data).forEach(a => {
      if (!a.fecha || a.fecha < desde || a.fecha > hasta || a.origen === 'liquidación IVA' || a.cierre) return;
      (a.lineas || []).forEach(l => { if (cuentas.includes(String(l.cuenta).trim())) t += signo * (num(l.debe) - num(l.haber)); });
    });
    return Math.round(t);
  }
  C.cuadreMes = function (data, periodo) {
    const cfg = C.config(data), desde = periodo + '-01', hasta = C.finDeMes(periodo);
    const ventas = (data.ventas || []).filter(enMes(periodo)), compras = (data.compras || []).filter(enMes(periodo));
    const ivaDoc = x => { const q = C.desglose(x); return C.signo(x) * (q.iva10 + q.iva5); };
    const libroDF = ventas.filter(x => C.imputa(x, cfg).iva).reduce((s, x) => s + ivaDoc(x), 0);
    const libroCF = compras.filter(x => C.imputa(x, cfg).iva && x.afectacion !== 'EXENTA').reduce((s, x) => s + ivaDoc(x), 0);
    const f = C.f120(data, periodo);
    const f120DF = f.k.c21 + f.k.c24, f120CF = f.k.c43;
    const contDF = movCuentas(data, [cfg.ctaIvaDF10, cfg.ctaIvaDF5], desde, hasta, -1);
    const contCF = movCuentas(data, [cfg.ctaIvaCF10, cfg.ctaIvaCF5], desde, hasta, 1);
    const rg = C.rg90(data, periodo);
    const filas = [
      { concepto: 'IVA débito fiscal', libro: Math.round(libroDF), f120: f120DF, contable: contDF },
      { concepto: 'IVA crédito fiscal', libro: Math.round(libroCF), f120: f120CF, contable: contCF }
    ];
    filas.forEach(x => { x.difF120 = x.f120 - x.libro; x.difCont = x.contable - x.libro; });
    // comprobantes que explican las diferencias
    const causas = [];
    compras.filter(x => x.afectacion === 'MIXTA' && C.imputa(x, cfg).iva).forEach(x => causas.push(`Compra ${x.numero || ''} ${x.razon || ''}: afectación mixta (prorrateo en el 120).`));
    ventas.concat(compras).filter(x => !C.imputa(x, cfg).iva && C.desglose(x).iva).forEach(x => causas.push(`${(data.ventas || []).includes(x) ? 'Venta' : 'Compra'} ${x.numero || ''} ${x.razon || ''}: no imputa al IVA.`));
    ventas.concat(compras).filter(x => C.esME && C.esME(x) && !C.tcDelMes(data, periodo)).slice(0, 1).forEach(() => causas.push('Hay comprobantes en US$ sin tipo de cambio del mes.'));
    return {
      filas, causas, f,
      rg90: { lineas: rg.lineas.length, errores: rg.errores, excluidos: rg.excluidos.length, total: rg.lineas.reduce((s, l) => s + num(l.campos[11]), 0) },
      ok: filas.every(x => !x.difF120 && !x.difCont) && !rg.errores.length
    };
  };

  /* ---------- Timbrados ---------- */
  C.claveTimbrado = (ruc, t) => `${rucBase(ruc)}|${String(t || '').trim()}`;
  C.timbradosUsados = function (data) {
    const out = {};
    (data.compras || []).forEach(x => {
      if (x.electronico || !x.timbrado || x.tipoDoc === 'DESPACHO') return;
      const k = C.claveTimbrado(x.ruc, x.timbrado);
      const o = out[k] || (out[k] = { ruc: x.ruc, razon: x.razon, timbrado: String(x.timbrado).trim(), desde: x.fecha, hasta: x.fecha, cantidad: 0 });
      o.cantidad++; if (x.fecha < o.desde) o.desde = x.fecha; if (x.fecha > o.hasta) o.hasta = x.fecha;
    });
    return Object.keys(out).sort().map(k => Object.assign({ clave: k }, out[k], (data.timbrados || {})[k] || {}));
  };
  C.controlTimbrados = function (data, periodo) {
    const reg = data.timbrados || {}, out = [];
    (data.compras || []).filter(x => !periodo || enMes(periodo)(x)).forEach(x => {
      if (x.electronico || x.tipoDoc === 'DESPACHO') return;
      const ref = `Compra ${x.numero || '(s/n)'} de ${x.razon || x.ruc || ''} (${x.fecha})`;
      if (!/^\d{8}$/.test(String(x.timbrado || ''))) { out.push({ doc: x, motivo: `${ref}: timbrado inválido` }); return; }
      if (!C.validarNumeroComprobante(x.numero)) out.push({ doc: x, motivo: `${ref}: número mal formado` });
      const t = reg[C.claveTimbrado(x.ruc, x.timbrado)];
      if (t && t.vence && x.fecha > t.vence) out.push({ doc: x, motivo: `${ref}: timbrado vencido el ${t.vence}` });
      if (t && t.inicio && x.fecha < t.inicio) out.push({ doc: x, motivo: `${ref}: fecha anterior al inicio del timbrado (${t.inicio})` });
    });
    return out;
  };

  /* ---------- Cruce con comprobantes informados por terceros ---------- */
  // propios: compras (o ventas) del sistema; informados: lo que los terceros registraron en Marangatu
  C.cruceTerceros = function (propios, informados) {
    const clave = x => `${rucBase(x.ruc)}|${numKey(x.numero)}`;
    const idx = {};
    propios.forEach(x => { (idx[clave(x)] || (idx[clave(x)] = [])).push(x); });
    const usados = new Set(), faltanEnSistema = [], diferencias = [], coinciden = [];
    informados.forEach(t => {
      const lista = idx[clave(t)] || [];
      const p = lista.find(x => !usados.has(x));
      if (!p) { faltanEnSistema.push(t); return; }
      usados.add(p);
      const tp = C.signo(p) * C.desglose(p).total, tt = C.signo(t) * C.desglose(t).total;
      if (Math.abs(tp - tt) > 1) diferencias.push({ propio: p, informado: t, diferencia: tp - tt }); else coinciden.push(p);
    });
    const faltanEnTerceros = propios.filter(x => !usados.has(x) && !x.electronico);
    return { faltanEnSistema, faltanEnTerceros, diferencias, coinciden };
  };

  /* ---------- Tesaka: retenciones emitidas ---------- */
  C.tesaka = function (data, periodo) {
    const out = [], errores = [];
    (data.retenciones || []).filter(r => r.tipo === 'EMITIDA' && enMes(periodo)(r)).forEach(r => {
      const fac = (data.compras || []).find(c => numKey(c.numero) === numKey(r.docNumero) && (!r.ruc || rucBase(c.ruc) === rucBase(r.ruc)));
      if (!fac) { errores.push(`Retención ${r.numero || ''} a ${r.razon || r.ruc}: no se encontró la factura ${r.docNumero || ''} en Compras.`); return; }
      const q = C.desglose(fac), [ruc, dv] = String(fac.ruc || r.ruc || '').split('-');
      const iva = r.impuesto === 'IVA', renta = !iva;
      const pctIVA = iva && (q.iva10 + q.iva5) ? Math.round(num(r.monto) / (q.iva10 + q.iva5) * 100) : 0;
      const pctRenta = renta && q.total ? Math.round(num(r.monto) / (q.total - q.iva10 - q.iva5) * 10000) / 100 : 0;
      const detalle = [];
      if (q.g10) detalle.push({ cantidad: 1, tasaAplica: '10', precioUnitario: Math.round(q.g10), descripcion: fac.concepto || 'Según factura' });
      if (q.g5) detalle.push({ cantidad: 1, tasaAplica: '5', precioUnitario: Math.round(q.g5), descripcion: fac.concepto || 'Según factura' });
      if (q.exenta) detalle.push({ cantidad: 1, tasaAplica: '0', precioUnitario: Math.round(q.exenta), descripcion: fac.concepto || 'Según factura' });
      out.push({
        atributos: { fechaCreacion: r.fecha, fechaHoraCreacion: `${r.fecha} 00:00:00` },
        informado: { situacion: 'CONTRIBUYENTE', ruc: ruc || '', dv: dv || '', nombre: fac.razon || r.razon || '', domicilio: '', direccion: '', correoElectronico: '', pais: 'PY', telefono: '' },
        transaccion: { numeroComprobanteVenta: fac.numero, condicionCompra: fac.condicion === 'CREDITO' ? 'CREDITO' : 'CONTADO', cuotas: fac.condicion === 'CREDITO' ? 1 : 0, tipoComprobante: 1, fecha: fac.fecha, numeroTimbrado: String(fac.timbrado || '') },
        detalle,
        retencion: {
          fecha: r.fecha, moneda: 'PYG', tipoCambio: 0,
          retencionRenta: renta, conceptoRenta: renta ? 'RENTA_EMPRESARIAL_REGISTRADO.1' : '', rentaPorcentaje: pctRenta,
          retencionIva: iva, conceptoIva: iva ? 'IVA.1' : '', ivaPorcentaje5: iva && q.iva5 ? pctIVA : 0, ivaPorcentaje10: iva && q.iva10 ? pctIVA : 0,
          rentaCabezasBase: 0, rentaCabezasCantidad: 0, rentaToneladasBase: 0, rentaToneladasCantidad: 0
        }
      });
    });
    return { retenciones: out, errores };
  };

  /* ---------- Anticipos de IRE ---------- */
  C.anticiposIRE = function (data, plan, anio, ruc) {
    const cfg = C.config(data), cm = (data.cliente && data.cliente.cierreMes) || 12;
    let base = null; try { base = C.f500(data, plan, anio - 1); } catch (e) { base = null; }
    const cuota = base ? base.anticipo : 0;
    const meses = String(cfg.mesesAnticiposIRE || '').split(',').map(Number).filter(Boolean).slice(0, cfg.cantAnticipos || 4);
    const pagados = ((data.anticiposPagados || {})[anio]) || {};
    const cuotas = meses.map((k, i) => ({ n: i + 1, fecha: C.vtoPorRuc(ruc || (data.cliente && data.cliente.ruc), anio - 1, cm + k), monto: cuota, pagado: !!pagados[i + 1] }));
    return { ejercicio: anio, base: base ? base.impuesto : 0, cuota, cuotas, pendiente: cuotas.filter(c => !c.pagado).reduce((s, c) => s + c.monto, 0) };
  };

  /* ---------- Auditoría impositiva y partes relacionadas ---------- */
  C.ingresosBrutos = function (data, anio) {
    const cm = (data.cliente && data.cliente.cierreMes) || 12, r = C.rangoEjercicio(anio, cm);
    return Math.round((data.ventas || []).filter(x => x.fecha >= r.desde && x.fecha <= r.hasta).reduce((s, x) => { const q = C.desglose(x); return s + C.signo(x) * (q.total - q.iva10 - q.iva5); }, 0));
  };
  C.controlAuditoria = function (data, anio) {
    const cfg = C.config(data), umbral = num(cfg.umbralAuditoria) || 0, ingresos = C.ingresosBrutos(data, anio - 1);
    return { ingresosAnterior: ingresos, umbral, obligado: !!umbral && ingresos >= umbral };
  };
  C.partesRelacionadas = function (data, anio) {
    const ter = data.terceros || {}, filas = {};
    const sumar = (lista, k) => lista.filter(enAnio(anio)).forEach(x => {
      const t = ter[x.ruc]; if (!t || !t.relacionada) return;
      const o = filas[x.ruc] || (filas[x.ruc] = { ruc: x.ruc, razon: t.razon || x.razon || '', vinculo: t.vinculo || '', ventas: 0, compras: 0, cantidad: 0 });
      o[k] += C.signo(x) * C.desglose(x).total; o.cantidad++;
    });
    sumar(data.ventas || [], 'ventas'); sumar(data.compras || [], 'compras');
    return Object.values(filas).map(o => Object.assign(o, { ventas: Math.round(o.ventas), compras: Math.round(o.compras) })).sort((a, b) => (b.ventas + b.compras) - (a.ventas + a.compras));
  };
  C.tercerosDelAnio = function (data, anio) {
    const out = {};
    const sumar = (lista, k) => lista.filter(enAnio(anio)).forEach(x => { if (!x.ruc) return; const o = out[x.ruc] || (out[x.ruc] = { ruc: x.ruc, razon: x.razon || '', ventas: 0, compras: 0 }); o[k] += C.signo(x) * C.desglose(x).total; });
    sumar(data.ventas || [], 'ventas'); sumar(data.compras || [], 'compras');
    return Object.values(out).sort((a, b) => (b.ventas + b.compras) - (a.ventas + a.compras));
  };

  /* ---------- Beneficiarios finales ---------- */
  C.estadoBeneficiarios = function (data, hoy) {
    const cfg = C.config(data), vto = cfg.vtoBeneficiarios || '';
    const lista = data.beneficiarios || [];
    const pct = lista.reduce((s, b) => s + num(b.pct), 0);
    const dias = vto ? Math.round((new Date(vto + 'T00:00:00Z') - new Date(hoy + 'T00:00:00Z')) / 864e5) : null;
    return { lista, pct, vto, dias, alerta: vto ? (dias < 0 ? 'vencido' : dias <= 30 ? 'proximo' : '') : (lista.length ? '' : 'sin datos') };
  };

  /* ---------- Laboral: IPS, Ministerio de Trabajo, aguinaldo, recibos ---------- */
  const empDe = (data, l) => (data.empleados || []).find(e => e.id === l.empId || (e.ci && e.ci === l.ci)) || {};
  C.planillaIPS = function (data, periodo) {
    const cfg = C.config(data), pl = C.calcularPlanilla(data, periodo);
    if (!pl) return null;
    const filas = pl.filas.map(f => { const e = empDe(data, f); return {
      nroPatronal: cfg.nroPatronalIPS || '', ci: f.ci || e.ci || '', asegurado: e.nroAsegurado || f.ci || '', nombre: f.nombre, dias: num(f.dias) || 30,
      salario: f.bruto, obrero: f.ipsObrero, patronal: f.ipsPatronal, total: f.ipsObrero + f.ipsPatronal, ingreso: e.ingreso || '', salida: e.salida || '' }; });
    return { periodo, filas, t: { salario: pl.t.bruto, obrero: pl.t.ipsObrero, patronal: pl.t.ipsPatronal, total: pl.t.ipsObrero + pl.t.ipsPatronal } };
  };
  const edad = (nac, al) => nac ? Math.floor((new Date(al) - new Date(nac)) / (365.25 * 864e5)) : null;
  C.planillasMTESS = function (data, anio) {
    const meses = new Array(12).fill(0).map((_, i) => `${anio}-${C.pad(i + 1)}`);
    const pls = meses.map(p => C.calcularPlanilla(data, p));
    const emps = (data.empleados || []).filter(e => (!e.ingreso || e.ingreso <= `${anio}-12-31`) && (!e.salida || e.salida >= `${anio}-01-01`));
    const finAnio = `${anio}-12-31`;
    const empleados = emps.map(e => ({ e, edad: edad(e.nacimiento, finAnio), menor: (edad(e.nacimiento, finAnio) || 99) < 18 }));
    const sueldos = emps.map(e => {
      const m = pls.map(pl => { if (!pl) return 0; const f = pl.filas.find(x => x.empId === e.id || (e.ci && x.ci === e.ci)); return f ? f.bruto : 0; });
      const agui = pls.reduce((s, pl) => { if (!pl) return s; const f = pl.filas.find(x => x.empId === e.id || (e.ci && x.ci === e.ci)); return s + (f ? f.aguinaldo : 0); }, 0);
      const horas = m.filter(Boolean).length * (num(e.horasMes) || 192);
      return { e, meses: m, aguinaldo: agui, horas, total: m.reduce((a, b) => a + b, 0) + agui };
    });
    const cuenta = f => emps.filter(f).length;
    const sx = s => e => String(e.sexo || '').toUpperCase().startsWith(s);
    const resumen = {
      varones: cuenta(sx('M')), mujeres: cuenta(sx('F')), menoresVarones: empleados.filter(x => x.menor && sx('M')(x.e)).length, menoresMujeres: empleados.filter(x => x.menor && sx('F')(x.e)).length,
      ingresos: cuenta(e => e.ingreso && e.ingreso.slice(0, 4) === String(anio)), salidas: cuenta(e => e.salida && e.salida.slice(0, 4) === String(anio)),
      horas: sueldos.reduce((s, x) => s + x.horas, 0), sueldos: sueldos.reduce((s, x) => s + x.total - x.aguinaldo, 0), aguinaldos: sueldos.reduce((s, x) => s + x.aguinaldo, 0)
    };
    resumen.total = resumen.varones + resumen.mujeres;
    return { anio, empleados, sueldos, resumen };
  };
  C.aguinaldo = function (data, anio) {
    const meses = new Array(12).fill(0).map((_, i) => `${anio}-${C.pad(i + 1)}`);
    return (data.empleados || []).filter(e => (!e.ingreso || e.ingreso <= `${anio}-12-31`) && (!e.salida || e.salida >= `${anio}-01-01`)).map(e => {
      let total = 0, conPlanilla = 0;
      meses.forEach(p => { const pl = C.calcularPlanilla(data, p); const f = pl && pl.filas.find(x => x.empId === e.id || (e.ci && x.ci === e.ci)); if (f) { total += f.bruto; conPlanilla++; } });
      if (!conPlanilla) { // sin planillas: salario por meses trabajados en el año
        const ini = e.ingreso && e.ingreso.slice(0, 4) === String(anio) ? +e.ingreso.slice(5, 7) : 1;
        const fin = e.salida && e.salida.slice(0, 4) === String(anio) ? +e.salida.slice(5, 7) : 12;
        total = num(e.salario) * Math.max(0, fin - ini + 1);
      }
      return { empId: e.id, nombre: e.nombre, ci: e.ci, remuneraciones: Math.round(total), aguinaldo: Math.round(total / 12), meses: conPlanilla };
    });
  };
  C.recibosSalario = function (data, periodo) {
    const cfg = C.config(data), pl = C.calcularPlanilla(data, periodo);
    if (!pl) return [];
    return pl.filas.map(f => {
      const e = empDe(data, f);
      const haberes = [['Salario', num(f.salario)]].concat(num(f.extras) ? [['Horas extra / otros', num(f.extras)]] : [], f.aguinaldo ? [['Aguinaldo', f.aguinaldo]] : []);
      const descuentos = [[`IPS ${cfg.pctIPSObrero}%`, f.ipsObrero]].concat(f.descuentos ? [['Otros descuentos', f.descuentos]] : []);
      return { periodo, nombre: f.nombre, ci: f.ci || e.ci || '', cargo: e.cargo || '', haberes, descuentos, neto: f.neto };
    });
  };

  /* ---------- Informe mensual para el cliente ---------- */
  C.informeMensual = function (data, plan, periodo) {
    const ventas = (data.ventas || []).filter(enMes(periodo)), compras = (data.compras || []).filter(enMes(periodo));
    const sum = (l, k) => Math.round(l.reduce((s, x) => s + C.signo(x) * C.desglose(x)[k], 0));
    const res = l => ({ g10: sum(l, 'g10'), g5: sum(l, 'g5'), exenta: sum(l, 'exenta'), iva: sum(l, 'iva10') + sum(l, 'iva5'), total: sum(l, 'total'), cantidad: l.length });
    const f = C.f120(data, periodo);
    const hasta = C.finDeMes(periodo), asientos = C.todosLosAsientos(data);
    let ingresos = 0, egresos = 0;
    asientos.forEach(a => { if (!a.fecha || a.fecha.slice(0, 7) !== periodo || a.cierre) return; (a.lineas || []).forEach(l => { const c = plan.by[String(l.cuenta).trim()]; if (!c) return; if (c.tipo === 'I') ingresos += num(l.haber) - num(l.debe); if (c.tipo === 'E') egresos += num(l.debe) - num(l.haber); }); });
    const S = C.saldosAl(data, plan, hasta, asientos);
    const saldo = S.saldo || S;
    const fondos = plan.list.filter(c => c.imputable && String(c.codigo).startsWith('1.1.1') && Math.round(saldo[c.codigo] || 0)).map(c => ({ codigo: c.codigo, nombre: c.nombre, saldo: Math.round(saldo[c.codigo]) }));
    const cfg = C.config(data);
    const ctaSaldo = k => Math.round(saldo[k] || 0);
    return {
      periodo, ventas: res(ventas), compras: res(compras),
      iva: { debito: f.k.c44, credito: f.k.c45, aPagar: f.k.c58, saldoFavor: f.k.c47 + f.k.c54 },
      resultado: { ingresos: Math.round(ingresos), egresos: Math.round(egresos), neto: Math.round(ingresos - egresos) },
      fondos, porCobrar: ctaSaldo(cfg.ctaClientes), porPagar: -ctaSaldo(cfg.ctaProveedores)
    };
  };

  /* ---------- Honorarios del estudio ---------- */
  C.estadoHonorarios = function (cli, hastaPeriodo) {
    const h = num(cli.honorario), desde = cli.honorariosDesde || '';
    let meses = 0;
    if (h && desde && desde <= hastaPeriodo) meses = (+hastaPeriodo.slice(0, 4) - +desde.slice(0, 4)) * 12 + (+hastaPeriodo.slice(5, 7) - +desde.slice(5, 7)) + 1;
    const devengado = h * meses, cobrado = (cli.cobrosHonorarios || []).reduce((s, c) => s + num(c.monto), 0);
    return { honorario: h, meses, devengado, cobrado, saldo: devengado - cobrado, mesesAdeudados: h ? Math.max(0, Math.floor((devengado - cobrado) / h)) : 0 };
  };

  if (typeof module !== 'undefined') module.exports = C;
})(typeof window !== 'undefined' ? window : globalThis);
