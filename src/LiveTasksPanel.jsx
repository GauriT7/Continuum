import React, { useCallback, useEffect, useState } from 'react'
import { Check, Circle, RefreshCw, AlertCircle, ClipboardList } from 'lucide-react'
import './live-tasks.css'

export default function LiveTasksPanel({ session }) {
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [savingId, setSavingId] = useState(null)

  const loadTasks = useCallback(async () => {
    if (!session?.access_token) {
      setError('Your session is not available. Please sign in again.')
      setLoading(false)
      return
    }
    setLoading(true)
    setError('')
    try {
      const response = await fetch('/api/tasks', {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: 'no-store'
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || `Request failed (${response.status})`)
      setTasks(payload.tasks || [])
    } catch (err) {
      setError(err.message || 'Could not load tasks.')
    } finally {
      setLoading(false)
    }
  }, [session?.access_token])

  useEffect(() => { loadTasks() }, [loadTasks])

  async function updateStatus(task) {
    const nextStatus = task.status === 'completed' ? 'pending' : 'completed'
    setSavingId(task.id)
    setError('')
    try {
      const response = await fetch('/api/tasks', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ id: task.id, status: nextStatus })
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || `Update failed (${response.status})`)
      setTasks(current => current.map(item => item.id === task.id ? { ...item, ...payload.task } : item))
    } catch (err) {
      setError(err.message || 'Could not update task.')
    } finally {
      setSavingId(null)
    }
  }

  return (
    <section className="panel live-tasks-panel">
      <div className="section-head">
        <div>
          <div className="eyebrow">SUPABASE · LIVE DATA</div>
          <h2>Tasks from your database</h2>
        </div>
        <button className="btn-light live-refresh" onClick={loadTasks} disabled={loading}>
          <RefreshCw size={14}/> Refresh
        </button>
      </div>

      {loading && <div className="live-task-state">Loading tasks from Continuum…</div>}
      {error && <div className="live-task-error"><AlertCircle size={15}/><span>{error}</span></div>}
      {!loading && !error && tasks.length === 0 && (
        <div className="live-task-state">No tasks are visible to this account yet.</div>
      )}

      {!loading && tasks.map(task => (
        <div className="live-task-row" key={task.id}>
          <button
            className={`live-task-check ${task.status === 'completed' ? 'checked' : ''}`}
            onClick={() => updateStatus(task)}
            disabled={savingId === task.id}
            aria-label={task.status === 'completed' ? 'Mark task pending' : 'Complete task'}
          >
            {task.status === 'completed' ? <Check size={14}/> : <Circle size={17}/>}
          </button>
          <div className="live-task-copy">
            <b className={task.status === 'completed' ? 'is-complete' : ''}>{task.title}</b>
            <small>{task.description || 'No additional details'} · {task.assigned_role || 'Unassigned'}</small>
          </div>
          <span className={`live-task-status ${task.status}`}>{savingId === task.id ? 'Saving…' : task.status.replace('_', ' ')}</span>
        </div>
      ))}

      <div className="live-task-foot">
        <ClipboardList size={14}/>
        <span>Changes are saved to Supabase when you update a task.</span>
      </div>
    </section>
  )
}
