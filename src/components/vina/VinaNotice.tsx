import { Megaphone } from 'lucide-react'

/** VINA 탭 공통 공지 — 데이터 업로드 화면과 동일 */
export function VinaNotice() {
  return (
    <div className="manage-notice" role="note">
      <Megaphone size={18} className="manage-notice-icon" aria-hidden />
      <div className="min-w-0">
        <p className="manage-notice-title">공지사항</p>
        <p className="manage-notice-body">VINA 데이터만 집계합니다.</p>
      </div>
    </div>
  )
}
