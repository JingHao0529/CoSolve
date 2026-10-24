import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties, FormEvent, PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { Link, Route, Switch, useLocation, useParams } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { useClerk, useUser } from '@clerk/react';
import { ThemeToggle } from '@/components/theme-toggle';
import { CsvImportPanel } from '@/components/csv-import-panel';
import { DeleteClosedCases } from '@/components/delete-closed-cases';
import { EmailResponseDialog } from '@/components/email-response-dialog';
import { CaseMessage } from '@/components/case-message';
import { ResolutionGuidancePanel } from '@/components/resolution-guidance-panel';
import {
  ApprovedCaseStatusPanel,
  ApprovedCompensationSummary,
  CustomerResponsePanel,
  deriveApprovedCompensationDisplay,
} from '@/components/approved-case-controls';
import {
  Activity, AlertCircle, ArrowRight, BadgeCheck, Bell, Check, CheckCircle2, Clock3, FileText,
  Filter, Inbox, LayoutDashboard, LifeBuoy, ListChecks, Menu, MessageSquare, PanelLeftClose, PanelLeftOpen, Plus, Search, Shield,
   Users, Wallet, X, ChartNoAxesCombined, CircleDollarSign, ClipboardList, RefreshCw,
} from 'lucide-react';
import {
  useGetDashboard, getGetDashboardQueryKey, useGetAnalytics, getGetAnalyticsQueryKey,
  useListComplaints, getListComplaintsQueryKey, useCreateComplaint, useGetComplaint,
  getGetComplaintQueryKey, useUpdateComplaint, useClassifyComplaint, useRecommendResolution,
  useDraftResponse, useListCustomers, getListCustomersQueryKey, useGetCustomer,
  getGetCustomerQueryKey, useListAuditLog, getListAuditLogQueryKey, useListPolicies,
  getListPoliciesQueryKey, useCreatePolicy, useUpdatePolicy,
  useApproveComplaint,
  useRequestCompensationAdjustment, useReviewCompensationAdjustment,
  useListPendingCompensationAdjustments, getListPendingCompensationAdjustmentsQueryKey,
} from '@workspace/api-client-react';
import {
  complaintInputFromForm,
} from '../lib/complaint-intake';
import { mutationErrorMessage } from '../lib/mutation-error-message';
const nav = [
  { href: '/', label: 'Overview', icon: LayoutDashboard },
  { href: '/inbox', label: 'Complaint inbox', icon: Inbox },
  { href: '/customers', label: 'Customers', icon: Users },
  { href: '/analytics', label: 'Analytics', icon: ChartNoAxesCombined },
  { href: '/audit-log', label: 'Audit log', icon: ClipboardList },
  { href: '/policies', label: 'Policies', icon: Shield },
];
const money = (v?: number) => `${(v ?? 0) < 0 ? '−' : ''}$${Math.abs(v ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const shortDate = (v?: string) => v ? new Date(v).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '—';
const tone = (v = '') => /urgent|critical|high|negative|overdue/i.test(v) ? 'red' : /pending|medium|monitor|approval/i.test(v) ? 'amber' : /resolved|approved|active|positive|delivered/i.test(v) ? 'green' : 'blue';
const DEFAULT_SIDEBAR_WIDTH = 248;
const MIN_SIDEBAR_WIDTH = 208;
const MAX_SIDEBAR_WIDTH = 336;
const SIDEBAR_WIDTH_KEY = 'cosolve-sidebar-width';
const SIDEBAR_COLLAPSED_KEY = 'cosolve-sidebar-collapsed';

function clampSidebarWidth(width: number) {
  return Math.max(MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, width));
}

function storedSidebarWidth() {
  try {
    const savedWidth = Number(localStorage.getItem(SIDEBAR_WIDTH_KEY));
    return Number.isFinite(savedWidth) && savedWidth > 0
      ? clampSidebarWidth(savedWidth)
      : DEFAULT_SIDEBAR_WIDTH;
  } catch {
    return DEFAULT_SIDEBAR_WIDTH;
  }
}

function storedSidebarCollapsed() {
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true';
  } catch {
    return false;
  }
}

function Badge({ children, color }: { children: ReactNode; color?: string }) {
  return <span className={`badge ${color || tone(String(children))}`}>{children}</span>;
}
function SectionTitle({ eyebrow, title, detail, action }: { eyebrow?: string; title: string; detail?: string; action?: ReactNode }) {
  return <div className="page-head flex flex-wrap items-end justify-between gap-4 mb-7 md:mb-8"><div className="min-w-0">{eyebrow && <div className="eyebrow mb-2">{eyebrow}</div>}<h1 className="display text-[30px] md:text-[38px] leading-[1.08]">{title}</h1>{detail && <p className="text-[15px] text-ink-soft mt-2 max-w-xl">{detail}</p>}</div>{action}</div>;
}
function Loading() { return <div className="space-y-3" aria-busy="true" aria-label="Loading">{[1,2,3].map(i => <div key={i} className="skeleton h-20" style={{ animationDelay: `${i * 120}ms` }} />)}</div>; }
function QueryState({ loading, error, retry }: { loading?: boolean; error?: boolean; retry?: () => void }) {
  if (loading) return <Loading />;
  if (error) return <div className="panel p-10 text-center"><div className="mx-auto mb-3 w-11 h-11 rounded-full bg-danger-soft text-danger grid place-items-center"><AlertCircle size={20} /></div><p className="font-semibold text-ink">This view could not load</p><p className="text-sm text-ink-soft mt-1">Check the connection, then try again.</p><button className="btn-quiet mt-5 text-sm inline-flex items-center gap-2" onClick={retry}><RefreshCw size={14}/>Retry</button></div>;
  return null;
}
function Metric({ label, value, note, icon: Icon, accent = 'blue' }: { label: string; value: string; note?: string; icon: typeof Wallet; accent?: string }) {
  const color = accent === 'green' ? 'text-ok' : accent === 'amber' ? 'text-warn' : 'text-brand';
  return <div className="metric px-4 py-4 md:px-5 min-w-0"><div className="flex items-center justify-between gap-3"><span className="text-[13px] text-ink-soft font-medium truncate">{label}</span><Icon size={16} className={`${color} shrink-0`} strokeWidth={1.8} /></div><div className="num text-[26px] md:text-[28px] font-semibold tracking-[-.03em] mt-2 text-ink truncate">{value}</div>{note && <div className="text-[13px] text-ink-faint mt-1 leading-snug">{note}</div>}</div>;
}
function ComplaintTable({ rows }: { rows: any[] }) {
  if (!rows?.length) return <div className="py-14 text-center"><div className="mx-auto mb-3 w-12 h-12 rounded-full bg-brand-soft text-brand grid place-items-center"><Inbox size={20} /></div><p className="font-medium text-ink">No complaints to show</p><p className="text-sm text-ink-faint mt-1">Import a CSV or XLSX file to add complaints to the inbox.</p><Link href="/inbox" className="link text-sm inline-block mt-3">Import CSV / XLSX</Link></div>;
  return <div className="table-wrap"><table><thead><tr><th>Case / customer</th><th>Issue</th><th>Priority</th><th>Status</th><th>Amount</th><th>Received</th></tr></thead><tbody>{rows.map((c: any) => <tr key={c.id}><td><Link href={`/cases/${c.id}`} className="font-semibold text-ink hover:text-brand transition-colors">{c.customerName}</Link><div className="mono text-[11.5px] text-ink-faint mt-0.5">{c.id}</div></td><td className="max-w-[340px]"><Link href={`/cases/${c.id}`} className="text-ink hover:text-brand transition-colors line-clamp-1">{c.subject}</Link><div className="text-xs text-ink-faint mt-0.5">{c.category || c.source}</div></td><td><Badge>{c.urgency || 'Normal'}</Badge></td><td><Badge>{c.status}</Badge></td><td className="num">{money(c.recommendedAmount)}</td><td className="text-ink-soft whitespace-nowrap">{shortDate(c.createdAt)}</td></tr>)}</tbody></table></div>;
}

export function AppShell() {
  const [path, navigate] = useLocation();
  const [mobileNav, setMobileNav] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(storedSidebarWidth);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(storedSidebarCollapsed);
  const [resizingSidebar, setResizingSidebar] = useState(false);
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const { isLoaded, user } = useUser();
  const { signOut } = useClerk();
  const compactSidebar = sidebarCollapsed && !mobileNav;
  const sidebarStyle = { '--sidebar-width': `${compactSidebar ? 72 : sidebarWidth}px` } as CSSProperties;
  useEffect(() => {
    const timeout = window.setTimeout(() => {
      try { localStorage.setItem(SIDEBAR_WIDTH_KEY, String(sidebarWidth)); } catch {}
    }, 120);
    return () => window.clearTimeout(timeout);
  }, [sidebarWidth]);
  useEffect(() => {
    try { localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(sidebarCollapsed)); } catch {}
  }, [sidebarCollapsed]);
  const resizeSidebar = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      setSidebarWidth(clampSidebarWidth(event.clientX));
    }
  };
  const handleResizeKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    setSidebarWidth((width) => clampSidebarWidth(width + (event.key === 'ArrowRight' ? 12 : -12)));
  };
  const isManager = isLoaded && Boolean(user);
  const visibleNav = nav;
  const isActive = (href: string) => href === '/' ? path === '/' : path.startsWith(href);
  return <div className={`app-shell min-h-[100dvh] bg-paper text-ink${resizingSidebar ? ' sidebar-resizing' : ''}`} style={sidebarStyle}>
    <aside className={`app-sidebar fixed z-40 inset-y-0 left-0 bg-rail border-r border-line flex flex-col md:translate-x-0 ${mobileNav ? 'translate-x-0' : '-translate-x-full'}`}>
      <div className={`flex items-center ${compactSidebar ? 'h-auto px-2 py-3 flex-col gap-3' : 'h-[72px] px-5 justify-between'}`}>
        <Link href="/" aria-label="CoSolve home" title={compactSidebar ? 'CoSolve' : undefined} className={`flex items-center ${compactSidebar ? 'justify-center' : 'gap-3'} rounded-lg`} onClick={() => setMobileNav(false)}>
          <span className="brand-mark" aria-hidden="true"><span/></span><span className={`display text-[22px] leading-none ${compactSidebar ? 'md:hidden' : ''}`}>CoSolve</span>
        </Link>
        <div className={`flex items-center gap-1 ${compactSidebar ? 'flex-col' : ''}`}><ThemeToggle/><button type="button" className="hidden md:grid w-9 h-9 place-items-center rounded-lg text-ink-soft hover:bg-sunk hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand" onClick={() => setSidebarCollapsed((collapsed) => !collapsed)} aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-expanded={!sidebarCollapsed} title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}>{sidebarCollapsed ? <PanelLeftOpen size={17}/> : <PanelLeftClose size={17}/>}</button><button className="md:hidden p-1.5 rounded-full text-ink-soft hover:bg-sunk" onClick={() => setMobileNav(false)} aria-label="Close menu"><X size={17}/></button></div>
      </div>
      <nav aria-label="Main navigation" className="px-3 space-y-0.5">{visibleNav.map(({ href, label, icon: Icon }) => <Link key={href} href={href} title={compactSidebar ? label : undefined} aria-current={isActive(href) ? 'page' : undefined} className={`navlink ${compactSidebar ? 'md:justify-center md:gap-0 md:px-2' : ''} ${isActive(href) ? 'active' : ''}`} onClick={() => setMobileNav(false)}><Icon size={17} strokeWidth={1.8} /><span className={compactSidebar ? 'md:sr-only' : ''}>{label}</span></Link>)}</nav>
      <div className={`${compactSidebar ? 'p-3' : 'p-4'} mt-auto`}>
        <div
          className={`rounded-xl bg-surface border border-line flex items-center ${compactSidebar ? 'justify-center p-1.5' : 'gap-3 p-3'}`}
          title={compactSidebar ? `${user?.fullName || user?.primaryEmailAddress?.emailAddress || (isLoaded ? 'Guest' : 'Loading')} · ${isManager ? 'Manager' : user ? 'Staff' : 'Staff workspace'}` : undefined}
        >
          <div className="w-9 h-9 shrink-0 rounded-full bg-brand-soft text-brand grid place-items-center text-xs font-bold">
            {user?.firstName?.slice(0, 1) || (isLoaded ? 'S' : '…')}
          </div>
          <div className={`min-w-0 flex-1 ${compactSidebar ? 'md:hidden' : ''}`}>
            <div className="text-sm font-semibold text-ink truncate">
              {user?.fullName || user?.primaryEmailAddress?.emailAddress || (isLoaded ? 'Guest' : 'Loading')}
            </div>
            <div className="text-xs text-ink-faint">
              {isManager ? 'Manager' : user ? 'Staff' : 'Staff workspace'}
            </div>
          </div>
          {user
            ? <button className={`btn-quiet p-2 text-xs ${compactSidebar ? 'md:hidden' : ''}`} onClick={() => signOut({ redirectUrl: import.meta.env.BASE_URL })}>Sign out</button>
            : <Link href="/sign-in" className={`btn-quiet p-2 text-xs ${compactSidebar ? 'md:hidden' : ''}`}>Sign in</Link>}
        </div>
      </div>
      <div
        role="separator"
        aria-label="Resize sidebar"
        aria-orientation="vertical"
        aria-valuemin={MIN_SIDEBAR_WIDTH}
        aria-valuemax={MAX_SIDEBAR_WIDTH}
        aria-valuenow={sidebarWidth}
        aria-valuetext={`${sidebarWidth} pixels`}
        tabIndex={0}
        title="Drag to resize · use arrow keys · double-click to reset"
        className="sidebar-resize-handle"
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          setResizingSidebar(true);
        }}
        onPointerMove={resizeSidebar}
        onPointerUp={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
          setResizingSidebar(false);
        }}
        onPointerCancel={() => setResizingSidebar(false)}
        onDoubleClick={() => setSidebarWidth(DEFAULT_SIDEBAR_WIDTH)}
        onKeyDown={handleResizeKey}
      />
    </aside>
    {mobileNav && <button aria-label="Close menu" onClick={() => setMobileNav(false)} className="fixed inset-0 bg-black/35 backdrop-blur-[2px] z-30 md:hidden" />}
    <div className="app-content min-h-[100dvh] flex flex-col">
      <header className="h-[64px] bg-paper/85 backdrop-blur-md sticky top-0 z-20 flex items-center justify-between px-4 md:px-8 border-b border-line/70">
        <div className="flex items-center gap-2 min-w-0"><button className="md:hidden p-2 -ml-1 rounded-full text-ink-soft hover:bg-sunk" onClick={() => setMobileNav(true)} aria-label="Open menu"><Menu size={19}/></button><div className="hidden sm:block text-sm text-ink-faint truncate">Workspace <span className="mx-1.5 text-line-strong">/</span><span className="text-ink font-medium">{visibleNav.find(n => isActive(n.href))?.label || (path.startsWith('/adjustments') ? 'Adjustment review' : path.startsWith('/cases') ? 'Investigation' : path.startsWith('/submit') ? 'New complaint' : 'Customer record')}</span></div></div>
        <div className="flex items-center gap-2 md:gap-3">
          <div className="relative"><Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none"/><input className="search-input w-[160px] md:w-[280px]" placeholder="Search cases or customers" value={search} onFocus={() => setSearchOpen(true)} onBlur={() => setTimeout(() => setSearchOpen(false), 150)} onChange={e => setSearch(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { setSearchOpen(false); navigate(`/inbox?search=${encodeURIComponent(search)}`); } }} />{searchOpen && search.length > 0 && <div className="absolute right-0 top-12 w-72 panel pop p-1.5 z-30"><Link href={`/inbox?search=${encodeURIComponent(search)}`} onClick={() => setSearchOpen(false)} className="menu-item"><Inbox size={14}/>Search inbox for “{search}”</Link><Link href="/customers" onClick={() => setSearchOpen(false)} className="menu-item"><Users size={14}/>Search customer records</Link></div>}</div>
          <button className="icon-btn relative" aria-label="Notifications" onClick={() => alert('You are up to date on workspace notifications.')}><Bell size={16}/><i className="absolute top-2 right-2 w-1.5 h-1.5 bg-clay rounded-full"/></button>
        </div>
      </header>
      <main className="flex-1 w-full max-w-[1360px] mx-auto px-4 py-6 md:px-8 md:py-9 page-enter" key={path}>
        <Switch>
          <Route path="/" component={DashboardPage}/>
          <Route path="/inbox" component={InboxPage}/>
          <Route path="/cases/:id" component={CasePage}/>
          <Route path="/submit" component={SubmitPage}/>
          <Route path="/audit-log" component={AuditPage}/>
          <Route path="/analytics" component={AnalyticsPage}/>
          <Route path="/customers" component={CustomersPage}/>
          <Route path="/customers/:id" component={CustomerPage}/>
          <Route path="/policies" component={PoliciesPage}/>
          <Route><div className="panel p-14 text-center max-w-lg mx-auto mt-10"><div className="display text-[56px] text-brand leading-none">404</div><h1 className="text-xl font-semibold mt-3">This page has wandered off</h1><p className="text-sm text-ink-soft mt-1">The link may be outdated or mistyped.</p><Link href="/" className="btn-primary mt-6 inline-flex items-center gap-2 text-sm">Return to overview <ArrowRight size={14}/></Link></div></Route>
        </Switch>
      </main>
      <footer className="px-5 md:px-8 py-4 flex justify-between text-xs text-ink-faint"><span className="inline-flex items-center gap-2"><i className="w-1.5 h-1.5 bg-ok rounded-full"/>CoSolve · all systems running</span><span className="hidden sm:block">Every decision is recorded in the audit log</span></footer>
    </div>
  </div>;
}

function DashboardPage() {
  const q = useGetDashboard({ query: { queryKey: getGetDashboardQueryKey(), refetchInterval: 15_000 } });
  const complaints = useListComplaints(undefined, { query: { queryKey: getListComplaintsQueryKey() } });
  const { user } = useUser();
  const d: any = q.data;
  return <><SectionTitle eyebrow="Operations overview · Today" title={user?.firstName ? `Good morning, ${user.firstName}` : 'Customer support overview'} detail="A clear view of what needs attention across customer resolution."/>
    <QueryState loading={q.isLoading || complaints.isLoading} error={q.isError || complaints.isError} retry={() => { q.refetch(); complaints.refetch(); }}/>
    {d && <><div className="metric-strip grid grid-cols-2 xl:grid-cols-4 gap-3 md:gap-4 mb-5">
      <Metric label="Open cases" value={String(d.openCases ?? 0)} note={`${d.priorityCount ?? 0} need priority review`} icon={Inbox} accent="amber"/>
      <Metric label="Awaiting approval" value={String(d.pendingApprovals ?? 0)} note="Resolution offers to review" icon={BadgeCheck}/>
      <Metric label="Refund exposure" value={money(d.refundExposure)} note="Across active investigations" icon={CircleDollarSign} accent="amber"/>
      <Metric label="Customer satisfaction" value={`${d.csat ?? 0}%`} note={`${d.avgResolutionHours ?? 0}h average resolution`} icon={Activity} accent="green"/>
    </div><div className="grid xl:grid-cols-[1.55fr_1fr] gap-4">
      <section className="panel p-4 md:p-5"><div className="flex items-start justify-between mb-5"><div><div className="eyebrow">Case volume</div><h2 className="text-lg font-semibold mt-1">Complaint activity</h2></div><Link href="/analytics" className="text-xs text-brand inline-flex items-center gap-1">View analytics <ArrowRight size={13}/></Link></div><div className="activity-chart flex items-end gap-2 h-40 px-1 border-b border-line">{(d.trends || []).map((p: any, i: number) => <div className="flex-1 h-full flex flex-col justify-end items-center gap-2" key={p.label || i}><div className="w-full max-w-11 bg-brand/85 rounded-t-md min-h-1" style={{height:`${Math.min(100, Math.max(8, p.complaints * 6))}%`}} title={`${p.complaints} complaints`}/><span className="text-[11px] text-ink-faint mb-2">{p.label}</span></div>)}</div><div className="flex gap-5 mt-4 text-xs text-ink-soft"><span><i className="inline-block w-2 h-2 bg-brand mr-2 rounded-sm"/>Complaints</span><span><i className="inline-block w-2 h-2 bg-clay mr-2 rounded-sm"/>Monthly refunds {money(d.monthlyRefunds)}</span></div></section>
      <section className="panel p-4 md:p-5"><div className="flex justify-between items-start mb-3"><div><div className="eyebrow">Needs attention</div><h2 className="text-lg font-semibold mt-1">Priority queue</h2></div><Badge color="amber">{d.priorityCount ?? 0} cases</Badge></div><div className="space-y-2">{(complaints.data || []).filter((c: any) => /high|critical|urgent/i.test(c.urgency || '') || /pending/i.test(c.status || '')).slice(0,4).map((c: any) => <Link key={c.id} href={`/cases/${c.id}`} className="subpanel p-3 block hover:border-line-strong"><div className="flex justify-between gap-2"><span className="text-sm font-medium truncate">{c.customerName}</span><Badge>{c.urgency}</Badge></div><div className="text-xs text-ink-soft truncate mt-1">{c.subject}</div><div className="flex justify-between mt-2 text-xs mono text-ink-faint"><span>{c.id}</span><span>{shortDate(c.createdAt)}</span></div></Link>)}{!(complaints.data || []).some((c: any) => /high|critical|urgent/i.test(c.urgency || '') || /pending/i.test(c.status || '')) && <p className="py-8 text-center text-sm text-ink-faint">No priority cases right now.</p>}</div><Link href="/inbox" className="btn-quiet w-full mt-3 block text-center text-xs">Open complaint inbox</Link></section>
     </div></>}
  </>;
}

function InboxPage() {
  const [filter, setFilter] = useState('All complaints');
  const [search, setSearch] = useState('');
  const params = useMemo(() => ({ ...(filter === 'Pending approvals' ? { status: 'Pending approval' } : {}), ...(search ? { search } : {}) }), [filter, search]);
  const q = useListComplaints(params, { query: { queryKey: getListComplaintsQueryKey(params), refetchInterval: 15_000 } });
  const allq = useListComplaints(undefined, { query: { queryKey: getListComplaintsQueryKey(), refetchInterval: 15_000 } });
  const rows = (q.data || []).filter((c: any) => filter !== 'Priority queue' || /high|critical|urgent/i.test(c.urgency || ''));
  return <><SectionTitle eyebrow="Triage & settlement desk" title="Complaint inbox" detail="Import complaints from CSV or XLSX files, then review and resolve them in one place."/>
    <QueryState loading={q.isLoading || allq.isLoading} error={q.isError || allq.isError} retry={() => { q.refetch(); allq.refetch(); }}/>
    <CsvImportPanel/>
    <DeleteClosedCases closedCount={(allq.data || []).filter((caseFile: any) => caseFile.status === 'Closed').length}/>
    <div className="panel p-3 md:p-4 mb-4 flex flex-col md:flex-row md:items-center justify-between gap-3"><div className="seg-group overflow-x-auto">{['All complaints','Priority queue','Pending approvals'].map((f,i)=><button key={f} onClick={()=>setFilter(f)} className={`seg ${filter===f?'on':''}`}>{f}<span className="seg-count">{i===0?(allq.data||[]).length:i===1?(allq.data||[]).filter((c:any)=>/high|critical|urgent/i.test(c.urgency||'')).length:(allq.data||[]).filter((c:any)=>/pending/i.test(c.status||'')).length}</span></button>)}</div><label className="relative md:w-64"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint"/><input className="ui-input !py-2 !pl-9 text-xs" placeholder="Filter by customer or subject" value={search} onChange={e=>setSearch(e.target.value)}/></label></div>
    <div className="panel overflow-hidden"><div className="p-4 border-b border-line flex items-center justify-between"><div className="font-semibold">{filter}<span className="text-xs text-ink-faint font-normal ml-2">{rows.length} cases</span></div><div className="mono text-xs text-ink-faint flex items-center gap-2"><Filter size={13}/> Live queue</div></div><ComplaintTable rows={rows}/></div>
  </>;
}

function CasePage() {
  const { id = '' } = useParams<{id:string}>();
  const q = useGetComplaint(id, { query: { queryKey: getGetComplaintQueryKey(id), enabled: !!id } });
  const client = useQueryClient();
  const [classification, setClassification] = useState<any>(null);
  const [recommendation, setRecommendation] = useState<any>(null);
  const [draft, setDraft] = useState('');
  const [emailOpen, setEmailOpen] = useState(false);
  const [adjustmentType, setAdjustmentType] = useState('');
  const [adjustmentAmount, setAdjustmentAmount] = useState('');
  const [adjustmentRationale, setAdjustmentRationale] = useState('');
  const [adjustmentReviewNote, setAdjustmentReviewNote] = useState('');
  const update = useUpdateComplaint();
  const approve = useApproveComplaint();
  const requestAdjustment = useRequestCompensationAdjustment();
  const reviewAdjustment = useReviewCompensationAdjustment();
  const classify = useClassifyComplaint();
  const recommend = useRecommendResolution();
  const draftResponse = useDraftResponse();
  const { isLoaded: authLoaded, user } = useUser();
  const isManager = authLoaded && Boolean(user);
  const invalidate = () => { client.invalidateQueries({queryKey:getGetComplaintQueryKey(id)}); client.invalidateQueries({queryKey:getListComplaintsQueryKey()}); client.invalidateQueries({queryKey:getGetDashboardQueryKey()}); client.invalidateQueries({queryKey:getGetAnalyticsQueryKey()}); client.invalidateQueries({queryKey:getListAuditLogQueryKey()}); client.invalidateQueries({queryKey:getListCustomersQueryKey()}); if (q.data?.customerId) client.invalidateQueries({queryKey:getGetCustomerQueryKey(q.data.customerId)}); };
  const cacheCase = (next: unknown) => client.setQueryData(getGetComplaintQueryKey(id), (previous: any) => ({ ...previous, ...(next as object) }));
  const c: any = q.data;
  const approvedCompensation: any = (c?.compensationHistory || []).find((entry: any) => entry.status === 'Approved');
  const approvedAdjustments: any[] = (c?.compensationAdjustments || []).filter((entry: any) => entry.status === 'Approved');
  const compensationDisplay = approvedCompensation
    ? deriveApprovedCompensationDisplay(approvedCompensation, c?.compensationAdjustments || [])
    : null;
  const finalCompensation = compensationDisplay?.finalCompensation || approvedCompensation;
  const pendingAdjustment: any = (c?.compensationAdjustments || []).find((entry: any) => entry.status === 'Pending review');
  useEffect(() => { setRecommendation(null); setClassification(null); }, [id]);
  useEffect(() => {
    if (!finalCompensation) return;
    setAdjustmentType(finalCompensation.type);
    setAdjustmentAmount(String(finalCompensation.amount));
    setAdjustmentRationale('');
    setAdjustmentReviewNote('');
  }, [id, finalCompensation?.type, finalCompensation?.amount]);
  useEffect(() => {
    setDraft(c?.responseDraft ?? '');
  }, [id, c?.responseDraft]);
  const updateError = update.isError
    ? mutationErrorMessage(update.error, 'Update failed. Please try again.')
    : '';
  const aiErrors = [
    classify.isError ? mutationErrorMessage(classify.error, 'Runpod / Grafilab classification failed. Try again.') : '',
    recommend.isError ? mutationErrorMessage(recommend.error, 'Grafilab could not generate a recommendation. Try again.') : '',
    draftResponse.isError ? mutationErrorMessage(draftResponse.error, 'Grafilab could not draft a response. Try again.') : '',
  ].filter(Boolean);
  const adjustmentError = requestAdjustment.isError
    ? mutationErrorMessage(requestAdjustment.error, 'Unable to request an adjustment.')
    : reviewAdjustment.isError
      ? mutationErrorMessage(reviewAdjustment.error, 'Unable to review the adjustment.')
      : '';
  const save = (data: any) => update.mutate({id, data}, {onSuccess: invalidate});
  if (q.isLoading) return <><SectionTitle title="Case investigation"/><Loading/></>;
  if (q.isError || !c) return <><SectionTitle title="Case investigation"/><QueryState error retry={()=>q.refetch()}/></>;
  return <><div className="flex flex-wrap justify-between gap-4 mb-5"><div><div className="flex gap-2 items-center mono text-xs text-ink-faint"><span className="text-brand">{c.id}</span><Badge>{c.status}</Badge></div><h1 className="text-2xl font-semibold mt-2">{c.subject}</h1><p className="text-sm text-ink-soft mt-1">Customer <Link href={`/customers/${c.customerId}`} className="text-brand hover:underline">{c.customerName}</Link> · {c.source} · Received {shortDate(c.createdAt)}</p></div><div className="flex gap-2"><button className="btn-quiet inline-flex items-center gap-2 text-xs" disabled={classify.isPending} onClick={()=>classify.mutate({id},{onSuccess:r=>{setClassification(r);invalidate();}})}><Activity size={14}/>{classify.isPending?'Reviewing…':'Classify with AI'}</button><Link href="/inbox" className="btn-quiet inline-flex items-center gap-2 text-xs">Back to inbox</Link></div></div>
    {aiErrors.map((error, index) => <div key={index} role="alert" className="panel p-4 mb-4 text-sm text-danger">{error}</div>)}
    <p className="text-xs text-ink-faint mb-4">Runpod provides sentiment; Grafilab provides the case assessment, recommendations and response drafts. Assessment confidence and Runpod sentiment confidence are recorded separately in the audit log.</p>
    <div className="grid xl:grid-cols-[1.25fr_.75fr] gap-4 items-start"><div className="space-y-4">
      <section className="panel case-paper p-5 md:p-6">
        <div className="flex justify-between items-center mb-3"><h2 className="font-semibold">Customer statement</h2><Badge>{c.sentiment || 'Sentiment unknown'}</Badge></div>
        <div className="case-quote text-[15px] leading-7 text-ink-soft bg-sunk border border-line p-4 rounded-md"><CaseMessage message={c.message}/></div>
        <div className="grid sm:grid-cols-3 gap-3 mt-4"><div className="subpanel p-3"><div className="field-label">Channel</div><div className="mt-1 text-sm">{c.source}</div></div><div className="subpanel p-3"><div className="field-label">Order</div><div className="mt-1 text-sm">{c.orderId || 'Not linked'}</div></div><div className="subpanel p-3"><div className="field-label">Order value</div><div className="mt-1 text-sm mono">{money(c.orderValue)}</div></div></div>
      </section>
       <section className="panel p-5"><div className="flex justify-between items-start gap-3"><div><div className="eyebrow">Investigation</div><h2 className="font-semibold mt-1">Case assessment</h2></div><Badge>{c.urgency || 'Normal'}</Badge></div><div className="grid sm:grid-cols-2 gap-3 mt-4"><div className="subpanel p-3"><div className="field-label">Category</div><div className="mt-1">{classification?.category || c.category || 'Unclassified'}</div></div><div className="subpanel p-3"><div className="field-label">Root cause</div><div className="mt-1">{classification?.rootCause || c.rootCause || 'Needs investigation'}</div></div><div className="subpanel p-3"><div className="field-label">Confidence</div><div className="mt-1 mono">{classification?.confidence != null ? `${Math.round(classification.confidence * 100)}%` : c.confidence != null ? `${Math.round(c.confidence * 100)}%` : '—'}</div></div><div className="subpanel p-3"><div className="field-label">Assigned to</div><input className="ui-input mt-1 !py-1.5 text-sm" defaultValue={c.assignedTo || ''} placeholder="Assign teammate" onBlur={e=>e.target.value!==c.assignedTo&&save({assignedTo:e.target.value})}/></div></div>{classification && <div className="mt-3 bg-ok/[.07] border border-ok/25 rounded p-3 text-sm"><div className="text-ok text-xs mb-1">AI summary · {Math.round(classification.confidence * 100)}% confidence</div>{classification.summary}</div>}</section>
      <section className="panel p-5"><div className="flex items-center justify-between"><div><div className="eyebrow">Customer context</div><h2 className="font-semibold mt-1">Related order & history</h2></div><Link href={`/customers/${c.customerId}`} className="text-xs text-brand">View profile <ArrowRight size={13} className="inline ml-1"/></Link></div><div className="mt-4 space-y-2">{(c.orders||[]).map((o:any)=><div key={o.id} className="subpanel p-3 flex justify-between text-sm"><div><span className="mono text-brand">{o.id}</span><p className="text-xs text-ink-faint mt-1">{(o.items||[]).join(', ')} · {shortDate(o.date)}</p></div><div className="text-right"><div className="mono">{money(o.total)}</div><Badge>{o.status}</Badge></div></div>)}{!(c.orders||[]).length && <div className="text-sm text-ink-faint">No linked order history.</div>}</div></section>
      <section className="panel timeline-panel p-5"><h2 className="font-semibold mb-4">Case timeline</h2>{(c.history||[]).length ? <div className="space-y-4 border-l border-line ml-2 pl-5">{c.history.map((e:any)=><div className="relative" key={e.id}><span className="absolute -left-[25px] top-1 w-2 h-2 rounded-full bg-brand ring-4 ring-surface"/><div className="flex justify-between gap-2 text-sm"><span>{e.action}</span><span className="mono text-xs text-ink-faint">{shortDate(e.createdAt)}</span></div><div className="text-xs text-ink-faint mt-1">{e.details} · {e.actor}</div></div>)}</div> : <p className="text-sm text-ink-faint">No case history recorded yet.</p>}</section>
    </div><div className="space-y-4">
       {approvedCompensation ? (
       <ApprovedCompensationSummary
         approvedCompensation={approvedCompensation}
         finalCompensation={finalCompensation}
         netAdjustment={compensationDisplay?.netAdjustment ?? null}
         resolutionNote={c.resolutionNote || ''}
         onSave={save}
       >
       {approvedCompensation && <div className="mt-4 border-t border-line pt-4">
           <div className="eyebrow">Reviewed corrections</div>
           <h3 className="font-medium text-sm mt-1">Adjustment history</h3>
           {approvedAdjustments.length > 0
             ? <div className="space-y-2 mt-3">{approvedAdjustments.map((adjustment: any) => <div key={adjustment.id} className="subpanel p-3 text-xs">
               <div className="flex justify-between gap-2"><span className="font-medium">{adjustment.type} · {money(adjustment.amount)}</span><span className="mono text-ink-faint">{adjustment.amountDelta >= 0 ? '+' : '−'}{money(Math.abs(adjustment.amountDelta))}</span></div>
               <p className="text-ink-soft mt-2">{adjustment.rationale}</p>
               <p className="text-ink-faint mt-2">Reviewed by {adjustment.reviewer || 'Manager'} · {shortDate(adjustment.reviewedAt || adjustment.date)}{adjustment.reviewNote ? ` · ${adjustment.reviewNote}` : ''}</p>
             </div>)}</div>
             : <p className="text-xs text-ink-faint mt-2">No corrections have been reviewed.</p>}
           {(c.compensationAdjustments || []).filter((adjustment: any) => adjustment.status === 'Rejected').map((adjustment: any) => <div key={adjustment.id} className="subpanel p-3 text-xs mt-2">
             <div className="flex justify-between gap-2"><span className="font-medium">{adjustment.type} · {money(adjustment.amount)}</span><Badge>{adjustment.status}</Badge></div>
             <p className="text-ink-soft mt-2">{adjustment.rationale}</p>
             <p className="text-ink-faint mt-2">Reviewed by {adjustment.reviewer || 'Manager'} · {shortDate(adjustment.reviewedAt || adjustment.date)}{adjustment.reviewNote ? ` · ${adjustment.reviewNote}` : ''}</p>
           </div>)}
           {pendingAdjustment && <div className="subpanel p-3 mt-3">
             <div className="flex justify-between gap-2"><span className="text-sm font-medium">Awaiting manager review</span><Badge>{pendingAdjustment.status}</Badge></div>
             <p className="text-xs text-ink-soft mt-2">{pendingAdjustment.type} · {money(pendingAdjustment.amount)} · requested by {pendingAdjustment.requestedBy}</p>
             <p className="text-xs text-ink-faint mt-2">{pendingAdjustment.rationale}</p>
             {isManager && <><label className="block text-xs text-ink-soft mt-3">Reviewer note<textarea className="ui-input mt-1 min-h-16" value={adjustmentReviewNote} onChange={e=>setAdjustmentReviewNote(e.target.value)} maxLength={2000}/></label>
               <div className="grid grid-cols-2 gap-2 mt-3">
                 <button className="btn-quiet text-xs" disabled={reviewAdjustment.isPending} onClick={()=>reviewAdjustment.mutate({id, adjustmentId:pendingAdjustment.id, data:{decision:'reject', ...(adjustmentReviewNote.trim() ? {reviewNote:adjustmentReviewNote.trim()} : {})}},{onSuccess:()=>{setAdjustmentReviewNote('');invalidate();}})}>Reject</button>
                 <button className="btn-primary text-xs" disabled={reviewAdjustment.isPending} onClick={()=>reviewAdjustment.mutate({id, adjustmentId:pendingAdjustment.id, data:{decision:'approve', ...(adjustmentReviewNote.trim() ? {reviewNote:adjustmentReviewNote.trim()} : {})}},{onSuccess:()=>{setAdjustmentReviewNote('');invalidate();}})}>Approve correction</button>
               </div>
             </>}
              {!isManager && <p className="text-xs text-warn mt-3">Sign in to review this correction.</p>}
           </div>}
           {!pendingAdjustment && user
             ? <form className="mt-4 space-y-3" onSubmit={e=>{e.preventDefault();requestAdjustment.mutate({id,data:{type:adjustmentType,amount:Number(adjustmentAmount),rationale:adjustmentRationale}},{onSuccess:()=>{setAdjustmentRationale('');invalidate();}});}}>
                <p className="text-xs text-ink-faint">Submit a correction with a reason. It will not change the final amount until approved.</p>
               <label className="block text-xs text-ink-soft">Corrected remedy<input className="ui-input mt-1" value={adjustmentType} onChange={e=>setAdjustmentType(e.target.value)} required maxLength={200}/></label>
               <label className="block text-xs text-ink-soft">Corrected total<input className="ui-input mt-1 mono" type="number" min="0" step="0.01" value={adjustmentAmount} onChange={e=>setAdjustmentAmount(e.target.value)} required/></label>
               <label className="block text-xs text-ink-soft">Why is this correction needed?<textarea className="ui-input mt-1 min-h-20" value={adjustmentRationale} onChange={e=>setAdjustmentRationale(e.target.value)} required maxLength={2000}/></label>
               {adjustmentError && <p className="text-xs text-danger" role="alert">{adjustmentError}</p>}
               <button className="btn-quiet w-full text-xs" disabled={requestAdjustment.isPending || !authLoaded}>{requestAdjustment.isPending ? 'Submitting for review…' : 'Request reviewed correction'}</button>
             </form>
             : !user && !pendingAdjustment && <Link href="/sign-in" className="btn-quiet block text-center mt-4 text-xs">Sign in to request a correction</Link>}
           {adjustmentError && pendingAdjustment && <p className="text-xs text-danger mt-3" role="alert">{adjustmentError}</p>}
         </div>}
       </ApprovedCompensationSummary>
       ) : (
        <ResolutionGuidancePanel key={id}
          offer={c.recommendation || ''} amount={c.recommendedAmount ?? 0} note={c.resolutionNote || ''}
          guidance={recommendation ? `${recommendation.rationale} Policy: ${recommendation.policyMatch}` : (c.history || []).find((event: any) => event.action === 'AI resolution recommendation generated')?.details || ''}
          canEdit={isManager} final={['Resolved', 'Closed'].includes(c.status)}
          isRefreshing={recommend.isPending} isSaving={update.isPending} isApproving={approve.isPending}
          onRefresh={async () => {
            const result = await recommend.mutateAsync({id});
            setRecommendation(result);
            cacheCase({recommendation: result.resolution, recommendedAmount: result.amount});
            invalidate();
            return result;
          }}
          onSave={async draft => {
            const result = await update.mutateAsync({id, data: draft});
            cacheCase(result); invalidate(); return result;
          }}
          onApprove={async (draft, expected) => {
            const result = await approve.mutateAsync({id, data: {
              ...draft, expectedRecommendation: expected.offer, expectedAmount: expected.amount,
            }});
            cacheCase(result); invalidate(); return result;
          }}
        />
       )}
       <CustomerResponsePanel
         draft={draft}
         onDraftChange={setDraft}
         onDraftBlur={(nextTarget) => {
           if ((nextTarget as HTMLElement | null)?.dataset?.testid === 'button-send-email') return;
           if (draft !== c.responseDraft) save({responseDraft: draft});
         }}
         onDraftResponse={()=>draftResponse.mutate({id},{onSuccess:r=>{setDraft(r.response);invalidate();}})}
         onSendEmail={()=>setEmailOpen(true)}
         onCopyResponse={()=>navigator.clipboard?.writeText(draft)}
         isDrafting={draftResponse.isPending}
         isSaving={update.isPending}
       />
       <EmailResponseDialog open={emailOpen} onOpenChange={setEmailOpen} caseId={id}
         initialRecipient={c.customerEmail || ''} initialMessage={draft} savedMessage={c.responseDraft || ''}
         subject={c.subject} history={c.history || []} onSubmitted={invalidate}/>
        {approvedCompensation ? (
        <ApprovedCaseStatusPanel
          status={c.status}
          onSave={save}
          error={updateError}
          isSaving={update.isPending}
        />
        ) : <section className="panel p-5">
           <h2 className="font-semibold mb-3">Next action</h2>
           <label className="block text-xs text-ink-soft mb-2">Case status</label>
           <select className="ui-input" value={c.status} onChange={e=>save({status:e.target.value})}>
            <option value="New">New</option><option value="Investigating">Investigating</option><option value="Pending approval">Pending approval</option><option value="Resolved">Resolved</option><option value="Closed">Closed</option>
           </select>
            <p className="mt-3 text-xs text-ink-faint">Review the guidance above, edit the offer if needed, then choose Approve resolution. Customer communication and case closure remain separate actions.</p>
           {update.isError && <div className="mt-3 rounded-md border border-danger/30 bg-danger-soft p-3 text-xs text-danger" role="alert">{updateError}</div>}
           <div className="mt-3 text-xs text-ink-faint">{approve.isPending || update.isPending ? 'Saving case update…' : approve.isError || update.isError ? 'Change was not saved. Review the message above.' : 'Every status change is recorded in the audit log.'}</div>
        </section>}
    </div></div>
  </>;
}

function SubmitPage() {
  const create = useCreateComplaint();
  const client = useQueryClient();
  const [, navigate] = useLocation();
  const [done, setDone] = useState<any>(null);
  const [inputError, setInputError] = useState('');
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const fields = Object.fromEntries(
      [...fd.entries()].map(([key, value]) => [key, String(value)]),
    );
    try {
      const data = complaintInputFromForm(fields);
      setInputError('');
      create.mutate({data}, {onSuccess:r=>{setDone(r);client.invalidateQueries({queryKey:getListComplaintsQueryKey()});client.invalidateQueries({queryKey:getGetDashboardQueryKey()});client.invalidateQueries({queryKey:getListAuditLogQueryKey()});client.invalidateQueries({queryKey:getListCustomersQueryKey()});}});
    } catch (error) {
      setInputError(error instanceof Error ? error.message : 'Review the complaint details.');
    }
  };
  return <><SectionTitle eyebrow="Intake" title="Record a complaint" detail="Capture the customer's words and the context your team will need."/><div className="max-w-3xl panel p-5 md:p-7"><div className="flex gap-3 mb-6"><div className="w-9 h-9 rounded-md bg-brand/10 text-brand grid place-items-center"><MessageSquare size={18}/></div><div><h2 className="font-semibold">Complaint details</h2><p className="text-xs text-ink-faint mt-1">Required information is marked with an asterisk.</p></div></div>{done ? <div className="p-5 bg-ok/[.07] border border-ok/30 rounded-md"><CheckCircle2 className="text-ok mb-3"/><h3 className="font-semibold">Complaint recorded</h3><p className="text-sm text-ink-soft mt-1">Case {done.id} is ready for investigation.</p><div className="flex gap-2 mt-4"><button className="btn-primary text-sm" onClick={()=>navigate(`/cases/${done.id}`)}>Open case</button><button className="btn-quiet text-sm" onClick={()=>setDone(null)}>Record another</button></div></div> : <form onSubmit={submit} className="space-y-4"><div className="grid sm:grid-cols-2 gap-4"><label className="text-xs text-ink-soft">Customer name *<input name="customerName" required className="ui-input mt-1.5" placeholder="Full name"/></label><label className="text-xs text-ink-soft">Email address<input name="customerEmail" type="email" className="ui-input mt-1.5" placeholder="name@example.com"/></label><label className="text-xs text-ink-soft">Origin channel *<select name="source" required className="ui-input mt-1.5"><option value="Web form">Web form</option><option value="Email">Email</option><option value="Phone">Phone</option><option value="WhatsApp">WhatsApp</option><option value="Google review">Google review</option></select></label><label className="text-xs text-ink-soft">Order ID<input name="orderId" className="ui-input mt-1.5" placeholder="ORD-00000"/></label><label className="text-xs text-ink-soft sm:col-span-2">Subject *<input name="subject" required className="ui-input mt-1.5" placeholder="A short description of the issue"/></label><label className="text-xs text-ink-soft sm:col-span-2">Customer's message *<textarea name="message" required minLength={5} className="ui-input mt-1.5 min-h-32 resize-y" placeholder="What happened? Capture the customer's own words where possible."/></label><label className="text-xs text-ink-soft">Order value<input name="orderValue" type="number" min="0" step=".01" className="ui-input mt-1.5" placeholder="0.00"/></label><label className="text-xs text-ink-soft">Received date<input name="createdAt" type="datetime-local" className="ui-input mt-1.5"/></label><label className="text-xs text-ink-soft">Customer rating<input name="rating" type="number" min="0" max="5" step="1" className="ui-input mt-1.5" placeholder="0–5"/></label></div>{(inputError||create.isError)&&<p className="text-sm text-danger">{inputError||'Could not submit complaint. Please review the details and try again.'}</p>}<div className="pt-3 flex justify-end"><button disabled={create.isPending} className="btn-primary inline-flex gap-2 items-center">{create.isPending?'Submitting…':<>Submit complaint <ArrowRight size={15}/></>}</button></div></form>}</div></>;
}

function CustomersPage() {
  const q = useListCustomers({query:{queryKey:getListCustomersQueryKey()}});
  const [search,setSearch]=useState('');
  const rows=(q.data||[]).filter((c:any)=>`${c.name} ${c.email} ${c.id}`.toLowerCase().includes(search.toLowerCase()));
  return <><SectionTitle eyebrow="Account intelligence" title="Customers" detail="Customer history and service health in one place."/><QueryState loading={q.isLoading} error={q.isError} retry={()=>q.refetch()}/><div className="panel overflow-hidden"><div className="p-4 border-b border-line flex flex-col sm:flex-row gap-3 justify-between"><div className="font-semibold">Customer directory <span className="text-xs text-ink-faint font-normal ml-2">{rows.length} profiles</span></div><label className="relative sm:w-64"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint"/><input className="ui-input !py-2 !pl-9 text-xs" placeholder="Name, email, or ID" value={search} onChange={e=>setSearch(e.target.value)}/></label></div><div className="table-wrap"><table><thead><tr><th>Customer</th><th>Lifetime value</th><th>Complaints</th><th>Rating</th><th>Account status</th><th/></tr></thead><tbody>{rows.map((c:any)=><tr key={c.id}><td><Link className="font-medium hover:text-brand" href={`/customers/${c.id}`}>{c.name}</Link><div className="text-xs text-ink-faint mt-1">{c.email}</div></td><td className="mono">{money(c.lifetimeValue)}</td><td className="mono">{c.complaintCount}</td><td className="mono">{c.rating ? `${c.rating}/5`:'—'}</td><td><Badge>{c.status}</Badge></td><td><Link className="text-brand text-xs" href={`/customers/${c.id}`}>View profile <ArrowRight size={12} className="inline"/></Link></td></tr>)}</tbody></table>{q.data && rows.length===0&&<div className="p-10 text-center text-sm text-ink-faint">No customers match that search.</div>}</div></div></>;
}

function CustomerPage() {
  const {id=''}=useParams<{id:string}>();
  const q=useGetCustomer(id,{query:{queryKey:getGetCustomerQueryKey(id),enabled:!!id}});
  const c:any=q.data;
  if(q.isLoading)return <><SectionTitle title="Customer profile"/><Loading/></>;
  if(q.isError||!c)return <><SectionTitle title="Customer profile"/><QueryState error retry={()=>q.refetch()}/></>;
  return <><SectionTitle eyebrow="Account intelligence" title={c.name} detail={`${c.email}${c.phone?` · ${c.phone}`:''}`} action={<Link href="/customers" className="btn-quiet text-xs">All customers</Link>}/><div className="panel p-5 mb-4"><div className="flex flex-wrap items-center gap-3 mb-5"><div className="w-12 h-12 bg-brand text-on-brand rounded-md grid place-items-center text-lg font-bold">{c.name.split(' ').map((n:string)=>n[0]).slice(0,2).join('')}</div><div><div className="text-lg font-semibold">{c.name}</div><div className="mono text-xs text-ink-faint">{c.id} · <Badge>{c.status}</Badge></div></div></div><div className="grid grid-cols-2 lg:grid-cols-4 gap-3"><Metric label="Lifetime value" value={money(c.lifetimeValue)} icon={Wallet}/><Metric label="Complaints" value={String(c.complaintCount)} icon={LifeBuoy} accent="amber"/><Metric label="Customer rating" value={c.rating?`${c.rating}/5`:'—'} icon={Activity} accent="green"/><Metric label="Contact" value={c.phone||'—'} icon={Users}/></div></div><DataTable title="Orders" empty="No orders recorded." rows={c.orders||[]} columns={['Order','Date','Items','Value','Status']} render={(o:any)=><tr key={o.id}><td className="mono text-brand">{o.id}</td><td>{shortDate(o.date)}</td><td>{(o.items||[]).join(', ')}</td><td className="mono">{money(o.total)}</td><td><Badge>{o.status}</Badge></td></tr>}/><DataTable title="Complaint history" empty="No complaints recorded." rows={c.complaints||[]} columns={['Case','Subject','Channel','Status','Date']} render={(x:any)=><tr key={x.id}><td><Link href={`/cases/${x.id}`} className="mono text-brand">{x.id}</Link></td><td>{x.subject}</td><td>{x.source}</td><td><Badge>{x.status}</Badge></td><td>{shortDate(x.createdAt)}</td></tr>}/><DataTable title="Compensation history" empty="No compensation recorded." rows={c.compensationHistory||[]} columns={['Date','Case','Remedy','Amount','Status']} render={(x:any)=><tr key={x.id}><td>{shortDate(x.date)}</td><td className="mono">{x.caseId}</td><td>{x.type}</td><td className="mono">{money(x.amount)}</td><td><Badge>{x.status}</Badge></td></tr>}/></>;
}
function DataTable({title,rows,columns,render,empty}:{title:string;rows:any[];columns:string[];render:(row:any)=>ReactNode;empty:string}) { return <section className="panel overflow-hidden mb-4"><div className="px-4 py-3 border-b border-line flex justify-between"><h2 className="font-semibold">{title}</h2><span className="mono text-xs text-ink-faint">{rows.length} records</span></div>{rows.length?<div className="table-wrap"><table><thead><tr>{columns.map(x=><th key={x}>{x}</th>)}</tr></thead><tbody>{rows.map(render)}</tbody></table></div>:<div className="p-8 text-sm text-ink-faint">{empty}</div>}</section>; }

function AdjustmentReviewPage() {
  const { isLoaded, user } = useUser();
  const isManager = isLoaded && Boolean(user);
  const client = useQueryClient();
  const queueKey = getListPendingCompensationAdjustmentsQueryKey();
  const q = useListPendingCompensationAdjustments({
    query: { queryKey: queueKey, enabled: isLoaded && isManager, refetchOnMount: 'always' },
  });
  const review = useReviewCompensationAdjustment();
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState('');
  const rows: any[] = q.data || [];

  const refreshAfterReview = (caseId: string) => {
    client.invalidateQueries({ queryKey: queueKey });
    client.invalidateQueries({ queryKey: getListComplaintsQueryKey() });
    client.invalidateQueries({ queryKey: getGetComplaintQueryKey(caseId) });
    client.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
    client.invalidateQueries({ queryKey: getGetAnalyticsQueryKey() });
    client.invalidateQueries({ queryKey: getListAuditLogQueryKey() });
  };
  const decide = (item: any, decision: 'approve' | 'reject') => {
    setNotice('');
    review.mutate({
      id: item.caseId,
      adjustmentId: item.id,
      data: { decision, ...(notes[item.id]?.trim() ? { reviewNote: notes[item.id].trim() } : {}) },
    }, {
      onSuccess: () => {
        setNotice(`Request for ${item.customerName} ${decision === 'approve' ? 'approved' : 'rejected'}.`);
        setNotes(current => ({ ...current, [item.id]: '' }));
        refreshAfterReview(item.caseId);
      },
    });
  };

  if (!isLoaded) return <div className="space-y-3" aria-busy="true" aria-label="Checking manager access"><div className="skeleton h-24"/><div className="skeleton h-48"/></div>;
  if (!isManager) return <section className="panel max-w-xl mx-auto mt-8 p-8 md:p-10 text-center" data-testid="status-manager-access-restricted">
    <div className="mx-auto mb-4 w-12 h-12 rounded-full bg-warn-soft text-warn grid place-items-center"><Shield size={21}/></div>
    <div className="eyebrow">Sign-in required</div><h1 className="display text-3xl mt-2">Sign in to review requests</h1>
    <p className="text-sm text-ink-soft mt-3">Sign in to CoSolve to view and review compensation adjustments.</p>
    <Link href="/sign-in" className="btn-quiet inline-flex items-center gap-2 mt-6 text-sm">Sign in</Link>
  </section>;

  return <>
    <SectionTitle eyebrow="Financial governance · Manager desk" title="Adjustment review" detail="Review requested corrections to approved compensation before they change the case record." action={<div className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-xs text-ink-soft"><Shield size={14} className="text-brand"/>Manager decision queue</div>}/>
    {notice && <div role="status" data-testid="status-adjustment-review" className="panel mb-4 flex items-center justify-between gap-3 px-4 py-3 text-sm"><span className="inline-flex items-center gap-2 text-ok"><CheckCircle2 size={16}/>{notice}</span><button className="btn-quiet p-1.5" onClick={() => setNotice('')} aria-label="Dismiss review confirmation"><X size={14}/></button></div>}
    {review.isError && <div role="alert" className="panel mb-4 flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm text-danger"><span>{mutationErrorMessage(review.error, 'This decision could not be saved. Please try again.')}</span><button className="btn-quiet text-xs" onClick={() => review.reset()}>Dismiss</button></div>}
    <QueryState loading={q.isLoading} error={q.isError} retry={() => q.refetch()}/>
    {!q.isLoading && !q.isError && rows.length === 0 && <section className="panel px-5 py-14 md:py-16 text-center" data-testid="empty-adjustment-queue">
      <div className="mx-auto mb-4 w-12 h-12 rounded-full bg-brand-soft text-brand grid place-items-center"><CheckCircle2 size={21}/></div>
      <div className="eyebrow">Queue clear</div><h2 className="display text-3xl mt-2">Nothing to review</h2>
      <p className="text-sm text-ink-soft mt-2 max-w-md mx-auto">New compensation correction requests will appear here with their case context and financial impact.</p>
      <button className="btn-quiet inline-flex items-center gap-2 mt-5 text-xs" onClick={() => q.refetch()}><RefreshCw size={13}/>Refresh queue</button>
    </section>}
    {rows.length > 0 && <section className="panel overflow-hidden" aria-label="Pending compensation adjustments">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-line md:px-5">
        <div><div className="font-semibold">Pending requests <span className="text-xs font-normal text-ink-faint ml-1">{rows.length} awaiting decision</span></div><p className="text-xs text-ink-faint mt-1">Compare the requested new total with the signed change.</p></div>
        <button className="btn-quiet inline-flex items-center gap-2 text-xs" onClick={() => q.refetch()}><RefreshCw size={13}/>Refresh</button>
      </div>
      <div className="divide-y divide-line">
        {rows.map(item => <article key={item.id} data-testid={`card-adjustment-${item.id}`} className="p-4 md:p-5">
          <div className="flex flex-col xl:flex-row xl:items-start gap-5">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><Badge color="amber">Awaiting review</Badge><span className="mono text-[11px] text-ink-faint">{item.id}</span></div>
                  <h2 className="text-lg font-semibold mt-2"><Link href={`/cases/${item.caseId}`} className="hover:text-brand transition-colors">{item.caseSubject}</Link></h2>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-ink-soft"><span className="font-medium text-ink">{item.customerName}</span><span className="text-line-strong">/</span><Link href={`/cases/${item.caseId}`} className="mono text-xs hover:text-brand">Case {item.caseId}</Link></div>
                </div>
                <div className="text-right shrink-0"><div className="field-label">Requested new total</div><div className="num text-2xl font-semibold tracking-tight mt-0.5">{money(item.amount)}</div><div className={`num text-sm font-semibold ${item.amountDelta < 0 ? 'text-ok' : 'text-warn'}`}>{item.amountDelta > 0 ? '+' : ''}{money(item.amountDelta)} change</div></div>
              </div>
              <div className="mt-4 grid sm:grid-cols-3 gap-3">
                <div className="subpanel p-3"><div className="field-label">Requested remedy</div><div className="mt-1 text-sm font-semibold break-words">{item.type}</div></div>
                <div className="subpanel p-3"><div className="field-label">Requested by</div><div data-testid={`text-requester-name-${item.id}`} className="mt-1 text-sm font-semibold break-words">{item.requesterName || 'Former or unavailable staff member'}</div></div>
                <div className="subpanel p-3"><div className="field-label">Request date</div><div className="mt-1 text-sm font-semibold">{item.date ? new Date(item.date).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—'}</div></div>
              </div>
              <div className="case-paper bg-paper mt-3 px-4 py-3 rounded-r-lg"><div className="field-label">Rationale</div><p className="text-sm text-ink mt-1 whitespace-pre-wrap break-words">{item.rationale}</p></div>
            </div>
            <aside className="w-full xl:w-[300px] shrink-0 xl:border-l xl:border-line xl:pl-5">
              <label className="field-label block mb-1.5" htmlFor={`review-note-${item.id}`}>Review note <span className="font-normal">(optional)</span></label>
              <textarea id={`review-note-${item.id}`} data-testid={`input-review-note-${item.id}`} className="ui-input min-h-[84px] resize-y text-sm" maxLength={2000} placeholder="Add context for the decision…" value={notes[item.id] || ''} onChange={event => setNotes(current => ({ ...current, [item.id]: event.target.value }))} disabled={review.isPending}/>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button data-testid={`button-reject-adjustment-${item.id}`} className="btn-quiet inline-flex justify-center items-center gap-1.5 text-sm text-danger" disabled={review.isPending} onClick={() => decide(item, 'reject')}><X size={15}/>Reject</button>
                <button data-testid={`button-approve-adjustment-${item.id}`} className="btn-primary inline-flex justify-center items-center gap-1.5 text-sm" disabled={review.isPending} onClick={() => decide(item, 'approve')}><Check size={15}/>Approve</button>
              </div>
            </aside>
          </div>
        </article>)}
      </div>
    </section>}
  </>;
}

function AnalyticsPage() {
  const q=useGetAnalytics({query:{queryKey:getGetAnalyticsQueryKey()}});
  const a:any=q.data;
  return <><SectionTitle eyebrow="Operational intelligence" title="Analytics" detail="Financial exposure, resolution quality, sentiment and recurring issues." action={<button className="btn-quiet text-xs" onClick={()=>q.refetch()}>Refresh data</button>}/><QueryState loading={q.isLoading} error={q.isError} retry={()=>q.refetch()}/>{a&&<><div className="metric-strip grid grid-cols-2 xl:grid-cols-4 gap-3 mb-4"><Metric label="Customer sentiment" value={`${a.sentimentScore}%`} note="Post-resolution pulse" icon={Activity} accent="green"/><Metric label="Avg response" value={`${a.avgResponseHours}h`} note="Time to first response" icon={Clock3}/><Metric label="First contact resolution" value={`${a.firstContactResolution}%`} note="Resolved on first response" icon={CheckCircle2} accent="green"/><Metric label="Refund rate" value={`${a.refundRate}%`} note="Share of complaint resolutions" icon={CircleDollarSign} accent="amber"/></div><div className="grid xl:grid-cols-[1.4fr_.8fr] gap-4"><section className="panel p-5"><div className="eyebrow">Macro volumetrics</div><h2 className="text-lg font-semibold mt-1">Complaint and refund trends</h2><div className="flex items-end gap-2 h-52 mt-6 border-b border-line">{(a.trends||[]).map((p:any,i:number)=><div className="flex-1 flex flex-col justify-end items-center gap-2 h-full" key={p.label||i}><div className="w-full flex items-end justify-center gap-1 h-full"><div className="w-2/5 max-w-8 rounded-t-sm bg-brand/85" style={{height:`${Math.max(5,Math.min(100,p.complaints*5))}%`}}/><div className={`w-2/5 max-w-8 rounded-t-sm ${p.refunds < 0 ? 'bg-danger' : 'bg-clay/75'}`} title={`${money(p.refunds)} net refund impact`} style={{height:`${Math.max(4,Math.min(95,Math.abs(p.refunds)*8))}%`}}/></div><span className="text-[11px] text-ink-faint mb-2">{p.label}</span></div>)}</div><div className="flex gap-5 text-xs text-ink-soft mt-3"><span><i className="inline-block w-2 h-2 bg-brand mr-2 rounded-sm"/>Complaints</span><span><i className="inline-block w-2 h-2 bg-clay mr-2 rounded-sm"/>Net refund impact</span><span><i className="inline-block w-2 h-2 bg-danger mr-2 rounded-sm"/>Negative adjustment month</span></div></section><section className="panel p-5"><div className="eyebrow">Resolution outcomes</div><h2 className="text-lg font-semibold mt-1">Resolution breakdown</h2><div className="space-y-4 mt-6">{(a.resolutionBreakdown||[]).map((r:any)=><div key={r.name}><div className="flex justify-between text-sm mb-2"><span>{r.name}</span><span className="mono text-ink-soft">{r.value}%</span></div><div className="h-2 bg-sunk rounded-full"><div className="h-full bg-brand rounded-full" style={{width:`${Math.min(100,r.value)}%`}}/></div></div>)}{!(a.resolutionBreakdown||[]).length&&<p className="text-sm text-ink-faint">No resolution data available.</p>}</div></section></div><section className="panel p-5 mt-4"><div className="flex items-center justify-between mb-4"><div><div className="eyebrow">Signals to act on</div><h2 className="text-lg font-semibold mt-1">Recurring issues</h2></div><span className="text-xs text-ink-faint">Patterns across complaint reports</span></div>{(a.issues||[]).length?<div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">{a.issues.map((x:any,i:number)=><article key={`${x.name}-${i}`} className="subpanel p-4"><div className="flex justify-between gap-2"><h3 className="font-medium text-sm">{x.name}</h3><Badge>{x.sentiment}</Badge></div><div className="flex justify-between items-end mt-4"><div><span className="mono text-xl">{x.count}</span><span className="text-xs text-ink-faint ml-2">reports</span></div><span className={`mono text-xs ${x.change>0?'text-danger':'text-ok'}`}>{x.change>0?'+':''}{x.change}%</span></div></article>)}</div>:<div className="text-sm text-ink-faint">No recurring issue data available.</div>}</section></>}</>;
}

function AuditPage() {
  const q=useListAuditLog({query:{queryKey:getListAuditLogQueryKey()}});
  const dashboard=useGetDashboard({query:{queryKey:getGetDashboardQueryKey()}});
  const analytics=useGetAnalytics({query:{queryKey:getGetAnalyticsQueryKey()}});
  const complaintsQuery=useListComplaints(undefined,{query:{queryKey:getListComplaintsQueryKey()}});
  const customersQuery=useListCustomers({query:{queryKey:getListCustomersQueryKey()}});
  const events:any[]=q.data||[];
  const complaints:any[]=complaintsQuery.data||[];
  const customers:any[]=customersQuery.data||[];
  const [search,setSearch]=useState('');
  const visible=events.filter(e=>`${e.caseId} ${e.action} ${e.actor} ${e.details}`.toLowerCase().includes(search.toLowerCase()));
  const refunds=events.filter(e=>/compensation approved|compensation adjustment approved|refund approved/i.test(e.action));
  const issues:any[]=analytics.data?.issues||[];
  const ratingList=customers.map(c=>Number(c.rating)).filter(r=>r>0);
  const averageRating=ratingList.length?(ratingList.reduce((sum,r)=>sum+r,0)/ratingList.length).toFixed(1):'—';
  const atRisk=customers.filter(c=>/risk|attention/i.test(c.status||'')).length;
  const agentMap=new Map<string,{count:number;resolved:number;ratings:number[]}>();
  for(const complaint of complaints){
    const name=complaint.assignedTo||'Unassigned';
    const agent=agentMap.get(name)||{count:0,resolved:0,ratings:[]};
    agent.count+=1;
    if(/resolved|closed/i.test(complaint.status||'')) agent.resolved+=1;
    if(Number(complaint.rating)>0) agent.ratings.push(Number(complaint.rating));
    agentMap.set(name,agent);
  }
  const agentRows=[...agentMap.entries()].sort((a,b)=>b[1].count-a[1].count);
  const ready=q.isLoading||dashboard.isLoading||analytics.isLoading||complaintsQuery.isLoading||customersQuery.isLoading;
  const failed=q.isError||dashboard.isError||analytics.isError||complaintsQuery.isError||customersQuery.isError;
  const retry=()=>{q.refetch();dashboard.refetch();analytics.refetch();complaintsQuery.refetch();customersQuery.refetch();};
  return <><SectionTitle eyebrow="Immutable ledger" title="Audit log" detail="A clear record of actions, approvals and resolution decisions." action={<button className="btn-quiet inline-flex items-center gap-2 text-xs" onClick={()=>{const csv=['Date,Case,Action,Actor,Details',...visible.map(e=>[e.createdAt,e.caseId,e.action,e.actor,e.details].map((x:any)=>`"${String(x||'').replaceAll('"','""')}"`).join(','))].join('\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));a.download='cosolve-audit.csv';a.click();URL.revokeObjectURL(a.href);}}><FileText size={14}/>Export CSV</button>}/><QueryState loading={ready} error={failed} retry={retry}/><div className="metric-strip grid grid-cols-2 xl:grid-cols-4 gap-3 mb-4"><Metric label="Refunds this month" value={money(dashboard.data?.monthlyRefunds)} note="Cumulative approved amount" icon={CircleDollarSign} accent="amber"/><Metric label="Recorded actions" value={String(events.length)} icon={ListChecks}/><Metric label="Customer health" value={`${averageRating}/5`} note={`${atRisk} profiles need attention`} icon={Activity} accent="green"/><Metric label="Cases with an owner" value={String(complaints.filter(c=>c.assignedTo&&c.assignedTo!=='Unassigned').length)} note={`${agentRows.length} team members represented`} icon={Users}/></div>
    <div className="grid xl:grid-cols-2 gap-4 mb-4">
      <section className="panel overflow-hidden"><div className="px-4 py-3 border-b border-line"><div className="eyebrow">Approved compensation</div><h2 className="font-semibold mt-1">Approved refunds & remedies</h2></div>{refunds.length?<div className="table-wrap"><table><thead><tr><th>Date</th><th>Case</th><th>Approved by</th><th>Resolution</th></tr></thead><tbody>{refunds.map(e=><tr key={e.id}><td className="whitespace-nowrap">{shortDate(e.createdAt)}</td><td><Link href={`/cases/${e.caseId}`} className="mono text-brand">{e.caseId}</Link></td><td>{e.actor}</td><td className="text-ink-soft">{e.details}</td></tr>)}</tbody></table></div>:<div className="p-6 text-sm text-ink-faint">No approved refunds have been recorded.</div>}</section>
      <section className="panel overflow-hidden"><div className="px-4 py-3 border-b border-line"><div className="eyebrow">Service & product signals</div><h2 className="font-semibold mt-1">Recurring issues</h2></div>{issues.length?<div className="divide-y divide-line">{issues.slice(0,5).map(issue=><div key={issue.name} className="px-4 py-3 flex items-center justify-between gap-3"><div><div className="text-sm font-medium">{issue.name}</div><div className="text-xs text-ink-faint mt-1">{issue.sentiment} sentiment · {issue.change>0?'+':''}{issue.change}% vs last month</div></div><span className="mono text-sm">{issue.count}</span></div>)}</div>:<div className="p-6 text-sm text-ink-faint">No recurring issues identified.</div>}</section>
    </div>
    <div className="grid xl:grid-cols-2 gap-4 mb-4">
      <section className="panel overflow-hidden"><div className="px-4 py-3 border-b border-line"><div className="eyebrow">Team performance</div><h2 className="font-semibold mt-1">Agent overview</h2></div>{agentRows.length?<div className="table-wrap"><table><thead><tr><th>Agent</th><th>Assigned</th><th>Resolved</th><th>Customer rating</th></tr></thead><tbody>{agentRows.map(([name,data])=><tr key={name}><td>{name}</td><td className="mono">{data.count}</td><td className="mono">{data.resolved}</td><td className="mono">{data.ratings.length?(data.ratings.reduce((sum,r)=>sum+r,0)/data.ratings.length).toFixed(1):'—'}</td></tr>)}</tbody></table></div>:<div className="p-6 text-sm text-ink-faint">No assigned agents yet.</div>}</section>
      <section className="panel p-4"><div className="eyebrow">Customer relations</div><h2 className="font-semibold mt-1">Health check</h2><p className="text-xs text-ink-faint mt-1">Based on customer ratings and open complaint history.</p><div className="grid grid-cols-2 gap-3 mt-4"><div className="subpanel p-3"><div className="field-label">Customer profiles</div><div className="mono text-xl mt-1">{customers.length}</div></div><div className="subpanel p-3"><div className="field-label">Need attention</div><div className="mono text-xl mt-1 text-warn">{atRisk}</div></div><div className="subpanel p-3"><div className="field-label">Rated complaints</div><div className="mono text-xl mt-1">{complaints.filter(c=>Number(c.rating)>0).length}</div></div><div className="subpanel p-3"><div className="field-label">Customer satisfaction</div><div className="mono text-xl mt-1">{dashboard.data?.csat??0}%</div></div></div></section>
    </div>
    <section className="panel overflow-hidden"><div className="p-4 border-b border-line flex flex-col sm:flex-row sm:items-center justify-between gap-3"><div><h2 className="font-semibold">All recorded events</h2><p className="text-xs text-ink-faint mt-1">Complaint actions, settlements, communications and policy decisions</p></div><label className="relative sm:w-64"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint"/><input className="ui-input !py-2 !pl-9 text-xs" placeholder="Filter audit entries" value={search} onChange={e=>setSearch(e.target.value)}/></label></div>{visible.length?<div className="table-wrap"><table><thead><tr><th>Timestamp</th><th>Case</th><th>Action</th><th>Actor</th><th>Details</th></tr></thead><tbody>{visible.map(e=><tr key={e.id}><td className="mono text-xs whitespace-nowrap">{e.createdAt?new Date(e.createdAt).toLocaleString():'—'}</td><td><Link href={`/cases/${e.caseId}`} className="mono text-brand">{e.caseId}</Link></td><td><Badge>{e.action}</Badge></td><td>{e.actor}</td><td className="text-ink-soft max-w-md">{e.details}</td></tr>)}</tbody></table></div>:<div className="p-10 text-center text-sm text-ink-faint">{events.length?'No events match this filter.':'No audit events have been recorded.'}</div>}</section></>;
}

function PoliciesPage() {
  const q=useListPolicies({query:{queryKey:getListPoliciesQueryKey()}});
  const client=useQueryClient();
  const create=useCreatePolicy();
  const update=useUpdatePolicy();
  const [show,setShow]=useState(false);
  const [feedback,setFeedback]=useState('');
  const invalidate=()=>{client.invalidateQueries({queryKey:getListPoliciesQueryKey()});client.invalidateQueries({queryKey:getGetDashboardQueryKey()});client.invalidateQueries({queryKey:getListAuditLogQueryKey()});};
  const rules:any[]=q.data||[];
  const submit=(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();const fd=new FormData(e.currentTarget);const name=String(fd.get('name'));create.mutate({data:{name,description:String(fd.get('description')||''),category:String(fd.get('category')||'General'),maxAmount:Number(fd.get('maxAmount')),approvalThreshold:Number(fd.get('approvalThreshold'))}},{onSuccess:()=>{setShow(false);setFeedback('Policy rule created.');invalidate();}});};
  return <><SectionTitle eyebrow="Governance controls" title="Resolution policies" detail="Compensation rules and approval limits that keep every remedy accountable." action={<button className="btn-primary inline-flex items-center gap-2 text-sm" onClick={()=>setShow(true)}><Plus size={15}/>Add policy</button>}/><QueryState loading={q.isLoading} error={q.isError} retry={()=>q.refetch()}/>{feedback&&<div className="mb-4 p-3 rounded bg-ok/10 text-ok text-sm flex justify-between">{feedback}<button onClick={()=>setFeedback('')} aria-label="Dismiss"><X size={14}/></button></div>}<section className="panel p-4 md:p-5 mb-4"><div className="flex justify-between items-center mb-4"><div><div className="eyebrow">Compensation</div><h2 className="text-lg font-semibold mt-1">Compensation rules</h2></div><Badge color="green">{rules.filter(r=>r.enabled).length} enabled</Badge></div>{rules.length?<div className="grid md:grid-cols-2 gap-3">{rules.map((p:any)=><article key={p.id} className="subpanel p-4"><div className="flex justify-between gap-3"><div><div className="eyebrow">{p.category}</div><h3 className="font-semibold mt-1">{p.name}</h3></div><label className="flex items-center gap-2 text-xs text-ink-soft cursor-pointer"><input type="checkbox" checked={p.enabled} disabled={update.isPending} onChange={e=>update.mutate({id:p.id,data:{enabled:e.target.checked}},{onSuccess:invalidate})}/>{p.enabled?'Enabled':'Disabled'}</label></div><p className="text-sm text-ink-soft mt-3 leading-5">{p.description}</p><div className="flex gap-6 border-t border-line mt-4 pt-3"><div><div className="field-label">Maximum remedy</div><div className="mono text-sm mt-1">{money(p.maxAmount)}</div></div><div><div className="field-label">Approval above</div><div className="mono text-sm mt-1">{money(p.approvalThreshold)}</div></div></div></article>)}</div>:<div className="py-10 text-center text-sm text-ink-faint">No policy rules defined yet. Add a policy to get started.</div>}</section>
    <div className="grid xl:grid-cols-2 gap-4"><section className="panel p-5"><div className="eyebrow">Approvals</div><h2 className="text-lg font-semibold mt-1 mb-4">Approval thresholds</h2><div className="space-y-2">{[['Frontline agent','$50','Autonomous instant issuance'],['Shift supervisor','$200','Single supervisor sign-off'],['CX manager','$500','Manager discretion limit'],['Director & legal','Over $500','Dual authorization required']].map(([role,limit,note])=><div key={role} className="subpanel p-3 flex items-center justify-between gap-3"><div><div className="font-medium text-sm">{role}</div><div className="text-xs text-ink-faint mt-1">{note}</div></div><div className="mono text-sm text-brand">{limit}</div></div>)}</div></section><section className="panel p-5"><div className="eyebrow">Routing</div><h2 className="text-lg font-semibold mt-1 mb-4">Urgency & routing</h2><div className="space-y-2">{[['Critical','Public 1-star review','Escalate within 15 minutes'],['High','VIP inbound complaint','30 minute SLA target'],['High','Repeat complaint','Route for investigation'],['Normal','Standard web submission','4 hour SLA queue']].map(([urgency,title,note])=><div className="subpanel p-3 flex justify-between gap-3" key={title}><div><div className="font-medium text-sm">{title}</div><div className="text-xs text-ink-faint mt-1">{note}</div></div><Badge>{urgency}</Badge></div>)}</div></section></div>
    {show&&<div className="fixed inset-0 z-50 bg-ink/80 flex items-center justify-center p-4" role="dialog" aria-modal="true"><div className="panel w-full max-w-lg p-5"><div className="flex justify-between items-start"><div><div className="eyebrow">Governance</div><h2 className="text-lg font-semibold mt-1">Create policy rule</h2></div><button className="btn-quiet p-2" onClick={()=>setShow(false)} aria-label="Close"><X size={15}/></button></div><form className="space-y-3 mt-5" onSubmit={submit}><label className="block text-xs text-ink-soft">Rule name<input required name="name" className="ui-input mt-1" placeholder="Damaged item under $150"/></label><label className="block text-xs text-ink-soft">Category<input required name="category" className="ui-input mt-1" placeholder="Product quality"/></label><label className="block text-xs text-ink-soft">Description<textarea name="description" className="ui-input mt-1 min-h-20"/></label><div className="grid grid-cols-2 gap-3"><label className="text-xs text-ink-soft">Maximum amount<input required name="maxAmount" type="number" min="0" step=".01" className="ui-input mt-1"/></label><label className="text-xs text-ink-soft">Approval threshold<input required name="approvalThreshold" type="number" min="0" step=".01" className="ui-input mt-1"/></label></div>{create.isError&&<p className="text-sm text-danger">Unable to save policy. Try again.</p>}<div className="flex justify-end gap-2 pt-2"><button type="button" className="btn-quiet text-sm" onClick={()=>setShow(false)}>Cancel</button><button className="btn-primary text-sm" disabled={create.isPending}>{create.isPending?'Saving…':'Create rule'}</button></div></form></div></div>}
  </>;
}
