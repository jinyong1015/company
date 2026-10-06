import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { FilterProvider } from './context/FilterContext'
import { DataProvider } from './context/DataContext'
import { VinaDataProvider } from './context/VinaDataContext'
import { AdminProvider } from './context/AdminContext'
import { ToastProvider } from './context/ToastContext'
import { Layout } from './components/layout/Layout'
import { SettingsModal } from './components/admin/SettingsModal'
import { Dashboard } from './pages/Dashboard'
import { InspectionData } from './pages/InspectionData'
import { QualityAnalysis } from './pages/QualityAnalysis'
import { InspectorAnalysis } from './pages/InspectorAnalysis'
import { InspectorDetail } from './pages/InspectorDetail'
import { WorkerAnalysis } from './pages/WorkerAnalysis'
import { WorkerDetail } from './pages/WorkerDetail'
import { ProductAnalysis } from './pages/ProductAnalysis'
import { ProductDetail } from './pages/ProductDetail'
import { MoldAnalysis } from './pages/MoldAnalysis'
import { EquipmentAnalysis } from './pages/EquipmentAnalysis'
import { CostAnalysis } from './pages/CostAnalysis'
import { DataManagement } from './pages/DataManagement'
import { DataQuality } from './pages/DataQuality'
import { ErrorData } from './pages/ErrorData'
import { SmartCompare } from './pages/SmartCompare'
import { AiAsk } from './pages/AiAsk'
import { WeeklyReport } from './pages/WeeklyReport'
import { VinaAnalysis } from './pages/vina/VinaAnalysis'
import { VinaQualityAnalysis } from './pages/vina/VinaQualityAnalysis'
import { VinaManage } from './pages/vina/VinaManage'
import { VinaProductAnalysis } from './pages/vina/VinaProductAnalysis'
import { VinaProductDetail } from './pages/vina/VinaProductDetail'
import { VinaInspectorAnalysis } from './pages/vina/VinaInspectorAnalysis'
import { VinaInspectorDetail } from './pages/vina/VinaInspectorDetail'
import { VinaSmartCompare } from './pages/vina/VinaSmartCompare'
import { VinaEquipmentAnalysis } from './pages/vina/VinaEquipmentAnalysis'
import { VinaCostAnalysis } from './pages/vina/VinaCostAnalysis'
import { VinaData } from './pages/vina/VinaData'
import { VinaErrorData } from './pages/vina/VinaErrorData'
import { AiChatbot } from './components/ai/AiChatbot'
import { StaffRouteGate } from './components/admin/StaffRouteGate'

export default function App() {
  return (
    <BrowserRouter>
      <FilterProvider>
        <DataProvider>
          <VinaDataProvider>
            <AdminProvider>
              <ToastProvider>
                <Routes>
                  <Route path="ai-chatbot-popup" element={<AiChatbot popupMode />} />
                  <Route element={<Layout />}>
                    <Route index element={<Dashboard />} />
                    <Route path="quality" element={<QualityAnalysis />} />
                    <Route path="inspectors" element={<InspectorAnalysis />} />
                    <Route path="inspectors/:id" element={<InspectorDetail />} />
                    <Route path="workers" element={<WorkerAnalysis />} />
                    <Route path="workers/:id" element={<WorkerDetail />} />
                    <Route path="products" element={<ProductAnalysis />} />
                    <Route path="products/:id" element={<ProductDetail />} />
                    <Route path="molds" element={<MoldAnalysis />} />
                    <Route path="equipment" element={<EquipmentAnalysis />} />
                    <Route path="costs" element={<CostAnalysis />} />
                    <Route path="compare" element={<SmartCompare />} />
                    <Route path="data" element={<InspectionData />} />
                    <Route path="error-data" element={<ErrorData />} />
                    <Route
                      path="manage"
                      element={
                        <StaffRouteGate title="데이터 업로드">
                          <DataManagement />
                        </StaffRouteGate>
                      }
                    />
                    <Route path="quality-data" element={<DataQuality />} />
                    <Route
                      path="weekly-report"
                      element={
                        <StaffRouteGate title="주간업무 보고">
                          <WeeklyReport />
                        </StaffRouteGate>
                      }
                    />
                    <Route
                      path="vina"
                      element={
                        <StaffRouteGate title="VINA 분석">
                          <VinaAnalysis />
                        </StaffRouteGate>
                      }
                    />
                    <Route
                      path="vina/quality"
                      element={
                        <StaffRouteGate title="VINA 품질 분석">
                          <VinaQualityAnalysis />
                        </StaffRouteGate>
                      }
                    />
                    <Route
                      path="vina/manage"
                      element={
                        <StaffRouteGate title="VINA 데이터 업로드">
                          <VinaManage />
                        </StaffRouteGate>
                      }
                    />
                    <Route
                      path="vina/products"
                      element={
                        <StaffRouteGate title="VINA 품번 분석">
                          <VinaProductAnalysis />
                        </StaffRouteGate>
                      }
                    />
                    <Route
                      path="vina/products/:id"
                      element={
                        <StaffRouteGate title="VINA 품번 상세">
                          <VinaProductDetail />
                        </StaffRouteGate>
                      }
                    />
                    <Route
                      path="vina/inspectors"
                      element={
                        <StaffRouteGate title="VINA 검사자 분석">
                          <VinaInspectorAnalysis />
                        </StaffRouteGate>
                      }
                    />
                    <Route
                      path="vina/inspectors/:id"
                      element={
                        <StaffRouteGate title="VINA 검사자 상세">
                          <VinaInspectorDetail />
                        </StaffRouteGate>
                      }
                    />
                    <Route
                      path="vina/equipment"
                      element={
                        <StaffRouteGate title="VINA 설비 분석">
                          <VinaEquipmentAnalysis />
                        </StaffRouteGate>
                      }
                    />
                    <Route
                      path="vina/costs"
                      element={
                        <StaffRouteGate title="VINA 비용 분석">
                          <VinaCostAnalysis />
                        </StaffRouteGate>
                      }
                    />
                    <Route
                      path="vina/compare"
                      element={
                        <StaffRouteGate title="VINA 스마트 비교">
                          <VinaSmartCompare />
                        </StaffRouteGate>
                      }
                    />
                    <Route
                      path="vina/data"
                      element={
                        <StaffRouteGate title="VINA 검사 DATA">
                          <VinaData />
                        </StaffRouteGate>
                      }
                    />
                    <Route
                      path="vina/error-data"
                      element={
                        <StaffRouteGate title="VINA 오류 DATA">
                          <VinaErrorData />
                        </StaffRouteGate>
                      }
                    />
                    <Route path="ai" element={<AiAsk />} />
                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Route>
                </Routes>
                <SettingsModal />
              </ToastProvider>
            </AdminProvider>
          </VinaDataProvider>
        </DataProvider>
      </FilterProvider>
    </BrowserRouter>
  )
}
