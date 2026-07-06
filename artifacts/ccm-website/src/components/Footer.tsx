import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { Mail, Phone, MapPin, Clock, Facebook, Youtube, Instagram, Twitter, ExternalLink } from "lucide-react";
import { motion } from "framer-motion";
import { useSiteSettings, TRANSPARENT_PX } from "@/lib/site-settings";
import { useSettingsResolved } from "@/lib/boot-gate";
import { useEditMode } from "@/lib/edit-mode";
import { usePageBlocks } from "@/lib/usePageBlocks";
import { withTenant } from "@/lib/tenant-fetch";
import EditableText from "@/components/cms/EditableText";
import EditableSetting from "@/components/cms/EditableSetting";
import EditableImage from "@/components/cms/EditableImage";
import SectionColor from "@/components/cms/SectionColor";

type FooterItem = {
  id: string;
  parentId: string | null;
  label: string;
  linkType: "page" | "url";
  target: string;
  openInNewTab: boolean;
  sortOrder: number;
};

type FooterGroup = FooterItem & { children: FooterItem[] };

function FooterLink({ item }: { item: FooterItem }) {
  const cls = "group flex items-center gap-2 text-white/55 hover:text-white text-[13px] leading-snug transition-colors duration-150";
  const inner = (
    <>
      <span
        className="w-1.5 h-1.5 rounded-full flex-shrink-0 transition-all duration-150 group-hover:scale-125"
        style={{ background: "var(--color-accent)" }}
      />
      {item.label}
    </>
  );
  if (item.linkType === "url") {
    return (
      <a href={item.target} target={item.openInNewTab ? "_blank" : undefined}
        rel={item.openInNewTab ? "noopener noreferrer" : undefined} className={cls}>
        {inner}
      </a>
    );
  }
  return <Link href={item.target || "/"} className={cls}>{inner}</Link>;
}

function ColHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <h4
        className="text-[11px] font-bold uppercase tracking-[0.18em] mb-2"
        style={{ color: "var(--color-accent)" }}
      >
        {children}
      </h4>
      <div className="flex items-center gap-1">
        <div className="w-6 h-[2px] rounded-full" style={{ background: "var(--color-accent)" }} />
        <div className="w-1.5 h-[2px] rounded-full" style={{ background: "var(--color-accent)", opacity: 0.4 }} />
      </div>
    </div>
  );
}

export default function Footer() {
  const settings = useSiteSettings();
  const { enabled, saveSetting } = useEditMode();
  const settingsResolved = useSettingsResolved();
  // See Navbar: never fall back to the bundled CCM logo.png until the tenant's
  // settings have RESOLVED, or other tenants flash it during the logo src swap.
  // Gating on settingsResolved (not booted) also withholds it when the boot
  // gate's safety net fires before settings load. Transparent pixel until then.
  const footerLogoSrc =
    settings.footer_logo ||
    settings.site_logo ||
    (settingsResolved ? `${import.meta.env.BASE_URL}logo.png` : TRANSPARENT_PX);
  const blocks = usePageBlocks("global");

  const footerLogoSizeFromSettings = Math.max(32, Number(settings.footer_logo_size) || 56);
  const [localFooterSize, setLocalFooterSize] = useState(footerLogoSizeFromSettings);
  const saveSizeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setLocalFooterSize(Math.max(32, Number(settings.footer_logo_size) || 56));
  }, [settings.footer_logo_size]);

  function handleFooterSizeChange(v: number) {
    const clamped = Math.max(32, Math.min(200, v));
    setLocalFooterSize(clamped);
    if (saveSizeTimer.current) clearTimeout(saveSizeTimer.current);
    saveSizeTimer.current = setTimeout(() => {
      saveSetting("footer_logo_size", String(clamped)).catch(() => {});
    }, 500);
  }

  const [footerMenu, setFooterMenu] = useState<FooterItem[]>([]);

  useEffect(() => {
    let active = true;
    fetch(withTenant("/api/website/menu?location=footer"))
      .then(r => (r.ok ? r.json() : []))
      .then((rows: FooterItem[]) => {
        if (active && Array.isArray(rows)) setFooterMenu(rows);
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  const sortFn = (a: FooterItem, b: FooterItem) => a.sortOrder - b.sortOrder;
  const footerGroups: FooterGroup[] = footerMenu
    .filter(m => !m.parentId)
    .sort(sortFn)
    .map(m => ({
      ...m,
      children: footerMenu.filter(c => c.parentId === m.id).sort(sortFn),
    }));

  const hasSocial = settings.social_facebook || settings.social_youtube ||
    settings.social_instagram || settings.social_twitter;

  return (
    <SectionColor
      as="footer"
      page="global"
      scope="footer"
      label="Footer"
      kind="dark"
      className="text-white overflow-hidden"
      style={{
        background: "linear-gradient(160deg, #0d1b2a 0%, #11203a 40%, #0d1b2a 100%)",
        borderTop: "3px solid var(--color-accent)",
      }}
      data-testid="footer"
    >
      {/* Decorative top accent bar */}
      <div
        className="h-[1px] w-full opacity-20"
        style={{ background: "linear-gradient(90deg, transparent, var(--color-accent), transparent)" }}
      />

      {/* ── Main columns ── */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-40px" }}
        transition={{ duration: 0.5 }}
        className="max-w-7xl mx-auto px-6 pt-10 pb-6"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-8">

          {/* ── Brand column ── */}
          <div className="lg:col-span-4 flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <EditableImage
                src={footerLogoSrc}
                alt="College official logo"
                settingKey="footer_logo"
                imgClassName="object-contain flex-shrink-0 drop-shadow-lg"
                imgStyle={{ width: localFooterSize, height: localFooterSize }}
                width={localFooterSize}
                height={localFooterSize}
              />
              {enabled && (
                <div className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-black/30 text-white/60">
                  <span className="text-[10px]">Size</span>
                  <input type="range" min={32} max={200} step={4} value={localFooterSize}
                    onChange={e => handleFooterSizeChange(Number(e.target.value))}
                    className="w-14" />
                  <input type="number" min={32} max={200} value={localFooterSize}
                    onChange={e => handleFooterSizeChange(Number(e.target.value))}
                    className="w-10 text-center rounded border border-white/20 bg-transparent text-[10px] py-0.5" />
                  <span className="text-[10px] opacity-60">px</span>
                </div>
              )}
            </div>

            <p className="text-sm font-semibold italic" style={{ color: "var(--color-accent)" }}>
              "<EditableSetting as="span" settingKey="college_tagline" value={settings.college_tagline} />"
            </p>

            <EditableSetting
              as="p"
              multiline
              settingKey="college_description"
              value={settings.college_description}
              className="text-[13px] text-white/55 leading-relaxed"
            />

            {/* Social icons */}
            {hasSocial && (
              <div className="flex items-center gap-2 mt-1">
                {settings.social_facebook && (
                  <a href={settings.social_facebook} target="_blank" rel="noopener noreferrer"
                    className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors duration-150"
                    style={{ background: "rgba(255,255,255,0.07)" }}
                    onMouseEnter={e => (e.currentTarget.style.background = "var(--color-accent)")}
                    onMouseLeave={e => (e.currentTarget.style.background = "rgba(255,255,255,0.07)")}
                  >
                    <Facebook className="w-3.5 h-3.5" />
                  </a>
                )}
                {settings.social_youtube && (
                  <a href={settings.social_youtube} target="_blank" rel="noopener noreferrer"
                    className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors duration-150"
                    style={{ background: "rgba(255,255,255,0.07)" }}
                    onMouseEnter={e => (e.currentTarget.style.background = "var(--color-accent)")}
                    onMouseLeave={e => (e.currentTarget.style.background = "rgba(255,255,255,0.07)")}
                  >
                    <Youtube className="w-3.5 h-3.5" />
                  </a>
                )}
                {settings.social_instagram && (
                  <a href={settings.social_instagram} target="_blank" rel="noopener noreferrer"
                    className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors duration-150"
                    style={{ background: "rgba(255,255,255,0.07)" }}
                    onMouseEnter={e => (e.currentTarget.style.background = "var(--color-accent)")}
                    onMouseLeave={e => (e.currentTarget.style.background = "rgba(255,255,255,0.07)")}
                  >
                    <Instagram className="w-3.5 h-3.5" />
                  </a>
                )}
                {settings.social_twitter && (
                  <a href={settings.social_twitter} target="_blank" rel="noopener noreferrer"
                    className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors duration-150"
                    style={{ background: "rgba(255,255,255,0.07)" }}
                    onMouseEnter={e => (e.currentTarget.style.background = "var(--color-accent)")}
                    onMouseLeave={e => (e.currentTarget.style.background = "rgba(255,255,255,0.07)")}
                  >
                    <Twitter className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>
            )}
          </div>

          {/* ── Dynamic link groups ── */}
          {footerGroups.map(group => (
            <motion.div
              key={group.id}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: 0.1 }}
              className="lg:col-span-2 flex flex-col"
            >
              <ColHeading>{group.label}</ColHeading>
              <ul className="space-y-2.5">
                {group.children.map(link => (
                  <li key={link.id}>
                    <FooterLink item={link} />
                  </li>
                ))}
              </ul>
            </motion.div>
          ))}

          {/* ── Contact Info ── */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: 0.15 }}
            className="lg:col-span-4 flex flex-col"
          >
            <ColHeading>
              <EditableText
                as="span"
                page="global"
                blockKey="footer_contact_heading"
                value={blocks.footer_contact_heading || "Contact Info"}
              />
            </ColHeading>

            <ul className="space-y-3">
              {[
                {
                  icon: <MapPin className="w-3.5 h-3.5" />,
                  content: (
                    <EditableSetting
                      as="span"
                      multiline
                      settingKey="contact_address"
                      value={settings.contact_address}
                      className="text-white/60 text-[13px] leading-snug"
                    />
                  ),
                },
                {
                  icon: <Phone className="w-3.5 h-3.5" />,
                  content: (
                    <div className="text-[13px] text-white/60">
                      <a href={`tel:${settings.contact_uan}`} className="hover:text-white transition-colors block">
                        UAN: <EditableSetting as="span" settingKey="contact_uan" value={settings.contact_uan} />
                      </a>
                      {settings.contact_landline && (
                        <a href={`tel:${settings.contact_landline}`} className="hover:text-white transition-colors block mt-0.5">
                          <EditableSetting as="span" settingKey="contact_landline" value={settings.contact_landline} />
                        </a>
                      )}
                    </div>
                  ),
                },
                {
                  icon: <Mail className="w-3.5 h-3.5" />,
                  content: (
                    <a href={`mailto:${settings.contact_email}`}
                      className="text-white/60 hover:text-white transition-colors text-[13px] break-all">
                      <EditableSetting as="span" settingKey="contact_email" value={settings.contact_email} />
                    </a>
                  ),
                },
                {
                  icon: <Clock className="w-3.5 h-3.5" />,
                  content: (
                    <EditableSetting
                      as="span"
                      settingKey="contact_hours"
                      value={settings.contact_hours}
                      className="text-white/60 text-[13px]"
                    />
                  ),
                },
              ].map(({ icon, content }, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span
                    className="w-6 h-6 rounded flex items-center justify-center flex-shrink-0 mt-0.5"
                    style={{ background: "rgba(255,255,255,0.06)", color: "var(--color-accent)" }}
                  >
                    {icon}
                  </span>
                  {content}
                </li>
              ))}

              {settings.contact_maps_url && (
                <li>
                  <a
                    href={settings.contact_maps_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-[12px] font-medium px-3 py-1.5 rounded-md transition-colors"
                    style={{ background: "rgba(255,255,255,0.07)", color: "var(--color-accent)" }}
                    onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.12)")}
                    onMouseLeave={e => (e.currentTarget.style.background = "rgba(255,255,255,0.07)")}
                  >
                    <MapPin className="w-3 h-3" />
                    View on Map
                    <ExternalLink className="w-3 h-3 opacity-60" />
                  </a>
                </li>
              )}
            </ul>
          </motion.div>
        </div>
      </motion.div>

      {/* ── Disclaimer ── */}
      <div className="max-w-7xl mx-auto px-6 pb-5">
        <div className="border-t pt-4" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
          <EditableText
            as="p"
            multiline
            page="global"
            blockKey="footer_disclaimer"
            value={blocks.footer_disclaimer || "Cadet College Murree is governed by a Board of Directors. It is a non-profit, interdenominational institution and is not an official activity of the Pakistan Armed Forces."}
            className="text-[11px] text-white/35 leading-relaxed max-w-3xl"
          />
        </div>
      </div>

      {/* ── Bottom bar ── */}
      <div style={{ background: "rgba(0,0,0,0.35)", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="max-w-7xl mx-auto px-6 py-3 flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] text-white/35">
          <p>
            <EditableText
              as="span"
              page="global"
              blockKey="footer_copyright"
              value={blocks.footer_copyright || `© ${new Date().getFullYear()} Cadet College Murree. All rights reserved.`}
            />
          </p>
          <nav className="flex items-center gap-4">
            <Link href="/privacy" className="hover:text-white transition-colors" data-testid="footer-privacy">
              <EditableText as="span" page="global" blockKey="footer_privacy_label" value={blocks.footer_privacy_label || "Privacy Policy"} />
            </Link>
            <span className="opacity-30">·</span>
            <Link href="/terms" className="hover:text-white transition-colors" data-testid="footer-terms">
              <EditableText as="span" page="global" blockKey="footer_terms_label" value={blocks.footer_terms_label || "Terms of Service"} />
            </Link>
          </nav>
          <p>
            <EditableText
              as="span"
              page="global"
              blockKey="footer_location"
              value={blocks.footer_location || `Murree Hills, Punjab, Pakistan · Est. ${settings.college_established}`}
            />
          </p>
        </div>
      </div>
    </SectionColor>
  );
}
