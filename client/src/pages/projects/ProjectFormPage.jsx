import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../lib/api'
import { Button, Input, Label, Select, Textarea, PageHeader, Spinner } from '../../components/shared'

const PROJECT_TYPES = ['2BHK','2.5BHK','3BHK','3.5BHK','4BHK','4.5BHK','5BHK','5.5BHK','6BHK',
  '3BHK_Bungalow','4BHK_Bungalow','5BHK_Bungalow','6BHK_Bungalow','6BHK_Plus_Bungalow','Commercial']
const SERVICES = ['Turnkey','Project M.','Design Consultancy','PM']

const EMPTY = {
  name:'', code:'', client_name:'', site_address:'', location:'',
  status:'active', project_type:'', services_taken:'',
  team_lead_3d:'', team_lead_2d:'', remarks:'', project_scope:'',
  start_date:'', end_date:''
}

export default function ProjectFormPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const isEdit = Boolean(id)
  const [form, setForm] = useState(EMPTY)
  const [error, setError] = useState('')

  const { data: existing } = useQuery({
    queryKey: ['project', id],
    queryFn: () => api.get(`/projects/${id}`).then(r => r.data.data),
    enabled: isEdit,
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
        team_lead_3d: existing.team_lead_3d || '',
        team_lead_2d: existing.team_lead_2d || '',
        remarks: existing.remarks || '',
        project_scope: existing.project_scope || '',
        start_date: existing.start_date?.split('T')[0] || '',
        end_date: existing.end_date?.split('T')[0] || '',
      })
    }
  }, [existing])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const mutation = useMutation({
    mutationFn: (data) => isEdit
      ? api.put(`/projects/${id}`, data)
      : api.post('/projects', data),
    onSuccess: (res) => {
      qc.invalidateQueries(['projects'])
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
              {PROJECT_TYPES.map(t => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
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
        <div className="grid sm:grid-cols-2 gap-4">
          <div><Label>3D Team Lead</Label><Input className="mt-1" value={form.team_lead_3d} onChange={e => set('team_lead_3d', e.target.value)} /></div>
          <div><Label>2D Team Lead</Label><Input className="mt-1" value={form.team_lead_2d} onChange={e => set('team_lead_2d', e.target.value)} /></div>
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
