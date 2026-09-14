// Generic table export for Report Labs (Excel via exceljs, or CSV).

import ExcelJS from "exceljs"

export interface ExportColumn {
  key: string
  header: string
  width?: number
}

export interface ExportSheet {
  name: string
  columns: ExportColumn[]
  rows: Record<string, unknown>[]
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export async function exportSheetsToExcel(sheets: ExportSheet[], filename: string) {
  const wb = new ExcelJS.Workbook()
  for (const sheet of sheets) {
    const ws = wb.addWorksheet(sheet.name.slice(0, 31))
    ws.columns = sheet.columns.map((c) => ({ header: c.header, key: c.key, width: c.width ?? 20 }))
    ws.getRow(1).font = { bold: true }
    for (const row of sheet.rows) {
      const out: Record<string, unknown> = {}
      for (const c of sheet.columns) out[c.key] = row[c.key] ?? ""
      ws.addRow(out)
    }
  }
  const buf = await wb.xlsx.writeBuffer()
  triggerDownload(
    new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`,
  )
}

export function exportCsv(sheet: ExportSheet, filename: string) {
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines = [sheet.columns.map((c) => esc(c.header)).join(",")]
  for (const row of sheet.rows) lines.push(sheet.columns.map((c) => esc(row[c.key])).join(","))
  triggerDownload(new Blob([lines.join("\n")], { type: "text/csv" }), filename.endsWith(".csv") ? filename : `${filename}.csv`)
}
