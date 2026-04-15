import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import api from '../../lib/api'
import { Card, CardContent, Spinner, StatusBadge } from '../../components/shared'
import { FolderOpen, Clock, AlertTriangle, ShoppingCart } from 'lucide-react'
import useAuthStore from '../../store/authStore'

const fetchDashboard = async () => {
  const [projects, vendors, pos, snags] = await Promise.all([
    api.get('/projects'),
    api.get('/vendors'),
    api.get('/purchase-orders'),
    api.get('/snaglist'),
  ])
  return {
    projects: projects.data.data,
    vendors: vendors.data.data,
    pos: pos.data.data,
    snags: snags.data.data,
  }
}

export default function DashboardPage() {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const { data, isLoading } = useQuery({ queryKey: ['dashboard'], queryFn: fetchDashboard })
  const [currentHour, setCurrentHour] = useState(() => new Date().getHours())

  useEffect(() => {
    const id = setInterval(() => setCurrentHour(new Date().getHours()), 60 * 1000)
    return () => clearInterval(id)
  }, [])

  const d = data || {}
  const projects = d.projects || []
  const pos = d.pos || []
  const snags = d.snags || []

  const activeProjects = projects.filter(p => p.status === 'active').length
  const completedProjects = projects.filter(p => p.status === 'completed').length
  const templates = projects.filter(p => p.status === 'template').length
  const pendingPOs = pos.filter(p => p.status === 'pending_approval').length
  const openSnags = snags.filter(s => s.status === 'open').length

  const metrics = [
    { label: 'Active Projects', value: activeProjects, icon: FolderOpen, color: 'text-blue-600', bg: 'bg-blue-50', link: '/projects?status=active' },
    { label: 'Pending PO Approvals', value: pendingPOs, icon: Clock, color: 'text-yellow-600', bg: 'bg-yellow-50', link: '/purchase-orders?status=pending_approval' },
    { label: 'Open Snags', value: openSnags, icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-50', link: '/snaglist?status=open' },
  ]

  const recentProjects = useMemo(() => [...projects]
    .sort((a, b) => (new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()))
    .slice(0, 6), [projects])

  const greeting =
    currentHour >= 16 ? 'Good evening'
    : currentHour >= 12 ? 'Good afternoon'
    : currentHour >= 7 ? 'Good morning'
    : 'Hello'

  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><Spinner className="h-8 w-8" /></div>
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">{greeting}, {user?.name?.split(' ')[0]}</h1>
        <p className="text-muted-foreground text-sm mt-1">Here is what is happening today</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
        {metrics.map(({ label, value, icon: Icon, color, bg, link }) => (
          <Card key={label} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate(link)}>
            <CardContent className="p-4">
              <div className={`inline-flex p-2 rounded-lg ${bg} mb-3`}>
                <Icon size={20} className={color} />
              </div>
              <div className="text-2xl font-bold">{value}</div>
              <div className="text-xs text-muted-foreground mt-1">{label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-6 mb-6">
        <Card>
          <div className="p-4 border-b flex items-center justify-between">
            <h2 className="font-semibold">Projects Overview</h2>
            <button className="text-sm text-primary hover:underline" onClick={() => navigate('/projects')}>View all</button>
          </div>
          <CardContent className="p-4">
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="p-3 rounded-lg bg-blue-50 text-center">
                <div className="text-xl font-bold text-blue-700">{activeProjects}</div>
                <div className="text-xs text-blue-700/80">Active</div>
              </div>
              <div className="p-3 rounded-lg bg-green-50 text-center">
                <div className="text-xl font-bold text-green-700">{completedProjects}</div>
                <div className="text-xs text-green-700/80">Completed</div>
              </div>
              <div className="p-3 rounded-lg bg-gray-100 text-center">
                <div className="text-xl font-bold text-gray-700">{templates}</div>
                <div className="text-xs text-gray-700/80">Templates</div>
              </div>
            </div>
            <div className="divide-y">
              {recentProjects.map(p => (
                <div
                  key={p.id}
                  className="py-2 flex items-center justify-between cursor-pointer hover:bg-gray-50 px-2 rounded"
                  onClick={() => navigate(`/projects/${p.id}`)}
                >
                  <div>
                    <div className="text-sm font-medium">{p.name}</div>
                    <div className="text-xs text-muted-foreground">{p.code}</div>
                  </div>
                  <StatusBadge status={p.status} />
                </div>
              ))}
              {!recentProjects.length && <div className="text-sm text-muted-foreground py-3">No projects found</div>}
            </div>
          </CardContent>
        </Card>

        <Card>
          <div className="p-4 border-b flex items-center justify-between">
            <h2 className="font-semibold flex items-center gap-2"><ShoppingCart size={16} />Recent Purchase Orders</h2>
            <button className="text-sm text-primary hover:underline" onClick={() => navigate('/purchase-orders')}>View all</button>
          </div>
          <CardContent className="p-0">
            {pos.slice(0, 5).map(po => (
              <div
                key={po.id}
                className="flex items-center justify-between px-4 py-3 border-b last:border-0 hover:bg-gray-50 cursor-pointer"
                onClick={() => navigate(`/purchase-orders/${po.id}`)}
              >
                <div>
                  <div className="text-sm font-medium">{po.po_number}</div>
                  <div className="text-xs text-muted-foreground">{po.vendor_name} - {po.project_name}</div>
                </div>
                <StatusBadge status={po.status} />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

