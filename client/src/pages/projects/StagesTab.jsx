import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../lib/api'
import { Button, Badge, Spinner, Modal, Input, Label, Select, Textarea } from '../../components/shared'
import { Plus, ChevronDown, ChevronRight, Check, AlertCircle, Clock, Ban, Edit2, Trash2, Layers, RefreshCw, ExternalLink, Link2 } from 'lucide-react'
import { cn } from '../../lib/utils'
import useAuthStore from '../../store/authStore'

const STATUS_CONFIG = {
  pending:     { label: 'Pending',     short: 'Pend',  icon: Clock,        color: 'text-gray-500',  bg: 'bg-gray-100'  },
  in_progress: { label: 'In Progress', short: 'WIP',   icon: RefreshCw,    color: 'text-blue-600',  bg: 'bg-blue-100'  },
  completed:   { label: 'Completed',   short: 'Done',  icon: Check,        color: 'text-green-600', bg: 'bg-green-100' },
  delayed:     { label: 'Delayed',     short: 'Late',  icon: AlertCircle,  color: 'text-amber-600', bg: 'bg-amber-100' },
  blocked:     { label: 'Blocked',     short: 'Block', icon: Ban,          color: 'text-red-600',   bg: 'bg-red-100'   },
}

const PHASE_ORDER = ['Furniture Layout', 'Estimation', '3D Design', '2D Drawings', 'Execution - Civil', 'Execution', 'Handover']
const PHASES = PHASE_ORDER
const PROJECT_TYPES = [
  '2BHK','2.5BHK','3BHK','3.5BHK','4BHK','4.5BHK','5BHK','5.5BHK','6BHK',
  '3BHK_Bungalow','4BHK_Bungalow','5BHK_Bungalow','6BHK_Bungalow','6BHK_Plus_Bungalow','Commercial',
]

function ProgressBar({ value }) {
  const color = value >= 100 ? 'bg-green-500' : value >= 60 ? 'bg-orange-500' : 'bg-blue-500'
  return (
    <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
      <div
        className={cn('h-full rounded-full transition-all duration-500', color)}
        style={{ width: `${Math.min(100, value || 0)}%` }}
      />
    </div>
  )
}

function PhaseProgress({ completed, total }) {
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all', pct === 100 ? 'bg-green-500' : 'bg-orange-400')}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span>{completed}/{total}</span>
    </div>
  )
}

function StageRow({ stage, canEdit, onUpdate, onDelete }) {
  const [editOpen, setEditOpen] = useState(false)
  const isCompleted = stage.status === 'completed'

  return (
    <div className={cn(
      'flex items-center gap-3 py-3.5 px-5 border-b last:border-0 transition-colors group',
      isCompleted ? 'bg-green-50/30 hover:bg-green-50/50' : 'hover:bg-gray-50/70'
    )}>
      {/* Circle Checkbox */}
      <button
        onClick={() => onUpdate(stage.id, { status: isCompleted ? 'pending' : 'completed' })}
        className={cn(
          'w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center transition-all',
          isCompleted
            ? 'bg-green-500 border-green-500 text-white'
            : 'border-gray-300 hover:border-green-400 hover:bg-green-50'
        )}
        title={isCompleted ? 'Unmark completed' : 'Mark as completed'}
      >
        {isCompleted && <Check size={11} strokeWidth={3} />}
      </button>

      {/* Stage Info */}
      <div className="flex-1 min-w-0">
        <div className={cn(
          'text-sm font-medium leading-snug',
          isCompleted && 'line-through text-muted-foreground'
        )}>
          {stage.milestone_name}
        </div>
        <div className="flex flex-wrap gap-x-3 mt-0.5 text-xs text-muted-foreground">
          {stage.duration_days > 0 && <span className="font-medium">{stage.duration_days}d</span>}
          {stage.assigned_to_name && <span>· {stage.assigned_to_name}</span>}
          {stage.planned_start_date && (
            <span>
              · {new Date(stage.planned_start_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
              {stage.planned_end_date && ` → ${new Date(stage.planned_end_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}`}
            </span>
          )}
          {stage.notes && <span className="italic opacity-70">· {stage.notes}</span>}
        </div>
      </div>

      {/* Status Pills */}
      <div className="flex items-center gap-1 shrink-0">
        <div className="flex gap-0.5">
          {Object.entries(STATUS_CONFIG).map(([k, v]) => (
            <button
              key={k}
              onClick={() => onUpdate(stage.id, { status: k })}
              title={v.label}
              className={cn(
                'text-[10px] leading-none px-1.5 py-1 rounded-full transition-all font-medium whitespace-nowrap',
                stage.status === k
                  ? `${v.bg} ${v.color}`
                  : 'bg-gray-100 text-gray-400 hover:bg-gray-200 hover:text-gray-500'
              )}
            >
              {v.short}
            </button>
          ))}
        </div>

        {/* Drive link — visible and editable by all authenticated users */}
        {stage.drive_link ? (
          <a
            href={stage.drive_link}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            className="p-1 rounded hover:bg-orange-50 text-orange-500 hover:text-orange-600 transition-colors shrink-0"
            title="Open Drive folder"
          >
            <ExternalLink size={12} />
          </a>
        ) : (
          <button
            className="p-1 rounded text-gray-300 hover:text-gray-500 hover:bg-gray-100 transition-colors"
            title="Add Drive link"
            onClick={() => setEditOpen(true)}
          >
            <Link2 size={12} />
          </button>
        )}

        {canEdit && (
          <div className="flex gap-0.5 ml-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
              onClick={() => setEditOpen(true)}
              title="Edit stage"
            >
              <Edit2 size={12} />
            </button>
            <button
              className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
              onClick={() => onDelete(stage.id)}
              title="Delete stage"
            >
              <Trash2 size={12} />
            </button>
          </div>
        )}
      </div>

      {editOpen && (
        <StageEditModal
          stage={stage}
          onClose={() => setEditOpen(false)}
          onSave={(data) => { onUpdate(stage.id, data); setEditOpen(false) }}
        />
      )}
    </div>
  )
}

function StageEditModal({ stage, onClose, onSave }) {
  const [form, setForm] = useState({
    milestone_name: stage.milestone_name || '',
    phase: stage.phase || '',
    status: stage.status || 'pending',
    planned_start_date: stage.planned_start_date?.split('T')[0] || '',
    planned_end_date: stage.planned_end_date?.split('T')[0] || '',
    actual_start_date: stage.actual_start_date?.split('T')[0] || '',
    actual_end_date: stage.actual_end_date?.split('T')[0] || '',
    notes: stage.notes || '',
    weight: stage.weight || 1,
    drive_link: stage.drive_link || '',
  })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  return (
    <Modal open onClose={onClose} title="Edit Stage">
      <div className="space-y-3">
        <div>
          <Label>Stage Name</Label>
          <Input className="mt-1" value={form.milestone_name} onChange={e => set('milestone_name', e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Phase</Label>
            <Select className="mt-1" value={form.phase} onChange={e => set('phase', e.target.value)}>
              <option value="">None</option>
              {PHASES.map(p => <option key={p} value={p}>{p}</option>)}
            </Select>
          </div>
          <div>
            <Label>Status</Label>
            <Select className="mt-1" value={form.status} onChange={e => set('status', e.target.value)}>
              {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Planned Start</Label><Input type="date" className="mt-1" value={form.planned_start_date} onChange={e => set('planned_start_date', e.target.value)} /></div>
          <div><Label>Planned End</Label><Input type="date" className="mt-1" value={form.planned_end_date} onChange={e => set('planned_end_date', e.target.value)} /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Actual Start</Label><Input type="date" className="mt-1" value={form.actual_start_date} onChange={e => set('actual_start_date', e.target.value)} /></div>
          <div><Label>Actual End</Label><Input type="date" className="mt-1" value={form.actual_end_date} onChange={e => set('actual_end_date', e.target.value)} /></div>
        </div>
        <div>
          <Label>Weight <span className="text-muted-foreground font-normal text-xs">(for progress calc)</span></Label>
          <Input type="number" step="0.1" min="0" className="mt-1" value={form.weight} onChange={e => set('weight', e.target.value)} />
        </div>
        <div><Label>Notes</Label><Textarea className="mt-1" rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} /></div>
        <div>
          <Label>Drive Link <span className="text-muted-foreground font-normal text-xs">(Google Drive URL)</span></Label>
          <Input
            className="mt-1"
            value={form.drive_link}
            onChange={e => set('drive_link', e.target.value)}
            placeholder="https://drive.google.com/..."
          />
          {form.drive_link && (
            <a href={form.drive_link} target="_blank" rel="noopener noreferrer" className="text-xs text-orange-600 hover:underline mt-1 inline-flex items-center gap-1">
              <ExternalLink size={11} />Open link
            </a>
          )}
        </div>
        <div className="flex gap-2 pt-1">
          <Button onClick={() => onSave(form)}>Save</Button>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </Modal>
  )
}

function AddStageModal({ projectId, onClose, onAdded }) {
  const [form, setForm] = useState({
    title: '', phase: '', planned_start_date: '', planned_end_date: '', notes: '', weight: 1,
  })
  const [loading, setLoading] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSave = async () => {
    if (!form.title) return
    setLoading(true)
    try {
      await api.post(`/projects/${projectId}/stages`, form)
      onAdded()
      onClose()
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal open onClose={onClose} title="Add Stage">
      <div className="space-y-3">
        <div><Label>Stage Name *</Label><Input className="mt-1" value={form.title} onChange={e => set('title', e.target.value)} placeholder="e.g. Civil work on site" /></div>
        <div>
          <Label>Phase</Label>
          <Select className="mt-1" value={form.phase} onChange={e => set('phase', e.target.value)}>
            <option value="">None</option>
            {PHASES.map(p => <option key={p} value={p}>{p}</option>)}
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Planned Start</Label><Input type="date" className="mt-1" value={form.planned_start_date} onChange={e => set('planned_start_date', e.target.value)} /></div>
          <div><Label>Planned End</Label><Input type="date" className="mt-1" value={form.planned_end_date} onChange={e => set('planned_end_date', e.target.value)} /></div>
        </div>
        <div><Label>Notes</Label><Textarea className="mt-1" rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} /></div>
        <div className="flex gap-2 pt-1">
          <Button onClick={handleSave} disabled={loading || !form.title}>
            {loading ? <Spinner className="mr-2" /> : null}Add Stage
          </Button>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </Modal>
  )
}

function ApplyTemplateModal({ projectId, projectType, onClose, onApplied }) {
  const [tab, setTab] = useState('standard')
  const [selectedType, setSelectedType] = useState(projectType || '')
  const [clearExisting, setClearExisting] = useState(false)
  const [applying, setApplying] = useState(false)
  const [applyError, setApplyError] = useState('')

  const { data: customTemplates, refetch: refetchCustom } = useQuery({
    queryKey: ['stage-templates'],
    queryFn: () => api.get('/projects/stage-templates').then(r => r.data.data),
  })
  const [selectedCustomId, setSelectedCustomId] = useState('')
  const [showUpload, setShowUpload] = useState(false)
  const [uploadFile, setUploadFile] = useState(null)
  const [uploadName, setUploadName] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [uploadSuccess, setUploadSuccess] = useState('')

  const handleApply = async () => {
    setApplyError('')
    setApplying(true)
    try {
      await api.post(`/projects/${projectId}/stages/apply-template`, {
        template_source: tab === 'standard' ? 'activity' : 'custom',
        project_type: tab === 'standard' ? selectedType : undefined,
        template_id: tab === 'custom' ? selectedCustomId : undefined,
        clear_existing: clearExisting,
      })
      onApplied()
      onClose()
    } catch (err) {
      setApplyError(err.response?.data?.message || 'Failed to apply template')
    } finally {
      setApplying(false)
    }
  }

  const handleUpload = async () => {
    if (!uploadFile || !uploadName.trim()) return
    setUploadError('')
    setUploadSuccess('')
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', uploadFile)
      fd.append('name', uploadName.trim())
      const res = await api.post('/projects/stage-templates/import', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      const created = res.data.data
      setUploadSuccess(`"${created.name}" saved with ${created.item_count} stages.`)
      setUploadFile(null)
      setUploadName('')
      setShowUpload(false)
      await refetchCustom()
      setSelectedCustomId(created.id)
    } catch (err) {
      setUploadError(err.response?.data?.message || 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const canApply = tab === 'standard' ? !!selectedType : !!selectedCustomId

  return (
    <Modal open onClose={onClose} title="Apply Stage Template">
      <div className="space-y-4">
        <div className="flex border-b">
          {[
            { id: 'standard', label: 'Standard Templates' },
            { id: 'custom',   label: 'Custom Templates'   },
          ].map(t => (
            <button
              key={t.id}
              type="button"
              className={cn(
                'px-4 py-2 text-sm font-medium border-b-2 transition-colors',
                tab === t.id ? 'border-orange-500 text-orange-600' : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
              onClick={() => { setTab(t.id); setApplyError('') }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'standard' && (
          <div>
            <Label>Project Type</Label>
            <Select className="mt-1" value={selectedType} onChange={e => setSelectedType(e.target.value)}>
              <option value="">Select type</option>
              {PROJECT_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g,' ')}</option>)}
            </Select>
            <p className="text-xs text-muted-foreground mt-1">
              Bungalow types and Commercial will map to the nearest standard template automatically.
            </p>
          </div>
        )}

        {tab === 'custom' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Saved Templates</Label>
              <a href="/api/projects/stage-templates/sample" download className="text-xs text-blue-600 hover:underline">
                Download Sample (.xlsx)
              </a>
            </div>
            <Select value={selectedCustomId} onChange={e => setSelectedCustomId(e.target.value)}>
              <option value="">Select a saved template</option>
              {(customTemplates || []).map(t => (
                <option key={t.id} value={t.id}>{t.name} ({t.item_count} stages)</option>
              ))}
            </Select>
            {uploadSuccess && (
              <div className="p-2 bg-green-50 border border-green-200 rounded text-xs text-green-800">{uploadSuccess}</div>
            )}
            {!showUpload ? (
              <Button size="sm" variant="outline" type="button" onClick={() => setShowUpload(true)}>
                Upload New Template
              </Button>
            ) : (
              <div className="border rounded-lg p-3 space-y-2 bg-gray-50">
                <div className="text-sm font-medium">Upload Template File</div>
                <div>
                  <Label className="text-xs">Template Name *</Label>
                  <Input className="mt-1 h-8 text-sm" value={uploadName} onChange={e => setUploadName(e.target.value)} placeholder="e.g. My 3BHK Flow" />
                </div>
                <div>
                  <Label className="text-xs">File (.xlsx, .xls, .csv) *</Label>
                  <input
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    className="mt-1 block w-full text-sm text-gray-600 file:mr-3 file:py-1 file:px-3 file:rounded file:border file:border-gray-300 file:text-xs file:bg-white hover:file:bg-gray-50"
                    onChange={e => setUploadFile(e.target.files?.[0] || null)}
                  />
                </div>
                {uploadError && <p className="text-xs text-red-600">{uploadError}</p>}
                <div className="flex gap-2 pt-1">
                  <Button size="sm" onClick={handleUpload} disabled={uploading || !uploadFile || !uploadName.trim()}>
                    {uploading ? <Spinner className="mr-1" /> : null}Save Template
                  </Button>
                  <Button size="sm" variant="outline" type="button" onClick={() => { setShowUpload(false); setUploadError('') }}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={clearExisting} onChange={e => setClearExisting(e.target.checked)} />
          <span className="text-sm">Replace existing stages</span>
        </label>

        {clearExisting && (
          <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-xs text-yellow-800">
            Warning: This will delete all existing stages for this project.
          </div>
        )}

        {applyError && <p className="text-sm text-red-600">{applyError}</p>}

        <div className="flex gap-2 pt-1">
          <Button onClick={handleApply} disabled={applying || !canApply}>
            {applying ? <Spinner className="mr-2" /> : null}Apply Template
          </Button>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </Modal>
  )
}

export default function StagesTab({ projectId, projectType }) {
  const { user } = useAuthStore()
  const qc = useQueryClient()
  const canEdit = ['admin', 'manager'].includes(user?.role)

  const [addOpen, setAddOpen] = useState(false)
  const [templateOpen, setTemplateOpen] = useState(false)
  const [expandedPhases, setExpandedPhases] = useState({})

  const { data, isLoading } = useQuery({
    queryKey: ['stages', projectId],
    queryFn: () => api.get(`/projects/${projectId}/stages`).then(r => r.data.data),
  })

  const stages = data?.stages || []
  const progress = data?.progress || 0
  const total = data?.total || 0
  const completed = data?.completed || 0

  const updateMutation = useMutation({
    mutationFn: ({ stageId, updates }) => api.put(`/projects/${projectId}/stages/${stageId}`, updates),
    onSuccess: () => qc.invalidateQueries(['stages', projectId]),
  })

  const deleteMutation = useMutation({
    mutationFn: (stageId) => api.delete(`/projects/${projectId}/stages/${stageId}`),
    onSuccess: () => qc.invalidateQueries(['stages', projectId]),
  })

  const handleUpdate = (stageId, updates) => updateMutation.mutate({ stageId, updates })

  const handleDelete = (stageId) => {
    if (!window.confirm('Delete this stage?')) return
    deleteMutation.mutate(stageId)
  }

  const handleMarkAllPhase = async (phaseStages, markAs) => {
    const toUpdate = phaseStages.filter(s => s.status !== markAs)
    await Promise.all(toUpdate.map(s => api.put(`/projects/${projectId}/stages/${s.id}`, { status: markAs })))
    qc.invalidateQueries(['stages', projectId])
  }

  // Group by phase
  const grouped = {}
  for (const s of stages) {
    const key = s.phase || 'Other'
    if (!grouped[key]) grouped[key] = []
    grouped[key].push(s)
  }

  // Sort phases by master order, unknowns go at bottom
  const orderedPhaseKeys = [
    ...PHASE_ORDER.filter(p => grouped[p]),
    ...Object.keys(grouped).filter(p => !PHASE_ORDER.includes(p)),
  ]

  const togglePhase = (phase) => setExpandedPhases(p => ({ ...p, [phase]: !p[phase] }))

  if (isLoading) return <div className="flex justify-center py-8"><Spinner className="h-6 w-6" /></div>

  return (
    <div>
      {/* Header + Progress */}
      <div className="flex items-start justify-between gap-4 mb-5">
        <div className="flex-1">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold">Overall Progress</span>
            <span className="text-sm font-bold text-orange-600">{progress}%</span>
          </div>
          <ProgressBar value={progress} />
          <div className="flex justify-between text-xs text-muted-foreground mt-1.5">
            <span>{completed} of {total} stages completed</span>
            <span>{total - completed} remaining</span>
          </div>
        </div>

        {canEdit && (
          <div className="flex gap-2 shrink-0">
            <Button size="sm" variant="outline" onClick={() => setTemplateOpen(true)}>
              <Layers size={14} className="mr-1" />Apply Template
            </Button>
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <Plus size={14} className="mr-1" />Add Stage
            </Button>
          </div>
        )}
      </div>

      {stages.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-xl">
          <Layers size={32} className="mx-auto mb-2 opacity-30" />
          <p className="text-sm font-medium">No stages yet</p>
          <p className="text-xs mt-1 opacity-70">Apply a template or add stages manually</p>
          {canEdit && (
            <div className="flex gap-2 justify-center mt-4">
              <Button size="sm" variant="outline" onClick={() => setTemplateOpen(true)}>Apply Template</Button>
              <Button size="sm" onClick={() => setAddOpen(true)}>Add Stage</Button>
            </div>
          )}
        </div>
      ) : (
        <div className="border rounded-xl overflow-hidden shadow-sm">
          {orderedPhaseKeys.map(phase => {
            const phaseStages = grouped[phase]
            const pCompleted = phaseStages.filter(s => s.status === 'completed').length
            const allDone = pCompleted === phaseStages.length
            const isExpanded = expandedPhases[phase] !== false // default open

            return (
              <div key={phase} className="border-b last:border-0">
                {/* Phase Header */}
                <div
                  className={cn(
                    'flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors select-none',
                    allDone ? 'bg-green-50 hover:bg-green-100/70' : 'bg-gray-50 hover:bg-gray-100'
                  )}
                  onClick={() => togglePhase(phase)}
                >
                  <span className={cn('transition-transform duration-150', isExpanded ? 'rotate-0' : '-rotate-90')}>
                    <ChevronDown size={15} className="text-gray-400" />
                  </span>

                  <span className={cn('font-semibold text-sm flex-1', allDone && 'text-green-700')}>
                    {phase}
                  </span>

                  <div className="flex items-center gap-3" onClick={e => e.stopPropagation()}>
                    <PhaseProgress completed={pCompleted} total={phaseStages.length} />

                    {canEdit && (
                      <button
                        onClick={() => handleMarkAllPhase(phaseStages, allDone ? 'pending' : 'completed')}
                        className={cn(
                          'flex items-center gap-1 text-xs px-2.5 py-1 rounded-md border font-medium transition-all',
                          allDone
                            ? 'bg-green-100 text-green-700 border-green-200 hover:bg-green-200'
                            : 'bg-white text-gray-500 border-gray-200 hover:bg-orange-50 hover:text-orange-600 hover:border-orange-200'
                        )}
                        title={allDone ? 'Unmark all in this phase' : 'Mark all complete'}
                      >
                        <Check size={11} />
                        {allDone ? 'Undo all' : 'All done'}
                      </button>
                    )}
                  </div>
                </div>

                {/* Stage Rows */}
                {isExpanded && (
                  <div>
                    {phaseStages.map(stage => (
                      <StageRow
                        key={stage.id}
                        stage={stage}
                        canEdit={canEdit}
                        onUpdate={handleUpdate}
                        onDelete={handleDelete}
                      />
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {addOpen && (
        <AddStageModal
          projectId={projectId}
          onClose={() => setAddOpen(false)}
          onAdded={() => qc.invalidateQueries(['stages', projectId])}
        />
      )}

      {templateOpen && (
        <ApplyTemplateModal
          projectId={projectId}
          projectType={projectType}
          onClose={() => setTemplateOpen(false)}
          onApplied={() => qc.invalidateQueries(['stages', projectId])}
        />
      )}
    </div>
  )
}
