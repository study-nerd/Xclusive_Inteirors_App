import { useState, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import api from '../../lib/api'
import {
  PageHeader, Badge, StatusBadge, Spinner, Button, Select, Input, Label, Modal
} from '../../components/shared'
import {
  LayoutGrid, List, FolderOpen, ShoppingCart, AlertTriangle,
  Plus, Eye, FileText, Search, X, GripVertical, ArrowRight
} from 'lucide-react'
import { cn } from '../../lib/utils'

// Exact 9-column Kanban order
const COLUMN_ORDER = [
  'Not Started',
  'Furniture Layout',
  '3D Design',
  '2D Drawings',
  '2D Detailed Drawing',
  'Selection',
  'Customization',
  'Execution',
  'Completed',
]

const KANBAN_COLUMNS = [
  { id: 'Not Started',          label: 'Not Started',         color: 'bg-gray-50 border-gray-200',      dot: 'bg-gray-400',     header: 'bg-gray-100'    },
  { id: 'Furniture Layout',     label: 'Furniture Layout',    color: 'bg-purple-50 border-purple-200',  dot: 'bg-purple-400',   header: 'bg-purple-100'  },
  { id: '3D Design',            label: '3D Design',           color: 'bg-indigo-50 border-indigo-200',  dot: 'bg-indigo-400',   header: 'bg-indigo-100'  },
  { id: '2D Drawings',          label: '2D Drawings',         color: 'bg-cyan-50 border-cyan-200',      dot: 'bg-cyan-400',     header: 'bg-cyan-100'    },
  { id: '2D Detailed Drawing',  label: '2D Detailed Drawing', color: 'bg-blue-50 border-blue-200',      dot: 'bg-blue-400',     header: 'bg-blue-100'    },
  { id: 'Selection',            label: 'Selection',           color: 'bg-amber-50 border-amber-200',    dot: 'bg-amber-400',    header: 'bg-amber-100'   },
  { id: 'Customization',        label: 'Customization',       color: 'bg-orange-50 border-orange-200',  dot: 'bg-orange-400',   header: 'bg-orange-100'  },
  { id: 'Execution',            label: 'Execution',           color: 'bg-red-50 border-red-200',        dot: 'bg-red-400',      header: 'bg-red-100'     },
  { id: 'Completed',            label: 'Completed',           color: 'bg-green-50 border-green-200',    dot: 'bg-green-400',    header: 'bg-green-100'   },
]

const PROJECT_TYPES = [
  '2BHK','2.5BHK','3BHK','3.5BHK','4BHK','4.5BHK','5BHK','5.5BHK','6BHK',
  '3BHK_Bungalow','4BHK_Bungalow','5BHK_Bungalow','6BHK_Bungalow','6BHK_Plus_Bungalow','Commercial',
]
const SERVICES = ['Turnkey','Design Consultancy','PM']

function ProgressBar({ value, className }) {
  return (
    <div className={cn('w-full h-1.5 bg-gray-200 rounded-full overflow-hidden', className)}>
      <div
        className={cn(
          'h-full rounded-full transition-all',
          value >= 100 ? 'bg-green-500' : value >= 60 ? 'bg-orange-500' : 'bg-blue-500'
        )}
        style={{ width: `${Math.min(100, value || 0)}%` }}
      />
    </div>
  )
}

function ProjectCard({ project, onClick, onDragStart }) {
  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, project)}
      className="bg-white border rounded-lg p-3 shadow-sm hover:shadow-md transition-all cursor-grab active:cursor-grabbing active:opacity-75 active:scale-[0.98] group"
      onClick={() => onClick(project.id)}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="font-semibold text-sm leading-snug flex-1 min-w-0">{project.name}</div>
        <div className="flex items-center gap-1 shrink-0">
          <GripVertical size={12} className="text-gray-300 group-hover:text-gray-400 transition-colors" />
          <StatusBadge status={project.status} />
        </div>
      </div>

      <div className="text-xs text-muted-foreground mb-2.5 font-mono">{project.code} · {project.location || '—'}</div>

      <ProgressBar value={project.progress} className="mb-2" />

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="font-medium text-orange-600">{project.progress || 0}%</span>
        {project.current_phase && (
          <span className="truncate max-w-[100px] bg-gray-100 px-1.5 py-0.5 rounded text-[10px] font-medium">
            {project.current_phase}
          </span>
        )}
      </div>

      <div className="flex gap-3 mt-2.5 pt-2 border-t border-gray-100 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <ShoppingCart size={10} className="shrink-0" />{project.po_count || 0} POs
        </span>
        <span className="flex items-center gap-1">
          <AlertTriangle size={10} className="shrink-0" />{project.open_snag_count || 0} snags
        </span>
        {project.services_taken && (
          <Badge variant="secondary" className="text-[10px] ml-auto px-1.5 py-0">{project.services_taken}</Badge>
        )}
      </div>
    </div>
  )
}

function TableRow({ project, onNavigate }) {
  return (
    <tr className="border-b hover:bg-gray-50 cursor-pointer" onClick={() => onNavigate(`/projects/${project.id}`)}>
      <td className="px-4 py-3">
        <div className="font-semibold text-sm">{project.name}</div>
        <div className="text-xs text-muted-foreground font-mono">{project.code}</div>
      </td>
      <td className="px-4 py-3 text-sm">{project.client_name || '—'}</td>
      <td className="px-4 py-3 text-sm">{project.location || '—'}</td>
      <td className="px-4 py-3 whitespace-nowrap">
        <span className="text-xs font-medium px-2 py-1 rounded-md bg-gray-100 whitespace-nowrap inline-flex items-center max-w-[140px] truncate">
          {project.kanban_column || '—'}
        </span>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <ProgressBar value={project.progress} className="w-20" />
          <span className="text-xs font-medium text-orange-600">{project.progress || 0}%</span>
        </div>
      </td>
      <td className="px-4 py-3"><StatusBadge status={project.status} /></td>
      <td className="px-4 py-3 text-sm text-center">{project.po_count || 0}</td>
      <td className="px-4 py-3 text-sm text-center">{project.open_snag_count || 0}</td>
      <td className="px-4 py-3">
        <div className="flex gap-1" onClick={e => e.stopPropagation()}>
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => onNavigate(`/projects/${project.id}`)}>
            <Eye size={13} />
          </Button>
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => onNavigate(`/dpr/new?project_id=${project.id}`)}>
            <FileText size={13} />
          </Button>
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => onNavigate(`/purchase-orders/new?project_id=${project.id}`)}>
            <ShoppingCart size={13} />
          </Button>
        </div>
      </td>
    </tr>
  )
}

export default function ProjectTrackerPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [view, setView] = useState('kanban')
  const [filters, setFilters] = useState({
    status: 'active', location: '', project_type: '', services_taken: '', search: ''
  })

  // Drag state
  const [dragProject, setDragProject] = useState(null)
  const [dragTargetCol, setDragTargetCol] = useState(null)
  const [backwardModal, setBackwardModal] = useState(null) // { projectId, from, to }
  const [advancing, setAdvancing] = useState(false)

  const queryParams = new URLSearchParams()
  if (filters.status)       queryParams.set('status', filters.status)
  if (filters.location)     queryParams.set('location', filters.location)
  if (filters.project_type) queryParams.set('project_type', filters.project_type)
  if (filters.services_taken) queryParams.set('services_taken', filters.services_taken)

  const { data, isLoading } = useQuery({
    queryKey: ['tracker', filters.status, filters.location, filters.project_type, filters.services_taken],
    queryFn: () => api.get(`/projects/tracker?${queryParams}`).then(r => r.data.data),
    staleTime: 30_000,
  })

  const summary = data?.summary || {}
  const allProjects = data?.projects || []

  const projects = allProjects.filter(p => {
    if (!filters.search) return true
    const q = filters.search.toLowerCase()
    return (
      p.name?.toLowerCase().includes(q) ||
      p.code?.toLowerCase().includes(q) ||
      p.client_name?.toLowerCase().includes(q) ||
      p.location?.toLowerCase().includes(q)
    )
  })

  const setFilter = (k, v) => setFilters(f => ({ ...f, [k]: v }))
  const clearFilters = () => setFilters({ status: 'active', location: '', project_type: '', services_taken: '', search: '' })
  const hasActiveFilters = filters.location || filters.project_type || filters.services_taken || filters.search

  const doAdvanceColumn = async (projectId, targetColumn, direction = 'forward') => {
    setAdvancing(true)
    try {
      await api.post(`/projects/${projectId}/advance-column`, { target_column: targetColumn, direction })
      await qc.invalidateQueries(['tracker'])
    } catch (err) {
      console.error('Advance failed', err)
    } finally {
      setAdvancing(false)
    }
  }

  const handleDragStart = useCallback((e, project) => {
    setDragProject({ id: project.id, column: project.kanban_column })
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', project.id)
  }, [])

  const handleDragOver = useCallback((e, colId) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragTargetCol(colId)
  }, [])

  const handleDragLeave = useCallback((e) => {
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setDragTargetCol(null)
    }
  }, [])

  const handleDrop = useCallback(async (e, targetColId) => {
    e.preventDefault()
    setDragTargetCol(null)
    if (!dragProject || dragProject.column === targetColId) {
      setDragProject(null)
      return
    }

    const fromIdx = COLUMN_ORDER.indexOf(dragProject.column)
    const toIdx = COLUMN_ORDER.indexOf(targetColId)

    if (toIdx < fromIdx) {
      setBackwardModal({ projectId: dragProject.id, from: dragProject.column, to: targetColId })
    } else {
      await doAdvanceColumn(dragProject.id, targetColId, 'forward')
    }
    setDragProject(null)
  }, [dragProject])

  const handleDragEnd = useCallback(() => {
    setDragProject(null)
    setDragTargetCol(null)
  }, [])

  const confirmBackward = async () => {
    if (!backwardModal) return
    await doAdvanceColumn(backwardModal.projectId, backwardModal.to, 'backward')
    setBackwardModal(null)
  }

  return (
    <div>
      <PageHeader
        title="Project Tracker"
        subtitle="Portfolio-wide view of all projects and stages"
        action={
          <Button onClick={() => navigate('/projects/new')}>
            <Plus size={15} className="mr-2" />New Project
          </Button>
        }
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total Active',   value: summary.totalActive  || 0, color: 'bg-blue-50   text-blue-700',   dot: 'bg-blue-500'   },
          { label: 'In Design',      value: summary.inDesign     || 0, color: 'bg-purple-50 text-purple-700', dot: 'bg-purple-500' },
          { label: 'In Execution',   value: summary.inExecution  || 0, color: 'bg-orange-50 text-orange-700', dot: 'bg-orange-500' },
          { label: 'Near Complete',  value: summary.nearComplete || 0, color: 'bg-green-50  text-green-700',  dot: 'bg-green-500'  },
        ].map(({ label, value, color, dot }) => (
          <div key={label} className={cn('rounded-xl p-4 flex items-center gap-3', color)}>
            <div className={cn('w-3 h-3 rounded-full shrink-0', dot)} />
            <div>
              <div className="text-2xl font-bold">{value}</div>
              <div className="text-xs font-medium opacity-80">{label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Filters + View Toggle */}
      <div className="flex flex-wrap gap-3 mb-5 items-end">
        <div className="flex-1 min-w-[180px] max-w-xs">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search projects..."
              className="pl-9"
              value={filters.search}
              onChange={e => setFilter('search', e.target.value)}
            />
          </div>
        </div>

        <Select className="w-36" value={filters.status} onChange={e => setFilter('status', e.target.value)}>
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="completed">Completed</option>
          <option value="template">Template</option>
        </Select>

        <Select className="w-44" value={filters.project_type} onChange={e => setFilter('project_type', e.target.value)}>
          <option value="">All Types</option>
          {PROJECT_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
        </Select>

        <Select className="w-44" value={filters.services_taken} onChange={e => setFilter('services_taken', e.target.value)}>
          <option value="">All Services</option>
          {SERVICES.map(s => <option key={s} value={s}>{s}</option>)}
        </Select>

        {hasActiveFilters && (
          <button className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground" onClick={clearFilters}>
            <X size={14} />Clear
          </button>
        )}

        <div className="ml-auto flex items-center gap-1 bg-gray-100 p-1 rounded-lg">
          <button
            className={cn('p-1.5 rounded-md transition-colors', view === 'kanban' ? 'bg-white shadow-sm' : 'hover:bg-gray-200')}
            onClick={() => setView('kanban')} title="Kanban view"
          >
            <LayoutGrid size={16} />
          </button>
          <button
            className={cn('p-1.5 rounded-md transition-colors', view === 'table' ? 'bg-white shadow-sm' : 'hover:bg-gray-200')}
            onClick={() => setView('table')} title="Table view"
          >
            <List size={16} />
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner className="h-8 w-8" /></div>
      ) : projects.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <FolderOpen size={40} className="mx-auto mb-3 opacity-30" />
          No projects found
        </div>
      ) : view === 'kanban' ? (
        <div className="overflow-x-auto overflow-y-hidden pb-4 scrollbar scrollbar-h-3 scrollbar-thumb-gray-400 scrollbar-track-gray-200">
          <div className="flex gap-3 min-w-max">
            {KANBAN_COLUMNS.map(col => {
              const colProjects = projects.filter(p => p.kanban_column === col.id)
              const isDropTarget = dragTargetCol === col.id && dragProject?.column !== col.id
              return (
                <div
                  key={col.id}
                  onDragOver={(e) => handleDragOver(e, col.id)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, col.id)}
                  className={cn(
                    'rounded-xl border w-72 shrink-0 transition-all duration-150',
                    col.color,
                    isDropTarget && 'ring-2 ring-orange-400 ring-offset-1 scale-[1.01]'
                  )}
                >
                  {/* Column Header */}
                  <div className={cn('flex items-center gap-2 px-3 py-2.5 rounded-t-xl border-b', col.header)}>
                    <div className={cn('w-2.5 h-2.5 rounded-full shrink-0', col.dot)} />
                    <span className="font-semibold text-sm flex-1">{col.label}</span>
                    <Badge variant="secondary" className="text-xs font-bold">{colProjects.length}</Badge>
                  </div>

                  {/* Cards */}
                  <div className="p-2.5 space-y-2 min-h-[60px]">
                    {colProjects.length === 0 ? (
                      <div className={cn(
                        'text-center text-xs text-muted-foreground py-6 rounded-lg border-2 border-dashed transition-colors',
                        isDropTarget ? 'border-orange-300 bg-orange-50/50 text-orange-400' : 'border-transparent opacity-50'
                      )}>
                        {isDropTarget ? 'Drop here' : 'Empty'}
                      </div>
                    ) : (
                      colProjects.map(p => (
                        <ProjectCard
                          key={p.id}
                          project={p}
                          onClick={() => navigate(`/projects/${p.id}`)}
                          onDragStart={handleDragStart}
                        />
                      ))
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        <div className="bg-white border rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-gray-50 border-b">
                <tr>
                  {['Project','Client','Location','Stage','Progress','Status','POs','Snags','Actions'].map(h => (
                    <th key={h} className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {projects.map(p => (
                  <TableRow key={p.id} project={p} onNavigate={navigate} />
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 border-t text-xs text-muted-foreground">
            {projects.length} projects
          </div>
        </div>
      )}

      {/* Backward drag confirmation modal */}
      <Modal
        open={!!backwardModal}
        onClose={() => setBackwardModal(null)}
        title="Move Project Backward?"
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            You are moving this project backward from <strong>{backwardModal?.from}</strong> to <strong>{backwardModal?.to}</strong>.
          </p>
          <div className="flex items-center gap-2 text-sm bg-amber-50 border border-amber-200 rounded-lg p-3">
            <AlertTriangle size={15} className="text-amber-500 shrink-0" />
            All stages in phases after <strong>{backwardModal?.to}</strong> will be reset to Pending.
          </div>
          <div className="flex gap-2">
            <Button
              onClick={confirmBackward}
              disabled={advancing}
              className="bg-amber-600 hover:bg-amber-700"
            >
              {advancing && <Spinner className="mr-2" />}
              <ArrowRight size={14} className="mr-1 rotate-180" />
              Yes, Move Backward
            </Button>
            <Button variant="outline" onClick={() => setBackwardModal(null)}>Cancel</Button>
          </div>
        </div>
      </Modal>

      {/* Global drag overlay indicator */}
      {dragProject && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white text-xs px-3 py-1.5 rounded-full shadow-lg pointer-events-none">
          Drag to a column to advance project phase
        </div>
      )}
    </div>
  )
}
