import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../lib/api'
import { Button, Label, PageHeader, Spinner, Input, Select } from '../../components/shared'
import useAuthStore from '../../store/authStore'

export default function VendorFormPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { user } = useAuthStore()
  const isEdit = Boolean(id)
  const isAdmin = user?.role === 'admin'

  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [category, setCategory] = useState('')
  const [newCategory, setNewCategory] = useState('')

  const refs = {
    name: useRef(),
    contact_person: useRef(),
    phone: useRef(),
    email: useRef(),
    address: useRef(),
    gstin: useRef(),
    pan: useRef(),
    bank_account_holder: useRef(),
    bank_account_number: useRef(),
    bank_ifsc: useRef(),
    bank_name: useRef(),
  }

  const { data: existing, isLoading: loadingExisting } = useQuery({
    queryKey: ['vendor', id],
    queryFn: () => api.get(`/vendors/${id}`).then(r => r.data.data),
    enabled: isEdit,
  })

  const { data: categories, refetch: refetchCategories } = useQuery({
    queryKey: ['vendor-categories'],
    queryFn: () => api.get('/vendors/categories').then(r => r.data.data),
  })

  const createCategoryMutation = useMutation({
    mutationFn: (name) => api.post('/vendors/categories', { name }),
    onSuccess: async (res) => {
      const created = res.data?.data
      await refetchCategories()
      setCategory(created?.name || '')
      setNewCategory('')
    },
    onError: (err) => {
      setError(err.response?.data?.message || 'Failed to create category')
    },
  })

  useEffect(() => {
    if (!existing) return
    Object.keys(refs).forEach((k) => {
      if (refs[k].current && existing[k] != null) {
        refs[k].current.value = existing[k]
      }
    })
    setCategory(existing.category || '')
  }, [existing])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    if (!category) {
      setError('Please select a vendor category')
      setLoading(false)
      return
    }

    const data = {}
    Object.keys(refs).forEach((k) => { data[k] = refs[k].current?.value || '' })
    data.category = category

    try {
      if (isEdit) {
        await api.put(`/vendors/${id}`, data)
      } else {
        await api.post('/vendors', data)
      }
      qc.invalidateQueries(['vendors'])
      navigate('/vendors')
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save')
    } finally {
      setLoading(false)
    }
  }

  if (isEdit && loadingExisting) {
    return <div className="flex justify-center py-16"><Spinner className="h-8 w-8" /></div>
  }

  return (
    <div className="max-w-2xl mx-auto">
      <PageHeader title={isEdit ? 'Edit Vendor' : 'Add Vendor'} />

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-md text-sm">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6 bg-white border rounded-xl p-6">
        <section>
          <h3 className="font-semibold text-sm mb-3 text-muted-foreground uppercase tracking-wide">Basic Info</h3>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <Label>Vendor Name *</Label>
              <Input ref={refs.name} className="mt-1" required />
            </div>
            <div>
              <Label>Contact Person</Label>
              <Input ref={refs.contact_person} className="mt-1" />
            </div>
            <div>
              <Label>Phone</Label>
              <Input ref={refs.phone} type="tel" className="mt-1" />
            </div>
            <div>
              <Label>Email</Label>
              <Input ref={refs.email} type="email" className="mt-1" />
            </div>
            <div>
              <Label>Category *</Label>
              <Select className="mt-1" value={category} onChange={e => setCategory(e.target.value)} required>
                <option value="">Select category</option>
                {(categories || []).filter(c => c.is_active).map(c => (
                  <option key={c.id} value={c.name}>{c.name}</option>
                ))}
              </Select>
            </div>
            <div>
              <Label>GSTIN</Label>
              <Input ref={refs.gstin} className="mt-1" />
            </div>
            <div>
              <Label>PAN</Label>
              <Input ref={refs.pan} className="mt-1" />
            </div>
          </div>

          {isAdmin && (
            <div className="mt-4 p-3 border rounded-lg bg-gray-50">
              <Label>Add New Category (Admin)</Label>
              <div className="flex gap-2 mt-1">
                <Input
                  value={newCategory}
                  onChange={e => setNewCategory(e.target.value)}
                  placeholder="Enter new vendor category"
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={createCategoryMutation.isPending || !newCategory.trim()}
                  onClick={() => createCategoryMutation.mutate(newCategory.trim())}
                >
                  {createCategoryMutation.isPending ? <Spinner className="mr-2 h-4 w-4" /> : null}
                  Add
                </Button>
              </div>
            </div>
          )}

          <div className="mt-4">
            <Label>Address</Label>
            <textarea
              ref={refs.address}
              rows={2}
              className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm mt-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
        </section>

        <section>
          <h3 className="font-semibold text-sm mb-3 text-muted-foreground uppercase tracking-wide">Bank Details</h3>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <Label>Account Holder Name</Label>
              <Input ref={refs.bank_account_holder} className="mt-1" />
            </div>
            <div>
              <Label>Account Number</Label>
              <Input ref={refs.bank_account_number} className="mt-1" />
            </div>
            <div>
              <Label>IFSC Code</Label>
              <Input ref={refs.bank_ifsc} className="mt-1" />
            </div>
            <div>
              <Label>Bank Name</Label>
              <Input ref={refs.bank_name} className="mt-1" />
            </div>
          </div>
        </section>

        <div className="flex gap-3 pt-2">
          <Button type="submit" disabled={loading}>
            {loading ? <Spinner className="mr-2" /> : null}
            {isEdit ? 'Save Changes' : 'Add Vendor'}
          </Button>
          <Button type="button" variant="outline" onClick={() => navigate('/vendors')}>Cancel</Button>
        </div>
      </form>
    </div>
  )
}
