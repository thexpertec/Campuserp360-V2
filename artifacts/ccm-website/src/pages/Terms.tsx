import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "wouter";
import PageHero from "@/components/PageHero";
import { usePageBlocks } from "@/lib/usePageBlocks";
import EditableText from "@/components/cms/EditableText";
import { useSiteBaseUrl } from "@/lib/site-settings";
import {
  ScrollText,
  CheckCircle2,
  UserPlus,
  ShieldOff,
  Banknote,
  GraduationCap,
  AlertTriangle,
  Gavel,
  Mail,
  Copyright,
  Server,
  ArrowUpRight,
  CircleDot,
  RefreshCcw,
} from "lucide-react";

const LAST_UPDATED = "28 May 2026";
const EFFECTIVE_FROM = "1 January 2026";

type Section = {
  id: string;
  title: string;
  Icon: React.ComponentType<{ className?: string }>;
};

const SECTIONS: Section[] = [
  { id: "acceptance", title: "1. Acceptance of these terms", Icon: CheckCircle2 },
  { id: "definitions", title: "2. Definitions", Icon: ScrollText },
  { id: "eligibility", title: "3. Eligibility to apply", Icon: UserPlus },
  { id: "account", title: "4. Your responsibilities", Icon: CircleDot },
  { id: "admission-process", title: "5. The admission process", Icon: GraduationCap },
  { id: "fees", title: "6. Fees, payment and refunds", Icon: Banknote },
  { id: "code-of-conduct", title: "7. Acceptable use", Icon: ShieldOff },
  { id: "ip", title: "8. Intellectual property", Icon: Copyright },
  { id: "disclaimer", title: "9. Disclaimer and limitation of liability", Icon: AlertTriangle },
  { id: "termination", title: "10. Termination of access", Icon: ShieldOff },
  { id: "changes", title: "11. Changes to these terms", Icon: RefreshCcw },
  { id: "law", title: "12. Governing law and jurisdiction", Icon: Gavel },
  { id: "contact", title: "13. How to contact us", Icon: Mail },
];

export default function Terms() {
  const baseUrl = useSiteBaseUrl();
  const blocks = usePageBlocks("terms");
  const [activeId, setActiveId] = useState<string>(SECTIONS[0]?.id ?? "");

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
        <title>Terms of Service | Cadet College Murree</title>
        <meta
          name="description"
          content="The rules that govern your use of the Cadet College Murree website and online admission portal — eligibility, acceptable use, fees, intellectual property and governing law."
        />
        <link rel="canonical" href={`${baseUrl}/terms`} />
        <meta property="og:title" content="Terms of Service | Cadet College Murree" />
        <meta property="og:type" content="article" />
      </Helmet>

      <PageHero title={<EditableText page="terms" blockKey="hero_title" value={blocks.hero_title || "Terms of Service"} />} breadcrumb="Terms" />

      <section className="max-w-7xl mx-auto px-4 py-12 md:py-16 grid lg:grid-cols-12 gap-10">
        <aside className="lg:col-span-4 xl:col-span-3 order-2 lg:order-1">
          <div className="lg:sticky lg:top-24">
            <div className="bg-card border border-border rounded-2xl p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <ScrollText className="w-4 h-4 text-accent" />
                <h3 className="text-xs uppercase tracking-widest font-bold text-foreground/65">Contents</h3>
              </div>
              <nav className="space-y-1" aria-label="Terms of service contents">
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
              <div className="text-lg font-bold mt-1"><EditableText as="span" page="terms" blockKey="last_updated" value={blocks.last_updated || LAST_UPDATED} /></div>
              <div className="text-[11px] uppercase tracking-widest font-bold text-accent mt-3">Effective from</div>
              <div className="text-lg font-bold mt-1"><EditableText as="span" page="terms" blockKey="effective_from" value={blocks.effective_from || EFFECTIVE_FROM} /></div>
            </div>
          </div>
        </aside>

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
    <div className="rounded-2xl bg-accent/5 border-l-4 border-accent p-5 md:p-6">
      <p className="text-foreground/85 leading-relaxed">
        Welcome to Cadet College Murree. These Terms of Service ("<strong>Terms</strong>") form a legally binding
        agreement between you and Cadet College Murree, governing your access to and use of our website, the online
        admission portal, the application status tracker and any related services we offer (collectively, the "
        <strong>Service</strong>").
      </p>
      <p className="text-foreground/85 leading-relaxed mt-3">
        Please read them carefully. If you do not agree with any part of these Terms, please do not use the Service.
        Continued use after a material change constitutes acceptance of the revised Terms.
      </p>
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
    <section id={id} className="scroll-mt-24" data-testid={`terms-section-${id}`}>
      <header className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
          <Icon className="w-5 h-5" />
        </div>
        <h2 className="text-2xl md:text-3xl font-bold text-primary leading-tight">{title}</h2>
      </header>
      <div className="space-y-4 text-foreground/85 leading-relaxed [&_ul]:space-y-2 [&_strong]:text-foreground">
        {children}
      </div>
    </section>
  );
}

function Body() {
  return (
    <>
      <Section id="acceptance" title="1. Acceptance of these terms" Icon={CheckCircle2}>
        <p>
          By accessing the Service — including merely browsing public pages, submitting an admission application, looking
          up an application status, or sending a message via our contact form — you confirm that you have read,
          understood and agree to be bound by these Terms and by our{" "}
          <Link href="/privacy" className="text-accent underline font-medium">Privacy Policy</Link>, which is
          incorporated by reference.
        </p>
        <p>
          If you are submitting on behalf of a minor (which will be the case for almost all admission applications),
          you confirm that you are the parent or legal guardian of the minor and that you have full authority to accept
          these Terms on their behalf.
        </p>
      </Section>

      <Section id="definitions" title="2. Definitions" Icon={ScrollText}>
        <ul className="list-disc pl-6 marker:text-accent">
          <li><strong>"Applicant"</strong> — the student whose name appears on the admission form.</li>
          <li><strong>"Guardian"</strong> — the parent or legal guardian completing the form on the Applicant's behalf.</li>
          <li><strong>"Cadet"</strong> — an Applicant who has been admitted and enrolled at the College.</li>
          <li><strong>"Service"</strong> — this website and all related online tools operated by Cadet College Murree.</li>
          <li><strong>"Personal Data"</strong> — has the meaning set out in our Privacy Policy.</li>
        </ul>
      </Section>

      <Section id="eligibility" title="3. Eligibility to apply" Icon={UserPlus}>
        <ul className="list-disc pl-6 marker:text-accent">
          <li>Applicants must satisfy the age, academic and medical eligibility published on the Online Admission page
            for the relevant class and session.</li>
          <li>The Guardian must be at least <strong>18 years of age</strong>, hold a valid Pakistani CNIC, and be the
            biological parent or court-appointed legal guardian of the Applicant.</li>
          <li>Cadet College Murree reserves the right to require originals of any document submitted online for
            verification at the time of the entry test or interview.</li>
          <li>Submission of an application does not guarantee admission. All admission decisions are final and at the
            sole discretion of the Admissions Committee.</li>
        </ul>
      </Section>

      <Section id="account" title="4. Your responsibilities" Icon={CircleDot}>
        <p>When using the Service, you agree to:</p>
        <ul className="list-disc pl-6 marker:text-accent">
          <li>Provide accurate, current and complete information.</li>
          <li>Keep the Applicant ID issued to you confidential — it is the key to your application status.</li>
          <li>Notify us promptly of any errors in the data you have submitted by writing to the email address in
            Section 13.</li>
          <li>Not attempt to access another applicant's information, brute-force the status lookup, or otherwise
            circumvent our security controls.</li>
        </ul>
        <p>
          You are responsible for all activity that originates from the credentials and identifiers (Applicant ID,
          CNIC last four digits) associated with your application.
        </p>
      </Section>

      <Section id="admission-process" title="5. The admission process" Icon={GraduationCap}>
        <ul className="list-disc pl-6 marker:text-accent">
          <li><strong>Submission.</strong> You complete and submit the Online Admission form. You will receive a unique
            Applicant ID such as <code className="px-1.5 py-0.5 bg-muted rounded text-xs">CCM-2026-XXXXXX</code> on
            screen and (where contact details are valid) by SMS and email.</li>
          <li><strong>Verification.</strong> CCM staff review the form and submitted documents within 2–3 working days.</li>
          <li><strong>Entry test.</strong> Eligible applicants are invited to the entry test on the date and centre
            assigned to them.</li>
          <li><strong>Result and interview.</strong> Shortlisted applicants are invited for interview and medical
            screening.</li>
          <li><strong>Admission decision.</strong> Final decisions are communicated by SMS and via the Application
            Status Tracker.</li>
          <li><strong>Enrolment.</strong> Selected cadets must complete enrolment formalities (including fee payment
            and submission of original documents) within the timeline specified in the offer letter, failing which the
            seat may be offered to a waitlisted candidate.</li>
        </ul>
      </Section>

      <Section id="fees" title="6. Fees, payment and refunds" Icon={Banknote}>
        <ul className="list-disc pl-6 marker:text-accent">
          <li>The current admission test fee, tuition fee and hostel charges are published on the Downloads page and
            in the official prospectus. CCM reserves the right to revise fees with prior notice.</li>
          <li>All fees are payable in Pakistani Rupees through the channels indicated in the offer letter.</li>
          <li>Admission test fees are <strong>non-refundable</strong> regardless of whether the applicant appears for
            the test.</li>
          <li>Tuition or hostel fees paid after admission may be refunded on a pro-rata basis subject to the
            withdrawal policy published in the prospectus.</li>
          <li>We are not responsible for charges levied by your bank, payment gateway or telecom operator.</li>
        </ul>
      </Section>

      <Section id="code-of-conduct" title="7. Acceptable use" Icon={ShieldOff}>
        <p>While using the Service, you must not:</p>
        <ul className="list-disc pl-6 marker:text-accent">
          <li>Submit false, misleading, or impersonating information.</li>
          <li>Attempt to access, probe or scan any system or network of the College beyond what is exposed for normal use.</li>
          <li>Upload viruses, malware, or any code intended to harm the Service or its users.</li>
          <li>Use automated means (scrapers, bots, headless browsers) to harvest information or to repeatedly query
            the status lookup beyond the publicly documented rate limits.</li>
          <li>Use the Service for any unlawful purpose, including any conduct that violates the Prevention of Electronic
            Crimes Act 2016 or other applicable laws.</li>
        </ul>
        <p>
          Violations may result in immediate suspension of access, invalidation of an in-progress application, and
          referral to law-enforcement authorities where appropriate.
        </p>
      </Section>

      <Section id="ip" title="8. Intellectual property" Icon={Copyright}>
        <p>
          The Service, including its design, text, graphics, logos, photographs, source code and all underlying
          intellectual property, is owned by or licensed to Cadet College Murree and is protected by Pakistani and
          international copyright, trademark and other laws.
        </p>
        <ul className="list-disc pl-6 marker:text-accent">
          <li>You may view, download and print pages of this website for personal, non-commercial reference only.</li>
          <li>You may not reproduce, modify, distribute, publicly display or create derivative works from any portion
            of the Service without our prior written consent.</li>
          <li>Where you submit content (alumni story, contact-form message, etc.), you grant Cadet College Murree a
            non-exclusive, royalty-free, perpetual licence to use, edit and display that content for institutional
            purposes — subject always to our Privacy Policy and your right to request removal.</li>
          <li>"Cadet College Murree" and the college crest are trademarks of the institution; they may not be used
            without permission.</li>
        </ul>
      </Section>

      <Section id="disclaimer" title="9. Disclaimer and limitation of liability" Icon={AlertTriangle}>
        <p>
          The Service is provided on an "<strong>as-is</strong>" and "<strong>as-available</strong>" basis. While we
          make every reasonable effort to keep the Service accurate and operational, we make no warranty — express or
          implied — that:
        </p>
        <ul className="list-disc pl-6 marker:text-accent">
          <li>The Service will be uninterrupted, error-free or completely secure;</li>
          <li>Any information published on the Service is, at every moment, fully up to date with the latest official
            notification (you should always confirm with our admissions office before acting on time-sensitive
            information);</li>
          <li>The Service will be compatible with every browser or device.</li>
        </ul>
        <p>
          To the maximum extent permitted by Pakistani law, Cadet College Murree, its directors, officers, employees
          and agents shall not be liable for any indirect, incidental, special, consequential or punitive damages —
          including loss of opportunity, loss of admission, or loss of data — arising out of or in connection with your
          use of, or inability to use, the Service.
        </p>
      </Section>

      <Section id="termination" title="10. Termination of access" Icon={ShieldOff}>
        <p>We may suspend or terminate your access to the Service at any time, without notice, if we reasonably believe that:</p>
        <ul className="list-disc pl-6 marker:text-accent">
          <li>You have breached these Terms or our Privacy Policy;</li>
          <li>You have submitted fraudulent information;</li>
          <li>Continued access poses a security risk to the Service or to other users.</li>
        </ul>
        <p>
          Termination of access does not by itself terminate an admission that has already been confirmed in writing,
          which remains governed by the prospectus and the enrolment agreement.
        </p>
      </Section>

      <Section id="changes" title="11. Changes to these terms" Icon={RefreshCcw}>
        <p>
          We may revise these Terms from time to time. When we do, we will update the "Last updated" date at the top of
          this page. Material changes will be highlighted with a notice on the homepage for at least 14 days. Your
          continued use of the Service after a revision takes effect constitutes acceptance of the revised Terms.
        </p>
      </Section>

      <Section id="law" title="12. Governing law and jurisdiction" Icon={Gavel}>
        <p>
          These Terms are governed by and construed in accordance with the laws of the Islamic Republic of Pakistan,
          without regard to its conflict-of-laws principles. Any dispute arising out of or relating to these Terms or
          your use of the Service shall be subject to the <strong>exclusive jurisdiction of the competent courts at
          Rawalpindi</strong>.
        </p>
      </Section>

      <Section id="contact" title="13. How to contact us" Icon={Mail}>
        <div className="grid sm:grid-cols-2 gap-3 not-prose">
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="text-[11px] uppercase tracking-widest font-bold text-foreground/60">Email</div>
            <a href="mailto:burdiwaheed@gmail.com" className="text-accent hover:underline text-sm mt-1 inline-flex items-center gap-1 font-medium">
              burdiwaheed@gmail.com <ArrowUpRight className="w-3.5 h-3.5" />
            </a>
            <div className="text-[11px] uppercase tracking-widest font-bold text-foreground/60 mt-3">Phone</div>
            <div className="text-sm text-foreground mt-1">+92 300 9543823</div>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="text-[11px] uppercase tracking-widest font-bold text-foreground/60">Postal Address</div>
            <div className="text-foreground font-semibold mt-1">Cadet College Murree</div>
            <div className="text-sm text-foreground/75">Murree Hills, Punjab, Pakistan</div>
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
          Our Privacy Policy explains how we collect, store and protect your personal information.
        </p>
        <Link
          href="/privacy"
          className="inline-flex items-center gap-2 mt-5 px-6 h-11 rounded-full bg-accent hover:bg-accent/90 transition-colors font-semibold"
          data-testid="terms-to-privacy"
        >
          Open Privacy Policy <ArrowUpRight className="w-4 h-4" />
        </Link>
      </div>
    </section>
  );
}
