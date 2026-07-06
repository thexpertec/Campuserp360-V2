import { Helmet } from "react-helmet-async";
import { motion } from "framer-motion";
import { Download, FileText, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import PageHero from "@/components/PageHero";
import { useEffect, useState } from "react";
import { withTenant } from "@/lib/tenant-fetch";
import { usePageBlocks } from "@/lib/usePageBlocks";
import EditableText from "@/components/cms/EditableText";
import { useSiteBaseUrl } from "@/lib/site-settings";

interface SiteDownload {
  id: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  imageUrl: string | null;
  fileUrl: string | null;
  fileName: string | null;
  category: string | null;
}

const FALLBACK_DOWNLOADS: SiteDownload[] = [
  { id: "d1", title: "Registration Form — Classes 6 to 9", subtitle: "For applicants seeking admission in Classes 6 through 9", description: "Official registration form for admission in Classes 6, 7, 8, and 9 at Cadet College Murree.", imageUrl: null, fileUrl: null, fileName: null, category: "Forms" },
  { id: "d2", title: "Registration Form — FSc / ICS", subtitle: "For applicants seeking admission in FSc or ICS programs", description: "Official registration form for admission in FSc Pre-Medical, Pre-Engineering and ICS programs at CCM.", imageUrl: null, fileUrl: null, fileName: null, category: "Forms" },
  { id: "d3", title: "Cadets Clearance Form", subtitle: "Required for cadets leaving the college", description: "Clearance form to be completed by cadets upon departure from Cadet College Murree. Must be signed by all departments.", imageUrl: null, fileUrl: null, fileName: null, category: "Forms" },
];

const staggerContainer = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1 } },
};
const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5 } },
};

export default function Downloads() {
  const baseUrl = useSiteBaseUrl();
  const blocks = usePageBlocks("downloads");
  const [downloads, setDownloads] = useState<SiteDownload[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch(withTenant("/api/website/downloads"))
      .then(r => r.ok ? r.json() : Promise.reject(r))
      .then(data => {
        setDownloads(Array.isArray(data) && data.length > 0 ? data : FALLBACK_DOWNLOADS);
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setDownloads(FALLBACK_DOWNLOADS);
        setLoading(false);
      });
  }, []);

  return (
    <>
      <Helmet>
        <title>Downloads | Cadet College Murree</title>
        <meta name="description" content="Download official forms from Cadet College Murree — Registration Forms for Classes 6-9 and FSc/ICS, and the Cadets Clearance Form." />
        <link rel="canonical" href={`${baseUrl}/downloads`} />
        <meta property="og:title" content="Downloads | Cadet College Murree" />
        <meta property="og:description" content="Download registration forms, fee structure, and clearance forms from Cadet College Murree." />
        <meta property="og:url" content={`${baseUrl}/downloads`} />
        <meta property="og:type" content="website" />
      </Helmet>

      <PageHero title={<EditableText page="downloads" blockKey="hero_title" value={blocks.hero_title || "Download"} />} breadcrumb="Download" />

      <section className="py-16 px-4 max-w-7xl mx-auto" data-testid="downloads-section">
        {loading && (
          <div className="flex justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary/50" />
          </div>
        )}
        {error && !loading && (
          <div className="flex flex-col items-center gap-3 py-20 text-foreground/50">
            <AlertCircle className="h-8 w-8" />
            <p className="text-sm">Could not load downloads. Please contact the college directly for forms.</p>
          </div>
        )}
        {!loading && !error && downloads.length === 0 && (
          <div className="text-center py-20 text-foreground/50">
            <EditableText as="p" multiline page="downloads" blockKey="empty_message" value={blocks.empty_message || "No downloads available at this time. Please contact the college for forms and documents."} />
          </div>
        )}
        {!loading && downloads.length > 0 && (
          <motion.div
            initial="hidden"
            animate="visible"
            variants={staggerContainer}
            className="grid sm:grid-cols-2 lg:grid-cols-3 gap-8"
          >
            {downloads.map((dl, i) => (
              <motion.div
                key={dl.id}
                variants={fadeUp}
                data-testid={`download-card-${i}`}
                className="bg-card border border-border rounded-2xl overflow-hidden hover:shadow-lg hover:border-primary/30 transition-all duration-300 flex flex-col"
              >
                {/* Preview image */}
                <div className="h-52 bg-muted overflow-hidden relative">
                  {dl.imageUrl ? (
                    <img
                      src={dl.imageUrl}
                      alt={`${dl.title}${dl.subtitle ? ` — ${dl.subtitle}` : ""} preview`}
                      loading="lazy"
                      width={400}
                      height={208}
                      className="w-full h-full object-cover object-top"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                        const parent = (e.target as HTMLImageElement).parentElement;
                        if (parent) {
                          parent.classList.add("flex", "items-center", "justify-center");
                          const icon = document.createElement("div");
                          icon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="w-16 h-16 text-muted-foreground/40" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>`;
                          parent.appendChild(icon);
                        }
                      }}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <FileText className="w-16 h-16 text-muted-foreground/40" />
                    </div>
                  )}
                  {/* PDF badge */}
                  <div className="absolute top-3 right-3 bg-primary text-primary-foreground text-xs font-bold px-2 py-1 rounded-md flex items-center gap-1">
                    <FileText className="w-3 h-3" />
                    <EditableText as="span" page="downloads" blockKey="form_badge" value={blocks.form_badge || "FORM"} />
                  </div>
                </div>

                {/* Content */}
                <div className="p-6 flex flex-col flex-1">
                  <h3 className="font-bold text-primary text-lg mb-1">{dl.title}</h3>
                  {dl.subtitle && <p className="text-accent text-sm font-semibold mb-3">{dl.subtitle}</p>}
                  {dl.description && <p className="text-foreground/75 text-sm leading-relaxed flex-1 mb-5">{dl.description}</p>}
                  {dl.fileUrl && (
                    <Button asChild className="w-full flex items-center gap-2" data-testid={`button-download-${i}`}>
                      <a href={dl.fileUrl} target="_blank" rel="noopener noreferrer" download={dl.fileName ?? undefined}>
                        <Download className="w-4 h-4" />
                        <EditableText as="span" page="downloads" blockKey="download_button" value={blocks.download_button || "Download"} />
                      </a>
                    </Button>
                  )}
                </div>
              </motion.div>
            ))}
          </motion.div>
        )}
      </section>
    </>
  );
}
