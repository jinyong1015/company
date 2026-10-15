import { Navigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAdmin } from '../../context/AdminContext'

export function MainRouteGate({ children }: { children: ReactNode }) {
  const { role } = useAdmin()
  if (role === 'vina') return <Navigate to="/vina" replace />
  return <>{children}</>
}

export function VinaRouteGate({ children }: { children: ReactNode }) {
  const { canAccessVina } = useAdmin()
  if (!canAccessVina) return <Navigate to="/" replace />
  return <>{children}</>
}

export function RoleFallback() {
  const { role } = useAdmin()
  return <Navigate to={role === 'vina' ? '/vina' : '/'} replace />
}
