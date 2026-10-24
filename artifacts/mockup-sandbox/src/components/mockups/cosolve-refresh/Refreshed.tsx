import { useState } from 'react';
import type { ComponentProps, ReactNode } from 'react';
import './_refreshed.css';
import { ThemeProvider } from 'next-themes';

import { ThemeToggle } from './_theme-toggle';
import {
  Activity, AlertCircle, ArrowRight, BadgeCheck, Bell, Check, CheckCircle2, Clock3, FileText,
  Filter, Inbox, LayoutDashboard, LifeBuoy, ListChecks, Menu, MessageSquare, Plus, Search, Settings2, Shield,
  Users, Wallet, X, ChartNoAxesCombined, CircleDollarSign, ClipboardList, RefreshCw,
} from 'lucide-react';



const nav = [
  { href: '/', label: 'Overview', icon: LayoutDashboard },
  { href: '/inbox', label: 'Complaint inbox', icon: Inbox },
  { href: '/customers', label: 'Customers', icon: Users },
  { href: '/analytics', label: 'Analytics', icon: ChartNoAxesCombined },
  { href: '/audit-log', label: 'Audit log', icon: ClipboardList },
  { href: '/policies', label: 'Policies', icon: Shield },
];
const money = (v?: number) => `$${(v ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const shortDate = (v?: string) => v ? new Date(v).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '—';
const tone = (v = '') => /urgent|critical|high|negative|overdue/i.test(v) ? 'red' : /pending|medium|monitor|approval/i.test(v) ? 'amber' : /resolved|approved|active|positive|delivered/i.test(v) ? 'green' : 'blue';

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
  if (!rows?.length) return <div className="py-14 text-center"><div className="mx-auto mb-3 w-12 h-12 rounded-full bg-brand-soft text-brand grid place-items-center"><Inbox size={20} /></div><p className="font-medium text-ink">No complaints to show</p><p className="text-sm text-ink-faint mt-1">When a case arrives it will appear here.</p><Link href="/submit" className="link text-sm inline-block mt-3">Submit a complaint</Link></div>;
  return <div className="table-wrap"><table><thead><tr><th>Case / customer</th><th>Issue</th><th>Priority</th><th>Status</th><th>Amount</th><th>Received</th></tr></thead><tbody>{rows.map((c: any) => <tr key={c.id}><td><Link href={`/cases/${c.id}`} className="font-semibold text-ink hover:text-brand transition-colors">{c.customerName}</Link><div className="mono text-[11.5px] text-ink-faint mt-0.5">{c.id}</div></td><td className="max-w-[340px]"><Link href={`/cases/${c.id}`} className="text-ink hover:text-brand transition-colors line-clamp-1">{c.subject}</Link><div className="text-xs text-ink-faint mt-0.5">{c.category || c.source}</div></td><td><Badge>{c.urgency || 'Normal'}</Badge></td><td><Badge>{c.status}</Badge></td><td className="num">{money(c.recommendedAmount)}</td><td className="text-ink-soft whitespace-nowrap">{shortDate(c.createdAt)}</td></tr>)}</tbody></table></div>;
}

function RefreshedShell() {
  const [path, navigate] = useLocation();
  const [mobileNav, setMobileNav] = useState(false);
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const isActive = (href: string) => href === '/' ? path === '/' : path.startsWith(href);
  return <div className="min-h-[100dvh] bg-paper text-ink">
    <aside className={`fixed z-40 inset-y-0 left-0 w-[248px] bg-rail border-r border-line flex flex-col transition-transform duration-300 md:translate-x-0 ${mobileNav ? 'translate-x-0' : '-translate-x-full'}`}>
      <div className="h-[72px] px-5 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3 rounded-lg" onClick={() => setMobileNav(false)}>
          <span className="brand-mark" aria-hidden="true"><span/></span><span className="display text-[22px] leading-none">CoSolve</span>
        </Link>
        <div className="flex items-center gap-1"><ThemeToggle /><button className="md:hidden p-1.5 rounded-full text-ink-soft hover:bg-sunk" onClick={() => setMobileNav(false)} aria-label="Close menu"><X size={17}/></button></div>
      </div>
      <div className="px-4 mt-1 mb-5"><Link className="btn-primary w-full inline-flex items-center justify-center gap-2 text-sm" href="/submit" onClick={() => setMobileNav(false)}><Plus size={16}/>New complaint</Link></div>
      <nav className="px-3 space-y-0.5">{nav.map(({ href, label, icon: Icon }) => <Link key={href} href={href} className={`navlink ${isActive(href) ? 'active' : ''}`} onClick={() => setMobileNav(false)}><Icon size={17} strokeWidth={1.8} />{label}</Link>)}</nav>
      <div className="mt-auto p-4"><div className="rounded-xl bg-surface border border-line p-3 flex items-center gap-3"><div className="w-9 h-9 rounded-full bg-brand-soft text-brand grid place-items-center text-xs font-bold">ER</div><div className="min-w-0"><div className="text-sm font-semibold text-ink">Elena Rostova</div><div className="text-xs text-ink-faint">CX operations lead</div></div><Settings2 size={15} className="ml-auto text-ink-faint" /></div></div>
    </aside>
    {mobileNav && <button aria-label="Close menu" onClick={() => setMobileNav(false)} className="fixed inset-0 bg-black/35 backdrop-blur-[2px] z-30 md:hidden" />}
    <div className="md:ml-[248px] min-h-[100dvh] flex flex-col">
      <header className="h-[64px] bg-paper/85 backdrop-blur-md sticky top-0 z-20 flex items-center justify-between px-4 md:px-8 border-b border-line/70">
        <div className="flex items-center gap-2 min-w-0"><button className="md:hidden p-2 -ml-1 rounded-full text-ink-soft hover:bg-sunk" onClick={() => setMobileNav(true)} aria-label="Open menu"><Menu size={19}/></button><div className="hidden sm:block text-sm text-ink-faint truncate">Workspace <span className="mx-1.5 text-line-strong">/</span><span className="text-ink font-medium">{nav.find(n => isActive(n.href))?.label || (path.startsWith('/cases') ? 'Investigation' : path.startsWith('/submit') ? 'New complaint' : 'Customer record')}</span></div></div>
        <div className="flex items-center gap-2 md:gap-3">
          <div className="relative"><Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none"/><input className="search-input w-[160px] md:w-[280px]" placeholder="Search cases or customers" value={search} onFocus={() => setSearchOpen(true)} onBlur={() => setTimeout(() => setSearchOpen(false), 150)} onChange={e => setSearch(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { setSearchOpen(false); navigate(`/inbox?search=${encodeURIComponent(search)}`); } }} />{searchOpen && search.length > 0 && <div className="absolute right-0 top-12 w-72 panel pop p-1.5 z-30"><Link href={`/inbox?search=${encodeURIComponent(search)}`} onClick={() => setSearchOpen(false)} className="menu-item"><Inbox size={14}/>Search inbox for “{search}”</Link><Link href="/customers" onClick={() => setSearchOpen(false)} className="menu-item"><Users size={14}/>Search customer records</Link></div>}</div>
          <button className="icon-btn relative" aria-label="Notifications" onClick={() => alert('You are up to date on workspace notifications.')}><Bell size={16}/><i className="absolute top-2 right-2 w-1.5 h-1.5 bg-clay rounded-full"/></button>
        </div>
      </header>
      <main className="flex-1 w-full max-w-[1360px] mx-auto px-4 py-6 md:px-8 md:py-9 page-enter" key={path}>
        <DashboardPage />
      </main>
      <footer className="px-5 md:px-8 py-4 flex justify-between text-xs text-ink-faint"><span className="inline-flex items-center gap-2"><i className="w-1.5 h-1.5 bg-ok rounded-full"/>CoSolve · all systems running</span><span className="hidden sm:block">Every decision is recorded in the audit log</span></footer>
    </div>
  </div>;
}

function DashboardPage() {
  const q = useGetDashboard({ query: { queryKey: getGetDashboardQueryKey() } });
  const complaints = useListComplaints(undefined, { query: { queryKey: getListComplaintsQueryKey() } });
  const d: any = q.data;
  return <><SectionTitle eyebrow="Operations overview · Today" title="Good morning, Elena" detail="A clear view of what needs attention across customer resolution." action={<Link href="/submit" className="btn-primary inline-flex items-center gap-2 text-sm"><Plus size={16}/>Record a complaint</Link>}/>
    <QueryState loading={q.isLoading || complaints.isLoading} error={q.isError || complaints.isError} retry={() => { q.refetch(); complaints.refetch(); }}/>
    {d && <><div className="metric-strip grid grid-cols-2 xl:grid-cols-4 gap-3 md:gap-4 mb-5">
      <Metric label="Open cases" value={String(d.openCases ?? 0)} note={`${d.priorityCount ?? 0} need priority review`} icon={Inbox} accent="amber"/>
      <Metric label="Awaiting approval" value={String(d.pendingApprovals ?? 0)} note="Resolution offers to review" icon={BadgeCheck}/>
      <Metric label="Refund exposure" value={money(d.refundExposure)} note="Across active investigations" icon={CircleDollarSign} accent="amber"/>
      <Metric label="Customer satisfaction" value={`${d.csat ?? 0}%`} note={`${d.avgResolutionHours ?? 0}h average resolution`} icon={Activity} accent="green"/>
    </div><div className="grid xl:grid-cols-[1.55fr_1fr] gap-4">
      <section className="panel p-4 md:p-5"><div className="flex items-start justify-between mb-5"><div><div className="eyebrow">Case volume</div><h2 className="text-lg font-semibold mt-1">Complaint activity</h2></div><Link href="/analytics" className="text-xs text-brand inline-flex items-center gap-1">View analytics <ArrowRight size={13}/></Link></div><div className="activity-chart flex items-end gap-2 h-40 px-1 border-b border-line">{(d.trends || []).map((p: any, i: number) => <div className="flex-1 h-full flex flex-col justify-end items-center gap-2" key={p.label || i}><div className="w-full max-w-11 bg-brand/85 rounded-t-md min-h-1" style={{height:`${Math.min(100, Math.max(8, p.complaints * 6))}%`}} title={`${p.complaints} complaints`}/><span className="text-[11px] text-ink-faint mb-2">{p.label}</span></div>)}</div><div className="flex gap-5 mt-4 text-xs text-ink-soft"><span><i className="inline-block w-2 h-2 bg-brand mr-2 rounded-sm"/>Complaints</span><span><i className="inline-block w-2 h-2 bg-clay mr-2 rounded-sm"/>Monthly refunds {money(d.monthlyRefunds)}</span></div></section>
      <section className="panel p-4 md:p-5"><div className="flex justify-between items-start mb-3"><div><div className="eyebrow">Needs attention</div><h2 className="text-lg font-semibold mt-1">Priority queue</h2></div><Badge color="amber">{d.priorityCount ?? 0} cases</Badge></div><div className="space-y-2">{(complaints.data || []).filter((c: any) => /high|critical|urgent/i.test(c.urgency || '') || /pending/i.test(c.status || '')).slice(0,4).map((c: any) => <Link key={c.id} href={`/cases/${c.id}`} className="subpanel p-3 block hover:border-line-strong"><div className="flex justify-between gap-2"><span className="text-sm font-medium truncate">{c.customerName}</span><Badge>{c.urgency}</Badge></div><div className="text-xs text-ink-soft truncate mt-1">{c.subject}</div><div className="flex justify-between mt-2 text-xs mono text-ink-faint"><span>{c.id}</span><span>{shortDate(c.createdAt)}</span></div></Link>)}{!(complaints.data || []).some((c: any) => /high|critical|urgent/i.test(c.urgency || '') || /pending/i.test(c.status || '')) && <p className="py-8 text-center text-sm text-ink-faint">No priority cases right now.</p>}</div><Link href="/inbox" className="btn-quiet w-full mt-3 block text-center text-xs">Open complaint inbox</Link></section>
    </div><section className="panel mt-4 p-4 md:p-5"><div className="flex justify-between items-center mb-4"><div><div className="eyebrow">Recent activity</div><h2 className="text-lg font-semibold mt-1">Latest complaints</h2></div><Link href="/inbox" className="text-xs text-brand">View all</Link></div><ComplaintTable rows={(complaints.data || []).slice(0,5)}/></section></>}
  </>;
}


export function Refreshed({initialTheme = "light"}: {initialTheme?: "light" | "dark"}) { return <ThemeProvider attribute="class" defaultTheme={initialTheme} enableSystem={false} storageKey={`cosolve-preview-${initialTheme}`} disableTransitionOnChange><RefreshedShell /></ThemeProvider>; }

// Frozen API and routing boundaries for the extracted visual reference.
const dashboardData = {"totalComplaints":3,"openCases":2,"pendingApprovals":1,"refundExposure":150,"avgResolutionHours":0,"csat":100,"monthlyRefunds":20,"priorityCount":2,"trends":[{"label":"May","complaints":0,"refunds":0,"satisfaction":0},{"label":"Jun","complaints":0,"refunds":0,"satisfaction":0},{"label":"Jul","complaints":0,"refunds":0,"satisfaction":0},{"label":"Aug","complaints":0,"refunds":0,"satisfaction":0},{"label":"Sep","complaints":0,"refunds":0,"satisfaction":0},{"label":"Oct","complaints":3,"refunds":20,"satisfaction":100}]};
const complaintData = [{"id":"CS-1001","customerId":"CUS-1042","customerName":"Marcus Vance","source":"WhatsApp","subject":"Glass carafe arrived shattered","message":"The outer shipping carton arrived crushed. The glass carafe inside is completely shattered.","category":"Shipping damage","rootCause":"Packaging failure","urgency":"High","status":"Investigating","confidence":0.93,"sentiment":"Negative","orderId":"ORD-98214","orderValue":340,"recommendation":"Replacement kit + $25 credit","recommendedAmount":25,"assignedTo":"Nora Patel","createdAt":"2026-10-22T13:47:04.549Z","rating":0},{"id":"CS-1002","customerId":"CUS-1043","customerName":"David Liang","source":"Google Review","subject":"Package marked delivered, but nothing arrived","message":"My order says delivered, but nothing was left at the front porch or desk. I have checked with the neighbors.","category":"Delivery issue","rootCause":"Delivery scan mismatch","urgency":"High","status":"Pending approval","confidence":0.87,"sentiment":"Negative","orderId":"ORD-97802","orderValue":820,"recommendation":"Partial refund","recommendedAmount":125,"assignedTo":"Ari Chen","createdAt":"2026-10-22T13:23:04.549Z","rating":0},{"id":"CS-1003","customerId":"CUS-1044","customerName":"Aisha Rahman","source":"Web form","subject":"Slow reply about my subscription","message":"I reached out twice about pausing my next coffee box and did not hear back before it shipped.","category":"Service","rootCause":"Support response delay","urgency":"Medium","status":"Resolved","confidence":0.91,"sentiment":"Neutral","orderId":"ORD-97355","orderValue":158,"recommendation":"$20 voucher","recommendedAmount":20,"assignedTo":"Nora Patel","createdAt":"2026-10-16T14:05:04.549Z","rating":5}];
function useGetDashboard(..._args: unknown[]) { return { data: dashboardData, isLoading: false, isError: false, refetch: () => {} }; }
function useListComplaints(..._args: unknown[]) { return { data: complaintData, isLoading: false, isError: false, refetch: () => {} }; }
const getGetDashboardQueryKey = () => [];
const getListComplaintsQueryKey = () => [];
function useLocation(): [string, (path: string) => void] { return ["/", () => {}]; }
function Link({ href, onClick, ...props }: ComponentProps<"a">) { return <a {...props} href={href} onClick={event => { event.preventDefault(); onClick?.(event); }} />; }
