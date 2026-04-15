import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../lib/api'
import {
  Button, Card, CardContent, StatusBadge, Spinner,
  Badge, PageHeader, Modal, Label, Textarea
} from '../../components/shared'
import { Plus, Edit, ShoppingCart, FileText, CheckSquare, AlertTriangle, Trash2, CheckCircle } from 'lucide-react'
import useAuthStore from '../../store/authStore'

export default function ProjectDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const qc = useQueryClient()

  const [deleteModal,   setDeleteModal]   = useState(false)
  const [completeModal, setCompleteModal] = useState(false)

  const { data: p, isLoading } = useQuery({
    queryKey: ['project', id],
    queryFn: () => api.get(`/projects/${id}`).then(r => r.data.data),
  })

  const canEdit   = ['admin', 'manager'].includes(user?.role)
  const isAdmin   = user?.role === 'admin'

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/projects/${id}`),
    onSuccess: () => { qc.invalidateQueries(['projects']); navigate('/projects') },
  })

  const completeMutation = useMutation({
    mutationFn: () => api.patch(`/projects/${id}/status`, { status: 'completed' }),
    onSuccess: () => { qc.invalidateQueries(['project', id]); setCompleteModal(false) },
  })

  if (isLoading) return <div className="flex justify-center py-16"><Spinner className="h-8 w-8" /></div>
  if (!p) return <div className="text-center py-16 text-muted-foreground">Project not found</div>

  const isActive = p.status === 'active'

  return (
    <div>
      <PageHeader
        title={p.name}
        subtitle={`${p.code} · ${p.location || ''}`}
        action={
          <div className="flex gap-2 flex-wrap">
            {canEdit && (
              <Button variant="outline" onClick={() => navigate(`/projects/${id}/edit`)}>
                <Edit size={15} className="mr-2" />Edit
              </Button>
            )}
            {canEdit && isActive && (
              <Button
                variant="outline"
                className="text-green-700 border-green-300 hover:bg-green-50"
                onClick={() => setCompleteModal(true)}
              >
                <CheckCircle size={15} className="mr-2" />Mark Completed
              </Button>
            )}
            {isAdmin && (
              <Button variant="destructive" onClick={() => setDeleteModal(true)}>
                <Trash2 size={15} className="mr-2" />Delete
              </Button>
            )}
          </div>
        }
      />

      {/* Info Grid */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Client',       value: p.client_name },
          { label: 'Site Address', value: p.site_address },
          { label: 'Status',       value: <StatusBadge status={p.status} /> },
          { label: 'Services',     value: p.services_taken },
          { label: 'Project Type', value: p.project_type },
          { label: '3D Lead',      value: p.team_lead_3d },
          { label: '2D Lead',      value: p.team_lead_2d },
          { label: 'Start Date',   value: p.start_date ? new Date(p.start_date).toLocaleDateString('en-IN') : '—' },
          { label: 'End Date',     value: p.end_date   ? new Date(p.end_date).toLocaleDateString('en-IN')   : '—' },
        ].map(({ label, value }) => (
          <div key={label} className="bg-gray-50 rounded-lg p-3">
            <div className="text-xs text-muted-foreground mb-1">{label}</div>
            <div className="text-sm font-medium">{value || '—'}</div>
          </div>
        ))}
      </div>

      {p.remarks && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6 text-sm">
          <strong>Remarks:</strong> {p.remarks}
        </div>
      )}

      {/* Linked Sections */}
      <div className="grid md:grid-cols-2 gap-6">

        <Card>
          <div className="p-4 border-b flex items-center justify-between">
            <div className="flex items-center gap-2 font-semibold"><ShoppingCart size={16} />Purchase Orders</div>
            <Button size="sm" onClick={() => navigate(`/purchase-orders/new?project_id=${id}`)}>
              <Plus size={14} className="mr-1" />New PO
            </Button>
          </div>
          <CardContent className="p-0">
            {!(p.purchase_orders || []).length ? (
              <div className="text-center text-muted-foreground text-sm py-6">No POs yet</div>
            ) : (
              (p.purchase_orders || []).map(po => (
                <div key={po.id} className="flex items-center justify-between px-4 py-3 border-b last:border-0 hover:bg-gray-50 cursor-pointer"
                  onClick={() => navigate(`/purchase-orders/${po.id}`)}>
                  <div>
                    <div className="text-sm font-medium">{po.po_number}</div>
                    <div className="text-xs text-muted-foreground">₹{parseFloat(po.total || 0).toLocaleString('en-IN')}</div>
                  </div>
                  <StatusBadge status={po.status} />
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <div className="p-4 border-b flex items-center justify-between">
            <div className="flex items-center gap-2 font-semibold"><FileText size={16} />Daily Reports</div>
            <Button size="sm" onClick={() => navigate(`/dpr/new?project_id=${id}`)}>
              <Plus size={14} className="mr-1" />Submit DPR
            </Button>
          </div>
          <CardContent className="p-0">
            {!(p.dprs || []).length ? (
              <div className="text-center text-muted-foreground text-sm py-6">No DPRs yet</div>
            ) : (
              (p.dprs || []).map(dpr => (
                <div key={dpr.id} className="flex items-center justify-between px-4 py-3 border-b last:border-0 hover:bg-gray-50 cursor-pointer"
                  onClick={() => navigate(`/dpr/${dpr.id}`)}>
                  <div className="text-sm font-medium">
                    {new Date(dpr.report_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                  </div>
                  <StatusBadge status={dpr.status} />
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <div className="p-4 border-b flex items-center justify-between">
            <div className="flex items-center gap-2 font-semibold"><AlertTriangle size={16} />Snag List</div>
            <Button size="sm" onClick={() => navigate(`/snaglist?project_id=${id}`)}>View all</Button>
          </div>
          <CardContent className="p-0">
            {!(p.snags || []).length ? (
              <div className="text-center text-muted-foreground text-sm py-6">No snags logged</div>
            ) : (
              (p.snags || []).map(snag => (
                <div key={snag.id} className="flex items-center justify-between px-4 py-3 border-b last:border-0">
                  <div>
                    <div className="text-sm font-medium">{snag.item_name || 'Snag'}</div>
                    <div className="text-xs text-muted-foreground">{snag.area}</div>
                  </div>
                  <StatusBadge status={snag.status} />
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <div className="p-4 border-b font-semibold">Site Contractors</div>
          <CardContent className="p-0">
            {!(p.contractors || []).length ? (
              <div className="text-center text-muted-foreground text-sm py-6">No contractors assigned</div>
            ) : (
              (p.contractors || []).map(c => (
                <div key={c.id} className="flex items-center justify-between px-4 py-3 border-b last:border-0">
                  <div className="text-sm font-medium">{c.contractor_name}</div>
                  <Badge variant="secondary" className="capitalize">{c.trade.replace('_', ' ')}</Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* Mark Completed Modal */}
      <Modal open={completeModal} onClose={() => setCompleteModal(false)} title="Mark Project as Completed">
        <p className="text-sm text-muted-foreground mb-4">
          This will move <strong>{p.name}</strong> to Completed status. You can still view all linked POs, DPRs and snags.
        </p>
        <div className="flex gap-2">
          <Button
            className="bg-green-600 hover:bg-green-700"
            onClick={() => completeMutation.mutate()}
            disabled={completeMutation.isPending}
          >
            {completeMutation.isPending && <Spinner className="mr-2" />}
            Yes, Mark Completed
          </Button>
          <Button variant="outline" onClick={() => setCompleteModal(false)}>Cancel</Button>
        </div>
      </Modal>

      {/* Delete Modal */}
      <Modal open={deleteModal} onClose={() => setDeleteModal(false)} title="Delete Project Permanently">
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800 mb-4">
          <strong>Warning:</strong> Permanently deleting <strong>{p.name}</strong> will also delete all linked DPRs, checklists, snags, activity schedules, and contractor assignments. Purchase Orders must be deleted separately first.
        </div>
        <div className="flex gap-2">
          <Button variant="destructive" onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending}>
            {deleteMutation.isPending && <Spinner className="mr-2" />}Delete Permanently
          </Button>
          <Button variant="outline" onClick={() => setDeleteModal(false)}>Cancel</Button>
        </div>
      </Modal>
    </div>
  )
}
