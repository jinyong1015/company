import { VinaSubNav } from '../../components/vina/VinaSubNav'
import { ProductDetail } from '../ProductDetail'

/**
 * VINA 품번 상세 — 기존 ProductDetail UI 재사용.
 * `/vina/products/:id` 경로로 데이터 소스만 VINA로 전환한다.
 * 품번 사진은 itemMatchKey(공백/하이픈 무시)로 기존 product_photos에 연결한다.
 */
export function VinaProductDetail() {
  return (
    <div className="space-y-5">
      <VinaSubNav />
      <ProductDetail />
    </div>
  )
}
