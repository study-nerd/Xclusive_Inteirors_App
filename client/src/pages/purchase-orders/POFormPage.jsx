import { useEffect, useState, useRef } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../lib/api'
import { Button, Input, Label, Select, Textarea, PageHeader, Spinner, Card } from '../../components/shared'
import { Plus, Trash2, Search } from 'lucide-react'
import useAuthStore from '../../store/authStore'

const EMPTY_ITEM = {
  element_id: '', item_name: '', description: '', category_id: '',
  unit: '', quantity: '', rate: '', gst_percent: '18', brand_make: '', is_custom: false,
  images: [], image_previews: [],
}

export default function POFormPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const qc = useQueryClient()
  const isEdit = Boolean(id)
  const { user } = useAuthStore()

  const [form, setForm] = useState({
    project_id: searchParams.get('project_id') || '',
    vendor_id: '', order_poc_user_id: '',
    work_start_date: new Date().toISOString().split('T')[0], 
    payment_terms: '', other_terms: '',
  })
  const [items, setItems]               = useState([{ ...EMPTY_ITEM }])
  const [error, setError]               = useState('')
  const [searches, setSearches]         = useState({})   // { [idx]: string | undefined }
  const [openDropdown, setOpenDropdown] = useState(null)
  const [selectedCategory, setSelectedCategory] = useState('')
  const itemsRef = useRef(items)
  const MAX_IMAGES = 5
  const MAX_IMAGE_SIZE = 2 * 1024 * 1024
  const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']

  // ── Data fetches ──────────────────────────────────────
  const { data: projects } = useQuery({
    queryKey: ['projects-select'],
    queryFn: () => api.get('/projects?status=active').then(r => r.data.data),
  })
  const { data: users } = useQuery({
    queryKey: ['users-select'],
    queryFn: () => api.get('/users').then(r => r.data.data),
  })
  const { data: cats } = useQuery({
    queryKey: ['cats-select'],
    queryFn: () => api.get('/categories?active=true').then(r => r.data.data),
  })
  const { data: vendors } = useQuery({
    queryKey: ['vendors-by-cat', selectedCategory],
    queryFn: () => api.get(
      `/purchase-orders/vendors-by-category${selectedCategory ? `?element_category=${encodeURIComponent(selectedCategory)}` : ''}`
    ).then(r => r.data.data),
  })
  const { data: elements } = useQuery({
    queryKey: ['elements-by-cat', selectedCategory],
    queryFn: () => api.get(
      '/purchase-orders/elements-by-category' +
      (selectedCategory ? `?vendor_category=${encodeURIComponent(selectedCategory)}` : '')
    ).then(r => r.data.data),
  })

  const { data: existing } = useQuery({
    queryKey: ['po', id],
    queryFn: () => api.get(`/purchase-orders/${id}`).then(r => r.data.data),
    enabled: isEdit,
  })

  useEffect(() => {
    if (existing) {
      setForm({
        project_id:        existing.project_id        || '',
        vendor_id:         existing.vendor_id         || '',
        order_poc_user_id: existing.order_poc_user_id || '',
        work_start_date:   existing.work_start_date?.split('T')[0] || '',
        payment_terms:     existing.payment_terms     || '',
        other_terms:       existing.other_terms       || '',
      })
      if (existing.line_items?.length) {
        setItems(existing.line_items.map(i => ({
          element_id:  i.element_id  || '',
          item_name:   i.item_name   || '',
          description: i.description || '',
          category_id: i.category_id || '',
          unit:        i.unit        || '',
          quantity:    i.quantity    || '',
          rate:        i.rate        || '',
          gst_percent: i.gst_percent || '18',
          brand_make:  i.brand_make  || '',
          is_custom:   i.is_custom   || false,
          images: [],
          image_previews: [],
        })))
      }
    }
  }, [existing])

  useEffect(() => {
    const handler = (e) => {
      if (!e.target.closest('[data-dropdown]')) setOpenDropdown(null)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    itemsRef.current = items
  }, [items])

  useEffect(() => {
    return () => {
      (itemsRef.current || []).forEach(it => (it.image_previews || []).forEach(url => URL.revokeObjectURL(url)))
    }
  }, [])

  useEffect(() => {
    if (!isEdit && user?.role === 'employee') {
      setForm(f => ({
        ...f,
        order_poc_user_id: user.id
      }))
    }
  }, [user, isEdit])

  const setF    = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const setItem = (idx, k, v) => setItems(prev => prev.map((it, i) => i === idx ? { ...it, [k]: v } : it))

  const setItemImages = (idx, filesList) => {
    const files = Array.from(filesList || [])
    if (!files.length) return

    const invalidType = files.find(f => !ALLOWED_IMAGE_TYPES.includes(f.type))
    if (invalidType) {
      setError('Only JPG, PNG, or WEBP images are allowed')
      return
    }
    const tooLarge = files.find(f => f.size > MAX_IMAGE_SIZE)
    if (tooLarge) {
      setError('Each image must be 2MB or less')
      return
    }
    const limited = files.slice(0, MAX_IMAGES)
    if (files.length > MAX_IMAGES) setError('Max 5 images per line item')

    setItems(prev => prev.map((it, i) => {
      if (i !== idx) return it
      ;(it.image_previews || []).forEach(url => URL.revokeObjectURL(url))
      const previews = limited.map(f => URL.createObjectURL(f))
      return { ...it, images: limited, image_previews: previews }
    }))
  }

  const onElementSelect = (idx, el) => {
    setItems(prev => prev.map((it, i) => i === idx ? {
      ...it,
      element_id:  el.id,
      item_name:   el.name,
      description: el.description || '',
      category_id: el.category_id || '',
      unit:        el.default_unit || '',
      gst_percent: el.gst_percent?.toString() || '18',
      brand_make:  el.brand_make || '',
    } : it))
    // FIX: delete key entirely so searches[idx] becomes undefined
    // This lets the display fall back to item.item_name correctly
    setSearches(s => { const n = { ...s }; delete n[idx]; return n })
    setOpenDropdown(null)
  }

  const addItem    = () => setItems(prev => [...prev, { ...EMPTY_ITEM }])
  const removeItem = (idx) => setItems(prev => {
    const removed = prev[idx]
    ;(removed?.image_previews || []).forEach(url => URL.revokeObjectURL(url))
    return prev.filter((_, i) => i !== idx)
  })

  const lineTotal = (it) => {
    const base = (parseFloat(it.quantity) || 0) * (parseFloat(it.rate) || 0)
    return base + base * (parseFloat(it.gst_percent) || 0) / 100
  }
  const subtotal = items.reduce((s, it) =>
    s + (parseFloat(it.quantity) || 0) * (parseFloat(it.rate) || 0), 0)
  const gstTotal = items.reduce((s, it) => {
    const base = (parseFloat(it.quantity) || 0) * (parseFloat(it.rate) || 0)
    return s + base * (parseFloat(it.gst_percent) || 0) / 100
  }, 0)
  const total = subtotal + gstTotal

  const uploadLineItemImages = async (po) => {
    const savedItems = po?.line_items || []
    const tasks = []
    items.forEach((item, idx) => {
      if (!item.images?.length) return
      const saved = savedItems.find(li => li.sort_order === idx) || savedItems[idx]
      if (!saved?.id) return
      const fd = new FormData()
      item.images.forEach(f => fd.append('images', f))
      tasks.push(api.post(`/purchase-orders/line-items/${saved.id}/images`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      }))
    })
    if (tasks.length) await Promise.all(tasks)
  }

  const mutation = useMutation({
    mutationFn: (data) => isEdit
      ? api.put(`/purchase-orders/${id}`, data)
      : api.post('/purchase-orders', data),
    onSuccess: async (res) => {
      const saved = res.data.data
      try {
        await uploadLineItemImages(saved)
      } catch (err) {
        alert(err.response?.data?.message || 'Some images failed to upload')
      }
      qc.invalidateQueries(['purchase-orders'])
      navigate(`/purchase-orders/${saved.id}`)
    },
    onError: (err) => setError(err.response?.data?.message || 'Failed to save'),
  })

  // FIX: search now matches name (TYPE), description (NAME), and category
  const filteredElements = (idx) => {
    const s = (searches[idx] || '').toLowerCase()
    if (!s) return []
    return (elements || []).filter(e =>
      e.name?.toLowerCase().includes(s) ||
      e.description?.toLowerCase().includes(s) ||
      e.category_name?.toLowerCase().includes(s)
    ).slice(0, 40)
  }

  // FIX: dropdown label shows "Name — Type" (description — name)
  const elementLabel = (el) => {
    if (el.description) return `${el.description} — ${el.name}`
    return el.name
  }

  const selectedVendor = (vendors || []).find(v => v.id === form.vendor_id)

  return (
    <div className="max-w-5xl mx-auto">
      <PageHeader title={isEdit ? 'Edit Purchase Order' : 'New Purchase Order'} />
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-md text-sm">{error}</div>
      )}

      <form onSubmit={e => {
        e.preventDefault()
        setError('')
        const payloadItems = items.map(({ images, image_previews, ...rest }) => rest)
        mutation.mutate({ ...form, line_items: payloadItems })
      }}>

        {/* Section 1 — Project */}
        <Card className="mb-4 p-5">
          <h3 className="font-semibold mb-4">📌 Project Details</h3>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <Label>Project *</Label>
              <Select className="mt-1" value={form.project_id} onChange={e => setF('project_id', e.target.value)} required>
                <option value="">Select project</option>
                {(projects || []).map(p => <option key={p.id} value={p.id}>{p.name} ({p.code})</option>)}
              </Select>
            </div>
            <div>
              <Label>PO Issued By</Label>
                <Select
                  className="mt-1"
                  value={form.order_poc_user_id}
                  onChange={e => setF('order_poc_user_id', e.target.value)}
                  disabled={user?.role === 'employee'}
                >
                <option value="">Select User</option>
                {(users || []).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </Select>
            </div>
            <div>
              <Label>Work Start Date</Label>
              <Input type="date" className="mt-1" value={form.work_start_date} onChange={e => setF('work_start_date', e.target.value)} />
            </div>
          </div>
        </Card>

        {/* Section 2 — Category Filter + Vendor */}
        <Card className="mb-4 p-5">
          <h3 className="font-semibold mb-4">🏢 Vendor Details</h3>

          <div className="mb-4">
            <Label>
              Filter by Category{' '}
              <span className="text-muted-foreground font-normal text-xs">(optional — filters vendors and materials together)</span>
            </Label>
            <Select
              className="mt-1 max-w-xs"
              value={selectedCategory}
              onChange={e => { setSelectedCategory(e.target.value); setF('vendor_id', '') }}
            >
              <option value="">All categories</option>
              {(cats || []).map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
            </Select>
            {selectedCategory && (
              <p className="text-xs text-muted-foreground mt-1">
                Showing vendors and materials matching <strong>{selectedCategory}</strong>
              </p>
            )}
          </div>

          <Label>Vendor *</Label>
          <Select className="mt-1" value={form.vendor_id} onChange={e => setF('vendor_id', e.target.value)} required>
            <option value="">Select vendor</option>
            {(vendors || []).map(v => (
              <option key={v.id} value={v.id}>{v.name}{v.category ? ` (${v.category})` : ''}</option>
            ))}
          </Select>

          {selectedVendor && (
            <div className="mt-3 grid sm:grid-cols-3 gap-3 text-sm bg-gray-50 rounded-lg p-3">
              <div><span className="text-muted-foreground">Phone:</span> {selectedVendor.phone || '—'}</div>
              <div><span className="text-muted-foreground">Email:</span> {selectedVendor.email || '—'}</div>
              <div><span className="text-muted-foreground">Address:</span> {selectedVendor.address || '—'}</div>
            </div>
          )}
        </Card>

        {/* Section 3 — Line Items */}
        <Card className="mb-4 p-5">
          <h3 className="font-semibold mb-4">🧾 Line Items</h3>

          <div className="hidden md:grid grid-cols-[2fr_1.5fr_1fr_0.8fr_0.8fr_0.8fr_0.8fr_1fr_0.8fr_32px] gap-2 px-1 mb-2 text-xs font-medium text-muted-foreground uppercase">
            <span>Item</span><span>Description</span><span>Category</span>
            <span>Unit</span><span>Qty</span><span>Rate</span>
            <span>GST%</span><span>Brand/Make</span><span className="text-right">Total</span><span />
          </div>

          <div className="space-y-2">
            {items.map((item, idx) => (
              <div
                key={idx}
                className="border rounded-lg p-2 md:border-0 md:p-0"
              >
                <div className="grid grid-cols-1 md:grid-cols-[2fr_1.5fr_1fr_0.8fr_0.8fr_0.8fr_0.8fr_1fr_0.8fr_32px] gap-2 items-start">
                  <div className="relative" data-dropdown>
                  {item.is_custom ? (
                    <Input
                      placeholder="Custom item name"
                      value={item.item_name}
                      onChange={e => setItem(idx, 'item_name', e.target.value)}
                    />
                  ) : (
                    <>
                      <div className="relative">
                        <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                        <Input
                          className="pl-7"
                          placeholder={selectedCategory ? `Search in ${selectedCategory}...` : 'Search by name or type...'}
                          // FIX: use ?? so undefined falls back to item.item_name (not overridden by '')
                          value={searches[idx] ?? item.item_name}
                          onFocus={() => setOpenDropdown(idx)}
                          onChange={e => {
                            setSearches(s => ({ ...s, [idx]: e.target.value }))
                            setOpenDropdown(idx)
                          }}
                        />
                      </div>

                      {openDropdown === idx && filteredElements(idx).length > 0 && (
                        <div className="absolute left-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-xl w-80 max-h-52 overflow-y-auto">
                          {filteredElements(idx).map(el => (
                            <div
                              key={el.id}
                              className="px-3 py-2 hover:bg-orange-50 cursor-pointer border-b last:border-0"
                              onMouseDown={e => { e.preventDefault(); onElementSelect(idx, el) }}
                            >
                              {/* FIX: show "Name — Type" format (description — name) */}
                              <div className="text-sm font-medium">{elementLabel(el)}</div>
                              <div className="text-xs text-muted-foreground">
                                {el.category_name}{el.brand_make ? ` · ${el.brand_make}` : ''}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                  </div>

                <Input
                  placeholder="Description"
                  value={item.description}
                  onChange={e => setItem(idx, 'description', e.target.value)}
                />

                <Select value={item.category_id} onChange={e => setItem(idx, 'category_id', e.target.value)}>
                  <option value="">—</option>
                  {(cats || []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>

                <Input placeholder="Unit"   value={item.unit}        onChange={e => setItem(idx, 'unit', e.target.value)} />
                <Input type="number" min="0" step="0.001" placeholder="Qty"  value={item.quantity}    onChange={e => setItem(idx, 'quantity', e.target.value)} />
                <Input type="number" min="0" step="0.01"  placeholder="Rate" value={item.rate}        onChange={e => setItem(idx, 'rate', e.target.value)} />
                <Input type="number" min="0" max="100"    placeholder="GST%" value={item.gst_percent} onChange={e => setItem(idx, 'gst_percent', e.target.value)} />
                <Input placeholder="Brand/Make" value={item.brand_make} onChange={e => setItem(idx, 'brand_make', e.target.value)} />

                <div className="text-right font-medium text-sm pt-2">₹{lineTotal(item).toFixed(2)}</div>

                  <button
                    type="button"
                    onClick={() => removeItem(idx)}
                    className="text-red-400 hover:text-red-600 pt-2 flex items-center justify-center"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">Item Images (max 5)</Label>
                    <Input
                      type="file"
                      multiple
                      accept="image/jpeg,image/png,image/webp"
                      className="mt-1 max-w-xs"
                      onChange={(e) => {
                        setError('')
                        setItemImages(idx, e.target.files)
                        e.target.value = ''
                      }}
                    />
                  </div>
                  {item.image_previews?.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {item.image_previews.map((src, i) => (
                        <img key={i} src={src} alt="Preview" className="h-14 w-14 rounded border object-cover" />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="flex gap-2 mt-4">
            <Button type="button" variant="outline" size="sm" onClick={addItem}>
              <Plus size={14} className="mr-1" />Add Item
            </Button>
            <Button
              type="button" variant="ghost" size="sm"
              onClick={() => setItems(prev => [...prev, { ...EMPTY_ITEM, is_custom: true }])}
            >
              <Plus size={14} className="mr-1" />Add Custom Item
            </Button>
          </div>
        </Card>

        {/* Section 4 — Summary */}
        <Card className="mb-4 p-5">
          <h3 className="font-semibold mb-4">📊 Summary</h3>
          <div className="ml-auto max-w-xs space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span>₹{subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">GST</span>
              <span>₹{gstTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="flex justify-between text-lg font-bold border-t pt-2">
              <span>Total</span>
              <span>₹{total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
            </div>
          </div>
        </Card>

        {/* Terms */}
        <Card className="mb-6 p-5">
          <h3 className="font-semibold mb-4">📝 Terms</h3>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <Label>Payment Terms</Label>
              <Textarea className="mt-1" rows={2} value={form.payment_terms} onChange={e => setF('payment_terms', e.target.value)} />
            </div>
            <div>
              <Label>Other Terms & Conditions</Label>
              <Textarea className="mt-1" rows={2} value={form.other_terms} onChange={e => setF('other_terms', e.target.value)} />
            </div>
          </div>
        </Card>

        <div className="flex gap-3">
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? <Spinner className="mr-2" /> : null}
            Save as Draft
          </Button>
          <Button type="button" variant="outline" onClick={() => navigate(-1)}>Cancel</Button>
        </div>
      </form>
    </div>
  )
}
