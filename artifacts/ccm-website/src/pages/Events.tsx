import { Helmet } from "react-helmet-async";
import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import {
  Calendar, Trophy, Flag, MessageSquare, Star, FlaskConical,
  Loader2, AlertCircle,
} from "lucide-react";
import PageHero from "@/components/PageHero";
import { springFadeUp, staggerContainer, use3DTilt } from "@/lib/animations";
import { withTenant } from "@/lib/tenant-fetch";
import { usePageBlocks } from "@/lib/usePageBlocks";
import EditableText from "@/components/cms/EditableText";
import SectionColor from "@/components/cms/SectionColor";
import { useSiteBaseUrl } from "@/lib/site-settings";
import { useEffect, useState } from "react";

interface SiteEvent {
  id: string;
  title: string;
  description: string | null;
  date: string;
  category: string;
  imageUrl: string | null;
  imageAlt: string | null;
}

const categoryColors: Record<string, string> = {
  Sports: "bg-secondary text-secondary-foreground",
  "National Day": "bg-primary text-primary-foreground",
  "College Function": "bg-accent/20 text-primary",
  Academic: "bg-muted text-muted-foreground border border-border",
  "Official Visit": "bg-primary/10 text-primary",
};

const categoryIcons: Record<string, React.ElementType> = {
  Sports: Trophy,
  "National Day": Flag,
  "College Function": Calendar,
  Academic: MessageSquare,
  "Official Visit": FlaskConical,
};

const DEFAULT_IMAGE = "https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=600&auto=format&fit=crop&q=80";

const FALLBACK_EVENTS: SiteEvent[] = [
  { id: "f1", title: "Annual Sports Gala", description: "The pinnacle of inter-house athletic competition. Cadets compete in track & field, football, cricket and basketball as houses battle for the coveted Sports Trophy.", date: "Mar 2026", category: "Sports", imageUrl: "https://images.unsplash.com/photo-1526232761682-d26e03ac148e?w=900&auto=format&fit=crop&q=80", imageAlt: "Annual Sports Gala" },
  { id: "f2", title: "Independence Day Celebrations", description: "Flag hoisting, march past and patriotic performances honoring Pakistan's founding — a moving day for every Hillian.", date: "14 Aug 2025", category: "National Day", imageUrl: "/placeholder.svg", imageAlt: "Independence Day 2025" },
  { id: "f3", title: "New Cadets Joining Day", description: "The most anticipated day for new joiners as fresh cadets are welcomed into the CCM family and the journey of HILLIANS begins.", date: "Aug 2025", category: "College Function", imageUrl: "/placeholder.svg", imageAlt: "New Cadets Joining Day" },
  { id: "f4", title: "Defense Day Ceremony", description: "A solemn and proud ceremony commemorating the valor of Pakistan's armed forces. Cadets honor the martyrs in a dignified parade.", date: "6 Sep 2025", category: "National Day", imageUrl: "/placeholder.svg", imageAlt: "Defense Day Ceremony" },
  { id: "f5", title: "DG Naval Intelligence Visit", description: "The Director General Naval Intelligence visited Cadet College Murree and was briefed on academic and co-curricular programs.", date: "Aug 2025", category: "Official Visit", imageUrl: "/placeholder.svg", imageAlt: "DG Naval Intelligence Visit" },
  { id: "f6", title: "Naval Academy Commandant Visit", description: "The Commandant of Pakistan Naval Academy paid an official visit to Cadet College Murree, commending the college's discipline and standards.", date: "Aug 2025", category: "Official Visit", imageUrl: "/placeholder.svg", imageAlt: "Naval Academy Commandant Visit" },
  { id: "f7", title: "Quaid-e-Azam Day", description: "Cadet College Murree commemorates the birth anniversary of Quaid-e-Azam Muhammad Ali Jinnah with special prayers, speeches and a march past.", date: "25 Dec 2025", category: "National Day", imageUrl: "https://images.unsplash.com/photo-1509062522246-3755977927d7?w=600&auto=format&fit=crop&q=80", imageAlt: "Quaid-e-Azam Day" },
  { id: "f8", title: "Annual Prize Distribution Day", description: "An evening of recognition where top performers in academics, sports and co-curricular activities receive awards from distinguished guests.", date: "Dec 2025", category: "College Function", imageUrl: "https://images.unsplash.com/photo-1523050854058-8df90110c9f1?w=600&auto=format&fit=crop&q=80", imageAlt: "Annual Prize Distribution" },
];

function EventCard({ event, index }: { event: SiteEvent; index: number }) {
  const { ref, rotateX, rotateY, scale, onMouseMove, onMouseLeave } = use3DTilt(6);
  const Icon = categoryIcons[event.category] ?? Star;

  return (
    <motion.article
      ref={ref}
      variants={springFadeUp}
      data-testid={`event-card-${index}`}
      style={{ rotateX, rotateY, scale, transformPerspective: 900 }}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      className="bg-card border border-border rounded-2xl overflow-hidden hover:shadow-xl hover:border-primary/30 transition-shadow duration-300 flex flex-col"
    >
      <div className="relative h-48 overflow-hidden">
        <motion.img
          src={event.imageUrl ?? DEFAULT_IMAGE}
          alt={event.imageAlt ?? event.title}
          loading="lazy"
          width={400}
          height={300}
          className="w-full h-full object-cover"
          whileHover={{ scale: 1.08 }}
          transition={{ duration: 0.5 }}
        />
        <motion.div
          initial={{ opacity: 0 }}
          whileHover={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
          className="absolute inset-0 bg-gradient-to-t from-primary/70 via-primary/20 to-transparent"
        />
        <div className="absolute top-3 left-3">
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            whileInView={{ scale: 1, opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.15 + index * 0.04, type: "spring", stiffness: 260 }}
          >
            <Badge className={`text-xs ${categoryColors[event.category] ?? "bg-muted text-foreground"}`}>
              {event.category}
            </Badge>
          </motion.div>
        </div>
      </div>
      <div className="p-5 flex flex-col flex-1">
        <div className="flex items-center gap-2 mb-3">
          <motion.div
            whileHover={{ rotate: 15, scale: 1.2 }}
            transition={{ type: "spring", stiffness: 300 }}
            className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0"
          >
            <Icon className="w-4 h-4 text-primary" />
          </motion.div>
          <span className="text-xs text-foreground/85 font-medium">{event.date}</span>
        </div>
        <h2 className="font-bold text-primary text-lg mb-2 leading-tight">{event.title}</h2>
        {event.description && (
          <p className="text-foreground/75 text-sm leading-relaxed flex-1">{event.description}</p>
        )}
      </div>
    </motion.article>
  );
}

export default function Events() {
  const baseUrl = useSiteBaseUrl();
  const blocks = usePageBlocks("events");
  const [events, setEvents] = useState<SiteEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch(withTenant("/api/website/events"))
      .then(r => r.ok ? r.json() : Promise.reject(r))
      .then(data => {
        setEvents(Array.isArray(data) && data.length > 0 ? data : FALLBACK_EVENTS);
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setEvents(FALLBACK_EVENTS);
        setLoading(false);
      });
  }, []);

  return (
    <>
      <Helmet>
        <title>Events at Cadet College Murree | Sports, Ceremonies & Functions</title>
        <meta
          name="description"
          content="Discover events at Cadet College Murree — Annual Sports Gala, Independence Day, Defense Day ceremonies, prize distributions, science exhibitions, and the grand annual function."
        />
        <link rel="canonical" href={`${baseUrl}/events`} />
        <meta property="og:title" content="Events | Cadet College Murree" />
        <meta property="og:description" content="From sports galas to national day ceremonies, explore the vibrant events calendar of Cadet College Murree." />
        <meta property="og:url" content={`${baseUrl}/events`} />
        <meta property="og:type" content="website" />
      </Helmet>

      <div>
        <PageHero title={<EditableText page="events" blockKey="hero_title" value={blocks.hero_title || "Stay Tuned: Event Updates"} />} breadcrumb="Stay Tuned: Event Updates" />

        <SectionColor page="events" scope="intro" label="Intro" kind="light" className="py-12 px-4 max-w-4xl mx-auto text-center" data-testid="events-intro">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={springFadeUp}>
            <div style={{ overflow: "hidden" }}>
              <motion.p
                initial={{ y: "110%" }}
                whileInView={{ y: "0%" }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, ease: [0.76, 0, 0.24, 1] }}
                className="text-accent uppercase tracking-widest font-semibold text-sm mb-3"
              >
                <EditableText as="span" page="events" blockKey="intro_eyebrow" value={blocks.intro_eyebrow || "Stay Informed"} />
              </motion.p>
            </div>
            <div style={{ overflow: "hidden" }}>
              <motion.h2
                initial={{ y: "110%" }}
                whileInView={{ y: "0%" }}
                viewport={{ once: true }}
                transition={{ duration: 0.7, ease: [0.76, 0, 0.24, 1], delay: 0.05 }}
                className="text-2xl md:text-3xl font-bold text-primary mb-4"
              >
                <EditableText as="span" page="events" blockKey="intro_heading" value={blocks.intro_heading || "Latest Events"} />
              </motion.h2>
            </div>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.3, duration: 0.6 }}
              className="text-foreground/80 leading-relaxed"
            >
              <EditableText as="span" multiline page="events" blockKey="intro_body" value={blocks.intro_body || "Discover the pulse of Cadet College Murree through our Events Page! Engage with a lineup of dynamic activities, from spirited sports competitions to enlightening seminars, all designed to shape the leaders of tomorrow. Stay connected to the spirit of valor, excellence, and camaraderie that defines our college."} />
            </motion.p>
          </motion.div>
        </SectionColor>

        <SectionColor page="events" scope="grid" label="Events Grid" kind="light" className="pb-20 px-4 max-w-7xl mx-auto" data-testid="events-grid">
          {loading && (
            <div className="flex justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-primary/50" />
            </div>
          )}
          {error && !loading && (
            <div className="flex flex-col items-center gap-3 pb-6 text-foreground/50">
              <AlertCircle className="h-6 w-6" />
              <p className="text-sm">Could not load the latest events. Showing cached data.</p>
            </div>
          )}
          {!loading && events.length > 0 && (
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-80px" }}
              variants={staggerContainer(0.08)}
              className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
            >
              {events.map((event, i) => (
                <EventCard key={event.id} event={event} index={i} />
              ))}
            </motion.div>
          )}
        </SectionColor>

        <SectionColor page="events" scope="cta" label="Call to Action" kind="light" className="bg-muted border-t border-border py-16 px-4 text-center" data-testid="events-cta">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={springFadeUp}
            className="max-w-2xl mx-auto"
          >
            <h2 className="text-2xl font-bold text-primary mb-4"><EditableText as="span" page="events" blockKey="cta_heading" value={blocks.cta_heading || "Stay Connected to the Spirit of CCM"} /></h2>
            <p className="text-foreground/80 mb-6">
              <EditableText as="span" multiline page="events" blockKey="cta_body" value={blocks.cta_body || "Connect with our admissions team to learn more about upcoming events and how your cadet can be a part of the HILLIAN legacy."} />
            </p>
            <motion.a
              href="/contact"
              data-testid="link-contact-from-events"
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.97 }}
              transition={{ type: "spring", stiffness: 300 }}
              className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-6 py-3 rounded-lg font-semibold hover:bg-primary/90 transition-colors"
            >
              Contact Admissions
            </motion.a>
          </motion.div>
        </SectionColor>
      </div>
    </>
  );
}
