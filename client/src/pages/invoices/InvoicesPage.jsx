import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '../../lib/api'
import useInvoiceStore from '../../store/invoiceStore'
import useAuthStore from '../../store/authStore'
import {
  Button, Card, PageHeader, Spinner, Modal,
  Label, Select, Badge, StatusBadge
} from '../../components/shared'
import {
  Upload, Trash2, Download, Eye, Plus,
  FileText, FileSpreadsheet, File, Image, X, ChevronDown
} from 'lucide-react'

// ── File type icon ────────────────────────────────────────────
const FileIcon = ({ type, size = 16 }) => {
  if (!type) return <File size={size} className="text-gray-400" />
  if (['jpg','jpeg','png','webp','gif'].includes(type)) return <Image size={size} className="text-blue-500" />
  if (type === 'pdf')                                   return <FileText size={size} className="text-red-500" />
  if (['xlsx','xls'].includes(type))                    return <FileSpreadsheet size={size} className="text-green-600" />
  if (['doc','docx'].includes(type))                    return <FileText size={size} className="text-blue-600" />
  return <File size={size} className="text-gray-400" />
}

// ── Helpers ───────────────────────────────────────────────────
const fmt = (d) => new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })

export default function InvoicesPage() {
  const { user } = useAuthStore()
  const {
    invoices, loading,
    fetchInvoices, createInvoice, updateInvoiceStatus,
    deleteInvoice, addFiles, deleteFile,
  } = useInvoiceStore()

  const isAdmin = user?.role === 'admin'

  // Filters
  const [filters, setFilters] = useState({ project_id: '', vendor_id: '', po_id: '' })

  // Upload modal
  const [uploadOpen,    setUploadOpen]    = useState(false)
  const [uploadFiles,   setUploadFiles]   = useState([])
  const [uploadForm,    setUploadForm]    = useState({ project_id: '', po_id: '', vendor_id: '' })
  const [uploading,     setUploading]     = useState(false)
  const [uploadError,   setUploadError]   = useState('')
  const fileInputRef = useRef()

  // Files modal (view/add files)
  const [filesModal,    setFilesModal]    = useState(null)   // invoice object
  const [addFilesList,  setAddFilesList]  = useState([])
  const [addingFiles,   setAddingFiles]   = useState(false)
  const addFilesRef = useRef()

  // Delete confirm
  const [deleteTarget,  setDeleteTarget]  = useState(null)   // invoice id
  const [deleting,      setDeleting]      = useState(false)

  // Dropdown data
  const { data: projects } = useQuery({ queryKey: ['projects-select'], queryFn: () => api.get('/projects?status=active').then(r => r.data.data) })
  const { data: vendors  } = useQuery({ queryKey: ['vendors-select'],  queryFn: () => api.get('/vendors?active=true').then(r => r.data.data) })
  const { data: pos      } = useQuery({ queryKey: ['po-select'],       queryFn: () => api.get('/purchase-orders').then(r => r.data.data) })

  useEffect(() => { fetchInvoices(filters) }, [filters])

  // ── Upload submit ──────────────────────────────────────────
  const handleUpload = async () => {
    setUploadError('')
    if (!uploadFiles.length) { setUploadError('Please select at least one file'); return }
    setUploading(true)
    try {
      const fd = new FormData()
      uploadFiles.forEach(f => fd.append('files', f))
      if (uploadForm.project_id) fd.append('project_id', uploadForm.project_id)
      if (uploadForm.po_id)      fd.append('po_id',      uploadForm.po_id)
      if (uploadForm.vendor_id)  fd.append('vendor_id',  uploadForm.vendor_id)
      await createInvoice(fd)
      setUploadOpen(false)
      setUploadFiles([])
      setUploadForm({ project_id: '', po_id: '', vendor_id: '' })
    } catch (err) {
      setUploadError(err.response?.data?.message || 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  // ── Add more files ─────────────────────────────────────────
  const handleAddFiles = async () => {
    if (!addFilesList.length || !filesModal) return
    setAddingFiles(true)
    try {
      const fd = new FormData()
      addFilesList.forEach(f => fd.append('files', f))
      const updated = await addFiles(filesModal.id, fd)
      setFilesModal(updated)
      setAddFilesList([])
    } finally {
      setAddingFiles(false)
    }
  }

  // ── Toggle approve / paid ──────────────────────────────────
  const handleToggle = async (inv, field) => {
    const newVal = !inv[field]
    // Guard: cannot mark paid if not approved
    if (field === 'paid' && newVal && !inv.approved) return
    try {
      await updateInvoiceStatus(inv.id, { [field]: newVal })
      // If filesModal is open for this invoice, sync it
      if (filesModal?.id === inv.id) {
        setFilesModal(prev => ({ ...prev, [field]: newVal }))
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Update failed')
    }
  }

  // ── Delete invoice ─────────────────────────────────────────
  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await deleteInvoice(deleteTarget)
      setDeleteTarget(null)
      if (filesModal?.id === deleteTarget) setFilesModal(null)
    } finally {
      setDeleting(false)
    }
  }

  // ── Delete file ────────────────────────────────────────────
  const handleDeleteFile = async (fileId, invoiceId) => {
    await deleteFile(fileId, invoiceId)
    setFilesModal(prev => prev ? { ...prev, files: prev.files.filter(f => f.id !== fileId) } : null)
  }

  return (
    <div>
      <PageHeader
        title="Invoices"
        subtitle={`${invoices.length} invoices`}
        action={
          <Button onClick={() => { setUploadOpen(true); setUploadError(''); setUploadFiles([]) }}>
            <Plus size={15} className="mr-2" />Upload Invoice
          </Button>
        }
      />

      {/* ── Filters ──────────────────────────────────────── */}
      <div className="flex flex-wrap gap-3 mb-5">
        <Select className="w-48" value={filters.project_id} onChange={e => setFilters(f => ({ ...f, project_id: e.target.value }))}>
          <option value="">All Projects</option>
          {(projects || []).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
        <Select className="w-48" value={filters.vendor_id} onChange={e => setFilters(f => ({ ...f, vendor_id: e.target.value }))}>
          <option value="">All Vendors</option>
          {(vendors || []).map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
        </Select>
        <Select className="w-52" value={filters.po_id} onChange={e => setFilters(f => ({ ...f, po_id: e.target.value }))}>
          <option value="">All POs</option>
          {(pos || []).map(p => <option key={p.id} value={p.id}>{p.po_number}</option>)}
        </Select>
        {(filters.project_id || filters.vendor_id || filters.po_id) && (
          <Button variant="ghost" size="sm" onClick={() => setFilters({ project_id: '', vendor_id: '', po_id: '' })}>
            Clear filters
          </Button>
        )}
      </div>

      {/* ── Table ────────────────────────────────────────── */}
      {loading ? (
        <div className="flex justify-center py-16"><Spinner className="h-8 w-8" /></div>
      ) : !invoices.length ? (
        <div className="text-center py-16 text-muted-foreground">
          <FileText size={40} className="mx-auto mb-3 opacity-30" />
          <p>No invoices yet</p>
        </div>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase">#</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase">Date</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase">Project</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase">Vendor</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase">PO</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase">Files</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase">Approved</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase">Paid</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase">Uploaded by</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv, i) => (
                  <tr key={inv.id} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-3 text-muted-foreground">{i + 1}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{fmt(inv.created_at)}</td>
                    <td className="px-4 py-3">{inv.project_name || <span className="text-muted-foreground">—</span>}</td>
                    <td className="px-4 py-3">{inv.vendor_name  || <span className="text-muted-foreground">—</span>}</td>
                    <td className="px-4 py-3 text-xs font-mono">{inv.po_number || <span className="text-muted-foreground">—</span>}</td>
                    <td className="px-4 py-3">
                      <button
                        className="flex items-center gap-1 text-xs text-primary hover:underline"
                        onClick={() => setFilesModal(inv)}
                      >
                        <Eye size={13} />{inv.files?.length || 0} file{inv.files?.length !== 1 ? 's' : ''}
                      </button>
                    </td>

                    {/* Approved toggle */}
                    <td className="px-4 py-3">
                      {isAdmin ? (
                        <button
                          onClick={() => handleToggle(inv, 'approved')}
                          className={`w-10 h-5 rounded-full transition-colors relative ${inv.approved ? 'bg-green-500' : 'bg-gray-300'}`}
                        >
                          <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${inv.approved ? 'translate-x-5' : 'translate-x-0.5'}`} />
                        </button>
                      ) : (
                        <Badge variant={inv.approved ? 'success' : 'secondary'}>{inv.approved ? 'Yes' : 'No'}</Badge>
                      )}
                    </td>

                    {/* Paid toggle */}
                    <td className="px-4 py-3">
                      {isAdmin ? (
                        <button
                          onClick={() => handleToggle(inv, 'paid')}
                          disabled={!inv.approved}
                          title={!inv.approved ? 'Must approve first' : ''}
                          className={`w-10 h-5 rounded-full transition-colors relative ${inv.paid ? 'bg-blue-500' : 'bg-gray-300'} ${!inv.approved ? 'opacity-40 cursor-not-allowed' : ''}`}
                        >
                          <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${inv.paid ? 'translate-x-5' : 'translate-x-0.5'}`} />
                        </button>
                      ) : (
                        <Badge variant={inv.paid ? 'success' : 'secondary'}>{inv.paid ? 'Yes' : 'No'}</Badge>
                      )}
                    </td>

                    <td className="px-4 py-3 text-xs text-muted-foreground">{inv.uploaded_by_name}</td>

                    {/* Actions */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button
                          className="p-1.5 hover:bg-gray-100 rounded text-muted-foreground hover:text-foreground"
                          title="View files"
                          onClick={() => setFilesModal(inv)}
                        ><Eye size={14} /></button>
                        {isAdmin && (
                          <button
                            className="p-1.5 hover:bg-red-50 rounded text-muted-foreground hover:text-red-600"
                            title="Delete invoice"
                            onClick={() => setDeleteTarget(inv.id)}
                          ><Trash2 size={14} /></button>
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

      {/* ── Upload Modal ──────────────────────────────────── */}
      <Modal open={uploadOpen} onClose={() => setUploadOpen(false)} title="Upload Invoice" className="max-w-lg">
        <div className="space-y-4">
          {uploadError && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{uploadError}</div>
          )}

          {/* File picker */}
          <div>
            <Label>Files <span className="text-muted-foreground font-normal">(PDF, images, Word, Excel)</span></Label>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={e => setUploadFiles(Array.from(e.target.files))}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current.click()}
              className="mt-1 w-full border-2 border-dashed border-gray-300 rounded-lg px-4 py-6 text-center hover:border-primary hover:bg-orange-50 transition-colors"
            >
              <Upload size={22} className="mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Click to select files</p>
            </button>
            {uploadFiles.length > 0 && (
              <div className="mt-2 space-y-1">
                {uploadFiles.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs bg-gray-50 rounded px-2 py-1">
                    <FileIcon type={f.name.split('.').pop().toLowerCase()} size={13} />
                    <span className="flex-1 truncate">{f.name}</span>
                    <button type="button" onClick={() => setUploadFiles(prev => prev.filter((_, j) => j !== i))}>
                      <X size={11} className="text-gray-400 hover:text-red-500" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Optional links */}
          <div className="space-y-3 pt-1">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Link to (optional)</p>
            <div>
              <Label>Project</Label>
              <Select className="mt-1" value={uploadForm.project_id} onChange={e => setUploadForm(f => ({ ...f, project_id: e.target.value }))}>
                <option value="">None</option>
                {(projects || []).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </div>
            <div>
              <Label>Vendor</Label>
              <Select className="mt-1" value={uploadForm.vendor_id} onChange={e => setUploadForm(f => ({ ...f, vendor_id: e.target.value }))}>
                <option value="">None</option>
                {(vendors || []).map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
              </Select>
            </div>
            <div>
              <Label>Purchase Order</Label>
              <Select className="mt-1" value={uploadForm.po_id} onChange={e => setUploadForm(f => ({ ...f, po_id: e.target.value }))}>
                <option value="">None</option>
                {(pos || []).map(p => <option key={p.id} value={p.id}>{p.po_number} — {p.project_name}</option>)}
              </Select>
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <Button onClick={handleUpload} disabled={uploading}>
              {uploading ? <Spinner className="mr-2" /> : <Upload size={14} className="mr-2" />}
              Upload Invoice
            </Button>
            <Button variant="outline" onClick={() => setUploadOpen(false)}>Cancel</Button>
          </div>
        </div>
      </Modal>

      {/* ── Files Modal ───────────────────────────────────── */}
      <Modal
        open={!!filesModal}
        onClose={() => { setFilesModal(null); setAddFilesList([]) }}
        title="Invoice Files"
        className="max-w-lg"
      >
        {filesModal && (
          <div className="space-y-4">
            {/* Invoice meta */}
            <div className="grid grid-cols-2 gap-3 text-sm bg-gray-50 rounded-lg p-3">
              <div><span className="text-muted-foreground">Date:</span> {fmt(filesModal.created_at)}</div>
              <div><span className="text-muted-foreground">By:</span> {filesModal.uploaded_by_name}</div>
              {filesModal.project_name && <div><span className="text-muted-foreground">Project:</span> {filesModal.project_name}</div>}
              {filesModal.vendor_name  && <div><span className="text-muted-foreground">Vendor:</span>  {filesModal.vendor_name}</div>}
              {filesModal.po_number    && <div><span className="text-muted-foreground">PO:</span>      {filesModal.po_number}</div>}
              <div>
                <span className="text-muted-foreground">Status: </span>
                <Badge variant={filesModal.approved ? 'success' : 'secondary'} className="mr-1">{filesModal.approved ? 'Approved' : 'Pending'}</Badge>
                {filesModal.paid && <Badge variant="info">Paid</Badge>}
              </div>
            </div>

            {/* File list */}
            <div>
              <p className="text-sm font-medium mb-2">Files ({filesModal.files?.length || 0})</p>
              {!filesModal.files?.length ? (
                <p className="text-sm text-muted-foreground">No files attached</p>
              ) : (
                <div className="space-y-1">
                  {filesModal.files.map(f => (
                    <div key={f.id} className="flex items-center gap-2 px-3 py-2 bg-gray-50 border rounded hover:bg-gray-100 transition">
                      <FileIcon type={f.file_type} size={15} />
                      <span className="flex-1 truncate text-sm">{f.file_name}</span>
                      <span className="text-xs text-muted-foreground uppercase">{f.file_type}</span>
                      <a
                        href={f.file_url}
                        download={f.file_name}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1 hover:text-primary"
                        title="Download"
                      ><Download size={13} /></a>
                      {isAdmin && (
                        <button
                          className="p-1 hover:text-red-600"
                          title="Delete file"
                          onClick={() => handleDeleteFile(f.id, filesModal.id)}
                        ><Trash2 size={13} /></button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Add more files */}
            <div className="pt-2 border-t">
              <p className="text-sm font-medium mb-2">Add more files</p>
              <input
                ref={addFilesRef}
                type="file"
                multiple
                className="hidden"
                onChange={e => setAddFilesList(Array.from(e.target.files))}
              />
              <Button variant="outline" size="sm" onClick={() => addFilesRef.current.click()}>
                <Upload size={13} className="mr-2" />Select Files {addFilesList.length > 0 && `(${addFilesList.length} selected)`}
              </Button>
              {addFilesList.length > 0 && (
                <Button size="sm" className="ml-2" onClick={handleAddFiles} disabled={addingFiles}>
                  {addingFiles ? <Spinner className="mr-2" /> : null}Upload
                </Button>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* ── Delete Confirm Modal ──────────────────────────── */}
      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Delete Invoice Permanently">
        <div className="p-4 bg-red-50 border border-red-200 rounded text-sm text-red-800 mb-4">
          This will permanently delete the invoice and all attached files. This cannot be undone.
        </div>
        <div className="flex gap-2">
          <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
            {deleting && <Spinner className="mr-2" />}Delete Permanently
          </Button>
          <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
        </div>
      </Modal>
    </div>
  )
}
