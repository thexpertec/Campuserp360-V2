import { useMemo, useState, useEffect, useRef } from "react";
import { Helmet } from "react-helmet-async";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import { Link } from "wouter";
import { use3DTilt } from "@/lib/animations";
import PageHero from "@/components/PageHero";
import { usePageBlocks } from "@/lib/usePageBlocks";
import EditableText from "@/components/cms/EditableText";
import { useSiteSettings, useSiteBaseUrl } from "@/lib/site-settings";
import { withTenant } from "@/lib/tenant-fetch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Shield,
  Stethoscope,
  Wrench,
  Landmark,
  GraduationCap,
  Trophy,
  Quote,
  MapPin,
  Calendar,
  ChevronDown,
  ChevronUp,
  Star,
  ArrowRight,
  Users,
  Sparkles,
  Award,
  BookOpen,
  PlaneTakeoff,
  Microscope,
} from "lucide-react";

type Category =
  | "all"
  | "armed_forces"
  | "medical"
  | "engineering"
  | "civil_services"
  | "academia";

type Alumnus = {
  id: string;
  name: string;
  batch: string;          // graduation year(s)
  category: Exclude<Category, "all">;
  categoryLabel: string;
  role: string;           // current rank/title
  organization: string;
  location: string;
  quote: string;
  story: string[];        // paragraphs
  achievements: string[];
  badge?: string;         // optional honour ribbon (e.g., "Sword of Honour")
  accent: string;         // tailwind gradient classes for the avatar
  featured?: boolean;
};

const FALLBACK_ALUMNI: Alumnus[] = [
  {
    id: "brig-zafar",
    name: "Brig. Zafar Iqbal Khan, SI(M)",
    batch: "Class of 1998",
    category: "armed_forces",
    categoryLabel: "Pakistan Army",
    role: "Brigade Commander, 12 Inf Brigade",
    organization: "Pakistan Army",
    location: "Rawalpindi",
    quote:
      "Murree taught me that leadership is not a uniform you wear — it is a habit you carry into every room you ever enter.",
    badge: "Sword of Honour, PMA",
    accent: "from-emerald-600 to-emerald-900",
    featured: true,
    story: [
      "Zafar Iqbal walked through the gates of Cadet College Murree as a quiet boy from Bhakkar in 1992. By the time he passed out six years later, he was the College Senior, captain of the cross-country team and a finalist in the inter-collegiate declamation contest. Few of his classmates were surprised when he secured a place at the Pakistan Military Academy on the first attempt — and even fewer were surprised when he walked out of Kakul holding the Sword of Honour.",
      "Commissioned into the Punjab Regiment, Zafar saw service in Siachen, the tribal areas during Operation Zarb-e-Azb, and as part of the UN peacekeeping contingent in Congo. He was awarded the Sitara-i-Imtiaz (Military) for an operation in North Waziristan that he still refuses to talk about in detail. 'The men who did the actual work,' he says, 'do not need the medal pinned on me.'",
      "Today, as a Brigade Commander, he visits the Murree campus every summer to address the senior class. He brings nothing but a single message: 'Whatever you are going to become — soldier, doctor, banker, father — start practising it here, on this hill, this term. You don't grow up the day you leave. You leave the day you grow up.'",
    ],
    achievements: [
      "Sword of Honour, PMA Long Course 102 (2001)",
      "Sitara-i-Imtiaz (Military) — 2017",
      "UN Medal — MONUSCO, Democratic Republic of Congo",
      "Commander, 12 Infantry Brigade since 2024",
    ],
  },
  {
    id: "dr-amna",
    name: "Dr. Amna Tariq, FRCS",
    batch: "Class of 2005",
    category: "medical",
    categoryLabel: "Medicine",
    role: "Consultant Paediatric Cardiac Surgeon",
    organization: "Great Ormond Street Hospital, London",
    location: "London, United Kingdom",
    quote:
      "Every time I close a baby's chest after a successful repair, I think of the chapel hill at Murree where I first realised the world is much bigger than my doubts.",
    badge: "King Edward Medical University Gold Medal",
    accent: "from-rose-600 to-rose-900",
    featured: true,
    story: [
      "When Amna Tariq joined the first co-educational batch at Cadet College Murree in 1999, the system was still finding its feet. She often described herself as 'one of seventeen girls in a college built for boys'. By the time she finished her FSc in 2005, she had topped the Federal Board across both the Pre-Medical and Mathematics groups — a record that still stands at the college.",
      "She earned an MBBS from King Edward Medical University with a gold medal in surgery, completed her FCPS in Cardiothoracic Surgery from the Aga Khan University Hospital, and was selected for a paediatric cardiac fellowship at the University of Toronto. Today she leads the neonatal cardiac programme at Great Ormond Street, where she has performed over 1,400 open-heart procedures on infants under one year of age.",
      "Amna funds the 'Hill Top Scholarship' at her alma mater — a full ride for two girl cadets each year from underprivileged districts of Khyber Pakhtunkhwa. 'I want every girl who climbs that hill,' she says, 'to know there is somebody at the top waving her up.'",
    ],
    achievements: [
      "Federal Board topper, FSc Pre-Medical (2005)",
      "Gold Medal in Surgery, KEMU (2011)",
      "FCPS Cardiothoracic Surgery, AKUH (2018)",
      "Lead surgeon, Neonatal Cardiac Programme, GOSH London",
      "Founder, Hill Top Scholarship for Girl Cadets",
    ],
  },
  {
    id: "engr-bilal",
    name: "Engr. Bilal Hussain Awan",
    batch: "Class of 2008",
    category: "engineering",
    categoryLabel: "Engineering · Tech",
    role: "Principal Engineer, Autonomy",
    organization: "Waymo (Alphabet)",
    location: "Mountain View, California",
    quote:
      "Discipline in Murree was about waking up at 5:30 for PT. Discipline in Silicon Valley is about waking up to the same problem every day for seven years until you solve it.",
    accent: "from-sky-600 to-indigo-900",
    story: [
      "Bilal joined the college in Class 7th from a small village near Talagang. English, he later admitted, 'was a language I had only seen in books, never spoken in a room'. By Class 9th, he was the captain of the college Science Club and had built — using a microcontroller smuggled from his uncle's electronics shop — an automatic flag-pole that lowered the national flag at sunset by itself. The Principal kept it on display in the corridor for three years.",
      "He topped his FSc Pre-Engineering year, joined GIK Institute on a full merit scholarship, and went on to do an MS and PhD in Robotics from Carnegie Mellon University. At Waymo, he leads the perception team that has driven over 50 million autonomous miles on public roads.",
      "Every December, Bilal sends a Christmas-week shipment of Raspberry Pis, Arduino kits and soldering irons to the college science lab — addressed simply to 'The next boy from Talagang'.",
    ],
    achievements: [
      "Federal Board top 10, FSc Pre-Engineering (2008)",
      "Full merit scholarship, GIK Institute (2008-2012)",
      "PhD in Robotics, Carnegie Mellon University (2018)",
      "Principal Engineer, Waymo Autonomy team",
      "Co-inventor on 14 US patents in autonomous perception",
    ],
  },
  {
    id: "sqn-leader-fatima",
    name: "Sqn Ldr Fatima Zahra",
    batch: "Class of 2010",
    category: "armed_forces",
    categoryLabel: "Pakistan Air Force",
    role: "F-16 Fighter Pilot, No. 9 Squadron",
    organization: "Pakistan Air Force",
    location: "Sargodha",
    quote:
      "The first time I went supersonic, I caught myself smiling. Then I remembered the chapel hill — and I smiled wider.",
    badge: "Best Pilot, Initial Fighter Conversion",
    accent: "from-cyan-600 to-blue-900",
    story: [
      "Fatima was twelve years old when she watched a pair of F-7Ps from Mianwali break the sky above Murree during an Independence Day flypast. She turned to her hostel matron and said, very quietly, 'I am going to fly one of those.' Six years later she walked out of CCM with the Hockey Colours, three academic prizes, and a confirmed place at the PAF Academy Asghar Khan.",
      "She earned her wings in 2014, became one of the first women in the Pakistan Air Force to fly the F-16, and led the historic four-ship women's formation at the 2023 Pakistan Day parade. She has logged over 1,900 hours on type and is currently a Qualified Flying Instructor at the Combat Commanders' School.",
      "Fatima visits the college's Annual Sports Day every year — usually unannounced, always in flight overalls — to hand the cross-country trophy to the winning girl. 'There were no women fighter pilots when I was your age,' she tells them. 'There are now. Whatever does not exist yet — that is your job.'",
    ],
    achievements: [
      "First woman to fly solo on F-16 Block 52 from Sargodha Base",
      "Lead pilot, all-women F-16 formation, Pakistan Day 2023",
      "Best Pilot Trophy, Initial Fighter Conversion Course",
      "Qualified Flying Instructor, Combat Commanders' School",
    ],
  },
  {
    id: "dr-hamza",
    name: "Dr. Hamza Sheikh, PhD",
    batch: "Class of 2003",
    category: "academia",
    categoryLabel: "Academia · Research",
    role: "Associate Professor of Theoretical Physics",
    organization: "Stanford University",
    location: "Palo Alto, California",
    quote:
      "Quantum field theory is hard. Surviving the Murree winter in a draughty dormitory with a leaky water tank was harder. I have always preferred the easier of the two.",
    accent: "from-violet-600 to-purple-900",
    story: [
      "Hamza was the boy other boys borrowed homework from — and the one who would patiently re-derive every step on the whiteboard at prep. He represented Pakistan at the International Physics Olympiad in 2003 (Bronze, Taipei) while still in his last term at CCM.",
      "After a BSc from LUMS and a Marshall Scholarship to Cambridge, he completed his PhD in Theoretical Physics at MIT, where his thesis on entanglement entropy in conformal field theories won the Buchsbaum Award. He has since published over sixty papers in Physical Review Letters and Nature Physics, and was awarded the Sloan Fellowship in 2022.",
      "He spends every June and July in Pakistan, running a free four-week 'Olympiad Bootcamp' at CCM and at three sister cadet colleges, training the next generation of mathematicians and physicists. Eleven of his bootcamp alumni have gone on to win international medals.",
    ],
    achievements: [
      "IPhO Bronze Medal, Taipei (2003)",
      "Marshall Scholar, University of Cambridge (2007)",
      "PhD in Theoretical Physics, MIT (2014)",
      "Sloan Research Fellowship (2022)",
      "Founder, CCM Olympiad Bootcamp",
    ],
  },
  {
    id: "shazia-css",
    name: "Shazia Bibi, PAS",
    batch: "Class of 2007",
    category: "civil_services",
    categoryLabel: "Civil Services",
    role: "Deputy Commissioner, Hunza",
    organization: "Pakistan Administrative Service",
    location: "Aliabad, Gilgit-Baltistan",
    quote:
      "Public service is just student leadership with longer hours and harder problems. CCM gave me the rehearsal — Pakistan gave me the stage.",
    badge: "Topper, CSS 2014",
    accent: "from-amber-600 to-orange-900",
    story: [
      "Shazia was the first girl from her village in Lower Dir to attend a residential cadet college. She struggled with English in her first year, was tutored every evening by a Class 12 senior — and by Class 10 was herself tutoring the new girls in essay writing. She passed out as the College Senior in 2007.",
      "After topping the CSS examination in 2014, she joined the Pakistan Administrative Service. As Assistant Commissioner Chitral she managed flood relief for over 40,000 displaced households in 2022. As Deputy Commissioner Hunza she has led district-wide initiatives on girls' enrolment in primary schools — taking it from 47% to 81% in three years.",
      "She funds the 'Lower Dir Daughters' fellowship — paying for ten girls each year to sit the CCM entry test and covering their tuition for the first two terms. 'I was given a ladder,' she says. 'It is unforgivable not to send the ladder back down.'",
    ],
    achievements: [
      "1st position, Combined Competitive Exam (CSS) 2014",
      "BSc Politics & Economics, LUMS (2011)",
      "Master in Public Administration, Harvard Kennedy School (2020)",
      "Flood Relief Coordinator, Chitral District (2022)",
      "Founder, Lower Dir Daughters Fellowship",
    ],
  },
  {
    id: "dr-junaid",
    name: "Dr. Junaid Iftikhar",
    batch: "Class of 2000",
    category: "medical",
    categoryLabel: "Medicine",
    role: "Chief of Neurosurgery",
    organization: "Shaukat Khanum Memorial Cancer Hospital",
    location: "Lahore",
    quote:
      "Every brain on my operating table belongs to someone's father, daughter, teacher. You do not earn the right to open it twice — so you make sure you do it well the first time.",
    accent: "from-teal-600 to-emerald-900",
    story: [
      "Junaid was a quiet, methodical boy who never finished in the top three of his class but never fell below the top ten either. He chaired the Hiking Society in his final year and once led a group of twenty cadets to Miranjani Peak in a single dawn-to-dusk push. 'That,' he likes to say, 'is when I learned how long six hours of concentration actually feels.'",
      "He completed his MBBS from Khyber Medical College, FCPS Neurosurgery from Lahore General Hospital and a fellowship in neuro-oncology from Massachusetts General Hospital. He returned to Pakistan in 2014 — turning down a faculty position at Harvard — to build the brain-tumour programme at Shaukat Khanum.",
      "Under his leadership the programme has performed over 4,000 cancer resections, ninety-three percent of them free of cost. He still hikes. Every Saturday at 6 am. Usually alone.",
    ],
    achievements: [
      "FCPS Neurosurgery, Lahore General Hospital (2011)",
      "Neuro-oncology fellowship, MGH Harvard (2013)",
      "Chief of Neurosurgery, SKMCH&RC since 2018",
      "Over 4,000 brain-tumour surgeries performed in Pakistan",
      "TWAS Young Scientist Award (2019)",
    ],
  },
  {
    id: "captain-saad",
    name: "Captain Saad Mehmood, PN",
    batch: "Class of 2002",
    category: "armed_forces",
    categoryLabel: "Pakistan Navy",
    role: "Commanding Officer, PNS Tariq",
    organization: "Pakistan Navy",
    location: "Karachi",
    quote:
      "I joined the Navy because in Murree we used to look at the clouds from above. I wanted to spend the rest of my life looking at the horizon from sea level.",
    accent: "from-blue-700 to-slate-900",
    story: [
      "Saad was the captain of the college swimming team in 2002 — the year CCM won the All-Pakistan Cadet Colleges' Aquatic Championship for the first time. He chose the Navy over the Army because, he said in his joining-day letter, 'mountains are where I grew up, but the sea is where I want to grow old.'",
      "Commissioned in 2006, he qualified as a Surface Warfare Officer, completed the Principal Warfare Officer course in Plymouth, and went on to command three ships of progressively larger displacement. He led the multinational anti-piracy task force CTF-151 in 2021 — the first Pakistani officer to do so for two consecutive rotations.",
      "He sends a hand-written letter to the Principal every year on the College Founders' Day. Always the same closing line: 'The boy from House Khalid still reports for duty.'",
    ],
    achievements: [
      "Sword of Honour, Pakistan Naval Academy (2006)",
      "Principal Warfare Officer, HMS Collingwood (2013)",
      "Commander, CTF-151 anti-piracy task force (2021-2022)",
      "Tamgha-i-Imtiaz (Military) — 2022",
    ],
  },
];

const CATEGORIES: { value: Category; label: string; Icon: React.ComponentType<{ className?: string }> }[] = [
  { value: "all", label: "All Stories", Icon: Sparkles },
  { value: "armed_forces", label: "Armed Forces", Icon: Shield },
  { value: "medical", label: "Medicine", Icon: Stethoscope },
  { value: "engineering", label: "Engineering & Tech", Icon: Wrench },
  { value: "civil_services", label: "Civil Services", Icon: Landmark },
  { value: "academia", label: "Academia & Research", Icon: GraduationCap },
];

type AlumnusCategory = Exclude<Category, "all">;

// Categories carry their own display label + avatar gradient so the CMS only has
// to store the machine value; the visual treatment is derived here.
const CATEGORY_LABELS: Record<AlumnusCategory, string> = {
  armed_forces: "Armed Forces",
  medical: "Medicine",
  engineering: "Engineering · Tech",
  civil_services: "Civil Services",
  academia: "Academia · Research",
};

const CATEGORY_ACCENTS: Record<AlumnusCategory, string> = {
  armed_forces: "from-emerald-600 to-emerald-900",
  medical: "from-rose-600 to-rose-900",
  engineering: "from-sky-600 to-indigo-900",
  civil_services: "from-amber-600 to-orange-900",
  academia: "from-violet-600 to-purple-900",
};

const VALID_CATEGORIES: AlumnusCategory[] = [
  "armed_forces", "medical", "engineering", "civil_services", "academia",
];

function normalizeCategory(raw: unknown): AlumnusCategory {
  return VALID_CATEGORIES.includes(raw as AlumnusCategory) ? (raw as AlumnusCategory) : "academia";
}

// Map a CMS row (story/achievements stored as plain text) into the rich shape the
// page renders. Stories split on blank lines, achievements on newlines.
function mapAlumnusRow(r: any, idx: number): Alumnus {
  const category = normalizeCategory(r.category);
  const story = String(r.story ?? "")
    .split(/\n\s*\n/)
    .map((p: string) => p.trim())
    .filter(Boolean);
  const achievements = String(r.achievements ?? "")
    .split(/\n/)
    .map((a: string) => a.trim())
    .filter(Boolean);
  return {
    id: String(r.id ?? `alumnus-${idx}`),
    name: r.name ?? "",
    batch: r.batch ?? "",
    category,
    categoryLabel: CATEGORY_LABELS[category],
    role: r.role ?? "",
    organization: r.organization ?? "",
    location: r.location ?? "",
    quote: r.quote ?? "",
    story,
    achievements,
    badge: r.badge || undefined,
    accent: CATEGORY_ACCENTS[category],
    featured: !!r.featured,
  };
}


const fadeUp = {
  hidden: { opacity: 0, y: 32 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: "spring" as const, stiffness: 72, damping: 18 },
  },
};

const slideLeft = {
  hidden: { opacity: 0, x: -56 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { type: "spring" as const, stiffness: 72, damping: 18 },
  },
};

const slideRight = {
  hidden: { opacity: 0, x: 56 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { type: "spring" as const, stiffness: 72, damping: 18 },
  },
};

function initials(name: string): string {
  const parts = name
    .replace(/Dr\.|Brig\.|Engr\.|Capt\.|Captain|Sqn Ldr|PAS|PN|FRCS|PhD|, ?SI\(M\)/gi, "")
    .trim()
    .split(/\s+/);
  if (parts.length === 0) return "?";
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? "" : "";
  return (first + last).toUpperCase() || "?";
}

export default function Alumni() {
  const blocks = usePageBlocks("alumni");
  const settings = useSiteSettings();
  const baseUrl = useSiteBaseUrl();
  const alumniStats = [
    { value: parseInt(settings.alumni_stat_graduates_total) || 1700, suffix: "+", label: "Alumni worldwide",        Icon: Users },
    { value: parseInt(settings.alumni_stat_armed_forces) || 240,     suffix: "+", label: "In the Armed Forces",     Icon: Shield },
    { value: parseInt(settings.alumni_stat_doctors) || 180,          suffix: "+", label: "Doctors & Surgeons",       Icon: Stethoscope },
    { value: parseInt(settings.alumni_stat_engineers) || 95,         suffix: "+", label: "Engineers & Researchers",  Icon: Wrench },
    { value: parseInt(settings.alumni_stat_civil_services) || 35,    suffix: "+", label: "Civil Service Officers",   Icon: Landmark },
    { value: parseInt(settings.alumni_stat_international) || 22,     suffix: "",  label: "Countries represented",    Icon: PlaneTakeoff },
  ];
  const [active, setActive] = useState<Category>("all");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [alumni, setAlumni] = useState<Alumnus[]>(FALLBACK_ALUMNI);

  useEffect(() => {
    fetch(withTenant("/api/website/alumni"))
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) setAlumni(data.map(mapAlumnusRow));
      })
      .catch(() => {});
  }, []);

  const filtered = useMemo(
    () => (active === "all" ? alumni : alumni.filter((a) => a.category === active)),
    [active, alumni],
  );

  const featured = filtered.find((a) => a.featured) ?? filtered[0];
  const rest = filtered.filter((a) => a.id !== featured?.id);

  function toggle(id: string) {
    setExpanded((m) => ({ ...m, [id]: !m[id] }));
  }

  return (
    <>
      <Helmet>
        <title>Alumni Success Stories | Cadet College Murree</title>
        <meta
          name="description"
          content="Long-form success stories of Cadet College Murree alumni — fighter pilots, brain surgeons, civil servants, researchers and engineers shaping Pakistan and the world."
        />
        <link rel="canonical" href={`${baseUrl}/alumni`} />
        <meta property="og:title" content="Alumni Success Stories | Cadet College Murree" />
        <meta property="og:description" content="From PMA's Sword of Honour to Stanford physics, CCM alumni are leading across Pakistan and the world." />
        <meta property="og:type" content="website" />
      </Helmet>

      <PageHero title={<EditableText page="alumni" blockKey="hero_title" value={blocks.hero_title || "Alumni Success Stories"} />} breadcrumb="Alumni" />

      {/* Hero pull-quote */}
      <section className="px-4 max-w-5xl mx-auto -mt-2 pt-10 md:pt-14">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center"
        >
          <Badge className="bg-accent/15 text-accent border border-accent/30 font-bold uppercase tracking-widest text-[10px] px-3 py-1">
            <EditableText as="span" page="alumni" blockKey="alumni_intro_badge" value={blocks.alumni_intro_badge || "Proud To Be HILLIANS"} />
          </Badge>
          <h2 className="mt-4 text-3xl md:text-5xl font-bold text-primary leading-tight">
            <EditableText as="span" page="alumni" blockKey="alumni_intro_heading" value={blocks.alumni_intro_heading || "What they built on this hill — and where they took it."} />
          </h2>
          <p className="mt-4 text-foreground/75 text-lg max-w-3xl mx-auto leading-relaxed">
            <EditableText as="span" multiline page="alumni" blockKey="alumni_intro_body" value={blocks.alumni_intro_body || "Twenty-two years, two thousand cadets, one alma mater. These are the long-form stories of a few of them — the brigadiers, the surgeons, the pilots, the physicists — and the boys and girls they once were on a foggy Murree morning."} />
          </p>
        </motion.div>
      </section>

      {/* Stats strip */}
      <section className="px-4 max-w-7xl mx-auto mt-12">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 md:gap-4">
          {alumniStats.map((s, i) => (
            <CounterCard key={s.label} {...s} delay={0.05 * i} />
          ))}
        </div>
      </section>

      {/* Category filter */}
      <section className="px-4 max-w-7xl mx-auto mt-14" data-testid="alumni-filter">
        <LayoutGroup id="alumni-filter">
          <div className="flex flex-wrap gap-2 justify-center">
            {CATEGORIES.map((c, idx) => {
              const isActive = active === c.value;
              const Icon = c.Icon;
              const count =
                c.value === "all" ? alumni.length : alumni.filter((a) => a.category === c.value).length;
              return (
                <motion.button
                  key={c.value}
                  type="button"
                  onClick={() => setActive(c.value)}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.06, type: "spring", stiffness: 90, damping: 16 }}
                  whileHover={{ y: -2 }}
                  whileTap={{ scale: 0.96 }}
                  className={
                    "relative inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-semibold transition-colors border overflow-hidden " +
                    (isActive
                      ? "text-white border-primary shadow-md shadow-primary/20"
                      : "bg-card text-foreground/75 border-border hover:border-primary/40 hover:text-primary")
                  }
                  data-testid={`filter-${c.value}`}
                >
                  {isActive && (
                    <motion.span
                      layoutId="alumni-filter-bg"
                      className="absolute inset-0 bg-primary rounded-full"
                      transition={{ type: "spring", stiffness: 380, damping: 40 }}
                    />
                  )}
                  <span className="relative z-10 flex items-center gap-2">
                    <Icon className="w-4 h-4" />
                    {c.label}
                    <span className={"text-[10px] font-bold px-1.5 py-0.5 rounded " + (isActive ? "bg-white/20" : "bg-muted text-foreground/55")}>
                      {count}
                    </span>
                  </span>
                </motion.button>
              );
            })}
          </div>
        </LayoutGroup>
      </section>

      {/* Featured story */}
      {featured && (
        <section className="px-4 max-w-6xl mx-auto mt-12" data-testid="alumni-featured">
          <FeaturedCard
            key={featured.id}
            alumnus={featured}
            expanded={!!expanded[featured.id]}
            onToggle={() => toggle(featured.id)}
          />
        </section>
      )}

      {/* Grid of remaining stories */}
      <section className="px-4 max-w-7xl mx-auto mt-12 mb-20" data-testid="alumni-grid">
        <AnimatePresence mode="popLayout">
          <motion.div
            key={active}
            layout
            initial="hidden"
            animate="visible"
            variants={{ visible: { transition: { staggerChildren: 0.06 } } }}
            className="grid md:grid-cols-2 gap-6"
          >
            {rest.map((a, idx) => (
              <ProfileCard
                key={a.id}
                alumnus={a}
                index={idx}
                expanded={!!expanded[a.id]}
                onToggle={() => toggle(a.id)}
              />
            ))}
          </motion.div>
        </AnimatePresence>

        {filtered.length === 0 && (
          <div className="text-center py-20 text-foreground/60">
            <Microscope className="w-12 h-12 mx-auto mb-3 opacity-40" />
            <p>No stories in this category yet — check back soon.</p>
          </div>
        )}
      </section>

      {/* CTA — submit your story */}
      <section className="px-4 max-w-6xl mx-auto mb-20">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary via-[#053d15] to-[#021a07] text-white p-8 md:p-14 shadow-xl">
          <div className="absolute -top-20 -right-20 w-72 h-72 rounded-full bg-accent/25 blur-3xl pointer-events-none" />
          <div className="absolute -bottom-24 -left-24 w-80 h-80 rounded-full bg-secondary/15 blur-3xl pointer-events-none" />
          <div className="relative grid md:grid-cols-3 gap-8 items-center">
            <div className="md:col-span-2">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur text-accent text-xs font-bold uppercase tracking-widest mb-4">
                <Award className="w-3.5 h-3.5" /> Are you a Hillian?
              </div>
              <h3 className="text-2xl md:text-4xl font-bold leading-tight">
                Your chapter is missing from this book.
              </h3>
              <p className="mt-3 text-white/85 max-w-2xl leading-relaxed">
                If you walked these corridors — whether you passed out last year or in 2002 — we want your story on this
                page. A photograph, a few paragraphs, the version of yourself you wish a Class 7 cadet could read tonight.
              </p>
            </div>
            <div className="flex flex-col gap-3">
              <Button
                asChild
                size="lg"
                className="bg-accent hover:bg-accent/90 text-accent-foreground font-semibold h-12 gap-2"
                data-testid="alumni-submit-cta"
              >
                <Link href="/contact">
                  Share your story <ArrowRight className="w-4 h-4" />
                </Link>
              </Button>
              <Button
                asChild
                variant="outline"
                size="lg"
                className="border-white/30 text-white hover:bg-white/10 hover:text-white font-semibold h-12 gap-2 bg-transparent"
              >
                <Link href="/about">
                  <BookOpen className="w-4 h-4" /> About the college
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

// ─────────────────────── components ───────────────────────

function CounterCard({
  value,
  suffix,
  label,
  Icon,
  delay,
}: {
  value: number;
  suffix: string;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  delay: number;
}) {
  const display = useCountUp(value);
  return (
    <motion.div
      initial={{ opacity: 0, y: 24, scale: 0.9 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true, margin: "-15%" }}
      transition={{ type: "spring", stiffness: 90, damping: 16, delay }}
      whileHover={{ y: -4, boxShadow: "0 12px 36px -6px rgba(6,74,26,0.18)" }}
      className="relative bg-card border border-border rounded-2xl p-4 md:p-5 text-center overflow-hidden group cursor-default"
    >
      {/* shimmer sweep on hover */}
      <motion.div
        className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/30 to-transparent pointer-events-none"
        animate={{}}
        whileHover={{ translateX: "100%", transition: { duration: 0.55, ease: "easeInOut" } }}
      />
      <div className="inline-flex w-10 h-10 rounded-xl bg-primary/10 text-primary items-center justify-center mb-2 group-hover:bg-primary group-hover:text-primary-foreground transition-colors duration-300">
        <Icon className="w-5 h-5" />
      </div>
      <div className="text-2xl md:text-3xl font-bold text-primary tabular-nums">
        {display}{suffix}
      </div>
      <div className="text-[11px] md:text-xs uppercase tracking-wider text-foreground/65 font-semibold mt-1">
        {label}
      </div>
    </motion.div>
  );
}

function useCountUp(target: number, duration = 1500): number {
  const [v, setV] = useState(0);
  const startedRef = useRef(false);
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    const start = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setV(Math.round(eased * target));
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return v;
}

function CategoryChip({ alumnus }: { alumnus: Alumnus }) {
  return (
    <div className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-widest font-bold text-accent">
      <Star className="w-3 h-3" /> {alumnus.categoryLabel}
    </div>
  );
}

function Avatar({ alumnus, size = "md" }: { alumnus: Alumnus; size?: "md" | "lg" }) {
  const dims = size === "lg" ? "w-32 h-32 md:w-44 md:h-44 text-4xl md:text-5xl" : "w-20 h-20 text-2xl";
  return (
    <div
      className={
        `relative ${dims} rounded-3xl bg-gradient-to-br ${alumnus.accent} text-white font-extrabold flex items-center justify-center shadow-xl ring-4 ring-white/60 shrink-0 select-none`
      }
      aria-hidden="true"
    >
      <span className="drop-shadow">{initials(alumnus.name)}</span>
      <span className="absolute -bottom-2 -right-2 w-8 h-8 rounded-2xl bg-white border-2 border-white shadow-md flex items-center justify-center">
        <CategoryIcon category={alumnus.category} />
      </span>
    </div>
  );
}

function CategoryIcon({ category }: { category: Alumnus["category"] }) {
  switch (category) {
    case "armed_forces":
      return <Shield className="w-4 h-4 text-emerald-700" />;
    case "medical":
      return <Stethoscope className="w-4 h-4 text-rose-600" />;
    case "engineering":
      return <Wrench className="w-4 h-4 text-sky-600" />;
    case "civil_services":
      return <Landmark className="w-4 h-4 text-amber-600" />;
    case "academia":
      return <GraduationCap className="w-4 h-4 text-violet-600" />;
  }
}

function FeaturedCard({
  alumnus,
  expanded,
  onToggle,
}: {
  alumnus: Alumnus;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { ref, rotateX, rotateY, scale, onMouseMove, onMouseLeave } = use3DTilt(5);
  const visibleStory = expanded ? alumnus.story : alumnus.story.slice(0, 2);
  return (
    <motion.article
      ref={ref}
      initial={{ opacity: 0, y: 32, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 72, damping: 18 }}
      style={{ rotateX, rotateY, scale, transformStyle: "preserve-3d" as const }}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      className="relative overflow-hidden rounded-3xl bg-card border border-border shadow-lg"
      data-testid={`alumni-card-${alumnus.id}`}
    >
      <div className={`absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r ${alumnus.accent}`} />
      <div className="grid lg:grid-cols-5 gap-6 lg:gap-10 p-6 md:p-10">
        {/* Left: avatar + meta */}
        <div className="lg:col-span-2">
          <div className="flex items-start gap-5">
            <Avatar alumnus={alumnus} size="lg" />
            <div className="min-w-0 pt-2">
              <CategoryChip alumnus={alumnus} />
              <h3 className="text-2xl md:text-3xl font-bold text-primary mt-1 leading-tight">{alumnus.name}</h3>
              <p className="text-foreground/80 font-semibold mt-1">{alumnus.role}</p>
              <p className="text-foreground/65 text-sm">{alumnus.organization}</p>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 text-xs text-foreground/65">
                <span className="inline-flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" /> {alumnus.batch}</span>
                <span className="inline-flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" /> {alumnus.location}</span>
              </div>
              {alumnus.badge && (
                <Badge className="mt-3 bg-amber-100 text-amber-900 border border-amber-200 font-semibold">
                  <Trophy className="w-3 h-3 mr-1" /> {alumnus.badge}
                </Badge>
              )}
            </div>
          </div>

          {/* Quote */}
          <blockquote className="relative mt-8 p-5 bg-primary/5 border-l-4 border-accent rounded-r-xl">
            <Quote className="absolute -top-3 -left-3 w-6 h-6 text-accent bg-card rounded-full p-1 border border-accent/30" />
            <p className="italic text-foreground/85 leading-relaxed">"{alumnus.quote}"</p>
          </blockquote>

          {/* Achievements */}
          <div className="mt-6">
            <h4 className="text-xs uppercase tracking-widest font-bold text-foreground/55 mb-3">Highlights</h4>
            <ul className="space-y-2">
              {alumnus.achievements.map((ach) => (
                <li key={ach} className="flex items-start gap-2 text-sm text-foreground/80">
                  <Award className="w-4 h-4 text-accent mt-0.5 flex-shrink-0" />
                  <span>{ach}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Right: long-form story */}
        <div className="lg:col-span-3">
          <div className="prose prose-sm md:prose-base max-w-none">
            {visibleStory.map((para, i) => (
              <p
                key={i}
                className={
                  "text-foreground/85 leading-relaxed " +
                  (i === 0 ? "text-base md:text-lg first-letter:text-4xl first-letter:font-bold first-letter:text-primary first-letter:mr-1 first-letter:float-left first-letter:leading-none" : "")
                }
              >
                {para}
              </p>
            ))}
          </div>
          {alumnus.story.length > 2 && (
            <Button
              type="button"
              variant="ghost"
              onClick={onToggle}
              className="mt-4 text-primary hover:text-accent hover:bg-primary/5 gap-1.5 font-semibold"
              data-testid={`toggle-${alumnus.id}`}
            >
              {expanded ? (
                <>
                  Show less <ChevronUp className="w-4 h-4" />
                </>
              ) : (
                <>
                  Read full story <ChevronDown className="w-4 h-4" />
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </motion.article>
  );
}

function ProfileCard({
  alumnus,
  expanded,
  onToggle,
  index = 0,
}: {
  alumnus: Alumnus;
  expanded: boolean;
  onToggle: () => void;
  index?: number;
}) {
  const { ref, rotateX, rotateY, scale, onMouseMove, onMouseLeave } = use3DTilt(6);
  const visibleStory = expanded ? alumnus.story : alumnus.story.slice(0, 1);
  const slideVariant = index % 2 === 0 ? slideLeft : slideRight;
  return (
    <motion.article
      ref={ref}
      layout
      variants={slideVariant}
      style={{ rotateX, rotateY, scale, transformStyle: "preserve-3d" as const }}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      className="group relative overflow-hidden rounded-3xl bg-card border border-border hover:border-primary/30 hover:shadow-xl transition-colors duration-300 cursor-default"
      data-testid={`alumni-card-${alumnus.id}`}
    >
      <div className={`h-1 w-full bg-gradient-to-r ${alumnus.accent}`} />
      <div className="p-6 md:p-7">
        <div className="flex items-start gap-4">
          <Avatar alumnus={alumnus} />
          <div className="min-w-0 flex-1">
            <CategoryChip alumnus={alumnus} />
            <h3 className="text-lg md:text-xl font-bold text-primary mt-0.5 leading-tight">{alumnus.name}</h3>
            <p className="text-sm font-semibold text-foreground/85 mt-0.5">{alumnus.role}</p>
            <p className="text-xs text-foreground/65">{alumnus.organization}</p>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-[11px] text-foreground/60">
              <span className="inline-flex items-center gap-1"><Calendar className="w-3 h-3" /> {alumnus.batch}</span>
              <span className="inline-flex items-center gap-1"><MapPin className="w-3 h-3" /> {alumnus.location}</span>
            </div>
            {alumnus.badge && (
              <Badge className="mt-2 bg-amber-100 text-amber-900 border border-amber-200 font-semibold text-[10px]">
                <Trophy className="w-3 h-3 mr-1" /> {alumnus.badge}
              </Badge>
            )}
          </div>
        </div>

        <blockquote className="relative mt-5 p-4 bg-muted/40 border-l-4 border-accent rounded-r-xl">
          <Quote className="absolute -top-2.5 -left-2.5 w-5 h-5 text-accent bg-card rounded-full p-0.5 border border-accent/30" />
          <p className="italic text-sm text-foreground/80 leading-relaxed">"{alumnus.quote}"</p>
        </blockquote>

        <div className="mt-5 space-y-3">
          {visibleStory.map((p, i) => (
            <p key={i} className="text-sm text-foreground/80 leading-relaxed">{p}</p>
          ))}
        </div>

        {expanded && (
          <div className="mt-5">
            <h4 className="text-[10px] uppercase tracking-widest font-bold text-foreground/55 mb-2">Highlights</h4>
            <ul className="space-y-1.5">
              {alumnus.achievements.map((ach) => (
                <li key={ach} className="flex items-start gap-2 text-sm text-foreground/80">
                  <Award className="w-3.5 h-3.5 text-accent mt-0.5 flex-shrink-0" />
                  <span>{ach}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <Button
          type="button"
          variant="ghost"
          onClick={onToggle}
          className="mt-4 text-primary hover:text-accent hover:bg-primary/5 gap-1.5 font-semibold text-sm h-auto py-2"
          data-testid={`toggle-${alumnus.id}`}
        >
          {expanded ? (
            <>
              Show less <ChevronUp className="w-4 h-4" />
            </>
          ) : (
            <>
              Read full story <ChevronDown className="w-4 h-4" />
            </>
          )}
        </Button>
      </div>
    </motion.article>
  );
}
