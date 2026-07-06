import { Helmet } from "react-helmet-async";
import { motion } from "framer-motion";
import { Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import PageHero from "@/components/PageHero";
import { useEffect, useState } from "react";
import { withTenant } from "@/lib/tenant-fetch";
import { usePageBlocks } from "@/lib/usePageBlocks";
import EditableText from "@/components/cms/EditableText";
import { Link } from "wouter";
import { useSiteBaseUrl } from "@/lib/site-settings";
import { formatCurrency } from "@/lib/locale";

interface FeeItem {
  id: string;
  className: string;
  feeType: string;
  amount: number;
  currency: string;
  notes: string | null;
}

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5 } },
};

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } },
};

function fmt(n: number, _currency?: string) {
  return formatCurrency(n);
}

export default function FeeStructure() {
  const baseUrl = useSiteBaseUrl();
  const blocks = usePageBlocks("fee-structure");
  const [items, setItems] = useState<FeeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch(withTenant("/api/website/fee-structure"))
      .then(r => r.ok ? r.json() : Promise.reject(r))
      .then(data => { setItems(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => { setError(true); setLoading(false); });
  }, []);

  const grouped = items.reduce<Record<string, FeeItem[]>>((acc, item) => {
    (acc[item.className] ??= []).push(item);
    return acc;
  }, {});

  const classes = Object.keys(grouped);

  return (
    <>
      <Helmet>
        <title>Fee Structure | Cadet College Murree</title>
        <meta name="description" content="View the official fee structure for all classes at Cadet College Murree — monthly fees, admission charges, and other dues for Classes 6-11." />
        <link rel="canonical" href={`${baseUrl}/fee-structure`} />
        <meta property="og:title" content="Fee Structure | Cadet College Murree" />
        <meta property="og:url" content={`${baseUrl}/fee-structure`} />
        <meta property="og:type" content="website" />
      </Helmet>

      <PageHero title={<EditableText page="fee-structure" blockKey="hero_title" value={blocks.hero_title || "Fee Structure"} />} breadcrumb="Fee Structure" />

      <section className="py-16 px-4 max-w-7xl mx-auto" data-testid="fee-structure-section">
        {loading && (
          <div className="flex justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary/50" />
          </div>
        )}
        {error && (
          <div className="flex flex-col items-center gap-3 py-20 text-foreground/50">
            <AlertCircle className="h-8 w-8" />
            <EditableText as="p" multiline page="fee-structure" blockKey="error_message" value={blocks.error_message || "Could not load fee structure. Please contact the college directly."} />
          </div>
        )}
        {!loading && !error && items.length === 0 && (
          <div className="text-center py-20 text-foreground/50 space-y-4">
            <EditableText as="p" multiline page="fee-structure" blockKey="empty_message" value={blocks.empty_message || "Fee structure will be published here. Please contact us for the latest fee information."} />
            <Button asChild>
              <Link href="/contact"><EditableText as="span" page="fee-structure" blockKey="empty_contact_button" value={blocks.empty_contact_button || "Contact Us"} /></Link>
            </Button>
          </div>
        )}
        {!loading && !error && items.length > 0 && (
          <motion.div initial="hidden" animate="visible" variants={stagger} className="space-y-10">
            {classes.map((cls, ci) => (
              <motion.div key={cls} variants={fadeUp} data-testid={`fee-class-${ci}`}>
                <div className="flex items-center gap-3 mb-4">
                  <Badge className="bg-primary text-primary-foreground text-sm px-3 py-1">{cls}</Badge>
                </div>
                <div className="rounded-xl border border-border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted">
                        <TableHead className="font-semibold text-primary"><EditableText as="span" page="fee-structure" blockKey="col_fee_type" value={blocks.col_fee_type || "Fee Type"} /></TableHead>
                        <TableHead className="font-semibold text-primary text-right"><EditableText as="span" page="fee-structure" blockKey="col_amount" value={blocks.col_amount || "Amount"} /></TableHead>
                        <TableHead className="font-semibold text-primary hidden sm:table-cell"><EditableText as="span" page="fee-structure" blockKey="col_notes" value={blocks.col_notes || "Notes"} /></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {grouped[cls].map((item) => (
                        <TableRow key={item.id} className="hover:bg-muted/40 transition-colors">
                          <TableCell className="font-medium">{item.feeType}</TableCell>
                          <TableCell className="text-right font-bold text-primary">{fmt(item.amount, item.currency)}</TableCell>
                          <TableCell className="hidden sm:table-cell text-foreground/60 text-sm">{item.notes ?? "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </motion.div>
            ))}

            <motion.div variants={fadeUp} className="pt-6 border-t border-border flex flex-col sm:flex-row items-center gap-4">
              <EditableText as="p" multiline page="fee-structure" blockKey="disclaimer" value={blocks.disclaimer || "Fee structure is subject to revision. Contact the college office for the most up-to-date information."} className="text-sm text-foreground/60 flex-1" />
              <div className="flex gap-3">
                <Button asChild>
                  <Link href="/contact"><EditableText as="span" page="fee-structure" blockKey="contact_button" value={blocks.contact_button || "Contact Us"} /></Link>
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </section>
    </>
  );
}
