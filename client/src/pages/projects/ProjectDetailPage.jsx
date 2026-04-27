import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../lib/api'
import {
  Button, Card, CardContent, StatusBadge, Spinner,
  Badge, PageHeader, Modal, Label, Textarea
} from '../../components/shared'
import {
  Plus, Edit, ShoppingCart, FileText, CheckSquare, AlertTriangle,
  Trash2, CheckCircle, Users, BarChart3, Layers, Receipt
} from 'lucide-react'
import { cn } from '../../lib/utils'
import useAuthStore from '../../store/authStore'
import StagesTab from './StagesTab'

const TABS = [
  { id: 'overview',  label: 'Overview',        icon: BarChart3    },
  { id: 'stages',    label: 'Stages',           icon: Layers       },
  { id: 'pos',       label: 'Purchase Orders',  icon: ShoppingCart },
  { id: 'dpr',       label: 'DPR',              icon: FileText     },
  { id: 'snags',     label: 'Snags',            icon: AlertTriangle},
  { id: 'team',      label: 'Team',             icon: Users        },
]

function ProgressBar({ value }) {
  return (
    <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
      <div
        className="h-full bg-orange-500 rounded-full transition-all"
        style={{ width: `${Math.min(100, value || 0)}%` }}
      />
    </div>
  )
}

export default function ProjectDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const qc = useQueryClient()

  const [activeTab, setActiveTab]     = useState('overview')
  const [deleteModal, setDeleteModal] = useState(false)
  const [completeModal, setCompleteModal] = useState(false)

  const { data: p, isLoading } = useQuery({
    queryKey: ['project', id],
    queryFn: () => api.get(`/projects/${id}`).then(r => r.data.data),
  })

  const { data: stagesData } = useQuery({
    queryKey: ['stages', id],
    queryFn: () => api.get(`/projects/${id}/stages`).then(r => r.data.data),
    enabled: !!id,
  })

  const canEdit = ['admin', 'manager'].includes(user?.role)
  const isAdmin = user?.role === 'admin'

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
  const progress = stagesData?.progress || 0
  const currentPhase = (stagesData?.stages || []).find(s => s.status === 'in_progress')?.phase || null

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

      {/* Progress + Status Row */}
      <div className="grid sm:grid-cols-3 gap-4 mb-6">
        <div className="sm:col-span-2 bg-white border rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Project Progress</span>
            <div className="flex items-center gap-2">
              <StatusBadge status={p.status} />
              <span className="text-lg font-bold text-orange-600">{progress}%</span>
            </div>
          </div>
          <ProgressBar value={progress} />
          <div className="flex justify-between text-xs text-muted-foreground mt-1">
            <span>{stagesData?.completed || 0} of {stagesData?.total || 0} stages complete</span>
            {currentPhase && <span className="font-medium">Active: {currentPhase}</span>}
          </div>
        </div>

        <div className="bg-white border rounded-xl p-4 flex flex-col gap-2">
          {[
            { label: 'Client',    value: p.client_name },
            { label: 'Services',  value: p.services_taken },
            { label: 'Type',      value: p.project_type?.replace(/_/g,' ') },
          ].map(({ label, value }) => value ? (
            <div key={label} className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{label}</span>
              <span className="text-xs font-medium">{value}</span>
            </div>
          ) : null)}
        </div>
      </div>

      {/* Quick actions */}
      <div className="flex gap-2 mb-5 flex-wrap">
        <Button size="sm" variant="outline" onClick={() => navigate(`/purchase-orders/new?project_id=${id}`)}>
          <ShoppingCart size={14} className="mr-1" />New PO
        </Button>
        <Button size="sm" variant="outline" onClick={() => navigate(`/dpr/new?project_id=${id}`)}>
          <FileText size={14} className="mr-1" />Add DPR
        </Button>
        <Button size="sm" variant="outline" onClick={() => navigate(`/snaglist?project_id=${id}`)}>
          <AlertTriangle size={14} className="mr-1" />View Snags
        </Button>
      </div>

      {/* Tabs */}
      <div className="border-b mb-5">
        <div className="flex gap-1 overflow-x-auto">
          {TABS.map(({ id: tid, label, icon: Icon }) => (
            <button
              key={tid}
              onClick={() => setActiveTab(tid)}
              className={cn(
                'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors',
                activeTab === tid
                  ? 'border-orange-500 text-orange-600'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-gray-300'
              )}
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Panels */}
      {activeTab === 'overview' && <OverviewTab p={p} navigate={navigate} id={id} />}
      {activeTab === 'stages' && <StagesTab projectId={id} projectType={p.project_type} startDate={p.start_date} endDate={p.end_date} />}
      {activeTab === 'pos'      && <POsTab pos={p.purchase_orders || []} navigate={navigate} id={id} />}
      {activeTab === 'dpr'      && <DPRTab dprs={p.dprs || []} navigate={navigate} id={id} />}
      {activeTab === 'snags'    && <SnagsTab snags={p.snags || []} navigate={navigate} id={id} />}
      {activeTab === 'team'     && <TeamTab p={p} navigate={navigate} />}

      {/* Modals */}
      <Modal open={completeModal} onClose={() => setCompleteModal(false)} title="Mark Project as Completed">
        <p className="text-sm text-muted-foreground mb-4">
          This will move <strong>{p.name}</strong> to Completed status.
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

      <Modal open={deleteModal} onClose={() => setDeleteModal(false)} title="Delete Project Permanently">
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800 mb-4">
          <strong>Warning:</strong> Permanently deleting <strong>{p.name}</strong> will delete all linked data. POs must be deleted first.
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

/* ─── Overview Tab ─────────────────────────────────── */
function OverviewTab({ p, navigate, id }) {
  const team = p.team || []

  return (
    <div className="space-y-4">
      {/* Info Grid */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {[
          { label: 'Client',       value: p.client_name },
          { label: 'Site Address', value: p.site_address },
          { label: 'Location',     value: p.location },
          { label: 'Services',     value: p.services_taken },
          { label: 'Project Type', value: p.project_type?.replace(/_/g,' ') },
          { label: 'Start Date',   value: p.start_date ? new Date(p.start_date).toLocaleDateString('en-IN') : null },
          { label: 'End Date',     value: p.end_date   ? new Date(p.end_date).toLocaleDateString('en-IN')   : null },
        ].map(({ label, value }) => (
          <div key={label} className="bg-gray-50 rounded-lg p-3">
            <div className="text-xs text-muted-foreground mb-1">{label}</div>
            <div className="text-sm font-medium">{value || '—'}</div>
          </div>
        ))}
      </div>

      {/* Assigned Team Members */}
      <div className="bg-white border rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Users size={15} className="text-orange-500" />
            Assigned Team Members
          </div>
          <button
            onClick={() => navigate(`/projects/${id}/edit`)}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
          >
            <Edit size={12} />Edit
          </button>
        </div>
        {!team.length ? (
          <p className="text-sm text-muted-foreground">No team members assigned</p>
        ) : (
          <div className="flex flex-wrap gap-3">
            {team.map(u => {
              const initials = (u.name || '?').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
              return (
                <div key={u.id} className="flex items-center gap-2.5 bg-gray-50 border rounded-lg px-3 py-2 hover:bg-gray-100 transition-colors">
                  <div className="w-8 h-8 rounded-full bg-orange-500 text-white text-xs font-bold flex items-center justify-center shrink-0">
                    {initials}
                  </div>
                  <div>
                    <div className="text-sm font-medium leading-tight">{u.name}</div>
                    <Badge variant="secondary" className="text-[10px] capitalize mt-0.5 px-1.5 py-0">{u.role}</Badge>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {p.remarks && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-sm">
          <strong>Remarks:</strong> {p.remarks}
        </div>
      )}
      {p.project_scope && (
        <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 text-sm">
          <strong>Scope:</strong> {p.project_scope}
        </div>
      )}

      {/* Quick stats */}
      <div className="grid sm:grid-cols-3 gap-3">
        <StatCard label="Purchase Orders" value={(p.purchase_orders || []).length} onClick={() => {}} color="bg-orange-50 text-orange-700" />
        <StatCard label="Daily Reports"   value={(p.dprs || []).length}            onClick={() => {}} color="bg-blue-50 text-blue-700" />
        <StatCard label="Open Snags"      value={(p.snags || []).filter(s => s.status !== 'resolved').length} onClick={() => {}} color="bg-red-50 text-red-700" />
      </div>

      {/* Contractors */}
      {(p.contractors || []).length > 0 && (
        <Card>
          <div className="p-4 border-b font-semibold text-sm">Site Contractors</div>
          <div className="divide-y">
            {p.contractors.map(c => (
              <div key={c.id} className="flex items-center justify-between px-4 py-3">
                <div className="text-sm font-medium">{c.contractor_name}</div>
                <Badge variant="secondary" className="capitalize text-xs">{c.trade.replace(/_/g, ' ')}</Badge>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}

function StatCard({ label, value, color, onClick }) {
  return (
    <div className={cn('rounded-xl p-4 cursor-pointer hover:opacity-90 transition-opacity', color)} onClick={onClick}>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs font-medium mt-0.5">{label}</div>
    </div>
  )
}

/* ─── POs Tab ──────────────────────────────────────── */
function POsTab({ pos, navigate, id }) {
  return (
    <div>
      <div className="flex justify-between items-center mb-3">
        <span className="text-sm text-muted-foreground">{pos.length} purchase orders</span>
        <Button size="sm" onClick={() => navigate(`/purchase-orders/new?project_id=${id}`)}>
          <Plus size={14} className="mr-1" />New PO
        </Button>
      </div>
      {!pos.length ? (
        <div className="text-center py-10 text-muted-foreground">No purchase orders yet</div>
      ) : (
        <div className="border rounded-xl overflow-hidden">
          {pos.map(po => (
            <div key={po.id}
              className="flex items-center justify-between px-4 py-3 border-b last:border-0 hover:bg-gray-50 cursor-pointer"
              onClick={() => navigate(`/purchase-orders/${po.id}`)}>
              <div>
                <div className="text-sm font-medium">{po.po_number}</div>
                <div className="text-xs text-muted-foreground">₹{parseFloat(po.total || 0).toLocaleString('en-IN')}</div>
              </div>
              <StatusBadge status={po.status} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ─── DPR Tab ──────────────────────────────────────── */
function DPRTab({ dprs, navigate, id }) {
  return (
    <div>
      <div className="flex justify-between items-center mb-3">
        <span className="text-sm text-muted-foreground">{dprs.length} reports</span>
        <Button size="sm" onClick={() => navigate(`/dpr/new?project_id=${id}`)}>
          <Plus size={14} className="mr-1" />Submit DPR
        </Button>
      </div>
      {!dprs.length ? (
        <div className="text-center py-10 text-muted-foreground">No daily reports yet</div>
      ) : (
        <div className="border rounded-xl overflow-hidden">
          {dprs.map(dpr => (
            <div key={dpr.id}
              className="flex items-center justify-between px-4 py-3 border-b last:border-0 hover:bg-gray-50 cursor-pointer"
              onClick={() => navigate(`/dpr/${dpr.id}`)}>
              <div className="text-sm font-medium">
                {new Date(dpr.report_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
              </div>
              <StatusBadge status={dpr.status} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ─── Snags Tab ────────────────────────────────────── */
function SnagsTab({ snags, navigate, id }) {
  return (
    <div>
      <div className="flex justify-between items-center mb-3">
        <span className="text-sm text-muted-foreground">{snags.length} snags</span>
        <Button size="sm" onClick={() => navigate(`/snaglist?project_id=${id}`)}>View All</Button>
      </div>
      {!snags.length ? (
        <div className="text-center py-10 text-muted-foreground">No snags logged</div>
      ) : (
        <div className="border rounded-xl overflow-hidden">
          {snags.map(s => (
            <div key={s.id} className="flex items-center justify-between px-4 py-3 border-b last:border-0">
              <div>
                <div className="text-sm font-medium">{s.item_name || 'Snag'}</div>
                <div className="text-xs text-muted-foreground">{s.area}</div>
              </div>
              <StatusBadge status={s.status} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ─── Team Tab ─────────────────────────────────────── */
function TeamTab({ p, navigate }) {
  const teamMembers = p.team || []
  const contractors = p.contractors || []

  return (
    <div className="space-y-4">
      <Card>
        <div className="p-4 border-b flex items-center justify-between">
          <div className="font-semibold text-sm">Team Members</div>
          <Button size="sm" variant="outline" onClick={() => navigate(`/projects/${p.id}/edit`)}>
            <Edit size={13} className="mr-1" />Edit
          </Button>
        </div>
        <div className="divide-y">
          {!teamMembers.length ? (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">No team members assigned</div>
          ) : (
            teamMembers.map(u => (
              <div key={u.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <div className="text-sm font-medium">{u.name}</div>
                  <div className="text-xs text-muted-foreground">{u.email}</div>
                </div>
                <Badge variant="secondary" className="capitalize text-xs">{u.role}</Badge>
              </div>
            ))
          )}
        </div>
      </Card>


      {contractors.length > 0 && (
        <Card>
          <div className="p-4 border-b font-semibold text-sm">Site Contractors</div>
          <div className="divide-y">
            {contractors.map(c => (
              <div key={c.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <div className="text-sm font-medium">{c.contractor_name}</div>
                  {c.notes && <div className="text-xs text-muted-foreground">{c.notes}</div>}
                </div>
                <Badge variant="secondary" className="capitalize text-xs">{c.trade.replace(/_/g, ' ')}</Badge>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}
