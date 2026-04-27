import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../lib/api'
import { Button, Badge, Spinner, Modal, Input, Label, Select, Textarea } from '../../components/shared'
import { Plus, ChevronDown, Check, AlertCircle, Clock, Ban, Edit2, Trash2, Layers, RefreshCw, ExternalLink, Link2, Calendar } from 'lucide-react'
import { cn } from '../../lib/utils'
import useAuthStore from '../../store/authStore'
import StandardTemplateEditorModal from './StandardTemplateEditorModal'

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

// ── Date helpers ─────────────────────────────────────────────
const today = () => {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

const parseDate = (str) => {
  if (!str) return null
  const d = new Date(str)
  d.setHours(0, 0, 0, 0)
  return isNaN(d.getTime()) ? null : d
}

const fmt = (str) => {
  const d = parseDate(str)
  if (!d) return null
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
}

// Returns { overdue: bool, dueSoon: bool, lagDays: number|null }
const getDateStatus = (stage) => {
  if (stage.status === 'completed') return { overdue: false, dueSoon: false, lagDays: null }
  const end = parseDate(stage.planned_end_date)
  if (!end) return { overdue: false, dueSoon: false, lagDays: null }
  const now = today()
  const diffMs = now - end
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))
  if (diffDays > 0) return { overdue: true, dueSoon: false, lagDays: diffDays }
  if (diffDays >= -3) return { overdue: false, dueSoon: true, lagDays: null }
  return { overdue: false, dueSoon: false, lagDays: null }
}

// Auto-calculate planned dates for all stages sequentially from a start date
const calcDates = (stages, projectStartDate) => {
  if (!projectStartDate || !stages.length) return stages
  let cursor = parseDate(projectStartDate)
  if (!cursor) return stages
  return stages.map(s => {
    const start = new Date(cursor)
    const days = parseInt(s.duration_days) || 1
    const end = new Date(cursor)
    end.setDate(end.getDate() + days - 1)
    cursor = new Date(end)
    cursor.setDate(cursor.getDate() + 1)
    return {
      ...s,
      planned_start_date: start.toISOString().split('T')[0],
      planned_end_date: end.toISOString().split('T')[0],
    }
  })
}

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

function DateChip({ stage }) {
  const start = fmt(stage.planned_start_date)
  const end = fmt(stage.planned_end_date)
  if (!start && !end) return null

  const { overdue, dueSoon, lagDays } = getDateStatus(stage)
  const isCompleted = stage.status === 'completed'

  return (
    <span className={cn(
      'inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full border',
      isCompleted
        ? 'bg-green-50 border-green-200 text-green-700'
        : overdue
          ? 'bg-red-50 border-red-200 text-red-600'
          : dueSoon
            ? 'bg-amber-50 border-amber-200 text-amber-600'
            : 'bg-gray-50 border-gray-200 text-gray-500'
    )}>
      <Calendar size={9} />
      {start}{end && end !== start ? ` → ${end}` : ''}
      {overdue && lagDays && (
        <span className="font-bold">· {lagDays}d late</span>
      )}
    </span>
  )
}

function StageRow({ stage, canEdit, onUpdate, onDelete }) {
  const [editOpen, setEditOpen] = useState(false)
  const isCompleted = stage.status === 'completed'
  const { overdue } = getDateStatus(stage)

  return (
    <div className={cn(
      'flex items-center gap-3 py-3.5 px-5 border-b last:border-0 transition-colors group',
      isCompleted ? 'bg-green-50/30 hover:bg-green-50/50' : overdue ? 'bg-red-50/20 hover:bg-red-50/40' : 'hover:bg-gray-50/70'
    )}>
      {/* Circle Checkbox */}
      <button
        onClick={() => onUpdate(stage.id, { status: isCompleted ? 'pending' : 'completed' })}
        className={cn(
          'w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center transition-all',
          isCompleted
            ? 'bg-green-500 border-green-500 text-white'
            : overdue
              ? 'border-red-400 hover:border-red-500 hover:bg-red-50'
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
        <div className="flex flex-wrap gap-x-2 gap-y-1 mt-1 items-center">
          {/* duration_days hidden per UI requirement */}
          {stage.assigned_to_name && (
            <span className="text-xs text-muted-foreground">· {stage.assigned_to_name}</span>
          )}
          <DateChip stage={stage} />
          {stage.notes && (
            <span className="text-xs text-muted-foreground italic opacity-70 truncate max-w-[200px]">· {stage.notes}</span>
          )}
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

// ── Stage Edit Modal with live date recalculation ────────────
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
    duration_days: stage.duration_days || 0,
  })

  const set = (k, v) => {
    setForm(f => {
      const updated = { ...f, [k]: v }
      // Live recalc: if start date or duration changes, recompute planned_end_date
      if ((k === 'planned_start_date' || k === 'duration_days') && updated.planned_start_date) {
        const start = parseDate(updated.planned_start_date)
        const days = parseInt(updated.duration_days) || 1
        if (start) {
          const end = new Date(start)
          end.setDate(end.getDate() + days - 1)
          updated.planned_end_date = end.toISOString().split('T')[0]
        }
      }
      return updated
    })
  }

  const { overdue, lagDays } = getDateStatus({ ...stage, ...form })

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

        <div>
          <Label>Duration (days)</Label>
          <Input
            type="number" min="1" className="mt-1"
            value={form.duration_days}
            onChange={e => set('duration_days', e.target.value)}
          />
          <p className="text-xs text-muted-foreground mt-1">Changing duration auto-updates Planned End date</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Planned Start</Label>
            <Input type="date" className="mt-1" value={form.planned_start_date} onChange={e => set('planned_start_date', e.target.value)} />
          </div>
          <div>
            <Label>Planned End</Label>
            <Input type="date" className="mt-1" value={form.planned_end_date} onChange={e => set('planned_end_date', e.target.value)} />
          </div>
        </div>

        {/* Overdue warning in modal */}
        {overdue && lagDays && (
          <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
            <AlertCircle size={13} />
            This stage is <strong>{lagDays} day{lagDays > 1 ? 's' : ''} overdue</strong> based on planned end date.
          </div>
        )}

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
    title: '', phase: '', planned_start_date: '', planned_end_date: '', notes: '', weight: 1, duration_days: 0,
  })
  const [loading, setLoading] = useState(false)
  const set = (k, v) => setForm(f => {
    const updated = { ...f, [k]: v }
    if ((k === 'planned_start_date' || k === 'duration_days') && updated.planned_start_date) {
      const start = parseDate(updated.planned_start_date)
      const days = parseInt(updated.duration_days) || 1
      if (start) {
        const end = new Date(start)
        end.setDate(end.getDate() + days - 1)
        updated.planned_end_date = end.toISOString().split('T')[0]
      }
    }
    return updated
  })

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
        <div>
          <Label>Duration (days)</Label>
          <Input type="number" min="1" className="mt-1" value={form.duration_days} onChange={e => set('duration_days', e.target.value)} />
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

function ApplyTemplateModal({ projectId, projectType, startDate, endDate, onClose, onApplied }) {
  const [tab, setTab] = useState('universal')
  const [clearExisting, setClearExisting] = useState(false)
  const [applying, setApplying] = useState(false)
  const [applyError, setApplyError] = useState('')

  // Custom template state
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

  // Day scaling: auto-calculate from end_date if available, else manual input
  const autoTargetDays = (startDate && endDate)
    ? Math.max(1, Math.ceil((new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24)))
    : null

  const [manualDays, setManualDays] = useState('')
  const targetDays = manualDays ? parseInt(manualDays) : autoTargetDays

  const handleApply = async () => {
    setApplyError('')
    setApplying(true)
    try {
      await api.post(`/projects/${projectId}/stages/apply-template`, {
        template_source: tab,
        template_id: tab === 'custom' ? selectedCustomId : undefined,
        clear_existing: clearExisting,
        project_start_date: startDate || null,
        target_days: targetDays || null,
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

  const canApply = tab === 'universal' ? true : (tab === 'custom' ? !!selectedCustomId : false)

  return (
    <Modal open onClose={onClose} title="Apply Stage Template">
      <div className="space-y-4">
        <div className="flex border-b">
          {[
            { id: 'universal', label: 'Standard Template' },
            { id: 'custom',    label: 'Custom Template'   },
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

        {/* Universal template info */}
        {tab === 'universal' && (
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800">
            Applies the standard 122-stage Xclusive Interiors template covering all phases from Furniture Layout to Handover.
          </div>
        )}

        {/* Custom template picker */}
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
              {(customTemplates || []).filter(t => t.name !== 'Universal').map(t => (
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

        {/* Date / day scaling section */}
        <div className="border rounded-lg p-3 space-y-2 bg-gray-50">
          <div className="text-xs font-semibold text-gray-700">Project Timeline</div>
          {autoTargetDays ? (
            <div className="text-xs text-green-700 bg-green-50 border border-green-200 rounded px-2 py-1.5">
              End date set — stages will be auto-scaled to fit <strong>{autoTargetDays} days</strong>
              {startDate && <> (from <strong>{fmt(startDate)}</strong> to <strong>{fmt(endDate)}</strong>)</>}
            </div>
          ) : startDate ? (
            <div className="space-y-2">
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
                No end date set. Enter target days to scale stages, or leave blank to use template durations as-is.
              </p>
              <div>
                <Label className="text-xs">Target completion days (optional)</Label>
                <Input
                  type="number"
                  min="1"
                  placeholder="e.g. 180"
                  className="mt-1 h-8 text-sm"
                  value={manualDays}
                  onChange={e => setManualDays(e.target.value)}
                />
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-gray-500">
                No start date set. Stages will be applied without dates unless you enter target days.
              </p>
              <div>
                <Label className="text-xs">Target completion days (optional)</Label>
                <Input
                  type="number"
                  min="1"
                  placeholder="e.g. 180"
                  className="mt-1 h-8 text-sm"
                  value={manualDays}
                  onChange={e => setManualDays(e.target.value)}
                />
              </div>
            </div>
          )}
        </div>

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

export default function StagesTab({ projectId, projectType, startDate, endDate }) {
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

  const orderedPhaseKeys = [
    ...PHASE_ORDER.filter(p => grouped[p]),
    ...Object.keys(grouped).filter(p => !PHASE_ORDER.includes(p)),
  ]

  // Count overdue stages for summary
  const overdueCount = stages.filter(s => getDateStatus(s).overdue).length

  const togglePhase = (phase) => setExpandedPhases(p => ({ ...p, [phase]: !p[phase] }))

  if (isLoading) return <div className="flex justify-center py-8"><Spinner className="h-6 w-6" /></div>

  return (
    <div>
      {/* Header + Progress */}
      <div className="flex items-start justify-between gap-4 mb-5">
        <div className="flex-1">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold">Overall Progress</span>
            <div className="flex items-center gap-2">
              {overdueCount > 0 && (
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-red-100 text-red-600 border border-red-200">
                  {overdueCount} overdue
                </span>
              )}
              <span className="text-sm font-bold text-orange-600">{progress}%</span>
            </div>
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
            const pCompleted = phaseStages.filter(s => s.status === 'completed' || s.status === 'blocked').length
            const pBlocked = phaseStages.filter(s => s.status === 'blocked').length
            const pOverdue = phaseStages.filter(s => getDateStatus(s).overdue).length
            const allDone = pCompleted === phaseStages.length
            const isExpanded = expandedPhases[phase] !== false

            return (
              <div key={phase} className="border-b last:border-0">
                {/* Phase Header */}
                <div
                  className={cn(
                    'flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors select-none',
                    allDone ? 'bg-green-50 hover:bg-green-100/70' : pOverdue > 0 ? 'bg-red-50/50 hover:bg-red-50' : 'bg-gray-50 hover:bg-gray-100'
                  )}
                  onClick={() => togglePhase(phase)}
                >
                  <span className={cn('transition-transform duration-150', isExpanded ? 'rotate-0' : '-rotate-90')}>
                    <ChevronDown size={15} className="text-gray-400" />
                  </span>

                  <span className={cn('font-semibold text-sm flex-1', allDone && 'text-green-700', pOverdue > 0 && !allDone && 'text-red-700')}>
                    {phase}
                    {pOverdue > 0 && !allDone && (
                      <span className="ml-2 text-[10px] font-medium text-red-500">({pOverdue} overdue)</span>
                    )}
                  </span>

                  <div className="flex items-center gap-3" onClick={e => e.stopPropagation()}>
                    <PhaseProgress completed={pCompleted} total={phaseStages.length} />

                    {canEdit && (
                      <div className="flex items-center gap-1">
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
                        {pBlocked < phaseStages.length && (
                          <button
                            onClick={() => handleMarkAllPhase(phaseStages, 'blocked')}
                            className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-md border font-medium transition-all bg-white text-gray-400 border-gray-200 hover:bg-red-50 hover:text-red-600 hover:border-red-200"
                            title="Block all stages in this phase"
                          >
                            <Ban size={11} />
                            Block all
                          </button>
                        )}
                      </div>
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
          startDate={startDate}
          endDate={endDate}
          onClose={() => setTemplateOpen(false)}
          onApplied={() => qc.invalidateQueries(['stages', projectId])}
        />
      )}
    </div>
  )
}
