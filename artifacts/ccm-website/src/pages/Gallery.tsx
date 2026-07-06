import { Helmet } from "react-helmet-async";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import { useState, useEffect } from "react";
import PageHero from "@/components/PageHero";
import { Loader2, AlertCircle } from "lucide-react";
import { withTenant } from "@/lib/tenant-fetch";
import { usePageBlocks } from "@/lib/usePageBlocks";
import EditableText from "@/components/cms/EditableText";
import SectionColor from "@/components/cms/SectionColor";
import { useSiteBaseUrl } from "@/lib/site-settings";

interface GalleryItem {
  id: string;
  title: string;
  category: string;
  imageUrl: string;
  imageAlt: string | null;
  author: string | null;
}

type Category = "All" | string;

const FALLBACK_GALLERY: GalleryItem[] = [
  { id: "g1", title: "President of Pakistan Visit", category: "Official Visit", imageUrl: "/placeholder.svg", imageAlt: "President of Pakistan visiting Cadet College Murree", author: null },
  { id: "g2", title: "Independence Day 2023", category: "National Day", imageUrl: "/placeholder.svg", imageAlt: "Independence Day celebration at Cadet College Murree", author: null },
  { id: "g3", title: "New Cadets Joining Day 2023", category: "College Function", imageUrl: "/placeholder.svg", imageAlt: "New Cadets Joining Day at Cadet College Murree", author: null },
  { id: "g4", title: "Defense Day 2023", category: "National Day", imageUrl: "/placeholder.svg", imageAlt: "Defense Day ceremony at Cadet College Murree", author: null },
  { id: "g5", title: "DG Naval Intelligence Visit", category: "Official Visit", imageUrl: "/placeholder.svg", imageAlt: "DG Naval Intelligence visiting Cadet College Murree", author: null },
  { id: "g6", title: "Naval Academy Commandant Visit", category: "Official Visit", imageUrl: "/placeholder.svg", imageAlt: "Naval Academy Commandant visit to Cadet College Murree", author: null },
  { id: "g7", title: "Official Visit 2023", category: "Official Visit", imageUrl: "/placeholder.svg", imageAlt: "Official visit to Cadet College Murree", author: null },
  { id: "g8", title: "Sports Gala 2023", category: "Sports", imageUrl: "https://images.unsplash.com/photo-1526232761682-d26e03ac148e?w=900&auto=format&fit=crop&q=80", imageAlt: "Sports Gala at Cadet College Murree", author: null },
  { id: "g9", title: "Academic Activities", category: "Academic", imageUrl: "https://images.unsplash.com/photo-1509062522246-3755977927d7?w=600&auto=format&fit=crop&q=80", imageAlt: "Academic activities at Cadet College Murree", author: null },
];

export default function Gallery() {
  const baseUrl = useSiteBaseUrl();
  const blocks = usePageBlocks("gallery");
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [activeCategory, setActiveCategory] = useState<Category>("All");
  const [selectedImage, setSelectedImage] = useState<GalleryItem | null>(null);

  useEffect(() => {
    fetch(withTenant("/api/website/gallery"))
      .then(r => r.ok ? r.json() : Promise.reject(r))
      .then(data => {
        setItems(Array.isArray(data) && data.length > 0 ? data : FALLBACK_GALLERY);
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setItems(FALLBACK_GALLERY);
        setLoading(false);
      });
  }, []);

  const categories: Category[] = ["All", ...Array.from(new Set(items.map(i => i.category)))];
  const filtered = activeCategory === "All" ? items : items.filter(i => i.category === activeCategory);

  return (
    <>
      <Helmet>
        <title>Gallery Corner | Cadet College Murree</title>
        <meta
          name="description"
          content="Explore the Gallery Corner of Cadet College Murree — Independence Day, Defense Day, official visits by President of Pakistan, Naval commanders, and college functions."
        />
        <link rel="canonical" href={`${baseUrl}/gallery`} />
        <meta property="og:title" content="Gallery Corner | Cadet College Murree" />
        <meta property="og:description" content="Browse photos from Cadet College Murree — Independence Day, Defense Day, Presidential visits, and college functions." />
        <meta property="og:url" content={`${baseUrl}/gallery`} />
        <meta property="og:type" content="website" />
      </Helmet>

      <div>
        <PageHero title={<EditableText page="gallery" blockKey="hero_title" value={blocks.hero_title || "Gallery Corner"} />} breadcrumb="Gallery Corner" />

        {loading && (
          <div className="flex justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary/50" />
          </div>
        )}

        {error && !loading && (
          <div className="flex flex-col items-center gap-3 py-6 text-foreground/50 max-w-7xl mx-auto px-4">
            <AlertCircle className="h-6 w-6" />
            <p className="text-sm">Could not load the latest gallery. Showing cached images.</p>
          </div>
        )}

        {/* Filter Buttons */}
        {!loading && items.length > 0 && (
          <SectionColor page="gallery" scope="filter" label="Filters" kind="light" className="py-10 px-4 max-w-7xl mx-auto" data-testid="gallery-filter">
            <LayoutGroup id="gallery-filter">
              <div className="flex flex-wrap gap-3 justify-center">
                {categories.map((cat) => (
                  <motion.button
                    key={cat}
                    data-testid={`filter-${cat.toLowerCase().replace(/\s+/g, "-")}`}
                    onClick={() => setActiveCategory(cat)}
                    whileHover={{ y: -2 }}
                    whileTap={{ scale: 0.96 }}
                    className={`relative px-5 py-2 rounded-full text-sm font-semibold border transition-colors duration-200 ${
                      activeCategory === cat
                        ? "bg-primary text-primary-foreground border-primary shadow-md"
                        : "bg-background text-foreground border-border hover:border-primary hover:text-primary"
                    }`}
                  >
                    {activeCategory === cat && (
                      <motion.span
                        layoutId="filter-pill"
                        className="absolute inset-0 rounded-full bg-primary"
                        style={{ zIndex: -1 }}
                        transition={{ type: "spring", stiffness: 380, damping: 30 }}
                      />
                    )}
                    {cat}
                  </motion.button>
                ))}
              </div>
            </LayoutGroup>
          </SectionColor>
        )}

        {/* Grid */}
        {!loading && items.length > 0 && (
          <SectionColor page="gallery" scope="grid" label="Gallery Grid" kind="light" className="pb-20 px-4 max-w-7xl mx-auto" data-testid="gallery-grid">
            <motion.div layout className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              <AnimatePresence mode="popLayout">
                {filtered.map((item, i) => (
                  <motion.div
                    key={item.id}
                    layout
                    initial={{ opacity: 0, scale: 0.88, y: 24 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.88, y: -12 }}
                    transition={{ duration: 0.4, delay: i * 0.05, ease: [0.22, 1, 0.36, 1] }}
                    data-testid={`gallery-item-${i}`}
                    className="group relative rounded-2xl overflow-hidden cursor-pointer shadow-md hover:shadow-xl transition-shadow duration-300 bg-card border border-border"
                    onClick={() => setSelectedImage(item)}
                    whileHover={{ y: -4 }}
                  >
                    <div className="overflow-hidden">
                      <motion.img
                        src={item.imageUrl}
                        alt={item.imageAlt ?? item.title}
                        loading="lazy"
                        width={600}
                        height={400}
                        className="w-full h-64 object-cover"
                        whileHover={{ scale: 1.07 }}
                        transition={{ duration: 0.5 }}
                      />
                    </div>
                    <motion.div
                      initial={{ opacity: 0 }}
                      whileHover={{ opacity: 1 }}
                      transition={{ duration: 0.25 }}
                      className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent flex flex-col justify-end p-5"
                    >
                      <span className="text-white font-bold text-base leading-snug">{item.title}</span>
                      <span className="text-white/85 text-xs mt-1">
                        {item.category}{item.author ? ` · By ${item.author}` : ""}
                      </span>
                    </motion.div>
                    <div className="p-4 border-t border-border">
                      <h3 className="font-semibold text-primary text-sm">{item.title}</h3>
                      {item.author && <p className="text-xs text-foreground/80 mt-0.5">By {item.author}</p>}
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </motion.div>
          </SectionColor>
        )}

        {/* Lightbox */}
        <AnimatePresence>
          {selectedImage && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="fixed inset-0 z-50 bg-black/93 flex items-center justify-center p-4"
              data-testid="gallery-lightbox"
              onClick={() => setSelectedImage(null)}
            >
              <motion.div
                initial={{ scale: 0.78, opacity: 0, y: 40 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.78, opacity: 0, y: 20 }}
                transition={{ type: "spring", stiffness: 260, damping: 26 }}
                className="max-w-4xl w-full relative"
                onClick={(e) => e.stopPropagation()}
              >
                <img
                  src={selectedImage.imageUrl}
                  alt={selectedImage.imageAlt ?? selectedImage.title}
                  className="w-full rounded-2xl max-h-[78vh] object-contain shadow-2xl"
                />
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2, duration: 0.4 }}
                  className="text-center mt-5"
                >
                  <h3 className="text-white font-bold text-xl">{selectedImage.title}</h3>
                  <p className="text-white/50 text-sm mt-1">
                    {selectedImage.category}{selectedImage.author ? ` · By ${selectedImage.author}` : ""}
                  </p>
                </motion.div>
                <motion.button
                  initial={{ opacity: 0, scale: 0.6 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.15, type: "spring", stiffness: 300 }}
                  whileHover={{ scale: 1.15, backgroundColor: "rgba(255,255,255,0.25)" }}
                  onClick={() => setSelectedImage(null)}
                  data-testid="button-close-lightbox"
                  className="absolute -top-4 -right-4 w-9 h-9 rounded-full bg-white/10 text-white flex items-center justify-center text-xl transition-colors"
                  aria-label="Close lightbox"
                >
                  ×
                </motion.button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}
