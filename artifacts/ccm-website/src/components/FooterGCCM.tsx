import { useEffect, useState } from "react";
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
  const cls =
    "group flex items-center gap-2 text-white/55 hover:text-white text-[13px] leading-snug transition-colors duration-150";
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
      <a
        href={item.target}
        target={item.openInNewTab ? "_blank" : undefined}
        rel={item.openInNewTab ? "noopener noreferrer" : undefined}
        className={cls}
      >
        {inner}
      </a>
    );
  }
  return <Link href={item.target || "/"} className={cls}>{inner}</Link>;
}

function ColHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <h4
        className="text-[11px] font-bold uppercase tracking-[0.18em] mb-1.5"
        style={{ color: "var(--color-accent)" }}
      >
        {children}
      </h4>
      <div className="flex items-center gap-1">
        <div className="w-5 h-[2px] rounded-full" style={{ background: "var(--color-accent)" }} />
        <div className="w-1.5 h-[2px] rounded-full" style={{ background: "var(--color-accent)", opacity: 0.4 }} />
      </div>
    </div>
  );
}

function SocialIcon({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="w-7 h-7 rounded-md flex items-center justify-center transition-colors duration-150"
      style={{ background: "rgba(255,255,255,0.07)" }}
      onMouseEnter={e => (e.currentTarget.style.background = "var(--color-accent)")}
      onMouseLeave={e => (e.currentTarget.style.background = "rgba(255,255,255,0.07)")}
    >
      {children}
    </a>
  );
}

export default function FooterGCCM() {
  const settings = useSiteSettings();
  const settingsResolved = useSettingsResolved();
  const { enabled } = useEditMode();
  const blocks = usePageBlocks("global");

  // logo.png is CCM's emblem — withhold it until this tenant's settings resolve
  // (gated on settingsResolved, not booted), so a safety-net fail-open never
  // flashes it here. Transparent pixel holds the slot until the real logo loads.
  const logoSrc =
    settings.footer_logo ||
    settings.site_logo ||
    (settingsResolved ? `${import.meta.env.BASE_URL}logo.png` : TRANSPARENT_PX);
  const logoSize = Math.max(32, Number(settings.footer_logo_size) || 48);

  const [footerMenu, setFooterMenu] = useState<FooterItem[]>([]);
  useEffect(() => {
    let active = true;
    fetch(withTenant("/api/website/menu?location=footer"))
      .then(r => (r.ok ? r.json() : []))
      .then((rows: FooterItem[]) => { if (active && Array.isArray(rows)) setFooterMenu(rows); })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  const sortFn = (a: FooterItem, b: FooterItem) => a.sortOrder - b.sortOrder;
  const footerGroups: FooterGroup[] = footerMenu
    .filter(m => !m.parentId)
    .sort(sortFn)
    .map(m => ({ ...m, children: footerMenu.filter(c => c.parentId === m.id).sort(sortFn) }));

  const hasSocial =
    settings.social_facebook || settings.social_youtube ||
    settings.social_instagram || settings.social_twitter;

  const contactItems = [
    settings.contact_address && {
      icon: <MapPin className="w-3.5 h-3.5" />,
      content: (
        <EditableSetting
          as="span" multiline settingKey="contact_address"
          value={settings.contact_address}
          className="text-white/55 text-[13px] leading-snug"
        />
      ),
    },
    (settings.contact_uan || settings.contact_landline) && {
      icon: <Phone className="w-3.5 h-3.5" />,
      content: (
        <div className="text-[13px] text-white/55">
          {settings.contact_uan && (
            <a href={`tel:${settings.contact_uan}`} className="hover:text-white transition-colors block">
              UAN: <EditableSetting as="span" settingKey="contact_uan" value={settings.contact_uan} />
            </a>
          )}
          {settings.contact_landline && (
            <a href={`tel:${settings.contact_landline}`} className="hover:text-white transition-colors block mt-0.5">
              <EditableSetting as="span" settingKey="contact_landline" value={settings.contact_landline} />
            </a>
          )}
        </div>
      ),
    },
    settings.contact_email && {
      icon: <Mail className="w-3.5 h-3.5" />,
      content: (
        <a href={`mailto:${settings.contact_email}`}
          className="text-white/55 hover:text-white transition-colors text-[13px] break-all">
          <EditableSetting as="span" settingKey="contact_email" value={settings.contact_email} />
        </a>
      ),
    },
    settings.contact_hours && {
      icon: <Clock className="w-3.5 h-3.5" />,
      content: (
        <EditableSetting as="span" settingKey="contact_hours" value={settings.contact_hours}
          className="text-white/55 text-[13px]" />
      ),
    },
  ].filter(Boolean) as { icon: React.ReactNode; content: React.ReactNode }[];

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
      {/* thin accent glow line */}
      <div
        className="h-px w-full opacity-20"
        style={{ background: "linear-gradient(90deg, transparent, var(--color-accent), transparent)" }}
      />

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-40px" }}
        transition={{ duration: 0.45 }}
        className="max-w-7xl mx-auto px-6 pt-8 pb-5"
      >
        {/* ── Main grid ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-x-6 gap-y-7 items-start">

          {/* Brand — logo top-left, tagline + description below */}
          <div className="lg:col-span-4 flex flex-col gap-2">
            {/* Logo pinned to top */}
            <div className="flex items-start gap-2">
              <EditableImage
                src={logoSrc}
                alt="Girls Cadet College Murree official logo"
                settingKey="footer_logo"
                imgClassName="object-contain flex-shrink-0 drop-shadow-md"
                imgStyle={{ width: logoSize, height: logoSize }}
                width={logoSize}
                height={logoSize}
              />
              {enabled && (
                <span className="text-[9px] text-white/40 mt-1">logo {logoSize}px</span>
              )}
            </div>

            {/* Tagline directly below logo */}
            <p className="text-[11px] font-semibold italic" style={{ color: "var(--color-accent)" }}>
              "<EditableSetting as="span" settingKey="college_tagline" value={settings.college_tagline} />"
            </p>

            {/* Description — tighter line height, shorter */}
            <EditableSetting
              as="p"
              multiline
              settingKey="college_description"
              value={settings.college_description}
              className="text-[12.5px] text-white/50 leading-relaxed"
            />

            {/* Social icons */}
            {hasSocial && (
              <div className="flex items-center gap-1.5 mt-0.5">
                {settings.social_facebook && (
                  <SocialIcon href={settings.social_facebook}><Facebook className="w-3.5 h-3.5" /></SocialIcon>
                )}
                {settings.social_youtube && (
                  <SocialIcon href={settings.social_youtube}><Youtube className="w-3.5 h-3.5" /></SocialIcon>
                )}
                {settings.social_instagram && (
                  <SocialIcon href={settings.social_instagram}><Instagram className="w-3.5 h-3.5" /></SocialIcon>
                )}
                {settings.social_twitter && (
                  <SocialIcon href={settings.social_twitter}><Twitter className="w-3.5 h-3.5" /></SocialIcon>
                )}
              </div>
            )}
          </div>

          {/* ── Dynamic link groups ── */}
          {footerGroups.map((group, idx) => (
            <motion.div
              key={group.id}
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.35, delay: 0.08 * idx }}
              className="lg:col-span-2 flex flex-col"
            >
              <ColHeading>{group.label}</ColHeading>
              <ul className="space-y-2">
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
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.35, delay: 0.15 }}
            className="lg:col-span-4 flex flex-col"
          >
            <ColHeading>
              <EditableText
                as="span" page="global" blockKey="footer_contact_heading"
                value={blocks.footer_contact_heading || "Contact Info"}
              />
            </ColHeading>

            <ul className="space-y-2.5">
              {contactItems.map(({ icon, content }, i) => (
                <li key={i} className="flex items-start gap-2.5">
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
                    className="inline-flex items-center gap-1.5 text-[12px] font-medium px-3 py-1.5 rounded-md transition-colors mt-0.5"
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
      <div className="max-w-7xl mx-auto px-6 pb-4">
        <div className="border-t pt-3" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
          <EditableText
            as="p" multiline page="global" blockKey="footer_disclaimer"
            value={blocks.footer_disclaimer || "Girls Cadet College Murree is a premier boarding institution governed by a Board of Directors. A project of Cadet College Murree."}
            className="text-[11px] text-white/35 leading-relaxed max-w-3xl"
          />
        </div>
      </div>

      {/* ── Bottom bar ── */}
      <div style={{ background: "rgba(0,0,0,0.35)", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="max-w-7xl mx-auto px-6 py-2.5 flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] text-white/35">
          <p>
            <EditableText
              as="span" page="global" blockKey="footer_copyright"
              value={blocks.footer_copyright || `© ${new Date().getFullYear()} Girls Cadet College Murree. All rights reserved.`}
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
              as="span" page="global" blockKey="footer_location"
              value={blocks.footer_location || `Murree Hills, Punjab, Pakistan · Est. ${settings.college_established}`}
            />
          </p>
        </div>
      </div>
    </SectionColor>
  );
}
