import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { FilterProvider } from './context/FilterContext'
import { DataProvider } from './context/DataContext'
import { Layout } from './components/layout/Layout'
import { Dashboard } from './pages/Dashboard'
import { InspectionData } from './pages/InspectionData'
import { QualityAnalysis } from './pages/QualityAnalysis'
import { InspectorAnalysis } from './pages/InspectorAnalysis'
import { InspectorDetail } from './pages/InspectorDetail'
import { ProductAnalysis } from './pages/ProductAnalysis'
import { ProductDetail } from './pages/ProductDetail'
import { MoldAnalysis } from './pages/MoldAnalysis'
import { EquipmentAnalysis } from './pages/EquipmentAnalysis'
import { CostAnalysis } from './pages/CostAnalysis'
import { AnomalyAnalysis } from './pages/AnomalyAnalysis'
import { DataManagement } from './pages/DataManagement'
import { DataQuality } from './pages/DataQuality'
import { SmartCompare } from './pages/SmartCompare'
import { AiAsk } from './pages/AiAsk'

export default function App() {
  return (
    <BrowserRouter>
      <FilterProvider>
        <DataProvider>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<Dashboard />} />
              <Route path="quality" element={<QualityAnalysis />} />
              <Route path="inspectors" element={<InspectorAnalysis />} />
              <Route path="inspectors/:id" element={<InspectorDetail />} />
              <Route path="products" element={<ProductAnalysis />} />
              <Route path="products/:id" element={<ProductDetail />} />
              <Route path="molds" element={<MoldAnalysis />} />
              <Route path="equipment" element={<EquipmentAnalysis />} />
              <Route path="costs" element={<CostAnalysis />} />
              <Route path="compare" element={<SmartCompare />} />
              <Route path="data" element={<InspectionData />} />
              <Route path="manage" element={<DataManagement />} />
              <Route path="quality-data" element={<DataQuality />} />
              <Route path="anomalies" element={<AnomalyAnalysis />} />
              <Route path="ai" element={<AiAsk />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </DataProvider>
      </FilterProvider>
    </BrowserRouter>
  )
}
