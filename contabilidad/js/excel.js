/* Importación y exportación Excel (SheetJS). */
(function (root) {
  'use strict';
  const X = {};
  const C = root.Conta;

  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9%]/g, '');

  X.leerArchivo = function (file) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = e => {
        try { resolve(XLSX.read(new Uint8Array(e.target.result), { type: 'array', cellDates: true })); }
        catch (err) { reject(err); }
      };
      fr.onerror = reject;
      fr.readAsArrayBuffer(file);
    });
  };
  X.filas = (wb, hoja) => XLSX.utils.sheet_to_json(wb.Sheets[hoja || wb.SheetNames[0]], { header: 1, raw: true, defval: '' });

  // Busca la fila de encabezados y mapea columnas según alias.
  function mapear(filas, alias) {
    for (let r = 0; r < Math.min(filas.length, 15); r++) {
      const h = filas[r].map(norm);
      const map = {};
      Object.keys(alias).forEach(k => {
        const i = h.findIndex(x => alias[k].some(a => x === a || (a.length > 3 && x.startsWith(a))));
        if (i >= 0) map[k] = i;
      });
      if (Object.keys(map).length >= 2) return { map, desde: r + 1 };
    }
    return null;
  }
  const siNo = v => /^(s|si|x|1|true|verdadero)$/i.test(norm(v));

  /* ---------- Plan de cuentas ---------- */
  const ALIAS_PLAN = {
    codigo: ['codigo', 'cod', 'cuenta', 'nrocuenta', 'numerocuenta', 'codcuenta'],
    nombre: ['nombre', 'descripcion', 'denominacion', 'nombrecuenta', 'detalle'],
    nivel: ['nivel'],
    imputable: ['imputable', 'asentable', 'imp'],
    tipo: ['tipo', 'naturaleza'],
    rg49: ['rubrorg49', 'rg49', 'rubro'],
    noDeducible: ['nodeducible', 'nodeducibleire', 'nd'],
    noGravado: ['nogravado', 'nogravadoire', 'ng'],
    me: ['monedaextranjera', 'me']
  };
  X.importarPlan = function (wb) {
    const filas = X.filas(wb);
    const m = mapear(filas, ALIAS_PLAN);
    if (m && m.map.nombre === undefined) { // "Código | Cuenta": la columna Cuenta es el nombre
      const i = filas[m.desde - 1].map(norm).findIndex((x, j) => x === 'cuenta' && j !== m.map.codigo);
      if (i >= 0) m.map.nombre = i;
    }
    if (!m || m.map.codigo === undefined || m.map.nombre === undefined) throw new Error('No se encontraron las columnas "Código" y "Nombre" en la primera hoja.');
    const claves = new Set(root.PlanDefault.RUBROS_RG49.map(r => r.key));
    const out = [];
    for (let r = m.desde; r < filas.length; r++) {
      const f = filas[r], g = k => m.map[k] !== undefined ? f[m.map[k]] : '';
      const codigo = String(g('codigo')).trim();
      if (!codigo) continue;
      const rg = String(g('rg49')).trim().toUpperCase();
      const tipo = String(g('tipo')).trim().toUpperCase();
      out.push({
        codigo, nombre: String(g('nombre')).trim(),
        nivel: g('nivel') ? +g('nivel') : undefined,
        imputable: m.map.imputable !== undefined ? siNo(g('imputable')) : undefined,
        tipo: /^(A|P|PN|I|E)$/.test(tipo) ? tipo : undefined,
        rg49: claves.has(rg) ? rg : '',
        noDeducible: siNo(g('noDeducible')), noGravado: siNo(g('noGravado')), me: siNo(g('me'))
      });
    }
    if (!out.length) throw new Error('El archivo no contiene cuentas.');
    return out;
  };

  /* ---------- Comprobantes ---------- */
  X.COLS_VENTAS = ['Fecha', 'Tipo', 'Timbrado', 'Número', 'RUC', 'Razón social', 'Condición', 'Gravada 10% (IVA incl.)', 'Gravada 5% (IVA incl.)', 'Exenta', 'Exportación', 'Cuenta', 'Concepto', 'Electrónico (S/N)', 'Comprobante asociado', 'Timbrado asociado'];
  X.COLS_COMPRAS = ['Fecha', 'Tipo', 'Timbrado', 'Número', 'RUC', 'Razón social', 'Condición', 'Gravada 10% (IVA incl.)', 'Gravada 5% (IVA incl.)', 'Exenta', 'Afectación', 'Cuenta', 'Concepto', 'Electrónico (S/N)', 'Comprobante asociado', 'Timbrado asociado'];
  const ALIAS_DOC = {
    fecha: ['fecha', 'fechaemision', 'fechadeemision', 'fechaemisioncomprobante'], tipoDoc: ['tipo', 'tipocomprobante', 'tipodoc'], timbrado: ['timbrado'],
    numero: ['numero', 'nro', 'nrocomprobante', 'numerocomprobante', 'numerodecomprobante', 'nrodecomprobante', 'comprobante'],
    ruc: ['ruc', 'rucci', 'documento', 'rucemisor', 'rucproveedor', 'ruccliente', 'rucreceptor', 'numerodeidentificacion', 'nroidentificacion'], razon: ['razonsocial', 'razon', 'nombre', 'proveedor', 'cliente', 'nombreorazonsocial', 'razonsocialemisor', 'razonsocialreceptor'],
    condicion: ['condicion', 'condicionventa', 'condicioncompra'],
    g10: ['gravada10', 'gravada10%', 'gravada10%ivaincl', 'gravadas10', 'monto10', '10%', 'montogravado10', 'montogravado10%', 'gravado10', 'gravado10%', 'totalgravado10'],
    g5: ['gravada5', 'gravada5%', 'gravada5%ivaincl', 'gravadas5', 'monto5', '5%', 'montogravado5', 'montogravado5%', 'gravado5', 'gravado5%', 'totalgravado5'],
    exenta: ['exenta', 'exentas', 'nogravada', 'montoexento', 'exento', 'montonogravadooexento', 'nogravadooexento', 'montoexentonogravado'], exportacion: ['exportacion', 'exportaciones'],
    afectacion: ['afectacion', 'imputacioniva'], electronico: ['electronico', 'electronica', 'electronicovirtual'],
    asocNumero: ['comprobanteasociado', 'nroasociado', 'asociado'], asocTimbrado: ['timbradoasociado'], clase: ['clase', 'claseoperacion'], cdc: ['cdc', 'codigodecontrol'], moneda: ['moneda'], tc: ['tipodecambio', 'tc', 'cotizacion'], cuenta: ['cuenta', 'codcuenta', 'cuentacontable'], concepto: ['concepto', 'descripcion', 'detalle']
  };
  X.tipoDoc = function (v) {
    const s = norm(v);
    if (!s || s.startsWith('fac')) return 'FACTURA';
    if (s.startsWith('nc') || s.includes('credito')) return 'NOTA_CREDITO';
    if (s.startsWith('desp') || s.includes('import')) return 'DESPACHO';
    if (s.startsWith('auto')) return 'AUTOFACTURA';
    if (s.startsWith('bol')) return 'BOLETA';
    return 'FACTURA';
  };
  X.condicion = v => /^cr/i.test(norm(v)) ? 'CREDITO' : 'CONTADO';
  X.afectacion = v => { const s = norm(v); return s.startsWith('ex') ? 'EXENTA' : (s.startsWith('mix') || s.startsWith('ind') || s.startsWith('pro')) ? 'MIXTA' : 'GRAVADA'; };

  function filaADoc(get, esCompra) {
    return {
      fecha: C.parseFecha(get('fecha')), tipoDoc: X.tipoDoc(get('tipoDoc')),
      timbrado: String(get('timbrado') || '').trim(), numero: C.formatearNumeroComprobante(get('numero')),
      ruc: C.normalizarRuc(get('ruc')), razon: String(get('razon') || '').trim(),
      condicion: X.condicion(get('condicion')),
      g10: C.r0(get('g10')), g5: C.r0(get('g5')), exenta: C.r0(get('exenta')),
      exportacion: esCompra ? 0 : C.r0(get('exportacion')),
      afectacion: esCompra ? X.afectacion(get('afectacion')) : undefined,
      cuenta: String(get('cuenta') || '').trim(), concepto: String(get('concepto') || '').trim(),
      electronico: siNo(get('electronico')) || !!String(get('cdc') || '').trim() || undefined,
      cdc: String(get('cdc') || '').replace(/\D/g, '') || undefined,
      moneda: /usd|dolar|us\$/i.test(String(get('moneda'))) ? 'USD' : undefined, tc: C.num(get('tc')) || undefined,
      clase: /^agr/i.test(norm(get('clase'))) ? 'AGRO' : /^fle/i.test(norm(get('clase'))) ? 'FLETE' : undefined,
      asocNumero: get('asocNumero') ? C.formatearNumeroComprobante(get('asocNumero')) : undefined,
      asocTimbrado: get('asocTimbrado') ? String(get('asocTimbrado')).trim() : undefined
    };
  }
  X.importarComprobantes = function (filas, esCompra) {
    let m = mapear(filas, ALIAS_DOC);
    if (!m || m.map.fecha === undefined) { // sin encabezado: orden de la plantilla
      const cols = esCompra
        ? ['fecha', 'tipoDoc', 'timbrado', 'numero', 'ruc', 'razon', 'condicion', 'g10', 'g5', 'exenta', 'afectacion', 'cuenta', 'concepto', 'electronico', 'asocNumero', 'asocTimbrado']
        : ['fecha', 'tipoDoc', 'timbrado', 'numero', 'ruc', 'razon', 'condicion', 'g10', 'g5', 'exenta', 'exportacion', 'cuenta', 'concepto', 'electronico', 'asocNumero', 'asocTimbrado'];
      m = { map: {}, desde: 0 }; cols.forEach((k, i) => { m.map[k] = i; });
    }
    const docs = [], errores = [];
    for (let r = m.desde; r < filas.length; r++) {
      const f = filas[r];
      if (!f || f.every(x => x === '' || x === null || x === undefined)) continue;
      const get = k => m.map[k] !== undefined ? f[m.map[k]] : '';
      const d = filaADoc(get, esCompra);
      if (!d.fecha) { errores.push(`Fila ${r + 1}: fecha inválida`); continue; }
      if (!(d.g10 || d.g5 || d.exenta || d.exportacion)) { errores.push(`Fila ${r + 1}: sin importes`); continue; }
      docs.push(d);
    }
    return { docs, errores };
  };
  X.pegadoAFilas = txt => txt.replace(/\r/g, '').split('\n').filter(l => l.trim()).map(l => l.split('\t'));

  /* ---------- Exportación ---------- */
  const FMT_GS = '#,##0;[Red](#,##0);"-"';
  const FMT_USD = '#,##0.00;[Red](#,##0.00);"-"';
  // aoa: matriz de valores; opts.usdCols: índices de columnas en USD; opts.pctCols
  X.hoja = function (aoa, opts) {
    opts = opts || {};
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
    for (let R = range.s.r; R <= range.e.r; R++) for (let Ci = range.s.c; Ci <= range.e.c; Ci++) {
      const cell = ws[XLSX.utils.encode_cell({ r: R, c: Ci })];
      if (cell && cell.t === 'n') {
        if (Object.is(cell.v, -0)) cell.v = 0;
        cell.z = (opts.pctCols || []).includes(Ci) ? '0.00%' : (opts.usdCols || []).includes(Ci) ? FMT_USD : FMT_GS;
      }
    }
    ws['!cols'] = (opts.anchos || []).map(w => ({ wch: w }));
    if (opts.merges) ws['!merges'] = opts.merges;
    return ws;
  };
  X.descargar = function (hojas, nombre) {
    const wb = XLSX.utils.book_new();
    hojas.forEach(h => XLSX.utils.book_append_sheet(wb, h.ws, h.nombre.slice(0, 31)));
    XLSX.writeFile(wb, nombre);
  };
  X.encabezado = (cli, titulo, extra) => [
    [cli.razon || ''], [`RUC: ${cli.ruc || ''}`], [titulo], ...(extra ? [[extra]] : []), []
  ];

  /* ---------- ZIP (método "store", sin compresión) ---------- */
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = b => { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  // archivos: [{nombre, texto}] -> Uint8Array con el ZIP
  X.zip = function (archivos) {
    const enc = new TextEncoder(), partes = [], central = [];
    let off = 0;
    const d = new Date();
    const hora = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    const fecha = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    archivos.forEach(a => {
      const nom = enc.encode(a.nombre), dat = enc.encode(a.texto), crc = crc32(dat);
      const lh = new DataView(new ArrayBuffer(30));
      [[0, 0x04034b50, 4], [4, 20, 2], [6, 0x0800, 2], [8, 0, 2], [10, hora, 2], [12, fecha, 2], [14, crc, 4], [18, dat.length, 4], [22, dat.length, 4], [26, nom.length, 2], [28, 0, 2]]
        .forEach(([o, v, n]) => n === 4 ? lh.setUint32(o, v, true) : lh.setUint16(o, v, true));
      const ch = new DataView(new ArrayBuffer(46));
      [[0, 0x02014b50, 4], [4, 20, 2], [6, 20, 2], [8, 0x0800, 2], [10, 0, 2], [12, hora, 2], [14, fecha, 2], [16, crc, 4], [20, dat.length, 4], [24, dat.length, 4], [28, nom.length, 2], [30, 0, 2], [32, 0, 2], [34, 0, 2], [36, 0, 2], [38, 0, 4], [42, off, 4]]
        .forEach(([o, v, n]) => n === 4 ? ch.setUint32(o, v, true) : ch.setUint16(o, v, true));
      partes.push(new Uint8Array(lh.buffer), nom, dat);
      central.push(new Uint8Array(ch.buffer), nom);
      off += 30 + nom.length + dat.length;
    });
    const tamC = central.reduce((t, p) => t + p.length, 0);
    const fin = new DataView(new ArrayBuffer(22));
    [[0, 0x06054b50, 4], [4, 0, 2], [6, 0, 2], [8, archivos.length, 2], [10, archivos.length, 2], [12, tamC, 4], [16, off, 4], [20, 0, 2]]
      .forEach(([o, v, n]) => n === 4 ? fin.setUint32(o, v, true) : fin.setUint16(o, v, true));
    const todo = partes.concat(central, [new Uint8Array(fin.buffer)]);
    const out = new Uint8Array(todo.reduce((t, p) => t + p.length, 0));
    let i = 0; todo.forEach(p => { out.set(p, i); i += p.length; });
    return out;
  };
  X.bajarBlob = function (bytes, nombre, tipo) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([bytes], { type: tipo }));
    a.download = nombre; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  };

  root.ExcelIO = X;
})(window);
