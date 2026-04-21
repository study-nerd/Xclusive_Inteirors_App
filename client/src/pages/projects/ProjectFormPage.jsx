import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../lib/api'
import { Button, Input, Label, Select, Textarea, PageHeader, Spinner, Badge } from '../../components/shared'
import { X, Search } from 'lucide-react'

const PROJECT_TYPES = [
  '2BHK','2.5BHK','3BHK','3.5BHK','4BHK','4.5BHK','5BHK','5.5BHK','6BHK',
  '3BHK_Bungalow','4BHK_Bungalow','5BHK_Bungalow','6BHK_Bungalow','6BHK_Plus_Bungalow','Commercial',
]
const SERVICES = ['Turnkey','Design Consultancy','PM']

const EMPTY = {
  name:'', code:'', client_name:'', site_address:'', location:'',
  status:'active', project_type:'', services_taken:'',
  remarks:'', project_scope:'',
  start_date:'', end_date:''
}

/* ── Team Member Multi-Select ───────────────────────────── */
function TeamMemberSelect({ selectedIds, onChange, allUsers }) {
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)

  const filtered = (allUsers || []).filter(u =>
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  )

  const selected = (allUsers || []).filter(u => selectedIds.includes(u.id))
  const remaining = filtered.filter(u => !selectedIds.includes(u.id))

  const toggle = (userId) => {
    if (selectedIds.includes(userId)) {
      onChange(selectedIds.filter(id => id !== userId))
    } else {
      onChange([...selectedIds, userId])
    }
  }

  const roleColor = { admin: 'bg-red-100 text-red-700', manager: 'bg-blue-100 text-blue-700', employee: 'bg-gray-100 text-gray-700' }

  return (
    <div className="relative">
      {/* Selected chips */}
      <div
        className="min-h-[42px] w-full rounded-md border border-input bg-background px-3 py-2 flex flex-wrap gap-1.5 cursor-text"
        onClick={() => setOpen(true)}
      >
        {selected.map(u => (
          <span key={u.id} className="inline-flex items-center gap-1 bg-orange-100 text-orange-800 text-xs rounded-full px-2 py-0.5 font-medium">
            {u.name}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); toggle(u.id) }}
              className="hover:text-orange-600"
            >
              <X size={11} />
            </button>
          </span>
        ))}
        {selected.length === 0 && (
          <span className="text-muted-foreground text-sm">Select team members...</span>
        )}
      </div>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border rounded-lg shadow-lg max-h-64 overflow-hidden flex flex-col">
          <div className="p-2 border-b">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                autoFocus
                className="w-full pl-8 pr-3 py-1.5 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="Search users..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          </div>
          <div className="overflow-y-auto flex-1">
            {remaining.length === 0 ? (
              <div className="py-3 text-center text-sm text-muted-foreground">No users found</div>
            ) : (
              remaining.map(u => (
                <button
                  key={u.id}
                  type="button"
                  className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center justify-between gap-2"
                  onClick={() => { toggle(u.id); setSearch('') }}
                >
                  <div>
                    <div className="text-sm font-medium">{u.name}</div>
                    <div className="text-xs text-muted-foreground">{u.email}</div>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${roleColor[u.role] || roleColor.employee}`}>
                    {u.role}
                  </span>
                </button>
              ))
            )}
          </div>
          <button
            type="button"
            className="p-2 text-xs text-center text-muted-foreground border-t hover:bg-gray-50"
            onClick={() => setOpen(false)}
          >
            Done
          </button>
        </div>
      )}

      {/* Click-outside close */}
      {open && (
        <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
      )}
    </div>
  )
}

export default function ProjectFormPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const isEdit = Boolean(id)
  const [form, setForm] = useState(EMPTY)
  const [teamMemberIds, setTeamMemberIds] = useState([])
  const [error, setError] = useState('')

  const { data: existing } = useQuery({
    queryKey: ['project', id],
    queryFn: () => api.get(`/projects/${id}`).then(r => r.data.data),
    enabled: isEdit,
  })

  const { data: allUsers } = useQuery({
    queryKey: ['users-list'],
    queryFn: () => api.get('/users').then(r => r.data.data),
  })

  useEffect(() => {
    if (existing) {
      setForm({
        name: existing.name || '',
        code: existing.code || '',
        client_name: existing.client_name || '',
        site_address: existing.site_address || '',
        location: existing.location || '',
        status: existing.status || 'active',
        project_type: existing.project_type || '',
        services_taken: existing.services_taken || '',
        remarks: existing.remarks || '',
        project_scope: existing.project_scope || '',
        start_date: existing.start_date?.split('T')[0] || '',
        end_date: existing.end_date?.split('T')[0] || '',
      })
      if (existing.team) {
        setTeamMemberIds(existing.team.map(u => u.id))
      }
    }
  }, [existing])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const mutation = useMutation({
    mutationFn: async (data) => {
      let res
      if (isEdit) {
        res = await api.put(`/projects/${id}`, data)
      } else {
        res = await api.post('/projects', data)
      }
      const projectId = res.data.data.id
      // Sync team members
      if (teamMemberIds !== null) {
        await api.put(`/projects/${projectId}/team/bulk`, { user_ids: teamMemberIds })
      }
      return res
    },
    onSuccess: (res) => {
      qc.invalidateQueries(['projects'])
      qc.invalidateQueries(['project', id])
      navigate(`/projects/${res.data.data.id}`)
    },
    onError: (err) => setError(err.response?.data?.message || 'Failed to save'),
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    setError('')
    mutation.mutate(form)
  }

  return (
    <div className="max-w-2xl mx-auto">
      <PageHeader title={isEdit ? 'Edit Project' : 'New Project'} />

      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-md text-sm">{error}</div>}

      <form onSubmit={handleSubmit} className="space-y-5 bg-white border rounded-xl p-6">
        <div className="grid sm:grid-cols-2 gap-4">
          <div><Label>Project Name *</Label><Input className="mt-1" value={form.name} onChange={e => set('name', e.target.value)} required /></div>
          <div><Label>Project Code *</Label><Input className="mt-1" value={form.code} onChange={e => set('code', e.target.value)} required /></div>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div><Label>Client Name</Label><Input className="mt-1" value={form.client_name} onChange={e => set('client_name', e.target.value)} /></div>
          <div><Label>Location</Label><Input className="mt-1" value={form.location} onChange={e => set('location', e.target.value)} /></div>
        </div>
        <div><Label>Site Address</Label><Textarea className="mt-1" value={form.site_address} onChange={e => set('site_address', e.target.value)} /></div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <Label>Project Type</Label>
            <Select className="mt-1" value={form.project_type} onChange={e => set('project_type', e.target.value)}>
              <option value="">Select type</option>
              {PROJECT_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
            </Select>
          </div>
          <div>
            <Label>Services Taken</Label>
            <Select className="mt-1" value={form.services_taken} onChange={e => set('services_taken', e.target.value)}>
              <option value="">Select service</option>
              {SERVICES.map(s => <option key={s} value={s}>{s}</option>)}
            </Select>
          </div>
        </div>
        {/* Team Members Multi-Select */}
        <div>
          <Label>Team Members</Label>
          <div className="mt-1">
            <TeamMemberSelect
              selectedIds={teamMemberIds}
              onChange={setTeamMemberIds}
              allUsers={allUsers || []}
            />
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Select all team members working on this project
          </p>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div><Label>Start Date</Label><Input type="date" className="mt-1" value={form.start_date} onChange={e => set('start_date', e.target.value)} /></div>
          <div><Label>End Date</Label><Input type="date" className="mt-1" value={form.end_date} onChange={e => set('end_date', e.target.value)} /></div>
        </div>
        <div><Label>Remarks</Label><Textarea className="mt-1" rows={2} value={form.remarks} onChange={e => set('remarks', e.target.value)} /></div>
        <div><Label>Project Scope / Expectations</Label><Textarea className="mt-1" rows={3} value={form.project_scope} onChange={e => set('project_scope', e.target.value)} /></div>

        <div className="flex gap-3 pt-2">
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? <Spinner className="mr-2" /> : null}
            {isEdit ? 'Save Changes' : 'Create Project'}
          </Button>
          <Button type="button" variant="outline" onClick={() => navigate(-1)}>Cancel</Button>
        </div>
      </form>
    </div>
  )
}
