import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../../lib/api'
import { Button, Card, PageHeader, StatusBadge, Spinner, EmptyState, Badge, Input, Select } from '../../components/shared'
import BulkImportModal from '../../components/shared/BulkImportModal'
import { Plus, FolderOpen, MapPin, Upload, ArrowUpDown, Filter, Search, LayoutGrid, List } from 'lucide-react'
import useAuthStore from '../../store/authStore'

const SORT_OPTIONS = [
  { key: 'latest', label: 'Latest to Oldest' },
  { key: 'oldest', label: 'Oldest to Latest' },
  { key: 'a_z', label: 'A to Z' },
  { key: 'z_a', label: 'Z to A' },
]

export default function ProjectsPage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const qc = useQueryClient()

  const [tab, setTab] = useState('active')
  const [importOpen, setImportOpen] = useState(false)
  const [viewMode, setViewMode] = useState('cards')
  const [sortBy, setSortBy] = useState('latest')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [projectTypeFilter, setProjectTypeFilter] = useState('')
  const [servicesFilter, setServicesFilter] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['projects', tab],
    queryFn: () => api.get(`/projects?status=${tab}`).then(r => r.data.data),
  })

  const canCreate = ['admin', 'manager'].includes(user?.role)

  const tabs = [
    { key: 'active', label: 'Active' },
    { key: 'completed', label: 'Completed' },
    { key: 'template', label: 'Templates' },
  ]

  const currentSortLabel = SORT_OPTIONS.find(s => s.key === sortBy)?.label || 'Latest to Oldest'
  const cycleSort = () => {
    const idx = SORT_OPTIONS.findIndex(s => s.key === sortBy)
    const next = SORT_OPTIONS[(idx + 1) % SORT_OPTIONS.length]
    setSortBy(next.key)
  }

  const projectTypeOptions = useMemo(() => {
    const values = (data || []).map(p => p.project_type).filter(Boolean)
    return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b))
  }, [data])

  const servicesOptions = useMemo(() => {
    const values = (data || []).map(p => p.services_taken).filter(Boolean)
    return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b))
  }, [data])

  const filtered = useMemo(() => {
    const list = [...(data || [])]
      .filter(p => {
        const searchMatch = !search
          || p.name?.toLowerCase().includes(search.toLowerCase())
          || p.code?.toLowerCase().includes(search.toLowerCase())
          || p.location?.toLowerCase().includes(search.toLowerCase())

        const typeMatch = !projectTypeFilter || p.project_type === projectTypeFilter
        const servicesMatch = !servicesFilter || p.services_taken === servicesFilter
        return searchMatch && typeMatch && servicesMatch
      })

    list.sort((a, b) => {
      if (sortBy === 'a_z') return (a.name || '').localeCompare(b.name || '')
      if (sortBy === 'z_a') return (b.name || '').localeCompare(a.name || '')
      const aTime = a.created_at ? new Date(a.created_at).getTime() : 0
      const bTime = b.created_at ? new Date(b.created_at).getTime() : 0
      if (sortBy === 'oldest') return aTime - bTime
      return bTime - aTime
    })

    return list
  }, [data, search, projectTypeFilter, servicesFilter, sortBy])

  const handleImport = async (file) => {
    const fd = new FormData()
    fd.append('file', file)
    const res = await api.post('/projects/import', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
    qc.invalidateQueries(['projects'])
    return res.data.data
  }

  return (
    <div>
      <PageHeader
        title="Projects"
        subtitle={`${filtered.length} ${tab} projects`}
        action={canCreate && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <Upload size={14} className="mr-2" />Bulk Import
            </Button>
            <Button onClick={() => navigate('/projects/new')}>
              <Plus size={16} className="mr-2" />New Project
            </Button>
          </div>
        )}
      />

      <div className="flex gap-1 mb-4 border-b">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t.key
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search projects..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        <Button type="button" variant="outline" onClick={cycleSort}>
          <ArrowUpDown size={14} className="mr-2" />
          Sort: {currentSortLabel}
        </Button>

        <Button type="button" variant="outline" onClick={() => setFiltersOpen(v => !v)}>
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
              <div className="text-xs text-muted-foreground mb-1">Project Type</div>
              <Select value={projectTypeFilter} onChange={e => setProjectTypeFilter(e.target.value)}>
                <option value="">All Types</option>
                {projectTypeOptions.map(t => <option key={t} value={t}>{t}</option>)}
              </Select>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">Services Taken</div>
              <Select value={servicesFilter} onChange={e => setServicesFilter(e.target.value)}>
                <option value="">All Services</option>
                {servicesOptions.map(s => <option key={s} value={s}>{s}</option>)}
              </Select>
            </div>
            <div className="flex items-end">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setProjectTypeFilter('')
                  setServicesFilter('')
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
        <EmptyState icon={FolderOpen} title="No projects yet" description="Create your first project to get started" />
      ) : viewMode === 'cards' ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(p => (
            <Card
              key={p.id}
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => navigate(`/projects/${p.id}`)}
            >
              <div className="p-4">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <div className="font-semibold text-sm">{p.name}</div>
                    <div className="text-xs text-muted-foreground">{p.code}</div>
                  </div>
                  <StatusBadge status={p.status} />
                </div>
                {p.location && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground mt-2">
                    <MapPin size={12} />{p.location}
                  </div>
                )}
                <div className="flex gap-3 mt-3 pt-3 border-t text-xs text-muted-foreground">
                  <span>{p.po_count || 0} POs</span>
                  <span>{p.dpr_count || 0} DPRs</span>
                  {p.services_taken && <Badge variant="secondary">{p.services_taken}</Badge>}
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50">
                  {['Name', 'Code', 'Location', 'Project Type', 'Services', 'Status', 'POs', 'DPRs'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(p => (
                  <tr
                    key={p.id}
                    className="border-b hover:bg-gray-50 cursor-pointer"
                    onClick={() => navigate(`/projects/${p.id}`)}
                  >
                    <td className="px-4 py-3 font-medium">{p.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{p.code}</td>
                    <td className="px-4 py-3 text-muted-foreground">{p.location || '—'}</td>
                    <td className="px-4 py-3">{p.project_type || '—'}</td>
                    <td className="px-4 py-3">{p.services_taken || '—'}</td>
                    <td className="px-4 py-3"><StatusBadge status={p.status} /></td>
                    <td className="px-4 py-3">{p.po_count || 0}</td>
                    <td className="px-4 py-3">{p.dpr_count || 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <BulkImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Bulk Import Projects"
        columns="name*, code*, client_name, site_address, location, project_type, services_taken, team_lead_3d, team_lead_2d, start_date, end_date, status"
        templateUrl="/api/projects/template/download"
        onImport={handleImport}
      />
    </div>
  )
}
