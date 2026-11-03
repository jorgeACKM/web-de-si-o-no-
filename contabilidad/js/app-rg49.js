/* Estados financieros RG 49 (Anexos 1 a 6) en el formato oficial: vista previa, notas editables y descarga en PDF o Excel. */
(function () {
  'use strict';
  const A = window.App, R = window.Reportes, E = window.RG49;
  const { C, S, $, $$, esc, fmt, fd, st, toast, datos, cliente, slug, render } = A;

  /* ---------- Identificación según el formato (bloques 1 a 5) ---------- */
  function identificacion(desde, hasta) {
    const c = cliente();
    return [['1- Contribuyente', `${c.razon || ''} – RUC ${c.ruc || ''}`], ['2- Ejercicio fiscal', `Desde ${fd(desde)} hasta ${fd(hasta)}`],
      ['3- Representante legal', c.representante || '—'], ['4- Contador', `${c.contador || '—'}${c.rucContador ? ' – RUC ' + c.rucContador : ''}`],
      ['5- Auditor', `${c.auditor || '—'}${c.rucAuditor ? ' – RUC ' + c.rucAuditor : ''}`]];
  }

  /* ---------- Construcción de los anexos ---------- */
  function filasEstructura(I, total1, total0, extras1, extras0, opts, raices, tc) {
    const filas = [];
    const fila = (cod, nombre, x1, x0, estilo, nivel) => filas.push({ v: [cod, nombre].concat(valores(x1, x0, opts.usd, tc)), estilo, nivel });
    const emitir = cod => {
      const x = I[cod], x1 = total1[cod] || 0, x0 = total0[cod] || 0;
      if (!opts.completo && !Math.round(x1) && !Math.round(x0)) return;
      const nivel = cod.split('.').length - 1;
      const estilo = nivel === 0 ? 'titulo' : nivel === 1 ? 'seccion' : (x.hijos.length ? 'subtotal' : '');
      fila(cod, x.nombre, x1, x0, estilo, nivel);
      x.hijos.forEach(emitir);
      // cuentas nuevas incluidas en el grupo
      const ex = {};
      (extras1[cod] || []).forEach(e => { (ex[e.codigo] || (ex[e.codigo] = { nombre: e.nombre, x1: 0, x0: 0 })).x1 += e.importe; });
      (extras0[cod] || []).forEach(e => { (ex[e.codigo] || (ex[e.codigo] = { nombre: e.nombre, x1: 0, x0: 0 })).x0 += e.importe; });
      Object.values(ex).forEach(e => fila(`${cod}.xx`, e.nombre, e.x1, e.x0, '', nivel + 1));
    };
    raices.forEach(emitir);
    return filas;
  }
  // [X1, (US$ X1), X1-1, (US$ X1-1)] – tc = { x1: T.C. al cierre de X1, x0: T.C. al cierre de X1-1 }
  const usdDe = (v, t) => t ? Math.round(v / t * 100) / 100 : null;
  function valores(x1, x0, usd, tc) { return usd ? [x1, usdDe(x1, tc.x1), x0, usdDe(x0, tc.x0)] : [x1, x0]; }
  function columnasComparativas(nombreCod, desde1, hasta1, hasta0, usd) {
    const cols = [{ t: nombreCod, w: 15, tipo: 'texto' }, { t: 'Cuenta', w: usd ? 44 : 56, tipo: 'texto' }, { t: fd(hasta1), w: 17, tipo: 'gs' }];
    if (usd) cols.push({ t: `US$ ${fd(hasta1)}`, w: 13, tipo: 'usd' });
    cols.push({ t: fd(hasta0), w: 17, tipo: 'gs' });
    if (usd) cols.push({ t: `US$ ${fd(hasta0)}`, w: 13, tipo: 'usd' });
    return cols;
  }
  A.documentoRG49 = function (opts) {
    const d = datos(), plan = A.plan, a = C.todosLosAsientos(d);
    const h1 = opts.corte2, h0 = opts.corte1, cm = cliente().cierreMes || 12;
    const desde1 = C.inicioEjercicio(h1, cm), anio = +h1.slice(0, 4);
    const tc = { x1: opts.tc2 || 0, x0: opts.tc1 || 0 };
    const ident = identificacion(desde1, h1);
    const b1 = C.rg49Balance(d, plan, h1, a), b0 = C.rg49Balance(d, plan, h0, a);
    const r1 = C.rg49Resultados(d, plan, h1, a), r0 = C.rg49Resultados(d, plan, h0, a);
    const usd = !!opts.usd;
    const firmas = { tipo: 'firmas' };
    const sub = `Expresado en guaraníes${usd ? ' y dólares estadounidenses' : ''}`;
    // Anexo 1
    const f1 = filasEstructura(C.RG49_BG, b1.total, b0.total, b1.extras, b0.extras, { completo: opts.completo, usd }, ['1', '2', '3'], tc);
    f1.push({ v: ['', 'TOTAL PASIVO Y PATRIMONIO NETO'].concat(valores(b1.pasivo + b1.pn, b0.pasivo + b0.pn, usd, tc)), estilo: 'gran' });
    // Anexo 2
    const f2 = [];
    const SUB = C.RG49_SUBTOTALES_ER;
    E.ER.forEach(([cod, nombre], i) => {
      if (cod.includes('.')) return;
      if (!cod) { // "MENOS:" / "MÁS"
        const sig = E.ER.slice(i + 1).find(x => x[0] && !x[0].includes('.'));
        if (sig && (opts.completo || Math.round(r1.total[sig[0]] || 0) || Math.round(r0.total[sig[0]] || 0))) f2.push({ v: ['', nombre].concat(usd ? ['', '', '', ''] : ['', '']), estilo: 'nota' });
        return;
      }
      if (SUB.includes(cod)) { f2.push({ v: [cod, nombre].concat(valores(r1.total[cod] || 0, r0.total[cod] || 0, usd, tc)), estilo: cod === '20' ? 'gran' : 'total' }); return; }
      filasEstructura(C.RG49_ER, r1.total, r0.total, r1.extras, r0.extras, { completo: opts.completo, usd }, [cod], tc).forEach(f => f2.push(f));
    });
    // Anexo 3
    const fl1 = C.rg49Flujo(d, plan, h1, a), fl0 = C.rg49Flujo(d, plan, h0, a);
    const f3 = C.RG49_FLUJO_FILAS.map(([t, k, est]) => ({ v: [t].concat(k ? [fl1[k], fl0[k]] : ['', '']), estilo: est === 'titulo' ? 'seccion' : est === 'total' ? 'total' : est === 'gran' ? 'gran' : '' }));
    // Anexo 4
    const pn = C.rg49PN(d, plan, h1, a);
    const f4 = pn.filas.map(([t, v, est]) => ({ v: [t].concat(v || ['', '', '', '', '', '', '']), estilo: est === 'titulo' ? 'seccion' : est === 'gran' ? 'gran' : est === 'total' ? 'total' : '' }));
    // Anexo 5
    const notasTxt = Object.assign(C.rg49NotasPorDefecto(d, anio), ((d.notasRG49 || {})[anio]) || {});
    const comp = C.rg49Composicion(d, plan, h0, h1);
    const bloques5 = [];
    E.NOTAS.forEach(([n, t]) => {
      bloques5.push({ tipo: 'texto', titulo: `NOTA ${n} – ${t}`, parrafos: String(notasTxt[n] || '').split('\n').filter(Boolean) });
      const tablaComp = (lista, titulo) => ({ tipo: 'tabla', titulo, columnas: [{ t: 'Código RG 49', w: 13 }, { t: 'Cuenta', w: 52 }, { t: fd(h1), w: 17, tipo: 'gs' }, { t: fd(h0), w: 17, tipo: 'gs' }], filas: lista.map(f => ({ v: [f.rg49 || '', `${f.codigo} ${f.nombre}`, f.x1, f.x0] })) });
      if (n === '4' && comp.patrimoniales.length) bloques5.push(tablaComp(comp.patrimoniales));
      if (n === '5' && comp.resultados.length) bloques5.push(tablaComp(comp.resultados));
      if (n === '6' && comp.fiscales.length) bloques5.push(tablaComp(comp.fiscales.map(f => Object.assign({}, f, { nombre: `${f.nombre} (${f.nd ? 'gasto no deducible' : 'renta no gravada'})` }))));
    });
    // Anexo 6
    const rv = C.rg49Revaluo(d, anio);
    const colsRev = E.REVALUO.map((t, i) => ({ t, w: i === 0 ? 22 : 9, tipo: i === 0 ? 'texto' : i === 1 ? 'texto' : i === 7 ? 'texto' : 'gs' }));
    const f6 = rv.filas.map(f => ({ v: [f.descripcion, fd(f.fecha), f.vida, f.restante, f.costo, f.fiscalAnt, f.contableAnt, String(f.coeficiente).replace('.', ','), f.fiscal, f.contable, f.cuotaDeducible, f.cuotaNoDeducible, f.depFiscal, f.depContable, f.netoFiscal, f.netoContable] }));
    const T = rv.totales;
    f6.push({ v: ['TOTALES', '', '', '', T.costo, T.fiscalAnt, T.contableAnt, '', T.fiscal, T.contable, T.cuotaDeducible, T.cuotaNoDeducible, T.depFiscal, T.depContable, T.netoFiscal, T.netoContable], estilo: 'total' });
    colsRev[2].tipo = 'texto'; colsRev[3].tipo = 'texto';
    const anexo = (n, titulo, bloques, orientacion) => ({ nombreHoja: `${n}_${titulo}`.slice(0, 31), titulo: `ANEXO ${n} – ${titulo.toUpperCase()}`, subtitulo: sub, identificacion: ident, bloques: bloques.concat([firmas]), orientacion });
    const avisos = [];
    if (b1.diferencia) avisos.push(`El balance al ${fd(h1)} no cuadra (diferencia ${fmt(b1.diferencia)}).`);
    if (fl1.diferencia) avisos.push(`El flujo de efectivo no concilia con la variación de disponibilidades (diferencia ${fmt(fl1.diferencia)}).`);
    return {
      avisos, b1, r1, fl1,
      doc: { cliente: cliente(), titulo: 'ESTADOS FINANCIEROS – RG 49/2014', hojas: [
        anexo(1, 'Balance General', [{ tipo: 'tabla', columnas: columnasComparativas('Código', desde1, h1, h0, usd), filas: f1 }]),
        anexo(2, 'Estado de Resultados', [{ tipo: 'tabla', columnas: columnasComparativas('Código', desde1, h1, h0, usd), filas: f2 }]),
        anexo(3, 'Estado de Flujo de Efectivo', [{ tipo: 'tabla', columnas: [{ t: 'Concepto', w: 70 }, { t: fd(h1), w: 18, tipo: 'gs' }, { t: fd(h0), w: 18, tipo: 'gs' }], filas: f3 }]),
        anexo(4, 'Estado de Cambios del Patrimonio Neto', [{ tipo: 'tabla', columnas: [{ t: 'Cuentas', w: 40 }].concat(C.RG49_PN_COLS.map(t => ({ t, w: 14, tipo: 'gs' }))), filas: f4 }], 'landscape'),
        anexo(5, 'Notas a los Estados Financieros', bloques5),
        anexo(6, 'Cuadro de Revalúo y Depreciación de Bienes del Activo Fijo', [{ tipo: 'tabla', columnas: colsRev, filas: f6 }], 'landscape')
      ] }
    };
  };

  /* ---------- Vista previa en pantalla (mismo documento) ---------- */
  A.htmlDocumento = function (doc) {
    const hojas = doc.hojas || [doc];
    return hojas.map(h => `<section class="doc-prev"><h3>${esc(h.titulo)}</h3>${h.subtitulo ? `<p class="muted">${esc(h.subtitulo)}</p>` : ''}
      ${(h.bloques || []).map(b => {
        if (b.tipo === 'texto') return `${b.titulo ? `<h4>${esc(b.titulo)}</h4>` : ''}${(b.parrafos || []).map(p => `<p>${esc(p)}</p>`).join('')}`;
        if (b.tipo !== 'tabla') return '';
        return `${b.titulo ? `<h4>${esc(b.titulo)}</h4>` : ''}<div class="scroll"><table class="grid docprev"><thead><tr>${b.columnas.map(c => `<th class="${c.tipo && c.tipo !== 'texto' ? 'n' : ''}">${esc(c.t)}</th>`).join('')}</tr></thead><tbody>
          ${b.filas.map(f => `<tr class="e-${f.estilo || 'n'}">${b.columnas.map((c, i) => `<td class="${c.tipo && c.tipo !== 'texto' ? 'n' : ''}" ${i === 1 && f.nivel ? `style="padding-left:${6 + f.nivel * 14}px"` : ''}>${esc(R.fmtValor(f.v[i], c.tipo))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
      }).join('')}</section>`).join('');
  };

  /* ---------- Integración en la pantalla de Balances ---------- */
  const vB = A.VISTAS.balances;
  A.VISTAS.balances = Object.assign({}, vB, {
    html() {
      const d = datos(), anio = +st.corte2.slice(0, 4), notas = Object.assign(C.rg49NotasPorDefecto(d, anio), ((d.notasRG49 || {})[anio]) || {});
      return vB.html()
        .replace(/<button id="b-ver49"[^>]*>[^<]*<\/button>/, '<button id="b-ver49" class="primary">Ver estados RG 49 (Anexos 1 a 6)</button>')
        .replace(/<button id="b-exp49"[^>]*>[^<]*<\/button>/, '<button id="b-exp49">Descargar estados RG 49 (PDF o Excel)</button> <label class="chk"><input type="checkbox" id="b-completo" ' + (st.rg49Completo ? 'checked' : '') + '> Formato completo (incluir líneas sin saldo)</label>')
        .replace(/<details><summary>Texto de notas adicionales[\s\S]*?<\/details>/, `<details><summary>Notas a los estados financieros (Anexo 5) – ejercicio ${anio}</summary>
          <div class="notas-rg49">${E.NOTAS.map(([n, t]) => `<label><b>Nota ${n}.</b> ${esc(t)}<textarea data-nota="${n}" rows="${['1', '2', '3'].includes(n) ? 3 : 2}">${esc(notas[n] || '')}</textarea></label>`).join('')}</div></details>`);
    },
    bind() {
      vB.bind();
      const d = datos(), anio = +st.corte2.slice(0, 4);
      const leerOpts = () => { st.corte1 = $('#b-c1').value; st.corte2 = $('#b-c2').value; st.usdRG49 = $('#b-usd').checked; st.rg49Completo = $('#b-completo').checked;
        const tc = f => C.num((d.tiposCambio || {})[f.slice(0, 7)]); st.tc1 = C.num($('#b-tc1').value) || tc(st.corte1); st.tc2 = C.num($('#b-tc2').value) || tc(st.corte2);
        return { corte1: st.corte1, corte2: st.corte2, usd: st.usdRG49, completo: st.rg49Completo, tc1: st.tc1, tc2: st.tc2 }; };
      $$('[data-nota]').forEach(t => t.onchange = () => { const o = d.notasRG49 || (d.notasRG49 = {}); (o[anio] || (o[anio] = {}))[t.dataset.nota] = t.value; S.save(); });
      $('#b-ver49').onclick = () => {
        const r = A.documentoRG49(leerOpts());
        $('#b-res').innerHTML = (r.avisos.length ? `<div class="alerta">${r.avisos.map(esc).join('<br>')}</div>` : '<div class="okbox">Balance cuadrado · resultado del Anexo 2 igual al contable · flujo conciliado con las disponibilidades.</div>') + A.htmlDocumento(r.doc);
      };
      $('#b-exp49').onclick = () => { const o = leerOpts(), r = A.documentoRG49(o); if (r.avisos.length) toast(r.avisos.join(' '), 'error'); R.descargarDocumento(r.doc, `estados_financieros_RG49_${o.corte2}_${slug(cliente().razon)}`); };
      $('#b-completo').onchange = e => { st.rg49Completo = e.target.checked; };
    }
  });

  /* ---------- Datos del contador y auditor en Clientes ---------- */
  const vC = A.VISTAS.clientes;
  A.VISTAS.clientes = Object.assign({}, vC, {
    html() {
      const cli = S.cliente() || {};
      return vC.html().replace(/(<label>Contador <input id="c-cont"[^>]*><\/label>)/, `$1
          <label>RUC del contador <input id="c-rucc" value="${esc(cli.rucContador || '')}"></label>
          <label>Auditor externo (si corresponde) <input id="c-aud" value="${esc(cli.auditor || '')}"></label>
          <label>RUC del auditor <input id="c-ruca" value="${esc(cli.rucAuditor || '')}"></label>`);
    },
    bind() {
      vC.bind();
      const extra = () => ({ rucContador: ($('#c-rucc') || {}).value || '', auditor: ($('#c-aud') || {}).value || '', rucAuditor: ($('#c-ruca') || {}).value || '' });
      ['#c-guardar', '#c-nuevo'].forEach(id => { const b = $(id); if (!b) return; const o = b.onclick; b.onclick = ev => { const x = extra(); o && o(ev); const c = S.cliente(); if (c) { Object.assign(c, x); S.save(); } }; });
    }
  });

  /* ---------- Coeficiente de revalúo en Bienes de uso ---------- */
  const vBi = A.VISTAS.bienes;
  if (vBi) A.VISTAS.bienes = Object.assign({}, vBi, {
    html() {
      const anio = +st.periodo.slice(0, 4), c = ((datos().coefRevaluo || {})[anio]) || '';
      return vBi.html().replace('<section class="card"><h2>Cuadro de bienes de uso</h2>', `<section class="card"><h2>Revalúo fiscal</h2>
        <div class="form cols3"><label>Coeficiente de revalúo del ejercicio ${anio} (publicado por la DNIT) <input id="bi-coef" value="${esc(String(c).replace('.', ','))}" placeholder="1,0000"></label></div>
        </section>
        <section class="card"><h2>Cuadro de bienes de uso</h2>`);
    },
    bind() {
      vBi.bind();
      const i = $('#bi-coef'); if (!i) return;
      i.onchange = () => { const d = datos(), anio = +st.periodo.slice(0, 4), o = d.coefRevaluo || (d.coefRevaluo = {}); const v = C.num(i.value); if (v) o[anio] = v; else delete o[anio]; S.save(); toast('Coeficiente guardado'); };
    }
  });
})();
