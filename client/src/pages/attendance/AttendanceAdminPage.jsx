import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ChevronLeft, ChevronRight, Loader2, MapPin, Camera,
  CheckCircle, XCircle, AlertTriangle, X, Plus, CalendarDays,
} from 'lucide-react'
import api from '../../lib/api'
import { cn } from '../../lib/utils'
import { Card, CardContent, CardHeader, CardTitle, Button } from '../../components/shared'
import useAuthStore from '../../store/authStore'

// ── Helpers ───────────────────────────────────────────────────────────────────
const MONTHS      = ['January','February','March','April','May','June','July','August','September','October','November','December']
const SHORT_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const DAY_ABBR    = ['Mo','Tu','We','Th','Fr','Sa','Su']

const STATUS_CFG = {
  present:  { label: 'Present',  cell: 'bg-green-100 border-green-300 text-green-800',   badge: 'bg-green-100 text-green-700 border-green-200'   },
  late:     { label: 'Late',     cell: 'bg-yellow-100 border-yellow-300 text-yellow-800', badge: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  half_day: { label: 'Half Day', cell: 'bg-orange-100 border-orange-300 text-orange-800', badge: 'bg-orange-100 text-orange-700 border-orange-200' },
  absent:   { label: 'Absent',   cell: 'bg-red-100 border-red-300 text-red-800',          badge: 'bg-red-100 text-red-700 border-red-200'          },
  leave:    { label: 'Leave',    cell: 'bg-blue-100 border-blue-300 text-blue-800',       badge: 'bg-blue-100 text-blue-700 border-blue-200'       },
  holiday:  { label: 'Holiday',  cell: 'bg-purple-100 border-purple-300 text-purple-800', badge: 'bg-purple-100 text-purple-700 border-purple-200' },
  sunday:   { label: 'Sunday',   cell: 'bg-gray-100 border-gray-200 text-gray-400',       badge: 'bg-gray-100 text-gray-400 border-gray-200'       },
  future:   { label: '',         cell: 'bg-white border-gray-100 text-gray-300',          badge: ''                                                },
}

function getNowIST() { return new Date(Date.now() + 5.5 * 3600 * 1000) }

function fmtTime(ts) {
  if (!ts) return '—'
  const ist = new Date(new Date(ts).getTime() + 5.5 * 3600 * 1000)
  let h = ist.getUTCHours(), m = ist.getUTCMinutes()
  if (h === 10 && m <= 1) m = 0  // snap 10:00–10:01 → "10:00 AM"
  const ampm = h >= 12 ? 'PM' : 'AM'
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`
}

function fmtDate(ds) {
  if (!ds) return ''
  const raw = ds?.toISOString?.().slice(0,10) || String(ds).slice(0,10)
  const [y, mo, d] = raw.split('-')
  return `${parseInt(d)} ${SHORT_MONTHS[parseInt(mo) - 1]} ${y}`
}

function StatusBadge({ status, className }) {
  const cfg = STATUS_CFG[status] || {}
  if (!cfg.label) return null
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border', cfg.badge, className)}>
      {cfg.label}
    </span>
  )
}

// ── Mini calendar (same as employee page) ─────────────────────────────────────
function MonthCalendar({ data, year, month, onPrev, onNext }) {
  const [tooltip, setTooltip] = useState(null)
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const firstDow    = new Date(Date.UTC(year, month - 1, 1)).getUTCDay()
  const offset      = (firstDow + 6) % 7

  const dataMap = {}
  ;(data || []).forEach(d => { dataMap[d.date] = d })

  const cells = []
  for (let i = 0; i < offset; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) {
    const ds = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`
    cells.push(dataMap[ds] || { date: ds, status: 'future' })
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <button onClick={onPrev} className="p-1.5 rounded hover:bg-gray-100"><ChevronLeft size={18} /></button>
        <span className="font-semibold text-gray-800">{MONTHS[month - 1]} {year}</span>
        <button onClick={onNext} className="p-1.5 rounded hover:bg-gray-100"><ChevronRight size={18} /></button>
      </div>
      <div className="grid grid-cols-7 gap-1 mb-1">
        {DAY_ABBR.map(d => <div key={d} className="text-center text-xs font-medium text-gray-500 py-1">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((cell, i) => (
          <div
            key={i}
            onClick={() => cell && cell.status !== 'future' && setTooltip(tooltip?.date === cell.date ? null : cell)}
            className={cn(
              'aspect-square rounded-md border flex items-center justify-center text-xs font-medium relative',
              cell ? (STATUS_CFG[cell.status]?.cell || 'bg-white border-gray-100 text-gray-300') : 'border-transparent',
              cell && cell.status !== 'future' ? 'cursor-pointer hover:opacity-80' : ''
            )}
          >
            {cell && <span>{parseInt(cell.date.split('-')[2])}</span>}
            {cell?.is_flagged && <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 bg-red-500 rounded-full" />}
          </div>
        ))}
      </div>

      {tooltip && (
        <div className="mt-3 p-3 bg-gray-50 border border-gray-200 rounded-lg text-sm">
          <div className="flex justify-between mb-1">
            <span className="font-medium text-gray-700">{fmtDate(tooltip.date)}</span>
            <button onClick={() => setTooltip(null)}><X size={14} /></button>
          </div>
          <StatusBadge status={tooltip.status} />
          {tooltip.clock_in_time  && <div className="mt-1 text-gray-600">In: <b>{fmtTime(tooltip.clock_in_time)}</b></div>}
          {tooltip.clock_out_time && <div className="text-gray-600">Out: <b>{fmtTime(tooltip.clock_out_time)}</b></div>}
          {tooltip.total_hours    && <div className="text-gray-600">Hours: <b>{tooltip.total_hours}h</b></div>}
          {tooltip.early_logout_note && <div className="text-orange-600 text-xs mt-1">Early out: {tooltip.early_logout_note}</div>}
          {tooltip.clock_in_inside_fence === false && (
            <div className="text-orange-500 text-xs mt-1 flex items-center gap-1"><MapPin size={11} /> Outside office</div>
          )}
          {tooltip.clock_in_selfie && (
            <a href={tooltip.clock_in_selfie} target="_blank" rel="noreferrer" className="text-xs text-blue-500 underline mt-1 block">View selfie</a>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-4">
        {Object.entries(STATUS_CFG).filter(([k]) => !['future'].includes(k)).map(([key, val]) => (
          <div key={key} className="flex items-center gap-1.5">
            <div className={cn('w-2.5 h-2.5 rounded-sm border', val.cell)} />
            <span className="text-xs text-gray-500">{val.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Selfie modal ──────────────────────────────────────────────────────────────
function SelfieModal({ src, onClose }) {
  if (!src) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={onClose}>
      <div className="relative max-w-sm w-full mx-4" onClick={e => e.stopPropagation()}>
        <img src={src} alt="selfie" className="w-full rounded-xl shadow-2xl" />
        <button onClick={onClose} className="absolute -top-3 -right-3 bg-white rounded-full p-1 shadow">
          <X size={16} />
        </button>
      </div>
    </div>
  )
}

// ── Main Admin Page ───────────────────────────────────────────────────────────
export default function AttendanceAdminPage() {
  const { user }  = useAuthStore()
  const qc        = useQueryClient()
  const isAdmin   = user?.role === 'admin'

  const istNow = getNowIST()
  const [tab,      setTab]      = useState('today')
  const [selUser,  setSelUser]  = useState('')
  const [calYear,  setCalYear]  = useState(istNow.getUTCFullYear())
  const [calMonth, setCalMonth] = useState(istNow.getUTCMonth() + 1)
  const [holYear,  setHolYear]  = useState(istNow.getUTCFullYear())
  const [leaveTab, setLeaveTab] = useState('pending')
  const [selfieUrl, setSelfieUrl] = useState(null)

  // Holiday form
  const [holForm,  setHolForm]  = useState({ date: '', name: '' })
  const [holError, setHolError] = useState('')

  // Leave review
  const [reviewState,   setReviewState]   = useState({}) // { [id]: { open, note } }

  // Status filter for today tab
  const [statusFilter, setStatusFilter] = useState('all')

  // Queries
  const usersQ = useQuery({
    queryKey: ['att-admin-users'],
    queryFn:  () => api.get('/attendance/admin/users').then(r => r.data.data),
  })

  const todayQ = useQuery({
    queryKey: ['att-admin-today'],
    queryFn:  () => api.get('/attendance/admin/today').then(r => r.data),
    enabled:  tab === 'today',
    refetchInterval: 60_000,
  })

  const monthQ = useQuery({
    queryKey: ['att-admin-monthly', selUser, calYear, calMonth],
    queryFn:  () => api.get(`/attendance/admin/monthly?user_id=${selUser}&year=${calYear}&month=${calMonth}`).then(r => r.data.data),
    enabled:  tab === 'monthly' && !!selUser,
  })

  const pendingLeavesQ = useQuery({
    queryKey: ['att-leaves-pending'],
    queryFn:  () => api.get('/attendance/leave/pending').then(r => r.data.data),
    enabled:  tab === 'leaves',
  })

  const allLeavesQ = useQuery({
    queryKey: ['att-leaves-all'],
    queryFn:  () => api.get('/attendance/leave/all').then(r => r.data.data),
    enabled:  tab === 'leaves' && leaveTab === 'all',
  })

  const holQ = useQuery({
    queryKey: ['att-holidays', holYear],
    queryFn:  () => api.get(`/attendance/holidays?year=${holYear}`).then(r => r.data.data),
    enabled:  tab === 'holidays',
  })

  // Mutations
  const reviewMut = useMutation({
    mutationFn: ({ id, action, note }) => api.patch(`/attendance/leave/${id}/review`, { action, review_note: note }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['att-leaves-pending'] })
      qc.invalidateQueries({ queryKey: ['att-leaves-all'] })
      setReviewState({})
    },
  })

  const addHolMut = useMutation({
    mutationFn: (data) => api.post('/attendance/holidays', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['att-holidays', holYear] })
      setHolForm({ date: '', name: '' }); setHolError('')
    },
    onError: (err) => setHolError(err.response?.data?.message || 'Failed to add holiday.'),
  })

  const delHolMut = useMutation({
    mutationFn: (id) => api.delete(`/attendance/holidays/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['att-holidays', holYear] }),
  })

  // Today stats
  const todayData   = todayQ.data?.data || []
  const filtered    = statusFilter === 'all' ? todayData : todayData.filter(u => u.status === statusFilter)
  const stats       = todayData.reduce((acc, u) => { acc[u.status] = (acc[u.status] || 0) + 1; return acc }, {})

  const TABS = [
    { key: 'today',    label: "Today's Overview" },
    { key: 'monthly',  label: 'Monthly View' },
    { key: 'leaves',   label: 'Leave Requests' },
    { key: 'holidays', label: 'Holidays' },
  ]

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-4">
      <SelfieModal src={selfieUrl} onClose={() => setSelfieUrl(null)} />

      <div>
        <h1 className="text-2xl font-bold text-gray-900">Attendance Admin</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {(() => { const d = getNowIST(); return d.toISOString().slice(0,10).split('-').reverse().join(' ') })()}
        </p>
      </div>

      {/* Tab bar */}
      <div className="border-b border-gray-200">
        <div className="flex gap-0 overflow-x-auto">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                'px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap',
                tab === t.key ? 'border-orange-500 text-orange-600' : 'border-transparent text-gray-500 hover:text-gray-700'
              )}
            >
              {t.label}
              {t.key === 'leaves' && (pendingLeavesQ.data?.length || 0) > 0 && (
                <span className="ml-1.5 bg-orange-500 text-white text-xs rounded-full px-1.5 py-0.5">
                  {pendingLeavesQ.data?.length}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── TODAY TAB ─────────────────────────────────────────────────────── */}
      {tab === 'today' && (
        <div className="space-y-4">
          {/* Summary pills */}
          {todayQ.data?.isHoliday && (
            <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg text-purple-700 text-sm font-medium">
              Today is a company holiday — all attendance marked accordingly.
            </div>
          )}
          {todayQ.data?.isSunday && (
            <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg text-gray-600 text-sm font-medium">
              Sunday — rest day.
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {[
              { key: 'all',      label: `All (${todayData.length})`,              color: 'bg-gray-100 text-gray-700 border-gray-200' },
              { key: 'present',  label: `Present (${stats.present || 0})`,        color: 'bg-green-100 text-green-700 border-green-200' },
              { key: 'late',     label: `Late (${stats.late || 0})`,              color: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
              { key: 'half_day', label: `Half Day (${stats.half_day || 0})`,      color: 'bg-orange-100 text-orange-700 border-orange-200' },
              { key: 'absent',   label: `Absent (${stats.absent || 0})`,          color: 'bg-red-100 text-red-700 border-red-200' },
              { key: 'leave',    label: `On Leave (${stats.leave || 0})`,         color: 'bg-blue-100 text-blue-700 border-blue-200' },
            ].map(s => (
              <button
                key={s.key}
                onClick={() => setStatusFilter(s.key)}
                className={cn('px-3 py-1 rounded-full text-xs font-semibold border transition-all',
                  s.color, statusFilter === s.key ? 'ring-2 ring-offset-1 ring-orange-400' : 'opacity-70 hover:opacity-100'
                )}
              >
                {s.label}
              </button>
            ))}
          </div>

          <Card>
            <CardContent className="pt-0 px-0 pb-0">
              {todayQ.isLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="animate-spin text-gray-400" /></div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">Employee</th>
                        <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">Status</th>
                        <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">Clock In</th>
                        <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">Clock Out</th>
                        <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">Hours</th>
                        <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">Flags</th>
                        <th className="px-4 py-3" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {filtered.map(u => (
                        <tr key={u.id} className={cn('hover:bg-gray-50', u.is_flagged ? 'bg-red-50' : '')}>
                          <td className="px-4 py-3">
                            <div className="font-medium text-gray-800">{u.name}</div>
                            <div className="text-xs text-gray-400 capitalize">{u.role}</div>
                          </td>
                          <td className="px-4 py-3"><StatusBadge status={u.status} /></td>
                          <td className="px-4 py-3 text-gray-700">
                            <div className="flex items-center gap-1">
                              {fmtTime(u.clock_in_time)}
                              {u.clock_in_inside_fence === false && (
                                <MapPin size={11} className="text-orange-500" title="Outside office" />
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-gray-700">
                            <div className="flex items-center gap-1">
                              {fmtTime(u.clock_out_time)}
                              {u.clock_out_inside_fence === false && (
                                <MapPin size={11} className="text-orange-500" title="Outside office" />
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-gray-700">{u.total_hours ? `${u.total_hours}h` : '—'}</td>
                          <td className="px-4 py-3">
                            <div className="flex flex-col gap-0.5">
                              {u.clock_in_time && !u.clock_out_time && (
                                <span className="text-xs text-yellow-600 flex items-center gap-1">
                                  <AlertTriangle size={11} /> No clock-out
                                </span>
                              )}
                              {u.early_logout && (
                                <span className="text-xs text-orange-600 flex items-center gap-1" title={u.early_logout_note}>
                                  <AlertTriangle size={11} /> Early logout
                                </span>
                              )}
                              {u.clock_in_inside_fence === false && (
                                <span className="text-xs text-orange-500">Outside fence</span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              {(u.clock_in_selfie || u.clock_out_selfie) && (
                                <button
                                  onClick={() => setSelfieUrl(u.clock_in_selfie || u.clock_out_selfie)}
                                  className="text-xs text-blue-500 hover:text-blue-700 flex items-center gap-0.5"
                                  title="View selfie"
                                >
                                  <Camera size={13} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                      {!filtered.length && (
                        <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400 text-sm">No records.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── MONTHLY TAB ───────────────────────────────────────────────────── */}
      {tab === 'monthly' && (
        <div className="space-y-4">
          {/* Controls */}
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Employee</label>
              <select
                value={selUser}
                onChange={e => setSelUser(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 min-w-[180px]"
              >
                <option value="">Select employee…</option>
                {(usersQ.data || []).map(u => (
                  <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
                ))}
              </select>
            </div>
          </div>

          {!selUser && (
            <div className="text-center text-gray-400 py-12 text-sm">Select an employee to view attendance.</div>
          )}

          {selUser && (
            <>
              <Card>
                <CardContent className="pt-5">
                  {monthQ.isLoading ? (
                    <div className="flex justify-center py-8"><Loader2 className="animate-spin text-gray-400" /></div>
                  ) : (
                    <MonthCalendar
                      data={monthQ.data || []}
                      year={calYear}
                      month={calMonth}
                      onPrev={() => {
                        if (calMonth === 1) { setCalMonth(12); setCalYear(y => y - 1) }
                        else setCalMonth(m => m - 1)
                      }}
                      onNext={() => {
                        if (calMonth === 12) { setCalMonth(1); setCalYear(y => y + 1) }
                        else setCalMonth(m => m + 1)
                      }}
                    />
                  )}
                </CardContent>
              </Card>

              {/* Detailed table */}
              {monthQ.data && (
                <Card>
                  <CardHeader><CardTitle className="text-base">Detail Log</CardTitle></CardHeader>
                  <CardContent className="pt-0 px-0 pb-0">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 border-b">
                          <tr>
                            <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">Date</th>
                            <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">Status</th>
                            <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">Clock In</th>
                            <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">Clock Out</th>
                            <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">Hours</th>
                            <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">Location</th>
                            <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">Flags / Notes</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {monthQ.data.filter(d => d.status !== 'future').map(d => (
                            <tr key={d.date} className={cn('hover:bg-gray-50', d.is_flagged ? 'bg-red-50' : '')}>
                              <td className="px-4 py-2.5 text-gray-700 whitespace-nowrap">{fmtDate(d.date)}</td>
                              <td className="px-4 py-2.5"><StatusBadge status={d.status} /></td>
                              <td className="px-4 py-2.5 text-gray-700">{fmtTime(d.clock_in_time)}</td>
                              <td className="px-4 py-2.5 text-gray-700">{fmtTime(d.clock_out_time)}</td>
                              <td className="px-4 py-2.5 text-gray-700">{d.total_hours ? `${d.total_hours}h` : '—'}</td>
                              <td className="px-4 py-2.5">
                                <div className="flex items-center gap-1.5">
                                  {d.clock_in_time && (
                                    <span className={cn('text-xs flex items-center gap-0.5',
                                      d.clock_in_inside_fence === false ? 'text-orange-500' : 'text-green-600'
                                    )}>
                                      <MapPin size={11} />
                                      {d.clock_in_inside_fence === false ? 'Outside' : 'Inside'}
                                    </span>
                                  )}
                                  {(d.clock_in_selfie || d.clock_out_selfie) && (
                                    <button
                                      onClick={() => setSelfieUrl(d.clock_in_selfie || d.clock_out_selfie)}
                                      className="text-blue-500 hover:text-blue-700"
                                      title="View selfie"
                                    >
                                      <Camera size={13} />
                                    </button>
                                  )}
                                </div>
                              </td>
                              <td className="px-4 py-2.5">
                                <div className="flex flex-col gap-0.5">
                                  {d.clock_in_time && !d.clock_out_time && d.date < getNowIST().toISOString().slice(0,10) && (
                                    <span className="text-xs text-red-500 flex items-center gap-0.5"><AlertTriangle size={11} /> Missing clock-out</span>
                                  )}
                                  {d.early_logout && (
                                    <span className="text-xs text-orange-600" title={d.early_logout_note}>
                                      Early out{d.early_logout_note ? `: ${d.early_logout_note}` : ''}
                                    </span>
                                  )}
                                  {d.holiday_name && <span className="text-xs text-purple-600">{d.holiday_name}</span>}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      )}

      {/* ── LEAVE REQUESTS TAB ────────────────────────────────────────────── */}
      {tab === 'leaves' && (
        <div className="space-y-4">
          <div className="flex gap-2">
            {['pending', 'all'].map(lt => (
              <button
                key={lt}
                onClick={() => setLeaveTab(lt)}
                className={cn('px-4 py-1.5 rounded-full text-sm font-medium border transition-colors',
                  leaveTab === lt
                    ? 'bg-orange-500 text-white border-orange-500'
                    : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
                )}
              >
                {lt === 'pending' ? 'Pending' : 'All Requests'}
              </button>
            ))}
          </div>

          <Card>
            <CardContent className="pt-0 px-0 pb-0">
              {(leaveTab === 'pending' ? pendingLeavesQ : allLeavesQ).isLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="animate-spin text-gray-400" /></div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">Employee</th>
                        <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">Period</th>
                        <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">Days</th>
                        <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">Reason</th>
                        <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">Requested</th>
                        <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">Status</th>
                        <th className="px-4 py-3" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {((leaveTab === 'pending' ? pendingLeavesQ.data : allLeavesQ.data) || []).map(l => (
                        <tr key={l.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3">
                            <div className="font-medium text-gray-800">{l.user_name}</div>
                            <div className="text-xs text-gray-400 capitalize">{l.user_role}</div>
                          </td>
                          <td className="px-4 py-3 text-gray-700 whitespace-nowrap">
                            {fmtDate(l.start_date?.slice?.(0,10) || l.start_date)}
                            {String(l.start_date).slice(0,10) !== String(l.end_date).slice(0,10) &&
                              ` → ${fmtDate(l.end_date?.slice?.(0,10) || l.end_date)}`
                            }
                          </td>
                          <td className="px-4 py-3 text-gray-600">{l.num_days}d</td>
                          <td className="px-4 py-3 text-gray-600 max-w-[200px]">
                            <span className="line-clamp-2">{l.reason}</span>
                          </td>
                          <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                            {fmtDate(l.created_at?.slice?.(0,10) || String(l.created_at).slice(0,10))}
                          </td>
                          <td className="px-4 py-3">
                            <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border',
                              l.status === 'approved' ? 'bg-green-100 text-green-700 border-green-200' :
                              l.status === 'rejected' ? 'bg-red-100 text-red-700 border-red-200' :
                              'bg-yellow-100 text-yellow-700 border-yellow-200'
                            )}>
                              {l.status.charAt(0).toUpperCase() + l.status.slice(1)}
                            </span>
                            {l.review_note && (
                              <div className="text-xs text-gray-400 mt-0.5" title={l.review_note}>Note: {l.review_note.slice(0,30)}{l.review_note.length > 30 ? '…' : ''}</div>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {l.status === 'pending' && (
                              <div className="space-y-2">
                                {reviewState[l.id]?.open ? (
                                  <div className="space-y-1.5 min-w-[180px]">
                                    <textarea
                                      placeholder="Note (optional)"
                                      rows={2}
                                      value={reviewState[l.id]?.note || ''}
                                      onChange={e => setReviewState(p => ({ ...p, [l.id]: { ...p[l.id], note: e.target.value } }))}
                                      className="w-full border border-gray-300 rounded px-2 py-1 text-xs resize-none focus:outline-none focus:ring-1 focus:ring-orange-400"
                                    />
                                    <div className="flex gap-1.5">
                                      <button
                                        onClick={() => reviewMut.mutate({ id: l.id, action: reviewState[l.id]?.action, note: reviewState[l.id]?.note })}
                                        disabled={reviewMut.isPending}
                                        className="flex items-center gap-1 px-2.5 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700"
                                      >
                                        {reviewMut.isPending ? <Loader2 size={10} className="animate-spin" /> : <CheckCircle size={11} />}
                                        Confirm
                                      </button>
                                      <button
                                        onClick={() => setReviewState(p => ({ ...p, [l.id]: undefined }))}
                                        className="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50"
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="flex gap-1.5">
                                    <button
                                      onClick={() => setReviewState(p => ({ ...p, [l.id]: { open: true, action: 'approve', note: '' } }))}
                                      className="flex items-center gap-1 px-2.5 py-1 bg-green-100 text-green-700 text-xs rounded hover:bg-green-200 border border-green-200"
                                    >
                                      <CheckCircle size={11} /> Approve
                                    </button>
                                    <button
                                      onClick={() => setReviewState(p => ({ ...p, [l.id]: { open: true, action: 'reject', note: '' } }))}
                                      className="flex items-center gap-1 px-2.5 py-1 bg-red-100 text-red-700 text-xs rounded hover:bg-red-200 border border-red-200"
                                    >
                                      <XCircle size={11} /> Reject
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}
                            {l.reviewed_by_name && (
                              <div className="text-xs text-gray-400 mt-0.5">by {l.reviewed_by_name}</div>
                            )}
                          </td>
                        </tr>
                      ))}
                      {!((leaveTab === 'pending' ? pendingLeavesQ.data : allLeavesQ.data) || []).length && (
                        <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400 text-sm">
                          {leaveTab === 'pending' ? 'No pending leave requests.' : 'No leave requests found.'}
                        </td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── HOLIDAYS TAB ──────────────────────────────────────────────────── */}
      {tab === 'holidays' && (
        <div className="space-y-4">
          {/* Add holiday form (admin only) */}
          {isAdmin && (
            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><Plus size={15} /> Add Holiday</CardTitle></CardHeader>
              <CardContent className="pt-0">
                <div className="flex flex-wrap gap-3 items-end">
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Date</label>
                    <input
                      type="date"
                      value={holForm.date}
                      onChange={e => setHolForm(p => ({ ...p, date: e.target.value }))}
                      className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                    />
                  </div>
                  <div className="flex-1 min-w-[160px]">
                    <label className="text-xs text-gray-500 mb-1 block">Holiday Name</label>
                    <input
                      type="text"
                      value={holForm.name}
                      onChange={e => setHolForm(p => ({ ...p, name: e.target.value }))}
                      placeholder="e.g. Diwali, Independence Day…"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                    />
                  </div>
                  <Button
                    onClick={() => addHolMut.mutate(holForm)}
                    disabled={addHolMut.isPending || !holForm.date || !holForm.name.trim()}
                    className="flex items-center gap-1.5"
                  >
                    {addHolMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                    Add
                  </Button>
                </div>
                {holError && <p className="text-xs text-red-500 mt-2">{holError}</p>}
              </CardContent>
            </Card>
          )}

          {/* Holiday list */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2"><CalendarDays size={16} /> Company Holidays</CardTitle>
                <div className="flex items-center gap-1">
                  <button onClick={() => setHolYear(y => y - 1)} className="p-1 hover:bg-gray-100 rounded"><ChevronLeft size={16} /></button>
                  <span className="text-sm font-semibold text-gray-700 w-12 text-center">{holYear}</span>
                  <button onClick={() => setHolYear(y => y + 1)} className="p-1 hover:bg-gray-100 rounded"><ChevronRight size={16} /></button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {holQ.isLoading ? (
                <div className="flex justify-center py-6"><Loader2 className="animate-spin text-gray-400" /></div>
              ) : !holQ.data?.length ? (
                <p className="text-sm text-gray-400 text-center py-6">No holidays added for {holYear}.</p>
              ) : (
                <div className="divide-y divide-gray-100">
                  {holQ.data.map(h => (
                    <div key={h.id} className="flex items-center gap-3 py-3">
                      <div className="w-2 h-2 rounded-full bg-purple-500 flex-shrink-0" />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-800">{h.name}</p>
                        <p className="text-xs text-gray-400">{fmtDate(h.date?.toISOString?.().slice(0,10) || String(h.date).slice(0,10))}</p>
                      </div>
                      {isAdmin && (
                        <button
                          onClick={() => delHolMut.mutate(h.id)}
                          disabled={delHolMut.isPending}
                          className="text-red-400 hover:text-red-600 p-1 rounded hover:bg-red-50 transition-colors"
                          title="Delete holiday"
                        >
                          <X size={15} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
