import { VinaSubNav } from '../../components/vina/VinaSubNav'
import { InspectorDetail } from '../InspectorDetail'

/**
 * VINA 검사자 상세 — 기존 InspectorDetail UI 재사용.
 * `/vina/inspectors/:id` 경로로 데이터 소스만 VINA로 전환한다.
 */
export function VinaInspectorDetail() {
  return (
    <div className="space-y-5">
      <VinaSubNav />
      <InspectorDetail />
    </div>
  )
}
