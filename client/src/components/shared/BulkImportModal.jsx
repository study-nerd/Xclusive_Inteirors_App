import { useRef, useState } from 'react'
import { Button, Modal, Spinner } from './index'
import { Upload, Download } from 'lucide-react'

/**
 * Reusable bulk import modal.
 * Props:
 *   open, onClose, title, columns (string), templateUrl, onImport (async fn receiving File)
 */
export default function BulkImportModal({ open, onClose, title, columns, templateUrl, onImport }) {
  const fileRef = useRef()
  const [result, setResult]   = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  const handleFile = async (file) => {
    setLoading(true); setError('')
    try {
      const data = await onImport(file)
      setResult(data)
    } catch (e) {
      setError(e.response?.data?.message || 'Import failed')
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => { setResult(null); setError(''); onClose() }

  return (
    <Modal open={open} onClose={handleClose} title={title} className="max-w-md">
      <div className="space-y-4">
        <div className="p-3 bg-blue-50 border border-blue-200 rounded text-sm text-blue-800">
          Upload an Excel or CSV file with columns:<br />
          <code className="text-xs">{columns}</code>
        </div>

        <Button variant="outline" size="sm" onClick={() => window.open(templateUrl, '_blank')}>
          <Download size={13} className="mr-2" />Download Template
        </Button>

        {error && <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{error}</div>}

        {result ? (
          <div className="p-4 bg-green-50 border border-green-200 rounded text-sm">
            <div className="font-semibold text-green-800 mb-2">Import Complete</div>
            <div>✅ Created: <strong>{result.created}</strong></div>
            <div>⏭ Skipped: <strong>{result.skipped}</strong></div>
            {result.errors?.length > 0 && (
              <div className="mt-2 text-red-700">
                <div className="font-medium mb-1">Errors ({result.errors.length}):</div>
                {result.errors.slice(0, 6).map((e, i) => (
                  <div key={i} className="text-xs">{e.row}: {e.error}</div>
                ))}
              </div>
            )}
            <Button className="mt-3" size="sm" onClick={handleClose}>Done</Button>
          </div>
        ) : (
          <>
            <input
              ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
              onChange={e => { if (e.target.files[0]) handleFile(e.target.files[0]) }}
            />
            <Button onClick={() => fileRef.current.click()} disabled={loading}>
              {loading
                ? <><Spinner className="mr-2" />Importing...</>
                : <><Upload size={14} className="mr-2" />Choose File & Import</>}
            </Button>
          </>
        )}
      </div>
    </Modal>
  )
}
