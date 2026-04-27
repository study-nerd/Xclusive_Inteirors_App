// ─────────────────────────────────────────────────────────────
// FILE: client/src/pages/projects/StandardTemplateEditorModal.jsx
// NEW FILE — import and use inside ApplyTemplateModal (StagesTab.jsx)
// ─────────────────────────────────────────────────────────────
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../lib/api'
import { Button, Input, Label, Select, Modal, Spinner } from '../../components/shared'
import { Plus, Trash2, Save, GripVertical } from 'lucide-react'
import { cn } from '../../lib/utils'

const PHASES = [
  'Furniture Layout', 'Estimation', '3D Design', '2D Drawings',
  'Execution - Civil', 'Execution', 'Handover',
]

export default function StandardTemplateEditorModal({ projectType, onClose }) {
  const qc = useQueryClient()
  const [saving, setSaving] = useState({})
  const [deleting, setDeleting] = useState({})
  const [addForm, setAddForm] = useState({ milestone_name: '', phase: '', duration_days: 0 })
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState('')
  const [localEdits, setLocalEdits] = useState({}) // { [id]: { milestone_name, phase, duration_days } }

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['activity-templates', projectType],
    queryFn: () =>
      api.get(`/activity-schedule/templates?project_type=${encodeURIComponent(projectType)}`)
        .then(r => r.data.data),
    enabled: !!projectType,
  })

  const setEdit = (id, field, value) =>
    setLocalEdits(e => ({ ...e, [id]: { ...(e[id] || {}), [field]: value } }))

  const getVal = (row, field) =>
    localEdits[row.id]?.[field] !== undefined ? localEdits[row.id][field] : row[field]

  const handleSave = async (row) => {
    const edits = localEdits[row.id]
    if (!edits || !Object.keys(edits).length) return
    setSaving(s => ({ ...s, [row.id]: true }))
    try {
      await api.put(`/activity-schedule/templates/${row.id}`, edits)
      setLocalEdits(e => { const n = { ...e }; delete n[row.id]; return n })
      qc.invalidateQueries(['activity-templates', projectType])
    } catch (err) {
      alert(err.response?.data?.message || 'Save failed')
    } finally {
      setSaving(s => ({ ...s, [row.id]: false }))
    }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this template row? This affects all future projects using this template.')) return
    setDeleting(d => ({ ...d, [id]: true }))
    try {
      await api.delete(`/activity-schedule/templates/${id}`)
      qc.invalidateQueries(['activity-templates', projectType])
    } catch (err) {
      alert(err.response?.data?.message || 'Delete failed')
    } finally {
      setDeleting(d => ({ ...d, [id]: false }))
    }
  }

  const handleAdd = async () => {
    setAddError('')
    if (!addForm.milestone_name.trim()) { setAddError('Stage name is required'); return }
    setAdding(true)
    try {
      await api.post('/activity-schedule/templates', {
        project_type: projectType,
        milestone_name: addForm.milestone_name.trim(),
        phase: addForm.phase || null,
        duration_days: parseInt(addForm.duration_days) || 0,
      })
      setAddForm({ milestone_name: '', phase: '', duration_days: 0 })
      qc.invalidateQueries(['activity-templates', projectType])
    } catch (err) {
      setAddError(err.response?.data?.message || 'Add failed')
    } finally {
      setAdding(false)
    }
  }

  const isDirty = (id) => !!localEdits[id] && Object.keys(localEdits[id]).length > 0

  return (
    <Modal open onClose={onClose} title={`Edit Standard Template — ${projectType.replace(/_/g, ' ')}`}>
      <div className="space-y-4">
        <p className="text-xs text-muted-foreground bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Changes here affect all future projects when this template is applied. Existing project stages are not modified.
        </p>

        {isLoading ? (
          <div className="flex justify-center py-8"><Spinner className="h-5 w-5" /></div>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            {/* Header */}
            <div className="grid grid-cols-[1fr_160px_80px_72px] gap-2 px-3 py-2 bg-gray-50 border-b text-xs font-semibold text-muted-foreground">
              <span>Stage Name</span>
              <span>Phase</span>
              <span>Days</span>
              <span />
            </div>

            {/* Rows */}
            <div className="divide-y max-h-[380px] overflow-y-auto">
              {rows.map((row, i) => (
                <div key={row.id} className={cn('grid grid-cols-[1fr_160px_80px_72px] gap-2 px-3 py-2 items-center', isDirty(row.id) && 'bg-orange-50/40')}>
                  <Input
                    className="h-7 text-xs"
                    value={getVal(row, 'milestone_name')}
                    onChange={e => setEdit(row.id, 'milestone_name', e.target.value)}
                  />
                  <Select
                    className="h-7 text-xs"
                    value={getVal(row, 'phase') || ''}
                    onChange={e => setEdit(row.id, 'phase', e.target.value)}
                  >
                    <option value="">None</option>
                    {PHASES.map(p => <option key={p} value={p}>{p}</option>)}
                  </Select>
                  <Input
                    type="number"
                    min="0"
                    className="h-7 text-xs"
                    value={getVal(row, 'duration_days') ?? 0}
                    onChange={e => setEdit(row.id, 'duration_days', e.target.value)}
                  />
                  <div className="flex gap-1">
                    {isDirty(row.id) && (
                      <button
                        onClick={() => handleSave(row)}
                        disabled={saving[row.id]}
                        className="p-1 rounded hover:bg-green-100 text-green-600 transition-colors"
                        title="Save"
                      >
                        {saving[row.id] ? <Spinner className="h-3 w-3" /> : <Save size={13} />}
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(row.id)}
                      disabled={deleting[row.id]}
                      className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                      title="Delete row"
                    >
                      {deleting[row.id] ? <Spinner className="h-3 w-3" /> : <Trash2 size={13} />}
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Add row */}
            <div className="grid grid-cols-[1fr_160px_80px_72px] gap-2 px-3 py-2 bg-gray-50 border-t items-center">
              <Input
                className="h-7 text-xs"
                placeholder="New stage name..."
                value={addForm.milestone_name}
                onChange={e => setAddForm(f => ({ ...f, milestone_name: e.target.value }))}
              />
              <Select
                className="h-7 text-xs"
                value={addForm.phase}
                onChange={e => setAddForm(f => ({ ...f, phase: e.target.value }))}
              >
                <option value="">None</option>
                {PHASES.map(p => <option key={p} value={p}>{p}</option>)}
              </Select>
              <Input
                type="number"
                min="0"
                className="h-7 text-xs"
                value={addForm.duration_days}
                onChange={e => setAddForm(f => ({ ...f, duration_days: e.target.value }))}
              />
              <button
                onClick={handleAdd}
                disabled={adding}
                className="p-1 rounded bg-orange-500 hover:bg-orange-600 text-white transition-colors flex items-center justify-center"
                title="Add row"
              >
                {adding ? <Spinner className="h-3 w-3" /> : <Plus size={13} />}
              </button>
            </div>
            {addError && <p className="text-xs text-red-600 px-3 pb-2">{addError}</p>}
          </div>
        )}

        <div className="flex justify-end pt-1">
          <Button variant="outline" onClick={onClose}>Done</Button>
        </div>
      </div>
    </Modal>
  )
}
