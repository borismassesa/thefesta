'use client'

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Briefcase,
  Building2,
  CalendarCheck,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  Clock,
  CreditCard,
  FileCheck2,
  FileText,
  Gem,
  Gift,
  Globe,
  Globe2,
  HandHeart,
  Headset,
  Home,
  Landmark,
  LayoutDashboard,
  LayoutGrid,
  Lightbulb,
  ListTodo,
  LogOut,
  Mail,
  Newspaper,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  PanelTop,
  Plane,
  QrCode,
  Receipt,
  ReceiptText,
  RefreshCw,
  Search,
  Settings,
  Shield,
  ShieldCheck,
  Star,
  Store,
  TrendingUp,
  UserCheck,
  UserCog,
  UserPlus,
  Users,
  Wallet,
  Wrench,
  X,
  type LucideIcon,
} from "lucide-react";
import { useClerk } from "@clerk/nextjs";
import { cn } from "../lib/utils";
import Logo from "./ui/Logo";
import { adminSignOut } from "./sidebar-actions";
import type { CallerProfile } from "@/lib/admin-auth";

type NavItem = {
  icon: LucideIcon;
  label: string;
  href: string;
  badge?: string;
  // Extra path prefixes that should also count as "active". Used when one
  // sidebar entry covers a group of routes that don't share a URL prefix
  // (e.g. Articles owns /operations/articles and /operations/authors).
  activePaths?: string[];
  // Only match this item's href exactly — skips the default "any sub-path
  // is active too" behavior. Needed when this item's own href is a literal
  // path prefix of sibling items (e.g. Growth Tracker's "Dashboard" is
  // /growth, and "Sales & Marketing" is /growth/marketing — without this,
  // both light up on /growth/marketing).
  exact?: boolean;
  // Permission required to see this item. Items without a permission
  // (Dashboard, Inbox, Help) stay visible to everyone in the dashboard.
  // The whole section drops out if all its items are filtered.
  requiredPermission?: string;
  // Permission OR-set — visible if the caller has ANY of these.
  // Use when an item is relevant to multiple roles that don't share
  // a single key (e.g. Approvals is for finance + HR + ops, gated
  // on finance.read OR workforce.read). Combined with
  // requiredPermission additively (both must pass when both set).
  requiredAnyPermission?: string[];
};
type NavSection = {
  id: string;
  label: string;
  icon: LucideIcon;
  items: NavItem[];
  // Permission required at section level — collapses the section header
  // entirely. Use when the whole module is gated (e.g. Insights).
  requiredPermission?: string;
};

const topItems: NavItem[] = [
  { icon: LayoutDashboard, label: "Dashboard", href: "/" },
];

const sections: NavSection[] = [
  {
    id: "workspace",
    label: "Work Space",
    icon: Clock,
    items: [
      { icon: Clock, label: "Time Clock", href: "/me/timeclock" },
      { icon: FileText, label: "Reports", href: "/me/reports" },
      { icon: ClipboardCheck, label: "Tracker", href: "/workforce/daily-tracker", requiredPermission: "workforce.read" },
    ],
  },
  {
    id: "website-cms",
    label: "Website CMS",
    icon: Globe,
    requiredPermission: "cms.read",
    items: [
      { icon: Home, label: "Homepage", href: "/cms/homepage", requiredPermission: "cms.read" },
      { icon: Wrench, label: "Planning Tools", href: "/cms/planning-tools", requiredPermission: "cms.read" },
      { icon: Store, label: "Vendors Marketplace", href: "/cms/vendors", requiredPermission: "cms.read" },
      { icon: UserCheck, label: "Guest & RSVPs", href: "/cms/guests", requiredPermission: "cms.read" },
      { icon: Globe2, label: "Wedding Website", href: "/cms/wedding-websites", requiredPermission: "cms.read" },
      { icon: Lightbulb, label: "Ideas & Advice", href: "/cms/advice-and-ideas", requiredPermission: "cms.read" },
      { icon: Gem, label: "Attire & Rings", href: "/cms/attire-and-rings", requiredPermission: "cms.read" },
      { icon: Gift, label: "Registry", href: "/cms/registry", requiredPermission: "cms.read" },
    ],
  },
  {
    id: "vendors-portal-cms",
    label: "Vendors Portal CMS",
    icon: Store,
    requiredPermission: "cms.read",
    items: [
      { icon: Home, label: "Homepage", href: "/cms/vendors-portal", requiredPermission: "cms.read" },
      { icon: PanelTop, label: "Site UI", href: "/cms/vendors-portal/site-ui/portal-chrome", requiredPermission: "cms.read" },
    ],
  },
  {
    id: "opus-pass-cms",
    label: "OpusPass CMS",
    icon: CreditCard,
    requiredPermission: "cms.read",
    items: [
      { icon: Home, label: "Homepage", href: "/cms/opus-pass/homepage", requiredPermission: "cms.read" },
      { icon: FileText, label: "Digital Cards Pages", href: "/cms/opus-pass/digital-cards", requiredPermission: "cms.read" },
      { icon: UserCheck, label: "Guests & RSVPs", href: "/cms/opus-pass/guests-rsvps", requiredPermission: "cms.read" },
      { icon: Globe2, label: "Wedding Website", href: "/cms/opus-pass/wedding-website", requiredPermission: "cms.read" },
      { icon: LayoutDashboard, label: "OpusPass Dashboard", href: "/cms/opus-pass/dashboard", requiredPermission: "cms.read" },
      { icon: PanelTop, label: "Site UI", href: "/cms/opus-pass/site-ui/navbar", requiredPermission: "cms.read" },
    ],
  },
  {
    id: "opus-pass",
    label: "OpusPass",
    icon: CreditCard,
    items: [
      { icon: Mail, label: "Digital Cards", href: "/opus-pass/digital-cards", requiredPermission: "cms.read" },
      { icon: Users, label: "Couple Accounts", href: "/opus-pass/couples", requiredPermission: "opuspass.couples.read" },
      { icon: QrCode, label: "Event Check-in", href: "/operations/checkin", requiredPermission: "opuspass.checkin" },
      { icon: CreditCard, label: "Payments", href: "/finance/payments", requiredPermission: "finance.read" },
      // Separate from Payments above: commissions are a two-instalment ledger
      // with its own review queue, not single-payment card orders.
      { icon: ReceiptText, label: "Commission Payments", href: "/finance/commissions", requiredPermission: "finance.read" },
      { icon: Package, label: "Order Fulfilment", href: "/finance/orders", requiredPermission: "finance.read" },
      { icon: Wallet, label: "Vendor Payouts", href: "/finance/payouts", requiredPermission: "finance.read" },
      { icon: HandHeart, label: "Pledge Concierge", href: "/opus-pass/pledges", requiredPermission: "opuspass.pledges.read" },
    ],
  },
  {
    id: "operations",
    label: "Operations",
    icon: Briefcase,
    items: [
      { icon: CalendarCheck, label: "Bookings", href: "/operations/bookings", requiredPermission: "bookings.read" },
      {
        icon: Newspaper,
        label: "Articles",
        href: "/operations/articles",
        activePaths: ["/operations/authors", "/operations/articles/submissions"],
        requiredPermission: "cms.write",
      },
    ],
  },
  {
    id: "support",
    label: "Support",
    icon: Headset,
    items: [
      { icon: Headset, label: "Conversations", href: "/support", exact: true, requiredPermission: "support.read" },
      { icon: BarChart3, label: "Analytics", href: "/support/analytics", requiredPermission: "support.read" },
    ],
  },
  {
    id: "vendors-portal",
    label: "Vendors Portal",
    icon: Building2,
    items: [
      { icon: Building2, label: "Vendor Accounts", href: "/operations/vendors", requiredPermission: "vendor.read" },
      { icon: Store, label: "Vendor Categories", href: "/operations/categories", requiredPermission: "vendor.read" },
      { icon: Package, label: "Products", href: "/operations/products", requiredPermission: "vendor.moderate" },
      { icon: Package, label: "Product Categories", href: "/operations/product-categories", requiredPermission: "vendor.moderate" },
      { icon: Star, label: "Reviews & Moderation", href: "/operations/reviews", requiredPermission: "vendor.moderate" },
      { icon: Wallet, label: "Vendor Payouts", href: "/finance/payouts", requiredPermission: "finance.write" },
    ],
  },
  {
    id: "approvals",
    label: "Approvals",
    icon: ClipboardList,
    items: [
      {
        icon: FileCheck2,
        label: "Approvals",
        href: "/approvals",
        // Visible to anyone who'd plausibly be an approver: finance,
        // HR/people-ops, owner, admin, viewer (read-only audit). Hides
        // the page from Content Editor + Vendor Success, who don't act
        // on travel/payments/procurement/etc.
        requiredAnyPermission: ["finance.read", "workforce.read"],
      },
    ],
  },
  {
    id: "finance",
    label: "Finance",
    icon: Landmark,
    // Section visible to anyone with finance.read OR workforce.payroll
    // (payroll lives here even though its permission lives in the workforce
    // module). The per-item gates still apply below.
    requiredPermission: undefined,
    items: [
      { icon: Receipt, label: "Invoices", href: "/finance/invoices", requiredPermission: "finance.read" },
      { icon: Receipt, label: "Expenses", href: "/finance/expenses", requiredPermission: "finance.read" },
      { icon: Wallet, label: "Payroll", href: "/finance/payroll", requiredPermission: "workforce.payroll" },
      { icon: RefreshCw, label: "Refunds", href: "/finance/refunds", requiredPermission: "finance.write" },
    ],
  },
  {
    id: "workforce",
    label: "Workforce",
    icon: Users,
    requiredPermission: "workforce.read",
    items: [
      { icon: UserCog, label: "Employees", href: "/workforce/employees", requiredPermission: "workforce.read" },
      { icon: ListTodo, label: "Tasks", href: "/workforce/tasks", requiredPermission: "workforce.read" },
      { icon: ClipboardList, label: "Schedule", href: "/workforce/schedule", requiredPermission: "workforce.read" },
      { icon: Newspaper, label: "Reports", href: "/workforce/reports", requiredPermission: "workforce.read" },
      { icon: TrendingUp, label: "Performance", href: "/workforce/performance", requiredPermission: "workforce.read" },
      { icon: FileText, label: "Report Templates", href: "/workforce/report-templates", requiredPermission: "workforce.write" },
      { icon: Plane, label: "Leave & Attendance", href: "/workforce/leave", requiredPermission: "workforce.read" },
      { icon: Clock, label: "Timesheets", href: "/workforce/timesheets", requiredPermission: "workforce.read" },
      { icon: Shield, label: "Roles", href: "/workforce/roles", requiredPermission: "workforce.write" },
      { icon: UserPlus, label: "Recruitment", href: "/workforce/recruitment", requiredPermission: "workforce.write" },
    ],
  },
  {
    id: "growth-tracker",
    label: "Growth Tracker",
    icon: BarChart3,
    items: [
      { icon: LayoutDashboard, label: "Dashboard", href: "/growth", exact: true, requiredAnyPermission: ["growth.write", "growth.admin"] },
      { icon: Building2, label: "Vendor Outreach", href: "/growth/vendor-outreach", requiredAnyPermission: ["growth.write", "growth.admin"] },
      { icon: TrendingUp, label: "Sales & Marketing", href: "/growth/marketing", requiredAnyPermission: ["growth.write", "growth.admin"] },
      { icon: Star, label: "Social Media", href: "/growth/social", requiredAnyPermission: ["growth.write", "growth.admin"] },
      { icon: CalendarCheck, label: "Studio Performance", href: "/growth/studio", requiredAnyPermission: ["growth.write", "growth.admin"] },
      { icon: Lightbulb, label: "Content Ideas", href: "/growth/content-ideas", requiredAnyPermission: ["growth.write", "growth.admin"] },
    ],
  },
  {
    id: "insights",
    label: "Insights",
    icon: ShieldCheck,
    requiredPermission: "insights.read",
    items: [
      // Only the Audit Log page is live today; Analytics/Activity routes don't
      // exist yet, so they're intentionally omitted rather than left as dead links.
      { icon: ShieldCheck, label: "Audit Log", href: "/insights/audit", requiredPermission: "insights.read" },
    ],
  },
];

// The three CMS modules are grouped under one collapsible "Control
// Management System" parent in the sidebar. Each listed section keeps its
// own structure (it's still an independent collapsible section); the parent
// just nests them one level deeper.
const CMS_GROUP = {
  id: "cms",
  label: "System Management",
  icon: LayoutGrid,
  sectionIds: ["website-cms", "vendors-portal-cms", "opus-pass-cms"] as string[],
}

const COLLAPSED_KEY = 'opusfesta:sidebar-collapsed'
const WIDTH_KEY = 'opusfesta:sidebar-width'
// Expanded-rail width: default a touch wider than before, drag-resizable
// within these bounds. (Collapsed rail stays a fixed 72px.)
const DEFAULT_WIDTH = 288
const MIN_WIDTH = 240
const MAX_WIDTH = 420

const clampWidth = (n: number) => Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, n))

function isItemActive(pathname: string, item: NavItem) {
  if (item.href === '/' || item.exact) return pathname === item.href
  if (pathname === item.href || pathname.startsWith(item.href + '/')) return true
  return (item.activePaths ?? []).some(
    (p) => pathname === p || pathname.startsWith(p + '/')
  )
}

function isSectionActive(pathname: string, section: NavSection) {
  return section.items.some((i) => isItemActive(pathname, i))
}

export function Sidebar({
  permissions,
  profile,
}: {
  permissions: string[]
  profile: CallerProfile
}) {
  const pathname = usePathname();
  // Filter sections + items by permission. An item without a
  // requiredPermission is always visible (e.g. Dashboard, Inbox); a
  // section with a requiredPermission is hidden entirely if the caller
  // doesn't have it, and any section that ends up with zero visible
  // items is dropped too.
  const permissionSet = new Set(permissions);
  const itemVisible = (item: NavItem) => {
    if (item.requiredPermission && !permissionSet.has(item.requiredPermission)) return false
    if (
      item.requiredAnyPermission &&
      !item.requiredAnyPermission.some((p) => permissionSet.has(p))
    ) {
      return false
    }
    return true
  }
  const visibleSections = sections
    .filter((section) => !section.requiredPermission || permissionSet.has(section.requiredPermission))
    .map((section) => ({
      ...section,
      items: section.items.filter(itemVisible),
    }))
    .filter((section) => section.items.length > 0);

  // Split the CMS modules out so they render nested under the
  // "Control Management System" group; everything else renders as before.
  const cmsGroupSections = visibleSections.filter((s) => CMS_GROUP.sectionIds.includes(s.id));
  const otherSections = visibleSections.filter((s) => !CMS_GROUP.sectionIds.includes(s.id));

  // Only auto-open the section that owns the active route. For top-level
  // routes that aren't inside any section (Dashboard `/`, Inbox `/inbox`,
  // Help, Settings, etc.), leave every section collapsed so the sidebar
  // doesn't misleadingly expand "Website CMS" just because it happens
  // to sit first in the list.
  const initialSection = visibleSections.find((s) => isSectionActive(pathname, s))?.id ?? "";
  const [openSection, setOpenSection] = useState<string>(initialSection);
  // The CMS parent group auto-opens when the active route lives inside it.
  const [openGroup, setOpenGroup] = useState<boolean>(
    cmsGroupSections.some((s) => isSectionActive(pathname, s))
  );
  const [search, setSearch] = useState("");
  // Live nav filter — when the search box has a query, show only items whose
  // label matches and force the matching sections open.
  const query = search.trim().toLowerCase();
  const matchesQuery = (label: string) => label.toLowerCase().includes(query);
  const filterSectionItems = (section: NavSection): NavSection => ({
    ...section,
    items: section.items.filter((i) => matchesQuery(i.label)),
  });
  const filteredTopItems = query ? topItems.filter((i) => matchesQuery(i.label)) : topItems;
  // When the query matches the CMS group's own label (e.g. "System Management"),
  // surface the whole group rather than filtering it out for having no matching
  // child item/label.
  const cmsGroupLabelMatches = query !== '' && matchesQuery(CMS_GROUP.label);
  const cmsGroupRender = query
    ? cmsGroupLabelMatches
      ? cmsGroupSections
      : cmsGroupSections.map(filterSectionItems).filter((s) => s.items.length > 0 || matchesQuery(s.label))
    : cmsGroupSections;
  const otherRender = query
    ? otherSections.map(filterSectionItems).filter((s) => s.items.length > 0 || matchesQuery(s.label))
    : otherSections;
  const noMatches =
    query !== '' && filteredTopItems.length === 0 && cmsGroupRender.length === 0 && otherRender.length === 0;
  const [collapsed, setCollapsed] = useState(false);
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [resizing, setResizing] = useState(false);
  const asideRef = useRef<HTMLElement>(null);

  // Hydrate collapsed + width state from localStorage on mount
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (window.localStorage.getItem(COLLAPSED_KEY) === '1') setCollapsed(true)
    const savedWidth = Number(window.localStorage.getItem(WIDTH_KEY))
    if (Number.isFinite(savedWidth) && savedWidth > 0) setWidth(clampWidth(savedWidth))
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(COLLAPSED_KEY, collapsed ? '1' : '0')
  }, [collapsed])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(WIDTH_KEY, String(width))
  }, [width])

  // While dragging the resize handle, track the pointer and clamp the width
  // to the rail's left edge. Lock the cursor + disable text selection so the
  // drag feels continuous even when the pointer leaves the handle.
  useEffect(() => {
    if (!resizing) return
    const onMove = (e: PointerEvent) => {
      const left = asideRef.current?.getBoundingClientRect().left ?? 0
      setWidth(clampWidth(e.clientX - left))
    }
    const onUp = () => setResizing(false)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [resizing])

  const expand = () => setCollapsed(false)
  const toggle = () => setCollapsed((c) => !c)

  const GroupIcon = CMS_GROUP.icon
  const cmsGroupActive = cmsGroupSections.some((s) => isSectionActive(pathname, s))

  // Collapsed (icon-only) rail: each section is a single icon button that
  // expands the sidebar and opens that section.
  const renderSectionCollapsed = (section: NavSection) => {
    const SectionIcon = section.icon
    const isActive = isSectionActive(pathname, section)
    return (
      <button
        key={section.id}
        type="button"
        onClick={() => {
          setCollapsed(false)
          setOpenSection(section.id)
        }}
        aria-label={section.label}
        title={section.label}
        className={cn(
          'flex items-center justify-center w-12 h-12 mx-auto rounded-xl transition-colors',
          isActive
            ? 'text-[#7E5896] bg-[#F0DFF6]'
            : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
        )}
      >
        <SectionIcon className="w-5 h-5 stroke-[1.5]" />
      </button>
    )
  }

  // Expanded section: collapsible header + its item links. `nested` shrinks
  // the icon a touch so CMS sub-sections read as a level below the group.
  const renderSection = (section: NavSection, nested: boolean) => {
    const SectionIcon = section.icon
    // A search query force-opens every matching section so results are visible.
    const isOpen = query !== '' || openSection === section.id
    return (
      <div key={section.id}>
        <button
          onClick={() => setOpenSection(isOpen ? "" : section.id)}
          className={cn(
            'w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors',
            isOpen ? 'text-gray-900' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
          )}
        >
          <div className="flex items-center gap-3">
            <SectionIcon className={cn('stroke-[1.5]', nested ? 'w-4 h-4' : 'w-5 h-5')} />
            {section.label}
          </div>
          {isOpen ? (
            <ChevronDown className="w-4 h-4 text-gray-400" />
          ) : (
            <ChevronRight className="w-4 h-4 text-gray-400" />
          )}
        </button>

        {isOpen && (
          <nav className="mt-1 mb-2 space-y-0.5 pl-2 border-l border-gray-100 ml-5">
            {section.items.map((item) => {
              const Icon = item.icon
              const itemActive = isItemActive(pathname, item)
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  className={cn(
                    'w-full flex items-center gap-3 pl-3 pr-3 py-2 rounded-lg text-sm font-medium transition-colors text-left outline-none focus-visible:ring-2 focus-visible:ring-[#7E5896] focus-visible:ring-offset-1',
                    itemActive
                      ? 'bg-[#F0DFF6] text-[#7E5896]'
                      : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                  )}
                >
                  <Icon className="w-4 h-4 stroke-[1.5] shrink-0" />
                  <span className="truncate">{item.label}</span>
                </Link>
              )
            })}
          </nav>
        )}
      </div>
    )
  }

  return (
    <aside
      ref={asideRef}
      style={collapsed ? undefined : { width }}
      className={cn(
        'relative bg-white border-r border-gray-100 flex flex-col h-full h-screen sticky top-0 py-6 ease-out',
        !resizing && 'transition-[width] duration-200',
        collapsed ? 'w-[72px] px-2' : 'px-4'
      )}
    >
      {/* Header: logo + toggle */}
      <div className={cn('flex items-center mb-6', collapsed ? 'justify-center' : 'justify-between px-3')}>
        {!collapsed && (
          <Link href="/" className="flex items-center" aria-label="Home">
            <Logo className="h-8 w-auto" />
          </Link>
        )}
        <button
          type="button"
          onClick={toggle}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="text-gray-400 hover:text-gray-700 hover:bg-gray-50 p-1.5 rounded-lg transition-colors"
        >
          {collapsed ? <PanelLeftOpen className="w-5 h-5" /> : <PanelLeftClose className="w-5 h-5" />}
        </button>
      </div>

      {/* Search */}
      {collapsed ? (
        <button
          type="button"
          onClick={expand}
          aria-label="Search"
          title="Search"
          className="self-center text-gray-400 hover:text-gray-900 hover:bg-gray-50 p-2 rounded-lg transition-colors mb-4"
        >
          <Search className="w-5 h-5" />
        </button>
      ) : (
        <div className="px-1 mb-4">
          <div className="relative flex items-center">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 pointer-events-none" />
            <input
              type="text"
              placeholder="Search menu…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 pr-9 py-2 bg-gray-50 border border-gray-200 rounded-lg w-full text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#C9A0DC] focus:border-transparent transition-all"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                aria-label="Clear search"
                className="absolute right-2 grid place-items-center w-5 h-5 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Body */}
      <div className={cn('flex-1 overflow-y-auto overflow-x-hidden no-scrollbar', collapsed ? 'space-y-2' : 'space-y-1')}>
        {/* Top items */}
        <nav className={cn(collapsed ? 'space-y-1' : 'space-y-1 mb-2')}>
          {(collapsed ? topItems : filteredTopItems).map((item) => {
            const Icon = item.icon;
            const isActive = isItemActive(pathname, item);
            return (
              <Link
                key={item.label}
                href={item.href}
                title={collapsed ? item.label : undefined}
                className={cn(
                  'relative flex items-center rounded-xl text-sm font-semibold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[#7E5896] focus-visible:ring-offset-1',
                  collapsed
                    ? 'justify-center w-12 h-12 mx-auto'
                    : 'w-full justify-between px-3 py-2.5',
                  isActive
                    ? 'bg-[#F0DFF6] text-[#7E5896]'
                    : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                )}
              >
                {collapsed ? (
                  <>
                    <Icon className="w-5 h-5 stroke-[1.5]" />
                    {item.badge && (
                      <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-[#C9A0DC] ring-2 ring-white" />
                    )}
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-3">
                      <Icon className="w-5 h-5 stroke-[1.5]" />
                      {item.label}
                    </div>
                    {item.badge && (
                      <span className="bg-[#C9A0DC] text-white text-[10px] font-bold min-w-[20px] h-5 px-1.5 rounded-full flex items-center justify-center tabular-nums">
                        {item.badge}
                      </span>
                    )}
                  </>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Sections */}
        {collapsed ? (
          <>
            {cmsGroupSections.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setCollapsed(false)
                  setOpenGroup(true)
                }}
                aria-label={CMS_GROUP.label}
                title={CMS_GROUP.label}
                className={cn(
                  'flex items-center justify-center w-12 h-12 mx-auto rounded-xl transition-colors',
                  cmsGroupActive
                    ? 'text-[#7E5896] bg-[#F0DFF6]'
                    : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                )}
              >
                <GroupIcon className="w-5 h-5 stroke-[1.5]" />
              </button>
            )}
            {otherSections.map(renderSectionCollapsed)}
          </>
        ) : (
          <>
            {cmsGroupRender.length > 0 && (
              <div>
                <button
                  onClick={() => setOpenGroup((o) => !o)}
                  className={cn(
                    'w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors',
                    openGroup ? 'text-gray-900' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                  )}
                >
                  <div className="flex items-center gap-3">
                    <GroupIcon className="w-5 h-5 stroke-[1.5]" />
                    {CMS_GROUP.label}
                  </div>
                  {query !== '' || openGroup ? (
                    <ChevronDown className="w-4 h-4 text-gray-400" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-gray-400" />
                  )}
                </button>

                {(query !== '' || openGroup) && (
                  <div className="mt-1 mb-1 ml-3 pl-1 border-l border-gray-100 space-y-0.5">
                    {cmsGroupRender.map((s) => renderSection(s, true))}
                  </div>
                )}
              </div>
            )}
            {otherRender.map((s) => renderSection(s, false))}
            {noMatches && (
              <p className="px-3 py-6 text-center text-sm text-gray-400">
                No menu items match “{search.trim()}”.
              </p>
            )}
          </>
        )}
      </div>

      {/* Footer — account profile with a Log out menu. */}
      <div className="mt-auto border-t border-gray-100 pt-3">
        <SidebarProfile profile={profile} collapsed={collapsed} />
      </div>

      {/* Drag-to-resize handle on the right edge (expanded rail only).
          Double-click resets to the default width. */}
      {!collapsed && (
        <div
          onPointerDown={(e) => {
            e.preventDefault()
            setResizing(true)
          }}
          onDoubleClick={() => setWidth(DEFAULT_WIDTH)}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize sidebar"
          title="Drag to resize"
          className="absolute inset-y-0 right-0 w-1.5 translate-x-1/2 cursor-col-resize"
        />
      )}
    </aside>
  );
}

// Account row pinned to the bottom of the sidebar: avatar + name + email,
// opening a popover with Manage account + Sign out. This is the single account
// control for the admin (the top-nav Clerk UserButton was removed in favour of
// it), mirroring the familiar app-shell account menu.
function SidebarProfile({
  profile,
  collapsed,
}: {
  profile: CallerProfile
  collapsed: boolean
}) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const ref = useRef<HTMLDivElement>(null)
  // ClerkProvider wraps the whole app (root layout), so the client-side hook is
  // safe here — it drives Clerk's hosted "Manage account" modal.
  const { openUserProfile } = useClerk()

  const handleManageAccount = () => {
    setOpen(false)
    openUserProfile()
  }

  // Close on outside click / Esc.
  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const initials =
    profile.name
      .split(/\s+/)
      .map((p: string) => p[0])
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase() || 'A'

  const handleLogout = () => {
    startTransition(async () => {
      // Sign out server-side (revoke Clerk session + clear the host- and
      // apex-domain session cookies, including the legacy temp-access cookie),
      // then land on Clerk sign-in. Kept as a server action — rather than
      // Clerk's client signOut — so the apex-cookie clearing stays in one place.
      await adminSignOut()
      window.location.href = '/sign-in'
    })
  }

  const avatar = (
    <span className="relative grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-full bg-[#F0DFF6] text-xs font-bold text-[#7E5896] ring-1 ring-black/5">
      {profile.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={profile.imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        initials
      )}
    </span>
  )

  return (
    <div ref={ref} className="relative">
      {open && (
        <div
          role="menu"
          className="absolute bottom-full left-0 right-0 mb-2 overflow-hidden rounded-xl border border-gray-100 bg-white py-1 shadow-lg"
        >
          <button
            type="button"
            role="menuitem"
            onClick={handleManageAccount}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <Settings className="h-4 w-4 stroke-[1.5] text-gray-400" />
            Manage account
          </button>
          <div className="my-1 border-t border-gray-100" />
          <button
            type="button"
            role="menuitem"
            onClick={handleLogout}
            disabled={pending}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50"
          >
            <LogOut className="h-4 w-4 stroke-[1.5]" />
            {pending ? 'Logging out…' : 'Log out'}
          </button>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={collapsed ? profile.name : undefined}
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          'flex items-center rounded-xl transition-colors hover:bg-gray-50',
          collapsed ? 'justify-center w-12 h-12 mx-auto' : 'w-full gap-3 px-2 py-2',
        )}
      >
        {avatar}
        {!collapsed && (
          <>
            <span className="min-w-0 flex-1 text-left">
              <span className="block truncate text-sm font-semibold text-gray-900">
                {profile.name}
              </span>
              {profile.email && (
                <span className="block truncate text-xs text-gray-400">{profile.email}</span>
              )}
            </span>
            <ChevronDown
              className={cn(
                'h-4 w-4 shrink-0 text-gray-400 transition-transform',
                open && 'rotate-180',
              )}
            />
          </>
        )}
      </button>
    </div>
  )
}
