import * as XLSX from 'xlsx'
import type { Borders } from 'exceljs'

export function downloadExcel(filename: string, rows: Record<string, unknown>[]) {
  const sheet = XLSX.utils.json_to_sheet(rows)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, sheet, '분석')
  const array = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })
  const blob = new Blob([array], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  triggerDownload(blob, filename)
}

const THIN_BORDER: Partial<Borders> = {
  top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
  left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
  bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
  right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
}

const KNOWN_NUMBER_HEADERS = new Set([
  '검수량',
  '합격수',
  '부적합수',
  '부적합률',
  '폐기금액',
])

function isNumberHeader(header: string, value: unknown) {
  if (KNOWN_NUMBER_HEADERS.has(header)) return true
  return typeof value === 'number' && Number.isFinite(value)
}

function displayWidth(text: string) {
  let width = 0
  for (const ch of text) {
    width += ch.charCodeAt(0) > 127 ? 1.8 : 1
  }
  return width
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/** 검사 DATA · 오류 DATA용 — 헤더 고정·필터·열 너비·서식 적용 */
export async function downloadStyledExcel(
  filename: string,
  rows: Record<string, string | number>[],
  options?: { sheetName?: string },
) {
  const ExcelJS = await import('exceljs')
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Qualitics'
  workbook.created = new Date()

  const sheetName = (options?.sheetName ?? 'DATA').slice(0, 31)
  const sheet = workbook.addWorksheet(sheetName, {
    views: [{ state: 'frozen', ySplit: 1, activeCell: 'A2' }],
  })

  const headers = rows[0] ? Object.keys(rows[0]) : []
  if (headers.length === 0) {
    sheet.addRow(['다운로드할 데이터가 없습니다.'])
  } else {
    const headerRow = sheet.addRow(headers)
    headerRow.height = 24
    headerRow.eachCell((cell) => {
      cell.font = {
        bold: true,
        color: { argb: 'FFFFFFFF' },
        size: 11,
        name: '맑은 고딕',
      }
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1E3A5F' },
      }
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
      cell.border = THIN_BORDER
    })

    rows.forEach((row, index) => {
      const dataRow = sheet.addRow(headers.map((h) => row[h] ?? ''))
      const zebra = index % 2 === 1
      dataRow.eachCell((cell, colNumber) => {
        const header = headers[colNumber - 1] ?? ''
        const raw = row[header]
        cell.font = { name: '맑은 고딕', size: 10, color: { argb: 'FF0F172A' } }
        cell.border = THIN_BORDER
        if (zebra) {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFF8FAFC' },
          }
        }

        if (isNumberHeader(header, raw)) {
          const num = typeof raw === 'number' ? raw : Number(raw)
          if (Number.isFinite(num)) cell.value = num
          cell.alignment = { vertical: 'middle', horizontal: 'right' }
          cell.numFmt = '#,##0'
        } else {
          cell.alignment = {
            vertical: 'middle',
            horizontal: 'left',
            wrapText: header === '이슈',
          }
        }

        if (header === '상태') {
          const status = String(cell.value ?? '')
          if (status === '오류') {
            cell.font = { name: '맑은 고딕', size: 10, bold: true, color: { argb: 'FFB91C1C' } }
          } else if (status === '경고') {
            cell.font = { name: '맑은 고딕', size: 10, bold: true, color: { argb: 'FFB45309' } }
          } else if (status === '정상') {
            cell.font = { name: '맑은 고딕', size: 10, bold: true, color: { argb: 'FF15803D' } }
          }
        }
      })
    })

    headers.forEach((header, idx) => {
      let max = displayWidth(header)
      for (const row of rows) {
        max = Math.max(max, displayWidth(String(row[header] ?? '')))
      }
      const cap = header === '이슈' ? 48 : 28
      sheet.getColumn(idx + 1).width = Math.min(Math.max(max + 2, 10), cap)
    })

    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: Math.max(rows.length, 1) + 1, column: headers.length },
    }
  }

  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  triggerDownload(blob, filename)
}
