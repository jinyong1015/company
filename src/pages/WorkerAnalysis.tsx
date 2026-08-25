import { useMemo, useState } from 'react'
import { PageHeader } from '../components/common/PageHeader'
import { Panel } from '../components/common/Panel'
import { useData } from '../context/DataContext'
import { formatPpm, formatWon } from '../lib/format'

export function WorkerAnalysis() {
  const { analytics } = useData()
  const { workers, workerProductUph } = analytics
  const [selectedWorker, setSelectedWorker] = useState<string>('전체')

  const rows = useMemo(() => {
    if (selectedWorker === '전체') return workerProductUph
    return workerProductUph.filter((r) => r.worker === selectedWorker)
  }, [workerProductUph, selectedWorker])

  return (
    <div className="space-y-5">
      <PageHeader
        title="작업자 분석"
        description="작업자별 전체 효율과, 품번(제품)별 UPH를 함께 확인합니다."
      />

      <Panel title="작업자 요약">
        <div className="overflow-x-auto">
          <table className="min-w-[980px] w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs text-muted">
                <th className="px-2 py-2 font-medium">작업자</th>
                <th className="px-2 py-2 font-medium">담당 품번 수</th>
                <th className="px-2 py-2 font-medium">검사량</th>
                <th className="px-2 py-2 font-medium">합격</th>
                <th className="px-2 py-2 font-medium">부적합</th>
                <th className="px-2 py-2 font-medium">소요시간(분)</th>
                <th className="px-2 py-2 font-medium">UPH</th>
                <th className="px-2 py-2 font-medium">폐기비용</th>
              </tr>
            </thead>
            <tbody>
              {workers.map((row) => (
                <tr
                  key={row.id}
                  className={`cursor-pointer border-b border-line/70 hover:bg-canvas ${
                    selectedWorker === row.name ? 'bg-accent-soft/50' : ''
                  }`}
                  onClick={() => setSelectedWorker(row.name)}
                >
                  <td className="px-2 py-3 font-medium text-accent">{row.name}</td>
                  <td className="num px-2 py-3">{row.productCount}</td>
                  <td className="num px-2 py-3">{row.qty.toLocaleString()}</td>
                  <td className="num px-2 py-3">{row.pass.toLocaleString()}</td>
                  <td className="num px-2 py-3">{row.fail.toLocaleString()}</td>
                  <td className="num px-2 py-3">{row.minutes.toLocaleString()}</td>
                  <td className="num px-2 py-3 font-semibold">{row.uph}</td>
                  <td className="num px-2 py-3">{formatWon(row.scrapCost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel
        title="작업자 × 품번 UPH"
        description="같은 작업자라도 품번마다 UPH가 다릅니다."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setSelectedWorker('전체')}
              className={`rounded-lg px-3 py-1.5 text-sm ${
                selectedWorker === '전체' ? 'bg-ink text-white' : 'bg-canvas text-muted'
              }`}
            >
              전체
            </button>
            {workers.map((w) => (
              <button
                key={w.id}
                type="button"
                onClick={() => setSelectedWorker(w.name)}
                className={`rounded-lg px-3 py-1.5 text-sm ${
                  selectedWorker === w.name ? 'bg-ink text-white' : 'bg-canvas text-muted'
                }`}
              >
                {w.name}
              </button>
            ))}
          </div>
        }
      >
        <div className="overflow-x-auto">
          <table className="min-w-[1100px] w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs text-muted">
                <th className="px-2 py-2 font-medium">작업자</th>
                <th className="px-2 py-2 font-medium">품번</th>
                <th className="px-2 py-2 font-medium">제품 유형</th>
                <th className="px-2 py-2 font-medium">검사량</th>
                <th className="px-2 py-2 font-medium">합격수량</th>
                <th className="px-2 py-2 font-medium">부적합수량</th>
                <th className="px-2 py-2 font-medium">소요시간(분)</th>
                <th className="px-2 py-2 font-medium">UPH</th>
                <th className="px-2 py-2 font-medium">부적합률</th>
                <th className="px-2 py-2 font-medium">불량 내역</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-line/70 align-top hover:bg-canvas">
                  <td className="px-2 py-3 font-medium">{row.worker}</td>
                  <td className="px-2 py-3">{row.product}</td>
                  <td className="px-2 py-3">{row.productType}</td>
                  <td className="num px-2 py-3">{row.qty.toLocaleString()}</td>
                  <td className="num px-2 py-3">{row.pass.toLocaleString()}</td>
                  <td className="num px-2 py-3">{row.fail.toLocaleString()}</td>
                  <td className="num px-2 py-3">{row.minutes.toLocaleString()}</td>
                  <td className="num px-2 py-3 font-semibold text-accent">{row.uph}</td>
                  <td className="num px-2 py-3">{formatPpm(row.failRate)}</td>
                  <td className="px-2 py-3">
                    <div className="flex max-w-[260px] flex-wrap gap-1">
                      {row.defects.map((d) => (
                        <span key={d.name} className="rounded-md bg-canvas px-1.5 py-0.5 text-xs">
                          {d.name} <span className="num font-medium">{d.count}</span>
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  )
}
