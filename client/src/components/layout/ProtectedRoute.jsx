import { Navigate, Outlet } from 'react-router-dom'
import useAuthStore from '../../store/authStore'
import { Spinner } from '../shared'

export default function ProtectedRoute({ roles }) {
  const { isAuthenticated, user, authChecked } = useAuthStore()

  if (!authChecked) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    )
  }

  if (!isAuthenticated) return <Navigate to="/login" replace />
  if (roles && !roles.includes(user?.role)) return <Navigate to="/dashboard" replace />

  return <Outlet />
}
