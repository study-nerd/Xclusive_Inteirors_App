import { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import useAuthStore from './store/authStore'
import AppLayout from './components/layout/AppLayout'
import ProtectedRoute from './components/layout/ProtectedRoute'

import LoginPage            from './pages/auth/LoginPage'
import DashboardPage        from './pages/dashboard/DashboardPage'
import ProjectsPage         from './pages/projects/ProjectsPage'
import ProjectDetailPage    from './pages/projects/ProjectDetailPage'
import ProjectFormPage      from './pages/projects/ProjectFormPage'
import POListPage           from './pages/purchase-orders/POListPage'
import POFormPage           from './pages/purchase-orders/POFormPage'
import PODetailPage         from './pages/purchase-orders/PODetailPage'
import VendorsPage          from './pages/vendors/VendorsPage'
import VendorFormPage       from './pages/vendors/VendorFormPage'
import ElementsPage         from './pages/elements/ElementsPage'
import CategoriesPage       from './pages/categories/CategoriesPage'
import DPRListPage          from './pages/dpr/DPRListPage'
import DPRFormPage          from './pages/dpr/DPRFormPage'
import DPRDetailPage        from './pages/dpr/DPRDetailPage'
import ChecklistPage        from './pages/checklist/ChecklistPage'
import InvoicesPage         from './pages/invoices/InvoicesPage'
import SnaglistPage         from './pages/snaglist/SnaglistPage'
import UsersPage            from './pages/users/UsersPage'
import NotificationsPage    from './pages/notifications/NotificationsPage'
import ProfilePage          from './pages/profile/ProfilePage'

export default function App() {
  const { fetchMe } = useAuthStore()
  useEffect(() => { fetchMe() }, [fetchMe])

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard"  element={<DashboardPage />} />

          <Route path="/projects"            element={<ProjectsPage />} />
          <Route path="/projects/new"        element={<ProjectFormPage />} />
          <Route path="/projects/:id"        element={<ProjectDetailPage />} />
          <Route path="/projects/:id/edit"   element={<ProjectFormPage />} />

          <Route path="/purchase-orders"          element={<POListPage />} />
          <Route path="/purchase-orders/new"      element={<POFormPage />} />
          <Route path="/purchase-orders/:id"      element={<PODetailPage />} />
          <Route path="/purchase-orders/:id/edit" element={<POFormPage />} />

          <Route path="/vendors"          element={<VendorsPage />} />
          <Route path="/vendors/new"      element={<VendorFormPage />} />
          <Route path="/vendors/:id/edit" element={<VendorFormPage />} />

          <Route path="/elements"   element={<ElementsPage />} />
          <Route path="/categories" element={<CategoriesPage />} />

          <Route path="/dpr"         element={<DPRListPage />} />
          <Route path="/dpr/new"     element={<DPRFormPage />} />
          <Route path="/dpr/:id"     element={<DPRDetailPage />} />

          <Route path="/invoices"  element={<InvoicesPage />} />
          <Route path="/checklist" element={<ChecklistPage />} />
          <Route path="/snaglist"  element={<SnaglistPage />} />
          <Route path="/users"     element={<UsersPage />} />

          {/* NEW */}
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/profile"       element={<ProfilePage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}
