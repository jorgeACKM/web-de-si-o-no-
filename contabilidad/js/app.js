/* Interfaz de usuario. */
(function () {
  'use strict';
  const C = window.Conta, S = window.Store, X = window.ExcelIO, PD = window.PlanDefault;

  const $ = (sel, el) => (el || document).querySelector(sel);
  const $$ = (sel, el) => [...(el || document).querySelectorAll(sel)];
  const esc = s => String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = n => n === null || n === undefined || n === '' ? '' : (Math.round(n) || 0).toLocaleString('es-PY');
  const fmtZ = n => Math.round(n || 0) ? fmt(n) : '';
  const fmt2 = n => n === null || n === undefined ? '' : (+n).toLocaleString('es-PY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fd = f => f ? f.split('-').reverse().join('/') : '';
  const hoy = () => C.parseFecha(new Date());
  const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const TIPOS_DOC = { FACTURA: 'Factura', NOTA_CREDITO: 'Nota de crédito', AUTOFACTURA: 'Autofactura', BOLETA: 'Boleta', DESPACHO: 'Despacho (importación)' };
  const RUBRO = k => (PD.RUBROS_RG49.find(r => r.key === k) || {}).nombre || k;

  const st = {
    tab: 'clientes', periodo: hoy().slice(0, 7), editId: null, verAuto: false,
    corte1: `${+hoy().slice(0, 4) - 1}-12-31`, corte2: C.finDeMes(hoy().slice(0, 7)), nivel: 4, usdRG49: true,
    anio: +hoy().slice(0, 4) - 1, anioTC: +hoy().slice(0, 4), filtroPlan: '', asientoEdit: null
  };
  let plan = null;

  /* ---------- utilidades ---------- */
  function toast(msg, tipo) {
    const t = $('#toast');
    t.textContent = msg; t.className = 'toast ' + (tipo || ''); t.hidden = false;
    clearTimeout(toast._t); toast._t = setTimeout(() => { t.hidden = true; }, tipo === 'error' ? 6000 : 3000);
  }
  const datos = () => S.data();
  const cfg = () => C.config(datos());
  function refrescarPlan() {
    const d = datos();
    plan = d ? C.prepararPlan(d.cuentas) : null;
    $('#dl-cuentas').innerHTML = plan ? plan.list.filter(c => c.imputable).map(c => `<option value="${esc(c.codigo)}">${esc(c.nombre)}</option>`).join('') : '';
  }
  const nombreCta = cod => (plan && plan.by[cod]) ? plan.by[cod].nombre : '';
  function ctaValida(cod) { const c = plan && plan.by[cod]; return !!(c && c.imputable); }
  function pedirArchivo(accept, cb) {
    const i = document.createElement('input');
    i.type = 'file'; i.accept = accept;
    i.onchange = () => i.files[0] && cb(i.files[0]);
    i.click();
  }
  const slug = s => String(s || '').replace(/[^\w]+/g, '_').slice(0, 40);
  const cliente = () => S.cliente() || {};

  /* ---------- navegación ---------- */
  const TABS = [['clientes', 'Clientes'], ['plan', 'Plan de cuentas'], ['ventas', 'Ventas'], ['compras', 'Compras'], ['asientos', 'Asientos y mayor'],
    ['tc', 'Tipos de cambio'], ['balances', 'Balances'], ['f120', 'Form. 120 – IVA'], ['f500', 'Form. 500 – IRE']];

  let renderizando = false;
  function render() {
    if (renderizando) return;
    // Quitar el foco antes de reemplazar el DOM: dispara los "change" pendientes (que pueden guardar datos).
    const ae = document.activeElement;
    renderizando = true;
    try { if (ae && $('#main').contains(ae)) ae.blur(); } finally { renderizando = false; }
    renderizando = true;
    try { dibujar(); } finally { renderizando = false; }
  }
  function dibujar() {
    const db = S.db();
    $('#selCliente').innerHTML = db.clientes.length
      ? db.clientes.map(c => `<option value="${c.id}" ${c.id === db.activo ? 'selected' : ''}>${esc(c.razon)} (${esc(c.ruc)})</option>`).join('')
      : '<option value="">— cree un cliente —</option>';
    if (!S.cliente()) st.tab = 'clientes';
    $('#tabs').innerHTML = TABS.map(([k, n]) => `<button data-tab="${k}" class="${st.tab === k ? 'active' : ''}" ${!S.cliente() && k !== 'clientes' ? 'disabled' : ''}>${n}</button>`).join('');
    const v = VISTAS[st.tab];
    $('#main').innerHTML = v.html();
    if (v.bind) v.bind();
  }

  /* ================= CLIENTES ================= */
  const CFG_LABELS = [
    ['ctaCaja', 'Caja (operaciones al contado)'], ['ctaClientes', 'Clientes (ventas a crédito)'], ['ctaProveedores', 'Proveedores (compras a crédito)'],
    ['ctaVentas10', 'Ventas gravadas 10%'], ['ctaVentas5', 'Ventas gravadas 5%'], ['ctaVentasEx', 'Ventas exentas'], ['ctaExportaciones', 'Exportaciones'],
    ['ctaIvaDF10', 'IVA débito fiscal 10%'], ['ctaIvaDF5', 'IVA débito fiscal 5%'], ['ctaIvaCF10', 'IVA crédito fiscal 10%'], ['ctaIvaCF5', 'IVA crédito fiscal 5%'],
    ['ctaCompras', 'Cuenta de compras por defecto'], ['ctaIvaCosto', 'IVA no computable (prorrateo)'], ['ctaResultadosAcum', 'Resultados acumulados'],
    ['ctaAnticiposIRE', 'Anticipos de IRE'], ['ctaRetencionesIRE', 'Retenciones de IRE recibidas'], ['ctaDonaciones', 'Donaciones']
  ];
  const PARAMS = [['tasaIRE', 'Tasa IRE (%)'], ['limiteQuebrantoPct', 'Límite compensación de quebrantos (% renta neta)'],
    ['pctAnticipo', 'Anticipo IRE (% por cuota)'], ['cantAnticipos', 'Cantidad de anticipos'], ['limiteDonacionesPct', 'Límite donaciones (% renta neta)']];

  const vistaClientes = {
    html() {
      const db = S.db(), cli = S.cliente(), c = cfg && cli ? cfg() : null;
      return `
      <section class="card"><h2>Clientes</h2>
        ${db.clientes.length ? `<table class="grid"><thead><tr><th>Razón social</th><th>RUC</th><th>Actividad</th><th>Cierre</th><th>Comprobantes</th><th></th></tr></thead><tbody>
        ${db.clientes.map(x => { const d = db.data[x.id] || {}; return `<tr class="${x.id === db.activo ? 'sel' : ''}"><td>${esc(x.razon)}</td><td>${esc(x.ruc)}</td><td>${esc(x.actividad)}</td><td>${MESES[(+x.cierreMes || 12) - 1]}</td>
          <td class="n">${((d.ventas || []).length + (d.compras || []).length)}</td>
          <td><button data-sel="${x.id}">Trabajar</button> <button class="danger" data-del="${x.id}">Eliminar</button></td></tr>`; }).join('')}
        </tbody></table>` : '<p class="muted">Todavía no hay clientes. Cree el primero abajo.</p>'}
      </section>
      <section class="card"><h2>${cli ? 'Datos del cliente activo' : 'Nuevo cliente'}</h2>
        <div class="form">
          <label>Razón social <input id="c-razon" value="${esc(cli && cli.razon)}"></label>
          <label>RUC (con DV) <input id="c-ruc" value="${esc(cli && cli.ruc)}" placeholder="80000000-0"></label>
          <label>Actividad principal <input id="c-act" value="${esc(cli && cli.actividad)}"></label>
          <label>Mes de cierre del ejercicio <select id="c-cierre">${MESES.map((m, i) => `<option value="${i + 1}" ${(cli ? +cli.cierreMes || 12 : 12) === i + 1 ? 'selected' : ''}>${m}</option>`).join('')}</select></label>
          <label>Representante legal <input id="c-rep" value="${esc(cli && cli.representante)}"></label>
          <label>Contador <input id="c-cont" value="${esc(cli && cli.contador)}"></label>
        </div>
        <div class="acciones">
          ${cli ? '<button id="c-guardar" class="primary">Guardar cambios</button>' : ''}
          <button id="c-nuevo" class="${cli ? '' : 'primary'}">Crear como nuevo cliente</button>
        </div>
      </section>
      ${cli ? `<section class="card"><h2>Cuentas utilizadas en los asientos automáticos</h2>
        <p class="muted">Cada factura de compra o venta genera su asiento contable automáticamente usando estas cuentas.</p>
        <div class="form cols3">${CFG_LABELS.map(([k, n]) => `<label>${n}<input list="dl-cuentas" data-cfg="${k}" value="${esc(c[k])}"><small>${esc(nombreCta(c[k])) || '<b class="err">cuenta inexistente</b>'}</small></label>`).join('')}</div>
        <h3>Parámetros del IRE (Ley 6380/2019 – verificar vigencia)</h3>
        <div class="form cols3">${PARAMS.map(([k, n]) => `<label>${n}<input type="number" step="any" data-cfg="${k}" value="${esc(c[k])}"></label>`).join('')}</div>
        <div class="acciones"><button id="cfg-guardar" class="primary">Guardar configuración</button></div>
      </section>` : ''}
      <section class="card"><h2>Respaldo de datos</h2>
        <p class="muted">Los datos se guardan en este navegador. Descargue respaldos periódicamente.</p>
        <div class="acciones"><button id="b-exp">Descargar respaldo (.json)</button> <button id="b-imp">Restaurar respaldo</button> <button id="b-merge">Agregar clientes desde respaldo</button></div>
      </section>`;
    },
    bind() {
      $$('[data-sel]').forEach(b => b.onclick = () => { S.db().activo = b.dataset.sel; S.save(); refrescarPlan(); st.tab = 'ventas'; render(); });
      $$('[data-del]').forEach(b => b.onclick = () => {
        const x = S.db().clientes.find(c => c.id === b.dataset.del);
        if (confirm(`¿Eliminar el cliente "${x.razon}" y TODOS sus datos? Esta acción no se puede deshacer.`)) { S.eliminarCliente(x.id); refrescarPlan(); render(); }
      });
      const leer = () => ({ razon: $('#c-razon').value.trim(), ruc: $('#c-ruc').value.trim(), actividad: $('#c-act').value.trim(), cierreMes: +$('#c-cierre').value, representante: $('#c-rep').value.trim(), contador: $('#c-cont').value.trim() });
      const validar = x => {
        if (!x.razon) { toast('Ingrese la razón social', 'error'); return false; }
        if (C.rucValido(x.ruc) === false) return confirm(`El DV del RUC no es válido (DV correcto: ${C.dvRuc(x.ruc.split('-')[0])}). ¿Guardar igual?`);
        return true;
      };
      $('#c-nuevo').onclick = () => { const x = leer(); if (!validar(x)) return; S.crearCliente(x); refrescarPlan(); toast('Cliente creado con el plan de cuentas estándar'); render(); };
      if ($('#c-guardar')) $('#c-guardar').onclick = () => { const x = leer(); if (!validar(x)) return; Object.assign(S.cliente(), x); S.save(); toast('Datos guardados'); render(); };
      if ($('#cfg-guardar')) $('#cfg-guardar').onclick = () => {
        const d = datos(), nc = Object.assign({}, d.config);
        let malas = [];
        $$('[data-cfg]').forEach(i => {
          const k = i.dataset.cfg;
          if (k.startsWith('cta')) { nc[k] = i.value.trim(); if (!ctaValida(nc[k])) malas.push(nc[k] || k); }
          else nc[k] = C.num(i.value);
        });
        if (malas.length && !confirm(`Estas cuentas no existen o no son imputables: ${malas.join(', ')}. ¿Guardar igual?`)) return;
        d.config = nc; S.save(); toast('Configuración guardada'); render();
      };
      $('#b-exp').onclick = () => {
        const blob = new Blob([S.exportarJSON()], { type: 'application/json' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `respaldo_contapy_${hoy()}.json`; a.click();
      };
      const imp = merge => pedirArchivo('.json', f => f.text().then(t => {
        if (!merge && !confirm('Esto reemplazará TODOS los datos actuales por los del respaldo. ¿Continuar?')) return;
        try { S.importarJSON(t, merge); refrescarPlan(); toast('Respaldo restaurado'); render(); } catch (e) { toast(e.message, 'error'); }
      }));
      $('#b-imp').onclick = () => imp(false);
      $('#b-merge').onclick = () => imp(true);
    }
  };

  /* ================= PLAN DE CUENTAS ================= */
  const vistaPlan = {
    html() {
      const f = st.filtroPlan.toLowerCase();
      const filas = plan.list.filter(c => !f || c.codigo.toLowerCase().startsWith(f) || c.nombre.toLowerCase().includes(f));
      const opts = sel => `<option value="">(heredado)</option>` + PD.RUBROS_RG49.map(r => `<option value="${r.key}" ${sel === r.key ? 'selected' : ''}>${r.key} – ${esc(r.nombre)}</option>`).join('');
      return `
      <section class="card"><h2>Plan de cuentas <small class="muted">(${plan.list.length} cuentas, ${plan.list.filter(c => c.imputable).length} imputables)</small></h2>
        <div class="acciones">
          <button id="p-imp" class="primary">Importar plan desde Excel</button>
          <button id="p-plantilla">Descargar plantilla / exportar plan</button>
          <button id="p-std">Restaurar plan estándar</button>
          <input id="p-filtro" placeholder="Buscar código o nombre…" value="${esc(st.filtroPlan)}">
        </div>
        <details><summary>Formato del Excel a importar</summary>
          <p>Primera hoja con encabezados: <b>Código</b>, <b>Nombre</b> (obligatorios) y opcionalmente <b>Nivel</b>, <b>Imputable</b> (S/N), <b>Tipo</b> (A, P, PN, I, E), <b>Rubro RG49</b>, <b>No deducible</b> (S/N), <b>No gravado</b> (S/N).
          Los códigos pueden ser con puntos (1.1.1.01.01) o sin puntos (11101001). Si no indica imputable, se consideran imputables las cuentas sin subcuentas.
          El rubro RG 49 se hereda de la cuenta padre: alcanza con asignarlo en el nivel 3 o 4. La plantilla incluye una hoja con la lista de rubros.</p>
        </details>
        ${plan.avisos.length ? `<div class="alerta"><b>${plan.avisos.length} avisos:</b> ${plan.avisos.slice(0, 8).map(esc).join('; ')}${plan.avisos.length > 8 ? '…' : ''}</div>` : ''}
        <div class="scroll"><table class="grid plan"><thead><tr><th>Código</th><th>Nombre</th><th>Nivel</th><th>Tipo</th><th>Imput.</th><th>Rubro RG 49 (asignado / efectivo)</th><th title="Gasto no deducible IRE">ND</th><th title="Ingreso no gravado IRE">NG</th><th></th></tr></thead><tbody>
        ${filas.map(c => `<tr class="niv${Math.min(c.nivel, 5)}"><td>${esc(c.codigo)}</td><td style="padding-left:${(c.nivel - 1) * 14 + 6}px">${esc(c.nombre)}</td><td class="c">${c.nivel}</td><td class="c">${c.tipo}</td><td class="c">${c.imputable ? '✔' : ''}</td>
          <td><select data-rg="${esc(c.codigo)}">${opts(c.rg49)}</select> <small class="muted">${esc(c.rubro)}</small></td>
          <td class="c">${c.tipo === 'E' ? `<input type="checkbox" data-nd="${esc(c.codigo)}" ${c.noDeducible ? 'checked' : ''}>` : ''}</td>
          <td class="c">${c.tipo === 'I' ? `<input type="checkbox" data-ng="${esc(c.codigo)}" ${c.noGravado ? 'checked' : ''}>` : ''}</td>
          <td>${c.imputable ? `<button class="mini danger" data-delc="${esc(c.codigo)}">✕</button>` : ''}</td></tr>`).join('')}
        </tbody></table></div>
        <h3>Agregar cuenta</h3>
        <div class="form cols4"><label>Código <input id="n-cod"></label><label>Nombre <input id="n-nom"></label>
          <label>Rubro RG 49 <select id="n-rg">${opts('')}</select></label><label>&nbsp;<button id="n-add">Agregar</button></label></div>
      </section>`;
    },
    bind() {
      const d = datos();
      const cta = cod => d.cuentas.find(c => String(c.codigo).trim() === cod);
      $('#p-filtro').oninput = e => { st.filtroPlan = e.target.value; const pos = e.target.selectionStart; render(); const i = $('#p-filtro'); i.focus(); i.setSelectionRange(pos, pos); };
      $$('[data-rg]').forEach(s => s.onchange = () => { cta(s.dataset.rg).rg49 = s.value; S.save(); refrescarPlan(); render(); });
      $$('[data-nd]').forEach(s => s.onchange = () => { cta(s.dataset.nd).noDeducible = s.checked; S.save(); refrescarPlan(); });
      $$('[data-ng]').forEach(s => s.onchange = () => { cta(s.dataset.ng).noGravado = s.checked; S.save(); refrescarPlan(); });
      $$('[data-delc]').forEach(b => b.onclick = () => {
        const cod = b.dataset.delc;
        const usada = C.todosLosAsientos(d).some(a => a.lineas.some(l => l.cuenta === cod));
        if (usada) return toast('La cuenta tiene movimientos; no se puede eliminar.', 'error');
        if (!confirm(`¿Eliminar la cuenta ${cod}?`)) return;
        d.cuentas = d.cuentas.filter(c => String(c.codigo).trim() !== cod); S.save(); refrescarPlan(); render();
      });
      $('#n-add').onclick = () => {
        const codigo = $('#n-cod').value.trim(), nombre = $('#n-nom').value.trim();
        if (!codigo || !nombre) return toast('Ingrese código y nombre', 'error');
        if (cta(codigo)) return toast('Ese código ya existe', 'error');
        d.cuentas.push({ codigo, nombre, rg49: $('#n-rg').value }); S.save(); refrescarPlan(); toast('Cuenta agregada'); render();
      };
      $('#p-std').onclick = () => {
        if (!confirm('¿Reemplazar el plan actual por el plan estándar? Los asientos con cuentas que no existan quedarán sin cuenta.')) return;
        d.cuentas = PD.PLAN_DEFAULT.map(c => Object.assign({}, c)); S.save(); refrescarPlan(); render();
      };
      $('#p-plantilla').onclick = () => {
        const aoa = [['Código', 'Nombre', 'Nivel', 'Imputable', 'Tipo', 'Rubro RG49', 'No deducible', 'No gravado']]
          .concat(plan.list.map(c => [c.codigo, c.nombre, c.nivel, c.imputable ? 'S' : 'N', c.tipo, c.rg49 || '', c.noDeducible ? 'S' : '', c.noGravado ? 'S' : '']));
        const rub = [['Clave', 'Rubro', 'Grupo']].concat(PD.RUBROS_RG49.map(r => [r.key, r.nombre, r.grupo]));
        X.descargar([{ nombre: 'Plan de cuentas', ws: X.hoja(aoa, { anchos: [16, 45, 6, 10, 6, 14, 12, 12] }) }, { nombre: 'Rubros RG49', ws: X.hoja(rub, { anchos: [14, 55, 8] }) }],
          `plan_de_cuentas_${slug(cliente().razon)}.xlsx`);
      };
      $('#p-imp').onclick = () => pedirArchivo('.xlsx,.xls,.csv', async f => {
        try {
          const cuentas = X.importarPlan(await X.leerArchivo(f));
          const p = C.prepararPlan(cuentas);
          if (!confirm(`Se leyeron ${cuentas.length} cuentas (${p.list.filter(c => c.imputable).length} imputables, ${p.avisos.length} avisos). ¿Reemplazar el plan actual?`)) return;
          d.cuentas = cuentas; S.save(); refrescarPlan();
          const malas = CFG_LABELS.filter(([k]) => !ctaValida(cfg()[k]));
          toast(malas.length ? `Plan importado. Revise en "Clientes" las cuentas de asientos automáticos (${malas.length} no existen en el nuevo plan).` : 'Plan importado', malas.length ? 'error' : '');
          render();
        } catch (e) { toast('Error al importar: ' + e.message, 'error'); }
      });
    }
  };

  /* ================= COMPRAS / VENTAS ================= */
  function vistaComprobantes(tipo) {
    const esCompra = tipo === 'compras';
    const lista = () => datos()[tipo];
    const delMes = () => lista().filter(x => x.fecha && x.fecha.slice(0, 7) === st.periodo)
      .sort((a, b) => (a.fecha + a.numero).localeCompare(b.fecha + b.numero));
    const ultimo = () => { const l = lista(); return l.length ? l[l.length - 1] : null; };

    function filaForm(doc) {
      const u = ultimo() || {};
      const base = doc || {
        fecha: (u.fecha && u.fecha.slice(0, 7) === st.periodo) ? u.fecha : (st.periodo === hoy().slice(0, 7) ? hoy() : st.periodo + '-01'),
        tipoDoc: 'FACTURA', condicion: 'CONTADO', afectacion: 'GRAVADA',
        timbrado: esCompra ? '' : (u.timbrado || ''), numero: esCompra ? '' : C.siguienteNumero(u.numero || '')
      };
      return `<tr class="entrada">
        <td><input type="date" id="q-fecha" value="${esc(base.fecha)}"></td>
        <td><select id="q-tipo">${Object.entries(TIPOS_DOC).filter(([k]) => esCompra || k !== 'DESPACHO').map(([k, n]) => `<option value="${k}" ${base.tipoDoc === k ? 'selected' : ''}>${n}</option>`).join('')}</select></td>
        <td><input id="q-timb" value="${esc(base.timbrado)}" size="8" maxlength="8" placeholder="Timbrado"></td>
        <td><input id="q-num" value="${esc(base.numero)}" size="15" placeholder="001-001-0000001"></td>
        <td><input id="q-ruc" value="${esc(base.ruc)}" size="11" placeholder="RUC-DV"></td>
        <td><input id="q-razon" value="${esc(base.razon)}" size="22" placeholder="Razón social"></td>
        <td><select id="q-cond"><option value="CONTADO">Contado</option><option value="CREDITO" ${base.condicion === 'CREDITO' ? 'selected' : ''}>Crédito</option></select></td>
        <td><input id="q-g10" class="n" value="${base.g10 ? fmt(base.g10) : ''}" size="11" inputmode="numeric"></td>
        <td><input id="q-g5" class="n" value="${base.g5 ? fmt(base.g5) : ''}" size="10" inputmode="numeric"></td>
        <td><input id="q-ex" class="n" value="${base.exenta ? fmt(base.exenta) : ''}" size="10" inputmode="numeric"></td>
        <td>${esCompra
          ? `<select id="q-afec"><option value="GRAVADA">Op. gravadas</option><option value="MIXTA" ${base.afectacion === 'MIXTA' ? 'selected' : ''}>Mixta (prorrateo)</option><option value="EXENTA" ${base.afectacion === 'EXENTA' ? 'selected' : ''}>Op. exentas</option></select>`
          : `<input id="q-exp" class="n" value="${base.exportacion ? fmt(base.exportacion) : ''}" size="10" inputmode="numeric">`}</td>
        <td><input id="q-cta" list="dl-cuentas" value="${esc(base.cuenta)}" size="12" placeholder="${esCompra ? esc(cfg().ctaCompras) : '(por tasa)'}"></td>
        <td><button id="q-ok" class="primary">${doc ? 'Actualizar' : 'Agregar ⏎'}</button>${doc ? ' <button id="q-cancel">Cancelar</button>' : ''}</td>
      </tr>
      <tr class="entrada-info"><td colspan="13" id="q-info"></td></tr>`;
    }

    return {
      html() {
        const docs = delMes();
        const tot = { g10: 0, iva10: 0, g5: 0, iva5: 0, ex: 0, exp: 0, total: 0 };
        const rows = docs.map(x => {
          const d = C.desglose(x), s = C.signo(x);
          tot.g10 += s * d.g10; tot.iva10 += s * d.iva10; tot.g5 += s * d.g5; tot.iva5 += s * d.iva5; tot.ex += s * d.exenta; tot.exp += s * d.exportacion; tot.total += s * d.total;
          const malaCta = x.cuenta && !ctaValida(x.cuenta);
          return `<tr class="${st.editId === x.id ? 'sel' : ''} ${C.esNC(x) ? 'nc' : ''}" data-id="${x.id}">
            <td>${fd(x.fecha)}</td><td>${TIPOS_DOC[x.tipoDoc] || x.tipoDoc}</td><td>${esc(x.timbrado)}</td><td>${esc(x.numero)}</td><td>${esc(x.ruc)}</td><td>${esc(x.razon)}</td>
            <td>${x.condicion === 'CREDITO' ? 'Crédito' : 'Contado'}</td><td class="n">${fmtZ(d.g10)}</td><td class="n">${fmtZ(d.g5)}</td><td class="n">${fmtZ(d.exenta)}</td>
            <td>${esCompra ? ({ GRAVADA: 'Gravadas', MIXTA: 'Mixta', EXENTA: 'Exentas' }[x.afectacion] || 'Gravadas') : `<span class="n">${fmtZ(d.exportacion)}</span>`}</td>
            <td class="${malaCta ? 'err' : ''}" title="${esc(nombreCta(x.cuenta))}">${esc(x.cuenta)}</td>
            <td class="acc"><span class="n">${fmt(d.iva)}</span> <button class="mini" data-ed="${x.id}" title="Editar">✎</button><button class="mini danger" data-rm="${x.id}" title="Eliminar">✕</button></td></tr>`;
        }).join('');
        return `
        <section class="card"><h2>${esCompra ? 'Compras' : 'Ventas'} – carga rápida</h2>
          <div class="acciones">
            <label>Período <input type="month" id="per" value="${st.periodo}"></label>
            <button id="x-imp">Importar Excel</button>
            <button id="x-pegar">Pegar desde Excel</button>
            <button id="x-plantilla">Descargar plantilla</button>
            <button id="x-libro">Exportar libro IVA del mes</button>
            <button id="x-libro-anio">Exportar libro IVA del año</button>
          </div>
          <div id="pegado" hidden class="pegado">
            <p class="muted">Copie las filas en Excel (en el orden de la plantilla: ${(esCompra ? X.COLS_COMPRAS : X.COLS_VENTAS).join(' · ')}) y péguelas aquí. La fila de encabezados es opcional.</p>
            <textarea id="pegado-txt" rows="6"></textarea>
            <button id="pegado-ok" class="primary">Procesar filas pegadas</button>
          </div>
          <p class="muted ayuda">Montos <b>con IVA incluido</b> tal como figuran en el comprobante; el IVA se calcula solo (10% → ÷11, 5% → ÷21). <kbd>Enter</kbd> guarda y deja lista la siguiente fila; <kbd>Esc</kbd> cancela la edición. Al cargar un RUC conocido se completan razón social${esCompra ? ', timbrado, cuenta y afectación' : ''}.</p>
          <div class="scroll"><table class="grid docs"><thead><tr><th>Fecha</th><th>Tipo</th><th>Timbrado</th><th>Número</th><th>RUC</th><th>Razón social</th><th>Cond.</th><th>Gravada 10%</th><th>Gravada 5%</th><th>Exenta</th><th>${esCompra ? 'Afectación IVA' : 'Exportación'}</th><th>Cuenta</th><th>IVA</th></tr></thead>
          <tbody>${filaForm(st.editId ? lista().find(x => x.id === st.editId) : null)}${rows}</tbody>
          <tfoot><tr><td colspan="7">${docs.length} comprobantes – Total ${fmt(tot.total)}</td><td class="n">${fmt(tot.g10)}</td><td class="n">${fmt(tot.g5)}</td><td class="n">${fmt(tot.ex)}</td><td class="n">${esCompra ? '' : fmt(tot.exp)}</td><td></td><td class="n">${fmt(tot.iva10 + tot.iva5)}</td></tr></tfoot></table></div>
        </section>`;
      },
      bind() {
        const d = datos();
        $('#per').onchange = e => { if (e.target.value) { st.periodo = e.target.value; st.editId = null; render(); } };
        const v = id => $(id) ? $(id).value : '';
        function info() {
          const doc = { g10: C.num(v('#q-g10')), g5: C.num(v('#q-g5')), exenta: C.num(v('#q-ex')), exportacion: C.num(v('#q-exp')) };
          const x = C.desglose(doc);
          const ruc = v('#q-ruc').trim();
          const okRuc = C.rucValido(ruc);
          const num = C.formatearNumeroComprobante(v('#q-num'));
          const cta = v('#q-cta').trim();
          const avisos = [];
          if (ruc && okRuc === false) avisos.push(`<span class="err">DV de RUC inválido (correcto: ${C.dvRuc(ruc.split('-')[0])})</span>`);
          if (num && !C.validarNumeroComprobante(num)) avisos.push('<span class="err">Número: formato 001-001-0000001</span>');
          if (v('#q-timb') && !/^\d{8}$/.test(v('#q-timb'))) avisos.push('<span class="err">El timbrado tiene 8 dígitos</span>');
          if (cta && !ctaValida(cta)) avisos.push('<span class="err">Cuenta inexistente o no imputable</span>');
          $('#q-info').innerHTML = `Base 10%: <b>${fmt(x.base10)}</b> · IVA 10%: <b>${fmt(x.iva10)}</b> · Base 5%: <b>${fmt(x.base5)}</b> · IVA 5%: <b>${fmt(x.iva5)}</b> · Total comprobante: <b>${fmt(x.total)}</b>`
            + (cta ? ` · Cuenta: ${esc(nombreCta(cta))}` : '') + (avisos.length ? ' · ' + avisos.join(' · ') : '');
        }
        $$('tr.entrada input, tr.entrada select').forEach(i => { i.addEventListener('input', info); });
        info();

        $('#q-ruc').addEventListener('change', () => {
          let ruc = v('#q-ruc').trim();
          if (/^\d{5,}$/.test(ruc)) { ruc = `${ruc}-${C.dvRuc(ruc)}`; $('#q-ruc').value = ruc; }
          const t = d.terceros[ruc];
          if (t) {
            if (!v('#q-razon')) $('#q-razon').value = t.razon || '';
            if (esCompra) {
              if (!v('#q-timb') && t.timbrado) $('#q-timb').value = t.timbrado;
              if (!v('#q-cta') && t.cuenta) $('#q-cta').value = t.cuenta;
              if (t.afectacion) $('#q-afec').value = t.afectacion;
            }
          }
          info();
        });
        $('#q-num').addEventListener('change', () => { $('#q-num').value = C.formatearNumeroComprobante(v('#q-num')); info(); });
        ['#q-g10', '#q-g5', '#q-ex', '#q-exp'].forEach(id => $(id) && $(id).addEventListener('blur', () => { const n = C.num(v(id)); $(id).value = n ? fmt(n) : ''; }));

        function guardarDoc() {
          const doc = {
            fecha: v('#q-fecha'), tipoDoc: v('#q-tipo'), timbrado: v('#q-timb').trim(), numero: C.formatearNumeroComprobante(v('#q-num')),
            ruc: C.normalizarRuc(v('#q-ruc')), razon: v('#q-razon').trim(), condicion: v('#q-cond'),
            g10: C.r0(C.num(v('#q-g10'))), g5: C.r0(C.num(v('#q-g5'))), exenta: C.r0(C.num(v('#q-ex'))),
            exportacion: esCompra ? 0 : C.r0(C.num(v('#q-exp'))), cuenta: v('#q-cta').trim()
          };
          if (esCompra) doc.afectacion = v('#q-afec');
          if (!doc.fecha) return toast('Ingrese la fecha', 'error');
          if (!(doc.g10 || doc.g5 || doc.exenta || doc.exportacion)) return toast('Ingrese al menos un importe', 'error');
          if (doc.cuenta && !ctaValida(doc.cuenta)) return toast('La cuenta no existe o no es imputable', 'error');
          const dup = lista().find(x => x.id !== st.editId && x.numero && x.numero === doc.numero && x.ruc === doc.ruc && x.tipoDoc === doc.tipoDoc && x.timbrado === doc.timbrado);
          if (dup && !confirm(`Ya existe ${TIPOS_DOC[dup.tipoDoc]} ${dup.numero} de ${dup.razon} (${fd(dup.fecha)}). ¿Cargar igual?`)) return;
          if (st.editId) Object.assign(lista().find(x => x.id === st.editId), doc);
          else { doc.id = S.uid(); lista().push(doc); }
          if (doc.ruc) {
            const t = d.terceros[doc.ruc] || (d.terceros[doc.ruc] = {});
            if (doc.razon) t.razon = doc.razon;
            if (esCompra) { t.timbrado = doc.timbrado; if (doc.cuenta) t.cuenta = doc.cuenta; t.afectacion = doc.afectacion; }
          }
          S.save();
          const fueEdicion = !!st.editId; st.editId = null;
          if (doc.fecha.slice(0, 7) !== st.periodo) toast(`Guardado en el período ${doc.fecha.slice(0, 7)}`);
          else toast(fueEdicion ? 'Comprobante actualizado' : 'Comprobante agregado');
          render();
          if (!fueEdicion) {
            $('#q-fecha').value = doc.fecha; $('#q-tipo').value = doc.tipoDoc; $('#q-cond').value = doc.condicion;
            if (!esCompra) { $('#q-timb').value = doc.timbrado; $('#q-num').value = C.siguienteNumero(doc.numero); }
          }
          $('#q-ruc').focus();
        }
        $('#q-ok').onclick = guardarDoc;
        $$('tr.entrada input, tr.entrada select').forEach(i => i.addEventListener('keydown', e => {
          if (e.key === 'Enter') { e.preventDefault(); if (i.id === 'q-ruc') i.dispatchEvent(new Event('change')); guardarDoc(); }
          if (e.key === 'Escape' && st.editId) { st.editId = null; render(); }
        }));
        if ($('#q-cancel')) $('#q-cancel').onclick = () => { st.editId = null; render(); };
        $$('[data-ed]').forEach(b => b.onclick = () => { st.editId = b.dataset.ed; render(); $('#q-g10').focus(); });
        $$('[data-rm]').forEach(b => b.onclick = () => {
          const x = lista().find(y => y.id === b.dataset.rm);
          if (!confirm(`¿Eliminar ${TIPOS_DOC[x.tipoDoc]} ${x.numero} de ${x.razon}?`)) return;
          d[tipo] = lista().filter(y => y.id !== x.id); S.save(); render();
        });

        function incorporar(res) {
          let dup = 0;
          res.docs.forEach(doc => {
            if (doc.numero && lista().some(x => x.numero === doc.numero && x.ruc === doc.ruc && x.tipoDoc === doc.tipoDoc && x.timbrado === doc.timbrado)) { dup++; return; }
            doc.id = S.uid();
            if (doc.ruc && !doc.razon && d.terceros[doc.ruc]) doc.razon = d.terceros[doc.ruc].razon;
            if (esCompra && !doc.cuenta && doc.ruc && d.terceros[doc.ruc]) doc.cuenta = d.terceros[doc.ruc].cuenta || '';
            if (doc.cuenta && !ctaValida(doc.cuenta)) res.errores.push(`${doc.numero}: cuenta ${doc.cuenta} inexistente (se usará la cuenta por defecto)`), doc.cuenta = '';
            lista().push(doc);
            if (doc.ruc && doc.razon) { const t = d.terceros[doc.ruc] || (d.terceros[doc.ruc] = {}); t.razon = doc.razon; if (esCompra && doc.cuenta) t.cuenta = doc.cuenta; }
          });
          S.save();
          const ok = res.docs.length - dup;
          if (res.docs[0]) st.periodo = res.docs[0].fecha.slice(0, 7);
          render();
          toast(`${ok} comprobantes importados${dup ? `, ${dup} duplicados omitidos` : ''}${res.errores.length ? `. ${res.errores.length} con problemas: ${res.errores.slice(0, 3).join('; ')}` : ''}`, res.errores.length ? 'error' : '');
        }
        $('#x-imp').onclick = () => pedirArchivo('.xlsx,.xls,.csv', async f => {
          try { incorporar(X.importarComprobantes(X.filas(await X.leerArchivo(f)), esCompra)); } catch (e) { toast('Error: ' + e.message, 'error'); }
        });
        $('#x-pegar').onclick = () => { $('#pegado').hidden = !$('#pegado').hidden; $('#pegado-txt').focus(); };
        $('#pegado-ok').onclick = () => incorporar(X.importarComprobantes(X.pegadoAFilas($('#pegado-txt').value), esCompra));
        $('#x-plantilla').onclick = () => {
          const ej = esCompra
            ? [['05/01/2026', 'Factura', '12345678', '001-001-0000123', '80000519-8', 'Proveedor S.A.', 'Contado', 1100000, 0, 0, 'Gravadas', cfg().ctaCompras, 'Mercaderías']]
            : [['05/01/2026', 'Factura', '12345678', '001-001-0000001', '80000519-8', 'Cliente S.A.', 'Crédito', 1100000, 210000, 0, 0, '', '']];
          const ayuda = [['Columna', 'Valores'], ['Tipo', 'Factura, Nota de crédito, Autofactura, Boleta' + (esCompra ? ', Despacho (importación)' : '')], ['Condición', 'Contado / Crédito'],
            ['Gravada 10% / 5%', 'Total con IVA incluido'], ...(esCompra ? [['Afectación', 'Gravadas / Mixta / Exentas (destino del crédito fiscal)']] : [['Exportación', 'Monto de exportaciones']]),
            ['Cuenta', 'Código de cuenta imputable (opcional)']];
          X.descargar([{ nombre: esCompra ? 'Compras' : 'Ventas', ws: X.hoja([esCompra ? X.COLS_COMPRAS : X.COLS_VENTAS].concat(ej), { anchos: [11, 14, 10, 17, 13, 30, 10, 14, 14, 12, 12, 14, 25] }) },
            { nombre: 'Ayuda', ws: X.hoja(ayuda, { anchos: [20, 70] }) }], `plantilla_${tipo}.xlsx`);
        };
        const libro = (desde, hasta, titulo) => {
          const docs = lista().filter(x => x.fecha >= desde && x.fecha <= hasta).sort((a, b) => (a.fecha + a.numero).localeCompare(b.fecha + b.numero));
          const head = ['Fecha', 'Tipo', 'Timbrado', 'Número', 'RUC', 'Razón social', 'Condición', 'Gravada 10%', 'Base 10%', 'IVA 10%', 'Gravada 5%', 'Base 5%', 'IVA 5%', 'Exenta', esCompra ? 'Afectación' : 'Exportación', 'Total', 'Cuenta', 'Nombre cuenta'];
          const t = new Array(head.length).fill(0);
          const filas = docs.map(x => {
            const q = C.desglose(x), s = C.signo(x);
            const r = [fd(x.fecha), TIPOS_DOC[x.tipoDoc], x.timbrado, x.numero, x.ruc, x.razon, x.condicion === 'CREDITO' ? 'Crédito' : 'Contado',
              s * q.g10, s * q.base10, s * q.iva10, s * q.g5, s * q.base5, s * q.iva5, s * q.exenta, esCompra ? (x.afectacion || 'GRAVADA') : s * q.exportacion, s * q.total, x.cuenta || '', nombreCta(x.cuenta)];
            r.forEach((val, i) => { if (typeof val === 'number') t[i] += val; });
            return r;
          });
          const tot = t.map((val, i) => i === 0 ? 'TOTALES' : (i >= 7 && i <= 15 && !(esCompra && i === 14)) ? val : '');
          const aoa = X.encabezado(cliente(), titulo, `Período: ${fd(desde)} al ${fd(hasta)}`).concat([head], filas, [tot]);
          X.descargar([{ nombre: esCompra ? 'Libro compras' : 'Libro ventas', ws: X.hoja(aoa, { anchos: [11, 14, 10, 17, 13, 30, 9, 13, 13, 12, 13, 13, 11, 12, 12, 14, 14, 30] }) }],
            `libro_${tipo}_${desde.slice(0, 7)}_${hasta.slice(0, 7)}_${slug(cliente().razon)}.xlsx`);
        };
        $('#x-libro').onclick = () => libro(st.periodo + '-01', C.finDeMes(st.periodo), `LIBRO IVA ${esCompra ? 'COMPRAS' : 'VENTAS'}`);
        $('#x-libro-anio').onclick = () => { const y = st.periodo.slice(0, 4); libro(`${y}-01-01`, `${y}-12-31`, `LIBRO IVA ${esCompra ? 'COMPRAS' : 'VENTAS'} – AÑO ${y}`); };
      }
    };
  }

  /* ================= ASIENTOS Y MAYOR ================= */
  const vistaAsientos = {
    html() {
      const d = datos();
      const ed = st.asientoEdit ? d.asientos.find(a => a.id === st.asientoEdit) : null;
      const lineas = ed ? ed.lineas.concat([{}, {}]).slice(0, Math.max(ed.lineas.length, 2)) : [{}, {}, {}, {}];
      const todos = C.todosLosAsientos(d).filter(a => a.fecha && a.fecha.slice(0, 7) === st.periodo && (st.verAuto || a.origen === 'manual'));
      return `
      <section class="card"><h2>${ed ? 'Editar asiento' : 'Nuevo asiento manual'}</h2>
        <p class="muted">Ventas y compras generan sus asientos automáticamente. Use asientos manuales para apertura, sueldos, depreciaciones, pagos, cobranzas, ajustes, etc.
        No hace falta asiento de refundición: el sistema traslada el resultado a "Resultados acumulados" al iniciar cada ejercicio.</p>
        <div class="form cols3"><label>Fecha <input type="date" id="a-fecha" value="${esc(ed ? ed.fecha : (st.periodo === hoy().slice(0, 7) ? hoy() : C.finDeMes(st.periodo)))}"></label>
          <label>Concepto <input id="a-conc" value="${esc(ed ? ed.concepto : '')}"></label>
          <label class="chk"><input type="checkbox" id="a-cierre" ${ed && ed.cierre ? 'checked' : ''}> Asiento de refundición/cierre (se excluye de balances)</label></div>
        <table class="grid asiento"><thead><tr><th>Cuenta</th><th>Nombre</th><th>Debe</th><th>Haber</th><th></th></tr></thead><tbody id="a-lineas">
          ${lineas.map(l => filaLinea(l)).join('')}
        </tbody><tfoot><tr><td colspan="2"><button id="a-add">+ línea</button> <span id="a-dif"></span></td><td class="n" id="a-td"></td><td class="n" id="a-th"></td><td></td></tr></tfoot></table>
        <div class="acciones"><button id="a-ok" class="primary">${ed ? 'Actualizar asiento' : 'Guardar asiento'}</button> ${ed ? '<button id="a-cancel">Cancelar</button>' : ''}</div>
      </section>
      <section class="card"><h2>Libro diario</h2>
        <div class="acciones"><label>Período <input type="month" id="per" value="${st.periodo}"></label>
          <label class="chk"><input type="checkbox" id="a-auto" ${st.verAuto ? 'checked' : ''}> Mostrar asientos automáticos</label>
          <button id="a-exp-mes">Exportar libro diario del mes</button> <button id="a-exp-anio">Exportar libro diario del ejercicio</button>
          <button id="a-imp">Importar asientos (Excel)</button></div>
        <div class="scroll"><table class="grid"><thead><tr><th>Fecha</th><th>Concepto</th><th>Origen</th><th>Cuenta</th><th>Nombre</th><th>Debe</th><th>Haber</th><th></th></tr></thead><tbody>
        ${todos.map(a => a.lineas.map((l, i) => `<tr class="${i === 0 ? 'first' : ''}">${i === 0 ? `<td rowspan="${a.lineas.length}">${fd(a.fecha)}</td><td rowspan="${a.lineas.length}">${esc(a.concepto)}${a.cierre ? ' <b>[cierre]</b>' : ''}</td><td rowspan="${a.lineas.length}">${a.origen}</td>` : ''}
          <td class="${ctaValida(l.cuenta) ? '' : 'err'}">${esc(l.cuenta)}</td><td>${esc(nombreCta(l.cuenta))}</td><td class="n">${fmt(l.debe || '')}</td><td class="n">${fmt(l.haber || '')}</td>
          ${i === 0 ? `<td rowspan="${a.lineas.length}">${a.origen === 'manual' ? `<button class="mini" data-aed="${a.id}">✎</button><button class="mini danger" data-arm="${a.id}">✕</button>` : ''}</td>` : ''}</tr>`).join('')).join('') || '<tr><td colspan="8" class="muted">Sin asientos en el período</td></tr>'}
        </tbody></table></div>
      </section>
      <section class="card"><h2>Libro mayor</h2>
        <div class="acciones"><label>Cuenta <input id="m-cta" list="dl-cuentas" value="${esc(st.mayorCta || '')}"></label>
          <label>Desde <input type="date" id="m-desde" value="${esc(st.mayorDesde || st.periodo.slice(0, 4) + '-01-01')}"></label>
          <label>Hasta <input type="date" id="m-hasta" value="${esc(st.mayorHasta || C.finDeMes(st.periodo))}"></label>
          <button id="m-ver">Ver</button> <button id="m-exp">Exportar</button></div>
        <div id="m-res"></div>
      </section>`;
    },
    bind() {
      const d = datos();
      $('#per').onchange = e => { if (e.target.value) { st.periodo = e.target.value; render(); } };
      $('#a-auto').onchange = e => { st.verAuto = e.target.checked; render(); };
      const totales = () => {
        let td = 0, th = 0;
        $$('#a-lineas tr').forEach(tr => { td += C.num($('.l-d', tr).value); th += C.num($('.l-h', tr).value); });
        $('#a-td').textContent = fmt(td); $('#a-th').textContent = fmt(th);
        const dif = Math.round(td - th);
        $('#a-dif').innerHTML = dif ? `<span class="err">Diferencia: ${fmt(dif)}</span>` : (td ? '<span class="ok">Balanceado ✔</span>' : '');
      };
      const bindLineas = () => {
        $$('#a-lineas tr').forEach(tr => {
          $('.l-cta', tr).oninput = () => { $('.l-nom', tr).textContent = nombreCta($('.l-cta', tr).value.trim()); };
          $$('.l-d,.l-h', tr).forEach(i => { i.oninput = totales; i.onblur = () => { const n = C.num(i.value); i.value = n ? fmt(n) : ''; }; });
          $('.l-rm', tr).onclick = () => { tr.remove(); totales(); };
        });
        totales();
      };
      bindLineas();
      $('#a-add').onclick = () => { $('#a-lineas').insertAdjacentHTML('beforeend', filaLinea({})); bindLineas(); };
      if ($('#a-cancel')) $('#a-cancel').onclick = () => { st.asientoEdit = null; render(); };
      $('#a-ok').onclick = () => {
        const a = {
          fecha: $('#a-fecha').value, concepto: $('#a-conc').value.trim(), cierre: $('#a-cierre').checked,
          lineas: $$('#a-lineas tr').map(tr => ({ cuenta: $('.l-cta', tr).value.trim(), debe: C.r0(C.num($('.l-d', tr).value)), haber: C.r0(C.num($('.l-h', tr).value)) }))
            .filter(l => l.cuenta && (l.debe || l.haber))
        };
        if (a.lineas.length < 2) return toast('El asiento necesita al menos dos líneas', 'error');
        const errs = C.validarAsiento(a, plan);
        if (errs.length) return toast(errs.join('. '), 'error');
        if (st.asientoEdit) Object.assign(d.asientos.find(x => x.id === st.asientoEdit), a);
        else { a.id = S.uid(); d.asientos.push(a); }
        st.asientoEdit = null; S.save(); toast('Asiento guardado'); render();
      };
      $$('[data-aed]').forEach(b => b.onclick = () => { st.asientoEdit = b.dataset.aed; render(); window.scrollTo(0, 0); });
      $$('[data-arm]').forEach(b => b.onclick = () => { if (confirm('¿Eliminar el asiento?')) { d.asientos = d.asientos.filter(a => a.id !== b.dataset.arm); S.save(); render(); } });

      const exportarDiario = (desde, hasta) => {
        const aoa = X.encabezado(cliente(), 'LIBRO DIARIO', `Período: ${fd(desde)} al ${fd(hasta)}`).concat([['N°', 'Fecha', 'Concepto', 'Origen', 'Cuenta', 'Nombre de la cuenta', 'Debe', 'Haber']]);
        let n = 0, td = 0, th = 0;
        C.todosLosAsientos(d).filter(a => a.fecha >= desde && a.fecha <= hasta).forEach(a => {
          n++;
          a.lineas.forEach((l, i) => { td += l.debe; th += l.haber; aoa.push([i ? '' : n, i ? '' : fd(a.fecha), i ? '' : a.concepto, i ? '' : a.origen, l.cuenta, nombreCta(l.cuenta), l.debe || '', l.haber || '']); });
        });
        aoa.push(['', '', 'TOTALES', '', '', '', td, th]);
        X.descargar([{ nombre: 'Libro diario', ws: X.hoja(aoa, { anchos: [6, 11, 40, 10, 14, 35, 15, 15] }) }], `libro_diario_${desde}_${hasta}_${slug(cliente().razon)}.xlsx`);
      };
      $('#a-exp-mes').onclick = () => exportarDiario(st.periodo + '-01', C.finDeMes(st.periodo));
      $('#a-exp-anio').onclick = () => {
        const ini = C.inicioEjercicio(C.finDeMes(st.periodo), cliente().cierreMes);
        let [y, m] = ini.split('-').map(Number); m += 11; if (m > 12) { m -= 12; y++; }
        exportarDiario(ini, C.finDeMes(`${y}-${C.pad(m)}`));
      };
      $('#a-imp').onclick = () => pedirArchivo('.xlsx,.xls,.csv', async f => {
        // Formato: N° asiento | Fecha | Concepto | Cuenta | Debe | Haber
        try {
          const filas = X.filas(await X.leerArchivo(f));
          const grupos = new Map();
          filas.forEach((r, i) => {
            const fecha = C.parseFecha(r[1]); if (!fecha || !String(r[3]).trim()) return;
            const k = String(r[0] || i);
            if (!grupos.has(k)) grupos.set(k, { fecha, concepto: String(r[2] || '').trim(), lineas: [] });
            grupos.get(k).lineas.push({ cuenta: String(r[3]).trim(), debe: C.r0(C.num(r[4])), haber: C.r0(C.num(r[5])) });
          });
          let ok = 0; const errs = [];
          grupos.forEach((a, k) => { const e = C.validarAsiento(a, plan); if (e.length) errs.push(`Asiento ${k}: ${e[0]}`); else { a.id = S.uid(); d.asientos.push(a); ok++; } });
          S.save(); render();
          toast(`${ok} asientos importados${errs.length ? `; ${errs.length} rechazados: ${errs.slice(0, 3).join('; ')}` : ''}`, errs.length ? 'error' : '');
        } catch (e) { toast('Error: ' + e.message, 'error'); }
      });

      const mayor = () => {
        const cta = $('#m-cta').value.trim(), desde = $('#m-desde').value, hasta = $('#m-hasta').value;
        st.mayorCta = cta; st.mayorDesde = desde; st.mayorHasta = hasta;
        if (!plan.by[cta]) { toast('Cuenta inexistente', 'error'); return null; }
        const esRes = ['I', 'E'].includes(plan.by[cta].tipo);
        const ini = esRes ? C.inicioEjercicio(desde, cliente().cierreMes) : '0000';
        let saldo = 0; const movs = [];
        C.todosLosAsientos(d).forEach(a => {
          if (a.cierre || a.fecha > hasta || a.fecha < ini) return;
          a.lineas.forEach(l => {
            if (l.cuenta !== cta) return;
            if (a.fecha < desde) saldo += l.debe - l.haber;
            else movs.push([a.fecha, a.concepto, a.origen, l.debe, l.haber]);
          });
        });
        const filas = [['', 'Saldo inicial', '', '', '', saldo]];
        movs.forEach(m => { saldo += m[3] - m[4]; filas.push([fd(m[0]), m[1], m[2], m[3], m[4], saldo]); });
        return { cta, desde, hasta, filas };
      };
      $('#m-ver').onclick = () => {
        const m = mayor(); if (!m) return;
        $('#m-res').innerHTML = `<h3>${esc(m.cta)} – ${esc(nombreCta(m.cta))}</h3><div class="scroll"><table class="grid"><thead><tr><th>Fecha</th><th>Concepto</th><th>Origen</th><th>Debe</th><th>Haber</th><th>Saldo</th></tr></thead><tbody>
          ${m.filas.map(f => `<tr><td>${f[0]}</td><td>${esc(f[1])}</td><td>${f[2]}</td><td class="n">${fmt(f[3])}</td><td class="n">${fmt(f[4])}</td><td class="n">${fmt(f[5])}</td></tr>`).join('')}</tbody></table></div>`;
      };
      $('#m-exp').onclick = () => {
        const m = mayor(); if (!m) return;
        const aoa = X.encabezado(cliente(), `LIBRO MAYOR – ${m.cta} ${nombreCta(m.cta)}`, `Período: ${fd(m.desde)} al ${fd(m.hasta)}`).concat([['Fecha', 'Concepto', 'Origen', 'Debe', 'Haber', 'Saldo']], m.filas);
        X.descargar([{ nombre: 'Mayor', ws: X.hoja(aoa, { anchos: [11, 45, 10, 15, 15, 16] }) }], `mayor_${m.cta}_${slug(cliente().razon)}.xlsx`);
      };
    }
  };
  function filaLinea(l) {
    return `<tr><td><input class="l-cta" list="dl-cuentas" value="${esc(l.cuenta || '')}" size="14"></td><td class="l-nom">${esc(nombreCta(l.cuenta))}</td>
      <td><input class="l-d n" value="${l.debe ? fmt(l.debe) : ''}" size="14" inputmode="numeric"></td><td><input class="l-h n" value="${l.haber ? fmt(l.haber) : ''}" size="14" inputmode="numeric"></td>
      <td><button class="mini danger l-rm" tabindex="-1">✕</button></td></tr>`;
  }

  /* ================= TIPOS DE CAMBIO ================= */
  const vistaTC = {
    html() {
      const tc = datos().tiposCambio, y = st.anioTC;
      return `<section class="card"><h2>Tipos de cambio (Gs. por US$)</h2>
        <p class="muted">Cargue el tipo de cambio de cierre de cada mes (p. ej. comprador publicado por la DNIT/BCP al último día hábil). Se usa para expresar los balances en dólares.</p>
        <div class="acciones"><label>Año <input type="number" id="tc-anio" value="${y}" style="width:6em"></label> <button id="tc-imp">Importar Excel (Período | Tipo de cambio)</button></div>
        <table class="grid" style="max-width:420px"><thead><tr><th>Mes</th><th>Gs. por US$</th></tr></thead><tbody>
        ${MESES.map((m, i) => { const k = `${y}-${C.pad(i + 1)}`; return `<tr><td>${m} ${y}</td><td><input class="n" data-tc="${k}" value="${tc[k] ? fmt2(tc[k]) : ''}"></td></tr>`; }).join('')}
        </tbody></table></section>`;
    },
    bind() {
      const d = datos();
      $('#tc-anio').onchange = e => { st.anioTC = +e.target.value; render(); };
      $$('[data-tc]').forEach(i => i.onchange = () => { const n = C.num(i.value); if (n) d.tiposCambio[i.dataset.tc] = n; else delete d.tiposCambio[i.dataset.tc]; S.save(); toast('Tipo de cambio guardado'); });
      $('#tc-imp').onclick = () => pedirArchivo('.xlsx,.xls,.csv', async f => {
        try {
          let n = 0;
          X.filas(await X.leerArchivo(f)).forEach(r => {
            let per = r[0] instanceof Date ? C.parseFecha(r[0]).slice(0, 7) : String(r[0]).trim();
            if (/^\d{1,2}[/-]\d{4}$/.test(per)) { const [m, y] = per.split(/[/-]/); per = `${y}-${C.pad(m)}`; }
            else if (C.parseFecha(per)) per = C.parseFecha(per).slice(0, 7);
            const v = C.num(r[1]);
            if (/^\d{4}-\d{2}$/.test(per) && v) { d.tiposCambio[per] = v; n++; }
          });
          S.save(); render(); toast(`${n} tipos de cambio importados`);
        } catch (e) { toast('Error: ' + e.message, 'error'); }
      });
    }
  };

  /* ================= BALANCES ================= */
  const tcDe = fecha => datos().tiposCambio[fecha.slice(0, 7)] || 0;
  const vistaBalances = {
    html() {
      return `<section class="card"><h2>Balances comparativos</h2>
        <div class="form cols4">
          <label>Fecha de corte – período anterior <input type="date" id="b-c1" value="${st.corte1}"></label>
          <label>Fecha de corte – período actual <input type="date" id="b-c2" value="${st.corte2}"></label>
          <label>T.C. período anterior (Gs/US$) <input id="b-tc1" class="n" value="${fmt2(st.tc1 || tcDe(st.corte1)) || ''}"></label>
          <label>T.C. período actual (Gs/US$) <input id="b-tc2" class="n" value="${fmt2(st.tc2 || tcDe(st.corte2)) || ''}"></label>
          <label>Nivel del balance <select id="b-niv">${[1, 2, 3, 4, 5, 6].map(n => `<option ${n === st.nivel ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        </div>
        <p class="muted">Las cuentas patrimoniales se acumulan hasta la fecha de corte; las de resultado desde el inicio del ejercicio que contiene esa fecha. Si el T.C. está vacío se toma de "Tipos de cambio" (mes de la fecha de corte).</p>
        <div class="acciones">
          <button id="b-ver4" class="primary">Ver balance por nivel</button> <button id="b-exp4">Exportar balance nivel ${st.nivel} (Gs. y US$)</button>
          <button id="b-ver49" class="primary">Ver Balance General RG 49</button> <button id="b-exp49">Exportar RG 49 (Excel)</button>
          <label class="chk"><input type="checkbox" id="b-usd" ${st.usdRG49 ? 'checked' : ''}> RG 49 con columnas en US$</label>
        </div>
        <div id="b-res"></div></section>`;
    },
    bind() {
      const leer = () => {
        st.corte1 = $('#b-c1').value; st.corte2 = $('#b-c2').value; st.nivel = +$('#b-niv').value; st.usdRG49 = $('#b-usd').checked;
        st.tc1 = C.num($('#b-tc1').value) || tcDe(st.corte1); st.tc2 = C.num($('#b-tc2').value) || tcDe(st.corte2);
      };
      ['#b-c1', '#b-c2'].forEach(id => $(id).onchange = () => { leer(); st.tc1 = tcDe(st.corte1); st.tc2 = tcDe(st.corte2); render(); });
      $('#b-niv').onchange = () => { leer(); render(); };
      const bal = () => { leer(); return C.balanceComparativo(datos(), plan, [{ hasta: st.corte1, tc: st.tc1 }, { hasta: st.corte2, tc: st.tc2 }], st.nivel); };
      const rg = () => { leer(); const a = C.todosLosAsientos(datos()); return [C.rubrosAl(datos(), plan, st.corte2, a), C.rubrosAl(datos(), plan, st.corte1, a)]; };
      const varPct = (a, b) => b ? (a - b) / Math.abs(b) : null;

      $('#b-ver4').onclick = () => {
        const b = bal();
        const avisoTC = !st.tc1 || !st.tc2 ? '<div class="alerta">Falta el tipo de cambio de alguna fecha: las columnas en US$ quedarán vacías.</div>' : '';
        $('#b-res').innerHTML = `${avisoTC}<div class="scroll"><table class="grid bal"><thead><tr><th>Código</th><th>Cuenta</th><th>Gs. ${fd(st.corte1)}</th><th>Gs. ${fd(st.corte2)}</th><th>Variación</th><th>%</th><th>US$ ${fd(st.corte1)}</th><th>US$ ${fd(st.corte2)}</th></tr></thead><tbody>
          ${b.filas.map(f => `<tr class="niv${f.nivel}"><td>${esc(f.codigo)}</td><td style="padding-left:${(f.nivel - 1) * 14 + 6}px">${esc(f.nombre)}</td><td class="n">${fmt(f.gs[0])}</td><td class="n">${fmt(f.gs[1])}</td><td class="n">${fmt(f.gs[1] - f.gs[0])}</td>
            <td class="n">${varPct(f.gs[1], f.gs[0]) === null ? '' : (varPct(f.gs[1], f.gs[0]) * 100).toFixed(1) + '%'}</td><td class="n">${fmt2(f.usd[0])}</td><td class="n">${fmt2(f.usd[1])}</td></tr>`).join('')}
          </tbody><tfoot>${totalesBal(b).map(r => `<tr><td></td><td>${r[0]}</td><td class="n">${fmt(r[1])}</td><td class="n">${fmt(r[2])}</td><td class="n">${fmt(r[2] - r[1])}</td><td></td><td class="n">${fmt2(r[3])}</td><td class="n">${fmt2(r[4])}</td></tr>`).join('')}</tfoot></table></div>`;
      };
      function totalesBal(b) {
        const usd = (v, i) => b.periodos[i].tc ? v / b.periodos[i].tc : null;
        return [['Total Activo', 'A'], ['Total Pasivo', 'P'], ['Total Patrimonio Neto', 'PN'], ['Total Ingresos', 'I'], ['Total Egresos', 'E'], ['Resultado del ejercicio', 'resultado'], ['Control: Activo − Pasivo − PN − Resultado', 'diferencia']]
          .map(([n, k]) => [n, b.totales[0][k], b.totales[1][k], usd(b.totales[0][k], 0), usd(b.totales[1][k], 1)]);
      }
      $('#b-exp4').onclick = () => {
        const b = bal();
        const head = ['Código', 'Cuenta', 'Nivel', `Gs. ${fd(st.corte1)}`, `Gs. ${fd(st.corte2)}`, 'Variación Gs.', 'Variación %', `US$ ${fd(st.corte1)}`, `US$ ${fd(st.corte2)}`, 'Variación US$'];
        const filas = b.filas.map(f => [f.codigo, '   '.repeat(f.nivel - 1) + f.nombre, f.nivel, f.gs[0], f.gs[1], f.gs[1] - f.gs[0], varPct(f.gs[1], f.gs[0]),
          f.usd[0], f.usd[1], f.usd[0] !== null && f.usd[1] !== null ? C.r2(f.usd[1] - f.usd[0]) : null]);
        const tot = totalesBal(b).map(r => ['', r[0], '', r[1], r[2], r[2] - r[1], varPct(r[2], r[1]), r[3] === null ? null : C.r2(r[3]), r[4] === null ? null : C.r2(r[4]), r[3] !== null && r[4] !== null ? C.r2(r[4] - r[3]) : null]);
        const aoa = X.encabezado(cliente(), `BALANCE COMPARATIVO – NIVEL ${st.nivel} – GUARANÍES Y DÓLARES`,
          `Cortes: ${fd(st.corte1)} y ${fd(st.corte2)} · T.C.: ${fmt2(st.tc1) || 's/d'} y ${fmt2(st.tc2) || 's/d'} Gs/US$`)
          .concat([head], filas, [[]], tot);
        X.descargar([{ nombre: `Balance nivel ${st.nivel}`, ws: X.hoja(aoa, { anchos: [14, 48, 6, 17, 17, 16, 10, 14, 14, 14], usdCols: [7, 8, 9], pctCols: [6] }) }],
          `balance_nivel${st.nivel}_${st.corte1}_${st.corte2}_${slug(cliente().razon)}.xlsx`);
      };

      $('#b-ver49').onclick = () => {
        const [act, ant] = rg();
        const usd = st.usdRG49;
        const cols = (fa, fb) => `<td class="n">${fmt(fa)}</td><td class="n">${fmt(fb)}</td>${usd ? `<td class="n">${st.tc2 ? fmt2(fa / st.tc2) : ''}</td><td class="n">${st.tc1 ? fmt2(fb / st.tc1) : ''}</td>` : ''}`;
        const head = `<tr><th>Concepto</th><th>${fd(st.corte2)}</th><th>${fd(st.corte1)}</th>${usd ? `<th>US$ ${fd(st.corte2)}</th><th>US$ ${fd(st.corte1)}</th>` : ''}</tr>`;
        const bg = C.estructuraRG49().map(f => f.tipo === 'rubro' ? `<tr><td class="ind">${esc(f.nombre)}</td>${cols(act.rubros[f.key], ant.rubros[f.key])}</tr>`
          : f.val ? `<tr class="${f.tipo}"><td>${f.nombre}</td>${cols(f.val(act), f.val(ant))}</tr>` : `<tr class="${f.tipo}"><td colspan="${usd ? 5 : 3}">${f.nombre}</td></tr>`).join('');
        const er = C.estructuraER().map(f => `<tr class="${f.total ? 'total' : ''}"><td class="${f.total ? '' : 'ind'}">${f.nombre}</td>${cols(f.val(act), f.val(ant))}</tr>`).join('');
        const alerta = [act, ant].filter(x => x.tot.diferencia).map(x => `El balance al ${fd(x.hasta)} no cuadra (diferencia ${fmt(x.tot.diferencia)}).`).join(' ');
        $('#b-res').innerHTML = `${alerta ? `<div class="alerta">${alerta}</div>` : ''}<h3>Balance General comparativo (RG 49/2014)</h3><table class="grid rg49">${head}${bg}</table>
          <h3>Estado de Resultados comparativo</h3><table class="grid rg49">${head}${er}</table>`;
      };
      $('#b-exp49').onclick = () => {
        const [act, ant] = rg();
        const usd = st.usdRG49;
        const enc = t => X.encabezado(cliente(), t, `Al ${fd(st.corte2)} comparativo con el ${fd(st.corte1)} – Expresado en guaraníes${usd ? ' y dólares estadounidenses' : ''}`);
        const head = ['Concepto', `Al ${fd(st.corte2)}`, `Al ${fd(st.corte1)}`, 'Variación', 'Var. %'].concat(usd ? [`US$ ${fd(st.corte2)}`, `US$ ${fd(st.corte1)}`] : []);
        const fila = (n, a, b) => [n, C.r0(a), C.r0(b), C.r0(a - b), varPct(a, b)].concat(usd ? [st.tc2 ? C.r2(a / st.tc2) : null, st.tc1 ? C.r2(b / st.tc1) : null] : []);
        const bg = C.estructuraRG49().map(f => f.tipo === 'rubro' ? fila('     ' + f.nombre, act.rubros[f.key], ant.rubros[f.key]) : f.val ? fila(f.nombre, f.val(act), f.val(ant)) : [f.nombre]);
        const er = C.estructuraER().map(f => fila(f.total ? f.nombre : '     ' + f.nombre, f.val(act), f.val(ant)));
        // Detalle por rubro para notas a los estados financieros
        const det = [['Rubro', 'Código', 'Cuenta', `Al ${fd(st.corte2)}`, `Al ${fd(st.corte1)}`]];
        PD.RUBROS_RG49.forEach(r => {
          const ctas = plan.list.filter(c => c.imputable && c.rubro === r.key && (Math.round(act.saldo[c.codigo] || 0) || Math.round(ant.saldo[c.codigo] || 0)));
          if (!ctas.length) return;
          const sg = c => r.grupo === 'ER' ? -1 : C.signoNatural(c.tipo);
          ctas.forEach(c => det.push([r.nombre, c.codigo, c.nombre, C.r0((act.saldo[c.codigo] || 0) * sg(c)), C.r0((ant.saldo[c.codigo] || 0) * sg(c))]));
        });
        const anchos = [55, 18, 18, 16, 9, 15, 15];
        const op = { anchos, usdCols: [5, 6], pctCols: [4] };
        X.descargar([
          { nombre: 'Balance General', ws: X.hoja(enc('BALANCE GENERAL COMPARATIVO (Formato RG 49/2014)').concat([head], bg), op) },
          { nombre: 'Estado de Resultados', ws: X.hoja(enc('ESTADO DE RESULTADOS COMPARATIVO (Formato RG 49/2014)').concat([head], er), op) },
          { nombre: 'Detalle por rubro', ws: X.hoja(enc('COMPOSICIÓN DE RUBROS (para notas)').concat(det), { anchos: [45, 14, 40, 17, 17] }) }
        ], `balance_RG49_${st.corte1}_${st.corte2}_${slug(cliente().razon)}.xlsx`);
      };
    }
  };

  /* ================= FORMULARIO 120 ================= */
  const vistaF120 = {
    html() {
      const d = datos();
      const ent = d.f120[st.periodo] || {};
      const f = C.f120(d, st.periodo);
      const inp = (k, n, ph) => `<label>${n}<input class="n" data-f="${k}" value="${ent[k] !== undefined && ent[k] !== '' ? fmt2(ent[k]).replace(/,00$/, '') : ''}" placeholder="${esc(ph || '0')}"></label>`;
      const rubros = { 1: 'RUBRO 1 – Operaciones del mes y débito fiscal', 2: 'RUBRO 2 – Compras y crédito fiscal', 3: 'RUBRO 3 – Liquidación del impuesto' };
      let ult = 0;
      return `<section class="card"><h2>Formulario 120 – IVA General (mensual)</h2>
        <div class="acciones"><label>Período <input type="month" id="per" value="${st.periodo}"></label>
          <button id="f-exp" class="primary">Exportar a Excel</button> <button id="f-exp-anio">Resumen anual ${st.periodo.slice(0, 4)} (Excel)</button></div>
        <h3>Datos complementarios del período</h3>
        <div class="form cols3">
          ${inp('saldoAnterior', 'Saldo a favor del período anterior', `automático: ${fmt(f.saldoAnterior)}`)}
          ${inp('retenciones', 'Retenciones de IVA recibidas')}
          ${inp('percepciones', 'Percepciones de IVA')}
          ${inp('otrosCreditos', 'Otros créditos / pagos previos')}
          ${inp('coeficiente', 'Coeficiente de prorrateo % (vacío = automático)', `${(f.coeficiente * 100).toFixed(2)}`)}
        </div>
        <p class="muted">El saldo a favor se arrastra automáticamente del mes anterior. Los importes salen de los libros de compras y ventas del período.
        <b>Verifique el número de casilla de cada concepto en el formulario vigente del sistema Marangatu antes de transcribir.</b></p>
        <table class="grid f120"><thead><tr><th>Concepto</th><th>Monto imponible</th><th>Impuesto</th></tr></thead><tbody>
        ${f.lineas.map(l => { const h = l.rubro !== ult ? `<tr class="titulo"><td colspan="3">${rubros[l.rubro]}</td></tr>` : ''; ult = l.rubro;
          return h + `<tr class="${l.total ? 'total' : ''} ${l.info ? 'info' : ''}"><td>${esc(l.concepto)}</td><td class="n">${l.base === null ? '' : fmt(l.base)}</td><td class="n">${l.impuesto === null ? '' : fmt(l.impuesto)}</td></tr>`; }).join('')}
        </tbody></table>
        <div class="resultado ${f.impuestoAIngresar ? 'pagar' : 'favor'}">${f.impuestoAIngresar ? `Impuesto a ingresar: <b>Gs. ${fmt(f.impuestoAIngresar)}</b>` : `Saldo a favor del contribuyente: <b>Gs. ${fmt(f.saldoFavorSiguiente)}</b>`}</div>
      </section>`;
    },
    bind() {
      const d = datos();
      $('#per').onchange = e => { if (e.target.value) { st.periodo = e.target.value; render(); } };
      $$('[data-f]').forEach(i => i.onchange = () => {
        const e = d.f120[st.periodo] || (d.f120[st.periodo] = {});
        if (i.value.trim() === '') delete e[i.dataset.f]; else e[i.dataset.f] = C.num(i.value);
        S.save(); render();
      });
      const hojaF120 = f => [['Rubro', 'Concepto', 'Monto imponible', 'Impuesto']].concat(f.lineas.map(l => [l.rubro, l.concepto, l.base, l.impuesto]));
      $('#f-exp').onclick = () => {
        const f = C.f120(d, st.periodo);
        const aoa = X.encabezado(cliente(), `FORMULARIO 120 – IVA GENERAL – PERÍODO ${st.periodo.slice(5)}/${st.periodo.slice(0, 4)}`, 'Preliquidación (verificar casillas en Marangatu)').concat(hojaF120(f));
        const det = (lista, nombre) => [['Fecha', 'Tipo', 'Número', 'RUC', 'Razón social', 'Base 10%', 'IVA 10%', 'Base 5%', 'IVA 5%', 'Exenta', nombre]].concat(
          lista.filter(x => x.fecha.slice(0, 7) === st.periodo).map(x => { const q = C.desglose(x), s = C.signo(x); return [fd(x.fecha), TIPOS_DOC[x.tipoDoc], x.numero, x.ruc, x.razon, s * q.base10, s * q.iva10, s * q.base5, s * q.iva5, s * q.exenta, nombre === 'Afectación' ? x.afectacion : s * q.exportacion]; }));
        X.descargar([{ nombre: 'Form 120', ws: X.hoja(aoa, { anchos: [7, 75, 18, 18] }) },
          { nombre: 'Ventas del mes', ws: X.hoja(det(d.ventas, 'Exportación'), { anchos: [11, 14, 17, 13, 30, 14, 12, 14, 12, 12, 12] }) },
          { nombre: 'Compras del mes', ws: X.hoja(det(d.compras, 'Afectación'), { anchos: [11, 14, 17, 13, 30, 14, 12, 14, 12, 12, 12] }) }],
          `form120_${st.periodo}_${slug(cliente().razon)}.xlsx`);
      };
      $('#f-exp-anio').onclick = () => {
        const y = st.periodo.slice(0, 4), memo = {};
        const fs = MESES.map((m, i) => C.f120(d, `${y}-${C.pad(i + 1)}`, null, memo));
        const head = ['Concepto'].concat(MESES.map(m => m.slice(0, 3)), ['Total']);
        const fila = (n, fn, sumar) => { const v = fs.map(fn); return [n].concat(v, sumar === false ? [''] : [v.reduce((a, b) => a + b, 0)]); };
        const aoa = X.encabezado(cliente(), `RESUMEN ANUAL IVA – ${y}`).concat([head,
          fila('Ventas gravadas 10% (base neta)', f => f.V.fac.base10 - f.V.nc.base10), fila('Ventas gravadas 5% (base neta)', f => f.V.fac.base5 - f.V.nc.base5),
          fila('Exportaciones', f => f.exportNeta), fila('Ventas exentas', f => f.exentaNeta), fila('Total ventas', f => f.ventasTotales),
          fila('Débito fiscal', f => f.debito), fila('Crédito fiscal total', f => f.cfTotal), fila('Crédito fiscal computable', f => f.cfComputable),
          fila('Coeficiente de prorrateo', f => f.coeficiente, false),
          fila('Saldo a favor período anterior', f => f.saldoAnterior, false), fila('Retenciones', f => f.retenciones), fila('Percepciones', f => f.percepciones),
          fila('Impuesto a ingresar', f => f.impuestoAIngresar), fila('Saldo a favor siguiente', f => f.saldoFavorSiguiente, false)]);
        const ws = X.hoja(aoa, { anchos: [34].concat(new Array(13).fill(14)) });
        X.descargar([{ nombre: `IVA ${y}`, ws }], `resumen_IVA_${y}_${slug(cliente().razon)}.xlsx`);
      };
    }
  };

  /* ================= FORMULARIO 500 ================= */
  const vistaF500 = {
    html() {
      const d = datos();
      const ent = d.f500[st.anio] || {};
      const f = C.f500(d, plan, st.anio);
      const inp = (k, n, ph) => `<label>${n}<input class="n" data-f="${k}" value="${ent[k] !== undefined && ent[k] !== '' ? fmt(ent[k]) : ''}" placeholder="${esc(ph || '0')}"></label>`;
      const fmtInd = i => i.valor === null ? 'n/d' : i.fmt === '%' ? (i.valor * 100).toFixed(2) + '%' : i.fmt === 'x' ? i.valor.toFixed(2) : fmt(i.valor);
      return `<section class="card"><h2>Formulario 500 – IRE Régimen General (anual)</h2>
        <div class="acciones"><label>Ejercicio que cierra en <input type="number" id="f5-anio" value="${st.anio}" style="width:6em"></label>
          <span class="muted">Del ${fd(f.desde)} al ${fd(f.hasta)}</span> <button id="f5-exp" class="primary">Exportar a Excel</button></div>
        <h3>Datos complementarios</h3>
        <div class="form cols4">
          ${inp('quebrantoAnterior', 'Quebranto fiscal de ejercicios anteriores (últimos 5)')}
          ${inp('saldoFavorAnterior', 'Saldo a favor del ejercicio anterior')}
          ${inp('anticipos', 'Anticipos ingresados', `de la cuenta: ${fmt(f.anticipos)}`)}
          ${inp('retenciones', 'Retenciones de IRE sufridas', `de la cuenta: ${fmt(f.retenciones)}`)}
          ${inp('donaciones', 'Donaciones del ejercicio', `de la cuenta: ${fmt(f.donaciones)}`)}
          ${inp('difDepreciacion', 'Exceso depreciación contable sobre fiscal (+/−)')}
          ${inp('ajustesMas', 'Otros ajustes que aumentan la renta')}
          ${inp('ajustesMenos', 'Otros ajustes que disminuyen la renta')}
        </div>
        <p class="muted">Gastos no deducibles e ingresos no gravados se toman de las cuentas marcadas ND/NG en el plan de cuentas. Parámetros: tasa ${f.cfg.tasaIRE}%, límite de quebrantos ${f.cfg.limiteQuebrantoPct}%, donaciones ${f.cfg.limiteDonacionesPct}%, anticipos ${f.cfg.cantAnticipos} × ${f.cfg.pctAnticipo}% (editable en Clientes).
        <b>Verifique los números de casilla en el formulario vigente de Marangatu.</b></p>
        ${f.controles.length ? `<div class="alerta"><b>Controles:</b><ul>${f.controles.map(c => `<li>${esc(c)}</li>`).join('')}</ul></div>` : '<div class="okbox">Controles de consistencia: sin observaciones.</div>'}
        <table class="grid f120"><thead><tr><th>Concepto</th><th>Importe (Gs.)</th></tr></thead><tbody>
        ${f.lineas.map(l => l.estilo === 'titulo' ? `<tr class="titulo"><td colspan="2">RUBRO ${l.rubro} – ${esc(l.concepto)}</td></tr>`
          : `<tr class="${l.estilo}"><td>${esc(l.concepto)}</td><td class="n">${fmt(l.monto)}</td></tr>`).join('')}
        </tbody></table>
        <div class="resultado ${f.neto > 0 ? 'pagar' : 'favor'}">${f.neto > 0 ? `IRE a ingresar: <b>Gs. ${fmt(f.neto)}</b>` : `Saldo a favor: <b>Gs. ${fmt(-f.neto)}</b>`} · Anticipo por cuota ejercicio siguiente: <b>Gs. ${fmt(f.anticipo)}</b></div>
        <h3>Indicadores financieros y fiscales</h3>
        <table class="grid" style="max-width:720px"><tbody>${f.indicadores.map(i => `<tr><td>${esc(i.nombre)}</td><td class="n">${fmtInd(i)}</td></tr>`).join('')}</tbody></table>
      </section>`;
    },
    bind() {
      const d = datos();
      $('#f5-anio').onchange = e => { st.anio = +e.target.value; render(); };
      $$('[data-f]').forEach(i => i.onchange = () => {
        const e = d.f500[st.anio] || (d.f500[st.anio] = {});
        if (i.value.trim() === '') delete e[i.dataset.f]; else e[i.dataset.f] = C.num(i.value);
        S.save(); render();
      });
      $('#f5-exp').onclick = () => {
        const f = C.f500(d, plan, st.anio);
        const aoa = X.encabezado(cliente(), `FORMULARIO 500 – IRE RÉGIMEN GENERAL – EJERCICIO ${st.anio}`, `Del ${fd(f.desde)} al ${fd(f.hasta)} – Preliquidación (verificar casillas en Marangatu)`)
          .concat([['Rubro', 'Concepto', 'Importe Gs.']], f.lineas.map(l => l.estilo === 'titulo' ? [`RUBRO ${l.rubro}`, l.concepto, ''] : [l.rubro, l.concepto, l.monto]));
        if (f.controles.length) aoa.push([], ['', 'CONTROLES'], ...f.controles.map(c => ['', c]));
        const ind = X.encabezado(cliente(), `INDICADORES – EJERCICIO ${st.anio}`).concat([['Indicador', 'Valor']],
          f.indicadores.map(i => [i.nombre, i.valor === null ? 'n/d' : i.fmt === 'x' ? Math.round(i.valor * 100) / 100 : i.valor]));
        const wsInd = X.hoja(ind, { anchos: [60, 18] });
        // formato porcentaje para indicadores en %
        f.indicadores.forEach((i, k) => { const cell = wsInd[XLSX.utils.encode_cell({ r: k + 5, c: 1 })]; if (cell && cell.t === 'n') cell.z = i.fmt === '%' ? '0.00%' : i.fmt === 'x' ? '0.00' : '#,##0'; });
        const cfgS = [['Parámetro', 'Valor'], ['Tasa IRE %', f.cfg.tasaIRE], ['Límite quebrantos % renta neta', f.cfg.limiteQuebrantoPct], ['Límite donaciones % renta neta', f.cfg.limiteDonacionesPct], ['Anticipos', `${f.cfg.cantAnticipos} × ${f.cfg.pctAnticipo}%`]];
        X.descargar([{ nombre: 'Form 500', ws: X.hoja(aoa, { anchos: [10, 80, 20] }) }, { nombre: 'Indicadores', ws: wsInd }, { nombre: 'Parámetros', ws: X.hoja(cfgS, { anchos: [35, 15] }) }],
          `form500_${st.anio}_${slug(cliente().razon)}.xlsx`);
      };
    }
  };

  const VISTAS = {
    clientes: vistaClientes, plan: vistaPlan, ventas: vistaComprobantes('ventas'), compras: vistaComprobantes('compras'),
    asientos: vistaAsientos, tc: vistaTC, balances: vistaBalances, f120: vistaF120, f500: vistaF500
  };

  /* ---------- inicio ---------- */
  S.load();
  refrescarPlan();
  if (S.cliente()) st.tab = 'ventas';
  $('#tabs').addEventListener('click', e => { const b = e.target.closest('button[data-tab]'); if (b && !b.disabled) { st.tab = b.dataset.tab; st.editId = null; render(); } });
  $('#selCliente').onchange = e => { if (e.target.value) { S.db().activo = e.target.value; S.save(); refrescarPlan(); st.editId = null; st.asientoEdit = null; render(); } };
  render();
})();
