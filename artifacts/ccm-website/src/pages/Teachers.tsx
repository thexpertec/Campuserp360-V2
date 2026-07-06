import { Helmet } from "react-helmet-async";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect } from "react";
import PageHero from "@/components/PageHero";
import { springFadeUp, staggerContainer, use3DTilt } from "@/lib/animations";
import { withTenant } from "@/lib/tenant-fetch";
import { useSiteBaseUrl } from "@/lib/site-settings";
import { usePageBlocks } from "@/lib/usePageBlocks";
import EditableText from "@/components/cms/EditableText";
import { Loader2, AlertCircle } from "lucide-react";

const DEFAULT_PHOTO = "/placeholder.svg";

interface SiteFaculty {
  id: string;
  name: string;
  department: string;
  subject: string | null;
  designation: string | null;
  photoUrl: string | null;
}

function TeacherCard({ teacher, index }: { teacher: SiteFaculty; index: number }) {
  const { ref, rotateX, rotateY, scale, onMouseMove, onMouseLeave } = use3DTilt(10);

  return (
    <motion.div
      ref={ref}
      variants={springFadeUp}
      data-testid={`teacher-card-${index}`}
      style={{ rotateX, rotateY, scale, transformPerspective: 800 }}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      className="bg-card border border-border rounded-2xl overflow-hidden text-center hover:shadow-xl hover:border-primary/30 transition-shadow duration-300 group cursor-default"
    >
      <div className="relative h-56 overflow-hidden bg-muted">
        <motion.img
          src={teacher.photoUrl ?? DEFAULT_PHOTO}
          alt={`${teacher.name} — ${teacher.department} teacher at Cadet College Murree`}
          loading="lazy"
          width={280}
          height={224}
          className="w-full h-full object-cover object-top"
          whileHover={{ scale: 1.06 }}
          transition={{ duration: 0.4 }}
          onError={(e) => { (e.target as HTMLImageElement).src = DEFAULT_PHOTO; }}
        />
        {/* Shimmer overlay on hover */}
        <motion.div
          initial={{ x: "-100%", opacity: 0 }}
          whileHover={{ x: "200%", opacity: 0.4 }}
          transition={{ duration: 0.6 }}
          className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent skew-x-12 pointer-events-none"
        />
        <motion.div
          initial={{ opacity: 0 }}
          whileHover={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
          className="absolute inset-0 bg-gradient-to-t from-primary/40 to-transparent"
        />
      </div>
      <div className="p-5">
        <h3 className="font-bold text-primary text-base mb-1">{teacher.name}</h3>
        {teacher.designation && (
          <p className="text-xs text-foreground/60 mb-1">{teacher.designation}</p>
        )}
        <motion.span
          whileHover={{ scale: 1.05 }}
          className="inline-block text-xs font-semibold text-accent bg-accent/10 px-3 py-1 rounded-full"
        >
          {teacher.subject ?? teacher.department}
        </motion.span>
      </div>
    </motion.div>
  );
}

const FALLBACK_TEACHERS: SiteFaculty[] = [
  { id: "t1",  name: "Mr. Shahid Iqbal",      department: "Mathematics",         subject: "Mathematics",          designation: "Senior Maths Teacher",      photoUrl: null },
  { id: "t2",  name: "Mr. Tariq Mehmood",     department: "Physics",             subject: "Physics",              designation: "Senior Physics Teacher",    photoUrl: null },
  { id: "t3",  name: "Mr. Imran Khan",        department: "Chemistry",           subject: "Chemistry",            designation: "Senior Chemistry Teacher",  photoUrl: null },
  { id: "t4",  name: "Mr. Zubair Ahmed",      department: "Biology",             subject: "Biology",              designation: "Biology Teacher",           photoUrl: null },
  { id: "t5",  name: "Mr. Asif Hussain",      department: "English",             subject: "English",              designation: "Senior English Teacher",    photoUrl: null },
  { id: "t6",  name: "Mr. Naveed Anjum",      department: "Urdu",                subject: "Urdu",                 designation: "Urdu Teacher",              photoUrl: null },
  { id: "t7",  name: "Mr. Khalid Mahmood",    department: "Computer Science",    subject: "Computer Science",     designation: "Computer Science Teacher",  photoUrl: null },
  { id: "t8",  name: "Mr. Salman Raza",       department: "Islamiyat",           subject: "Islamiyat",            designation: "Islamiyat Teacher",         photoUrl: null },
  { id: "t9",  name: "Mr. Omer Farooq",       department: "Pakistan Studies",    subject: "Pakistan Studies",     designation: "Pakistan Studies Teacher",  photoUrl: null },
  { id: "t10", name: "Mr. Adnan Mustafa",     department: "Economics",           subject: "Economics",            designation: "Economics Teacher",         photoUrl: null },
  { id: "t11", name: "Capt. Rizwan Ali",      department: "Physical Education",  subject: "Physical Education",   designation: "PT Instructor",             photoUrl: null },
  { id: "t12", name: "Mr. Amir Shahzad",      department: "History",             subject: "History",              designation: "History Teacher",           photoUrl: null },
  { id: "t13", name: "Mr. Bilal Chaudhry",    department: "Geography",           subject: "Geography",            designation: "Geography Teacher",         photoUrl: null },
];

export default function Teachers() {
  const baseUrl = useSiteBaseUrl();
  const blocks = usePageBlocks("teachers");
  const [teachers, setTeachers] = useState<SiteFaculty[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [active, setActive] = useState("All Departments");

  useEffect(() => {
    fetch(withTenant("/api/website/faculty"))
      .then(r => r.ok ? r.json() : Promise.reject(r))
      .then(data => {
        setTeachers(Array.isArray(data) && data.length > 0 ? data : FALLBACK_TEACHERS);
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setTeachers(FALLBACK_TEACHERS);
        setLoading(false);
      });
  }, []);

  const departments = ["All Departments", ...Array.from(new Set(teachers.map(t => t.department)))];
  const filtered = active === "All Departments" ? teachers : teachers.filter(t => t.department === active);

  return (
    <>
      <Helmet>
        <title>Our Dedicated Faculty | Cadet College Murree</title>
        <meta name="description" content="Meet the dedicated faculty of Cadet College Murree — experienced teachers in Academics committed to producing educated, motivated, and spirited young leaders." />
        <link rel="canonical" href={`${baseUrl}/teachers`} />
        <meta property="og:title" content="Our Dedicated Faculty | Cadet College Murree" />
        <meta property="og:url" content={`${baseUrl}/teachers`} />
        <meta property="og:type" content="website" />
      </Helmet>

      <PageHero title={<EditableText page="teachers" blockKey="hero_title" value={blocks.hero_title || "Our Dedicated Faculty"} />} breadcrumb="Our Dedicated Faculty" />

      <section className="py-16 px-4 max-w-7xl mx-auto" data-testid="teachers-section">
        {loading && (
          <div className="flex justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary/50" />
          </div>
        )}
        {error && !loading && (
          <div className="flex flex-col items-center gap-3 pb-6 text-foreground/50">
            <AlertCircle className="h-6 w-6" />
            <p className="text-sm">Could not load faculty information. Showing cached data.</p>
          </div>
        )}
        {!loading && teachers.length > 0 && (
          <>
            {/* Department filter */}
            <div className="flex flex-wrap gap-3 justify-center mb-12" data-testid="teachers-filter">
              {departments.map(dep => (
                <motion.button
                  key={dep}
                  data-testid={`filter-dept-${dep.toLowerCase().replace(/\s+/g, "-")}`}
                  onClick={() => setActive(dep)}
                  whileHover={{ y: -2 }}
                  whileTap={{ scale: 0.96 }}
                  className={`px-6 py-2.5 rounded-full text-sm font-semibold border transition-all duration-200 ${
                    active === dep
                      ? "bg-primary text-primary-foreground border-primary shadow"
                      : "bg-background text-foreground border-border hover:border-primary hover:text-primary"
                  }`}
                >
                  {dep}
                </motion.button>
              ))}
            </div>

            {/* Section header */}
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={springFadeUp}
              className="text-center mb-10"
            >
              <p className="text-accent uppercase tracking-widest font-semibold text-sm mb-2"><EditableText as="span" page="teachers" blockKey="team_eyebrow" value={blocks.team_eyebrow || "Our Team"} /></p>
              <h2 className="text-2xl md:text-3xl font-bold text-primary">
                <EditableText as="span" page="teachers" blockKey="team_heading" value={blocks.team_heading || "Dedicated to Shaping Leaders"} />
              </h2>
            </motion.div>

            {/* Grid */}
            <AnimatePresence mode="wait">
              <motion.div
                key={active}
                initial="hidden"
                animate="visible"
                variants={staggerContainer(0.06)}
                className="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6"
              >
                {filtered.map((teacher, i) => (
                  <TeacherCard key={teacher.id} teacher={teacher} index={i} />
                ))}
              </motion.div>
            </AnimatePresence>
          </>
        )}
      </section>
    </>
  );
}
