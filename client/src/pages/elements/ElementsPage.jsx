import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../lib/api'
import { Button, Card, PageHeader, Spinner, EmptyState, Badge, Input, Select, Modal, Label } from '../../components/shared'
import { Plus, Package, Upload, Search, Download } from 'lucide-react'
import useAuthStore from '../../store/authStore'

const EMPTY = { name: '', description: '', category_id: '', default_unit: '', gst_percent: '18', brand_make: '' }
const UNITS = ['Sheets', 'Kg', 'Nos', 'Bundles', 'Rolls', 'Pair', 'Set', 'No.', 'Sq.ft', 'Rft', 'Box', 'Litre']

export default function ElementsPage() {
  const { user } = useAuthStore()
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [catFilter, setCatFilter] = useState('')
  const [modal, setModal] = useState(null)
  const [selected, setSelected] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [importModal, setImportModal] = useState(false)
  const [importResult, setImportResult] = useState(null)
  const [exporting, setExporting] = useState(false)
  const fileRef = useRef()

  const canManage = ['admin', 'manager'].includes(user?.role)

  const { data: elements, isLoading } = useQuery({
    queryKey: ['elements', catFilter, search],
    queryFn: () => api.get(`/elements?active=false${catFilter ? `&category_id=${catFilter}` : ''}${search ? `&search=${search}` : ''}`).then(r => r.data.data),
  })

  const { data: cats } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.get('/categories').then(r => r.data.data),
  })

  const saveMutation = useMutation({
    mutationFn: (data) => selected ? api.put(`/elements/${selected.id}`, data) : api.post('/elements', data),
    onSuccess: () => { qc.invalidateQueries(['elements']); setModal(null); setForm(EMPTY); setSelected(null) },
  })

  const toggleMutation = useMutation({
    mutationFn: (id) => api.patch(`/elements/${id}/toggle`),
    onSuccess: () => qc.invalidateQueries(['elements']),
  })

  const importMutation = useMutation({
    mutationFn: (file) => {
      const fd = new FormData(); fd.append('file', file)
      return api.post('/elements/import', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
    },
    onSuccess: (res) => { setImportResult(res.data.data); qc.invalidateQueries(['elements']) },
  })

  const openEdit = (el) => {
    setSelected(el)
    setForm({
      name: el.name,
      description: el.description || '',
      category_id: el.category_id || '',
      default_unit: el.default_unit || '',
      gst_percent: el.gst_percent?.toString() || '18',
      brand_make: el.brand_make || ''
    })
    setModal('edit')
  }

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleExport = async () => {
    setExporting(true)
    try {
      const res = await api.get('/elements/export', { responseType: 'blob' })
      const url = window.URL.createObjectURL(new Blob([res.data]))
      const link = document.createElement('a')
      const cd = res.headers?.['content-disposition']
      const filename = cd?.match(/filename="([^"]+)"/)?.[1] || 'elements_export.xlsx'
      link.href = url
      link.setAttribute('download', filename)
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="Elements Master"
        subtitle={`${elements?.length || 0} elements`}
        action={canManage && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleExport} disabled={exporting}>
              {exporting ? <Spinner className="mr-2 h-4 w-4" /> : <Download size={15} className="mr-2" />}
              Export
            </Button>
            <Button variant="outline" onClick={() => setImportModal(true)}>
              <Upload size={15} className="mr-2" />Import Excel
            </Button>
            <Button onClick={() => { setForm(EMPTY); setSelected(null); setModal('add') }}>
              <Plus size={15} className="mr-2" />Add Element
            </Button>
          </div>
        )}
      />

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-5">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search elements..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select className="w-48" value={catFilter} onChange={e => setCatFilter(e.target.value)}>
          <option value="">All Categories</option>
          {(cats || []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner className="h-8 w-8" /></div>
      ) : !elements?.length ? (
        <EmptyState icon={Package} title="No elements found" />
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50">
                  {/* CHANGED: Name → Type, Description → Name */}
                  {['Type', 'Name', 'Category', 'Unit', 'GST%', 'Brand/Make', 'Status', ''].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {elements.map(el => (
                  <tr key={el.id} className={`border-b hover:bg-gray-50 ${!el.is_active ? 'opacity-50' : ''}`}>
                    {/* name field = TYPE, description field = NAME */}
                    <td className="px-4 py-2 font-medium">{el.name}</td>
                    <td className="px-4 py-2 text-muted-foreground text-xs max-w-[150px] truncate">{el.description}</td>
                    <td className="px-4 py-2"><Badge variant="secondary">{el.category_name}</Badge></td>
                    <td className="px-4 py-2">{el.default_unit}</td>
                    <td className="px-4 py-2">{el.gst_percent}%</td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">{el.brand_make}</td>
                    <td className="px-4 py-2">
                      <Badge variant={el.is_active ? 'success' : 'secondary'}>{el.is_active ? 'Active' : 'Inactive'}</Badge>
                    </td>
                    <td className="px-4 py-2">
                      {canManage && (
                        <div className="flex gap-1">
                          <Button size="sm" variant="outline" onClick={() => openEdit(el)}>Edit</Button>
                          <Button size="sm" variant="ghost" onClick={() => toggleMutation.mutate(el.id)}>
                            {el.is_active ? 'Off' : 'On'}
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Add / Edit Modal */}
      <Modal
        open={!!modal}
        onClose={() => { setModal(null); setSelected(null) }}
        title={modal === 'edit' ? 'Edit Element' : 'Add Element'}
        className="max-w-lg"
      >
        <div className="space-y-4">
          {/* CHANGED: "Name *" → "Type *", "Description" → "Name" */}
          <div>
            <Label>Type *</Label>
            <Input className="mt-1" value={form.name} onChange={e => set('name', e.target.value)} required />
          </div>
          <div>
            <Label>Name</Label>
            <Input className="mt-1" value={form.description} onChange={e => set('description', e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Category</Label>
              <Select className="mt-1" value={form.category_id} onChange={e => set('category_id', e.target.value)}>
                <option value="">Select</option>
                {(cats || []).filter(c => c.is_active).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </div>
            <div>
              <Label>Default Unit</Label>
              <Select className="mt-1" value={form.default_unit} onChange={e => set('default_unit', e.target.value)}>
                <option value="">Select</option>
                {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
              </Select>
            </div>
            <div>
              <Label>GST %</Label>
              <Input className="mt-1" type="number" min="0" max="100" value={form.gst_percent} onChange={e => set('gst_percent', e.target.value)} />
            </div>
            <div>
              <Label>Brand / Make</Label>
              <Input className="mt-1" value={form.brand_make} onChange={e => set('brand_make', e.target.value)} />
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <Button onClick={() => saveMutation.mutate(form)} disabled={saveMutation.isPending}>
              {saveMutation.isPending && <Spinner className="mr-2" />}Save
            </Button>
            <Button variant="outline" onClick={() => setModal(null)}>Cancel</Button>
          </div>
        </div>
      </Modal>

      {/* Import Modal */}
      <Modal
        open={importModal}
        onClose={() => { setImportModal(false); setImportResult(null) }}
        title="Import Elements via Excel"
      >
        <p className="text-sm text-muted-foreground mb-4">
          Upload an Excel file with columns: Name, Description, Category, Brand / Make, UOM
        </p>
        {importResult ? (
          <div className="p-4 bg-green-50 rounded-lg text-sm">
            <div className="font-medium text-green-800 mb-1">Import Complete</div>
            <div>Created: {importResult.created}</div>
            <div>Skipped: {importResult.skipped}</div>
            {importResult.errors?.length > 0 && (
              <div className="mt-2 text-red-600">
                {importResult.errors.slice(0, 5).map((e, i) => <div key={i}>{e.name}: {e.error}</div>)}
              </div>
            )}
            <Button className="mt-3" onClick={() => { setImportModal(false); setImportResult(null) }}>Done</Button>
          </div>
        ) : (
          <div>
            <input
              ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden"
              onChange={e => { if (e.target.files[0]) importMutation.mutate(e.target.files[0]) }}
            />
            <Button onClick={() => fileRef.current.click()} disabled={importMutation.isPending}>
              {importMutation.isPending
                ? <><Spinner className="mr-2" />Importing...</>
                : <><Upload size={15} className="mr-2" />Choose File</>}
            </Button>
          </div>
        )}
      </Modal>
    </div>
  )
}
