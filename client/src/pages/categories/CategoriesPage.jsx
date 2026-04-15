import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../lib/api'
import { Button, Card, PageHeader, Spinner, Badge, Input, Label, Modal } from '../../components/shared'
import { Plus, Tag } from 'lucide-react'

export default function CategoriesPage() {
  const qc = useQueryClient()
  const [modal, setModal] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [name, setName] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.get('/categories').then(r => r.data.data),
  })

  const saveMutation = useMutation({
    mutationFn: (data) => editItem ? api.put(`/categories/${editItem.id}`, data) : api.post('/categories', data),
    onSuccess: () => { qc.invalidateQueries(['categories']); setModal(false); setName(''); setEditItem(null) },
  })

  const toggleMutation = useMutation({
    mutationFn: (id) => api.patch(`/categories/${id}/toggle`),
    onSuccess: () => qc.invalidateQueries(['categories']),
  })

  const openEdit = (cat) => { setEditItem(cat); setName(cat.name); setModal(true) }

  return (
    <div>
      <PageHeader
        title="Categories"
        subtitle="Manage PO element categories"
        action={<Button onClick={() => { setEditItem(null); setName(''); setModal(true) }}><Plus size={15} className="mr-2" />Add Category</Button>}
      />

      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner className="h-8 w-8" /></div>
      ) : (
        <Card>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase">Category Name</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {(data || []).map(cat => (
                <tr key={cat.id} className="border-b hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium flex items-center gap-2"><Tag size={14} className="text-muted-foreground" />{cat.name}</td>
                  <td className="px-4 py-3"><Badge variant={cat.is_active ? 'success' : 'secondary'}>{cat.is_active ? 'Active' : 'Inactive'}</Badge></td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2 justify-end">
                      <Button size="sm" variant="outline" onClick={() => openEdit(cat)}>Edit</Button>
                      <Button size="sm" variant="ghost" onClick={() => toggleMutation.mutate(cat.id)}>
                        {cat.is_active ? 'Deactivate' : 'Activate'}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Modal open={modal} onClose={() => setModal(false)} title={editItem ? 'Edit Category' : 'Add Category'}>
        <Label>Category Name *</Label>
        <Input className="mt-1 mb-4" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Carpentry" />
        <div className="flex gap-2">
          <Button onClick={() => saveMutation.mutate({ name })} disabled={saveMutation.isPending || !name}>
            {saveMutation.isPending && <Spinner className="mr-2" />}Save
          </Button>
          <Button variant="outline" onClick={() => setModal(false)}>Cancel</Button>
        </div>
      </Modal>
    </div>
  )
}
