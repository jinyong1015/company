import { VinaSubNav } from '../../components/vina/VinaSubNav'
import { SmartCompare } from '../SmartCompare'

/** VINA 스마트 비교 — 기존 SmartCompare UI 재사용, 데이터만 VINA */
export function VinaSmartCompare() {
  return (
    <div className="space-y-5">
      <VinaSubNav />
      <SmartCompare />
    </div>
  )
}
