import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../lib/api'
import { Button, Card, PageHeader, Spinner, EmptyState, Badge, Input, Select } from '../../components/shared'
import BulkImportModal from '../../components/shared/BulkImportModal'
import { Plus, Users2, Phone, Mail, Search, Upload, Download, ArrowUpDown, Filter, LayoutGrid, List } from 'lucide-react'
import useAuthStore from '../../store/authStore'

const SORT_OPTIONS = [
  { key: 'latest', label: 'Latest to Oldest' },
  { key: 'oldest', label: 'Oldest to Latest' },
  { key: 'a_z', label: 'A to Z' },
  { key: 'z_a', label: 'Z to A' },
]

const STORAGE_KEYS = {
  sort: 'vendors_sort',
  filter: 'vendors_filter',
  view: 'vendors_view_mode',
}

const readSessionValue = (key, fallback) => {
  if (typeof window === 'undefined') return fallback
  try {
    const value = window.sessionStorage.getItem(key)
    return value ?? fallback
  } catch {
    return fallback
  }
}

const readStoredFilter = () => {
  const fallback = { status: 'all', category: '' }
  const raw = readSessionValue(STORAGE_KEYS.filter, '')
  if (!raw) return fallback

  try {
    const parsed = JSON.parse(raw)
    if (typeof parsed === 'string') return { ...fallback, status: parsed }
    return {
      status: typeof parsed?.status === 'string' ? parsed.status : fallback.status,
      category: typeof parsed?.category === 'string' ? parsed.category : fallback.category,
    }
  } catch {
    return { ...fallback, status: typeof raw === 'string' ? raw : fallback.status }
  }
}

const normalizeVendorName = (name) => (typeof name === 'string' ? name.trim() : '')

const isVendorActive = (vendor) => {
  if (typeof vendor?.status === 'string') return vendor.status.trim().toLowerCase() === 'active'
  return Boolean(vendor?.is_active)
}

export default function VendorsPage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const qc = useQueryClient()

  const [search, setSearch] = useState('')
  const [importOpen, setImportOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [sortBy, setSortBy] = useState(() => {
    const stored = readSessionValue(STORAGE_KEYS.sort, 'latest')
    return SORT_OPTIONS.some(option => option.key === stored) ? stored : 'latest'
  })
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [viewMode, setViewMode] = useState(() => {
    const stored = readSessionValue(STORAGE_KEYS.view, 'cards')
    return stored === 'list' ? 'list' : 'cards'
  })
  const [statusFilter, setStatusFilter] = useState(() => readStoredFilter().status)
  const [categoryFilter, setCategoryFilter] = useState(() => readStoredFilter().category)

  const { data, isLoading } = useQuery({
    queryKey: ['vendors'],
    queryFn: () => api.get('/vendors').then(r => r.data.data),
  })

  const { data: categories } = useQuery({
    queryKey: ['vendor-categories'],
    queryFn: () => api.get('/vendors/categories').then(r => r.data.data),
  })

  const toggleMutation = useMutation({
    mutationFn: (id) => api.patch(`/vendors/${id}/toggle`),
    onSuccess: () => qc.invalidateQueries(['vendors']),
  })

  const vendors = data || []

  const canManage = ['admin', 'manager'].includes(user?.role)

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      window.sessionStorage.setItem(STORAGE_KEYS.sort, sortBy)
    } catch {
      // ignore storage write errors
    }
  }, [sortBy])

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      window.sessionStorage.setItem(STORAGE_KEYS.view, viewMode)
    } catch {
      // ignore storage write errors
    }
  }, [viewMode])

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      window.sessionStorage.setItem(STORAGE_KEYS.filter, JSON.stringify({ status: statusFilter, category: categoryFilter }))
    } catch {
      // ignore storage write errors
    }
  }, [statusFilter, categoryFilter])

  const currentSortLabel = SORT_OPTIONS.find(s => s.key === sortBy)?.label || 'Latest to Oldest'
  const cycleSort = () => {
    const idx = SORT_OPTIONS.findIndex(s => s.key === sortBy)
    const next = SORT_OPTIONS[(idx + 1) % SORT_OPTIONS.length]
    setSortBy(next.key)
  }

  const filtered = useMemo(() => {
    const list = [...vendors]
      .filter(v => {
        const searchMatch = !search
          || v.name?.toLowerCase().includes(search.toLowerCase())
          || (v.category || '').toLowerCase().includes(search.toLowerCase())
          || (v.contact_person || '').toLowerCase().includes(search.toLowerCase())

        const statusMatch = statusFilter === 'all'
          || (statusFilter === 'active' && isVendorActive(v))
          || (statusFilter === 'inactive' && !isVendorActive(v))

        const categoryMatch = !categoryFilter || v.category === categoryFilter

        return searchMatch && statusMatch && categoryMatch
      })

    list.sort((a, b) => {
      if (sortBy === 'a_z') {
        return normalizeVendorName(a?.name).localeCompare(normalizeVendorName(b?.name), undefined, { sensitivity: 'base' })
      }
      if (sortBy === 'z_a') {
        return normalizeVendorName(b?.name).localeCompare(normalizeVendorName(a?.name), undefined, { sensitivity: 'base' })
      }
      const aTime = a.created_at ? new Date(a.created_at).getTime() : 0
      const bTime = b.created_at ? new Date(b.created_at).getTime() : 0
      if (sortBy === 'oldest') return aTime - bTime
      return bTime - aTime
    })

    return list
  }, [vendors, search, statusFilter, categoryFilter, sortBy])

  const activeVendors = filtered.filter(v => isVendorActive(v))
  const inactiveVendors = filtered.filter(v => !isVendorActive(v))
  const showActiveColumn = statusFilter !== 'inactive'
  const showInactiveColumn = statusFilter !== 'active'
  const hasActiveFilters = statusFilter !== 'all' || Boolean(categoryFilter)

  const renderVendorCard = (v) => {
    const active = isVendorActive(v)

    return (
      <Card key={v.id} className={`p-4 ${!active ? 'opacity-60' : ''}`}>
        <div className="flex items-start justify-between mb-2">
          <div>
            <div className="font-semibold text-sm">{v.name}</div>
            {v.category && <Badge variant="secondary" className="mt-1 text-xs">{v.category}</Badge>}
          </div>
          {!active && <Badge variant="secondary">Inactive</Badge>}
        </div>
        {v.contact_person && <div className="text-xs text-muted-foreground mb-1">{v.contact_person}</div>}
        <div className="space-y-1 mt-2">
          {v.phone && <div className="flex items-center gap-1 text-xs text-muted-foreground"><Phone size={11} />{v.phone}</div>}
          {v.email && <div className="flex items-center gap-1 text-xs text-muted-foreground"><Mail size={11} />{v.email}</div>}
        </div>
        {canManage && (
          <div className="flex gap-2 mt-3 pt-3 border-t">
            <Button size="sm" variant="outline" onClick={() => navigate(`/vendors/${v.id}/edit`)}>Edit</Button>
            <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => toggleMutation.mutate(v.id)}>
              {active ? 'Deactivate' : 'Activate'}
            </Button>
          </div>
        )}
      </Card>
    )
  }

  const handleImport = async (file) => {
    const fd = new FormData()
    fd.append('file', file)
    const res = await api.post('/vendors/import', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
    qc.invalidateQueries(['vendors'])
    qc.invalidateQueries(['vendor-categories'])
    return res.data.data
  }

  const handleExport = async () => {
    setExporting(true)
    try {
      const res = await api.get('/vendors/export', { responseType: 'blob' })
      const url = window.URL.createObjectURL(new Blob([res.data]))
      const link = document.createElement('a')
      const cd = res.headers?.['content-disposition']
      const filename = cd?.match(/filename="([^"]+)"/)?.[1] || 'vendors_export.xlsx'
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
        title="Vendors"
        subtitle={`${filtered.length} vendors`}
        action={canManage && (
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" onClick={handleExport} disabled={exporting}>
              {exporting ? <Spinner className="mr-2 h-4 w-4" /> : <Download size={14} className="mr-2" />}
              Export
            </Button>
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <Upload size={14} className="mr-2" />Bulk Import
            </Button>
            <Button onClick={() => navigate('/vendors/new')}>
              <Plus size={16} className="mr-2" />Add Vendor
            </Button>
          </div>
        )}
      />

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search vendors..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        <Button type="button" variant={sortBy === 'latest' ? 'outline' : 'default'} onClick={cycleSort}>
          <ArrowUpDown size={14} className="mr-2" />
          Sort: {currentSortLabel}
        </Button>

        <Button type="button" variant={filtersOpen || hasActiveFilters ? 'default' : 'outline'} onClick={() => setFiltersOpen(v => !v)}>
          <Filter size={14} className="mr-2" />
          Filters
        </Button>

        <div className="ml-auto flex gap-1 border rounded-md p-1 bg-white">
          <Button
            type="button"
            size="sm"
            variant={viewMode === 'cards' ? 'default' : 'ghost'}
            onClick={() => setViewMode('cards')}
          >
            <LayoutGrid size={14} className="mr-1" />Cards
          </Button>
          <Button
            type="button"
            size="sm"
            variant={viewMode === 'list' ? 'default' : 'ghost'}
            onClick={() => setViewMode('list')}
          >
            <List size={14} className="mr-1" />List
          </Button>
        </div>
      </div>

      {filtersOpen && (
        <Card className="p-4 mb-5">
          <div className="grid sm:grid-cols-3 gap-3">
            <div>
              <div className="text-xs text-muted-foreground mb-1">Status</div>
              <Select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                <option value="all">All</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </Select>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">Category</div>
              <Select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
                <option value="">All Categories</option>
                {(categories || []).filter(c => c.is_active).map(c => (
                  <option key={c.id} value={c.name}>{c.name}</option>
                ))}
              </Select>
            </div>
            <div className="flex items-end">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setStatusFilter('all')
                  setCategoryFilter('')
                }}
              >
                Clear Filters
              </Button>
            </div>
          </div>
        </Card>
      )}

      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner className="h-8 w-8" /></div>
      ) : !filtered.length ? (
        <EmptyState icon={Users2} title="No vendors found" />
      ) : viewMode === 'cards' ? (
        <div className={`grid grid-cols-1 gap-6 ${showActiveColumn && showInactiveColumn ? 'lg:grid-cols-2' : ''}`}>
          {showActiveColumn && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold">Active Vendors</h3>
                <span className="text-xs text-muted-foreground">{activeVendors.length}</span>
              </div>
              {activeVendors.length ? (
                <div className="grid gap-4">{activeVendors.map(renderVendorCard)}</div>
              ) : (
                <Card className="p-4 text-sm text-muted-foreground">No active vendors found</Card>
              )}
            </div>
          )}

          {showInactiveColumn && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold">Inactive Vendors</h3>
                <span className="text-xs text-muted-foreground">{inactiveVendors.length}</span>
              </div>
              {inactiveVendors.length ? (
                <div className="grid gap-4">{inactiveVendors.map(renderVendorCard)}</div>
              ) : (
                <Card className="p-4 text-sm text-muted-foreground">No inactive vendors found</Card>
              )}
            </div>
          )}
        </div>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50">
                  {['Name', 'Category', 'Contact Person', 'Phone', 'Email', 'Status', 'Actions'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(v => {
                  const active = isVendorActive(v)
                  return (
                    <tr key={v.id} className={`border-b hover:bg-gray-50 ${!active ? 'opacity-60' : ''}`}>
                      <td className="px-4 py-3 font-medium">{v.name}</td>
                      <td className="px-4 py-3">{v.category || '-'}</td>
                      <td className="px-4 py-3 text-muted-foreground">{v.contact_person || '-'}</td>
                      <td className="px-4 py-3 text-muted-foreground">{v.phone || '-'}</td>
                      <td className="px-4 py-3 text-muted-foreground">{v.email || '-'}</td>
                      <td className="px-4 py-3">
                        <Badge variant={active ? 'success' : 'secondary'}>{active ? 'Active' : 'Inactive'}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        {canManage && (
                          <div className="flex gap-2">
                            <Button size="sm" variant="outline" onClick={() => navigate(`/vendors/${v.id}/edit`)}>Edit</Button>
                            <Button size="sm" variant="ghost" onClick={() => toggleMutation.mutate(v.id)}>
                              {active ? 'Deactivate' : 'Activate'}
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <BulkImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Bulk Import Vendors"
        columns="name, contact_person, phone, email, address, category, gstin, pan, bank_account_holder, bank_account_number, bank_ifsc, bank_name"
        templateUrl="/api/vendors/template/download"
        onImport={handleImport}
      />
    </div>
  )
}


