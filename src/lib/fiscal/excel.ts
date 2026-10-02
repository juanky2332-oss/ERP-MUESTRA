import 'server-only'
import ExcelJS from 'exceljs'
import { fechaES } from '@/lib/fiscal/calendario'
import type { Libros } from '@/lib/fiscal/libros'

const EUR = '#,##0.00 "€";[Red]-#,##0.00 "€"'
const PCT = '0.##" %"'
const aFecha = (f: string) => { const [y, m, d] = f.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)) }

/**
 * Libros registro en Excel: una hoja por libro con importes numéricos (no
 * texto), fechas reales, filtros y la primera fila fija, para que el asesor
 * pueda importarlos o filtrarlos sin retocar nada.
 */
export async function excelLibros(l: Libros, info: { empresa: string; nif?: string | null; generado: string; huella: string }): Promise<Buffer> {
    const wb = new ExcelJS.Workbook()
    wb.creator = info.empresa
    wb.created = new Date()
    const p = l.periodo

    const hoja = (nombre: string, columnas: { header: string; key: string; width: number; fmt?: string }[], filas: Record<string, any>[], totales?: Record<string, any>) => {
        const ws = wb.addWorksheet(nombre, { views: [{ state: 'frozen', ySplit: 1 }] })
        ws.columns = columnas.map(c => ({ header: c.header, key: c.key, width: c.width, style: c.fmt ? { numFmt: c.fmt } : {} }))
        ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
        ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } }
        filas.forEach(f => ws.addRow(f))
        if (filas.length) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columnas.length } }
        if (totales) { const r = ws.addRow(totales); r.font = { bold: true } }
        return ws
    }

    // Resumen
    const res = wb.addWorksheet('Resumen')
    res.columns = [{ width: 46 }, { width: 22 }]
    const add = (a: any, b?: any, fmt?: string) => { const r = res.addRow([a, b]); if (fmt) r.getCell(2).numFmt = fmt; return r }
    add(info.empresa).font = { bold: true, size: 14 }
    if (info.nif) add(`NIF ${info.nif}`)
    add(`Libros registro · ${p.etiqueta}`).font = { bold: true }
    add(`Del ${fechaES(p.desde)} al ${fechaES(p.hasta)} · generado el ${info.generado}`)
    add('')
    add('Facturas emitidas', l.totales.emitidas.num)
    add('Base imponible emitidas', l.totales.emitidas.base, EUR)
    add('IVA repercutido', l.totales.emitidas.cuota, EUR)
    add('Total emitidas', l.totales.emitidas.total, EUR)
    add('Facturas recibidas', l.totales.recibidas.num)
    add('Base imponible recibidas', l.totales.recibidas.base, EUR)
    add('IVA soportado', l.totales.recibidas.cuota, EUR)
    add('Retenciones practicadas', l.totales.recibidas.retencion, EUR)
    add('Total recibidas', l.totales.recibidas.total, EUR)
    add('IVA repercutido − soportado (orientativo)', l.modelo303.resultado, EUR).font = { bold: true }
    add('')
    add('Avisos a revisar', l.anomalias.length)
    add('Huella SHA-256 de los datos', info.huella)
    add('Cifras orientativas: la liquidación definitiva la realiza el asesor.').font = { italic: true, color: { argb: 'FF666666' } }

    hoja('Emitidas', [
        { header: 'Nº orden', key: 'orden', width: 9 },
        { header: 'Serie', key: 'serie', width: 8 },
        { header: 'Nº factura', key: 'numero', width: 16 },
        { header: 'Fecha expedición', key: 'fecha', width: 14, fmt: 'dd/mm/yyyy' },
        { header: 'Cliente', key: 'cliente', width: 36 },
        { header: 'NIF cliente', key: 'nif', width: 14 },
        { header: 'Base imponible', key: 'base', width: 15, fmt: EUR },
        { header: '% IVA', key: 'tipo', width: 8, fmt: PCT },
        { header: 'Cuota IVA', key: 'cuota', width: 13, fmt: EUR },
        { header: 'Total', key: 'total', width: 14, fmt: EUR },
        { header: 'Estado', key: 'estado', width: 14 },
        { header: 'Archivo PDF', key: 'archivo', width: 55 },
    ], l.emitidas.map(e => ({ orden: e.orden, serie: e.serie, numero: e.numero, fecha: aFecha(e.fecha), cliente: e.cliente, nif: e.nif, base: e.base, tipo: e.tipoIva, cuota: e.cuota, total: e.total, estado: e.estado, archivo: e.archivo })),
        { cliente: 'TOTAL (sin anuladas)', base: l.totales.emitidas.base, cuota: l.totales.emitidas.cuota, total: l.totales.emitidas.total })

    hoja('Recibidas', [
        { header: 'Nº registro', key: 'orden', width: 10 },
        { header: 'Fecha factura', key: 'fecha', width: 13, fmt: 'dd/mm/yyyy' },
        { header: 'Nº factura proveedor', key: 'numProv', width: 20 },
        { header: 'Ref. interna ERP', key: 'interno', width: 14 },
        { header: 'Proveedor', key: 'proveedor', width: 34 },
        { header: 'NIF proveedor', key: 'nif', width: 14 },
        { header: 'Concepto', key: 'concepto', width: 38 },
        { header: 'Categoría', key: 'categoria', width: 18 },
        { header: 'Base imponible', key: 'base', width: 15, fmt: EUR },
        { header: '% IVA', key: 'tipo', width: 8, fmt: PCT },
        { header: 'Cuota IVA', key: 'cuota', width: 13, fmt: EUR },
        { header: '% Retención', key: 'tipoRet', width: 11, fmt: PCT },
        { header: 'Retención', key: 'ret', width: 13, fmt: EUR },
        { header: 'Modelo ret.', key: 'modelo', width: 10 },
        { header: 'Total', key: 'total', width: 14, fmt: EUR },
        { header: 'Documento original', key: 'doc', width: 12 },
        { header: 'Archivo PDF', key: 'archivo', width: 55 },
    ], l.recibidas.map(r => ({ orden: r.orden, fecha: aFecha(r.fecha), numProv: r.numeroProveedor || 'S/N', interno: r.numeroInterno, proveedor: r.proveedor, nif: r.nif, concepto: r.concepto, categoria: r.categoria, base: r.base, tipo: r.tipoIva, cuota: r.cuota, tipoRet: r.tipoRetencion || null, ret: r.retencion || null, modelo: r.modeloRetencion || '', total: r.total, doc: r.tieneDocumento ? 'Sí' : 'NO', archivo: r.archivo || '' })),
        { proveedor: 'TOTAL', base: l.totales.recibidas.base, cuota: l.totales.recibidas.cuota, ret: l.totales.recibidas.retencion, total: l.totales.recibidas.total })

    const tipos = [...new Set([...l.ivaPorTipo.repercutido.map(x => x.tipo), ...l.ivaPorTipo.soportado.map(x => x.tipo)])].sort((a, b) => b - a)
    hoja('IVA por tipo', [
        { header: '% IVA', key: 'tipo', width: 9, fmt: PCT },
        { header: 'Base emitidas', key: 'bv', width: 15, fmt: EUR },
        { header: 'IVA repercutido', key: 'iv', width: 15, fmt: EUR },
        { header: 'Base recibidas', key: 'bc', width: 15, fmt: EUR },
        { header: 'IVA soportado', key: 'ic', width: 15, fmt: EUR },
    ], tipos.map(tp => { const r = l.ivaPorTipo.repercutido.find(x => x.tipo === tp), s = l.ivaPorTipo.soportado.find(x => x.tipo === tp); return { tipo: tp, bv: r?.base || 0, iv: r?.cuota || 0, bc: s?.base || 0, ic: s?.cuota || 0 } }))

    const terceros = [
        { header: 'Nombre', key: 'nombre', width: 38 },
        { header: 'NIF', key: 'nif', width: 14 },
        { header: 'Nº facturas', key: 'num', width: 11 },
        { header: 'Base', key: 'base', width: 15, fmt: EUR },
        { header: 'IVA', key: 'cuota', width: 13, fmt: EUR },
        { header: 'Retención', key: 'retencion', width: 13, fmt: EUR },
        { header: 'Total', key: 'total', width: 15, fmt: EUR },
    ]
    hoja('Por cliente', terceros.filter(c => c.key !== 'retencion'), l.porCliente)
    hoja('Por proveedor', terceros, l.porProveedor)

    if (l.modelo347) {
        hoja('Modelo 347', [
            { header: 'Clave', key: 'clave', width: 22 },
            { header: 'Nombre', key: 'nombre', width: 38 },
            { header: 'NIF', key: 'nif', width: 14 },
            { header: '1T', key: 't1', width: 13, fmt: EUR }, { header: '2T', key: 't2', width: 13, fmt: EUR },
            { header: '3T', key: 't3', width: 13, fmt: EUR }, { header: '4T', key: 't4', width: 13, fmt: EUR },
            { header: 'Total año', key: 'total', width: 15, fmt: EUR },
        ], [
            ...l.modelo347.clientes.map(c => ({ clave: 'B · Ventas', nombre: c.nombre, nif: c.nif, t1: c.trimestres[0], t2: c.trimestres[1], t3: c.trimestres[2], t4: c.trimestres[3], total: c.total })),
            ...l.modelo347.proveedores.map(c => ({ clave: 'A · Compras', nombre: c.nombre, nif: c.nif, t1: c.trimestres[0], t2: c.trimestres[1], t3: c.trimestres[2], t4: c.trimestres[3], total: c.total })),
        ])
    }

    hoja('Avisos', [{ header: 'Nivel', key: 'nivel', width: 12 }, { header: 'Detalle', key: 'texto', width: 140 }],
        l.anomalias.map(a => ({ nivel: a.nivel === 'error' ? 'IMPORTANTE' : 'Revisar', texto: a.texto })))

    return Buffer.from(await wb.xlsx.writeBuffer())
}
