'use client';
import React, {
  useState, useEffect, useCallback, useMemo, useRef
} from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Cluster {
  id: number; label: string; articleCount: number;
  startTime: string; endTime: string; sources: string[];
}
interface Article {
  id: string; title: string; summary: string | null; body: string | null;
  url: string; source: string; published_at: string;
}
interface ClusterDetail { id: number; label: string; articles: Article[]; }
interface Stats { database: { articles: number; clusters: number } }

// ─── Constants ────────────────────────────────────────────────────────────────
const API = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'}/api`;

const SRC_DEFS: Record<string, {
  color: string; glow: string; barBg: string; barBgDim: string; border: string; borderDim: string;
  badge: string; badgeBg: string; badgeBorder: string; dot: string;
}> = {
  'BBC News': {
    color: '#EF4444', glow: 'rgba(239,68,68,.35)',
    barBg: 'linear-gradient(90deg,#EF4444ee,#EF444499)',
    barBgDim: 'linear-gradient(90deg,#EF444466,#EF444433)',
    border: 'rgba(239,68,68,.7)', borderDim: 'rgba(239,68,68,.3)',
    badge: '#EF4444', badgeBg: 'var(--bbc-bg)', badgeBorder: 'var(--bbc-border)', dot: '#EF4444'
  },
  NPR: {
    color: '#2563EB', glow: 'rgba(37,99,235,.35)',
    barBg: 'linear-gradient(90deg,#2563EBee,#2563EB99)',
    barBgDim: 'linear-gradient(90deg,#2563EB66,#2563EB33)',
    border: 'rgba(37,99,235,.7)', borderDim: 'rgba(37,99,235,.3)',
    badge: '#2563EB', badgeBg: 'var(--npr-bg)', badgeBorder: 'var(--npr-border)', dot: '#2563EB'
  },
  'Al Jazeera': {
    color: '#D97706', glow: 'rgba(217,119,6,.35)',
    barBg: 'linear-gradient(90deg,#D97706ee,#D9770699)',
    barBgDim: 'linear-gradient(90deg,#D9770666,#D9770633)',
    border: 'rgba(217,119,6,.7)', borderDim: 'rgba(217,119,6,.3)',
    badge: '#D97706', badgeBg: 'var(--aje-bg)', badgeBorder: 'var(--aje-border)', dot: '#D97706'
  },
};
const FALLBACK = {
  color: '#7C3AED', glow: 'rgba(124,58,237,.3)',
  barBg: 'linear-gradient(90deg,#7C3AEDee,#7C3AED99)',
  barBgDim: 'linear-gradient(90deg,#7C3AED66,#7C3AED33)',
  border: 'rgba(124,58,237,.7)', borderDim: 'rgba(124,58,237,.3)',
  badge: '#7C3AED', badgeBg: 'rgba(124,58,237,.08)', badgeBorder: 'rgba(124,58,237,.25)', dot: '#7C3AED'
};
const getSrc = (s: string) => SRC_DEFS[s] ?? FALLBACK;

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmtClock = (iso: string) => {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? 'Invalid Time' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};
const fmtDate  = (iso: string) => {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? 'Invalid Date' : d.toLocaleDateString([], { month: 'short', day: 'numeric' });
};
const relTime  = (iso: string) => {
  const t = +new Date(iso);
  if (isNaN(t)) return 'Unknown';
  const m = Math.floor((Date.now() - t) / 60000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};
const stripHtml = (s: string) => s.replace(/<[^>]+>/g, '');

// ─── Window size hook ─────────────────────────────────────────────────────────
function useWindowWidth() {
  const [w, setW] = useState(1440);
  useEffect(() => {
    const update = () => setW(window.innerWidth);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  return w;
}

// ─── SVG Icons ────────────────────────────────────────────────────────────────
const Ico = {
  Refresh:  ({ spinning }: { spinning?: boolean }) => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={spinning ? 'spin' : ''} style={{ display:'block',flexShrink:0 }}>
      <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
    </svg>
  ),
  Sun: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{display:'block'}}><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>,
  Moon: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{display:'block'}}><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>,
  Search: () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{display:'block'}}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  Close: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{display:'block'}}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  ExtLink: () => <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{display:'block'}}><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>,
  BookOpen: () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{display:'block'}}><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>,
  Menu: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{display:'block'}}><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>,
  Clock: () => <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{display:'block'}}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
  Article: () => <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{display:'block'}}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>,
  ChevRight: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{display:'block'}}><polyline points="9 18 15 12 9 6"/></svg>,
  Layers: () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{display:'block'}}><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>,
  Globe: () => <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" style={{display:'block'}}><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>,
};

// ─── Article Panel (shared across desktop sidebar & mobile bottom sheet) ───────
function ArticlePanel({
  detail, expandedId, setExpandedId, onClose, panelRef
}: {
  detail: ClusterDetail;
  expandedId: string | null;
  setExpandedId: (id: string | null) => void;
  onClose: () => void;
  panelRef?: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div ref={panelRef} style={{ display:'flex', flexDirection:'column', flex:1, overflow:'hidden' }}>
      {/* Sticky header */}
      <div style={{
        padding:'16px 18px 12px', borderBottom:'1px solid var(--border)',
        background:'var(--surface)', flexShrink:0, position:'sticky', top:0, zIndex:5
      }}>
        <div style={{ display:'flex', alignItems:'flex-start', gap:8, justifyContent:'space-between', marginBottom:10 }}>
          <div style={{ display:'flex', gap:6, flexWrap:'wrap', flex:1 }}>
            {[...new Set(detail.articles.map(a => a.source))].map(src => {
              const sc = getSrc(src);
              return (
                <span key={src} className="src-badge" style={{ color:sc.badge, background:sc.badgeBg, borderColor:sc.badgeBorder }}>
                  <div style={{ width:5, height:5, borderRadius:'50%', background:sc.dot }} />
                  {src}
                </span>
              );
            })}
          </div>
          <button className="btn-icon" onClick={onClose} style={{ width:28, height:28, borderRadius:7, flexShrink:0 }}>
            <Ico.Close />
          </button>
        </div>

        <h2 style={{
          fontFamily:"'DM Serif Display',Georgia,serif",
          fontSize:15, fontWeight:400, lineHeight:1.45,
          color:'var(--text-1)', marginBottom:9, letterSpacing:'-.01em'
        }}>
          {detail.label.replace(/\s*\([^)]*\)$/, '')}
        </h2>

        <div style={{ display:'flex', gap:12, flexWrap:'wrap', alignItems:'center' }}>
          <span style={{ display:'flex', alignItems:'center', gap:4, fontSize:11, color:'var(--text-3)', fontWeight:500 }}>
            <Ico.Article />{detail.articles.length} article{detail.articles.length !== 1 ? 's' : ''}
          </span>
          {detail.articles[0] && (
            <span style={{ display:'flex', alignItems:'center', gap:4, fontSize:11, color:'var(--text-3)', fontWeight:500 }}>
              <Ico.Clock />{relTime(detail.articles[0].published_at)}
            </span>
          )}
          {detail.articles.length > 1 && (
            <span style={{ fontSize:10, color:'var(--text-4)', fontFamily:"'DM Mono',monospace" }}>
              {fmtDate(detail.articles[0].published_at)} → {fmtDate(detail.articles[detail.articles.length - 1].published_at)}
            </span>
          )}
        </div>
      </div>

      {/* Scrollable article list */}
      <div style={{ flex:1, overflowY:'auto', padding:'12px 18px', display:'flex', flexDirection:'column', gap:10 }}>
        {detail.articles.map((art, i) => {
          const sc = getSrc(art.source);
          const isOpen = expandedId === art.id;
          return (
            <motion.div
              key={art.id}
              initial={{ opacity:0, y:6 }}
              animate={{ opacity:1, y:0 }}
              transition={{ delay: i * 0.04, duration: 0.22 }}
              className="art-card"
            >
              {/* Top */}
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8, flexWrap:'wrap', gap:5 }}>
                <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                  <div style={{ width:7, height:7, borderRadius:'50%', background:sc.dot, boxShadow:`0 0 6px ${sc.glow}`, flexShrink:0 }} />
                  <span style={{ fontSize:10, fontWeight:700, color:sc.badge, textTransform:'uppercase', letterSpacing:'.05em' }}>
                    {art.source}
                  </span>
                </div>
                <span style={{ fontSize:10, color:'var(--text-4)', fontFamily:"'DM Mono',monospace" }}>
                  {relTime(art.published_at)} · {fmtClock(art.published_at)}
                </span>
              </div>

              {/* Title */}
              <h3 style={{
                fontSize:13.5, fontWeight:600, lineHeight:1.5,
                color:'var(--text-1)', marginBottom:6, letterSpacing:'-.005em', wordBreak:'break-word'
              }}>
                {art.title}
              </h3>

              {/* Summary */}
              {art.summary && (
                <p style={{
                  fontSize:11.5, color:'var(--text-3)', lineHeight:1.7, marginBottom:9,
                  display:'-webkit-box', WebkitLineClamp:3, WebkitBoxOrient:'vertical', overflow:'hidden'
                }}>
                  {stripHtml(art.summary)}
                </p>
              )}

              {/* Actions */}
              <div style={{
                display:'flex', alignItems:'center', justifyContent:'space-between',
                paddingTop:9, borderTop:'1px solid var(--border)', flexWrap:'wrap', gap:6
              }}>
                {art.body ? (
                  <button
                    onClick={() => setExpandedId(isOpen ? null : art.id)}
                    style={{
                      background:'none', border:'none', cursor:'pointer',
                      display:'flex', alignItems:'center', gap:5,
                      color: isOpen ? sc.badge : 'var(--text-3)',
                      fontSize:11, fontWeight:600, transition:'color .15s', padding:0
                    }}
                  >
                    <Ico.BookOpen />{isOpen ? 'Collapse' : 'Read more'}
                  </button>
                ) : (
                  <span style={{ fontSize:10, color:'var(--text-4)', fontStyle:'italic' }}>No full text</span>
                )}
                <a
                  href={art.url} target="_blank" rel="noopener noreferrer"
                  style={{
                    display:'flex', alignItems:'center', gap:4,
                    fontSize:11, color:'var(--text-3)', textDecoration:'none',
                    fontWeight:600, transition:'color .15s'
                  }}
                  onMouseEnter={e => (e.currentTarget.style.color = sc.badge)}
                  onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-3)')}
                >
                  View source <Ico.ExtLink />
                </a>
              </div>

              {/* Body reader */}
              <AnimatePresence>
                {isOpen && art.body && (
                  <motion.div
                    initial={{ height:0, opacity:0 }}
                    animate={{ height:'auto', opacity:1 }}
                    exit={{ height:0, opacity:0 }}
                    transition={{ duration:.22 }}
                    style={{ overflow:'hidden' }}
                  >
                    <div className="body-reader" style={{ borderLeft:`2px solid ${sc.badge}` }}>
                      {art.body.split('\n\n').filter(p => p.trim().length > 20).slice(0, 10).map((para, pi) => (
                        <p key={pi}>{para.trim()}</p>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function NewsPulse() {
  const width = useWindowWidth();
  const isMobile = width <= 960;

  const [theme, setTheme]             = useState<'light' | 'dark'>('light');
  const [timeline, setTimeline]       = useState<Cluster[]>([]);
  const [detail, setDetail]           = useState<ClusterDetail | null>(null);
  const [activeId, setActiveId]       = useState<number | null>(null);
  const [activeSrc, setActiveSrc]     = useState(['BBC News', 'NPR', 'Al Jazeera']);
  const [search, setSearch]           = useState('');
  const [stats, setStats]             = useState<Stats | null>(null);
  const [ingesting, setIngesting]     = useState(false);
  const [ingestPhase, setIngestPhase] = useState('');
  const [ingestOk, setIngestOk]       = useState(false);
  const [ingestErr, setIngestErr]     = useState('');
  const [expandedId, setExpandedId]   = useState<string | null>(null);
  const [mobileDrawer, setMobileDrawer] = useState(false); // hamburger nav
  const [sheetOpen, setSheetOpen]     = useState(false);   // mobile bottom sheet

  const sidebarRef = useRef<HTMLDivElement>(null);
  const sheetRef   = useRef<HTMLDivElement>(null);

  // ── Theme ──
  useEffect(() => {
    const saved = (localStorage.getItem('np-theme') ?? 'light') as 'light'|'dark';
    setTheme(saved);
    document.documentElement.setAttribute('data-theme', saved);
  }, []);
  const toggleTheme = () => {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('np-theme', next);
  };

  // ── Reading progress ──
  useEffect(() => {
    const fn = () => {
      const el = document.getElementById('read-prog');
      if (!el) return;
      const total = document.documentElement.scrollHeight - window.innerHeight;
      el.style.width = total > 0 ? `${(window.scrollY / total) * 100}%` : '0%';
    };
    window.addEventListener('scroll', fn);
    return () => window.removeEventListener('scroll', fn);
  }, []);

  // ── Keyboard shortcuts ──
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSheetOpen(false);
        setMobileDrawer(false);
      }
    };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, []);

  // ── Data fetching ──
  const loadTimeline = useCallback(async () => {
    try {
      const r = await fetch(`${API}/timeline`);
      if (r.ok) setTimeline(await r.json());
    } catch {}
  }, []);

  const loadStats = useCallback(async () => {
    try {
      const r = await fetch(`${API}`);
      if (r.ok) setStats(await r.json());
    } catch {}
  }, []);

  const loadDetail = useCallback(async (id: number) => {
    try {
      const r = await fetch(`${API}/clusters/${id}`);
      if (r.ok) {
        const data = await r.json();
        setDetail(data);
        setExpandedId(null);
        // Scroll panels to top
        setTimeout(() => {
          sidebarRef.current?.scrollTo({ top:0, behavior:'smooth' });
          sheetRef.current?.scrollTo({ top:0, behavior:'smooth' });
        }, 40);
      }
    } catch {}
  }, []);

  useEffect(() => { loadTimeline(); loadStats(); }, [loadTimeline, loadStats]);
  useEffect(() => {
    const t = setInterval(() => { if (!ingesting) { loadTimeline(); loadStats(); } }, 30000);
    return () => clearInterval(t);
  }, [ingesting, loadTimeline, loadStats]);

  useEffect(() => {
    if (activeId !== null) {
      loadDetail(activeId);
      if (isMobile) setSheetOpen(true);
    } else {
      setDetail(null);
      setSheetOpen(false);
    }
  }, [activeId, loadDetail, isMobile]);

  // ── Ingest ──
  const triggerIngest = async () => {
    if (ingesting) return;
    setIngesting(true); setIngestOk(false); setIngestErr(''); setIngestPhase('Connecting to feeds…');
    const phases = [
      'Fetching BBC News RSS…','Fetching NPR RSS…','Fetching Al Jazeera RSS…',
      'Extracting article text…','Running TF-IDF vectorization…',
      'Computing cosine similarity…','Building topic clusters…','Persisting to database…'
    ];
    let pi = 0;
    const phaseT = setInterval(() => {
      if (pi < phases.length) setIngestPhase(phases[pi++]);
      else clearInterval(phaseT);
    }, 3200);
    try {
      const res = await fetch(`${API}/ingest/trigger`, { method:'POST' });
      if (!res.ok) throw new Error('Trigger failed');
      const { jobId } = await res.json();
      const pollT = setInterval(async () => {
        try {
          const resStatus = await fetch(`${API}/ingest/status/${jobId}`);
          if (!resStatus.ok) {
            clearInterval(pollT);
            clearInterval(phaseT);
            setIngesting(false);
            setIngestErr('Job status not found. The server may have restarted or database was cleared.');
            return;
          }
          const s = await resStatus.json();
          if (s.status === 'completed' || s.status === 'failed') {
            clearInterval(pollT); clearInterval(phaseT); setIngesting(false);
            if (s.status === 'completed') {
              setIngestOk(true); loadTimeline(); loadStats();
              if (activeId) loadDetail(activeId);
              setTimeout(() => setIngestOk(false), 6000);
            } else { setIngestErr(s.error || 'Ingestion failed.'); }
          }
        } catch { clearInterval(pollT); clearInterval(phaseT); setIngesting(false); }
      }, 2000);
    } catch (e: unknown) {
      clearInterval(phaseT); setIngesting(false);
      setIngestErr(e instanceof Error ? e.message : 'Could not trigger ingestion');
    }
  };

  // ── Filtered clusters ──
  const filtered = useMemo(() => {
    if (!timeline.length) return [];
    
    // Find the latest endTime to use as reference point
    const times = timeline.map(c => +new Date(c.endTime)).filter(t => !isNaN(t));
    const maxTime = times.length > 0 ? Math.max(...times) : Date.now();
    const cutoff = maxTime - 7 * 24 * 60 * 60 * 1000; // 7 days cutoff

    return timeline.filter(c => {
      // Exclude clusters whose latest article is older than 7 days from the latest seen article
      const cTime = +new Date(c.endTime);
      if (!isNaN(cTime) && cTime < cutoff) return false;

      if (!c.sources.some(s => activeSrc.includes(s))) return false;
      if (search.trim() && !c.label.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [timeline, activeSrc, search]);

  // ── Time axis ──
  const bounds = useMemo(() => {
    if (!filtered.length) { const now = Date.now(); return { min: now - 86400000, span: 86400000 }; }
    const ts = filtered
      .flatMap(c => [+new Date(c.startTime), +new Date(c.endTime)])
      .filter(t => !isNaN(t));
    if (!ts.length) { const now = Date.now(); return { min: now - 86400000, span: 86400000 }; }
    const mn = Math.min(...ts), mx = Math.max(...ts);
    const pad = (mx - mn) * 0.06 || 3600000;
    return { min: mn - pad, span: (mx + pad) - (mn - pad) };
  }, [filtered]);

  const toX   = (t: string) => {
    const val = +new Date(t);
    if (isNaN(val) || isNaN(bounds.min) || isNaN(bounds.span) || bounds.span === 0) return 0;
    return ((val - bounds.min) / bounds.span) * 100;
  };
  const ticks = useMemo(() => Array.from({ length: 5 }, (_, i) => {
    const ms = bounds.min + bounds.span * (i / 4);
    const d  = new Date(ms);
    const isInvalid = isNaN(d.getTime());
    return {
      pct:  `${(i / 4) * 100}%`,
      time: isInvalid ? 'Invalid Time' : d.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' }),
      date: isInvalid ? 'Invalid Date' : d.toLocaleDateString([], { month:'short', day:'numeric' })
    };
  }), [bounds]);

  // ── Bar geometry ──
  const barGeom = (c: Cluster, isActive: boolean) => {
    let left  = toX(c.startTime);
    let width = Math.max(toX(c.endTime) - left, 2.5);
    if (left < 0) { width += left; left = 0; }
    if (left + width > 100) width = 100 - left;
    const sc  = getSrc(c.sources[0] ?? '');
    const h   = c.articleCount >= 6 ? 36 : c.articleCount >= 3 ? 29 : 22;
    return {
      left: `${left}%`, width: `${width}%`, height: `${h}px`,
      minWidth: '42px',
      background:  isActive ? sc.barBg : sc.barBgDim,
      borderColor: isActive ? sc.border : sc.borderDim,
      boxShadow:   isActive ? `0 0 18px ${sc.glow}, 0 2px 8px rgba(0,0,0,.18)` : 'none',
    };
  };

  const toggleSrc = (s: string) =>
    setActiveSrc(p => p.includes(s) ? p.filter(x => x !== s) : [...p, s]);

  const tickerItems = filtered.slice(0, 12).map(c => c.label.replace(/\s*\([^)]*\)$/, '').slice(0, 70));

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <>
      <div id="read-prog" />

      <div style={{ display:'flex', flexDirection:'column', minHeight:'100dvh' }}>

        {/* ══ LIVE TICKER ══ */}
        <div style={{
          background:'#0F172A', color:'#F1F5F9',
          overflow:'hidden', userSelect:'none', flexShrink:0
        }}>
          <div style={{
            display:'flex', alignItems:'center',
            maxWidth:1440, margin:'0 auto'
          }}>
            <div style={{
              background:'var(--crimson)', padding:'7px 14px',
              fontSize:9, fontWeight:800, letterSpacing:'.12em',
              display:'flex', alignItems:'center', gap:7, flexShrink:0
            }}>
              <span className="pulse" style={{ display:'block', width:6, height:6, borderRadius:'50%', background:'#fff' }} />
              LIVE
            </div>
            <div style={{ flex:1, overflow:'hidden', padding:'7px 0' }}>
              {tickerItems.length > 0 ? (
                <div className="ticker-track" style={{ fontSize:11, color:'rgba(241,245,249,.75)', fontWeight:500 }}>
                  <span>{tickerItems.join('   ·   ')}</span>
                  <span style={{ paddingLeft:80 }} aria-hidden>{tickerItems.join('   ·   ')}</span>
                </div>
              ) : (
                <span style={{ fontSize:11, color:'rgba(241,245,249,.4)', paddingLeft:16 }}>
                  Awaiting feeds — click Refresh to ingest news
                </span>
              )}
            </div>
          </div>
        </div>

        {/* ══ STICKY NAV ══ */}
        <nav className="nav-glass" style={{ position:'sticky', top:0, zIndex:90, flexShrink:0 }}>
          <div style={{
            maxWidth:1440, margin:'0 auto', height:56,
            display:'flex', alignItems:'center',
            justifyContent:'space-between',
            padding:'0 16px', gap:12
          }}>
            {/* Brand */}
            <div style={{ display:'flex', alignItems:'center', gap:10, flexShrink:0 }}>
              <span className="pulse" style={{
                display:'block', width:8, height:8, borderRadius:'50%',
                background:'var(--accent)', boxShadow:'0 0 10px rgba(37,99,235,.7)',
                flexShrink:0
              }} />
              <div>
                <h1 style={{
                  fontFamily:"'DM Serif Display',Georgia,serif",
                  fontSize: width < 480 ? 17 : 20,
                  fontWeight:400, letterSpacing:'-.025em', lineHeight:1, color:'var(--text-1)'
                }}>
                  News<span style={{ color:'var(--accent)', fontStyle:'italic' }}>Pulse</span>
                </h1>
                <p className="nav-brand-sub" style={{
                  fontSize:8, color:'var(--text-4)', letterSpacing:'.1em',
                  textTransform:'uppercase', marginTop:1
                }}>
                  Topic-Clustered Timeline
                </p>
              </div>
            </div>

            {/* Right controls */}
            <div style={{ display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>

              {/* Stats (hidden on ≤640px via CSS) */}
              {stats && (
                <div className="nav-stats" style={{ display:'flex', gap:7 }}>
                  {[
                    { val: stats.database.articles, lbl:'Articles', color:'var(--accent)' },
                    { val: stats.database.clusters, lbl:'Clusters', color:'var(--accent-2)' }
                  ].map(s => (
                    <div key={s.lbl} className="stat-chip">
                      <span className="val" style={{ color:s.color }}>{s.val}</span>
                      <span className="lbl">{s.lbl}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Refresh */}
              <button
                onClick={triggerIngest}
                disabled={ingesting}
                className="btn btn-primary"
                style={{ fontSize:12, padding:'7px 14px' }}
              >
                <Ico.Refresh spinning={ingesting} />
                <span className="nav-refresh-txt">{ingesting ? 'Crawling…' : 'Refresh Feeds'}</span>
              </button>

              {/* Theme toggle */}
              <button onClick={toggleTheme} className="btn-icon" title="Toggle theme">
                {theme === 'light' ? <Ico.Moon /> : <Ico.Sun />}
              </button>

              {/* Mobile hamburger (always rendered, shown via CSS at ≤640px) */}
              {isMobile && (
                <button
                  onClick={() => setMobileDrawer(true)}
                  className="btn-icon"
                  aria-label="Open menu"
                >
                  <Ico.Menu />
                </button>
              )}
            </div>
          </div>

          {/* Ingest progress strip */}
          <AnimatePresence>
            {ingesting && (
              <motion.div
                initial={{ height:0, opacity:0 }}
                animate={{ height:'auto', opacity:1 }}
                exit={{ height:0, opacity:0 }}
                style={{ overflow:'hidden', borderTop:'1px solid var(--border)' }}
              >
                <div style={{ padding:'8px 16px', maxWidth:1440, margin:'0 auto' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:5 }}>
                    <span style={{ fontSize:10.5, color:'var(--accent)', fontWeight:600 }}>{ingestPhase}</span>
                    <span style={{ fontSize:9, color:'var(--text-4)', fontFamily:"'DM Mono',monospace", letterSpacing:'.06em', textTransform:'uppercase' }}>Running</span>
                  </div>
                  <div style={{ height:2, background:'var(--border)', borderRadius:4, overflow:'hidden' }}>
                    <div style={{
                      height:'100%',
                      background:'linear-gradient(90deg,var(--accent),var(--accent-2))',
                      borderRadius:4, animation:'prog-bar 25s ease-out forwards'
                    }} />
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Success / error banners */}
          <AnimatePresence>
            {ingestOk && (
              <motion.div
                key="ok"
                initial={{ height:0, opacity:0 }} animate={{ height:'auto', opacity:1 }} exit={{ height:0, opacity:0 }}
                style={{ overflow:'hidden', background:'rgba(16,185,129,.08)', borderTop:'1px solid rgba(16,185,129,.2)' }}
              >
                <div style={{ padding:'7px 16px', display:'flex', alignItems:'center', gap:8 }}>
                  <div style={{ width:6, height:6, borderRadius:'50%', background:'#10B981', flexShrink:0 }} />
                  <span style={{ fontSize:11, color:'#10B981', fontWeight:600 }}>Feeds refreshed — timeline updated.</span>
                </div>
              </motion.div>
            )}
            {ingestErr && (
              <motion.div
                key="err"
                initial={{ height:0, opacity:0 }} animate={{ height:'auto', opacity:1 }} exit={{ height:0, opacity:0 }}
                style={{ overflow:'hidden', background:'rgba(239,68,68,.07)', borderTop:'1px solid rgba(239,68,68,.2)' }}
              >
                <div style={{ padding:'7px 16px', display:'flex', alignItems:'center', gap:8, maxWidth:1440, margin:'0 auto' }}>
                  <div style={{ width:6, height:6, borderRadius:'50%', background:'#EF4444', flexShrink:0 }} />
                  <span style={{ fontSize:11, color:'#EF4444', fontWeight:500, flex:1 }}>{ingestErr}</span>
                  <button onClick={() => setIngestErr('')} className="btn-icon" style={{ width:24, height:24, borderRadius:6 }}>
                    <Ico.Close />
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </nav>

        {/* ══ MOBILE NAV DRAWER ══ */}
        <AnimatePresence>
          {mobileDrawer && (
            <div className="mobile-drawer">
              <motion.div
                className="mobile-drawer-backdrop"
                initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
                onClick={() => setMobileDrawer(false)}
              />
              <motion.div
                className="mobile-drawer-panel"
                initial={{ x:'100%' }}
                animate={{ x:0 }}
                exit={{ x:'100%' }}
                transition={{ type:'spring', damping:28, stiffness:260 }}
              >
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
                  <h2 style={{ fontFamily:"'DM Serif Display',serif", fontSize:16, fontStyle:'italic', color:'var(--text-1)' }}>
                    NewsPulse
                  </h2>
                  <button onClick={() => setMobileDrawer(false)} className="btn-icon" style={{ width:32, height:32 }}>
                    <Ico.Close />
                  </button>
                </div>

                {/* Stats */}
                {stats && (
                  <div style={{ display:'flex', gap:10, marginBottom:20 }}>
                    {[
                      { val: stats.database.articles, lbl:'Articles', color:'var(--accent)' },
                      { val: stats.database.clusters, lbl:'Clusters', color:'var(--accent-2)' }
                    ].map(s => (
                      <div key={s.lbl} className="stat-chip" style={{ flex:1 }}>
                        <span className="val" style={{ color:s.color }}>{s.val}</span>
                        <span className="lbl">{s.lbl}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Source toggles */}
                <p style={{ fontSize:10, fontWeight:700, color:'var(--text-4)', textTransform:'uppercase', letterSpacing:'.08em', marginBottom:10 }}>Sources</p>
                <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:20 }}>
                  {(['BBC News', 'NPR', 'Al Jazeera'] as const).map(src => {
                    const sc  = getSrc(src);
                    const on  = activeSrc.includes(src);
                    return (
                      <button
                        key={src} className="src-btn"
                        onClick={() => toggleSrc(src)}
                        style={{
                          background: on ? sc.badgeBg : 'transparent',
                          borderColor: on ? sc.badgeBorder : 'var(--border)',
                          color: on ? sc.color : 'var(--text-3)',
                          padding:'10px 14px', justifyContent:'flex-start'
                        }}
                      >
                        <div style={{ width:8, height:8, borderRadius:'50%', background: on ? sc.dot : 'var(--text-4)' }} />
                        {src}
                      </button>
                    );
                  })}
                </div>

                {/* Refresh */}
                <button onClick={() => { triggerIngest(); setMobileDrawer(false); }} disabled={ingesting} className="btn btn-primary" style={{ width:'100%', justifyContent:'center' }}>
                  <Ico.Refresh spinning={ingesting} />
                  {ingesting ? 'Crawling…' : 'Refresh Feeds'}
                </button>

                <div style={{ marginTop:12 }}>
                  <button onClick={() => { toggleTheme(); setMobileDrawer(false); }} className="btn btn-ghost" style={{ width:'100%', justifyContent:'center', gap:8 }}>
                    {theme === 'light' ? <Ico.Moon /> : <Ico.Sun />}
                    Switch to {theme === 'light' ? 'Dark' : 'Light'} Mode
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* ══ MAIN CONTENT ══ */}
        <div
          className="main-two-col"
          style={{
            flex:1,
            display:'grid',
            gridTemplateColumns: isMobile ? '1fr' : '1fr 420px',
            minHeight:0,
            overflow:'hidden'
          }}
        >
          {/* ─── LEFT: Timeline column ─── */}
          <div style={{ display:'flex', flexDirection:'column', overflow:'hidden', borderRight: isMobile ? 'none' : '1px solid var(--border)' }}>

            {/* Filter row */}
            <div style={{
              background:'var(--surface)', borderBottom:'1px solid var(--border)',
              padding:'10px 14px', flexShrink:0
            }}>
              {/* Source toggles — horizontal scroll on mobile */}
              <div style={{ display:'flex', gap:7, overflowX:'auto', paddingBottom:8, marginBottom:8, borderBottom:'1px solid var(--border)' }}>
                {(['BBC News', 'NPR', 'Al Jazeera'] as const).map(src => {
                  const sc = getSrc(src);
                  const on = activeSrc.includes(src);
                  return (
                    <button
                      key={src} className="src-btn"
                      onClick={() => toggleSrc(src)}
                      style={{
                        background: on ? sc.badgeBg : 'transparent',
                        borderColor: on ? sc.badgeBorder : 'var(--border)',
                        color: on ? sc.color : 'var(--text-4)'
                      }}
                    >
                      <div style={{
                        width:7, height:7, borderRadius:'50%',
                        background: on ? sc.dot : 'var(--text-4)',
                        boxShadow: on ? `0 0 7px ${sc.glow}` : 'none', flexShrink:0
                      }} />
                      {src}
                    </button>
                  );
                })}
              </div>

              {/* Search + count */}
              <div style={{ display:'flex', gap:10, alignItems:'center' }}>
                <div style={{ position:'relative', flex:1 }}>
                  <span style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'var(--text-4)', display:'flex', pointerEvents:'none' }}>
                    <Ico.Search />
                  </span>
                  <input
                    type="text" className="input"
                    placeholder="Filter clusters…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    style={{ width:'100%', padding:'7px 28px 7px 30px', fontSize:12 }}
                  />
                  {search && (
                    <button
                      onClick={() => setSearch('')}
                      style={{ position:'absolute', right:8, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', color:'var(--text-4)', display:'flex', padding:2 }}
                    >
                      <Ico.Close />
                    </button>
                  )}
                </div>
                <span style={{ fontSize:10, color:'var(--text-4)', fontFamily:"'DM Mono',monospace", whiteSpace:'nowrap', flexShrink:0 }}>
                  {filtered.length}/{timeline.length}
                </span>
              </div>
            </div>

            {/* Source legend */}
            <div className="filter-legend" style={{
              display:'flex', gap:16, padding:'7px 14px', flexShrink:0,
              background:'var(--surface-2)', borderBottom:'1px solid var(--border)',
              overflowX:'auto'
            }}>
              {activeSrc.map(s => {
                const sc = getSrc(s);
                return (
                  <div key={s} style={{ display:'flex', alignItems:'center', gap:6, flexShrink:0 }}>
                    <div style={{ width:18, height:3, borderRadius:2, background:sc.color, boxShadow:`0 0 5px ${sc.glow}` }} />
                    <span style={{ fontSize:10, color:'var(--text-3)', fontWeight:600 }}>{s}</span>
                  </div>
                );
              })}
              <span style={{ fontSize:10, color:'var(--text-4)', marginLeft:'auto', fontFamily:"'DM Mono',monospace", whiteSpace:'nowrap', flexShrink:0 }}>
                Bar height = articles
              </span>
            </div>

            {/* Timeline canvas */}
            <div style={{ flex:1, overflowY:'auto', padding:'16px 14px 32px' }}>
              {filtered.length === 0 ? (
                <div style={{
                  display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
                  minHeight:240, gap:14, color:'var(--text-4)'
                }}>
                  <div style={{ opacity:.3 }}><Ico.Globe /></div>
                  <div style={{ textAlign:'center' }}>
                    <p style={{ fontSize:13, fontWeight:600, color:'var(--text-3)', marginBottom:4 }}>No clusters found</p>
                    <p style={{ fontSize:12, color:'var(--text-4)', maxWidth:220 }}>
                      {timeline.length === 0
                        ? 'Click Refresh Feeds to ingest the latest news.'
                        : 'Adjust source filters or clear search.'}
                    </p>
                  </div>
                  {timeline.length === 0 && (
                    <button onClick={triggerIngest} disabled={ingesting} className="btn btn-primary" style={{ fontSize:12, marginTop:4 }}>
                      <Ico.Refresh spinning={ingesting} /> Refresh Feeds
                    </button>
                  )}
                </div>
              ) : (
                /* Horizontally scrollable timeline wrapper */
                <div className="tl-scroll-x">
                  <div className="tl-inner">

                    {/* Time axis */}
                    <div style={{ position:'relative', height:38, marginBottom:6, borderBottom:'1px solid var(--border)' }}>
                      {ticks.map((t, i) => (
                        <div key={i} style={{ position:'absolute', left:t.pct, transform:'translateX(-50%)', textAlign:'center' }}>
                          <div style={{ fontSize:10.5, fontWeight:700, color:'var(--text-2)', fontFamily:"'DM Mono',monospace", lineHeight:1 }}>{t.time}</div>
                          <div style={{ fontSize:8.5, color:'var(--text-4)', marginTop:3, fontFamily:"'DM Mono',monospace" }}>{t.date}</div>
                        </div>
                      ))}
                    </div>

                    {/* Column grid lines */}
                    <div style={{ position:'relative' }}>
                      {ticks.map((_, i) => (
                        <div key={i} style={{
                          position:'absolute', left:`${(i / 4) * 100}%`,
                          top:0, width:1, height:filtered.length * 52,
                          background:'var(--border)', opacity:.5, zIndex:0, pointerEvents:'none'
                        }} />
                      ))}

                      {/* Cluster rows */}
                      {filtered.map(c => {
                        const isActive = activeId === c.id;
                        const sc       = getSrc(c.sources[0] ?? '');
                        const geom     = barGeom(c, isActive);
                        return (
                          <div
                            key={c.id}
                            style={{
                              position:'relative', height:52,
                              borderBottom:'1px solid var(--border)',
                              display:'flex', alignItems:'center'
                            }}
                          >
                            {/* Left source stripe */}
                            <div style={{
                              position:'absolute', left:0, top:'50%', transform:'translateY(-50%)',
                              width:3, height:28, background:sc.color, borderRadius:2, opacity:.45
                            }} />

                            <button
                              className={`tl-bar${isActive ? ' active' : ''}`}
                              style={geom}
                              onClick={() => setActiveId(c.id === activeId ? null : c.id)}
                              title={`${c.label}\n${c.articleCount} article${c.articleCount !== 1 ? 's' : ''}\n${fmtClock(c.startTime)} → ${fmtClock(c.endTime)}`}
                              aria-pressed={isActive}
                              aria-label={`Cluster: ${c.label}, ${c.articleCount} articles`}
                            >
                              {isActive && (
                                <div style={{
                                  position:'absolute', left:0, top:0, bottom:0,
                                  width:3, background:'#fff', opacity:.7, borderRadius:'8px 0 0 8px'
                                }} />
                              )}
                              <span className="tl-label" style={{ paddingLeft: isActive ? 8 : 0 }}>
                                {c.label.replace(/\s*\([^)]*\)$/, '')}
                              </span>
                              <span className="tl-count">{c.articleCount}</span>
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* ── Mobile FAB: open selected cluster ── */}
            <AnimatePresence>
              {isMobile && detail && !sheetOpen && (
                <motion.div
                  initial={{ y:80, opacity:0 }}
                  animate={{ y:0, opacity:1 }}
                  exit={{ y:80, opacity:0 }}
                  style={{
                    position:'fixed', bottom:20, left:'50%', transform:'translateX(-50%)',
                    zIndex:150
                  }}
                >
                  <button
                    onClick={() => setSheetOpen(true)}
                    className="btn btn-primary"
                    style={{ borderRadius:99, padding:'10px 22px', gap:8, boxShadow:'0 8px 24px rgba(37,99,235,.4)' }}
                  >
                    <Ico.Layers />
                    {detail.articles.length} articles — view cluster
                    <Ico.ChevRight />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* ─── RIGHT: Desktop sidebar panel ─── */}
          {!isMobile && (
            <div
              className="sidebar-panel"
              style={{
                overflowY:'auto', display:'flex', flexDirection:'column',
                height:'calc(100dvh - 80px)', position:'sticky', top:80,
                background:'var(--surface)'
              }}
              ref={sidebarRef}
            >
              <AnimatePresence mode="wait">
                {detail ? (
                  <motion.div
                    key={detail.id}
                    initial={{ opacity:0, x:14 }}
                    animate={{ opacity:1, x:0 }}
                    exit={{ opacity:0, x:14 }}
                    transition={{ duration:.24, ease:'easeOut' }}
                    style={{ flex:1, display:'flex', flexDirection:'column' }}
                  >
                    <ArticlePanel
                      detail={detail}
                      expandedId={expandedId}
                      setExpandedId={setExpandedId}
                      onClose={() => setActiveId(null)}
                    />
                  </motion.div>
                ) : (
                  <motion.div
                    key="empty-desktop"
                    initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
                    style={{
                      flex:1, display:'flex', flexDirection:'column',
                      alignItems:'center', justifyContent:'center',
                      padding:36, gap:18, color:'var(--text-4)', textAlign:'center'
                    }}
                  >
                    <div style={{ position:'relative', width:80, height:80 }}>
                      <div style={{ position:'absolute', inset:0, borderRadius:'50%', border:'1px solid var(--border)' }} />
                      <div style={{ position:'absolute', inset:14, borderRadius:'50%', border:'1px dashed var(--border)' }} />
                      <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center' }}>
                        <Ico.ChevRight />
                      </div>
                    </div>
                    <div>
                      <p style={{ fontSize:13, fontWeight:600, color:'var(--text-3)', marginBottom:5, fontFamily:"'DM Serif Display',serif", fontStyle:'italic' }}>
                        Select a cluster
                      </p>
                      <p style={{ fontSize:12, color:'var(--text-4)', lineHeight:1.65, maxWidth:200 }}>
                        Click any bar on the timeline to read articles and compare source coverage.
                      </p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>

        {/* ── MOBILE BOTTOM SHEET ── */}
        <AnimatePresence>
          {isMobile && sheetOpen && detail && (
            <>
              {/* Backdrop */}
              <motion.div
                key="sheet-backdrop"
                initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
                onClick={() => setSheetOpen(false)}
                style={{
                  position:'fixed', inset:0, zIndex:190,
                  background:'rgba(0,0,0,.4)', backdropFilter:'blur(4px)',
                  WebkitBackdropFilter:'blur(4px)'
                }}
              />

              {/* Sheet panel */}
              <motion.div
                key="sheet-panel"
                className="bottom-sheet"
                initial={{ y:'100%' }}
                animate={{ y:0 }}
                exit={{ y:'100%' }}
                transition={{ type:'spring', damping:30, stiffness:280 }}
                style={{ zIndex:195 }}
              >
                {/* Drag handle */}
                <div className="bottom-sheet-drag" onClick={() => setSheetOpen(false)} />

                {/* Content */}
                <div
                  ref={sheetRef}
                  style={{ flex:1, overflowY:'auto', display:'flex', flexDirection:'column' }}
                >
                  <ArticlePanel
                    detail={detail}
                    expandedId={expandedId}
                    setExpandedId={setExpandedId}
                    onClose={() => { setSheetOpen(false); setActiveId(null); }}
                  />
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>

        {/* ══ FOOTER ══ */}
        <footer style={{
          background:'var(--surface)', borderTop:'1px solid var(--border)',
          padding:'10px 16px',
          display:'flex', alignItems:'center', justifyContent:'space-between',
          flexWrap:'wrap', gap:8, flexShrink:0
        }}>
          <span style={{ fontSize:10, color:'var(--text-4)', fontFamily:"'DM Mono',monospace", letterSpacing:'.04em' }}>
            NEWS<strong>PULSE</strong> — TF-IDF Cosine Topic Clustering
          </span>
          <div style={{ display:'flex', alignItems:'center', gap:14, flexWrap:'wrap' }}>
            {(['BBC News', 'NPR', 'Al Jazeera'] as const).map(s => {
              const sc = getSrc(s);
              return (
                <span key={s} style={{ fontSize:10, color:sc.color, fontWeight:600, display:'flex', alignItems:'center', gap:4 }}>
                  <span style={{ width:5, height:5, borderRadius:'50%', background:sc.dot, display:'block' }} />
                  {s}
                </span>
              );
            })}
          </div>
        </footer>
      </div>
    </>
  );
}
