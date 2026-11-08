import React, { useEffect, useRef, useState } from 'react';
import { Room, RoomEvent } from 'livekit-client';
import { Phone, PhoneOff, Mic, ShieldCheck, AlertCircle, LoaderCircle, AudioLines } from 'lucide-react';

async function post(path, body) {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Voice session request failed.');
  return data;
}

export default function VoiceJoin() {
  const tokenRef = useRef(new URLSearchParams(window.location.search).get('token') || '');
  const roomRef = useRef(null);
  const audioElementsRef = useRef([]);
  const [status, setStatus] = useState('ready');
  const [error, setError] = useState('');
  const [muted, setMuted] = useState(false);

  useEffect(() => () => {
    if (roomRef.current) roomRef.current.disconnect();
    audioElementsRef.current.forEach(element => { try { element.remove(); } catch {} });
  }, []);

  async function joinCall() {
    if (!tokenRef.current) {
      setError('This invitation link is incomplete. Please ask your clinic for a new one.');
      setStatus('error');
      return;
    }
    setStatus('joining'); setError('');
    let room;
    try {
      const session = await post('/api/voice-agent/livekit/join', { token: tokenRef.current });
      room = new Room({ adaptiveStream: true, dynacast: true });
      roomRef.current = room;
      room.on(RoomEvent.TrackSubscribed, track => {
        if (track.kind === 'audio') {
          const element = track.attach();
          element.autoplay = true;
          element.playsInline = true;
          element.setAttribute('aria-label', 'Continuum voice assistant audio');
          document.body.appendChild(element);
          audioElementsRef.current.push(element);
        }
      });
      room.on(RoomEvent.TrackUnsubscribed, track => {
        track.detach().forEach(element => {
          element.remove();
          audioElementsRef.current = audioElementsRef.current.filter(item => item !== element);
        });
      });
      room.on(RoomEvent.Disconnected, () => {
        if (roomRef.current === room) setStatus(current => current === 'ending' ? current : 'disconnected');
      });
      await room.connect(session.livekit_url, session.token);
      await room.localParticipant.setMicrophoneEnabled(true);
      setStatus('connected');
    } catch (e) {
      if (room) room.disconnect();
      roomRef.current = null;
      setError(e.message || 'Could not connect. Check microphone permission and try again.');
      setStatus('error');
    }
  }

  async function toggleMute() {
    const room = roomRef.current;
    if (!room) return;
    try {
      await room.localParticipant.setMicrophoneEnabled(muted);
      setMuted(!muted);
    } catch (e) {
      setError(e.message || 'Could not change microphone setting.');
    }
  }

  async function endCall() {
    setStatus('ending');
    try { await roomRef.current?.disconnect(); } catch {}
    roomRef.current = null;
    audioElementsRef.current.forEach(element => { try { element.remove(); } catch {} });
    audioElementsRef.current = [];
    try {
      await post('/api/voice-agent/livekit/complete', { token: tokenRef.current });
      setStatus('completed');
    } catch (e) {
      setError(e.message || 'Call ended, but the completion status could not be saved.');
      setStatus('completed');
    }
  }

  const pageStatus = {
    ready: ['You’re invited to a voice call', 'Join a short appointment reminder conversation with your clinic using your microphone.'],
    joining: ['Connecting…', 'Establishing your secure voice session.'],
    connected: ['You are connected', 'You can now speak with the Continuum Care Assistant.'],
    ending: ['Ending call…', 'Closing your voice session securely.'],
    completed: ['Call ended', 'Thank you. Your clinic has been notified that the session ended.'],
    disconnected: ['Connection ended', 'Your voice session disconnected.'],
    error: ['Unable to connect', 'Check your invitation and microphone permission.'],
  }[status] || ['Voice invitation', ''];
  return (
    <main style={{minHeight:'100vh',background:'#f7f8f5',display:'grid',placeItems:'center',padding:24,fontFamily:'Inter,system-ui,sans-serif',color:'#26382d'}}>
      <section style={{width:'min(100%,460px)',background:'#fff',border:'1px solid #e4e9e2',borderRadius:24,padding:28,boxShadow:'0 18px 55px #1f382010'}}>
        <div style={{display:'flex',alignItems:'center',gap:11,marginBottom:28}}>
          <div style={{width:42,height:42,borderRadius:13,background:'#eaf1e8',display:'grid',placeItems:'center',fontWeight:900,color:'#315a43'}}>c.</div>
          <div><b style={{fontSize:19}}>continuum</b><div style={{fontSize:9,letterSpacing:2,color:'#849187'}}>CARE, CONNECTED.</div></div>
        </div>
        <div style={{textAlign:'center',padding:'18px 0 24px'}}>
          <div style={{width:82,height:82,margin:'0 auto 18px',borderRadius:99,background:status==='connected'?'#e6f4e9':'#f0f3ef',display:'grid',placeItems:'center',color:'#315a43'}}>
            {status === 'joining' || status === 'ending' ? <LoaderCircle size={32}/> : status === 'connected' ? <AudioLines size={32}/> : <Phone size={32}/>}
          </div>
          <div style={{fontSize:10,fontWeight:800,letterSpacing:1.5,color:'#78907d'}}>CONTINUUM · SECURE VOICE INVITATION</div>
          <h1 style={{fontSize:25,letterSpacing:-.7,margin:'10px 0 7px'}}>{pageStatus[0]}</h1>
          <p style={{fontSize:13,lineHeight:1.6,color:'#738078',margin:0}}>{pageStatus[1]}</p>
        </div>
        {status==='ready' && <div style={{background:'#f7f9f6',borderRadius:14,padding:14,marginBottom:18,fontSize:12,lineHeight:1.6,color:'#66776a'}}>After you join, the Continuum assistant will confirm who it is speaking with before sharing appointment details.</div>}
        {status==='ready' && <p style={{display:'flex',gap:8,fontSize:11,lineHeight:1.5,color:'#77847a',margin:'0 0 18px'}}><ShieldCheck size={15} style={{flex:'0 0 auto'}}/> Your microphone is used only during this voice session. This Continuum page does not initiate an audio recording.</p>}
        {error && <div style={{display:'flex',gap:8,background:'#fff0ee',padding:11,borderRadius:10,color:'#a23a32',fontSize:11,lineHeight:1.5,marginBottom:14}}><AlertCircle size={15} style={{flex:'0 0 auto'}}/>{error}</div>}
        <div style={{display:'grid',gridTemplateColumns:status==='connected'?'1fr 1fr':'1fr',gap:9}}>
          {status==='ready' && <button onClick={joinCall} style={{border:0,borderRadius:11,padding:14,background:'#315a43',color:'#fff',fontWeight:800,fontSize:13,cursor:'pointer'}}><Phone size={15} style={{verticalAlign:'middle',marginRight:8}}/>Join call</button>}
          {status==='joining' && <button disabled style={{border:0,borderRadius:11,padding:14,background:'#bdc9bd',color:'#fff',fontWeight:800}}>Connecting securely…</button>}
          {status==='connected' && <>
            <button onClick={toggleMute} style={{border:'1px solid #dbe4dc',borderRadius:11,padding:13,background:'#f7f9f6',color:'#315a43',fontWeight:750,cursor:'pointer'}}><Mic size={15} style={{verticalAlign:'middle',marginRight:7}}/>{muted?'Unmute microphone':'Mute microphone'}</button>
            <button onClick={endCall} style={{border:0,borderRadius:11,padding:13,background:'#a94c45',color:'#fff',fontWeight:800,cursor:'pointer'}}><PhoneOff size={15} style={{verticalAlign:'middle',marginRight:7}}/>End call</button>
          </>}
          {status==='disconnected' && <button onClick={endCall} style={{border:0,borderRadius:11,padding:14,background:'#315a43',color:'#fff',fontWeight:800,cursor:'pointer'}}>Finish call</button>}
          {status==='error' && <button onClick={joinCall} style={{border:0,borderRadius:11,padding:14,background:'#315a43',color:'#fff',fontWeight:800,cursor:'pointer'}}>Try again</button>}
        </div>
        <p style={{fontSize:10,color:'#9aa49c',textAlign:'center',lineHeight:1.5,margin:'18px 0 0'}}>This is an internet voice session, not a telephone call. Keep this page open while connected.</p>
      </section>
    </main>
  );
}
