/**
 * Qualitics AI 7차 — AI 결과 → 품번/검사자 상세 링크.
 *
 * VINA 결과는 `/vina/...` 로, 기존 DATA는 `/products`·`/inspectors` 로 연결한다.
 * 분석 기간(startDate·endDate)을 URL에 실어 상세에서도 동일 기준으로 보이게 한다.
 * 사진·부가정보 연결과 달리, 상세의 집계 데이터는 source별 records만 사용한다.
 */

import type { AiBlock } from './aiAsk'
import type { AiDataSource } from './aiDataSource'
import { toEntityId } from './entityId'
import {
  buildInspectorDetailHref,
  buildProductDetailHref,
  type ProductDetailFromId,
} from './productDetailNav'

export type AiDetailLinkPeriod = {
  startDate: string
  endDate: string
} | null

function isProductTable(headers: string[], title: string) {
  const h = headers.join(' ')
  if (!h.includes('품번')) return false
  const t = title.replace(/\s+/g, '')
  // 그룹·불량유형 표는 품번 상세로 보내지 않음
  if (/분석그룹|그룹비교|불량유형|공장별/.test(t)) return false
  return true
}

function isInspectorTable(headers: string[], title: string) {
  const h = headers.join(' ')
  if (!h.includes('검사자') && !h.includes('검사원')) return false
  if (h.includes('품번')) return false
  const t = title.replace(/\s+/g, '')
  if (/불량유형|설비|금형/.test(t)) return false
  return true
}

function productHref(
  name: string,
  vina: boolean,
  period: AiDetailLinkPeriod,
): string {
  const from: ProductDetailFromId = vina ? 'vina-ai' : 'ai'
  return buildProductDetailHref(toEntityId('prd', name), from, {
    startDate: period?.startDate,
    endDate: period?.endDate,
    vina,
  })
}

function inspectorHref(
  name: string,
  vina: boolean,
  period: AiDetailLinkPeriod,
): string {
  const params = new URLSearchParams({ from: vina ? 'vina-ai' : 'ai' })
  if (period?.startDate) params.set('startDate', period.startDate)
  if (period?.endDate) params.set('endDate', period.endDate)
  return buildInspectorDetailHref(toEntityId('ins', name), {
    vina,
    carryFrom: params,
  })
}

function barLooksLikeProductRanking(title: string) {
  const t = title.replace(/\s+/g, '').toLowerCase()
  if (/검사자|검사원|설비|금형|작업자|성형|lot|공장별|불량유형/.test(t)) {
    return false
  }
  return /품번|top|부적합|검수|폐기|불량률|워스트|worst/.test(t)
}

function barLooksLikeInspectorRanking(title: string) {
  const t = title.replace(/\s+/g, '').toLowerCase()
  return /검사자|검사원/.test(t) && /top|검수|부적합|uph/.test(t)
}

/**
 * AI 표·막대에 상세페이지 href를 붙인다.
 * source(VINA/기존)와 기간을 유지해 UI에서 잘못 기존 상세로 가지 않게 한다.
 */
export function attachAiDetailLinks(
  blocks: AiBlock[],
  options: {
    dataSource: Exclude<AiDataSource, 'compare'>
    period?: AiDetailLinkPeriod
  },
): AiBlock[] {
  const vina = options.dataSource === 'vina'
  const period = options.period ?? null
  const sourceLabel = vina ? 'VINA' : 'EXISTING'

  return blocks.map((block) => {
    if (block.type === 'table') {
      const headers = block.headers
      if (isProductTable(headers, block.title)) {
        const col = headers.findIndex((h) => h.includes('품번'))
        if (col < 0) return block
        const rowHrefs = block.rows.map((row) => {
          const name = String(row[col] ?? '').trim()
          if (!name || name === '-') return null
          return productHref(name, vina, period)
        })
        return {
          ...block,
          rowHrefs,
          linkColumn: col,
          detailNav: {
            source: sourceLabel,
            entity: 'product' as const,
            period: period
              ? { start: period.startDate, end: period.endDate }
              : null,
          },
        }
      }
      if (isInspectorTable(headers, block.title)) {
        const col = headers.findIndex(
          (h) => h.includes('검사자') || h.includes('검사원'),
        )
        if (col < 0) return block
        const rowHrefs = block.rows.map((row) => {
          const name = String(row[col] ?? '').trim()
          if (!name || name === '-') return null
          return inspectorHref(name, vina, period)
        })
        return {
          ...block,
          rowHrefs,
          linkColumn: col,
          detailNav: {
            source: sourceLabel,
            entity: 'inspector' as const,
            period: period
              ? { start: period.startDate, end: period.endDate }
              : null,
          },
        }
      }
      return block
    }

    if (block.type === 'bar') {
      if (barLooksLikeProductRanking(block.title)) {
        const nameHrefs: Record<string, string> = {}
        for (const d of block.data) {
          const name = String(d.name ?? '').trim()
          if (!name || name === '-') continue
          nameHrefs[name] = productHref(name, vina, period)
        }
        if (!Object.keys(nameHrefs).length) return block
        return {
          ...block,
          nameHrefs,
          detailNav: {
            source: sourceLabel,
            entity: 'product' as const,
            period: period
              ? { start: period.startDate, end: period.endDate }
              : null,
          },
        }
      }
      if (barLooksLikeInspectorRanking(block.title)) {
        const nameHrefs: Record<string, string> = {}
        for (const d of block.data) {
          const name = String(d.name ?? '').trim()
          if (!name || name === '-') continue
          nameHrefs[name] = inspectorHref(name, vina, period)
        }
        if (!Object.keys(nameHrefs).length) return block
        return {
          ...block,
          nameHrefs,
          detailNav: {
            source: sourceLabel,
            entity: 'inspector' as const,
            period: period
              ? { start: period.startDate, end: period.endDate }
              : null,
          },
        }
      }
    }

    return block
  })
}
