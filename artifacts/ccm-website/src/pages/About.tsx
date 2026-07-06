import { Helmet } from "react-helmet-async";
import { motion } from "framer-motion";
import { BookOpen, FlaskConical, Monitor, Globe, Users, Utensils, Shield } from "lucide-react";
import PageHero from "@/components/PageHero";
import { usePageBlocks } from "@/lib/usePageBlocks";
import EditableText from "@/components/cms/EditableText";
import { useSiteBaseUrl } from "@/lib/site-settings";
import EditableImage from "@/components/cms/EditableImage";
import SectionColor from "@/components/cms/SectionColor";
import {
  springFadeUp,
  springFadeLeft,
  springFadeRight,
  scaleIn,
  staggerContainer,
  use3DTilt,
  useParallax,
} from "@/lib/animations";

const facilities = [
  {
    icon: Utensils,
    title: "Central Mess",
    description:
      "A well-maintained central dining facility providing nutritious, balanced meals to all cadets. The mess fosters a sense of community and instills the discipline of communal living — a cornerstone of military tradition.",
  },
  {
    icon: BookOpen,
    title: "Central Library",
    description:
      "Cultivating a reading habit is crucial and should be nurtured among the Cadets from a young age. A substantial collection of books on all subjects, catering to diverse interests, is regularly updated for the Cadets. The library remains accessible in the evenings for Cadets seeking supplementary study materials.",
  },
  {
    icon: FlaskConical,
    title: "Science Laboratories",
    description:
      "The College possesses well-equipped Chemistry, Physics, and Biology Laboratories, overseen by experienced Teachers with the assistance of Lab In-charges. These facilities empower Cadets to develop proficiency in practical skills.",
  },
  {
    icon: Monitor,
    title: "Smart / Multimedia Classroom",
    description:
      "Cadet College Murree features a suitably furnished Smart / Multimedia Classroom, equipped with cutting-edge computers and a Smart Board. Smart Class is mandatory for classes V to VIII, with optional availability for Board Classes.",
  },
  {
    icon: Globe,
    title: "Foreign Languages Lab",
    description:
      "A dedicated Foreign Languages Lab designed to help cadets develop proficiency in languages beyond their mother tongue. Language fluency broadens perspectives and prepares cadets for leadership roles nationally and internationally.",
  },
  {
    icon: Users,
    title: "Ex-Hillians Directory",
    description:
      "An active and proud alumni network of Ex-Hillians — graduates who have gone on to serve in the Pakistan Army, civil services, business, and more. The directory connects current cadets with mentors who have walked the same halls.",
  },
];

const coreValues = [
  { title: "Discipline", desc: "Military-grade discipline instilled from day one — the foundation of every great leader." },
  { title: "Academic Excellence", desc: "Rigorous academics matched with practical learning in modern laboratories and classrooms." },
  { title: "Physical Fitness", desc: "Daily drill, physical training, and evening games ensure cadets develop strong, resilient bodies." },
  { title: "Patriotism", desc: "Deep pride in Pakistan and service to nation is woven into every aspect of college life." },
  { title: "Character Building", desc: "Co-curricular activities, leadership roles, and mentorship forge men and women of character." },
  { title: "Camaraderie", desc: "The bonds forged between cadets last a lifetime — a brotherhood and sisterhood of HILLIANS." },
];

function FacilityCard({ facility, index }: { facility: typeof facilities[0]; index: number }) {
  const { ref, rotateX, rotateY, scale, onMouseMove, onMouseLeave } = use3DTilt(8);
  const Icon = facility.icon;

  return (
    <motion.div
      ref={ref}
      variants={springFadeUp}
      data-testid={`facility-card-${index}`}
      style={{ rotateX, rotateY, scale, transformPerspective: 800 }}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      className="bg-card border border-border rounded-2xl p-8 hover:shadow-xl hover:border-primary/30 transition-shadow duration-300 cursor-default"
    >
      <motion.div
        whileHover={{ scale: 1.1, rotate: 5 }}
        transition={{ type: "spring", stiffness: 300, damping: 20 }}
        className="w-14 h-14 bg-primary/10 rounded-xl flex items-center justify-center mb-6"
      >
        <Icon className="w-7 h-7 text-primary" />
      </motion.div>
      <h3 className="font-bold text-xl text-primary mb-3">{facility.title}</h3>
      <p className="text-foreground/80 leading-relaxed text-sm">{facility.description}</p>
    </motion.div>
  );
}

export default function About() {
  const baseUrl = useSiteBaseUrl();
  const blocks = usePageBlocks("about");
  const [imgRef, imgY] = useParallax(30);

  return (
    <>
      <Helmet>
        <title>About Cadet College Murree | Military Education Since 2002</title>
        <meta
          name="description"
          content="Learn about Cadet College Murree — founded in 2002 following Pakistan Army traditions. Safe campus, world-class facilities, and a mission to produce educated, motivated cadets."
        />
        <link rel="canonical" href={`${baseUrl}/about`} />
        <meta property="og:title" content="About Cadet College Murree" />
        <meta property="og:description" content="Founded in 2002, Cadet College Murree follows Pakistan Army military traditions to produce educated, motivated leaders." />
        <meta property="og:url" content={`${baseUrl}/about`} />
        <meta property="og:type" content="website" />
      </Helmet>

      <div>
        <PageHero title={<EditableText page="about" blockKey="hero_title" value={blocks.hero_title || "About Us"} />} breadcrumb="About Us" />

        {/* Get to Know Us */}
        <SectionColor page="about" scope="mission" label="Welcome" kind="light" className="py-20 px-4 max-w-7xl mx-auto" data-testid="about-mission">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={springFadeLeft}
            >
              <div style={{ overflow: "hidden" }}>
                <motion.p
                  initial={{ y: "110%" }}
                  whileInView={{ y: "0%" }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.6, ease: [0.76, 0, 0.24, 1] }}
                  className="text-accent uppercase tracking-widest font-semibold text-sm mb-3"
                >
                  Get to Know Us
                </motion.p>
              </div>
              <div style={{ overflow: "hidden" }}>
                <motion.h2
                  initial={{ y: "110%" }}
                  whileInView={{ y: "0%" }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.7, ease: [0.76, 0, 0.24, 1], delay: 0.05 }}
                  className="text-3xl md:text-4xl font-bold text-primary mb-6 leading-tight"
                >
                  Cadet College Murree
                </motion.h2>
              </div>
              <motion.p
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.2, duration: 0.6 }}
                className="text-foreground/85 leading-relaxed mb-4"
              >
                <EditableText as="span" multiline page="about" blockKey="mission_body" value={blocks.mission_body || "Cadet College Murree is established as an educational institute, aiming at excellence in education to benefit the community. Notwithstanding the educational and economical constraints, the college has set its inviolate goals to produce educated, motivated and spirited cadets."} />
              </motion.p>
              <motion.p
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.3, duration: 0.6 }}
                className="text-foreground/85 leading-relaxed mb-4"
              >
                <EditableText as="span" multiline page="about" blockKey="history_body" value={blocks.history_body || "Inaugurated in August 2002, Cadet College Murree is an independent College, which provides training and education following military traditions and customs of the Pakistan Army."} />
              </motion.p>
              <motion.p
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.4, duration: 0.6 }}
                className="text-foreground/85 leading-relaxed"
              >
                <EditableText as="span" multiline page="about" blockKey="vision_body" value={blocks.vision_body || "Cadet College Murree, governed by the Board of Directors, is a non profit, interdenominational institution, and is not an official activity of the Pakistan Armed Forces."} />
              </motion.p>
            </motion.div>

            {/* Parallax image */}
            <motion.div
              ref={imgRef as React.RefObject<HTMLDivElement>}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={springFadeRight}
              className="relative overflow-hidden rounded-2xl shadow-xl"
            >
              <motion.div style={{ y: imgY }} className="scale-110">
                <EditableImage
                  page="about"
                  blockKey="welcome_image"
                  src={blocks.welcome_image || null}
                  alt="Cadet College Murree cadets — Soldiers R Borne to Fight — in military uniform"
                  loading="lazy"
                  width={700}
                  height={560}
                  imgClassName="w-full h-[460px] object-cover"
                />
              </motion.div>
              <div className="absolute inset-0 bg-gradient-to-t from-primary/40 to-transparent" />
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.5, duration: 0.5 }}
                className="absolute bottom-4 left-4 bg-primary/90 text-primary-foreground px-4 py-2 rounded-lg text-sm font-bold backdrop-blur"
              >
                Est. August 2002
              </motion.div>
            </motion.div>
          </div>
        </SectionColor>

        {/* Core Values */}
        <SectionColor page="about" scope="values" label="Core Values" kind="light" className="bg-muted border-y border-border py-16 px-4" data-testid="about-values">
          <div className="max-w-4xl mx-auto">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={springFadeUp}
              className="text-center mb-10"
            >
              <p className="text-accent uppercase tracking-widest font-semibold text-sm mb-3"><EditableText as="span" page="about" blockKey="values_eyebrow" value={blocks.values_eyebrow || "What We Stand For"} /></p>
              <h2 className="text-2xl md:text-3xl font-bold text-primary"><EditableText as="span" page="about" blockKey="values_heading" value={blocks.values_heading || "Core Values"} /></h2>
            </motion.div>
            <motion.ul
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={staggerContainer(0.08)}
              className="grid sm:grid-cols-2 gap-5"
            >
              {coreValues.map((val, i) => (
                <motion.li
                  key={i}
                  variants={springFadeUp}
                  whileHover={{ scale: 1.02, borderColor: "hsl(var(--primary) / 0.4)" }}
                  className="flex gap-3 bg-card border border-border rounded-xl p-5 transition-shadow hover:shadow-md"
                >
                  <motion.span
                    initial={{ scale: 0 }}
                    whileInView={{ scale: 1 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.1 + i * 0.07, type: "spring", stiffness: 300 }}
                    className="w-2.5 h-2.5 rounded-full bg-accent mt-1.5 flex-shrink-0"
                  />
                  <div>
                    <span className="font-bold text-primary"><EditableText as="span" page="about" blockKey={`core_value_${i}_title`} value={blocks[`core_value_${i}_title`] || val.title} />: </span>
                    <span className="text-foreground/85 text-sm"><EditableText as="span" multiline page="about" blockKey={`core_value_${i}_desc`} value={blocks[`core_value_${i}_desc`] || val.desc} /></span>
                  </div>
                </motion.li>
              ))}
            </motion.ul>
          </div>
        </SectionColor>

        {/* Safe Campus */}
        <SectionColor page="about" scope="safety" label="Safe Campus" kind="dark" className="bg-primary text-primary-foreground py-20 px-4 overflow-hidden" data-testid="about-campus-safety">
          <div className="max-w-4xl mx-auto text-center relative">
            {/* Animated glow ring */}
            <motion.div
              animate={{ scale: [1, 1.15, 1], opacity: [0.15, 0.3, 0.15] }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
              className="absolute -top-16 left-1/2 -translate-x-1/2 w-64 h-64 rounded-full bg-accent/20 blur-3xl pointer-events-none"
            />
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              whileInView={{ scale: 1, opacity: 1 }}
              viewport={{ once: true }}
              transition={{ type: "spring", stiffness: 180, damping: 18 }}
              className="flex justify-center mb-6 relative z-10"
            >
              <motion.div
                animate={{ rotate: [0, 5, -5, 0] }}
                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
              >
                <Shield className="w-14 h-14 text-accent" />
              </motion.div>
            </motion.div>
            <div style={{ overflow: "hidden" }} className="relative z-10">
              <motion.h2
                initial={{ y: "110%" }}
                whileInView={{ y: "0%" }}
                viewport={{ once: true }}
                transition={{ duration: 0.7, ease: [0.76, 0, 0.24, 1] }}
                className="text-3xl md:text-4xl font-bold mb-3"
              >
                <EditableText as="span" page="about" blockKey="safety_heading" value={blocks.safety_heading || "Safe and Secure Campus"} />
              </motion.h2>
            </div>
            <motion.h3
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ delay: 0.3, duration: 0.5 }}
              className="text-xl font-bold text-accent mb-6 relative z-10"
            >
              Cadet College Murree
            </motion.h3>
            <motion.p
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.4, duration: 0.6 }}
              className="text-primary-foreground/80 text-lg leading-relaxed relative z-10"
            >
              <EditableText as="span" multiline page="about" blockKey="safety_body" value={blocks.safety_body || "The safety and well-being of every cadet is our highest priority. The campus operates under round-the-clock security protocols consistent with military standards. Parents can rest assured that their children are in a secure, structured, and nurturing environment where they can grow and thrive without distraction."} />
            </motion.p>
          </div>
        </SectionColor>

        {/* Campus Facilities */}
        <SectionColor page="about" scope="facilities" label="Facilities" kind="light" className="py-20 px-4 max-w-7xl mx-auto" data-testid="about-facilities">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={scaleIn}
            className="text-center mb-14"
          >
            <p className="text-accent uppercase tracking-widest font-semibold text-sm mb-3"><EditableText as="span" page="about" blockKey="facilities_eyebrow" value={blocks.facilities_eyebrow || "Infrastructure"} /></p>
            <h2 className="text-3xl md:text-4xl font-bold text-primary"><EditableText as="span" page="about" blockKey="facilities_heading" value={blocks.facilities_heading || "World-Class Campus Facilities"} /></h2>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={staggerContainer(0.1)}
            className="grid sm:grid-cols-2 lg:grid-cols-3 gap-8"
          >
            {facilities.map((facility, i) => (
              <FacilityCard key={i} facility={facility} index={i} />
            ))}
          </motion.div>
        </SectionColor>
      </div>
    </>
  );
}
