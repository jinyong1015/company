import type { Analytics, ProductRow } from '../types'

function compact(text: string) {
  return text.toLowerCase().replace(/\s+/g, '')
}

function topN(text: string, fallback = 5) {
  const match = text.match(/top\s*(\d+)|상위\s*(\d+)|(\d+)\s*개/i)
  const n = Number(match?.[1] || match?.[2] || match?.[3] || fallback)
  return Number.isFinite(n) && n > 0 ? Math.min(n, 20) : fallback
}

function includesAny(text: string, words: string[]) {
  return words.some((w) => text.includes(w))
}

function typeHint(text: string, types: string[]) {
  const n = compact(text)
  if (includesAny(n, ['seal', '실링', '씰'])) return 'seal'
  if (includesAny(n, ['그로멧', 'grommet'])) return 'grommet'
  if (n.includes('유압')) return 'hydraulic'
  const found = types.find((t) => t && n.includes(compact(t)))
  return found ?? null
}

function matchesType(product: ProductRow, hint: string) {
  const type = compact(product.type)
  const name = compact(product.name)
  if (hint === 'seal') {
    return (
      includesAny(type, ['seal', '실링', '씰']) ||
      includesAny(name, ['seal', 'oring', 'o-ring', '실링'])
    )
  }
  if (hint === 'grommet') {
    return includesAny(type, ['그로멧', 'grommet']) || includesAny(name, ['grommet', '그로멧'])
  }
  if (hint === 'hydraulic') {
    return type.includes('유압') || includesAny(name, ['hyd', '유압'])
  }
  return type.includes(compact(hint)) || name.includes(compact(hint))
}

function scopeLabel(hint: string | null, team: string | null) {
  const parts = [team, hint === 'seal' ? 'SEAL' : hint === 'grommet' ? '그로멧' : hint === 'hydraulic' ? '유압' : hint]
    .filter(Boolean)
  return parts.length ? parts.join(' · ') : '전체'
}

function formatProduct(p: ProductRow, i: number, metric: 'failRate' | 'qty' | 'scrapCost' | 'changeRate') {
  if (metric === 'scrapCost') {
    return `${i + 1}. ${p.name}(${p.type}) · ₩${p.scrapCost.toLocaleString()} · 부적합률 ${p.failRate.toFixed(2)}% · ${p.mainDefect}`
  }
  if (metric === 'qty') {
    return `${i + 1}. ${p.name}(${p.type}) · 검수량 ${p.qty.toLocaleString()} · 부적합률 ${p.failRate.toFixed(2)}%`
  }
  if (metric === 'changeRate') {
    return `${i + 1}. ${p.name}(${p.type}) · ${p.changeRate > 0 ? '+' : ''}${p.changeRate.toFixed(2)}%p · 부적합률 ${p.failRate.toFixed(2)}%`
  }
  return `${i + 1}. ${p.name}(${p.type}) · ${p.failRate.toFixed(2)}% · 부적합 ${p.fail.toLocaleString()} · ${p.mainDefect}`
}

export function answerQuestion(q: string, analytics: Analytics) {
  const text = q.trim()
  const n = compact(text)
  if (!text) return ['질문을 입력하세요.']

  const limit = topN(text)
  const hint = typeHint(text, analytics.filterOptions.productTypes)
  const team = n.includes('2공장') ? '2공장' : n.includes('본사') ? '본사' : null
  const inspectorHit = analytics.inspectors.find((i) => n.includes(compact(i.name)))
  const equipmentHit = analytics.equipment.find((e) => e.name && n.includes(compact(e.name)))
  const productHit = analytics.products.find((p) => n.includes(compact(p.name)))
  const scope = scopeLabel(hint, team)

  let products = [...analytics.products]
  if (hint) products = products.filter((p) => matchesType(p, hint))
  if (team) {
    const inspectorNames = new Set(
      analytics.inspectors.filter((i) => i.team.includes(team)).map((i) => i.name),
    )
    if (inspectorNames.size) {
      products = products.filter((p) =>
        analytics.inspectors.some(
          (i) => inspectorNames.has(i.name) && i.products.some((x) => x.product === p.name),
        ),
      )
    }
  }

  if (n.includes('비교')) {
    const rows = analytics.groupSummaries
    return [
      '분석 그룹별 비교입니다. (#N/A 제외)',
      ...rows.map(
        (g) =>
          `${g.label}: 검수량 ${g.qty.toLocaleString()} · 부적합률 ${g.failRate.toFixed(2)}% · 부적합 ${g.fail.toLocaleString()} · 폐기비용 ₩${g.scrapCost.toLocaleString()}`,
      ),
    ]
  }

  if (inspectorHit && (n.includes('품번') || n.includes('무엇') || n.includes('많이'))) {
    const rows = [...inspectorHit.products].sort((a, b) => b.qty - a.qty).slice(0, limit)
    return [
      `${inspectorHit.name}(${inspectorHit.team})이 검사한 품번 TOP ${rows.length}입니다.`,
      ...rows.map(
        (p, i) =>
          `${i + 1}. ${p.product} · ${p.qty.toLocaleString()} EA · 부적합률 ${p.failRate.toFixed(2)}%`,
      ),
    ]
  }

  if (equipmentHit) {
    const rows = [...equipmentHit.products].sort((a, b) =>
      n.includes('부적합') ? b.failRate - a.failRate : b.qty - a.qty,
    ).slice(0, limit)
    return [
      `${equipmentHit.name}에서 검사한 품번입니다. 부적합률 ${equipmentHit.failRate.toFixed(2)}%`,
      ...rows.map(
        (p, i) =>
          `${i + 1}. ${p.product} · 검수량 ${p.qty.toLocaleString()} · 부적합률 ${p.failRate.toFixed(2)}%`,
      ),
    ]
  }

  if (productHit && (n.includes('왜') || n.includes('원인') || n.includes('분석'))) {
    return [
      `${productHit.name}(${productHit.type}) 품질 요약입니다.`,
      `검수량 ${productHit.qty.toLocaleString()} · 부적합 ${productHit.fail.toLocaleString()} · 부적합률 ${productHit.failRate.toFixed(2)}%`,
      `폐기비용 ₩${productHit.scrapCost.toLocaleString()} · UPH ${productHit.uph} · 주요 불량 ${productHit.mainDefect}`,
      productHit.defectSummary ? `불량 내역: ${productHit.defectSummary}` : '불량 상세가 없습니다.',
    ]
  }

  if (includesAny(n, ['불량유형', '어떤불량', '불량top', '불량종류']) && !n.includes('품번')) {
    return [
      `${scope} 기준 불량 유형 TOP ${Math.min(limit, analytics.defectTypes.length)}입니다.`,
      ...analytics.defectTypes
        .slice(0, limit)
        .map((d, i) => `${i + 1}. ${d.name} · ${d.count.toLocaleString()}건 · ${d.share}% ${d.delta ?? ''}`),
    ]
  }

  if (includesAny(n, ['폐기', '비용']) && !n.includes('부적합률')) {
    const rows = [...products].sort((a, b) => b.scrapCost - a.scrapCost).slice(0, limit)
    if (!rows.length) return [`${scope}에서 해당 품번 데이터가 없습니다.`]
    return [
      `${scope}에서 폐기비용이 높은 품번 TOP ${rows.length}입니다.`,
      ...rows.map((p, i) => formatProduct(p, i, 'scrapCost')),
    ]
  }

  if (includesAny(n, ['검사자']) && includesAny(n, ['품번'])) {
    const ranked = [...analytics.inspectors].sort((a, b) => b.products.length - a.products.length)
    const top = ranked[0]
    return top
      ? [
          `가장 많은 품번을 검사한 검사자는 ${top.name}(${top.team})입니다. 품번 ${top.products.length}종 · 검수량 ${top.qty.toLocaleString()} EA`,
          ...top.products
            .slice(0, limit)
            .map((p, i) => `${i + 1}. ${p.product} · ${p.qty.toLocaleString()} EA`),
        ]
      : ['검사자 데이터가 없습니다.']
  }

  if (includesAny(n, ['검사자', '검사원', '누구'])) {
    const ranked = [...analytics.inspectors].sort((a, b) =>
      n.includes('uph') ? b.uph - a.uph : n.includes('부적합') ? b.failRate - a.failRate : b.qty - a.qty,
    )
    return [
      n.includes('uph')
        ? 'UPH가 높은 검사자입니다.'
        : n.includes('부적합')
          ? '부적합률이 높은 검사자입니다.'
          : '검수량이 많은 검사자입니다.',
      ...ranked
        .slice(0, limit)
        .map(
          (i, idx) =>
            `${idx + 1}. ${i.name}(${i.team}) · ${i.qty.toLocaleString()} EA · 부적합률 ${i.failRate.toFixed(2)}% · UPH ${i.uph}`,
        ),
    ]
  }

  if (includesAny(n, ['증가', '지난달', '이전기간'])) {
    const rows = [...products].sort((a, b) => b.changeRate - a.changeRate).slice(0, limit)
    if (!rows.length) return [`${scope}에서 해당 품번 데이터가 없습니다.`]
    return [
      `${scope}에서 이전 기간 대비 부적합률이 가장 많이 증가한 품번입니다.`,
      ...rows.map((p, i) => formatProduct(p, i, 'changeRate')),
    ]
  }

  if (includesAny(n, ['설비'])) {
    const ranked = [...analytics.equipment].sort((a, b) =>
      n.includes('부적합') ? b.failRate - a.failRate : b.qty - a.qty,
    )
    return [
      n.includes('부적합') ? '부적합률이 높은 설비입니다.' : '검사량이 많은 설비입니다.',
      ...ranked
        .slice(0, limit)
        .map(
          (e, i) =>
            `${i + 1}. ${e.name} · 검수량 ${e.qty.toLocaleString()} · 부적합률 ${e.failRate.toFixed(2)}% · ${e.mainDefect}`,
        ),
    ]
  }

  if (includesAny(n, ['금형'])) {
    const ranked = [...analytics.molds].sort((a, b) =>
      n.includes('부적합') ? b.failRate - a.failRate : b.qty - a.qty,
    )
    return [
      '금형별 품질입니다.',
      ...ranked
        .slice(0, limit)
        .map(
          (m, i) =>
            `${i + 1}. ${m.moldNo} · ${m.product} · 부적합률 ${m.failRate.toFixed(2)}% · 폐기비용 ₩${m.scrapCost.toLocaleString()}`,
        ),
    ]
  }

  const metric: 'failRate' | 'qty' | 'scrapCost' | 'changeRate' = includesAny(n, [
    '검수량',
    '검사량',
  ])
    ? 'qty'
    : includesAny(n, ['폐기', '비용'])
      ? 'scrapCost'
      : 'failRate'

  const rows = [...products]
    .sort((a, b) => b[metric] - a[metric])
    .slice(0, limit)

  if (!rows.length) {
    return [`${scope} 조건에 맞는 품번이 없습니다. 제품유형이나 품번을 바꿔 질문해 보세요.`]
  }

  const metricLabel =
    metric === 'qty' ? '검수량이 많은' : metric === 'scrapCost' ? '폐기비용이 높은' : '부적합률이 높은'

  return [
    `${scope} 기준 ${metricLabel} 품번 TOP ${rows.length}입니다. (#N/A 제외)`,
    ...rows.map((p, i) => formatProduct(p, i, metric)),
  ]
}
