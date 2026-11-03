/* Motor de reportes: un mismo documento se descarga como Excel con formato (ExcelJS) o como PDF (jsPDF + autotable).
 *
 * Documento: { titulo, subtitulo, orientacion, identificacion: [[etiqueta, valor], ...], bloques: [...], hojas: [documentos] }
 * Bloques:  { tipo: 'tabla', titulo, columnas: [{ t, w, tipo: 'texto'|'gs'|'usd'|'pct'|'entero' }], filas: [{ v: [...], estilo, nivel }] }
 *           { tipo: 'texto', titulo, parrafos: [...] }   { tipo: 'firmas' }
 * Estilos de fila: '' | 'titulo' | 'seccion' | 'subtotal' | 'total' | 'gran' | 'nota' */
(function (root) {
  'use strict';
  const R = {};
  const COLOR = { primario: '1F6F5C', oscuro: '17594A', claro: 'E8F1EE', total: 'D9EAE4', zebra: 'F7F9FA', borde: 'D5DCE2', texto: '1D2733', gris: '66727F' };
  const rgb = h => [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  const hoyTxt = () => new Date().toLocaleDateString('es-PY', { day: '2-digit', month: '2-digit', year: 'numeric' });

  /* ---------- formato de valores ---------- */
  R.fmtValor = function (v, tipo) {
    if (v === null || v === undefined || v === '') return '';
    if (typeof v !== 'number') return String(v);
    if (tipo === 'pct') return (v * 100).toLocaleString('es-PY', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%';
    if (tipo === 'entero') return String(Math.round(v));
    const dec = tipo === 'usd' ? 2 : 0;
    const r = Math.abs(v) < (dec ? 0.005 : 0.5) ? 0 : v;
    if (!r) return '-';
    const s = Math.abs(r).toLocaleString('es-PY', { minimumFractionDigits: dec, maximumFractionDigits: dec });
    return r < 0 ? `(${s})` : s;
  };
  const NUMFMT = { gs: '#,##0;(#,##0);"-"', usd: '#,##0.00;(#,##0.00);"-"', pct: '0.00%', entero: '0' };
  // jsPDF con fuentes estándar solo admite Latin-1: reemplazar caracteres especiales
  const pdfTxt = s => String(s === null || s === undefined ? '' : s).replace(/[−–—]/g, '-').replace(/›/g, '>').replace(/₲/g, 'Gs.').replace(/…/g, '...').replace(/[✔✓]/g, 'Si').replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[^\x00-\xFF]/g, '');

  /* ---------- identificación del cliente ---------- */
  R.identificacion = function (cli, extras) {
    const out = [['Contribuyente', cli.razon || ''], ['RUC', cli.ruc || '']];
    (extras || []).forEach(x => out.push(x));
    return out;
  };

  /* ======================= EXCEL (ExcelJS) ======================= */
  async function aExcel(doc, archivo) {
    if (!root.ExcelJS) throw new Error('No se cargó la librería de Excel');
    const wb = new root.ExcelJS.Workbook();
    wb.creator = 'ContaPY'; wb.created = new Date();
    const hojas = doc.hojas && doc.hojas.length ? doc.hojas : [doc];
    const usados = new Set();
    hojas.forEach((h, i) => { const hh = Object.assign({ identificacion: doc.identificacion, cliente: doc.cliente }, h); if (hh.formulario) formularioExcel(wb, hh, usados, i); else hojaExcel(wb, hh, usados, i); });
    const buf = await wb.xlsx.writeBuffer();
    bajar(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), archivo.replace(/\.(xlsx|pdf)$/i, '') + '.xlsx');
  }
  function nombreHoja(n, usados) {
    let s = String(n || 'Hoja').replace(/[\\/?*[\]:]/g, ' ').slice(0, 31).trim() || 'Hoja', k = 2;
    while (usados.has(s.toLowerCase())) s = s.slice(0, 28) + ' ' + k++;
    usados.add(s.toLowerCase()); return s;
  }
  function hojaExcel(wb, h, usados, idx) {
    const tablas = (h.bloques || []).filter(b => b.tipo === 'tabla');
    const ncols = Math.max(2, ...tablas.map(t => t.columnas.length));
    const anchos = new Array(ncols).fill(0).map((_, i) => Math.max(...tablas.map(t => (t.columnas[i] || {}).w || 0), 10));
    const vertical = (h.orientacion || (anchos.reduce((a, b) => a + b, 0) > 110 ? 'landscape' : 'portrait'));
    const ws = wb.addWorksheet(nombreHoja(h.nombreHoja || h.titulo || ('Hoja ' + (idx + 1)), usados), {
      pageSetup: { paperSize: 9, orientation: vertical, fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.4, right: 0.4, top: 0.55, bottom: 0.6, header: 0.25, footer: 0.3 } },
      views: [{ showGridLines: false }]
    });
    ws.columns = anchos.map(w => ({ width: w }));
    const cli = h.cliente || {};
    ws.headerFooter.oddFooter = `&L&8&K666666${(cli.razon || '').replace(/&/g, '&&')} · RUC ${cli.ruc || ''}&C&8&K666666Generado con ContaPY el ${hoyTxt()}&R&8&K666666Página &P de &N`;
    const borde = { style: 'thin', color: { argb: 'FF' + COLOR.borde } };
    const fill = hex => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + hex } });
    let r = 1;
    const fila = (valor, estilo, alto) => {
      ws.mergeCells(r, 1, r, ncols);
      const c = ws.getCell(r, 1); c.value = valor; Object.assign(c, estilo);
      if (alto) ws.getRow(r).height = alto;
      r++;
    };
    // Encabezado
    fila(cli.razon || h.titulo || '', { font: { bold: true, size: 15, color: { argb: 'FFFFFFFF' } }, fill: fill(COLOR.primario), alignment: { vertical: 'middle', indent: 1 } }, 26);
    const ident = (h.identificacion || []).map(([k, v]) => `${k}: ${v}`).join('     ');
    if (ident) fila(ident, { font: { size: 9, color: { argb: 'FFFFFFFF' } }, fill: fill(COLOR.oscuro), alignment: { vertical: 'middle', indent: 1, wrapText: true } }, 18);
    r++;
    fila(h.titulo || '', { font: { bold: true, size: 13, color: { argb: 'FF' + COLOR.texto } }, alignment: { indent: 0 } }, 20);
    if (h.subtitulo) fila(h.subtitulo, { font: { italic: true, size: 9, color: { argb: 'FF' + COLOR.gris } } });
    r++;
    let primeraCabecera = null;
    (h.bloques || []).forEach(b => {
      if (b.tipo === 'texto') {
        if (b.titulo) fila(b.titulo, { font: { bold: true, size: 10, color: { argb: 'FF' + COLOR.primario } } });
        (b.parrafos || []).forEach(p => { const lineas = Math.max(1, Math.ceil(String(p).length / (anchos.reduce((a, x) => a + x, 0) * 1.1))); fila(p, { font: { size: 9 }, alignment: { wrapText: true, vertical: 'top' } }, Math.min(400, 13 * lineas)); });
        r++;
        return;
      }
      if (b.tipo === 'firmas') {
        r += 3;
        const mitad = Math.max(1, Math.floor(ncols / 2));
        [[1, mitad, cli.representante || 'Representante legal', 'Representante legal'], [mitad + 1, ncols, cli.contador || 'Contador', 'Contador']].forEach(([a, z, nom, rol]) => {
          ws.mergeCells(r, a, r, z); const c = ws.getCell(r, a); c.value = nom; c.alignment = { horizontal: 'center' }; c.border = { top: { style: 'thin', color: { argb: 'FF333333' } } }; c.font = { size: 9, bold: true };
          ws.mergeCells(r + 1, a, r + 1, z); const d = ws.getCell(r + 1, a); d.value = rol; d.alignment = { horizontal: 'center' }; d.font = { size: 8, color: { argb: 'FF' + COLOR.gris } };
        });
        r += 3;
        return;
      }
      if (b.tipo !== 'tabla') return;
      if (b.titulo) fila(b.titulo, { font: { bold: true, size: 10, color: { argb: 'FF' + COLOR.primario } } });
      // cabecera
      const cab = ws.getRow(r);
      b.columnas.forEach((col, i) => {
        const c = cab.getCell(i + 1); c.value = col.t; c.font = { bold: true, size: 9, color: { argb: 'FFFFFFFF' } }; c.fill = fill(COLOR.primario);
        c.alignment = { vertical: 'middle', horizontal: col.tipo && col.tipo !== 'texto' ? 'right' : 'left', wrapText: true }; c.border = { bottom: borde };
      });
      cab.height = 30;
      if (!primeraCabecera) primeraCabecera = r;
      r++;
      let zebra = false;
      b.filas.forEach(f => {
        const row = ws.getRow(r), est = f.estilo || '';
        b.columnas.forEach((col, i) => {
          const c = row.getCell(i + 1), v = f.v[i];
          c.value = v === undefined || v === '' ? null : v;
          const num = col.tipo && col.tipo !== 'texto' && typeof v === 'number';
          if (num) c.numFmt = NUMFMT[col.tipo] || NUMFMT.gs;
          c.alignment = { vertical: 'middle', horizontal: num || (col.tipo && col.tipo !== 'texto') ? 'right' : 'left', indent: i === firstText(b) && f.nivel ? Math.min(6, f.nivel) : 0, wrapText: !num };
          c.font = { size: 9, color: { argb: 'FF' + COLOR.texto } };
          c.border = { bottom: { style: 'hair', color: { argb: 'FF' + COLOR.borde } } };
          if (est === 'titulo' || est === 'seccion') { c.font = { size: 9, bold: true, color: { argb: 'FF' + (est === 'titulo' ? 'FFFFFF' : COLOR.oscuro) } }; c.fill = fill(est === 'titulo' ? COLOR.oscuro : COLOR.claro); }
          else if (est === 'subtotal') { c.font = { size: 9, bold: true }; c.border = { top: borde, bottom: { style: 'hair', color: { argb: 'FF' + COLOR.borde } } }; }
          else if (est === 'total') { c.font = { size: 9, bold: true }; c.fill = fill(COLOR.total); c.border = { top: { style: 'thin', color: { argb: 'FF' + COLOR.primario } }, bottom: { style: 'thin', color: { argb: 'FF' + COLOR.primario } } }; }
          else if (est === 'gran') { c.font = { size: 10, bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = fill(COLOR.primario); }
          else if (est === 'nota') { c.font = { size: 8, italic: true, color: { argb: 'FF' + COLOR.gris } }; }
          else if (zebra) c.fill = fill(COLOR.zebra);
        });
        if (!est) zebra = !zebra; else zebra = false;
        r++;
      });
      r++;
    });
    if (primeraCabecera && tablas.length === 1) { ws.views = [{ state: 'frozen', ySplit: primeraCabecera, showGridLines: false }]; ws.pageSetup.printTitlesRow = `${primeraCabecera}:${primeraCabecera}`; }
  }
  const firstText = b => Math.max(0, b.columnas.findIndex(c => !c.tipo || c.tipo === 'texto'));

  /* ======================= FORMULARIOS (formato de la proforma DNIT) =======================
   * h.formulario = { numero, nombre, version, periodo, rubros: [{ titulo, cols, filas: [[inc, texto, [[casilla, valor] | null, ...], esTotal]] }] }
   * Las columnas de cada rubro se alinean a la derecha, como en la proforma oficial. */
  const fmtForm = v => typeof v === 'number' ? (Math.round(v) || 0).toLocaleString('es-PY') : (v === null || v === undefined ? '' : String(v));
  const maxCols = F => Math.max(1, ...F.rubros.map(r => r.cols.length));
  const celdasRubro = (r, max) => r.filas.map(([inc, txt, cel, tot]) => {
    const pares = (cel || []).slice();
    while (pares.length < r.cols.length) pares.push(null);
    return { inc, txt, pares, tot, off: max - r.cols.length };
  });

  function formularioPDF(pdf, h, cli, M, pie) {
    const F = h.formulario, W = pdf.internal.pageSize.getWidth(), ancho = W - 2 * M;
    let y = 24;
    // encabezado: número | contribuyente | período
    const hEnc = 50, wNum = 84, xm = M + wNum + (ancho - wNum) * 0.58;
    pdf.setDrawColor(0); pdf.setLineWidth(1.3); pdf.rect(M, y, ancho, hEnc);
    pdf.setLineWidth(0.6); pdf.line(M + wNum, y, M + wNum, y + hEnc); pdf.line(xm, y, xm, y + hEnc);
    pdf.setTextColor(0); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(24);
    pdf.text(String(F.numero), M + wNum / 2, y + 25, { align: 'center' });
    pdf.setFontSize(6.3); pdf.setFont('helvetica', 'bold');
    pdf.splitTextToSize(pdfTxt(F.nombre || ''), wNum - 8).slice(0, 2).concat([pdfTxt(F.version || '')]).forEach((l, i) => pdf.text(l, M + wNum / 2, y + 35 + i * 7, { align: 'center' }));
    const par = (x, yy, k, v, maxW) => { pdf.setFont('helvetica', 'bold'); pdf.setFontSize(7.5); pdf.text(pdfTxt(k), x, yy); const lw = pdf.getTextWidth(pdfTxt(k)) + 3; pdf.setFont('helvetica', 'normal'); pdf.text((pdf.splitTextToSize(pdfTxt(v), maxW - lw)[0]) || '', x + lw, yy); };
    const x1 = M + wNum + 6, w1 = xm - x1 - 6;
    par(x1, y + 14, 'RUC:', cli.ruc || '', w1);
    par(x1, y + 26, 'Nombre / Razón social:', cli.razon || '', w1);
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7.5); pdf.text('01 Declaración Jurada Original', x1, y + 38);
    pdf.setFont('helvetica', 'bold'); pdf.text(pdfTxt('Período / Ejercicio fiscal'), xm + 6, y + 14);
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9); pdf.text(pdf.splitTextToSize(pdfTxt(F.periodo || ''), M + ancho - xm - 12).slice(0, 2), xm + 6, y + 28);
    y += hEnc + 8;
    const max = maxCols(F), wInc = 22, wCas = 22, wVal = 57, wTxt = ancho - wInc - max * (wCas + wVal);
    const columnStyles = { 0: { cellWidth: wInc, halign: 'center' }, 1: { cellWidth: wTxt } };
    for (let i = 0; i < max; i++) { columnStyles[2 + 2 * i] = { cellWidth: wCas, halign: 'center' }; columnStyles[3 + 2 * i] = { cellWidth: wVal, halign: 'right' }; }
    const GRIS = [242, 242, 242], VACIO = [226, 226, 226], TIT = [214, 214, 214];
    F.rubros.forEach(r => {
      const off = max - r.cols.length;
      const head = [[{ content: pdfTxt(r.titulo), colSpan: 2 + 2 * max, styles: { fillColor: TIT, halign: 'left' } }],
        [{ content: 'INC.' }, { content: '', colSpan: 1 + 2 * off }].concat(r.cols.map(c => ({ content: pdfTxt(c), colSpan: 2 })))];
      const body = celdasRubro(r, max).map(f => {
        const fila = [{ content: pdfTxt(f.inc) }, { content: pdfTxt(f.txt), colSpan: 1 + 2 * f.off }];
        f.pares.forEach(x => {
          if (!x) fila.push({ content: '', styles: { fillColor: VACIO } }, { content: '', styles: { fillColor: VACIO } });
          else fila.push({ content: x[0] === '' || x[0] === null || x[0] === undefined ? '' : String(x[0]), styles: x[0] === '' ? {} : { fillColor: GRIS, fontStyle: 'bold' } }, { content: pdfTxt(fmtForm(x[1])) });
        });
        fila._tot = f.tot;
        return fila;
      });
      pdf.autoTable({
        startY: y, head, body, theme: 'grid', columnStyles, rowPageBreak: 'avoid',
        margin: { top: 30, left: M, right: M, bottom: 34 },
        styles: { font: 'helvetica', fontSize: 6.8, cellPadding: { top: 2.2, bottom: 2.2, left: 3, right: 3 }, lineColor: [85, 85, 85], lineWidth: 0.4, textColor: 20, valign: 'middle', overflow: 'linebreak' },
        headStyles: { fillColor: GRIS, textColor: 20, fontStyle: 'bold', halign: 'center' },
        didParseCell: d => { if (d.section === 'body' && d.row.raw && d.row.raw._tot) d.cell.styles.fontStyle = 'bold'; },
        didDrawPage: () => pie()
      });
      y = pdf.lastAutoTable.finalY + 7;
    });
    (h.bloques || []).forEach(b => {
      if (b.tipo !== 'texto') return;
      const H = pdf.internal.pageSize.getHeight();
      pdf.setFontSize(7.5); pdf.setTextColor(0);
      if (b.titulo) { pdf.setFont('helvetica', 'bold'); pdf.text(pdfTxt(b.titulo), M, y + 8); y += 12; }
      pdf.setFont('helvetica', 'normal');
      (b.parrafos || []).forEach(p => pdf.splitTextToSize(pdfTxt(p), ancho).forEach(l => { if (y > H - 50) { pdf.addPage(); pie(); y = 40; } pdf.text(l, M, y + 8); y += 10; }));
      y += 4;
    });
  }

  function formularioExcel(wb, h, usados, idx) {
    const F = h.formulario, cli = h.cliente || {}, max = maxCols(F), N = 2 + 2 * max;
    const ws = wb.addWorksheet(nombreHoja(h.nombreHoja || ('Form ' + F.numero), usados), {
      pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.35, right: 0.35, top: 0.45, bottom: 0.5, header: 0.2, footer: 0.25 } },
      views: [{ showGridLines: false }]
    });
    ws.columns = [{ width: 5 }, { width: 78 }].concat(...new Array(max).fill(0).map(() => [{ width: 6 }, { width: 15 }]));
    ws.headerFooter.oddFooter = `&L&8Generado con ContaPY el ${hoyTxt()}&R&8Página &P de &N`;
    const fino = { style: 'thin', color: { argb: 'FF555555' } }, todo = { top: fino, left: fino, bottom: fino, right: fino };
    const fill = hex => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + hex } });
    const caja = (r1, c1, r2, c2, valor, estilo) => { if (r1 !== r2 || c1 !== c2) ws.mergeCells(r1, c1, r2, c2); const c = ws.getCell(r1, c1); c.value = valor; Object.assign(c, estilo || {}); for (let r = r1; r <= r2; r++) for (let k = c1; k <= c2; k++) ws.getCell(r, k).border = todo; return c; };
    // encabezado
    caja(1, 1, 3, 1, F.numero, { font: { bold: true, size: 18 }, alignment: { horizontal: 'center', vertical: 'middle' } });
    caja(1, 2, 1, 2, `RUC: ${cli.ruc || ''}`, { font: { bold: true, size: 9 } });
    caja(2, 2, 2, 2, `Nombre / Razón social: ${cli.razon || ''}`, { font: { size: 9 } });
    caja(3, 2, 3, 2, `01 Declaración Jurada Original · ${F.nombre || ''} · ${F.version || ''}`, { font: { size: 8 } });
    caja(1, 3, 1, N, 'Período / Ejercicio fiscal', { font: { bold: true, size: 9 } });
    caja(2, 3, 3, N, F.periodo || '', { font: { size: 11 }, alignment: { vertical: 'middle' } });
    let r = 5;
    F.rubros.forEach(rb => {
      const off = max - rb.cols.length;
      caja(r, 1, r, N, rb.titulo, { font: { bold: true, size: 9 }, fill: fill('D6D6D6') }); r++;
      caja(r, 1, r, 1, 'INC.', { font: { bold: true, size: 8 }, fill: fill('F2F2F2'), alignment: { horizontal: 'center' } });
      caja(r, 2, r, 2 + 2 * off, '', { fill: fill('F2F2F2') });
      rb.cols.forEach((c, i) => { const k = 3 + 2 * (off + i); caja(r, k, r, k + 1, c, { font: { bold: true, size: 8 }, fill: fill('F2F2F2'), alignment: { horizontal: 'center', wrapText: true } }); });
      r++;
      celdasRubro(rb, max).forEach(f => {
        const negrita = f.tot ? { bold: true, size: 8.5 } : { size: 8.5 };
        caja(r, 1, r, 1, f.inc, { font: negrita, alignment: { horizontal: 'center', vertical: 'middle' } });
        caja(r, 2, r, 2 + 2 * f.off, f.txt, { font: negrita, alignment: { wrapText: true, vertical: 'middle' } });
        f.pares.forEach((x, i) => {
          const k = 3 + 2 * (f.off + i);
          if (!x) { caja(r, k, r, k, null, { fill: fill('E2E2E2') }); caja(r, k + 1, r, k + 1, null, { fill: fill('E2E2E2') }); return; }
          const cas = x[0] === '' || x[0] === undefined ? null : x[0];
          caja(r, k, r, k, cas, cas === null ? {} : { font: { bold: true, size: 8 }, fill: fill('F2F2F2'), alignment: { horizontal: 'center', vertical: 'middle' }, numFmt: '0' });
          caja(r, k + 1, r, k + 1, typeof x[1] === 'number' ? Math.round(x[1]) : (x[1] === undefined ? null : x[1]), { font: negrita, alignment: { horizontal: 'right', vertical: 'middle' }, numFmt: '#,##0' });
        });
        const largo = String(f.txt || '').length;
        if (largo > 95) ws.getRow(r).height = 12.5 * Math.ceil(largo / 95);
        r++;
      });
      r++;
    });
    (h.bloques || []).forEach(b => {
      if (b.tipo !== 'texto') return;
      if (b.titulo) { caja(r, 1, r, N, b.titulo, { font: { bold: true, size: 9 } }); ws.getCell(r, 1).border = {}; r++; }
      (b.parrafos || []).forEach(p => { ws.mergeCells(r, 1, r, N); const c = ws.getCell(r, 1); c.value = p; c.font = { size: 8.5 }; c.alignment = { wrapText: true }; r++; });
      r++;
    });
  }

  /* ======================= PDF (jsPDF + autotable) ======================= */
  function aPDF(doc, archivo) {
    const J = root.jspdf && root.jspdf.jsPDF;
    if (!J) throw new Error('No se cargó la librería de PDF');
    const hojas = doc.hojas && doc.hojas.length ? doc.hojas : [doc];
    const orient = h => h.orientacion || (((h.bloques || []).filter(b => b.tipo === 'tabla').reduce((m, b) => Math.max(m, b.columnas.reduce((a, c) => a + (c.w || 10), 0)), 0)) > 115 ? 'landscape' : 'portrait');
    const pdf = new J({ orientation: orient(hojas[0]), unit: 'pt', format: 'a4' });
    const cli = doc.cliente || {};
    const M = 36;
    const cabecera = (h) => {
      const W = pdf.internal.pageSize.getWidth();
      pdf.setFillColor(...rgb(COLOR.primario)); pdf.rect(0, 0, W, 6, 'F');
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(9); pdf.setTextColor(...rgb(COLOR.primario));
      pdf.text(pdfTxt(cli.razon || ''), M, 22);
      pdf.setFont('helvetica', 'normal'); pdf.setTextColor(...rgb(COLOR.gris));
      pdf.text(pdfTxt(`RUC ${cli.ruc || ''}`), M, 33);
      pdf.text(pdfTxt(h.titulo || ''), W - M, 22, { align: 'right' });
      pdf.setDrawColor(...rgb(COLOR.borde)); pdf.setLineWidth(0.6); pdf.line(M, 40, W - M, 40);
    };
    const pie = () => {
      const W = pdf.internal.pageSize.getWidth(), H = pdf.internal.pageSize.getHeight();
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7.5); pdf.setTextColor(...rgb(COLOR.gris));
      pdf.text(pdfTxt(`Generado con ContaPY el ${hoyTxt()}`), M, H - 18);
      pdf.text(`Página ${pdf.internal.getCurrentPageInfo().pageNumber} de {total}`, W - M, H - 18, { align: 'right' });
    };
    hojas.forEach((hh, ih) => {
      const h = Object.assign({ identificacion: doc.identificacion }, hh);
      if (ih > 0) pdf.addPage('a4', orient(h));
      if (h.formulario) { formularioPDF(pdf, h, cli, M, pie); return; }
      const W = pdf.internal.pageSize.getWidth();
      // bloque de título de la sección
      let y = 62;
      const ident = h.identificacion || [];
      const porFila = W > 700 ? 3 : 2, filasId = Math.ceil(ident.length / porFila);
      const altoCaja = 40 + (ident.length ? 8 + filasId * 12 : 0);
      pdf.setFillColor(...rgb(COLOR.claro)); pdf.roundedRect(M, 48, W - 2 * M, altoCaja, 4, 4, 'F');
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(14); pdf.setTextColor(...rgb(COLOR.oscuro));
      pdf.text(pdfTxt(h.titulo || ''), M + 12, y + 4);
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8.5); pdf.setTextColor(...rgb(COLOR.gris));
      if (h.subtitulo) pdf.text(pdfTxt(h.subtitulo), M + 12, y + 18);
      const colW = (W - 2 * M - 24) / porFila;
      ident.forEach(([k, v], i) => {
        const cx = M + 12 + (i % porFila) * colW, cy = y + 34 + Math.floor(i / porFila) * 12;
        pdf.setFont('helvetica', 'bold'); pdf.setFontSize(7.5); pdf.setTextColor(...rgb(COLOR.oscuro));
        const lbl = pdfTxt(k) + ': '; pdf.text(lbl, cx, cy);
        const lw = pdf.getTextWidth(lbl) + 2;
        pdf.setFont('helvetica', 'normal'); pdf.setTextColor(...rgb(COLOR.texto));
        pdf.text(pdf.splitTextToSize(pdfTxt(v), colW - lw - 6)[0] || '', cx + lw, cy);
      });
      y += altoCaja + 4;
      cabecera(h); pie();
      (h.bloques || []).forEach(b => {
        const H = pdf.internal.pageSize.getHeight();
        if (b.tipo === 'texto') {
          if (y > H - 90) { pdf.addPage(); cabecera(h); pie(); y = 56; }
          if (b.titulo) { pdf.setFont('helvetica', 'bold'); pdf.setFontSize(10); pdf.setTextColor(...rgb(COLOR.primario)); pdf.text(pdfTxt(b.titulo), M, y); y += 14; }
          pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9); pdf.setTextColor(...rgb(COLOR.texto));
          (b.parrafos || []).forEach(p => {
            const lines = pdf.splitTextToSize(pdfTxt(p), W - 2 * M);
            lines.forEach(l => { if (y > H - 60) { pdf.addPage(); cabecera(h); pie(); y = 56; } pdf.text(l, M, y); y += 12; });
            y += 4;
          });
          y += 6;
          return;
        }
        if (b.tipo === 'firmas') {
          if (y > H - 120) { pdf.addPage(); cabecera(h); pie(); y = 56; }
          y += 50;
          const w = (W - 2 * M - 60) / 2;
          [[M, cli.representante || 'Representante legal', 'Representante legal'], [M + w + 60, cli.contador || 'Contador', 'Contador']].forEach(([x, nom, rol]) => {
            pdf.setDrawColor(60); pdf.setLineWidth(0.7); pdf.line(x, y, x + w, y);
            pdf.setFont('helvetica', 'bold'); pdf.setFontSize(9); pdf.setTextColor(...rgb(COLOR.texto)); pdf.text(pdfTxt(nom), x + w / 2, y + 12, { align: 'center' });
            pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8); pdf.setTextColor(...rgb(COLOR.gris)); pdf.text(rol, x + w / 2, y + 23, { align: 'center' });
          });
          y += 40;
          return;
        }
        if (b.tipo !== 'tabla') return;
        if (b.titulo) {
          if (y > H - 80) { pdf.addPage(); cabecera(h); pie(); y = 56; }
          pdf.setFont('helvetica', 'bold'); pdf.setFontSize(10); pdf.setTextColor(...rgb(COLOR.primario)); pdf.text(pdfTxt(b.titulo), M, y + 4); y += 12;
        }
        // ocultar columnas sin ningún dato (solo en PDF)
        const usadas = b.columnas.map((c, i) => i).filter(i => b.filas.some(f => f.v[i] !== '' && f.v[i] !== null && f.v[i] !== undefined));
        const bb = { columnas: usadas.map(i => b.columnas[i]), filas: b.filas.map(f => Object.assign({}, f, { v: usadas.map(i => f.v[i]) })) };
        const ancho = W - 2 * M, ncol = bb.columnas.length;
        const fs = ncol > 14 ? 5.8 : ncol > 10 ? 6.5 : ncol > 7 ? 7.3 : 8.2;
        const body = bb.filas.map(f => bb.columnas.map((c, i) => pdfTxt(R.fmtValor(f.v[i], c.tipo))));
        // ancho natural de cada columna (sin cortar importes, fechas ni códigos)
        pdf.setFontSize(fs);
        const ft0 = firstText(bb);
        const natural = bb.columnas.map((c, i) => Math.max(...body.map((r, j) => pdf.getTextWidth(r[i] || '') * 1.08 + (i === ft0 ? 9 * Math.min(6, bb.filas[j].nivel || 0) : 0)), pdf.getTextWidth(pdfTxt(c.t || '').split(' ')[0]) * 1.1, 18) + 10);
        const textoLargo = bb.columnas.map((c, i) => (!c.tipo || c.tipo === 'texto') && Math.max(...body.map(r => (r[i] || '').length)) > 18);
        const fijas = natural.reduce((a, w, i) => a + (textoLargo[i] ? 0 : w), 0);
        const pesoLargo = bb.columnas.reduce((a, c, i) => a + (textoLargo[i] ? (c.w || 20) : 0), 0) || 1;
        const libre = Math.max(ancho - fijas, ancho * 0.25);
        const columnStyles = {};
        bb.columnas.forEach((c, i) => {
          let w = textoLargo[i] ? Math.max(60, libre * (c.w || 20) / pesoLargo) : natural[i];
          columnStyles[i] = { cellWidth: w, halign: c.tipo && c.tipo !== 'texto' ? 'right' : 'left' };
        });
        const suma = Object.values(columnStyles).reduce((a, x) => a + x.cellWidth, 0);
        if (suma > 0 && suma !== ancho) Object.values(columnStyles).forEach(x => { x.cellWidth = x.cellWidth * ancho / suma; });
        const ft = firstText(bb);
        pdf.autoTable({
          startY: y, head: [bb.columnas.map(c => pdfTxt(c.t))], body, margin: { top: 50, left: M, right: M, bottom: 34 }, columnStyles,
          styles: { font: 'helvetica', fontSize: fs, cellPadding: { top: 2.5, bottom: 2.5, left: 4, right: 4 }, textColor: rgb(COLOR.texto), lineColor: rgb(COLOR.borde), lineWidth: { bottom: 0.3 }, overflow: 'linebreak', valign: 'middle' },
          headStyles: { fillColor: rgb(COLOR.primario), textColor: 255, fontStyle: 'bold', fontSize: fs, overflow: 'linebreak' },
          alternateRowStyles: { fillColor: rgb(COLOR.zebra) },
          didParseCell: d => {
            if (d.section !== 'body') { if (d.section === 'head') d.cell.styles.halign = columnStyles[d.column.index].halign; return; }
            const f = bb.filas[d.row.index], est = f.estilo || '';
            if (d.column.index === ft && f.nivel) d.cell.styles.cellPadding = { top: 2.5, bottom: 2.5, left: 4 + 9 * Math.min(6, f.nivel), right: 4 };
            if (est === 'titulo') { d.cell.styles.fillColor = rgb(COLOR.oscuro); d.cell.styles.textColor = 255; d.cell.styles.fontStyle = 'bold'; }
            else if (est === 'seccion') { d.cell.styles.fillColor = rgb(COLOR.claro); d.cell.styles.textColor = rgb(COLOR.oscuro); d.cell.styles.fontStyle = 'bold'; }
            else if (est === 'subtotal') { d.cell.styles.fontStyle = 'bold'; d.cell.styles.fillColor = [255, 255, 255]; }
            else if (est === 'total') { d.cell.styles.fontStyle = 'bold'; d.cell.styles.fillColor = rgb(COLOR.total); }
            else if (est === 'gran') { d.cell.styles.fontStyle = 'bold'; d.cell.styles.fillColor = rgb(COLOR.primario); d.cell.styles.textColor = 255; }
            else if (est === 'nota') { d.cell.styles.fontStyle = 'italic'; d.cell.styles.textColor = rgb(COLOR.gris); d.cell.styles.fillColor = [255, 255, 255]; }
            const val = f.v[d.column.index];
            if (typeof val === 'number' && val < 0 && !est) d.cell.styles.textColor = [178, 59, 59];
          },
          didDrawPage: () => { cabecera(h); pie(); }
        });
        y = pdf.lastAutoTable.finalY + 16;
      });
    });
    if (typeof pdf.putTotalPages === 'function') pdf.putTotalPages('{total}');
    bajar(pdf.output('blob'), archivo.replace(/\.(xlsx|pdf)$/i, '') + '.pdf');
  }

  function bajar(blob, nombre) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = nombre; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 8000);
  }

  /* ---------- Selector de formato ---------- */
  R.elegirFormato = function (titulo) {
    return new Promise(resolve => {
      const div = document.createElement('div');
      div.className = 'formato-fondo';
      div.innerHTML = `<div class="formato card" role="dialog" aria-label="Descargar"><h3>Descargar informe</h3><p class="muted">${String(titulo || '').replace(/[<>&]/g, '')}</p>
        <div class="formato-btns"><button class="primary" data-f="pdf"><b>PDF</b><small>Para enviar o imprimir</small></button><button data-f="xlsx"><b>Excel</b><small>Para seguir trabajando</small></button></div>
        <button class="mini cerrar" data-f="">Cancelar</button></div>`;
      document.body.appendChild(div);
      const fin = f => { div.remove(); document.removeEventListener('keydown', tecla); resolve(f); };
      const tecla = e => { if (e.key === 'Escape') fin(''); if (e.key.toLowerCase() === 'p') fin('pdf'); if (e.key.toLowerCase() === 'e') fin('xlsx'); };
      document.addEventListener('keydown', tecla);
      div.addEventListener('click', e => { const b = e.target.closest('[data-f]'); if (b) fin(b.dataset.f); else if (e.target === div) fin(''); });
      div.querySelector('[data-f="pdf"]').focus();
    });
  };
  R.descargarDocumento = async function (doc, archivo, formato) {
    formato = formato || await R.elegirFormato(doc.titulo || (doc.hojas && doc.hojas[0] && doc.hojas[0].titulo));
    if (!formato) return;
    try { if (formato === 'pdf') aPDF(doc, archivo); else await aExcel(doc, archivo); }
    catch (e) { console.error(e); if (root.App) root.App.toast('No se pudo generar el informe: ' + e.message, 'error'); }
  };
  R.aExcel = aExcel; R.aPDF = aPDF;
  R.bajar = bajar;

  /* ---------- Recibos de salario / aguinaldo: original y duplicado en una hoja A4 ---------- */
  R.recibosPDF = function (cli, recibos, opts, archivo) {
    const J = root.jspdf && root.jspdf.jsPDF;
    if (!J) throw new Error('No se cargó la librería de PDF');
    const pdf = new J({ orientation: 'portrait', unit: 'pt', format: 'a4' });
    const W = pdf.internal.pageSize.getWidth(), H = pdf.internal.pageSize.getHeight(), M = 36;
    const gs = v => (Math.round(v) || 0).toLocaleString('es-PY');
    recibos.forEach((r, i) => {
      if (i) pdf.addPage();
      ['ORIGINAL', 'DUPLICADO'].forEach((copia, k) => {
        let y = k ? H / 2 + 14 : 30;
        if (k) { pdf.setDrawColor(160); pdf.setLineDashPattern([3, 3], 0); pdf.line(M, H / 2, W - M, H / 2); pdf.setLineDashPattern([], 0); }
        pdf.setDrawColor(0); pdf.setLineWidth(0.8); pdf.rect(M, y, W - 2 * M, H / 2 - 52);
        pdf.setTextColor(0); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(12);
        pdf.text(pdfTxt(opts.titulo || 'RECIBO DE SALARIO'), W / 2, y + 20, { align: 'center' });
        pdf.setFontSize(7.5); pdf.setFont('helvetica', 'normal'); pdf.text(copia, W - M - 8, y + 14, { align: 'right' });
        pdf.setFontSize(8.5);
        const linea = (k1, v1, k2, v2, yy) => {
          const par = (k, val, x) => { pdf.setFont('helvetica', 'bold'); pdf.text(pdfTxt(k), x, yy); const w = pdf.getTextWidth(pdfTxt(k)) + 5; pdf.setFont('helvetica', 'normal'); pdf.text(pdfTxt(val), x + w, yy); };
          par(k1, v1, M + 10); if (k2) par(k2, v2, W / 2 + 10);
        };
        linea('Empleador:', cli.razon || '', 'RUC:', cli.ruc || '', y + 38);
        linea('N° patronal IPS:', opts.nroPatronal || '-', 'Período:', r.periodoTxt || r.periodo || '', y + 51);
        linea('Trabajador:', r.nombre || '', 'C.I.:', r.ci || '', y + 64);
        if (r.cargo) linea('Cargo:', r.cargo, '', '', y + 77);
        const filas = [];
        const n = Math.max(r.haberes.length, r.descuentos.length);
        for (let j = 0; j < n; j++) { const h = r.haberes[j] || ['', ''], d = r.descuentos[j] || ['', '']; filas.push([pdfTxt(h[0]), h[0] ? gs(h[1]) : '', pdfTxt(d[0]), d[0] ? gs(d[1]) : '']); }
        const th = r.haberes.reduce((a, x) => a + x[1], 0), td = r.descuentos.reduce((a, x) => a + x[1], 0);
        filas.push(['Total haberes', gs(th), 'Total descuentos', gs(td)]);
        pdf.autoTable({
          startY: y + 86, head: [['Haberes', 'Importe', 'Descuentos', 'Importe']], body: filas, theme: 'grid', margin: { left: M + 10, right: M + 10 },
          styles: { fontSize: 8, cellPadding: 3, lineColor: [120, 120, 120], lineWidth: 0.4, textColor: 20 },
          headStyles: { fillColor: [230, 230, 230], textColor: 20, fontStyle: 'bold' },
          columnStyles: { 1: { halign: 'right', cellWidth: 90 }, 3: { halign: 'right', cellWidth: 90 } },
          didParseCell: d => { if (d.section === 'body' && d.row.index === filas.length - 1) d.cell.styles.fontStyle = 'bold'; }
        });
        let yy = pdf.lastAutoTable.finalY + 16;
        pdf.setFont('helvetica', 'bold'); pdf.setFontSize(10); pdf.text(`NETO A COBRAR: Gs. ${gs(r.neto)}`, M + 10, yy);
        pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8);
        const letras = root.Conta && root.Conta.numeroEnLetras ? root.Conta.numeroEnLetras(r.neto) : '';
        pdf.text(pdf.splitTextToSize(pdfTxt(`Recibí conforme la suma de guaraníes ${letras}.`), W - 2 * M - 20), M + 10, yy + 14);
        const yf = y + H / 2 - 74;
        pdf.line(W - M - 190, yf, W - M - 20, yf); pdf.text('Firma del trabajador', W - M - 105, yf + 10, { align: 'center' });
        pdf.line(M + 20, yf, M + 190, yf); pdf.text('Firma del empleador', M + 105, yf + 10, { align: 'center' });
      });
    });
    bajar(pdf.output('blob'), archivo.replace(/\.pdf$/i, '') + '.pdf');
  };

  /* ---------- Adaptador de las exportaciones existentes (matrices de valores) ---------- */
  const TOTAL_RE = /^(TOTAL|TOTALES|SALDO|SUBTOTAL|RESULTADO|UTILIDAD|RENTA NETA|IMPUESTO|BASE IMPONIBLE|VARIACI|FLUJO NETO|DISPONIBILIDADES AL|EFECTIVO NETO|GANANCIAS)/i;
  R.desdeMatriz = function (aoa, opts, nombreHoja, ws) {
    opts = opts || {};
    const doc = { nombreHoja, titulo: nombreHoja, subtitulo: '', bloques: [] };
    let i = 0;
    while (i < aoa.length && aoa[i] && aoa[i]._tipo) {
      const t = aoa[i]._tipo;
      if (t === 'titulo') doc.titulo = String(aoa[i][0] || ''); else if (t === 'extra') doc.subtitulo = String(aoa[i][0] || '');
      i++;
    }
    const tipoCol = c => (opts.pctCols || []).includes(c) ? 'pct' : (opts.usdCols || []).includes(c) ? 'usd' : null;
    const colEntera = c => { if (!ws || !root.XLSX) return false; for (let r = 0; r < aoa.length; r++) { const cell = ws[root.XLSX.utils.encode_cell({ r, c })]; if (cell && cell.t === 'n' && cell.z === '0') return true; } return false; };
    let tabla = null;
    const noVacios = f => (f || []).filter(x => x !== '' && x !== null && x !== undefined);
    const esCabecera = (f, sig) => { const nv = noVacios(f); return nv.length >= 2 && nv.every(x => typeof x === 'string') && (!sig || noVacios(sig).some(x => typeof x === 'number') || noVacios(sig).length >= 1); };
    const nuevaTabla = cab => {
      const ncol = Math.max(cab.length, ...aoa.slice(i).map(f => (f || []).length));
      tabla = { tipo: 'tabla', columnas: new Array(ncol).fill(0).map((_, c) => ({ t: String(cab[c] === undefined ? '' : cab[c]), w: (opts.anchos || [])[c] || 12, tipo: null })), filas: [] };
      doc.bloques.push(tabla);
    };
    for (; i < aoa.length; i++) {
      const f = aoa[i] || [], nv = noVacios(f);
      if (!nv.length) { tabla = null; continue; }
      if (!tabla) {
        if (esCabecera(f, aoa[i + 1])) { nuevaTabla(f); continue; }
        nuevaTabla(new Array(Math.max(f.length, 2)).fill(''));
        tabla.sinCabecera = true;
      }
      const texto = f.find(x => typeof x === 'string' && x.trim());
      const lead = texto ? (texto.match(/^\s*/)[0].length) : 0;
      const v = f.map(x => typeof x === 'string' ? x.replace(/^\s+/, '') : x);
      let estilo = '';
      if (nv.length === 1 && typeof nv[0] === 'string' && f.length <= 2) estilo = 'seccion';
      else if (texto && TOTAL_RE.test(texto.trim())) estilo = 'total';
      else if (texto && texto.trim().length > 3 && texto.trim() === texto.trim().toUpperCase() && /[A-ZÁÉÍÓÚÑ]/.test(texto) && nv.some(x => typeof x === 'number')) estilo = 'subtotal';
      tabla.filas.push({ v, estilo, nivel: Math.floor(lead / 3) });
    }
    // tipos de columna: numéricas en guaraníes salvo indicación
    doc.bloques.forEach(b => {
      b.columnas.forEach((c, ci) => {
        const nums = b.filas.some(f => typeof f.v[ci] === 'number');
        c.tipo = tipoCol(ci) || (colEntera(ci) ? 'entero' : nums ? 'gs' : 'texto');
      });
      if (b.sinCabecera) { b.columnas.forEach((c, ci) => { c.t = ci === 0 ? 'Concepto' : ''; }); }
      // informes con columna "Nivel" (balance por niveles): jerarquía visual
      const cn = b.columnas.findIndex(c => /^nivel$/i.test(c.t.trim()));
      if (cn >= 0) {
        const max = Math.max(...b.filas.map(f => Number(f.v[cn]) || 0));
        b.filas.forEach(f => {
          const n = Number(f.v[cn]) || 0;
          if (!n || f.estilo === 'total') return;
          f.nivel = n - 1;
          f.estilo = n === 1 ? 'seccion' : n < max ? 'subtotal' : '';
        });
      }
    });
    return doc;
  };

  root.Reportes = R;
})(window);
