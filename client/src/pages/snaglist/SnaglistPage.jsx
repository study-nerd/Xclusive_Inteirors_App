import { useState, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../lib/api'
import {
  Button, Card, PageHeader, Spinner, EmptyState, StatusBadge,
  Modal, Label, Input, Textarea, Select,
} from '../../components/shared'
import { Plus, AlertTriangle, Upload, FileText, FileSpreadsheet, File, X, Image, Trash2 } from 'lucide-react'
import useAuthStore from '../../store/authStore'

const EMPTY_SNAG = { project_id: '', area: '', item_name: '', description: '', designer_name: '' }

const FileIcon = ({ type }) => {
  if (type === 'pdf') return <FileText size={18} className="text-red-500" />
  if (['xlsx', 'xls'].includes(type)) return <FileSpreadsheet size={18} className="text-green-600" />
  if (['doc', 'docx'].includes(type)) return <FileText size={18} className="text-blue-600" />
  return <File size={18} className="text-gray-500" />
}

export default function SnaglistPage() {
  const { user } = useAuthStore()
  const qc = useQueryClient()
  const [sp] = useSearchParams()

  const [filter, setFilter] = useState({ project_id: sp.get('project_id') || '', status: '' })
  const [addModal, setAddModal] = useState(false)
  const [reviewModal, setReviewModal] = useState(null)
  const [detailModal, setDetailModal] = useState(null)
  const [deleteModal, setDeleteModal] = useState(null)
  const [form, setForm] = useState(EMPTY_SNAG)
  const [reviewForm, setReviewForm] = useState({ status: '', admin_note: '', vendor_id: '', date_of_confirmation: '', date_of_material_supply: '' })

  const [snagImages, setSnagImages] = useState([])
  const [imagePreviews, setImagePreviews] = useState([])
  const [snagFiles, setSnagFiles] = useState([])

  const imageRef = useRef()
  const fileRef = useRef()

  const canReview = ['admin', 'manager'].includes(user?.role)
  const isAdmin = user?.role === 'admin'

  const { data: projects } = useQuery({
    queryKey: ['projects-select'],
    queryFn: () => api.get('/projects?status=active').then((r) => r.data.data),
  })

  const { data: vendors } = useQuery({
    queryKey: ['vendors-select'],
    queryFn: () => api.get('/vendors').then((r) => r.data.data),
  })

  const { data, isLoading } = useQuery({
    queryKey: ['snags', filter],
    queryFn: () => {
      const q = new URLSearchParams(Object.fromEntries(Object.entries(filter).filter(([, v]) => v)))
      return api.get(`/snaglist?${q}`).then((r) => r.data.data)
    },
  })

  const { data: detailData } = useQuery({
    queryKey: ['snag-detail', detailModal?.id],
    queryFn: () => api.get(`/snaglist/${detailModal.id}`).then((r) => r.data.data),
    enabled: !!detailModal,
  })

  const addMutation = useMutation({
    mutationFn: () => {
      const fd = new FormData()
      Object.entries(form).forEach(([k, v]) => fd.append(k, v))
      snagImages.forEach((f) => fd.append('images', f))
      snagFiles.forEach((f) => fd.append('files', f))
      return api.post('/snaglist', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
    },
    onSuccess: () => {
      qc.invalidateQueries(['snags'])
      setAddModal(false)
      setForm(EMPTY_SNAG)
      setSnagImages([])
      setImagePreviews([])
      setSnagFiles([])
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => api.patch(`/snaglist/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries(['snags'])
      setReviewModal(null)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/snaglist/${id}`),
    onSuccess: (_, id) => {
      qc.invalidateQueries(['snags'])
      if (detailModal?.id === id) setDetailModal(null)
      if (reviewModal?.id === id) setReviewModal(null)
      setDeleteModal(null)
    },
  })

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const setR = (k, v) => setReviewForm((f) => ({ ...f, [k]: v }))

  const handleImages = (files) => {
    const arr = Array.from(files)
    setSnagImages((prev) => [...prev, ...arr])
    arr.forEach((f) => {
      const reader = new FileReader()
      reader.onload = (e) => setImagePreviews((prev) => [...prev, { name: f.name, src: e.target.result }])
      reader.readAsDataURL(f)
    })
  }

  const removeImage = (idx) => {
    setSnagImages((prev) => prev.filter((_, i) => i !== idx))
    setImagePreviews((prev) => prev.filter((_, i) => i !== idx))
  }

  const handleFiles = (files) => setSnagFiles((prev) => [...prev, ...Array.from(files)])
  const removeFile = (idx) => setSnagFiles((prev) => prev.filter((_, i) => i !== idx))

  const openReview = (snag) => {
    setReviewModal(snag)
    setReviewForm({
      status: snag.status,
      admin_note: snag.admin_note || '',
      vendor_id: snag.vendor_id || '',
      date_of_confirmation: snag.date_of_confirmation || '',
      date_of_material_supply: snag.date_of_material_supply || '',
    })
  }

  return (
    <div>
      <PageHeader
        title="Snag List"
        subtitle={`${data?.length || 0} items`}
        action={<Button onClick={() => setAddModal(true)}><Plus size={15} className="mr-2" />Add Snag</Button>}
      />

      <div className="flex flex-wrap gap-3 mb-5">
        <Select className="w-48" value={filter.project_id} onChange={(e) => setFilter((f) => ({ ...f, project_id: e.target.value }))}>
          <option value="">All Projects</option>
          {(projects || []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
        <Select className="w-44" value={filter.status} onChange={(e) => setFilter((f) => ({ ...f, status: e.target.value }))}>
          <option value="">All Statuses</option>
          <option value="open">Open</option>
          <option value="in_review">In Review</option>
          <option value="resolved">Resolved</option>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner className="h-8 w-8" /></div>
      ) : !data?.length ? (
        <EmptyState icon={AlertTriangle} title="No snags logged" />
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50">
                  {['Area', 'Item', 'Description', 'Project', 'Vendor', 'Conf. Date', 'Supply Date', 'Status', ''].map((h) => (
                    <th key={h} className="text-left px-3 py-3 text-xs font-medium text-muted-foreground uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.map((snag) => (
                  <tr key={snag.id} className="border-b hover:bg-gray-50 cursor-pointer" onClick={() => setDetailModal(snag)}>
                    <td className="px-3 py-2 font-medium">{snag.area || '-'}</td>
                    <td className="px-3 py-2">{snag.item_name || '-'}</td>
                    <td className="px-3 py-2 text-muted-foreground max-w-[160px] truncate">{snag.description}</td>
                    <td className="px-3 py-2 text-muted-foreground">{snag.project_name}</td>
                    <td className="px-3 py-2 text-muted-foreground">{snag.vendor_name || '-'}</td>
                    <td className="px-3 py-2 text-xs">{snag.date_of_confirmation ? new Date(snag.date_of_confirmation).toLocaleDateString('en-IN') : '-'}</td>
                    <td className="px-3 py-2 text-xs">{snag.date_of_material_supply ? new Date(snag.date_of_material_supply).toLocaleDateString('en-IN') : '-'}</td>
                    <td className="px-3 py-2"><StatusBadge status={snag.status} /></td>
                    <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                      <div className="flex gap-2">
                        {canReview && snag.status !== 'resolved' && (
                          <Button size="sm" variant="outline" onClick={() => openReview(snag)}>Review</Button>
                        )}
                        {isAdmin && (
                          <Button size="sm" variant="destructive" onClick={() => setDeleteModal(snag)}>
                            <Trash2 size={13} className="mr-1" />Delete
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Modal open={addModal} onClose={() => setAddModal(false)} title="Log Snag" className="max-w-lg">
        <div className="space-y-3">
          <div>
            <Label>Project *</Label>
            <Select className="mt-1" value={form.project_id} onChange={(e) => set('project_id', e.target.value)}>
              <option value="">Select project</option>
              {(projects || []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Area</Label><Input className="mt-1" value={form.area} onChange={(e) => set('area', e.target.value)} placeholder="e.g. Entrance" /></div>
            <div><Label>Item Name</Label><Input className="mt-1" value={form.item_name} onChange={(e) => set('item_name', e.target.value)} placeholder="e.g. Safety Door" /></div>
          </div>
          <div><Label>Description *</Label><Textarea className="mt-1" rows={3} value={form.description} onChange={(e) => set('description', e.target.value)} required /></div>
          <div><Label>Designer Name</Label><Input className="mt-1" value={form.designer_name} onChange={(e) => set('designer_name', e.target.value)} /></div>

          <div>
            <Label className="flex items-center gap-1"><Image size={13} />Photos</Label>
            <input ref={imageRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => handleImages(e.target.files)} />
            <Button type="button" variant="outline" size="sm" className="mt-1" onClick={() => imageRef.current.click()}>
              <Upload size={13} className="mr-1" />Upload Photos
            </Button>
            {imagePreviews.length > 0 && (
              <div className="grid grid-cols-4 gap-2 mt-2">
                {imagePreviews.map((img, i) => (
                  <div key={i} className="relative">
                    <img src={img.src} className="w-full h-16 object-cover rounded border" alt={img.name} />
                    <button type="button" onClick={() => removeImage(i)} className="absolute top-0.5 right-0.5 bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center text-xs"><X size={8} /></button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <Label className="flex items-center gap-1"><FileText size={13} />Files (PDF, Word, Excel)</Label>
            <input ref={fileRef} type="file" accept=".pdf,.doc,.docx,.xls,.xlsx" multiple className="hidden" onChange={(e) => handleFiles(e.target.files)} />
            <Button type="button" variant="outline" size="sm" className="mt-1" onClick={() => fileRef.current.click()}>
              <Upload size={13} className="mr-1" />Upload Files
            </Button>
            {snagFiles.length > 0 && (
              <div className="mt-2 space-y-1">
                {snagFiles.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs bg-gray-50 rounded px-2 py-1">
                    <FileIcon type={f.name.split('.').pop()} />
                    <span className="flex-1 truncate">{f.name}</span>
                    <button type="button" onClick={() => removeFile(i)} className="text-red-400 hover:text-red-600"><X size={11} /></button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-2 pt-2">
            <Button onClick={() => addMutation.mutate()} disabled={addMutation.isPending || !form.project_id || !form.description}>
              {addMutation.isPending && <Spinner className="mr-2" />}Submit Snag
            </Button>
            <Button variant="outline" onClick={() => setAddModal(false)}>Cancel</Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!detailModal} onClose={() => setDetailModal(null)} title={`Snag - ${detailModal?.item_name || 'Detail'}`} className="max-w-xl">
        {detailData ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-muted-foreground">Area:</span> {detailData.area || '-'}</div>
              <div><span className="text-muted-foreground">Status:</span> <StatusBadge status={detailData.status} /></div>
              <div><span className="text-muted-foreground">Project:</span> {detailData.project_name}</div>
              <div><span className="text-muted-foreground">Reported by:</span> {detailData.reported_by_name}</div>
              {detailData.vendor_name && <div><span className="text-muted-foreground">Vendor:</span> {detailData.vendor_name}</div>}
              {detailData.date_of_confirmation && <div><span className="text-muted-foreground">Conf. date:</span> {new Date(detailData.date_of_confirmation).toLocaleDateString('en-IN')}</div>}
              {detailData.date_of_material_supply && <div><span className="text-muted-foreground">Supply date:</span> {new Date(detailData.date_of_material_supply).toLocaleDateString('en-IN')}</div>}
            </div>

            <div className="text-sm"><span className="text-muted-foreground font-medium">Description:</span><p className="mt-1">{detailData.description}</p></div>
            {detailData.admin_note && <div className="text-sm p-3 bg-yellow-50 border border-yellow-200 rounded"><span className="font-medium">Admin Note:</span> {detailData.admin_note}</div>}

            {detailData.images?.length > 0 && (
              <div>
                <div className="text-sm font-medium mb-2">Photos ({detailData.images.length})</div>
                <div className="grid grid-cols-3 gap-2">
                  {detailData.images.map((img) => (
                    <a key={img.id} href={img.file_url} target="_blank" rel="noopener noreferrer">
                      <img src={img.file_url} className="w-full h-24 object-cover rounded border hover:opacity-80 transition" alt="" />
                    </a>
                  ))}
                </div>
              </div>
            )}

            {detailData.files?.length > 0 && (
              <div>
                <div className="text-sm font-medium mb-2">Files ({detailData.files.length})</div>
                <div className="space-y-1">
                  {detailData.files.map((f) => (
                    <a
                      key={f.id}
                      href={f.file_url}
                      download={f.file_name}
                      className="flex items-center gap-2 px-3 py-2 bg-gray-50 border rounded hover:bg-gray-100 transition text-sm"
                    >
                      <FileIcon type={f.file_type} />
                      <span className="flex-1 truncate">{f.file_name}</span>
                      <span className="text-xs text-muted-foreground uppercase">{f.file_type}</span>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {isAdmin && (
              <div className="pt-2 border-t">
                <Button variant="destructive" onClick={() => setDeleteModal(detailData)}>
                  <Trash2 size={14} className="mr-2" />Delete Permanently
                </Button>
              </div>
            )}
          </div>
        ) : <div className="flex justify-center py-8"><Spinner /></div>}
      </Modal>

      <Modal open={!!deleteModal} onClose={() => setDeleteModal(null)} title="Delete Snag Permanently">
        <div className="p-4 bg-red-50 border border-red-200 rounded text-sm text-red-800 mb-4">
          This will permanently delete this snag and all attached files. This cannot be undone.
        </div>
        <div className="flex gap-2">
          <Button
            variant="destructive"
            onClick={() => deleteMutation.mutate(deleteModal.id)}
            disabled={deleteMutation.isPending}
          >
            {deleteMutation.isPending && <Spinner className="mr-2" />}Delete Permanently
          </Button>
          <Button variant="outline" onClick={() => setDeleteModal(null)}>Cancel</Button>
        </div>
      </Modal>

      <Modal open={!!reviewModal} onClose={() => setReviewModal(null)} title="Review Snag" className="max-w-lg">
        {reviewModal && (
          <div className="space-y-3">
            <div className="p-3 bg-gray-50 rounded text-sm">
              <div className="font-medium">{reviewModal.item_name}</div>
              <div className="text-muted-foreground">{reviewModal.area} - {reviewModal.project_name}</div>
              <div className="mt-1">{reviewModal.description}</div>
            </div>
            <div>
              <Label>Status</Label>
              <Select className="mt-1" value={reviewForm.status} onChange={(e) => setR('status', e.target.value)}>
                <option value="open">Open</option>
                <option value="in_review">In Review</option>
                <option value="resolved">Resolved</option>
              </Select>
            </div>
            <div>
              <Label>Assign Vendor</Label>
              <Select className="mt-1" value={reviewForm.vendor_id} onChange={(e) => setR('vendor_id', e.target.value)}>
                <option value="">Select vendor</option>
                {(vendors || []).map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Date of Confirmation</Label><Input type="date" className="mt-1" value={reviewForm.date_of_confirmation} onChange={(e) => setR('date_of_confirmation', e.target.value)} /></div>
              <div><Label>Date of Material Supply</Label><Input type="date" className="mt-1" value={reviewForm.date_of_material_supply} onChange={(e) => setR('date_of_material_supply', e.target.value)} /></div>
            </div>
            <div><Label>Admin Note</Label><Textarea className="mt-1" rows={2} value={reviewForm.admin_note} onChange={(e) => setR('admin_note', e.target.value)} /></div>
            <div className="flex gap-2 pt-2">
              <Button onClick={() => updateMutation.mutate({ id: reviewModal.id, data: reviewForm })} disabled={updateMutation.isPending}>
                {updateMutation.isPending && <Spinner className="mr-2" />}Save
              </Button>
              <Button variant="outline" onClick={() => setReviewModal(null)}>Cancel</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}