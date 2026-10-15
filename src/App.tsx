import { BrowserRouter, Route, Routes } from 'react-router-dom'
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
import { DailyAnalysis } from './pages/DailyAnalysis'
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
import { VinaDailyAnalysis } from './pages/vina/VinaDailyAnalysis'
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
import { AccessGate } from './components/admin/AccessLogin'
import {
  MainRouteGate,
  RoleFallback,
  VinaRouteGate,
} from './components/admin/RouteAccess'

export default function App() {
  return (
    <BrowserRouter>
      <FilterProvider>
        <DataProvider>
          <AdminProvider>
            <VinaDataProvider>
              <ToastProvider>
                <AccessGate>
                  <Routes>
                    <Route
                      path="ai-chatbot-popup"
                      element={
                        <MainRouteGate>
                          <AiChatbot popupMode />
                        </MainRouteGate>
                      }
                    />
                    <Route
                      element={
                        <MainRouteGate>
                          <Layout />
                        </MainRouteGate>
                      }
                    >
                      <Route index element={<Dashboard />} />
                      <Route path="quality" element={<QualityAnalysis />} />
                      <Route path="daily-analysis" element={<DailyAnalysis />} />
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
                      <Route path="ai" element={<AiAsk />} />
                    </Route>
                    <Route
                      element={
                        <VinaRouteGate>
                          <Layout />
                        </VinaRouteGate>
                      }
                    >
                      <Route path="vina" element={<VinaAnalysis />} />
                      <Route path="vina/quality" element={<VinaQualityAnalysis />} />
                      <Route
                        path="vina/daily-analysis"
                        element={<VinaDailyAnalysis />}
                      />
                      <Route path="vina/manage" element={<VinaManage />} />
                      <Route
                        path="vina/products"
                        element={<VinaProductAnalysis />}
                      />
                      <Route
                        path="vina/products/:id"
                        element={<VinaProductDetail />}
                      />
                      <Route
                        path="vina/inspectors"
                        element={<VinaInspectorAnalysis />}
                      />
                      <Route
                        path="vina/inspectors/:id"
                        element={<VinaInspectorDetail />}
                      />
                      <Route
                        path="vina/equipment"
                        element={<VinaEquipmentAnalysis />}
                      />
                      <Route path="vina/costs" element={<VinaCostAnalysis />} />
                      <Route path="vina/compare" element={<VinaSmartCompare />} />
                      <Route path="vina/data" element={<VinaData />} />
                      <Route path="vina/error-data" element={<VinaErrorData />} />
                    </Route>
                    <Route path="*" element={<RoleFallback />} />
                  </Routes>
                  <SettingsModal />
                </AccessGate>
              </ToastProvider>
            </VinaDataProvider>
          </AdminProvider>
        </DataProvider>
      </FilterProvider>
    </BrowserRouter>
  )
}
