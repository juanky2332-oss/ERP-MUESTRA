import 'server-only'
import { createHash } from 'crypto'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { hexARgb, suavizar, formatoImagen, type MarcaDocumento } from '@/lib/documentos/marca'
import { fechaES } from '@/lib/fiscal/calendario'
import { UMBRAL_347, type Libros } from '@/lib/fiscal/libros'

const eur = (v: number) => `${v.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
const pct = (v: number) => `${v.toLocaleString('es-ES', { maximumFractionDigits: 2 })} %`
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

/**
 * Huella SHA-256 de los datos fiscales del periodo (facturas, importes y
 * orden). Va en el PDF, el Excel y el LEEME: si dos paquetes tienen la misma
 * huella contienen exactamente lo mismo; si cambia, algo se modificó.
 */
export function huellaLibros(l: Libros): string {
    const datos = {
        p: l.periodo.clave,
        e: l.emitidas.map(e => [e.orden, e.numero, e.fecha, e.nif, e.base, e.tipoIva, e.cuota, e.total, e.estado]),
        r: l.recibidas.map(r => [r.orden, r.numeroInterno, r.numeroProveedor, r.fecha, r.nif, r.base, r.tipoIva, r.cuota, r.retencion, r.total, r.tieneDocumento]),
    }
    return createHash('sha256').update(JSON.stringify(datos)).digest('hex')
}

export function pdfResumenFiscal(l: Libros, marca: MarcaDocumento, opts: { generado: string; huella: string; regimen: 'sociedad' | 'autonomo' }): Buffer {
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
    const W = 297, M = 12
    const color = hexARgb(marca.color)
    const suave = suavizar(color, 0.9)
    const p = l.periodo

    // ---------- Cabecera ----------
    pdf.setFillColor(...color); pdf.rect(0, 0, W, 3, 'F')
    let xTexto = M
    if (marca.logoDataUrl) {
        try {
            const props = (pdf as any).getImageProperties(marca.logoDataUrl)
            const esc = Math.min(36 / props.width, 18 / props.height)
            pdf.addImage(marca.logoDataUrl, formatoImagen(marca.logoDataUrl), M, 8, props.width * esc, props.height * esc, 'logo', 'FAST')
            xTexto = M + props.width * esc + 6
        } catch { /* logo no válido: se omite */ }
    }
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(16); pdf.setTextColor(0, 0, 0)
    pdf.text('Resumen de facturas para el asesor', xTexto, 14)
    pdf.setFontSize(11); pdf.text(p.etiqueta, xTexto, 20)
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8.5); pdf.setTextColor(70, 70, 70)
    pdf.text(`${marca.nombre}${marca.nif ? ` · NIF ${marca.nif}` : ''}${marca.direccion ? ` · ${marca.direccion}` : ''}`, xTexto, 25)
    pdf.text(`Periodo: del ${fechaES(p.desde)} al ${fechaES(p.hasta)} · Régimen: ${opts.regimen === 'autonomo' ? 'autónomo (IRPF)' : 'sociedad (Impuesto sobre Sociedades)'} · Generado el ${opts.generado}`, xTexto, 29.5)

    const titulo = (t: string, y?: number) => {
        let yy = y ?? ((pdf as any).lastAutoTable?.finalY ?? 34) + 8
        if (yy > 185) { pdf.addPage(); yy = 16 }
        pdf.setFont('helvetica', 'bold'); pdf.setFontSize(11); pdf.setTextColor(...color)
        pdf.text(t, M, yy)
        pdf.setTextColor(0, 0, 0)
        return yy + 2.5
    }
    const tabla = (startY: number, head: string[][], body: any[][], opts2: Partial<Parameters<typeof autoTable>[1]> = {}) => autoTable(pdf, {
        startY, head, body, margin: { left: M, right: M, top: 14, bottom: 14 },
        theme: 'grid',
        styles: { font: 'helvetica', fontSize: 7.5, cellPadding: 1.4, lineColor: [215, 215, 215], lineWidth: 0.1, overflow: 'linebreak' },
        headStyles: { fillColor: color, textColor: 255, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [250, 250, 250] },
        footStyles: { fillColor: suave, textColor: 0, fontStyle: 'bold' },
        ...opts2,
    })
    const derecha = (cols: number[]) => Object.fromEntries(cols.map(c => [c, { halign: 'right' as const }]))

    // ---------- 1. Resumen ----------
    const t = l.totales
    let y = titulo('1. Resumen del periodo', 40)
    const filasResumen: any[][] = [
        ['Facturas emitidas', `${t.emitidas.num}${t.emitidas.anuladas ? ` (${t.emitidas.anuladas} anulada/s, no suman)` : ''}`, eur(t.emitidas.base), eur(t.emitidas.cuota), eur(t.emitidas.total)],
        ['Facturas recibidas (gastos)', `${t.recibidas.num}${t.recibidas.sinDocumento ? ` (${t.recibidas.sinDocumento} sin documento)` : ''}`, eur(t.recibidas.base), eur(t.recibidas.cuota), eur(t.recibidas.total)],
    ]
    tabla(y, [['Concepto', 'Nº facturas', 'Base imponible', 'IVA', 'Total']], filasResumen, { columnStyles: derecha([2, 3, 4]) })

    const filasModelos: any[][] = [
        ['IVA (303)', 'IVA repercutido (devengado)', eur(l.modelo303.devengado)],
        ['IVA (303)', 'IVA soportado (deducible, si las facturas son completas y afectas a la actividad)', eur(l.modelo303.deducible)],
        ['IVA (303)', l.modelo303.resultado >= 0 ? 'Resultado orientativo: A INGRESAR' : (p.clave.endsWith('4T') || p.tipo === 'anual' ? 'Resultado orientativo: A COMPENSAR o DEVOLVER' : 'Resultado orientativo: A COMPENSAR'), eur(l.modelo303.resultado)],
    ]
    if (l.retenciones.m111.num) filasModelos.push(['IRPF (111)', `Retenciones practicadas a profesionales (${l.retenciones.m111.perceptores} perceptor/es, base ${eur(l.retenciones.m111.base)}) · sin nóminas`, eur(l.retenciones.m111.retencion)])
    if (l.retenciones.m115.num) filasModelos.push(['IRPF (115)', `Retenciones de alquileres (${l.retenciones.m115.perceptores} arrendador/es, base ${eur(l.retenciones.m115.base)})`, eur(l.retenciones.m115.retencion)])
    if (l.modelo130?.length) {
        const u = l.modelo130[l.modelo130.length - 1]
        filasModelos.push(['IRPF (130)', `Acumulado 1/1–fin del ${u.trimestre}º trim.: ingresos ${eur(u.ingresos)} − gastos ${eur(u.gastos)} = ${eur(u.rendimiento)}; 20 % ${eur(u.veintePorCiento)} − pagos anteriores ${eur(u.pagosAnteriores)}`, eur(u.resultado)])
    }
    y = titulo('2. Cifras orientativas para los modelos')
    tabla(y, [['Modelo', 'Concepto', 'Importe']], filasModelos, { columnStyles: { 0: { cellWidth: 26, fontStyle: 'bold' }, 2: { halign: 'right', cellWidth: 32 } } })

    // ---------- IVA por tipo y por mes ----------
    y = titulo('3. IVA por tipo impositivo')
    const tipos = [...new Set([...l.ivaPorTipo.repercutido.map(x => x.tipo), ...l.ivaPorTipo.soportado.map(x => x.tipo)])].sort((a, b) => b - a)
    tabla(y, [['Tipo de IVA', 'Base emitidas', 'IVA repercutido', 'Base recibidas', 'IVA soportado']],
        tipos.map(tp => { const r = l.ivaPorTipo.repercutido.find(x => x.tipo === tp), s = l.ivaPorTipo.soportado.find(x => x.tipo === tp); return [pct(tp), eur(r?.base || 0), eur(r?.cuota || 0), eur(s?.base || 0), eur(s?.cuota || 0)] }),
        { columnStyles: derecha([0, 1, 2, 3, 4]), foot: [['Total', eur(t.emitidas.base), eur(t.emitidas.cuota), eur(t.recibidas.base), eur(t.recibidas.cuota)]] })

    if (l.porMes.length > 1) {
        y = titulo('4. Desglose por meses')
        tabla(y, [['Mes', 'Base emitidas', 'IVA repercutido', 'Base recibidas', 'IVA soportado', 'Diferencia IVA']],
            l.porMes.map(m => [`${MESES[Number(m.mes.slice(5, 7)) - 1]} ${m.mes.slice(0, 4)}`, eur(m.baseVentas), eur(m.ivaVentas), eur(m.baseCompras), eur(m.ivaCompras), eur(Math.round((m.ivaVentas - m.ivaCompras) * 100) / 100)]),
            { columnStyles: derecha([1, 2, 3, 4, 5]) })
    }

    // ---------- Libros registro ----------
    pdf.addPage()
    y = titulo('5. Libro registro de facturas EMITIDAS (art. 63 RIVA)', 16)
    tabla(y, [['Nº orden', 'Nº factura', 'Fecha', 'Cliente', 'NIF', 'Base', '% IVA', 'Cuota IVA', 'Total', 'Estado']],
        l.emitidas.map(e => [String(e.orden).padStart(3, '0'), e.numero, fechaES(e.fecha), e.cliente, e.nif || '— FALTA —', eur(e.base), pct(e.tipoIva), eur(e.cuota), eur(e.total), e.estado === 'anulada' ? 'ANULADA (no suma)' : e.estado === 'rectificativa' ? 'Rectificativa' : '']),
        {
            columnStyles: { 0: { cellWidth: 14 }, 2: { cellWidth: 18 }, 5: { halign: 'right' }, 6: { halign: 'right', cellWidth: 14 }, 7: { halign: 'right' }, 8: { halign: 'right' } },
            foot: [['', `${t.emitidas.num} facturas`, '', '', '', eur(t.emitidas.base), '', eur(t.emitidas.cuota), eur(t.emitidas.total), '']],
            didParseCell: (d: any) => { if (d.section === 'body' && d.row.raw?.[9]?.startsWith('ANULADA')) d.cell.styles.textColor = [150, 150, 150] },
        })
    if (!l.emitidas.length) { pdf.setFontSize(9); pdf.text('No hay facturas emitidas en el periodo.', M, (pdf as any).lastAutoTable.finalY + 6) }

    y = titulo('6. Libro registro de facturas RECIBIDAS (art. 64 RIVA) · nº de registro correlativo por fecha')
    tabla(y, [['Nº reg.', 'Fecha', 'Proveedor', 'NIF', 'Nº factura proveedor', 'Ref. interna', 'Concepto', 'Base', '% IVA', 'Cuota IVA', 'Retención', 'Total', 'Doc.']],
        l.recibidas.map(r => [String(r.orden).padStart(3, '0'), fechaES(r.fecha), r.proveedor, r.nif || '— FALTA —', r.numeroProveedor || 'S/N', r.numeroInterno, r.concepto.slice(0, 70), eur(r.base), pct(r.tipoIva), eur(r.cuota), r.retencion ? `${eur(r.retencion)} (${r.modeloRetencion})` : '', eur(r.total), r.tieneDocumento ? 'Sí' : 'NO']),
        {
            styles: { font: 'helvetica', fontSize: 6.8, cellPadding: 1.2, lineColor: [215, 215, 215], lineWidth: 0.1, overflow: 'linebreak' },
            columnStyles: { 0: { cellWidth: 11 }, 1: { cellWidth: 16 }, 7: { halign: 'right' }, 8: { halign: 'right', cellWidth: 12 }, 9: { halign: 'right' }, 10: { halign: 'right' }, 11: { halign: 'right' }, 12: { halign: 'center', cellWidth: 10 } },
            foot: [['', '', `${t.recibidas.num} facturas`, '', '', '', '', eur(t.recibidas.base), '', eur(t.recibidas.cuota), eur(t.recibidas.retencion), eur(t.recibidas.total), '']],
            didParseCell: (d: any) => { if (d.section === 'body' && d.column.index === 12 && d.cell.raw === 'NO') { d.cell.styles.textColor = [190, 30, 45]; d.cell.styles.fontStyle = 'bold' } },
        })
    if (!l.recibidas.length) { pdf.setFontSize(9); pdf.text('No hay facturas recibidas en el periodo.', M, (pdf as any).lastAutoTable.finalY + 6) }

    // ---------- Por cliente / proveedor ----------
    pdf.addPage()
    y = titulo('7. Totales por cliente', 16)
    tabla(y, [['Cliente', 'NIF', 'Nº facturas', 'Base', 'IVA', 'Total']],
        l.porCliente.map(c => [c.nombre, c.nif || '— FALTA —', String(c.num), eur(c.base), eur(c.cuota), eur(c.total)]),
        { columnStyles: derecha([2, 3, 4, 5]), foot: [['Total', '', String(l.porCliente.reduce((a, c) => a + c.num, 0)), eur(t.emitidas.base), eur(t.emitidas.cuota), eur(t.emitidas.total)]] })
    y = titulo('8. Totales por proveedor')
    tabla(y, [['Proveedor', 'NIF', 'Nº facturas', 'Base', 'IVA', 'Retención', 'Total']],
        l.porProveedor.map(c => [c.nombre, c.nif || '— FALTA —', String(c.num), eur(c.base), eur(c.cuota), eur(c.retencion), eur(c.total)]),
        { columnStyles: derecha([2, 3, 4, 5, 6]), foot: [['Total', '', String(t.recibidas.num), eur(t.recibidas.base), eur(t.recibidas.cuota), eur(t.recibidas.retencion), eur(t.recibidas.total)]] })

    let seccion = 9
    if (l.modelo347) {
        y = titulo(`${seccion++}. Modelo 347 · terceros con más de ${eur(UMBRAL_347)} en el año (IVA incluido, sin operaciones con retención)`)
        const filas = [
            ...l.modelo347.clientes.map(c => ['Cliente (ventas, clave B)', c.nombre, c.nif || '— FALTA —', ...c.trimestres.map(eur), eur(c.total)]),
            ...l.modelo347.proveedores.map(c => ['Proveedor (compras, clave A)', c.nombre, c.nif || '— FALTA —', ...c.trimestres.map(eur), eur(c.total)]),
        ]
        tabla(y, [['Tipo', 'Nombre', 'NIF', '1T', '2T', '3T', '4T', 'Total año']], filas.length ? filas : [['—', 'Ningún tercero supera el umbral', '', '', '', '', '', '']], { columnStyles: derecha([3, 4, 5, 6, 7]) })
    }

    // ---------- Avisos ----------
    y = titulo(`${seccion++}. Avisos a revisar antes de presentar (${l.anomalias.length})`)
    tabla(y, [['', 'Detalle']], l.anomalias.length ? l.anomalias.map(a => [a.nivel === 'error' ? 'IMPORTANTE' : 'Revisar', a.texto]) : [['OK', 'No se han detectado incidencias en la numeración, NIF, documentos ni importes.']], {
        columnStyles: { 0: { cellWidth: 24, fontStyle: 'bold' } },
        didParseCell: (d: any) => { if (d.section === 'body' && d.column.index === 0) d.cell.styles.textColor = d.cell.raw === 'IMPORTANTE' ? [190, 30, 45] : d.cell.raw === 'OK' ? [20, 130, 70] : [180, 110, 0] },
    })

    // ---------- Notas ----------
    y = titulo(`${seccion++}. Notas`)
    const notas = [
        'Las cifras de modelos son orientativas y se calculan solo con las facturas registradas en el ERP: no incluyen nóminas, seguros sociales, amortizaciones, prorrata, regularizaciones ni operaciones fuera del ERP. La liquidación definitiva corresponde al asesor.',
        'Facturas recibidas numeradas correlativamente por fecha (art. 64.4 RIVA). La referencia interna (G-..) es el número de alta en el ERP.',
        'Las facturas anuladas se listan para mantener la numeración correlativa, pero no suman en los totales.',
        'Plazos AEAT: trimestrales del 1 al 20 de abril, julio y octubre; 4º trimestre hasta el 30 de enero (303/130) o el 20 de enero (111/115). Si el último día es inhábil, pasa al siguiente hábil. Con domiciliación, el plazo termina 5 días antes.',
        `Huella SHA-256 de los datos de este resumen: ${opts.huella}. Es la misma que figura en el Excel de libros registro y en LEEME.txt; si coincide, los tres documentos se generaron con exactamente los mismos datos.`,
    ]
    tabla(y, [], notas.map(x => [x]), { theme: 'plain', styles: { font: 'helvetica', fontSize: 7.5, cellPadding: 1, textColor: [70, 70, 70] } })

    // ---------- Pie ----------
    const total = (pdf as any).getNumberOfPages()
    for (let i = 1; i <= total; i++) {
        pdf.setPage(i)
        pdf.setFontSize(7); pdf.setTextColor(130, 130, 130); pdf.setFont('helvetica', 'normal')
        pdf.text(`${marca.nombre} · ${p.etiqueta} · huella ${opts.huella.slice(0, 16)}…`, M, 205)
        pdf.text(`Página ${i} de ${total}`, W - M, 205, { align: 'right' })
    }
    return Buffer.from(pdf.output('arraybuffer'))
}
