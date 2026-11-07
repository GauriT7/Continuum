import React, { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { Check, Circle, Clock3, Loader2, RefreshCw, AlertCircle } from 'lucide-react'

export default function LiveTasks() {
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const loadTasks = useCallback(async () => {
    setLoading(true)
    setError('')
    setNotice('')
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()
      if (sessionError) throw sessionError
      if (!session?.access_token) throw new Error('Your session has expired. Please sign in again.')

      const response = await fetch('/api/tasks', {
        method: 'GET',
        headers: { Authorization: `Bearer ${session.access_token}` }
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || `Request failed (${response.status})`)
      setTasks(payload.tasks || [])
    } catch (e) {
      setError(e.message || 'Could not load tasks.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadTasks() }, [loadTasks])

  async function updateStatus(task, status) {
    setBusyId(task.id)
    setError('')
    setNotice('')
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()
      if (sessionError) throw sessionError
      if (!session?.access_token) throw new Error('Your session has expired. Please sign in again.')

      const response = await fetch('/api/tasks', {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ id: task.id, status })
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || `Update failed (${response.status})`)
      setTasks(current => current.map(item => item.id === task.id ? { ...item, status: payload.task.status } : item))
      setNotice('Task status saved to Continuum.')
    } catch (e) {
      setError(e.message || 'Could not update this task.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <section className="panel full-table continuum-live-tasks">
      <div className="section-head">
        <div>
          <div className="eyebrow">LIVE FROM SUPABASE</div>
          <h2>Clinic task queue</h2>
          <p className="continuum-live-subtitle">Tasks stored in your clinic database. Changes are saved immediately.</p>
        </div>
        <button className="btn-light" onClick={loadTasks} disabled={loading}>
          {loading ? <Loader2 size={15} className="continuum-spin" /> : <RefreshCw size={15} />}
          Refresh
        </button>
      </div>

      {error && <div className="continuum-live-error"><AlertCircle size={16}/><span>{error}</span></div>}
      {notice && <div className="continuum-live-notice"><Check size={15}/><span>{notice}</span></div>}

      {loading ? (
        <div className="continuum-live-empty"><Loader2 className="continuum-spin" size={20}/> Loading clinic tasks…</div>
      ) : tasks.length === 0 ? (
        <div className="continuum-live-empty">No tasks found for this account’s clinic yet.</div>
      ) : (
        <div className="continuum-live-list">
          {tasks.map(task => (
            <div className="continuum-live-row" key={task.id}>
              <div className={`continuum-live-status ${task.status === 'completed' ? 'is-complete' : ''}`}>
                {task.status === 'completed' ? <Check size={15}/> : <Circle size={15}/>}
              </div>
              <div className="continuum-live-task-copy">
                <b>{task.title}</b>
                <small>{task.description || 'No additional details'} · {task.assigned_role || 'Unassigned'}</small>
                <span>{task.status.replace('_', ' ')}</span>
              </div>
              <button
                className={task.status === 'completed' ? 'btn-light' : 'btn-primary'}
                disabled={busyId === task.id || task.status === 'completed'}
                onClick={() => updateStatus(task, 'completed')}
              >
                {busyId === task.id ? <Loader2 size={14} className="continuum-spin"/> : <Check size={14}/>}
                {task.status === 'completed' ? 'Completed' : 'Mark complete'}
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="continuum-live-footnote"><Clock3 size={13}/> This list is retrieved using your signed-in account and clinic permissions.</div>
    </section>
  )
}
