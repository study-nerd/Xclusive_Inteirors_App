import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import api from '../../lib/api'
import { Button, Card, PageHeader, StatusBadge, Spinner, EmptyState, Select, Badge } from '../../components/shared'
import { Plus, ShoppingCart } from 'lucide-react'
import useAuthStore from '../../store/authStore'

export default function POListPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { user } = useAuthStore()
  const [filters, setFilters] = useState({
    status: params.get('status') || '',
    project_id: '',
    created_by: '',
    vendor_id: '',
  })

  const canFilterByUser = user?.role === 'admin' || user?.role === 'manager'

  const { data: projects } = useQuery({
    queryKey: ['projects-select'],
    queryFn: () => api.get('/projects?status=active').then(r => r.data.data),
  })
  const { data: users } = useQuery({
    queryKey: ['users-select'],
    queryFn: () => api.get('/users').then(r => r.data.data),
    enabled: canFilterByUser,
  })

  const { data, isLoading } = useQuery({
    queryKey: ['purchase-orders', filters],
    queryFn: () => {
      const q = new URLSearchParams(Object.fromEntries(Object.entries(filters).filter(([,v]) => v)))
      return api.get(`/purchase-orders?${q}`).then(r => r.data.data)
    },
  })

  const isAdmin = user?.role === 'admin'

  // Approval queue for admin
  const pendingCount = data?.filter(p => p.status === 'pending_approval').length || 0

  return (
    <div>
      <PageHeader
        title="Purchase Orders"
        subtitle={`${data?.length || 0} orders`}
        action={<Button onClick={() => navigate('/purchase-orders/new')}><Plus size={16} className="mr-2" />New PO</Button>}
      />

      {/* Admin Approval Queue Banner */}
      {isAdmin && pendingCount > 0 && (
        <div
          className="mb-4 p-4 bg-yellow-50 border border-yellow-300 rounded-lg flex items-center justify-between cursor-pointer hover:bg-yellow-100"
          onClick={() => setFilters(f => ({ ...f, status: 'pending_approval' }))}
        >
          <span className="font-medium text-yellow-800">🟡 {pendingCount} PO{pendingCount > 1 ? 's' : ''} awaiting your approval</span>
          <Badge variant="warning">Review Now</Badge>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-5">
        <Select className="w-44" value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}>
          <option value="">All Statuses</option>
          <option value="draft">Draft</option>
          <option value="pending_approval">Pending Approval</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </Select>

        <Select className="min-w-[200px]" value={filters.project_id} onChange={e => setFilters(f => ({ ...f, project_id: e.target.value }))}>
          <option value="">All Projects</option>
          {(projects || []).map(p => <option key={p.id} value={p.id}>{p.name} ({p.code})</option>)}
        </Select>

        {canFilterByUser && (
          <Select className="min-w-[200px]" value={filters.created_by} onChange={e => setFilters(f => ({ ...f, created_by: e.target.value }))}>
            <option value="">PO Issued By</option>
            {(users || []).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </Select>
        )}

        <Button variant="outline" onClick={() => setFilters({ status: '', project_id: '', created_by: '', vendor_id: '' })}>
          Clear Filters
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner className="h-8 w-8" /></div>
      ) : !data?.length ? (
        <EmptyState icon={ShoppingCart} title="No purchase orders" description="Create your first PO to get started" />
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50">
                  {['PO Number','Project','Vendor','Amount','Status','Date',''].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.map(po => (
                  <tr key={po.id} className="border-b hover:bg-gray-50 cursor-pointer" onClick={() => navigate(`/purchase-orders/${po.id}`)}>
                    <td className="px-4 py-3 font-medium">{po.po_number}</td>
                    <td className="px-4 py-3 text-muted-foreground">{po.project_name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{po.vendor_name}</td>
                    <td className="px-4 py-3 font-medium">₹{parseFloat(po.total || 0).toLocaleString('en-IN')}</td>
                    <td className="px-4 py-3"><StatusBadge status={po.status} /></td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {new Date(po.created_at).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'2-digit' })}
                    </td>
                    <td className="px-4 py-3">
                      <Button size="sm" variant="outline" onClick={e => { e.stopPropagation(); navigate(`/purchase-orders/${po.id}`) }}>
                        View
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}
