import React, { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Menu, Phone, Mail, ChevronDown } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { motion } from "framer-motion";
import { useSiteSettings, TRANSPARENT_PX } from "@/lib/site-settings";
import { useSettingsResolved } from "@/lib/boot-gate";
import { useEditMode } from "@/lib/edit-mode";
import { useTenantResource } from "@/lib/tenant-cache";
import EditableImage from "@/components/cms/EditableImage";

type MenuItem = {
  id: string;
  parentId: string | null;
  label: string;
  linkType: "page" | "url";
  target: string;
  openInNewTab: boolean;
  isCta: boolean;
  isPublished: boolean;
  sortOrder: number;
};

type MenuNode = MenuItem & { children: MenuItem[] };

function isExternalLink(item: { linkType: string; openInNewTab?: boolean }): boolean {
  return item.linkType === "url";
}

/**
 * A nav link that renders an internal wouter <Link> or an external <a>.
 *
 * MUST forward its ref and spread any injected props onto the underlying
 * anchor. This component is used as the child of `asChild` parents (Radix
 * `DropdownMenuItem`, our `Button`), which rely on Radix `Slot` to merge their
 * click/keyboard handlers and ref onto the child. A plain function component
 * silently drops those, which broke client-side navigation from the navbar
 * dropdown (the link only worked after a full page refresh).
 */
const MenuLink = React.forwardRef<
  HTMLAnchorElement,
  {
    item: MenuItem;
    className?: string;
    children: React.ReactNode;
    "data-testid"?: string;
  } & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href">
>(function MenuLink(
  { item, className, children, "data-testid": testId, ...rest },
  ref,
) {
  if (isExternalLink(item)) {
    return (
      <a
        {...rest}
        ref={ref}
        href={item.target}
        target={item.openInNewTab ? "_blank" : undefined}
        rel={item.openInNewTab ? "noopener noreferrer" : undefined}
        className={className}
        data-testid={testId}
      >
        {children}
      </a>
    );
  }
  return (
    <Link
      ref={ref}
      href={item.target || "/"}
      className={className}
      data-testid={testId}
      {...rest}
    >
      {children}
    </Link>
  );
});
MenuLink.displayName = "MenuLink";

export default function Navbar() {
  const [location] = useLocation();
  const settings = useSiteSettings();
  const { enabled, saveSetting } = useEditMode();
  const settingsResolved = useSettingsResolved();
  // logo.png is CCM's emblem. Until the tenant's real settings have RESOLVED we
  // must NOT use it as a fallback, or non-CCM tenants load it and the <img> keeps
  // painting it during the src swap to the real logo — the "wrong-tenant logo
  // flash". Gating on settingsResolved (not booted) keeps it withheld even when
  // the boot gate's safety net fires before settings load. A transparent pixel
  // holds the slot (no network request, no stale frame) until site_logo resolves.
  const logoSrc =
    settings.site_logo || (settingsResolved ? `${import.meta.env.BASE_URL}logo.png` : TRANSPARENT_PX);

  const navLogoSizeFromSettings = Math.max(40, Number(settings.nav_logo_size) || 80);
  const [localNavSize, setLocalNavSize] = useState(navLogoSizeFromSettings);
  const saveSizeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setLocalNavSize(Math.max(40, Number(settings.nav_logo_size) || 80));
  }, [settings.nav_logo_size]);

  function handleNavSizeChange(v: number) {
    const clamped = Math.max(40, Math.min(300, v));
    setLocalNavSize(clamped);
    if (saveSizeTimer.current) clearTimeout(saveSizeTimer.current);
    saveSizeTimer.current = setTimeout(() => {
      saveSetting("nav_logo_size", String(clamped)).catch(() => {});
    }, 500);
  }

  // Per-tenant cached menu so a refresh paints THIS tenant's nav on the first
  // frame instead of an empty bar (or, previously, another tenant's items).
  const menu = useTenantResource<MenuItem[]>(
    "menu",
    "/api/website/menu",
    [],
    (rows) => (Array.isArray(rows) ? (rows as MenuItem[]) : []),
  );

  // Build a one-level tree: top-level nodes (non-CTA, no parent) with their children.
  const cta = menu.find(m => m.isCta) ?? null;
  const sortFn = (a: MenuItem, b: MenuItem) => a.sortOrder - b.sortOrder;
  const topNodes: MenuNode[] = menu
    .filter(m => !m.isCta && !m.parentId)
    .sort(sortFn)
    .map(m => ({
      ...m,
      children: menu.filter(c => !c.isCta && c.parentId === m.id).sort(sortFn),
    }));

  const isItemActive = (item: MenuItem) => item.linkType === "page" && location === item.target;
  const isNodeActive = (node: MenuNode) =>
    isItemActive(node) || node.children.some(isItemActive);

  return (
    <motion.header
      initial={{ y: -80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      className="sticky top-0 z-50 w-full shadow-lg"
      data-testid="header-nav"
    >
      {/* Top info bar — always dark surface colour */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4, duration: 0.4 }}
        className="text-white/75 py-2 px-4 hidden md:block text-xs"
        style={{ background: "var(--surface-dark)" }}
      >
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <span className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            Opened Between {settings.contact_hours}
          </span>
          <div className="flex items-center gap-6">
            <a
              href={`mailto:${settings.contact_email}`}
              className="flex items-center gap-1.5 hover:text-accent transition-colors"
              data-testid="topbar-email"
            >
              <Mail className="w-3 h-3" />
              {settings.contact_email}
            </a>
            <a
              href={`tel:${settings.topbar_phone}`}
              className="flex items-center gap-1.5 hover:text-accent transition-colors"
              data-testid="topbar-phone"
            >
              <Phone className="w-3 h-3" />
              {settings.topbar_phone}
            </a>
          </div>
        </div>
      </motion.div>

      {/* ── Main nav bar — all colours driven by CSS vars (--nav-bg / --nav-fg / --nav-border-color) ── */}
      <div className="site-nav-bar">
        <div className="max-w-7xl mx-auto px-4 h-24 flex items-center justify-between">

          {/* Logo — fixed height, slider floats below as overlay */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2, duration: 0.5 }}
            className="relative flex-shrink-0 h-full flex items-center"
          >
            {/* In edit mode, remove the Link wrapper so clicking "Change image"
                doesn't trigger navigation. In normal mode keep the Link. */}
            {enabled ? (
              <div className="flex items-center flex-shrink-0" data-testid="nav-logo">
                <motion.div className="h-[72px] flex items-center justify-center flex-shrink-0">
                  <EditableImage
                    src={logoSrc}
                    alt="Cadet College Murree Punjab Pakistan official logo"
                    settingKey="site_logo"
                    imgClassName="object-contain h-full w-auto"
                    imgStyle={{ maxHeight: 72, width: localNavSize }}
                    width={localNavSize}
                    height={localNavSize}
                    loading="eager"
                  />
                </motion.div>
              </div>
            ) : (
              <Link href="/" className="flex items-center flex-shrink-0" data-testid="nav-logo">
                <motion.div
                  className="h-[72px] flex items-center justify-center flex-shrink-0"
                >
                  <EditableImage
                    src={logoSrc}
                    alt="Cadet College Murree Punjab Pakistan official logo"
                    settingKey="site_logo"
                    imgClassName="object-contain h-full w-auto"
                    imgStyle={{ maxHeight: 72, width: localNavSize }}
                    width={localNavSize}
                    height={localNavSize}
                    loading="eager"
                  />
                </motion.div>
              </Link>
            )}
            {/* Size controls float below the nav bar — don't affect layout */}
            {enabled && (
              <div
                className="absolute left-0 top-full mt-1 z-50 flex items-center gap-1.5 px-2 py-1 rounded shadow-md text-xs font-medium select-none whitespace-nowrap"
                style={{ background: "hsl(var(--primary) / 0.92)", color: "#fff" }}
                onClick={e => e.preventDefault()}
              >
                <span className="opacity-75">Logo size</span>
                <input
                  type="range"
                  min={40}
                  max={300}
                  step={4}
                  value={localNavSize}
                  onChange={e => handleNavSizeChange(Number(e.target.value))}
                  className="w-20 accent-white"
                  title="Adjust navbar logo size"
                />
                <input
                  type="number"
                  min={40}
                  max={300}
                  value={localNavSize}
                  onChange={e => handleNavSizeChange(Number(e.target.value))}
                  className="w-12 text-center rounded border border-white/30 bg-transparent text-xs py-0.5"
                  title="Logo size in pixels"
                />
                <span className="opacity-60">px</span>
              </div>
            )}
          </motion.div>

          {/* Desktop Nav — links use .nav-link / .nav-link--active CSS classes (var-driven) */}
          <nav className="hidden xl:flex items-center gap-0.5" aria-label="Main navigation">
            {topNodes.map((node, i) => {
              // Parent with dropdown children
              if (node.children.length > 0) {
                return (
                  <motion.div
                    key={node.id}
                    initial={{ opacity: 0, y: -12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 + i * 0.04, duration: 0.4 }}
                  >
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          className={`nav-dropdown-trigger ${isNodeActive(node) ? "nav-dropdown-trigger--active" : ""}`}
                        >
                          {node.label} <ChevronDown className="w-3 h-3" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="min-w-[160px]">
                        {node.children.map(child => (
                          <DropdownMenuItem key={child.id} asChild>
                            <MenuLink item={child} className="cursor-pointer">
                              {child.label}
                            </MenuLink>
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </motion.div>
                );
              }

              // Leaf top-level link
              const isActive = isItemActive(node);
              return (
                <motion.div
                  key={node.id}
                  initial={{ opacity: 0, y: -12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 + i * 0.04, duration: 0.4 }}
                  className="relative"
                >
                  <MenuLink item={node} className={`nav-link ${isActive ? "nav-link--active" : ""}`}>
                    {node.label}
                  </MenuLink>
                  {isActive && (
                    <motion.span
                      layoutId="nav-indicator"
                      className="nav-indicator-bar absolute bottom-0 left-3 right-3 h-0.5 rounded-full"
                      transition={{ type: "spring", stiffness: 380, damping: 30 }}
                    />
                  )}
                </motion.div>
              );
            })}

            {/* CTA button — colour from --nav-cta-bg / --nav-cta-fg */}
            {cta && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.55, duration: 0.4, type: "spring" }}
              >
                <Button
                  asChild
                  size="sm"
                  className="nav-cta-btn ml-2 font-bold shadow-md whitespace-nowrap"
                  data-testid="nav-result-button"
                >
                  <MenuLink item={cta}>{cta.label}</MenuLink>
                </Button>
              </motion.div>
            )}
          </nav>

          {/* Mobile hamburger — inherits nav-fg from .site-nav-bar */}
          <div className="xl:hidden">
            <Sheet>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  style={{ color: "var(--nav-fg)" }}
                  className="hover:opacity-80"
                  data-testid="mobile-menu-trigger"
                >
                  <Menu className="h-6 w-6" />
                  <span className="sr-only">Toggle menu</span>
                </Button>
              </SheetTrigger>

              {/* Mobile drawer — also var-driven via .site-nav-bar class */}
              <SheetContent
                side="right"
                className="site-nav-bar w-72 p-0"
                style={{ borderLeftColor: "var(--nav-border-color, transparent)" }}
              >
                <div
                  className="flex items-center gap-3 p-5 border-b"
                  style={{ borderColor: "color-mix(in srgb, var(--nav-fg) 15%, transparent)" }}
                >
                  <img
                    src={logoSrc}
                    alt="Cadet College Murree logo"
                    width={56}
                    height={56}
                    className="h-14 w-14 object-contain flex-shrink-0"
                  />
                </div>

                <nav className="flex flex-col p-4 gap-0.5">
                  {topNodes.flatMap(node =>
                    // Parent items contribute their children (flattened); leaves contribute themselves.
                    node.children.length > 0 ? node.children : [node],
                  ).map((item, i) => (
                    <motion.div
                      key={item.id}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.04, duration: 0.3 }}
                    >
                      <MenuLink
                        item={item}
                        className={`nav-link ${isItemActive(item) ? "nav-link--active" : ""}`}
                      >
                        {item.label}
                      </MenuLink>
                    </motion.div>
                  ))}
                  {cta && (
                    <Button
                      asChild
                      className="nav-cta-btn font-bold mt-3"
                      data-testid="mobile-result-button"
                    >
                      <MenuLink item={cta}>{cta.label}</MenuLink>
                    </Button>
                  )}
                </nav>

                <div
                  className="mx-4 mt-2 pt-4 border-t space-y-2 text-xs"
                  style={{
                    borderColor: "color-mix(in srgb, var(--nav-fg) 15%, transparent)",
                    color: "var(--nav-fg)",
                    opacity: 0.65,
                  }}
                >
                  <a
                    href={`tel:${settings.topbar_phone}`}
                    className="flex items-center gap-2 hover:opacity-100 transition-opacity"
                  >
                    <Phone className="w-3 h-3" /> {settings.topbar_phone}
                  </a>
                  <a
                    href={`mailto:${settings.contact_email}`}
                    className="flex items-center gap-2 hover:opacity-100 transition-opacity"
                  >
                    <Mail className="w-3 h-3" /> {settings.contact_email}
                  </a>
                </div>
              </SheetContent>
            </Sheet>
          </div>

        </div>
      </div>
    </motion.header>
  );
}
