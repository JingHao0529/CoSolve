import { useState } from 'react';
import type { ComponentProps, ReactNode } from 'react';
import './_group.css';

import {
  Activity, AlertCircle, ArrowRight, BadgeCheck, Bell, Check, CheckCircle2, Clock3, FileText,
  Filter, Inbox, LayoutDashboard, LifeBuoy, ListChecks, Menu, MessageSquare, Plus, Search, Settings2, Shield, Sparkles,
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
  return <div className="flex flex-wrap items-end justify-between gap-4 mb-6"><div>{eyebrow && <div className="mono text-[10px] tracking-[.14em] text-[#4edea3] uppercase mb-2">{eyebrow}</div>}<h1 className="text-[25px] md:text-[30px] font-semibold tracking-[-.035em]">{title}</h1>{detail && <p className="text-sm text-[#9da4b7] mt-1">{detail}</p>}</div>{action}</div>;
}
function Loading() { return <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="animate-pulse h-20 rounded-lg bg-[#171b26] border border-[#282d3a]" />)}</div>; }
function QueryState({ loading, error, retry }: { loading?: boolean; error?: boolean; retry?: () => void }) {
  if (loading) return <Loading />;
  if (error) return <div className="panel p-8 text-center"><AlertCircle className="mx-auto text-[#ffb4ab] mb-2" /><p className="font-medium">This view could not load</p><p className="text-sm text-[#9da4b7] mt-1">Check the connection, then try again.</p><button className="btn-quiet mt-4" onClick={retry}>Retry</button></div>;
  return null;
}
function Metric({ label, value, note, icon: Icon, accent = 'blue' }: { label: string; value: string; note?: string; icon: typeof Wallet; accent?: string }) {
  return <div className="panel p-5 min-w-0"><div className="flex items-center justify-between text-[11px] uppercase tracking-[.09em] text-[#9da4b7]"><span>{label}</span><Icon size={17} className={accent === 'green' ? 'text-[#4edea3]' : accent === 'amber' ? 'text-[#ffb95f]' : 'text-[#adc6ff]'} /></div><div className="mono text-[26px] tracking-[-.04em] mt-4">{value}</div>{note && <div className="text-xs text-[#9da4b7] mt-1">{note}</div>}</div>;
}
function ComplaintTable({ rows }: { rows: any[] }) {
  if (!rows?.length) return <div className="py-12 text-center text-[#9da4b7]"><Inbox className="mx-auto mb-2 opacity-50" /><p>No complaints to show</p><Link href="/submit" className="text-[#adc6ff] text-sm inline-block mt-3">Submit a complaint</Link></div>;
  return <div className="table-wrap"><table><thead><tr><th>Case / customer</th><th>Issue</th><th>Priority</th><th>Status</th><th>Amount</th><th>Received</th></tr></thead><tbody>{rows.map((c: any) => <tr key={c.id}><td><Link href={`/cases/${c.id}`} className="text-[#adc6ff] mono text-xs hover:underline">{c.id}</Link><div className="mt-1 font-medium">{c.customerName}</div></td><td><Link href={`/cases/${c.id}`} className="hover:text-[#adc6ff]">{c.subject}</Link><div className="text-xs text-[#9299ab] mt-1">{c.category || c.source}</div></td><td><Badge>{c.urgency || 'Normal'}</Badge></td><td><Badge>{c.status}</Badge></td><td className="mono">{money(c.recommendedAmount)}</td><td className="text-[#9da4b7] whitespace-nowrap">{shortDate(c.createdAt)}</td></tr>)}</tbody></table></div>;
}

export function Current() {
  const [path, navigate] = useLocation();
  const [mobileNav, setMobileNav] = useState(false);
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const isActive = (href: string) => href === '/' ? path === '/' : path.startsWith(href);
  return <div className="min-h-[100dvh] bg-[#0f131d] text-[#dfe2f1]">
    <aside className={`fixed z-40 inset-y-0 left-0 w-[236px] bg-[#0a0e18] border-r border-[#272c39] flex flex-col transition-transform md:translate-x-0 ${mobileNav ? 'translate-x-0' : '-translate-x-full'}`}>
      <Link href="/" className="h-[70px] px-5 flex items-center gap-3 border-b border-[#252a37]">
        <div className="w-8 h-8 rounded-md bg-[#adc6ff] text-[#002e6a] grid place-items-center font-bold text-sm">C</div><div><div className="font-semibold tracking-tight">CoSolve</div><div className="mono text-[9px] text-[#8590a8] tracking-[.14em]">RESOLUTION OPS</div></div>
      </Link>
      <div className="px-3 pt-5 pb-2 mono text-[9px] text-[#70798d] tracking-[.13em] uppercase">Workspace</div>
      <nav className="px-2 space-y-1">{nav.map(({ href, label, icon: Icon }) => <Link key={href} href={href} className={`navlink ${isActive(href) ? 'active' : ''}`} onClick={() => setMobileNav(false)}><Icon size={16} />{label}</Link>)}</nav>
      <div className="mt-5 px-2"><Link className={`navlink ${isActive('/submit') ? 'active' : ''}`} href="/submit"><Plus size={16}/>New complaint</Link></div>
      <div className="mt-auto p-4"><div className="border-t border-[#252a37] pt-4 flex items-center gap-3"><div className="w-8 h-8 rounded-full bg-[#293145] text-[#adc6ff] grid place-items-center text-xs font-semibold">ER</div><div className="min-w-0"><div className="text-xs font-medium">Elena Rostova</div><div className="text-[10px] text-[#8992a5]">CX operations lead</div></div><Settings2 size={15} className="ml-auto text-[#8992a5]" /></div><div className="mono text-[9px] text-[#6f788c] mt-4">SYSTEM ACTIVE · GOVERNED</div></div>
    </aside>
    {mobileNav && <button aria-label="Close menu" onClick={() => setMobileNav(false)} className="fixed inset-0 bg-black/60 z-30 md:hidden" />}
    <div className="md:ml-[236px] min-h-[100dvh] flex flex-col">
      <header className="h-[62px] border-b border-[#252a37] bg-[#0f131d]/95 sticky top-0 z-20 flex items-center justify-between px-4 md:px-7">
        <div className="flex items-center gap-3"><button className="md:hidden p-2 text-[#b9c0d0]" onClick={() => setMobileNav(true)} aria-label="Open menu"><Menu size={18}/></button><div className="hidden sm:block text-xs text-[#8f97aa]">Operations <span className="mx-2 text-[#50596c]">/</span><span className="text-[#dfe2f1]">{nav.find(n => isActive(n.href))?.label || (path.startsWith('/cases') ? 'Investigation' : 'Customer record')}</span></div></div>
        <div className="flex items-center gap-2 md:gap-3">
          <div className="relative"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#778196]"/><input className="w-[155px] md:w-[250px] h-9 bg-[#0a0e18] border border-[#252a37] rounded-md pl-9 pr-3 text-xs outline-none focus:border-[#adc6ff]" placeholder="Search cases or customers" value={search} onFocus={() => setSearchOpen(true)} onChange={e => setSearch(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { setSearchOpen(false); navigate(`/inbox?search=${encodeURIComponent(search)}`); } }} />{searchOpen && search.length > 0 && <div className="absolute right-0 top-11 w-64 panel p-2 z-30"><Link href={`/inbox?search=${encodeURIComponent(search)}`} onClick={() => setSearchOpen(false)} className="block p-2 text-xs hover:bg-[#262a35] rounded">Search inbox for “{search}”</Link><Link href="/customers" onClick={() => setSearchOpen(false)} className="block p-2 text-xs hover:bg-[#262a35] rounded">Search customer records</Link></div>}</div>
          <button className="btn-quiet !p-2 relative" aria-label="Notifications" onClick={() => alert('You are up to date on workspace notifications.')}><Bell size={15}/><i className="absolute top-1 right-1 w-1.5 h-1.5 bg-[#4edea3] rounded-full"/></button>
          <div className="hidden sm:grid place-items-center w-8 h-8 rounded-full bg-[#adc6ff] text-[#002e6a] text-xs font-bold">ER</div>
        </div>
      </header>
      <main className="flex-1 w-full max-w-[1600px] mx-auto p-4 md:p-7 lg:p-8">
        <DashboardPage />
      </main>
      <footer className="border-t border-[#252a37] px-5 md:px-8 py-3 flex justify-between text-[9px] mono uppercase tracking-[.08em] text-[#727b8f]"><span><i className="inline-block w-1.5 h-1.5 bg-[#4edea3] rounded-full mr-2"/>CoSolve v2.4 · System active</span><span className="hidden sm:block">Governed resolution workspace · Secure audit enabled</span></footer>
    </div>
  </div>;
}

function DashboardPage() {
  const q = useGetDashboard({ query: { queryKey: getGetDashboardQueryKey() } });
  const complaints = useListComplaints(undefined, { query: { queryKey: getListComplaintsQueryKey() } });
  const d: any = q.data;
  return <><SectionTitle eyebrow="Operations overview · Today" title="Good morning, Elena" detail="A clear view of what needs attention across customer resolution." action={<Link href="/submit" className="btn-primary inline-flex items-center gap-2 text-sm"><Plus size={16}/>Record a complaint</Link>}/>
    <QueryState loading={q.isLoading || complaints.isLoading} error={q.isError || complaints.isError} retry={() => { q.refetch(); complaints.refetch(); }}/>
    {d && <><div className="grid grid-cols-2 xl:grid-cols-4 gap-3 md:gap-4 mb-5">
      <Metric label="Open cases" value={String(d.openCases ?? 0)} note={`${d.priorityCount ?? 0} need priority review`} icon={Inbox} accent="amber"/>
      <Metric label="Awaiting approval" value={String(d.pendingApprovals ?? 0)} note="Resolution offers to review" icon={BadgeCheck}/>
      <Metric label="Refund exposure" value={money(d.refundExposure)} note="Across active investigations" icon={CircleDollarSign} accent="amber"/>
      <Metric label="Customer satisfaction" value={`${d.csat ?? 0}%`} note={`${d.avgResolutionHours ?? 0}h average resolution`} icon={Activity} accent="green"/>
    </div><div className="grid xl:grid-cols-[1.55fr_1fr] gap-4">
      <section className="panel p-4 md:p-5"><div className="flex items-start justify-between mb-5"><div><div className="mono text-[10px] text-[#4edea3] tracking-widest uppercase">Case volume</div><h2 className="text-lg font-semibold mt-1">Complaint activity</h2></div><Link href="/analytics" className="text-xs text-[#adc6ff] inline-flex items-center gap-1">View analytics <ArrowRight size={13}/></Link></div><div className="flex items-end gap-2 h-40 px-1 border-b border-[#313540]">{(d.trends || []).map((p: any, i: number) => <div className="flex-1 h-full flex flex-col justify-end items-center gap-2" key={p.label || i}><div className="w-full max-w-11 bg-[#4edea3]/80 rounded-t-sm min-h-1" style={{height:`${Math.min(100, Math.max(8, p.complaints * 6))}%`}} title={`${p.complaints} complaints`}/><span className="mono text-[9px] text-[#818a9e] mb-2">{p.label}</span></div>)}</div><div className="flex gap-5 mt-4 text-xs text-[#9da4b7]"><span><i className="inline-block w-2 h-2 bg-[#4edea3] mr-2 rounded-sm"/>Complaints</span><span><i className="inline-block w-2 h-2 bg-[#adc6ff] mr-2 rounded-sm"/>Monthly refunds {money(d.monthlyRefunds)}</span></div></section>
      <section className="panel p-4 md:p-5"><div className="flex justify-between items-start mb-3"><div><div className="mono text-[10px] text-[#ffb95f] tracking-widest uppercase">Needs attention</div><h2 className="text-lg font-semibold mt-1">Priority queue</h2></div><Badge color="amber">{d.priorityCount ?? 0} cases</Badge></div><div className="space-y-2">{(complaints.data || []).filter((c: any) => /high|critical|urgent/i.test(c.urgency || '') || /pending/i.test(c.status || '')).slice(0,4).map((c: any) => <Link key={c.id} href={`/cases/${c.id}`} className="subpanel p-3 block hover:border-[#596073]"><div className="flex justify-between gap-2"><span className="text-sm font-medium truncate">{c.customerName}</span><Badge>{c.urgency}</Badge></div><div className="text-xs text-[#a1a8b8] truncate mt-1">{c.subject}</div><div className="flex justify-between mt-2 text-[10px] mono text-[#818a9e]"><span>{c.id}</span><span>{shortDate(c.createdAt)}</span></div></Link>)}{!(complaints.data || []).some((c: any) => /high|critical|urgent/i.test(c.urgency || '') || /pending/i.test(c.status || '')) && <p className="py-8 text-center text-sm text-[#9299ab]">No priority cases right now.</p>}</div><Link href="/inbox" className="btn-quiet w-full mt-3 block text-center text-xs">Open complaint inbox</Link></section>
    </div><section className="panel mt-4 p-4 md:p-5"><div className="flex justify-between items-center mb-4"><div><div className="mono text-[10px] text-[#adc6ff] tracking-widest uppercase">Recent activity</div><h2 className="text-lg font-semibold mt-1">Latest complaints</h2></div><Link href="/inbox" className="text-xs text-[#adc6ff]">View all</Link></div><ComplaintTable rows={(complaints.data || []).slice(0,5)}/></section></>}
  </>;
}


// Frozen API and routing boundaries for the extracted visual reference.
const dashboardData = {"totalComplaints":3,"openCases":2,"pendingApprovals":1,"refundExposure":150,"avgResolutionHours":0,"csat":100,"monthlyRefunds":20,"priorityCount":2,"trends":[{"label":"May","complaints":0,"refunds":0,"satisfaction":0},{"label":"Jun","complaints":0,"refunds":0,"satisfaction":0},{"label":"Jul","complaints":0,"refunds":0,"satisfaction":0},{"label":"Aug","complaints":0,"refunds":0,"satisfaction":0},{"label":"Sep","complaints":0,"refunds":0,"satisfaction":0},{"label":"Oct","complaints":3,"refunds":20,"satisfaction":100}]};
const complaintData = [{"id":"CS-1001","customerId":"CUS-1042","customerName":"Marcus Vance","source":"WhatsApp","subject":"Glass carafe arrived shattered","message":"The outer shipping carton arrived crushed. The glass carafe inside is completely shattered.","category":"Shipping damage","rootCause":"Packaging failure","urgency":"High","status":"Investigating","confidence":0.93,"sentiment":"Negative","orderId":"ORD-98214","orderValue":340,"recommendation":"Replacement kit + $25 credit","recommendedAmount":25,"assignedTo":"Nora Patel","createdAt":"2026-10-22T13:47:04.549Z","rating":0},{"id":"CS-1002","customerId":"CUS-1043","customerName":"David Liang","source":"Google Review","subject":"Package marked delivered, but nothing arrived","message":"My order says delivered, but nothing was left at the front porch or desk. I have checked with the neighbors.","category":"Delivery issue","rootCause":"Delivery scan mismatch","urgency":"High","status":"Pending approval","confidence":0.87,"sentiment":"Negative","orderId":"ORD-97802","orderValue":820,"recommendation":"Partial refund","recommendedAmount":125,"assignedTo":"Ari Chen","createdAt":"2026-10-22T13:23:04.549Z","rating":0},{"id":"CS-1003","customerId":"CUS-1044","customerName":"Aisha Rahman","source":"Web form","subject":"Slow reply about my subscription","message":"I reached out twice about pausing my next coffee box and did not hear back before it shipped.","category":"Service","rootCause":"Support response delay","urgency":"Medium","status":"Resolved","confidence":0.91,"sentiment":"Neutral","orderId":"ORD-97355","orderValue":158,"recommendation":"$20 voucher","recommendedAmount":20,"assignedTo":"Nora Patel","createdAt":"2026-10-16T14:05:04.549Z","rating":5}];
function useGetDashboard(..._args: unknown[]) { return { data: dashboardData, isLoading: false, isError: false, refetch: () => {} }; }
function useListComplaints(..._args: unknown[]) { return { data: complaintData, isLoading: false, isError: false, refetch: () => {} }; }
const getGetDashboardQueryKey = () => [];
const getListComplaintsQueryKey = () => [];
function useLocation(): [string, (path: string) => void] { return ["/", () => {}]; }
function Link({ href, onClick, ...props }: ComponentProps<"a">) { return <a {...props} href={href} onClick={event => { event.preventDefault(); onClick?.(event); }} />; }
