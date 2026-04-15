import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../lib/api'
import {
  Button, Card, PageHeader, Spinner, Badge,
  Modal, Label, Input, Select
} from '../../components/shared'
import { Plus, Upload, Download, Edit, Trash2, Key, UserCog } from 'lucide-react'
import useAuthStore from '../../store/authStore'

const EMPTY_FORM = { name: '', email: '', password: '', role: 'employee' }
const ROLE_COLORS = { admin: 'destructive', manager: 'info', employee: 'secondary' }

export default function UsersPage() {
  const { user: me } = useAuthStore()
  const qc = useQueryClient()
  const fileRef = useRef()

  const [addModal,       setAddModal]       = useState(false)
  const [editModal,      setEditModal]      = useState(null)   // user object
  const [resetModal,     setResetModal]     = useState(null)   // user object
  const [deleteModal,    setDeleteModal]    = useState(null)   // user object
  const [importModal,    setImportModal]    = useState(false)
  const [importResult,   setImportResult]   = useState(null)
  const [exporting,      setExporting]      = useState(false)

  const [addForm,    setAddForm]    = useState(EMPTY_FORM)
  const [editForm,   setEditForm]   = useState({ name: '', email: '', role: '' })
  const [newPass,    setNewPass]    = useState('')
  const [formError,  setFormError]  = useState('')

  const isAdmin = me?.role === 'admin'

  const { data, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get('/users').then(r => r.data.data),
  })

  const createMutation = useMutation({
    mutationFn: (d) => api.post('/users', d),
    onSuccess: () => { qc.invalidateQueries(['users']); setAddModal(false); setAddForm(EMPTY_FORM); setFormError('') },
    onError: (e) => setFormError(e.response?.data?.message || 'Failed to create user'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => api.put(`/users/${id}`, data),
    onSuccess: () => { qc.invalidateQueries(['users']); setEditModal(null); setFormError('') },
    onError: (e) => setFormError(e.response?.data?.message || 'Failed to update'),
  })

  const resetMutation = useMutation({
    mutationFn: ({ id, password }) => api.patch(`/users/${id}/reset-password`, { password }),
    onSuccess: () => { setResetModal(null); setNewPass('') },
    onError: (e) => setFormError(e.response?.data?.message || 'Failed to reset password'),
  })

  const toggleMutation = useMutation({
    mutationFn: (id) => api.patch(`/users/${id}/toggle`),
    onSuccess: () => qc.invalidateQueries(['users']),
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/users/${id}`),
    onSuccess: () => { qc.invalidateQueries(['users']); setDeleteModal(null) },
    onError: (e) => setFormError(e.response?.data?.message || 'Failed to delete'),
  })

  const importMutation = useMutation({
    mutationFn: (file) => {
      const fd = new FormData(); fd.append('file', file)
      return api.post('/users/import', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
    },
    onSuccess: (res) => { setImportResult(res.data.data); qc.invalidateQueries(['users']) },
    onError: (e) => setFormError(e.response?.data?.message || 'Import failed'),
  })

  const handleDownloadTemplate = () => { window.open('/api/users/template/download', '_blank') }

  const handleExport = async () => {
    setExporting(true)
    try {
      const res = await api.get('/users/export', { responseType: 'blob' })
      const url = window.URL.createObjectURL(new Blob([res.data]))
      const link = document.createElement('a')
      const cd = res.headers?.['content-disposition']
      const filename = cd?.match(/filename="([^"]+)"/)?.[1] || 'users_export.xlsx'
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

  const openEdit = (u) => {
    setEditForm({ name: u.name, email: u.email, role: u.role })
    setFormError('')
    setEditModal(u)
  }

  return (
    <div>
      <PageHeader
        title="Users"
        subtitle={`${data?.length || 0} users`}
        action={
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" onClick={handleExport} disabled={exporting}>
              {exporting ? <Spinner className="mr-2 h-4 w-4" /> : <Download size={14} className="mr-2" />}
              Export
            </Button>
            <Button variant="outline" onClick={handleDownloadTemplate}>
              <Download size={14} className="mr-2" />Template
            </Button>
            <Button variant="outline" onClick={() => { setImportResult(null); setImportModal(true) }}>
              <Upload size={14} className="mr-2" />Bulk Import
            </Button>
            <Button onClick={() => { setAddForm(EMPTY_FORM); setFormError(''); setAddModal(true) }}>
              <Plus size={14} className="mr-2" />Add User
            </Button>
          </div>
        }
      />

      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner className="h-8 w-8" /></div>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50">
                  {['Name', 'Email', 'Role', 'Status', 'Actions'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(data || []).map(u => (
                  <tr key={u.id} className={`border-b hover:bg-gray-50 ${!u.is_active ? 'opacity-60' : ''}`}>
                    <td className="px-4 py-3 font-medium">{u.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{u.email}</td>
                    <td className="px-4 py-3">
                      <Badge variant={ROLE_COLORS[u.role] || 'secondary'} className="capitalize">{u.role}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={u.is_active ? 'success' : 'secondary'}>{u.is_active ? 'Active' : 'Inactive'}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        {/* Edit */}
                        <button
                          className="p-1.5 hover:bg-gray-100 rounded text-gray-500 hover:text-gray-900"
                          title="Edit user"
                          onClick={() => openEdit(u)}
                        ><Edit size={14} /></button>

                        {/* Reset password */}
                        <button
                          className="p-1.5 hover:bg-gray-100 rounded text-gray-500 hover:text-blue-600"
                          title="Reset password"
                          onClick={() => { setNewPass(''); setFormError(''); setResetModal(u) }}
                        ><Key size={14} /></button>

                        {/* Toggle active */}
                        {u.id !== me?.id && (
                          <button
                            className={`px-2 py-1 text-xs rounded border ${u.is_active ? 'text-yellow-700 border-yellow-300 hover:bg-yellow-50' : 'text-green-700 border-green-300 hover:bg-green-50'}`}
                            onClick={() => toggleMutation.mutate(u.id)}
                          >
                            {u.is_active ? 'Deactivate' : 'Activate'}
                          </button>
                        )}

                        {/* Hard delete — admin only, not self */}
                        {isAdmin && u.id !== me?.id && (
                          <button
                            className="p-1.5 hover:bg-red-50 rounded text-gray-400 hover:text-red-600"
                            title="Permanently delete"
                            onClick={() => { setFormError(''); setDeleteModal(u) }}
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

      {/* ── Add User Modal ─────────────────────────── */}
      <Modal open={addModal} onClose={() => setAddModal(false)} title="Add New User">
        <div className="space-y-4">
          {formError && <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{formError}</div>}
          <div><Label>Full Name *</Label><Input className="mt-1" value={addForm.name} onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))} /></div>
          <div><Label>Email *</Label><Input type="email" className="mt-1" value={addForm.email} onChange={e => setAddForm(f => ({ ...f, email: e.target.value }))} /></div>
          <div><Label>Password *</Label><Input type="password" className="mt-1" placeholder="Min 6 characters" value={addForm.password} onChange={e => setAddForm(f => ({ ...f, password: e.target.value }))} /></div>
          <div>
            <Label>Role *</Label>
            <Select className="mt-1" value={addForm.role} onChange={e => setAddForm(f => ({ ...f, role: e.target.value }))}>
              <option value="employee">Employee</option>
              <option value="manager">Manager</option>
              {isAdmin && <option value="admin">Admin</option>}
            </Select>
          </div>
          <div className="flex gap-2 pt-1">
            <Button onClick={() => createMutation.mutate(addForm)} disabled={createMutation.isPending}>
              {createMutation.isPending && <Spinner className="mr-2" />}Create User
            </Button>
            <Button variant="outline" onClick={() => setAddModal(false)}>Cancel</Button>
          </div>
        </div>
      </Modal>

      {/* ── Edit User Modal ────────────────────────── */}
      <Modal open={!!editModal} onClose={() => setEditModal(null)} title={`Edit — ${editModal?.name}`}>
        <div className="space-y-4">
          {formError && <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{formError}</div>}
          <div><Label>Name</Label><Input className="mt-1" value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} /></div>
          <div><Label>Email</Label><Input type="email" className="mt-1" value={editForm.email} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} /></div>
          <div>
            <Label>Role</Label>
            <Select className="mt-1" value={editForm.role} onChange={e => setEditForm(f => ({ ...f, role: e.target.value }))}>
              <option value="employee">Employee</option>
              <option value="manager">Manager</option>
              {isAdmin && <option value="admin">Admin</option>}
            </Select>
          </div>
          <div className="flex gap-2 pt-1">
            <Button onClick={() => updateMutation.mutate({ id: editModal.id, data: editForm })} disabled={updateMutation.isPending}>
              {updateMutation.isPending && <Spinner className="mr-2" />}Save Changes
            </Button>
            <Button variant="outline" onClick={() => setEditModal(null)}>Cancel</Button>
          </div>
        </div>
      </Modal>

      {/* ── Reset Password Modal ───────────────────── */}
      <Modal open={!!resetModal} onClose={() => setResetModal(null)} title={`Reset Password — ${resetModal?.name}`}>
        <div className="space-y-4">
          {formError && <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{formError}</div>}
          <div>
            <Label>New Password *</Label>
            <Input type="password" className="mt-1" placeholder="Min 6 characters" value={newPass} onChange={e => setNewPass(e.target.value)} />
          </div>
          <div className="flex gap-2 pt-1">
            <Button onClick={() => resetMutation.mutate({ id: resetModal.id, password: newPass })} disabled={resetMutation.isPending || newPass.length < 6}>
              {resetMutation.isPending && <Spinner className="mr-2" />}Reset Password
            </Button>
            <Button variant="outline" onClick={() => setResetModal(null)}>Cancel</Button>
          </div>
        </div>
      </Modal>

      {/* ── Delete Confirm Modal ───────────────────── */}
      <Modal open={!!deleteModal} onClose={() => setDeleteModal(null)} title="Permanently Delete User">
        <div className="space-y-4">
          {formError && <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{formError}</div>}
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
            <strong>Warning:</strong> This will permanently delete <strong>{deleteModal?.name}</strong> ({deleteModal?.email}) from the database. This action cannot be undone.
          </div>
          <div className="flex gap-2">
            <Button variant="destructive" onClick={() => deleteMutation.mutate(deleteModal.id)} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending && <Spinner className="mr-2" />}Yes, Delete Permanently
            </Button>
            <Button variant="outline" onClick={() => setDeleteModal(null)}>Cancel</Button>
          </div>
        </div>
      </Modal>

      {/* ── Bulk Import Modal ──────────────────────── */}
      <Modal open={importModal} onClose={() => { setImportModal(false); setImportResult(null) }} title="Bulk Import Users">
        <div className="space-y-4">
          <div className="p-3 bg-blue-50 border border-blue-200 rounded text-sm text-blue-800">
            Upload an Excel/CSV file with columns: <strong>name, email, password, role</strong><br />
            Role must be one of: <code>employee</code>, <code>manager</code>, <code>admin</code>
          </div>
          <Button variant="outline" size="sm" onClick={handleDownloadTemplate}>
            <Download size={13} className="mr-2" />Download Template First
          </Button>

          {importResult ? (
            <div className="p-4 bg-green-50 border border-green-200 rounded text-sm">
              <div className="font-semibold text-green-800 mb-2">Import Complete</div>
              <div>✅ Created: <strong>{importResult.created}</strong></div>
              <div>⏭ Skipped: <strong>{importResult.skipped}</strong></div>
              {importResult.errors?.length > 0 && (
                <div className="mt-2 text-red-700">
                  <div className="font-medium mb-1">Errors:</div>
                  {importResult.errors.slice(0, 8).map((e, i) => (
                    <div key={i} className="text-xs">{e.row}: {e.error}</div>
                  ))}
                </div>
              )}
              <Button className="mt-3" onClick={() => { setImportModal(false); setImportResult(null) }}>Done</Button>
            </div>
          ) : (
            <div>
              <input
                ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
                onChange={e => { if (e.target.files[0]) importMutation.mutate(e.target.files[0]) }}
              />
              <Button onClick={() => fileRef.current.click()} disabled={importMutation.isPending}>
                {importMutation.isPending
                  ? <><Spinner className="mr-2" />Importing...</>
                  : <><Upload size={14} className="mr-2" />Choose File & Import</>}
              </Button>
            </div>
          )}
        </div>
      </Modal>
    </div>
  )
}
