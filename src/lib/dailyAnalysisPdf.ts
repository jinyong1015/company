import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'

async function toDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { mode: 'cors', credentials: 'omit' })
    if (!res.ok) return null
    const blob = await res.blob()
    return await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

function svgImageHref(image: SVGImageElement): string {
  return (
    image.getAttribute('href') ||
    image.getAttributeNS('http://www.w3.org/1999/xlink', 'href') ||
    ''
  )
}

async function waitImageDecoded(el: HTMLImageElement | SVGImageElement) {
  try {
    if ('decode' in el && typeof el.decode === 'function') {
      await el.decode()
      return
    }
  } catch {
    /* ignore */
  }
  await new Promise<void>((resolve) => {
    window.setTimeout(resolve, 80)
  })
}

/** 원격 이미지를 data URL로 바꿔 캡처 누락을 줄인다 */
async function inlineMediaAsDataUrls(root: HTMLElement) {
  const imgs = [...root.querySelectorAll('img')]
  await Promise.all(
    imgs.map(async (img) => {
      const src = img.currentSrc || img.src
      if (!src || src.startsWith('data:')) return
      const data = await toDataUrl(src)
      if (data) {
        img.src = data
        await waitImageDecoded(img)
      }
    }),
  )

  const svgImages = [...root.querySelectorAll('image')] as SVGImageElement[]
  await Promise.all(
    svgImages.map(async (image) => {
      const href = svgImageHref(image)
      if (!href || href.startsWith('data:')) return
      const data = await toDataUrl(href)
      if (!data) return
      image.setAttribute('href', data)
      image.setAttributeNS('http://www.w3.org/1999/xlink', 'href', data)
      await waitImageDecoded(image)
    }),
  )
}

/**
 * html2canvas는 SVG <image>를 자주 누락한다.
 * 캡처 직전에 같은 위치의 HTML <img> 오버레이로 바꾼다.
 */
function overlaySvgImagesAsHtml(root: HTMLElement, doc: Document) {
  const rootRect = root.getBoundingClientRect()
  const prevPosition = root.style.position
  if (!prevPosition || prevPosition === 'static') {
    root.style.position = 'relative'
  }

  root.querySelectorAll('image').forEach((node) => {
    const image = node as SVGImageElement
    const href = svgImageHref(image)
    if (!href) return

    const rect = image.getBoundingClientRect()
    if (rect.width < 1 || rect.height < 1) return

    const img = doc.createElement('img')
    img.src = href
    img.alt = ''
    img.setAttribute('data-pdf-photo-overlay', '1')
    img.style.cssText = [
      'position:absolute',
      `left:${rect.left - rootRect.left}px`,
      `top:${rect.top - rootRect.top}px`,
      `width:${rect.width}px`,
      `height:${rect.height}px`,
      'object-fit:contain',
      'object-position:center',
      'z-index:6',
      'pointer-events:none',
      'border-radius:4px',
    ].join(';')
    root.appendChild(img)

    // 원본 SVG image는 숨김 (중복·누락 방지)
    image.setAttribute('href', '')
    image.setAttributeNS('http://www.w3.org/1999/xlink', 'href', '')
    image.style.opacity = '0'
  })
}

/**
 * 화면에 보이는 일간현황 영역을 캡처해 PDF로 저장.
 * 상단: 현대 로고 | 일일 검사 보고서 | 날짜
 */
export async function exportDailyInspectionPdf(options: {
  element: HTMLElement
  day: string
  vina?: boolean
}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(options.day)) {
    throw new Error('조회일이 올바르지 않습니다.')
  }

  const target =
    (options.element.classList.contains('daily-analysis-report-capture')
      ? options.element
      : (options.element.querySelector(
          '.daily-analysis-report-capture',
        ) as HTMLElement | null)) ?? options.element

  // 헤더 로고를 캡처 전에 data URL로 고정
  const logo = target.querySelector(
    '.daily-analysis-report-header img',
  ) as HTMLImageElement | null
  if (logo) {
    const src = logo.currentSrc || logo.src || '/hyundai-logo.png'
    if (!src.startsWith('data:')) {
      const data = await toDataUrl(
        src.startsWith('http') || src.startsWith('data:')
          ? src
          : new URL(src, window.location.origin).href,
      )
      if (data) logo.src = data
    }
  }

  await inlineMediaAsDataUrls(target)

  // 헤더는 화면에서 display:none → 캡처 직전에만 표시해 높이에 포함
  const headerEl = target.querySelector(
    '.daily-analysis-report-header',
  ) as HTMLElement | null
  const prevHeaderDisplay = headerEl?.style.display ?? ''
  if (headerEl) headerEl.style.display = 'grid'

  // 차트·이미지 안정화
  await new Promise((r) => window.setTimeout(r, 400))

  let canvas: HTMLCanvasElement
  try {
    canvas = await html2canvas(target, {
    scale: 2,
    useCORS: true,
    allowTaint: true,
    backgroundColor: '#f1f5f9',
    logging: false,
    foreignObjectRendering: false,
    scrollX: 0,
    scrollY: 0,
    x: 0,
    y: 0,
    width: Math.ceil(target.scrollWidth),
    height: Math.ceil(target.scrollHeight),
    windowWidth: Math.ceil(target.scrollWidth),
    windowHeight: Math.ceil(target.scrollHeight),
    onclone: (doc, cloned) => {
      const header = cloned.querySelector(
        '.daily-analysis-report-header',
      ) as HTMLElement | null
      if (header) {
        header.style.display = 'grid'
        header.style.gridTemplateColumns = '1fr auto 1fr'
        header.style.alignItems = 'center'
        header.style.columnGap = '1rem'
        header.style.marginBottom = '0.85rem'
        header.style.minHeight = '2.75rem'
        header.style.padding = '0.35rem 1rem 0.55rem'
        header.style.borderRadius = '0.9rem'
        header.style.border = '1px solid #dbe3ee'
        header.style.background = '#fff'
      }

      const style = doc.createElement('style')
      style.textContent = `
        .daily-analysis-report-header {
          display: grid !important;
          grid-template-columns: 1fr auto 1fr !important;
          align-items: center !important;
          column-gap: 1rem !important;
          margin-bottom: 0.85rem !important;
          min-height: 2.75rem !important;
          /* html2canvas가 한글을 아래로 그려 위 여백이 커 보임 → 위쪽 패딩 축소 */
          padding: 0.28rem 1rem 0.55rem !important;
          border-radius: 0.9rem !important;
          border: 1px solid #dbe3ee !important;
          background: #fff !important;
        }
        .daily-analysis-report-header img {
          height: 36px !important;
          width: auto !important;
          object-fit: contain !important;
          justify-self: start !important;
          align-self: center !important;
        }
        .daily-analysis-report-header h2 {
          margin: 0 !important;
          justify-self: center !important;
          align-self: center !important;
          text-align: center !important;
          font-size: 1.35rem !important;
          font-weight: 800 !important;
          line-height: 1 !important;
          color: #0f172a !important;
          position: relative !important;
          top: -3px !important;
          transform: translateY(-3px) !important;
        }
        .daily-analysis-report-header span {
          justify-self: end !important;
          align-self: center !important;
          font-size: 0.95rem !important;
          font-weight: 700 !important;
          line-height: 1 !important;
          color: #334155 !important;
          white-space: nowrap !important;
          position: relative !important;
          top: -3px !important;
          transform: translateY(-3px) !important;
        }
        .daily-defect-type-card,
        .daily-defect-legend,
        .daily-defect-legend-row,
        .daily-defect-legend-name,
        .daily-defect-legend-pct {
          overflow: visible !important;
        }
        .daily-defect-legend {
          display: flow-root !important;
          width: 100% !important;
          max-width: 360px !important;
          font-size: 12px !important;
        }
        .daily-defect-legend-row {
          display: table !important;
          table-layout: fixed !important;
          width: calc(50% - 0.5rem) !important;
          float: left !important;
          box-sizing: border-box !important;
          margin: 0 0 0.35rem !important;
          line-height: 1 !important;
          min-height: 1.35em !important;
        }
        .daily-defect-legend-row:nth-child(odd) {
          margin-right: 1rem !important;
        }
        .daily-defect-legend-swatch {
          display: table-cell !important;
          width: 14px !important;
          height: 1.35em !important;
          vertical-align: middle !important;
          text-align: center !important;
          background: transparent !important;
          background-color: transparent !important;
        }
        .daily-defect-legend-swatch-box {
          display: inline-block !important;
          width: 10px !important;
          height: 10px !important;
          border-radius: 2px !important;
          vertical-align: middle !important;
          /* html2canvas에서 한글이 아래로 그려져 스와치가 위로 떠 보임 → 스와치를 내림 */
          position: relative !important;
          top: 2px !important;
        }
        .daily-defect-legend-name {
          display: table-cell !important;
          vertical-align: middle !important;
          white-space: nowrap !important;
          padding: 0 4px 0 6px !important;
          line-height: 1 !important;
          font-weight: 600 !important;
          font-kerning: none !important;
          letter-spacing: 0 !important;
          position: relative !important;
          top: -2px !important;
          transform: translateY(-2px) !important;
        }
        .daily-defect-legend-pct {
          display: table-cell !important;
          width: 3.4em !important;
          vertical-align: middle !important;
          text-align: right !important;
          white-space: nowrap !important;
          line-height: 1 !important;
          font-weight: 700 !important;
          font-variant-numeric: tabular-nums !important;
          letter-spacing: 0 !important;
          position: relative !important;
          top: -2px !important;
          transform: translateY(-2px) !important;
        }
        .recharts-wrapper,
        .recharts-surface {
          overflow: visible !important;
        }
        .recharts-label-list text,
        .recharts-label {
          opacity: 1 !important;
          visibility: visible !important;
        }
        .daily-defect-type-badge {
          display: inline-flex !important;
          align-items: center !important;
          justify-content: center !important;
          line-height: 1 !important;
          padding-top: 0.45em !important;
          padding-bottom: 0.45em !important;
        }
        .daily-defect-type-badge-text {
          display: inline-block !important;
          line-height: 1 !important;
          position: relative !important;
          top: -2px !important;
          transform: translateY(-2px) !important;
        }
        img[data-pdf-photo-overlay="1"] {
          display: block !important;
          opacity: 1 !important;
          visibility: visible !important;
        }
      `
      doc.head.appendChild(style)

      doc
        .querySelectorAll<HTMLElement>('.daily-defect-legend-swatch')
        .forEach((el) => {
          const bg = el.style.background || el.style.backgroundColor || ''
          el.style.background = 'transparent'
          el.style.backgroundColor = 'transparent'
          el.style.verticalAlign = 'middle'
          el.replaceChildren()
          const box = doc.createElement('span')
          box.className = 'daily-defect-legend-swatch-box'
          box.style.background = bg
          box.style.backgroundColor = bg
          box.style.position = 'relative'
          box.style.top = '2px'
          el.appendChild(box)
        })

      doc
        .querySelectorAll<HTMLElement>(
          '.daily-defect-legend-name, .daily-defect-legend-pct',
        )
        .forEach((el) => {
          el.style.verticalAlign = 'middle'
          el.style.lineHeight = '1'
          el.style.position = 'relative'
          el.style.top = '-2px'
          el.style.transform = 'translateY(-2px)'
        })

      doc
        .querySelectorAll<HTMLElement>('.daily-defect-type-badge-text')
        .forEach((el) => {
          el.style.display = 'inline-block'
          el.style.lineHeight = '1'
          el.style.position = 'relative'
          el.style.top = '-2px'
          el.style.transform = 'translateY(-2px)'
        })

      doc
        .querySelectorAll<HTMLElement>(
          '.daily-analysis-report-header h2, .daily-analysis-report-header span',
        )
        .forEach((el) => {
          el.style.position = 'relative'
          el.style.top = '-3px'
          el.style.transform = 'translateY(-3px)'
          el.style.lineHeight = '1'
        })

      doc.querySelectorAll<SVGSVGElement>('svg.recharts-surface').forEach(
        (svg) => {
          const rect = svg.getBoundingClientRect()
          if (rect.width > 0 && rect.height > 0) {
            svg.setAttribute('width', String(Math.ceil(rect.width)))
            svg.setAttribute('height', String(Math.ceil(rect.height)))
          }
          svg.style.overflow = 'visible'
        },
      )

      doc
        .querySelectorAll<SVGTextElement>(
          '.recharts-label-list text, .recharts-label',
        )
        .forEach((el) => {
          if (!el.getAttribute('fill')) {
            el.setAttribute('fill', '#0f172a')
          }
          el.style.opacity = '1'
          el.style.visibility = 'visible'
        })

      // 품번 사진: SVG image → HTML img 오버레이
      overlaySvgImagesAsHtml(cloned, doc)
    },
  })
  } finally {
    if (headerEl) headerEl.style.display = prevHeaderDisplay
  }

  const pdf = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  })
  const pageW = pdf.internal.pageSize.getWidth()
  const pageH = pdf.internal.pageSize.getHeight()
  const margin = 6
  const availW = pageW - margin * 2
  const availH = pageH - margin * 2

  const ratio = canvas.height / canvas.width
  let drawW = availW
  let drawH = drawW * ratio
  if (drawH > availH) {
    drawH = availH
    drawW = drawH / ratio
  }

  pdf.setFillColor(241, 245, 249)
  pdf.rect(0, 0, pageW, pageH, 'F')
  pdf.addImage(
    canvas.toDataURL('image/png', 1),
    'PNG',
    (pageW - drawW) / 2,
    (pageH - drawH) / 2,
    drawW,
    drawH,
    undefined,
    'FAST',
  )

  const prefix = options.vina ? 'VINA_' : ''
  pdf.save(`${prefix}일일검사보고서_${options.day}.pdf`)
}
