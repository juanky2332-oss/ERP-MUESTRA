  import jsPDF from 'jspdf'
  import autoTable from 'jspdf-autotable'
  import { format } from 'date-fns'
  import { es } from 'date-fns/locale'

  export const generatePDF = async (doc: any, type: 'presupuesto' | 'albaran' | 'factura', mode: 'preview' | 'download' | 'blob' | 'arraybuffer' = 'download', opts: { logoDataUrl?: string | null } = {}) => {
      const docTitle = type === 'presupuesto' ? 'PRESUPUESTO' : type === 'albaran' ? 'ALBARÁN' : 'FACTURA'

      const jsPDFInstance = new jsPDF()

      // 1. Logo
      try {
          const logo = opts.logoDataUrl ?? (await getImageData('/icon-512.png'))?.data
          if (logo) {
              jsPDFInstance.addImage(logo, 'PNG', 15, 15, 22, 22)
          }
      } catch (e) {
          console.warn('Logo not loaded', e)
      }

      // 2. Company Info (Upper Left)
      jsPDFInstance.setFontSize(10)
      jsPDFInstance.setFont('helvetica', 'bold')
      jsPDFInstance.text('EMPRESA X, S.L.', 15, 55)

      jsPDFInstance.setFontSize(8)
      jsPDFInstance.setTextColor(80, 80, 80)
      jsPDFInstance.setFont('helvetica', 'normal')
      jsPDFInstance.text('NIF: B00000000', 15, 60)
      jsPDFInstance.text('Calle Ejemplo, 1', 15, 64)
      jsPDFInstance.text('30000 - Ciudad Ejemplo (Murcia)', 15, 68)
      jsPDFInstance.text('Email: administracion@empresax-demo.com', 15, 72)
      jsPDFInstance.text('Tel: 600 000 000', 15, 76)

      // 3. Document info box (Upper Right)
      const rightAlignX = 195
      jsPDFInstance.setTextColor(0, 0, 0)
      jsPDFInstance.setFontSize(24)
      jsPDFInstance.setFont('helvetica', 'bold')
      jsPDFInstance.text(docTitle, rightAlignX, 30, { align: 'right' })

      jsPDFInstance.setFontSize(10)
      jsPDFInstance.setFont('helvetica', 'normal')
      const docNum = doc.numero && !doc.numero.includes('undefined') ? doc.numero : 'PENDIENTE'

      // Info headers table-like alignment
      let currentInfoY = 38
      jsPDFInstance.setFont('helvetica', 'bold')
      jsPDFInstance.text('Nº DOCUMENTO:', rightAlignX - 60, currentInfoY)
      jsPDFInstance.setFont('helvetica', 'normal')
      jsPDFInstance.text(docNum, rightAlignX, currentInfoY, { align: 'right' })
      currentInfoY += 6

      if (doc.albaran_origen_numero) {
          jsPDFInstance.setFont('helvetica', 'bold')
          jsPDFInstance.text('Nº ALBARÁN:', rightAlignX - 60, currentInfoY)
          jsPDFInstance.setFont('helvetica', 'normal')
          jsPDFInstance.text(doc.albaran_origen_numero, rightAlignX, currentInfoY, { align: 'right' })
          currentInfoY += 6
      }

      if (doc.presupuesto_origen_numero) {
          jsPDFInstance.setFont('helvetica', 'bold')
          jsPDFInstance.text('Nº PRESUPUESTO:', rightAlignX - 60, currentInfoY)
          jsPDFInstance.setFont('helvetica', 'normal')
          jsPDFInstance.text(doc.presupuesto_origen_numero, rightAlignX, currentInfoY, { align: 'right' })
          currentInfoY += 6
      }

      jsPDFInstance.setFont('helvetica', 'bold')
      jsPDFInstance.text('FECHA:', rightAlignX - 60, currentInfoY)
      jsPDFInstance.setFont('helvetica', 'normal')
      jsPDFInstance.text(format(new Date(doc.fecha), 'dd/MM/yyyy'), rightAlignX, currentInfoY, { align: 'right' })
      currentInfoY += 6

      if (doc.pedido_referencia) {
          jsPDFInstance.setFont('helvetica', 'bold')
          jsPDFInstance.text('SU REFERENCIA:', rightAlignX - 60, currentInfoY)
          jsPDFInstance.setFont('helvetica', 'normal')
          jsPDFInstance.text(doc.pedido_referencia, rightAlignX, currentInfoY, { align: 'right' })
          currentInfoY += 6
      }

      if (type === 'factura' && doc.fecha_vencimiento) {
          jsPDFInstance.setFont('helvetica', 'bold')
          jsPDFInstance.text('VENCIMIENTO:', rightAlignX - 60, currentInfoY)
          jsPDFInstance.setFont('helvetica', 'normal')
          jsPDFInstance.text(format(new Date(doc.fecha_vencimiento), 'dd/MM/yyyy'), rightAlignX, currentInfoY, { align: 'right' })
          currentInfoY += 6
      }

      if (type === 'presupuesto' && doc.fecha_validez) {
          jsPDFInstance.setFont('helvetica', 'bold')
          jsPDFInstance.text('VÁLIDO HASTA:', rightAlignX - 60, currentInfoY)
          jsPDFInstance.setFont('helvetica', 'normal')
          jsPDFInstance.text(format(new Date(doc.fecha_validez), 'dd/MM/yyyy'), rightAlignX, currentInfoY, { align: 'right' })
          currentInfoY += 6
      }

      // Client Block (Right Side, under info)
      const clientX = 110
      const clientY = 60
      jsPDFInstance.setFont('helvetica', 'bold')
      jsPDFInstance.setFontSize(9)
      jsPDFInstance.text('CLIENTE:', clientX, clientY)

      jsPDFInstance.setFont('helvetica', 'normal')
      jsPDFInstance.setFontSize(10)
      let currentClientY = clientY + 5
      const clienteName = doc.cliente?.razon_social || doc.cliente_razon_social || ''
      if (clienteName) {
          jsPDFInstance.setFont('helvetica', 'bold')
          jsPDFInstance.text(clienteName, clientX, currentClientY)
          jsPDFInstance.setFont('helvetica', 'normal')
          currentClientY += 5
      }
      const clienteCif = doc.cliente?.cif || doc.cliente_cif || ''
      if (clienteCif) {
          jsPDFInstance.text(`CIF/NIF: ${clienteCif}`, clientX, currentClientY)
          currentClientY += 5
      }
      const clienteDir = doc.cliente?.direccion || doc.cliente_direccion || ''
      if (clienteDir) {
          const splitAddr = jsPDFInstance.splitTextToSize(clienteDir, 85)
          jsPDFInstance.text(splitAddr, clientX, currentClientY)
          currentClientY += (splitAddr.length * 5)
      }
      const clienteCP = doc.cliente?.codigo_postal || doc.cliente_codigo_postal || ''
      const clienteCiudad = doc.cliente?.ciudad || doc.cliente_ciudad || ''
      const clienteProvincia = doc.cliente?.provincia || doc.cliente_provincia || ''
      if (clienteCP || clienteCiudad || clienteProvincia) {
          const parts: string[] = []
          if (clienteCP) parts.push(clienteCP)
          if (clienteCiudad) parts.push(clienteCiudad)
          const locationLine = clienteProvincia ? `${parts.join(' ')} (${clienteProvincia})` : parts.join(' ')
          if (locationLine.trim()) jsPDFInstance.text(locationLine.trim(), clientX, currentClientY)
      }

      // 4. Main Table
      const startY = 100
      const mainBoxBottomY = 230
      const totalsBoxY = 235

      const colWidths = {
          desc: 105,
          qty: 25,
          price: 25,
          total: 25
      }
      const marginX = 15
      const tableWidth = 180

      const xDesc = marginX
      const xQty = xDesc + colWidths.desc
      const xPrice = xQty + colWidths.qty
      const xTotal = xPrice + colWidths.price
      const xEnd = xTotal + colWidths.total

      // Vertical Lines & Border
      jsPDFInstance.setDrawColor(200)
      jsPDFInstance.setLineWidth(0.1)
      jsPDFInstance.rect(marginX, startY, tableWidth, mainBoxBottomY - startY)
      jsPDFInstance.line(xQty, startY, xQty, mainBoxBottomY)
      jsPDFInstance.line(xPrice, startY, xPrice, mainBoxBottomY)
      jsPDFInstance.line(xTotal, startY, xTotal, mainBoxBottomY)

      // Table Header Background
      jsPDFInstance.setFillColor(245, 245, 245)
      jsPDFInstance.rect(marginX, startY, tableWidth, 10, 'F')
      jsPDFInstance.setDrawColor(0)
      jsPDFInstance.line(marginX, startY + 10, marginX + tableWidth, startY + 10)

      jsPDFInstance.setFontSize(9)
      jsPDFInstance.setFont('helvetica', 'bold')
      jsPDFInstance.text('DESCRIPCION', xDesc + 5, startY + 6.5)
      jsPDFInstance.text('CANTIDAD', xQty + (colWidths.qty / 2), startY + 6.5, { align: 'center' })
      jsPDFInstance.text('PRECIO', xPrice + (colWidths.price / 2), startY + 6.5, { align: 'center' })
      jsPDFInstance.text('IMPORTE', xTotal + (colWidths.total / 2), startY + 6.5, { align: 'center' })

      // Table Content
      const tableBody = doc.lineas.map((line: any) => [
          line.descripcion,
          Number(line.cantidad).toLocaleString('es-ES'),
          `${Number(line.precio_unitario).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`,
          `${(Number(line.cantidad) * Number(line.precio_unitario)).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
      ])

      autoTable(jsPDFInstance, {
          startY: startY + 10,
          body: tableBody,
          theme: 'plain',
          tableWidth: tableWidth,
          margin: { left: marginX },
          styles: {
              fontSize: 9,
              cellPadding: 4,
              valign: 'top',
              textColor: 0,
              font: 'helvetica'
          },
          columnStyles: {
              0: { cellWidth: colWidths.desc },
              1: { cellWidth: colWidths.qty, halign: 'center' },
              2: { cellWidth: colWidths.price, halign: 'center' },
              3: { cellWidth: colWidths.total, halign: 'center' }
          }
      })

      // Observations
      const finalY = (jsPDFInstance as any).lastAutoTable.finalY || (startY + 15)
      if (doc.observaciones) {
          jsPDFInstance.setFont('helvetica', 'bold')
          jsPDFInstance.text('OBSERVACIONES:', marginX, finalY + 30)
          jsPDFInstance.setFont('helvetica', 'normal')
          const splitObs = jsPDFInstance.splitTextToSize(doc.observaciones, tableWidth - 10)
          jsPDFInstance.text(splitObs, marginX, finalY + 35)
      }

      // Totals Box
      const baseImponible = Number(doc.base_imponible) || doc.lineas.reduce((acc: number, l: any) => acc + (Number(l.cantidad) * Number(l.precio_unitario)), 0)
      const ivaPct = Number(doc.iva_porcentaje) || 21
      const ivaImp = Number(doc.iva_importe) || (baseImponible * (ivaPct / 100))
      const totalDoc = Number(doc.total) || (baseImponible + ivaImp)

      const footerX = 140
      const footerWidth = 55
      let footerY = totalsBoxY

      const drawFooterRow = (label: string, value: string, isTotal = false) => {
          jsPDFInstance.setDrawColor(200)
          jsPDFInstance.rect(footerX, footerY, footerWidth, 8)
          jsPDFInstance.setFont('helvetica', isTotal ? 'bold' : 'normal')
          if (isTotal) jsPDFInstance.setFillColor(245, 245, 245), jsPDFInstance.rect(footerX, footerY, footerWidth, 8, 'F')

          jsPDFInstance.setFontSize(8)
          jsPDFInstance.text(label, footerX + 2, footerY + 5.5)
          jsPDFInstance.setFontSize(9)
          jsPDFInstance.text(value, footerX + footerWidth - 2, footerY + 5.5, { align: 'right' })
          footerY += 8
      }

      drawFooterRow('BASE IMPONIBLE', `${baseImponible.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`)
      drawFooterRow(`IVA ${ivaPct}%`, `${ivaImp.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`)
      drawFooterRow('TOTAL', `${totalDoc.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`, true)

      if (type === 'factura' && (doc.forma_pago || doc.metodo_pago)) {
          jsPDFInstance.setFont('helvetica', 'bold')
          jsPDFInstance.setFontSize(8)
          jsPDFInstance.text('FORMA DE PAGO:', marginX, totalsBoxY + 5)
          jsPDFInstance.setFont('helvetica', 'normal')
          const lineasPago = jsPDFInstance.splitTextToSize(String(doc.forma_pago || doc.metodo_pago), 115)
          jsPDFInstance.text(lineasPago, marginX, totalsBoxY + 10)
          if (doc.iban) jsPDFInstance.text(`IBAN: ${doc.iban}`, marginX, totalsBoxY + 10 + lineasPago.length * 4)
      }

      if (mode === 'preview') {
          const blob = jsPDFInstance.output('bloburl')
          return blob
      } else if (mode === 'arraybuffer') {
          return jsPDFInstance.output('arraybuffer')
      } else if (mode === 'blob') {
          return jsPDFInstance.output('blob')
      } else {
          jsPDFInstance.save(`${docTitle}_${docNum}.pdf`)
      }
  }

  export const generateGastoPDF = async (gasto: any, mode: 'preview' | 'download' | 'blob' = 'download') => {
      const jsPDFInstance = new jsPDF()

      try {
          const imgProps = await getImageData('/icon-512.png')
          if (imgProps) {
              jsPDFInstance.addImage(imgProps.data, 'PNG', 15, 15, 22, 22)
          }
      } catch (e) {
          console.warn('Logo not loaded', e)
      }

      jsPDFInstance.setFontSize(10)
      jsPDFInstance.setFont('helvetica', 'bold')
      jsPDFInstance.text('EMPRESA X, S.L.', 15, 55)
      jsPDFInstance.setFontSize(8)
      jsPDFInstance.setTextColor(80, 80, 80)
      jsPDFInstance.setFont('helvetica', 'normal')
      jsPDFInstance.text('NIF: B00000000', 15, 60)
      jsPDFInstance.text('Calle Ejemplo, 1', 15, 64)
      jsPDFInstance.text('30000 - Ciudad Ejemplo (Murcia)', 15, 68)
      jsPDFInstance.text('Email: administracion@empresax-demo.com', 15, 72)
      jsPDFInstance.text('Tel: 600 000 000', 15, 76)

      const rightAlignX = 195
      jsPDFInstance.setTextColor(0, 0, 0)
      jsPDFInstance.setFontSize(20)
      jsPDFInstance.setFont('helvetica', 'bold')
      jsPDFInstance.text('GASTO', rightAlignX, 30, { align: 'right' })

      jsPDFInstance.setFontSize(10)
      let currentInfoY = 38
      const docNum = gasto.numero || 'S/N'

      jsPDFInstance.setFont('helvetica', 'bold')
      jsPDFInstance.text('Nº DOCUMENTO:', rightAlignX - 60, currentInfoY)
      jsPDFInstance.setFont('helvetica', 'normal')
      jsPDFInstance.text(docNum, rightAlignX, currentInfoY, { align: 'right' })
      currentInfoY += 6

      if (gasto.fecha) {
          jsPDFInstance.setFont('helvetica', 'bold')
          jsPDFInstance.text('FECHA:', rightAlignX - 60, currentInfoY)
          jsPDFInstance.setFont('helvetica', 'normal')
          jsPDFInstance.text(format(new Date(gasto.fecha), 'dd/MM/yyyy'), rightAlignX, currentInfoY, { align: 'right' })
          currentInfoY += 6
      }

      if (gasto.referencia_pedido) {
          jsPDFInstance.setFont('helvetica', 'bold')
          jsPDFInstance.text('REFERENCIA:', rightAlignX - 60, currentInfoY)
          jsPDFInstance.setFont('helvetica', 'normal')
          jsPDFInstance.text(gasto.referencia_pedido, rightAlignX, currentInfoY, { align: 'right' })
      }

      const supplierX = 110
      jsPDFInstance.setFont('helvetica', 'bold')
      jsPDFInstance.setFontSize(9)
      jsPDFInstance.text('PROVEEDOR:', supplierX, 60)
      jsPDFInstance.setFont('helvetica', 'normal')
      jsPDFInstance.setFontSize(10)
      if (gasto.proveedor) {
          jsPDFInstance.setFont('helvetica', 'bold')
          jsPDFInstance.text(gasto.proveedor, supplierX, 66)
          jsPDFInstance.setFont('helvetica', 'normal')
      }
      if (gasto.proveedor_cif) {
          jsPDFInstance.setFontSize(8)
          jsPDFInstance.setTextColor(80, 80, 80)
          jsPDFInstance.text(`CIF/NIF: ${gasto.proveedor_cif}`, supplierX, 72)
          jsPDFInstance.setTextColor(0, 0, 0)
      }

      const startY = 95
      const marginX = 15
      const tableWidth = 180

      jsPDFInstance.setFillColor(245, 245, 245)
      jsPDFInstance.rect(marginX, startY, tableWidth, 8, 'F')
      jsPDFInstance.setDrawColor(200)
      jsPDFInstance.setLineWidth(0.1)
      jsPDFInstance.rect(marginX, startY, tableWidth, 8)
      jsPDFInstance.setFont('helvetica', 'bold')
      jsPDFInstance.setFontSize(9)
      jsPDFInstance.setTextColor(0, 0, 0)
      jsPDFInstance.text('DESCRIPCIÓN DEL GASTO', marginX + 3, startY + 5.5)

      const desc = gasto.descripcion || gasto.concepto || 'Sin descripción'
      jsPDFInstance.setFont('helvetica', 'normal')
      const splitDesc = jsPDFInstance.splitTextToSize(desc, tableWidth - 6)
      jsPDFInstance.text(splitDesc, marginX + 3, startY + 16)

      const footerX = 140
      const footerWidth = 55
      let footerY = startY + 42

      const baseImponible = Number(gasto.base_imponible) || 0
      const ivaPct = Number(gasto.iva_porcentaje) || 21
      const ivaImp = Number(gasto.iva_importe) || 0
      const totalDoc = Number(gasto.total) || 0

      const drawRow = (label: string, value: string, isTotal = false) => {
          jsPDFInstance.setDrawColor(200)
          jsPDFInstance.rect(footerX, footerY, footerWidth, 8)
          if (isTotal) {
              jsPDFInstance.setFillColor(245, 245, 245)
              jsPDFInstance.rect(footerX, footerY, footerWidth, 8, 'F')
          }
          jsPDFInstance.setFont('helvetica', isTotal ? 'bold' : 'normal')
          jsPDFInstance.setFontSize(8)
          jsPDFInstance.text(label, footerX + 2, footerY + 5.5)
          jsPDFInstance.setFontSize(9)
          jsPDFInstance.text(value, footerX + footerWidth - 2, footerY + 5.5, { align: 'right' })
          footerY += 8
      }

      drawRow('BASE IMPONIBLE', `${baseImponible.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`)
      drawRow(`IVA ${ivaPct}%`, `${ivaImp.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`)
      drawRow('TOTAL', `${totalDoc.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`, true)

      const safeNum = docNum.replace(/[/\\?%*:|"<>]/g, '-')

      if (mode === 'preview') {
          return jsPDFInstance.output('bloburl')
      } else if (mode === 'blob') {
          return jsPDFInstance.output('blob')
      } else {
          jsPDFInstance.save(`Gasto_${safeNum}.pdf`)
      }
  }

  function getImageData(url: string): Promise<{ data: string, width: number, height: number } | null> {
      // En servidor no hay Image/canvas: el logo se pasa ya cargado en opts.logoDataUrl.
      if (typeof window === 'undefined') return Promise.resolve(null)
      return new Promise((resolve) => {
          const img = new Image();
          img.src = url;
          img.onload = () => {
              const canvas = document.createElement('canvas');
              canvas.width = img.width;
              canvas.height = img.height;
              const ctx = canvas.getContext('2d');
              if (!ctx) return resolve(null);
              ctx.drawImage(img, 0, 0);
              resolve({ data: canvas.toDataURL('image/png'), width: img.width, height: img.height });
          };
          img.onerror = () => resolve(null);
      });
  }
