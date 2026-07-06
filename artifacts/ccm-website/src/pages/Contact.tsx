import { Helmet } from "react-helmet-async";
import { motion } from "framer-motion";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { MapPin, Phone, Mail, MessageCircle, CheckCircle } from "lucide-react";
import { useState } from "react";
import { useSubmitContactMessage, useGetContactChallenge, ApiError } from "@workspace/api-client-react";
import PageHero from "@/components/PageHero";
import { springFadeUp, springFadeLeft, springFadeRight, staggerContainer } from "@/lib/animations";
import { useSiteSettings, useSiteBaseUrl } from "@/lib/site-settings";
import { usePageBlocks } from "@/lib/usePageBlocks";
import EditableText from "@/components/cms/EditableText";
import EditableSetting from "@/components/cms/EditableSetting";
import EditableImage from "@/components/cms/EditableImage";

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6 } },
};

const contactSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Please enter a valid email address"),
  phone: z.string().min(10, "Please enter a valid phone number"),
  subject: z.string().min(3, "Subject is required"),
  message: z.string().min(20, "Message must be at least 20 characters"),
});

type ContactFormValues = z.infer<typeof contactSchema>;

export default function Contact() {
  const { toast } = useToast();
  const [submitted, setSubmitted] = useState(false);
  const settings = useSiteSettings();
  const baseUrl = useSiteBaseUrl();
  const blocks = usePageBlocks("contact");

  const waUrl = `https://wa.me/${settings.contact_whatsapp}`;

  const contactInfoItems = [
    {
      Icon: MapPin,
      label: "Address",
      testId: "contact-address",
      content: (
        <p className="text-foreground/80 text-sm leading-relaxed whitespace-pre-line">
          <EditableSetting as="span" multiline settingKey="contact_address" value={settings.contact_address} />
        </p>
      ),
    },
    {
      Icon: Phone,
      label: "Phone",
      testId: "contact-phone",
      content: (
        <div>
          <a
            href={`tel:${settings.contact_uan}`}
            className="block text-sm text-foreground/80 hover:text-primary"
            data-testid="link-phone-uan"
          >
            UAN: <EditableSetting as="span" settingKey="contact_uan" value={settings.contact_uan} />
          </a>
          {settings.contact_landline && (
            <a
              href={`tel:${settings.contact_landline}`}
              className="block text-sm text-foreground/80 hover:text-primary"
              data-testid="link-phone-landline"
            >
              <EditableSetting as="span" settingKey="contact_landline" value={settings.contact_landline} />
            </a>
          )}
        </div>
      ),
    },
    {
      Icon: Mail,
      label: "Email",
      testId: "contact-email",
      content: (
        <a
          href={`mailto:${settings.contact_email}`}
          className="text-sm text-foreground/80 hover:text-primary"
          data-testid="link-email"
        >
          <EditableSetting as="span" settingKey="contact_email" value={settings.contact_email} />
        </a>
      ),
    },
  ];

  const [honeypot, setHoneypot] = useState("");
  const submitMutation = useSubmitContactMessage();
  // CAPTCHA-equivalent: fetch a signed challenge token on load and submit it
  // back. The server rejects submissions without a valid, recently-issued token.
  const { data: challenge, refetch: refetchChallenge } = useGetContactChallenge();

  const form = useForm<ContactFormValues>({
    resolver: zodResolver(contactSchema),
    defaultValues: { name: "", email: "", phone: "", subject: "", message: "" },
  });

  async function onSubmit(values: ContactFormValues) {
    try {
      await submitMutation.mutateAsync({ data: { ...values, website: honeypot, token: challenge?.token } });
      setSubmitted(true);
      toast({ title: "Message Sent", description: "Thank you for reaching out. We will get back to you shortly." });
      form.reset();
      setHoneypot("");
      // Tokens are single-window; fetch a fresh one for any subsequent message.
      void refetchChallenge();
      setTimeout(() => setSubmitted(false), 6000);
    } catch (err) {
      const description =
        err instanceof ApiError && err.status === 429
          ? "You've sent several messages recently. Please try again in a little while."
          : "Something went wrong sending your message. Please try again, or contact us by phone or WhatsApp.";
      toast({ variant: "destructive", title: "Message Not Sent", description });
    }
  }

  return (
    <>
      <Helmet>
        <title>Contact Us | Cadet College Murree</title>
        <meta name="description" content="Contact Cadet College Murree. Address: Main Company Baag, Burgraan Road, Murree Hills. UAN: 03041111024. Email: burdiwaheed@gmail.com. Open 9:00 AM – 5:00 PM." />
        <link rel="canonical" href={`${baseUrl}/contact`} />
        <meta property="og:title" content="Contact Us | Cadet College Murree" />
        <meta property="og:description" content="Get in touch with Cadet College Murree. Located on Burgraan Road, Murree Hills. Call, email, or WhatsApp our team." />
        <meta property="og:url" content={`${baseUrl}/contact`} />
        <meta property="og:type" content="website" />
      </Helmet>

      <div>
        <PageHero title={<EditableText page="contact" blockKey="hero_title" value={blocks.hero_title || "Contact Us"} />} breadcrumb="Contact Us" />

        {/* Top contact-info strip */}
        <section className="relative py-12 px-4 overflow-hidden" data-testid="contact-info-strip">
          <EditableImage
            settingKey="contact_strip_image"
            src={settings.contact_strip_image || null}
            alt="Cadet College Murree contact support"
            className="absolute inset-0"
            imgClassName="absolute inset-0 w-full h-full object-cover object-center opacity-10"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-background/95 via-background/80 to-background/95" />
          <div className="relative z-10 max-w-4xl mx-auto text-center">
            <motion.div initial="hidden" animate="visible" variants={springFadeUp}>
              <div style={{ overflow: "hidden" }}>
                <motion.h2
                  initial={{ y: "110%" }}
                  animate={{ y: "0%" }}
                  transition={{ duration: 0.7, ease: [0.76, 0, 0.24, 1] }}
                  className="text-2xl md:text-3xl font-bold text-primary mb-3"
                >
                  <EditableText as="span" page="contact" blockKey="intro_heading" value={blocks.intro_heading || "ANY QUESTION? CONTACT US"} />
                </motion.h2>
              </div>
              <motion.p
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3, duration: 0.6 }}
                className="text-foreground/80 max-w-2xl mx-auto"
              >
                <EditableText as="span" multiline page="contact" blockKey="intro_body" value={blocks.intro_body || "Curious about our services? Feel free to reach out to us with any questions you have. Our dedicated team is here to assist you and provide the information you need. Don't hesitate to get in touch — we're just a message away from helping you."} />
              </motion.p>
            </motion.div>
          </div>
        </section>

        {/* Main Content */}
        <section className="py-14 px-4 max-w-7xl mx-auto" data-testid="contact-main">
          <div className="grid lg:grid-cols-2 gap-12">

            {/* Left — Contact Details + WhatsApp team */}
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={springFadeLeft}
            >
              <h2 className="text-2xl font-bold text-primary mb-8"><EditableText as="span" page="contact" blockKey="get_in_touch_heading" value={blocks.get_in_touch_heading || "Get in Touch"} /></h2>

              <motion.div
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                variants={staggerContainer(0.1)}
                className="space-y-6 mb-10"
              >
                {contactInfoItems.map((item, i) => (
                  <motion.div
                    key={i}
                    variants={springFadeLeft}
                    data-testid={item.testId}
                    className="flex gap-4 items-start"
                    whileHover={{ x: 4 }}
                    transition={{ type: "spring", stiffness: 300 }}
                  >
                    <motion.div
                      whileHover={{ scale: 1.1, rotate: 5 }}
                      transition={{ type: "spring", stiffness: 300 }}
                      className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center flex-shrink-0"
                    >
                      <item.Icon className="w-5 h-5 text-primary" />
                    </motion.div>
                    <div>
                      <h3 className="font-semibold text-primary mb-1">{item.label}</h3>
                      {item.content}
                    </div>
                  </motion.div>
                ))}
              </motion.div>

              {/* WhatsApp Team */}
              <motion.div
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.3, duration: 0.6 }}
                data-testid="whatsapp-contacts"
              >
                <div className="bg-primary/5 border border-primary/20 rounded-2xl p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <MessageCircle className="w-5 h-5 text-accent" />
                    <h3 className="font-bold text-primary text-lg"><EditableText as="span" page="contact" blockKey="whatsapp_heading" value={blocks.whatsapp_heading || "Contact Us — WhatsApp"} /></h3>
                  </div>
                  <motion.a
                    href={waUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid="whatsapp-contact-0"
                    initial={{ opacity: 0, x: -20 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.4, duration: 0.4 }}
                    whileHover={{ x: 4, borderColor: "hsl(var(--accent) / 0.6)" }}
                    className="flex items-center gap-4 bg-background border border-border rounded-xl p-4 hover:shadow transition-all duration-200"
                  >
                    <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0 border-2 border-primary/20">
                      <MessageCircle className="w-6 h-6 text-green-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm text-primary">Admissions Team</div>
                      <div className="text-xs text-foreground/85">Available {settings.contact_hours}</div>
                    </div>
                    <div className="flex-shrink-0">
                      <svg viewBox="0 0 32 32" fill="#25D366" className="w-6 h-6" aria-hidden="true">
                        <path d="M16 1C7.716 1 1 7.716 1 16c0 2.628.678 5.1 1.862 7.258L1 31l7.956-1.838A14.913 14.913 0 0016 31c8.284 0 15-6.716 15-15S24.284 1 16 1zm6.672 21.918c-.366-.184-2.163-1.066-2.498-1.188-.334-.122-.578-.183-.82.183-.244.366-.944 1.188-1.157 1.432-.213.244-.427.275-.793.092-.366-.183-1.548-.57-2.948-1.82-1.09-.972-1.827-2.173-2.04-2.54-.213-.366-.023-.564.16-.747.164-.164.366-.427.549-.64.183-.213.244-.366.366-.61.122-.244.06-.458-.03-.64-.092-.184-.82-1.982-1.124-2.714-.296-.71-.598-.614-.82-.626-.213-.01-.458-.013-.703-.013-.244 0-.64.091-.976.457-.335.366-1.28 1.25-1.28 3.048s1.31 3.537 1.494 3.781c.183.244 2.578 3.933 6.248 5.516.874.378 1.555.603 2.087.77.877.28 1.675.24 2.306.145.703-.104 2.163-.884 2.468-1.737.305-.854.305-1.586.213-1.737-.091-.152-.335-.244-.7-.428z"/>
                      </svg>
                    </div>
                  </motion.a>
                  <p className="text-xs text-foreground/75 mt-3 text-center">
                    Team Cadet College Murree · {settings.contact_hours}
                  </p>
                </div>
              </motion.div>
            </motion.div>

            {/* Right — Contact Form */}
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={springFadeRight}
            >
              <div className="bg-card border border-border rounded-2xl p-8">
                <h2 className="text-2xl font-bold text-primary mb-6"><EditableText as="span" page="contact" blockKey="send_message_heading" value={blocks.send_message_heading || "Send Us a Message"} /></h2>

                {submitted ? (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.85 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ type: "spring", stiffness: 200, damping: 20 }}
                    className="text-center py-12"
                  >
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", stiffness: 260, damping: 18, delay: 0.1 }}
                    >
                      <CheckCircle className="w-14 h-14 text-accent mx-auto mb-4" />
                    </motion.div>
                    <h3 className="text-xl font-bold text-primary mb-2">Message Sent!</h3>
                    <p className="text-foreground/75 text-sm">
                      Our team will respond within 24 hours on working days.
                    </p>
                  </motion.div>
                ) : (
                  <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5" data-testid="contact-form">
                      {/* Honeypot — hidden from users, bots tend to fill it */}
                      <input
                        type="text"
                        name="website"
                        tabIndex={-1}
                        autoComplete="off"
                        aria-hidden="true"
                        value={honeypot}
                        onChange={(e) => setHoneypot(e.target.value)}
                        className="absolute left-[-9999px] h-0 w-0 opacity-0"
                      />
                      <div className="grid sm:grid-cols-2 gap-5">
                        <FormField control={form.control} name="name" render={({ field }) => (
                          <FormItem>
                            <FormLabel>Name *</FormLabel>
                            <FormControl>
                              <Input placeholder="Your full name" data-testid="input-contact-name" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />
                        <FormField control={form.control} name="email" render={({ field }) => (
                          <FormItem>
                            <FormLabel>Email *</FormLabel>
                            <FormControl>
                              <Input type="email" placeholder="your@email.com" data-testid="input-contact-email" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />
                      </div>
                      <div className="grid sm:grid-cols-2 gap-5">
                        <FormField control={form.control} name="phone" render={({ field }) => (
                          <FormItem>
                            <FormLabel>Phone *</FormLabel>
                            <FormControl>
                              <Input placeholder="03xx-xxxxxxx" data-testid="input-contact-phone" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />
                        <FormField control={form.control} name="subject" render={({ field }) => (
                          <FormItem>
                            <FormLabel>Subject *</FormLabel>
                            <FormControl>
                              <Input placeholder="e.g. Admission Inquiry" data-testid="input-contact-subject" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />
                      </div>
                      <FormField control={form.control} name="message" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Message *</FormLabel>
                          <FormControl>
                            <Textarea placeholder="How can we help you?" rows={5} data-testid="textarea-contact-message" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}>
                        <Button type="submit" size="lg" className="w-full" disabled={submitMutation.isPending} data-testid="button-submit-contact">
                          {submitMutation.isPending ? "Sending…" : "Submit Message"}
                        </Button>
                      </motion.div>
                    </form>
                  </Form>
                )}
              </div>
            </motion.div>
          </div>
        </section>

        {/* Map */}
        <section className="border-t border-border bg-muted" data-testid="contact-map">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="w-full h-56 flex items-center justify-center"
          >
            <div className="text-center">
              <motion.div
                animate={{ y: [0, -6, 0] }}
                transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
              >
                <MapPin className="w-10 h-10 text-primary mx-auto mb-2" />
              </motion.div>
              <p className="font-semibold text-primary">Cadet College Murree</p>
              <p className="text-sm text-foreground/85">{settings.contact_address}</p>
              <a
                href={settings.contact_maps_url}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="link-google-maps"
                className="mt-3 inline-block text-sm text-primary font-semibold hover:underline"
              >
                Open in Google Maps →
              </a>
            </div>
          </motion.div>
        </section>
      </div>
    </>
  );
}
