import React from 'react'
import { createRoot } from 'react-dom/client'
import VoiceJoin from './VoiceJoin'

class VoiceJoinErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { failed: false }
  }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(error) {
    console.error('Continuum voice invitation render failed:', error)
  }
  render() {
    if (this.state.failed) {
      return <main style={{minHeight:'100vh',display:'grid',placeItems:'center',padding:24,background:'#f7f8f5',fontFamily:'system-ui,sans-serif',color:'#26382d'}}>
        <section style={{maxWidth:440,padding:28,border:'1px solid #e4e9e2',borderRadius:20,background:'#fff',textAlign:'center'}}>
          <h1 style={{fontSize:23}}>We couldn't load this invitation</h1>
          <p style={{lineHeight:1.6,color:'#718078'}}>The voice page encountered an error. Reload the page or ask your clinic for a fresh invitation.</p>
          <button onClick={() => window.location.reload()} style={{padding:'13px 22px',border:0,borderRadius:10,background:'#315a43',color:'#fff',fontWeight:700}}>Reload page</button>
        </section>
      </main>
    }
    return this.props.children
  }
}

createRoot(document.getElementById('root')).render(
  <VoiceJoinErrorBoundary><VoiceJoin /></VoiceJoinErrorBoundary>
)
