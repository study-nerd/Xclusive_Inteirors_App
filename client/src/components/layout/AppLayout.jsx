import { useState } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import api from '../../lib/api'
import useAuthStore from '../../store/authStore'
import {
  LayoutDashboard, FolderOpen, ShoppingCart, Users2, Package,
  Tag, ClipboardList, AlertTriangle, UserCog, Menu, X, LogOut,
  Bell, Receipt, User, ListChecks, Clock, CalendarCheck
} from 'lucide-react'
import { cn } from '../../lib/utils'

const NAV = [
  { to: '/dashboard',       label: 'Dashboard',       icon: LayoutDashboard, roles: ['admin','manager','employee'] },
  { to: '/projects',        label: 'Projects',         icon: FolderOpen,      roles: ['admin','manager','employee'] },
  { to: '/purchase-orders', label: 'Purchase Orders',  icon: ShoppingCart,    roles: ['admin','manager','employee'] },
  { to: '/vendors',         label: 'Vendors',          icon: Users2,          roles: ['admin','manager','employee'] },
  { to: '/dpr',             label: 'DPR',              icon: ClipboardList,   roles: ['admin','manager','employee'] },
  { to: '/project-tracker', label: 'Project Tracker',  icon: ListChecks,      roles: ['admin','manager','employee'] },
  { to: '/snaglist',        label: 'Snag List',        icon: AlertTriangle,   roles: ['admin','manager','employee'] },
  { to: '/invoices',        label: 'Invoices',         icon: Receipt,         roles: ['admin','manager','employee'] },
  { to: '/my-attendance',    label: 'My Attendance',    icon: Clock,           roles: ['admin','manager','employee'] },
  { to: '/attendance-admin', label: 'Attendance Admin', icon: CalendarCheck,   roles: ['admin','manager'] },
  { to: '/elements',        label: 'Elements Master',  icon: Package,         roles: ['admin','manager'] },
  { to: '/categories',      label: 'Categories',       icon: Tag,             roles: ['admin'] },
  { to: '/users',           label: 'Users',            icon: UserCog,         roles: ['admin','manager'] },
]

export default function AppLayout() {
  const [open, setOpen] = useState(false)
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()

  const { data: unreadData } = useQuery({
    queryKey: ['notif-count'],
    queryFn: () => api.get('/notifications/unread-count').then(r => r.data),
    refetchInterval: 60_000,
  })
  const unreadCount = unreadData?.count || 0

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  const visibleNav = NAV.filter(n => n.roles.includes(user?.role))

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {open && (
        <div className="fixed inset-0 z-20 bg-black/50 lg:hidden" onClick={() => setOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={cn(
        'fixed inset-y-0 left-0 z-30 w-64 bg-gray-900 text-white flex flex-col transform transition-transform duration-200 lg:relative lg:translate-x-0',
        open ? 'translate-x-0' : '-translate-x-full'
      )}>
        <div className="px-6 py-5 border-b border-gray-700">
          <div className="text-lg font-bold tracking-widest">XCLUSIVE</div>
          <div className="text-xs text-gray-400 tracking-wider">INTERIORS / ARCHITECTURE</div>
        </div>

        <nav className="flex-1 overflow-y-auto py-4 px-3">
          {visibleNav.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              onClick={() => setOpen(false)}
              className={({ isActive }) => cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg mb-1 text-sm transition-colors',
                isActive
                  ? 'bg-orange-500 text-white font-medium'
                  : 'text-gray-300 hover:bg-gray-800 hover:text-white'
              )}
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="px-4 py-4 border-t border-gray-700">
          <div className="text-sm font-medium">{user?.name}</div>
          <div className="text-xs text-gray-400 capitalize">{user?.role}</div>
          <div className="flex gap-3 mt-3">
            <button
              onClick={() => { navigate('/profile'); setOpen(false) }}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-white transition-colors"
            >
              <User size={13} /> Profile
            </button>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-white transition-colors"
            >
              <LogOut size={13} /> Logout
            </button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Topbar */}
        <header className="h-14 border-b flex items-center px-4 gap-4 bg-white shrink-0">
          <button className="lg:hidden p-2 rounded-md hover:bg-gray-100" onClick={() => setOpen(true)}>
            <Menu size={20} />
          </button>
          <div className="flex-1" />

          {/* Bell icon with unread count */}
          <button
            className="relative p-2 rounded-md hover:bg-gray-100"
            onClick={() => navigate('/notifications')}
          >
            <Bell size={20} />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-red-500 text-white text-xs rounded-full flex items-center justify-center px-1 font-medium">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>

          <span className="text-sm text-muted-foreground hidden sm:block">{user?.name}</span>
        </header>

        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
