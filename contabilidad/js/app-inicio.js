/* Pantalla de Inicio (tareas del mes, alertas, resumen de clientes), personalización del menú,
 * búsqueda rápida de pantallas (Ctrl+K) y ayuda por casilla / proforma imprimible del Form. 120. */
(function () {
  'use strict';
  const A = window.App;
  const { C, S, $, $$, esc, fmt, fd, hoy, MESES, st, toast, cfg, cliente, render } = A;
  const AY = window.AyudaFormularios || { F120: {} };
  const ir = tab => { st.tab = tab; st.editId = null; render(); window.scrollTo(0, 0); };
  const pl = (n, s1, s2) => `${n} ${n === 1 ? s1 : (s2 || s1 + 's')}`;
  const nombreMes = p => `${MESES[+p.slice(5, 7) - 1]} ${p.slice(0, 4)}`;

  /* ---------- Estado de un cliente en un período ---------- */
  function estadoCliente(cli, periodo) {
    const d = S.db().data[cli.id] || {};
    Object.defineProperty(d, 'cliente', { value: cli, enumerable: false, configurable: true });
    const enMes = x => x.fecha && x.fecha.slice(0, 7) === periodo;
    const ventas = (d.ventas || []).filter(enMes), compras = (d.compras || []).filter(enMes);
    const tot = l => l.reduce((s, x) => s + C.signo(x) * C.desglose(x).total, 0);
    let f = null; try { f = C.f120(d, periodo); } catch (e) { f = null; }
    const c = C.config(d);
    return {
      d, ventas, compras, totVentas: tot(ventas), totCompras: tot(compras), f,
      retenciones: (d.retenciones || []).filter(enMes).length,
      cerrado: !!(c.cerradoHasta && c.cerradoHasta >= C.finDeMes(periodo)),
      rg90: !!((d.rg90Generado || {})[periodo]),
      cfg: c
    };
  }
  function alertas(e, periodo) {
    const d = e.d, out = [];
    const plan = A.plan;
    const docs = (d.ventas || []).map(x => [x, 'ventas']).concat((d.compras || []).map(x => [x, 'compras']));
    const delMes = docs.filter(([x]) => x.fecha && x.fecha.slice(0, 7) === periodo);
    const malaCta = delMes.filter(([x]) => x.cuenta && !(plan.by[x.cuenta] && plan.by[x.cuenta].imputable));
    if (malaCta.length) out.push(['error', `${pl(malaCta.length, 'comprobante')} con cuenta contable inexistente o no imputable.`, malaCta[0][1]]);
    const malRuc = delMes.filter(([x]) => C.rucValido(x.ruc) === false);
    if (malRuc.length) out.push(['error', `${pl(malRuc.length, 'comprobante')} con dígito verificador de RUC incorrecto.`, malRuc[0][1]]);
    const sinTimb = delMes.filter(([x]) => !x.electronico && (!/^\d{8}$/.test(String(x.timbrado || '')) || !C.validarNumeroComprobante(x.numero)) && x.tipoDoc !== 'DESPACHO');
    if (sinTimb.length) out.push(['aviso', `${pl(sinTimb.length, 'comprobante')} sin timbrado o con número mal formado (el RG 90 los rechazaría).`, sinTimb[0][1]]);
    const claves = {}, dups = [];
    delMes.forEach(([x, t]) => { const k = `${t}|${x.tipoDoc}|${x.ruc}|${x.timbrado}|${x.numero}`; if (x.numero && claves[k]) dups.push(t); claves[k] = 1; });
    if (dups.length) out.push(['aviso', `${pl(dups.length, 'posible comprobante duplicado', 'posibles comprobantes duplicados')}.`, dups[0]]);
    const usd = delMes.some(([x]) => C.esME(x));
    if (usd && !C.tcDelMes(d, periodo)) out.push(['aviso', 'Hay comprobantes en US$ y falta el tipo de cambio de cierre del mes.', 'tc']);
    try { const R = C.rubrosAl(d, plan, C.finDeMes(periodo)); if (R.tot.diferencia) out.push(['error', `El balance no cuadra al ${fd(C.finDeMes(periodo))} (diferencia ${fmt(R.tot.diferencia)}).`, 'balances']); } catch (err) { /* sin plan */ }
    if ((d.productos || []).some(p => C.kardex(d, p.codigo, C.finDeMes(periodo)).negativo)) out.push(['aviso', 'Hay productos con stock negativo en el kardex.', 'inventario']);
    const ant = C.mesAnterior(periodo);
    if ((d.ventas || []).concat(d.compras || []).some(x => x.fecha && x.fecha.slice(0, 7) === ant) && !(e.cfg.cerradoHasta && e.cfg.cerradoHasta >= C.finDeMes(ant))) out.push(['info', `El período ${nombreMes(ant)} todavía no está cerrado.`, 'cierre']);
    const reg = e.cfg.regimenIRE;
    if (reg === 'SIMPLE' || reg === 'RESIMPLE') {
      try { const r = reg === 'SIMPLE' ? C.ireSimple(d, plan, +periodo.slice(0, 4)) : C.ireResimple(d, plan, +periodo.slice(0, 4)); r.alertas.forEach(a => out.push(['aviso', a, 'f500'])); } catch (err) { /* */ }
    }
    const lim = C.addDias(hoy(), 7);
    const cli = d.cliente;
    try {
      C.vencimientos(cli.ruc, +hoy().slice(0, 4), cli.cierreMes, { regimen: e.cfg.regimenIRE, mesesAnticiposIRE: e.cfg.mesesAnticiposIRE, mesesVtoIRE: e.cfg.mesesVtoIRE }).items
        .filter(x => x.fecha >= hoy() && x.fecha <= lim).forEach(x => out.push(['aviso', `Vence el ${fd(x.fecha)}: ${x.obligacion} (${x.periodo}).`, 'vencimientos']));
    } catch (err) { /* */ }
    return out;
  }

  /* ---------- Pantalla de Inicio ---------- */
  A.registrar('inicio', 'Inicio', 'Inicio', {
    html() {
      const cli = S.cliente();
      if (!cli) return `<section class="card bienvenida"><h2>Bienvenido a ContaPY</h2><p>Para empezar, cree su primer cliente.</p><button class="primary" data-ir="clientes">Crear cliente</button></section>`;
      const p = st.periodo, e = estadoCliente(cli, p), f = e.f;
      const iva = f ? (f.k.c58 ? { t: 'IVA a pagar', v: f.k.c58, cls: 'pagar' } : { t: 'IVA saldo a favor', v: f.k.c47 + f.k.c54, cls: 'favor' }) : { t: 'IVA', v: 0 };
      let resultado = 0; try { resultado = C.rubrosAl(e.d, A.plan, C.finDeMes(p)).er.neto; } catch (err) { /* */ }
      const tareas = [
        [e.ventas.length > 0, `Cargar las ventas del mes`, pl(e.ventas.length, 'comprobante'), 'ventas'],
        [e.compras.length > 0, `Cargar las compras del mes`, pl(e.compras.length, 'comprobante'), 'compras'],
        [e.retenciones > 0, 'Registrar retenciones recibidas (si hubo)', e.retenciones ? `${e.retenciones} registradas` : 'opcional', 'retenciones', true],
        [!!f, 'Revisar el Formulario 120', f ? (f.k.c58 ? `a pagar Gs. ${fmt(f.k.c58)}` : `saldo a favor Gs. ${fmt(f.k.c47 + f.k.c54)}`) : '', 'f120'],
        [e.rg90, 'Generar el archivo RG 90 para Marangatu', e.rg90 ? 'generado' : 'pendiente', 'rg90'],
        [e.cerrado, 'Cerrar el período (después de presentar)', e.cerrado ? 'cerrado' : 'abierto', 'cierre']
      ];
      const hechas = tareas.filter(t => t[0]).length;
      const al = alertas(e, p);
      const nuevo = !(e.d.ventas || []).length && !(e.d.compras || []).length && !(e.d.asientos || []).length;
      const icono = { error: '⛔', aviso: '⚠️', info: 'ℹ️' };
      return `<section class="card"><div class="hero"><div><h2>${esc(cli.razon)}</h2><span class="muted">RUC ${esc(cli.ruc || '—')} · Régimen IRE ${esc(e.cfg.regimenIRE)} · cierre en ${MESES[(+cli.cierreMes || 12) - 1].toLowerCase()}</span></div>
          <div class="muted">Período de trabajo: <b>${nombreMes(p)}</b> (cámbielo arriba)</div></div>
        <div class="kpis">
          <div class="kpi"><span>Ventas del mes</span><b>${fmt(e.totVentas)}</b><small>${pl(e.ventas.length, 'comprobante')}</small></div>
          <div class="kpi"><span>Compras del mes</span><b>${fmt(e.totCompras)}</b><small>${pl(e.compras.length, 'comprobante')}</small></div>
          <div class="kpi ${iva.cls || ''}"><span>${iva.t}</span><b>${fmt(iva.v)}</b><small>Formulario 120</small></div>
          <div class="kpi"><span>Resultado del ejercicio</span><b class="${resultado < 0 ? 'err' : ''}">${fmt(resultado)}</b><small>al ${fd(C.finDeMes(p))}</small></div>
        </div></section>
      ${nuevo ? `<section class="card"><h2>Primeros pasos con este cliente</h2><ol class="pasos">
          <li>Revise los datos del cliente, el mes de cierre y el representante <button class="mini" data-ir="clientes">Clientes</button></li>
          <li>Elija el régimen del IRE (General, Simple o Resimple) <button class="mini" data-ir="f500">IRE</button></li>
          <li>Use el plan de cuentas estándar o importe el suyo desde Excel <button class="mini" data-ir="plan">Plan de cuentas</button></li>
          <li>Si viene de otro sistema, importe los saldos iniciales <button class="mini" data-ir="cierreej">Saldos iniciales</button></li>
          <li>Cargue o importe las ventas y compras del mes <button class="mini" data-ir="ventas">Ventas</button> <button class="mini" data-ir="importar">Importar XML / Marangatu</button></li>
        </ol></section>` : ''}
      <div class="dos-col">
        <section class="card"><h2>Tareas de ${nombreMes(p)} <small class="muted">${hechas} de ${tareas.length}</small></h2>
          <div class="barra-prog"><i style="width:${Math.round(hechas / tareas.length * 100)}%"></i></div>
          <ul class="tareas">${tareas.map(([ok, t, det, tab, opc]) => `<li class="${ok ? 'ok' : opc ? 'opc' : ''}"><span class="chk-ic">${ok ? '✔' : opc ? '○' : '●'}</span><span class="t">${t}<small>${esc(det)}</small></span><button class="mini" data-ir="${tab}">Ir</button></li>`).join('')}</ul>
        </section>
        <section class="card"><h2>Alertas</h2>
          ${al.length ? `<ul class="alertas">${al.map(([t, m, tab]) => `<li class="${t}"><span>${icono[t]}</span><span class="t">${esc(m)}</span>${tab ? `<button class="mini" data-ir="${tab}">Ver</button>` : ''}</li>`).join('')}</ul>` : '<div class="okbox">Todo en orden: no hay alertas para este período.</div>'}
        </section>
      </div>
      <section class="card"><h2>Todos los clientes – ${nombreMes(p)}</h2>
        <div class="scroll"><table class="grid"><thead><tr><th>Cliente</th><th>RUC</th><th>Régimen</th><th>Ventas</th><th>Compras</th><th>IVA del mes</th><th>RG 90</th><th>Período</th><th></th></tr></thead><tbody>
        ${S.db().clientes.map(c => { const x = estadoCliente(c, p), fx = x.f; return `<tr class="${c.id === cli.id ? 'sel' : ''}"><td>${esc(c.razon)}</td><td>${esc(c.ruc)}</td><td>${esc(x.cfg.regimenIRE)}</td>
          <td class="n">${fmt(x.totVentas)}</td><td class="n">${fmt(x.totCompras)}</td><td class="n">${fx ? (fx.k.c58 ? `<span class="err">a pagar ${fmt(fx.k.c58)}</span>` : `a favor ${fmt(fx.k.c47 + fx.k.c54)}`) : ''}</td>
          <td class="c">${x.rg90 ? '✔' : '—'}</td><td class="c">${x.cerrado ? '🔒 cerrado' : 'abierto'}</td><td>${c.id === cli.id ? '' : `<button class="mini" data-cli="${c.id}">Trabajar</button>`}</td></tr>`; }).join('')}
        </tbody></table></div></section>
      <section class="card"><details><summary><b>Personalizar menú</b> – elija qué módulos ver</summary>
        <p class="muted">El menú simple muestra lo esencial para llevar la contabilidad mensual. Active los módulos que use (inventario, sueldos, bancos, bienes de uso…).</p>
        <div class="acciones"><button id="mn-simple">Menú simple</button> <button id="mn-todo">Mostrar todo</button></div>
        <div class="menu-cfg">${A.GRUPOS.filter(g => g !== 'Inicio').map(g => `<div><b>${g}</b>${A.TABS.filter(t => t[2] === g).map(([k, n]) => `<label class="chk"><input type="checkbox" data-mn="${k}" ${menuActual().includes(k) ? 'checked' : ''} ${k === 'clientes' ? 'disabled' : ''}> ${n}</label>`).join('')}</div>`).join('')}</div>
      </details></section>`;
    },
    bind() {
      $$('[data-ir]').forEach(b => b.onclick = () => ir(b.dataset.ir));
      $$('[data-cli]').forEach(b => b.onclick = () => { S.db().activo = b.dataset.cli; S.save(); A.refrescarPlan(); render(); });
      const guardarMenu = lista => { try { localStorage.setItem(A.KEY_MENU, JSON.stringify(lista)); } catch (e) { /* */ } render(); };
      if ($('#mn-simple')) $('#mn-simple').onclick = () => guardarMenu(A.ESENCIALES);
      if ($('#mn-todo')) $('#mn-todo').onclick = () => guardarMenu(A.TABS.map(t => t[0]));
      $$('[data-mn]').forEach(i => i.onchange = () => guardarMenu($$('[data-mn]').filter(x => x.checked).map(x => x.dataset.mn).concat(['inicio', 'clientes'])));
    }
  });
  function menuActual() { try { const m = JSON.parse(localStorage.getItem(A.KEY_MENU)); if (Array.isArray(m)) return m; } catch (e) { /* */ } return A.ESENCIALES; }
  // Inicio primero en el menú
  const ti = A.TABS.findIndex(t => t[0] === 'inicio'); if (ti > 0) A.TABS.unshift(A.TABS.splice(ti, 1)[0]);

  /* ---------- RG 90: registrar cuándo se generó el archivo ---------- */
  const vRG = A.VISTAS.rg90;
  A.VISTAS.rg90 = Object.assign({}, vRG, {
    bind() {
      vRG.bind();
      ['#r-zip', '#r-csv'].forEach(id => { const b = $(id); if (!b) return; const orig = b.onclick; b.onclick = ev => { orig && orig(ev); const d = A.datos(); (d.rg90Generado || (d.rg90Generado = {}))[st.rg90Anual ? st.periodo.slice(0, 4) : st.periodo] = hoy(); S.save(); }; });
    }
  });

  /* ---------- Form. 120: ayuda por casilla y proforma imprimible ---------- */
  const v120 = A.VISTAS.f120;
  A.VISTAS.f120 = Object.assign({}, v120, {
    html() {
      return v120.html().replace('<table class="grid f120 v4">', `<div id="ayuda-cas" class="ayuda-cas muted">💡 Toque un número de casilla para ver qué va ahí según el instructivo de la DNIT y de dónde lo toma el sistema.</div><table class="grid f120 v4">`);
    },
    bind() {
      v120.bind();
      $$('table.f120.v4 td.cas').forEach(td => {
        const n = td.textContent.trim(); const a = AY.F120[n]; if (!a) return;
        td.classList.add('ayuda'); td.title = `${a[0]}${a[1] ? '\nEn ContaPY: ' + a[1] : ''}`;
        td.onclick = () => { $('#ayuda-cas').innerHTML = `<b>Casilla ${n}.</b> ${esc(a[0])}${a[1] ? `<br><b>En ContaPY:</b> ${esc(a[1])}` : ''}`; $('#ayuda-cas').classList.remove('muted'); $$('td.cas.activa').forEach(x => x.classList.remove('activa')); td.classList.add('activa'); };
      });
      const acc = $('.acciones'); if (!acc) return;
      acc.insertAdjacentHTML('beforeend', ' <button id="f-print">Imprimir proforma</button>');
      $('#f-print').onclick = () => imprimirProforma120();
    }
  });
  function imprimirProforma120() {
    const f = C.f120(A.datos(), st.periodo), cli = cliente();
    const celda = x => x ? `<td class="cas">${x[0]}</td><td class="n">${(Math.round(x[1]) || 0).toLocaleString('es-PY')}</td>` : '<td class="cas vac"></td><td class="vac"></td>';
    const cuerpo = f.rubros.map(r => `<table><tr class="tit"><td colspan="${2 + r.cols.length * 2}">${esc(r.titulo)}</td></tr>
      <tr class="sub"><td>INC.</td><td></td>${r.cols.map(c => `<td colspan="2">${esc(c)}</td>`).join('')}</tr>
      ${r.filas.map(([inc, txt, cel, tot]) => `<tr class="${tot ? 'tot' : ''}"><td class="inc">${inc}</td><td>${esc(txt)}</td>${cel.map(celda).join('')}</tr>`).join('')}</table>`).join('');
    const w = window.open('', '_blank');
    if (!w) return toast('Permita ventanas emergentes para imprimir la proforma.', 'error');
    w.document.write(`<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>Form. 120 ${st.periodo} – ${esc(cli.razon || '')}</title><style>
      body{font:10px Arial,sans-serif;margin:10mm}h1{font-size:13px;margin:0}table{width:100%;border-collapse:collapse;margin-bottom:6px}td{border:1px solid #555;padding:2px 4px;vertical-align:middle}
      .enc{display:grid;grid-template-columns:90px 1fr 1fr;border:2px solid #000;margin-bottom:6px}.enc>div{padding:4px 6px;border-right:1px solid #000}.enc .f{font-size:26px;font-weight:bold;text-align:center}
      tr.tit td{background:#ddd;font-weight:bold}tr.sub td{background:#f2f2f2;font-weight:bold;text-align:center}td.cas{width:28px;text-align:center;background:#f2f2f2;font-weight:bold}td.n{width:90px;text-align:right}
      td.inc{width:18px;text-align:center}td.vac{background:#e6e6e6}tr.tot td{font-weight:bold}.pie{margin-top:14px;font-size:10px}.barra{text-align:center;margin-bottom:8px}@media print{.barra{display:none}}</style></head><body>
      <div class="barra"><button onclick="print()">Imprimir / Guardar como PDF</button></div>
      <div class="enc"><div class="f">120<br><small style="font-size:9px">IVA – Versión 4</small></div>
        <div><b>RUC:</b> ${esc(cli.ruc || '')}<br><b>Razón social:</b> ${esc(cli.razon || '')}<br>01 Declaración Jurada Original</div>
        <div><b>Período / Ejercicio fiscal</b><br>Mes: ${st.periodo.slice(5, 7)} &nbsp; Año: ${st.periodo.slice(0, 4)}<br><small>Importes sin céntimos – proforma de control generada por ContaPY</small></div></div>
      ${cuerpo}
      <div class="pie">Proforma para transcribir en el Sistema Marangatu. Los importes son de control y no reemplazan a la declaración presentada.</div></body></html>`);
    w.document.close();
  }

  /* ---------- Búsqueda rápida de pantallas (Ctrl+K) ---------- */
  function abrirBuscador() {
    if ($('.buscador')) return;
    const div = document.createElement('div');
    div.className = 'buscador-fondo';
    div.innerHTML = `<div class="buscador card"><input placeholder="Escriba una pantalla: ventas, IVA, balance, sueldos…" autofocus><ul></ul><small class="muted">↑ ↓ para elegir · Enter para abrir · Esc para cerrar</small></div>`;
    document.body.appendChild(div);
    const inp = div.querySelector('input'), ul = div.querySelector('ul');
    let sel = 0, lista = [];
    const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const SIN = { f120: 'iva formulario 120 debito credito', f500: 'ire renta 500 simple resimple', rg90: 'marangatu registro comprobantes', tc: 'dolar cotizacion', cierreej: 'saldos iniciales reserva vacaciones prevision', libros: 'diario mayor inventario rubricar pdf', tesoreria: 'cobros pagos cuenta corriente antiguedad', bancos: 'extracto conciliacion', irpidu: 'irp idu dividendos personal' };
    const pintar = () => {
      const q = norm(inp.value.trim());
      lista = A.TABS.filter(([k, n, g]) => !q || norm(`${n} ${g} ${SIN[k] || ''}`).includes(q));
      sel = Math.min(sel, Math.max(0, lista.length - 1));
      ul.innerHTML = lista.map(([k, n, g], i) => `<li class="${i === sel ? 'sel' : ''}" data-k="${k}"><b>${esc(n)}</b> <small class="muted">${g}</small></li>`).join('') || '<li class="muted">Sin resultados</li>';
      $$('li[data-k]', ul).forEach(li => li.onclick = () => { cerrar(); ir(li.dataset.k); });
    };
    const cerrar = () => div.remove();
    inp.oninput = () => { sel = 0; pintar(); };
    inp.onkeydown = e => {
      if (e.key === 'Escape') cerrar();
      if (e.key === 'ArrowDown') { sel = Math.min(sel + 1, lista.length - 1); pintar(); e.preventDefault(); }
      if (e.key === 'ArrowUp') { sel = Math.max(sel - 1, 0); pintar(); e.preventDefault(); }
      if (e.key === 'Enter' && lista[sel]) { const k = lista[sel][0]; cerrar(); if (S.cliente() || k === 'clientes') ir(k); }
    };
    div.onclick = e => { if (e.target === div) cerrar(); };
    pintar(); inp.focus();
  }
  document.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); abrirBuscador(); } });
  document.addEventListener('DOMContentLoaded', () => { const b = $('#btnBuscar'); if (b) b.onclick = abrirBuscador; });
})();
