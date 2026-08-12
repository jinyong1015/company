import * as XLSX from 'xlsx'

export function downloadExcel(filename: string, rows: Record<string, unknown>[]) {
  const sheet = XLSX.utils.json_to_sheet(rows)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, sheet, '분석')
  const array = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })
  const blob = new Blob([array], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
