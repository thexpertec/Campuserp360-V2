import { useState, useEffect } from "react";
import { Helmet } from "react-helmet-async";
import { motion } from "framer-motion";
import { Link } from "wouter";
import PageHero from "@/components/PageHero";
import { usePageBlocks } from "@/lib/usePageBlocks";
import { useSiteBaseUrl } from "@/lib/site-settings";
import EditableText from "@/components/cms/EditableText";
import SectionColor from "@/components/cms/SectionColor";
import { Button } from "@/components/ui/button";
import { withTenant } from "@/lib/tenant-fetch";
import {
  Trophy, Download, FileText, ArrowRight,
  Loader2, AlertCircle, Calendar, BookOpen,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface SiteResult {
  id: string;
  examName: string;
  className: string;
  academicYear: string;
  resultDate: string | null;
  downloadUrl: string | null;
  notes: string | null;
  isPublished: boolean;
  sortOrder: number;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Results() {
  const baseUrl = useSiteBaseUrl();
  const blocks = usePageBlocks("results");

  const [results, setResults] = useState<SiteResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch(withTenant("/api/website/results"))
      .then(r => r.ok ? r.json() : Promise.reject(r))
      .then(data => { setResults(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => { setError(true); setLoading(false); });
  }, []);

  const published = results.filter(r => r.isPublished);

  const classes = Array.from(new Set(published.map(r => r.className))).sort();
  const years   = Array.from(new Set(published.map(r => r.academicYear))).sort().reverse();

  return (
    <>
      <Helmet>
        <title>Entry Test Results | Cadet College Murree</title>
        <meta
          name="description"
          content="Cadet College Murree official entry test results. Check published merit lists and download result documents for Class VI, IX and FSc admissions."
        />
        <link rel="canonical" href={`${baseUrl}/results`} />
      </Helmet>

      <PageHero title={<EditableText page="results" blockKey="hero_title" value={blocks.hero_title || "Entry Test Results"} />} breadcrumb="Results" />

      {/* ── Announcement Banner ── */}
      <SectionColor page="results" scope="announcement" label="Announcement" kind="dark" className="bg-gradient-to-r from-[#021a0a] via-primary to-[#042c0e] py-8 px-4">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="flex flex-col md:flex-row items-center justify-between gap-4"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-accent/20 border border-accent/30 flex items-center justify-center flex-shrink-0">
                <Trophy className="w-6 h-6 text-accent" />
              </div>
              <div>
                <p className="text-accent text-xs uppercase tracking-widest font-bold">
                  <EditableText as="span" page="results" blockKey="announcement_eyebrow" value={blocks.announcement_eyebrow || "Official Announcement"} />
                </p>
                <h2 className="text-white text-xl md:text-2xl font-bold">
                  <EditableText as="span" page="results" blockKey="announce_title" value={blocks.announce_title || "Published Entry Test Results"} />
                </h2>
                <p className="text-white/70 text-sm">
                  <EditableText as="span" page="results" blockKey="announce_subtitle" value={blocks.announce_subtitle || "Results are published here as they become available. Check the portal to verify your individual result."} />
                </p>
              </div>
            </div>
            <Button asChild size="lg" className="bg-accent hover:bg-accent/90 text-accent-foreground font-bold gap-2 flex-shrink-0">
              <Link href="/portal">
                <ArrowRight className="w-4 h-4" />
                <EditableText as="span" page="results" blockKey="portal_cta" value={blocks.portal_cta || "Check Your Result"} />
              </Link>
            </Button>
          </motion.div>
        </div>
      </SectionColor>

      {/* ── Main Content ── */}
      <SectionColor page="results" scope="main" label="Results" kind="light" className="py-16 px-4" data-testid="results-page">
        <div className="max-w-7xl mx-auto">

          {loading && (
            <div className="flex justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-primary/50" />
            </div>
          )}

          {error && (
            <div className="flex flex-col items-center gap-3 py-20 text-foreground/50">
              <AlertCircle className="h-8 w-8" />
              <EditableText as="p" multiline page="results" blockKey="error_message" value={blocks.error_message || "Could not load results. Please try again later or contact the college directly."} />
            </div>
          )}

          {!loading && !error && published.length === 0 && (
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center py-20 space-y-5"
            >
              <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto">
                <FileText className="w-8 h-8 text-primary/40" />
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-bold text-primary">
                  <EditableText as="span" page="results" blockKey="empty_heading" value={blocks.empty_heading || "Results Not Yet Published"} />
                </h3>
                <p className="text-foreground/60 max-w-md mx-auto">
                  <EditableText as="span" multiline page="results" blockKey="empty_body" value={blocks.empty_body || "Entry test results will appear here once published. In the meantime, you can check your application status through the candidate portal."} />
                </p>
              </div>
              <Button asChild>
                <Link href="/portal"><EditableText as="span" page="results" blockKey="empty_portal_cta" value={blocks.empty_portal_cta || "Go to Candidate Portal"} /></Link>
              </Button>
            </motion.div>
          )}

          {!loading && !error && published.length > 0 && (
            <div className="space-y-8">
              {/* Summary chips */}
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-wrap gap-3 mb-6"
              >
                {classes.map(cls => (
                  <span key={cls} className="inline-flex items-center gap-1.5 bg-primary/10 text-primary text-sm font-semibold px-4 py-1.5 rounded-full border border-primary/20">
                    <BookOpen className="w-3.5 h-3.5" /> {cls}
                  </span>
                ))}
                {years.map(yr => (
                  <span key={yr} className="inline-flex items-center gap-1.5 bg-accent/10 text-accent text-sm font-semibold px-4 py-1.5 rounded-full border border-accent/20">
                    <Calendar className="w-3.5 h-3.5" /> {yr}
                  </span>
                ))}
              </motion.div>

              {/* Result cards */}
              <motion.div
                initial="hidden"
                animate="visible"
                variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.08 } } }}
                className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6"
              >
                {published.map((result, i) => (
                  <ResultCard key={result.id} result={result} index={i} />
                ))}
              </motion.div>

              {/* Portal CTA */}
              <motion.div
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4, duration: 0.6 }}
                className="mt-12 bg-gradient-to-r from-primary via-primary to-primary/90 rounded-3xl p-8 md:p-10 text-white"
              >
                <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                  <div>
                    <h3 className="text-2xl font-bold mb-2">
                      <EditableText as="span" page="results" blockKey="portal_section_title" value={blocks.portal_section_title || "Check Your Individual Result"} />
                    </h3>
                    <p className="text-white/80 leading-relaxed">
                      <EditableText as="span" multiline page="results" blockKey="portal_section_body" value={blocks.portal_section_body || "Log in to the candidate portal with your roll number to view your detailed result, merit position, and next steps."} />
                    </p>
                  </div>
                  <div className="flex flex-col gap-3 md:items-end">
                    <Button asChild size="lg" className="bg-accent hover:bg-accent/90 text-accent-foreground gap-2 font-bold h-12">
                      <Link href="/portal"><ArrowRight className="w-4 h-4" /> Candidate Portal</Link>
                    </Button>
                    <Button asChild size="lg" variant="outline" className="border-white/30 text-white hover:bg-white/10 gap-2 h-12">
                      <Link href="/contact">Contact Admissions</Link>
                    </Button>
                  </div>
                </div>
              </motion.div>
            </div>
          )}

        </div>
      </SectionColor>
    </>
  );
}

// ─── ResultCard ───────────────────────────────────────────────────────────────

function ResultCard({ result, index }: { result: SiteResult; index: number }) {
  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: 24 },
        visible: { opacity: 1, y: 0, transition: { duration: 0.5 } },
      }}
      data-testid={`result-card-${index}`}
      className="bg-card border border-border rounded-2xl overflow-hidden hover:shadow-lg hover:border-primary/30 transition-all duration-300 flex flex-col"
    >
      {/* Coloured top stripe */}
      <div className="h-1.5 bg-gradient-to-r from-primary via-accent to-primary/60" />

      <div className="p-6 flex flex-col flex-1 gap-4">
        {/* Header */}
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
            <Trophy className="w-5 h-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h3 className="font-bold text-primary text-base leading-tight">{result.examName || "Entry Test Result"}</h3>
            <p className="text-accent text-sm font-semibold mt-0.5">{result.className}</p>
          </div>
        </div>

        {/* Meta */}
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-foreground/65">
          {result.academicYear && (
            <span className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5" /> {result.academicYear}
            </span>
          )}
          {result.resultDate && (
            <span className="flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5" /> {result.resultDate}
            </span>
          )}
        </div>

        {/* Notes */}
        {result.notes && (
          <p className="text-sm text-foreground/70 leading-relaxed flex-1">{result.notes}</p>
        )}

        {/* Download */}
        {result.downloadUrl && (
          <Button asChild variant="outline" className="w-full mt-auto gap-2">
            <a href={result.downloadUrl} target="_blank" rel="noopener noreferrer" download>
              <Download className="w-4 h-4" />
              Download Result
            </a>
          </Button>
        )}
      </div>
    </motion.div>
  );
}
