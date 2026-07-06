import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "wouter";
import PageHero from "@/components/PageHero";
import { usePageBlocks } from "@/lib/usePageBlocks";
import EditableText from "@/components/cms/EditableText";
import { useSiteBaseUrl } from "@/lib/site-settings";
import {
  Shield,
  Lock,
  Eye,
  Database,
  UserCheck,
  Baby,
  Cookie,
  Globe,
  Mail,
  ScrollText,
  Trash2,
  ArrowUpRight,
  Server,
  ShieldAlert,
} from "lucide-react";

const LAST_UPDATED = "28 May 2026";
const EFFECTIVE_FROM = "1 January 2026";

type Section = {
  id: string;
  title: string;
  Icon: React.ComponentType<{ className?: string }>;
};

const SECTIONS: Section[] = [
  { id: "overview", title: "1. Overview", Icon: Shield },
  { id: "data-we-collect", title: "2. Information we collect", Icon: Database },
  { id: "purpose", title: "3. How we use the information", Icon: Eye },
  { id: "legal-basis", title: "4. Legal basis under Pakistani law", Icon: ScrollText },
  { id: "minors", title: "5. Children and applicants under 18", Icon: Baby },
  { id: "sharing", title: "6. Who we share information with", Icon: UserCheck },
  { id: "retention", title: "7. How long we keep your data", Icon: Trash2 },
  { id: "security", title: "8. How we protect your data", Icon: Lock },
  { id: "cookies", title: "9. Cookies and analytics", Icon: Cookie },
  { id: "rights", title: "10. Your rights", Icon: UserCheck },
  { id: "international", title: "11. International transfers", Icon: Globe },
  { id: "changes", title: "12. Changes to this policy", Icon: ScrollText },
  { id: "contact", title: "13. Contact our Data Protection Focal", Icon: Mail },
];

export default function Privacy() {
  const baseUrl = useSiteBaseUrl();
  const blocks = usePageBlocks("privacy");
  const [activeId, setActiveId] = useState<string>(SECTIONS[0]?.id ?? "");

  // Track which section is currently in view for the TOC highlight.
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => (a.target.getBoundingClientRect().top - b.target.getBoundingClientRect().top));
        if (visible[0]) setActiveId(visible[0].target.id);
      },
      { rootMargin: "-30% 0px -55% 0px", threshold: [0, 1] },
    );
    for (const s of SECTIONS) {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <Helmet>
        <title>Privacy Policy | Cadet College Murree</title>
        <meta
          name="description"
          content="How Cadet College Murree collects, uses, stores, and protects personal information of applicants, cadets, parents and visitors — including CNIC and photograph data."
        />
        <link rel="canonical" href={`${baseUrl}/privacy`} />
        <meta property="og:title" content="Privacy Policy | Cadet College Murree" />
        <meta property="og:type" content="article" />
      </Helmet>

      <PageHero title={<EditableText page="privacy" blockKey="hero_title" value={blocks.hero_title || "Privacy Policy"} />} breadcrumb="Privacy" />

      <section className="max-w-7xl mx-auto px-4 py-12 md:py-16 grid lg:grid-cols-12 gap-10">
        {/* TOC */}
        <aside className="lg:col-span-4 xl:col-span-3 order-2 lg:order-1">
          <div className="lg:sticky lg:top-24">
            <div className="bg-card border border-border rounded-2xl p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <ScrollText className="w-4 h-4 text-accent" />
                <h3 className="text-xs uppercase tracking-widest font-bold text-foreground/65">Contents</h3>
              </div>
              <nav className="space-y-1" aria-label="Privacy policy contents">
                {SECTIONS.map((s) => {
                  const active = activeId === s.id;
                  return (
                    <a
                      key={s.id}
                      href={`#${s.id}`}
                      className={
                        "block text-sm py-1.5 px-2 rounded-md transition-colors " +
                        (active
                          ? "bg-primary/10 text-primary font-semibold"
                          : "text-foreground/70 hover:text-primary hover:bg-primary/5")
                      }
                    >
                      {s.title}
                    </a>
                  );
                })}
              </nav>
            </div>

            <div className="mt-4 bg-primary text-primary-foreground rounded-2xl p-5">
              <div className="text-[11px] uppercase tracking-widest font-bold text-accent">Last updated</div>
              <div className="text-lg font-bold mt-1"><EditableText as="span" page="privacy" blockKey="last_updated" value={blocks.last_updated || LAST_UPDATED} /></div>
              <div className="text-[11px] uppercase tracking-widest font-bold text-accent mt-3">Effective from</div>
              <div className="text-lg font-bold mt-1"><EditableText as="span" page="privacy" blockKey="effective_from" value={blocks.effective_from || EFFECTIVE_FROM} /></div>
            </div>
          </div>
        </aside>

        {/* Body */}
        <article className="lg:col-span-8 xl:col-span-9 order-1 lg:order-2 space-y-12">
          <Intro />
          <Body />
        </article>
      </section>

      <CrossLinkStrip />
    </>
  );
}

function Intro() {
  return (
    <div className="prose-base max-w-none">
      <div className="rounded-2xl bg-accent/5 border-l-4 border-accent p-5 md:p-6">
        <p className="text-foreground/80 leading-relaxed">
          Cadet College Murree ("<strong>CCM</strong>", "<strong>we</strong>", "<strong>us</strong>") values the trust
          that applicants, cadets, parents and visitors place in us when they share personal information. This Privacy
          Policy explains, in plain language, what we collect, why we collect it, how long we keep it, who we share it
          with, and the rights you have under Pakistani law.
        </p>
        <p className="text-foreground/80 leading-relaxed mt-3">
          Because our online admission form requires sensitive information — including parent CNIC numbers and applicant
          photographs — this policy is binding from the moment you start filling that form. If anything below is unclear,
          please contact our Data Protection Focal (Section 13) <em>before</em> you submit.
        </p>
      </div>
    </div>
  );
}

function Section({
  id,
  title,
  Icon,
  children,
}: {
  id: string;
  title: string;
  Icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24" data-testid={`privacy-section-${id}`}>
      <header className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
          <Icon className="w-5 h-5" />
        </div>
        <h2 className="text-2xl md:text-3xl font-bold text-primary leading-tight">{title}</h2>
      </header>
      <div className="space-y-4 text-foreground/85 leading-relaxed [&_p]:leading-relaxed [&_ul]:space-y-2 [&_li]:leading-relaxed [&_strong]:text-foreground">
        {children}
      </div>
    </section>
  );
}

function Body() {
  return (
    <>
      <Section id="overview" title="1. Overview" Icon={Shield}>
        <p>
          Cadet College Murree is a registered educational institution operating in Punjab, Pakistan. We process personal
          data in compliance with the Prevention of Electronic Crimes Act 2016 (PECA), the draft Personal Data Protection
          Bill, and applicable child-protection statutes. This policy applies to:
        </p>
        <ul className="list-disc pl-6 marker:text-accent">
          <li>Visitors to <strong>cadetcollegemurree.edu.pk</strong> and any sub-domain we operate.</li>
          <li>Applicants and their parents/guardians using the Online Admission portal.</li>
          <li>Enrolled cadets and their families, for the duration of their association with CCM.</li>
          <li>Alumni who voluntarily share their stories on our Alumni page.</li>
        </ul>
      </Section>

      <Section id="data-we-collect" title="2. Information we collect" Icon={Database}>
        <p>We only collect information that is necessary to process an admission, run the college, or fulfil a legal obligation.</p>

        <h3 className="font-bold text-foreground mt-4">2.1 Information you provide directly</h3>
        <ul className="list-disc pl-6 marker:text-accent">
          <li><strong>Applicant identity:</strong> full name, date of birth, blood group, religion (optional), gender.</li>
          <li><strong>Academic history:</strong> previous class, marks/percentage, examination centre preference.</li>
          <li><strong>Contact details:</strong> student mobile, student email, postal address, district, city, province.</li>
          <li><strong>Parent / Guardian details:</strong> full name, relationship, occupation, mobile number, and the
            13-digit National Identity Card (CNIC) number of the parent or legal guardian.</li>
          <li><strong>Photograph:</strong> a recent passport-size photograph of the applicant uploaded with the form.</li>
          <li><strong>Voluntary submissions:</strong> messages sent via the Contact form or alumni story submissions.</li>
        </ul>

        <h3 className="font-bold text-foreground mt-4">2.2 Information collected automatically</h3>
        <ul className="list-disc pl-6 marker:text-accent">
          <li>IP address and approximate location (used only for rate-limiting and abuse prevention).</li>
          <li>Device and browser type, screen size, and the pages you visit on our site.</li>
          <li>Time-stamped logs of admission submissions and status-lookup attempts.</li>
        </ul>

        <h3 className="font-bold text-foreground mt-4">2.3 Information we do <em>not</em> collect</h3>
        <ul className="list-disc pl-6 marker:text-accent">
          <li>Biometric data, fingerprints, or iris scans.</li>
          <li>Payment-card numbers — when we add online fee payment, it will be processed by the bank's gateway and
            CCM will not store card or CVV data.</li>
          <li>Health information beyond blood group declared on the admission form.</li>
        </ul>
      </Section>

      <Section id="purpose" title="3. How we use the information" Icon={Eye}>
        <p>Every piece of data we collect is tied to one of a narrow set of purposes:</p>
        <ul className="list-disc pl-6 marker:text-accent">
          <li><strong>Process and decide your admission application.</strong></li>
          <li><strong>Verify identity</strong> at the time of the entry test, interview and enrolment using the parent
            CNIC and the applicant's photograph.</li>
          <li><strong>Communicate with you</strong> about test dates, result announcements, fee schedules and important
            college notices via SMS, email, WhatsApp or phone call.</li>
          <li><strong>Generate the printable admit card</strong> using the photograph and roll number.</li>
          <li><strong>Maintain academic records</strong> required by the Federal Board of Intermediate and Secondary
            Education (FBISE) and other regulators.</li>
          <li><strong>Protect the service</strong> from abuse — for example, the live counter and status lookup endpoints
            are rate-limited per IP and per reference ID.</li>
          <li><strong>Improve the website</strong> using aggregated, non-identifying analytics.</li>
        </ul>
        <p>
          We will not use your information for advertising, profiling, or sale to third parties. <strong>Ever.</strong>
        </p>
      </Section>

      <Section id="legal-basis" title="4. Legal basis under Pakistani law" Icon={ScrollText}>
        <p>We process personal data on one or more of the following legal grounds:</p>
        <ul className="list-disc pl-6 marker:text-accent">
          <li><strong>Consent</strong> — you affirmatively submit information on the admission form, contact form or
            alumni form.</li>
          <li><strong>Contract</strong> — once a cadet is admitted, processing of academic and fee data is necessary to
            perform the admission contract.</li>
          <li><strong>Legal obligation</strong> — record-keeping required by FBISE, the Income Tax Ordinance 2001 (for
            fee receipts), and child-safeguarding rules.</li>
          <li><strong>Legitimate interest</strong> — fraud and abuse prevention (e.g. IP-level rate limiting on the
            lookup endpoint).</li>
        </ul>
      </Section>

      <Section id="minors" title="5. Children and applicants under 18" Icon={Baby}>
        <div className="rounded-xl bg-amber-50 border border-amber-200 p-4">
          <p className="text-amber-900">
            <strong>Important.</strong> Almost all CCM applicants are between <strong>11 and 17 years of age</strong>.
            We therefore treat every admission form as containing the data of a minor.
          </p>
        </div>
        <ul className="list-disc pl-6 marker:text-accent">
          <li>The admission form must be reviewed and submitted by a <strong>parent or legal guardian</strong>. By
            entering the parent CNIC, the guardian formally consents to the processing described in this policy.</li>
          <li>We never publicly display a minor's CNIC, full date of birth, home address, mobile number or email.</li>
          <li>The applicant's photograph is used only on the admit card, ID card and internal academic records — it is
            not published on social media or this website without separate written consent from the guardian.</li>
          <li>Parents may request deletion of an applicant's record at any time before enrolment (see Section 10).</li>
        </ul>
      </Section>

      <Section id="sharing" title="6. Who we share information with" Icon={UserCheck}>
        <p>We share personal data only when it is strictly necessary, and only with the following categories:</p>
        <ul className="list-disc pl-6 marker:text-accent">
          <li><strong>Regulatory bodies</strong> — FBISE, the Punjab Higher Education Department, and the District
            Education Authority when they request statutory data.</li>
          <li><strong>Verification partners</strong> — NADRA, only to confirm that a submitted CNIC is valid and belongs
            to the parent or guardian named on the form.</li>
          <li><strong>Payment processors</strong> — once fee collection goes online, the bank's payment gateway will
            handle transactions; we never receive the card data itself.</li>
          <li><strong>Hosting and infrastructure providers</strong> — bound by data-processing agreements that prohibit
            them from accessing the data for any other purpose.</li>
          <li><strong>Law enforcement</strong> — only on a valid written order from a court of competent jurisdiction.</li>
        </ul>
        <p><strong>We do not sell personal data. Not to advertisers, not to data brokers, not to anyone.</strong></p>
      </Section>

      <Section id="retention" title="7. How long we keep your data" Icon={Trash2}>
        <ul className="list-disc pl-6 marker:text-accent">
          <li><strong>Unsuccessful applications</strong> are retained for <strong>2 years</strong> from the date of the
            entry test, after which the personal data is anonymised and only aggregate statistics are kept.</li>
          <li><strong>Successful applicants</strong> who enrol become cadets — their records are retained for the
            duration of their education plus <strong>10 years</strong>, in line with FBISE recommendations.</li>
          <li><strong>Rate-limit logs</strong> (IP, reference ID, timestamp) are kept for <strong>15 days</strong>.</li>
          <li><strong>Contact-form messages</strong> are kept for <strong>12 months</strong> unless a longer retention is
            required to resolve an ongoing issue.</li>
          <li><strong>Alumni stories</strong> are kept for as long as the alumnus wishes them displayed; removal is
            available on request within 7 working days.</li>
        </ul>
      </Section>

      <Section id="security" title="8. How we protect your data" Icon={Lock}>
        <p>Security is layered and proportionate to the sensitivity of the data we hold:</p>
        <ul className="list-disc pl-6 marker:text-accent">
          <li>All traffic between your browser and CCM servers is encrypted with <strong>TLS 1.2 or higher</strong>.</li>
          <li>The admissions database is hosted on a managed PostgreSQL cluster with encryption at rest and daily
            point-in-time backups, retained for 30 days.</li>
          <li>Parent CNIC numbers are stored canonically; only the <strong>last four digits</strong> are exposed to the
            status-lookup endpoint to limit any potential leak.</li>
          <li>Status lookup is <strong>rate-limited</strong> (20 attempts per IP per 5 minutes; 8 failed attempts per
            reference triggers a 15-minute lockout).</li>
          <li>Access to the admin panel is restricted to named staff, logged, and protected by single sign-on with
            two-factor authentication.</li>
          <li>We run quarterly internal access reviews and engage an independent security firm for an annual review.</li>
        </ul>
        <div className="rounded-xl bg-rose-50 border border-rose-200 p-4 flex gap-3">
          <ShieldAlert className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
          <p className="text-rose-900 text-sm">
            <strong>Suspect a security incident?</strong> Email <a className="underline" href="mailto:burdiwaheed@gmail.com">burdiwaheed@gmail.com</a> with
            the subject line <em>"SECURITY"</em>. We aim to acknowledge within 24 hours.
          </p>
        </div>
      </Section>

      <Section id="cookies" title="9. Cookies and analytics" Icon={Cookie}>
        <p>We use a small number of cookies, all of which are first-party:</p>
        <ul className="list-disc pl-6 marker:text-accent">
          <li>A <strong>session cookie</strong> to keep you signed in while applying.</li>
          <li>A <strong>CSRF token</strong> to protect form submissions from cross-site request forgery.</li>
          <li>An anonymised <strong>visit counter</strong> (no IP, no fingerprinting) for aggregate page-view metrics.</li>
        </ul>
        <p>
          We do not use third-party advertising trackers, cross-site identifiers or behavioural-profiling cookies. You
          can block cookies through your browser without losing access to public pages; the admission and status-lookup
          forms do require cookies for security.
        </p>
      </Section>

      <Section id="rights" title="10. Your rights" Icon={UserCheck}>
        <p>You — or, for a minor, the parent / legal guardian — have the right to:</p>
        <ul className="list-disc pl-6 marker:text-accent">
          <li><strong>Access</strong> a copy of the personal data we hold about you.</li>
          <li><strong>Rectify</strong> inaccurate or incomplete information.</li>
          <li><strong>Erase</strong> your data, subject to retention obligations under Section 7.</li>
          <li><strong>Withdraw consent</strong> for non-essential processing (e.g. marketing emails about events).</li>
          <li><strong>Object</strong> to any processing you consider unlawful.</li>
          <li><strong>Lodge a complaint</strong> with a relevant regulator if you are unsatisfied with our response.</li>
        </ul>
        <p>
          To exercise any right, write to <a className="text-accent underline font-medium" href="mailto:burdiwaheed@gmail.com">burdiwaheed@gmail.com</a> with
          the subject line <em>"DATA REQUEST"</em>. We will respond within <strong>30 calendar days</strong>.
        </p>
      </Section>

      <Section id="international" title="11. International transfers" Icon={Globe}>
        <p>
          Our primary servers are located in Pakistan. Routine backups and operational logs may be processed at
          data-centre facilities in the United Arab Emirates and the European Union. Wherever your data travels, it
          remains protected by the same security and retention standards described in this policy and by binding
          contractual safeguards with our providers.
        </p>
      </Section>

      <Section id="changes" title="12. Changes to this policy" Icon={ScrollText}>
        <p>
          When we make a material change — for example, when we introduce online fee payment or a new third-party
          processor — we will post the updated policy here at least <strong>14 days before</strong> it takes effect and,
          where the change is significant, send a notice by email or SMS to active applicants and parents.
        </p>
      </Section>

      <Section id="contact" title="13. Contact our Data Protection Focal" Icon={Mail}>
        <div className="grid sm:grid-cols-2 gap-3 not-prose">
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="text-[11px] uppercase tracking-widest font-bold text-foreground/60">Data Protection Focal</div>
            <div className="text-foreground font-semibold mt-1">Mr. Burdi Waheed</div>
            <a href="mailto:burdiwaheed@gmail.com" className="text-accent hover:underline text-sm mt-1 inline-flex items-center gap-1">
              burdiwaheed@gmail.com <ArrowUpRight className="w-3.5 h-3.5" />
            </a>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="text-[11px] uppercase tracking-widest font-bold text-foreground/60">Postal Address</div>
            <div className="text-foreground font-semibold mt-1">Cadet College Murree</div>
            <div className="text-sm text-foreground/75">Murree Hills, Punjab, Pakistan</div>
            <div className="text-sm text-foreground/75">+92 300 9543823</div>
          </div>
        </div>
      </Section>
    </>
  );
}

function CrossLinkStrip() {
  return (
    <section className="bg-primary text-primary-foreground">
      <div className="max-w-5xl mx-auto px-4 py-10 text-center">
        <Server className="w-8 h-8 text-accent mx-auto mb-3" />
        <h3 className="text-2xl md:text-3xl font-bold">Read the companion document</h3>
        <p className="text-white/80 mt-2 max-w-2xl mx-auto">
          Our Terms of Service describe the rules that govern your use of this website and the online admission portal.
        </p>
        <Link
          href="/terms"
          className="inline-flex items-center gap-2 mt-5 px-6 h-11 rounded-full bg-accent hover:bg-accent/90 transition-colors font-semibold"
          data-testid="privacy-to-terms"
        >
          Open Terms of Service <ArrowUpRight className="w-4 h-4" />
        </Link>
      </div>
    </section>
  );
}
