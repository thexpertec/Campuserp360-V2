import { useEffect, useState, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import { Helmet } from "react-helmet-async";
import { AnimatePresence, motion } from "framer-motion";
import type { PortalUser, SectionKey } from "./data";
import { portalMe, getToken, setToken, clearToken, type PortalLoginResponse } from "./api";
import { useToast } from "@/hooks/use-toast";
import Sidebar from "./components/Sidebar";
import MobileBottomNav from "./components/MobileBottomNav";
import MobilePortalHeader from "./components/MobilePortalHeader";
import LoginPage from "./sections/LoginPage";
import DashboardSection from "./sections/DashboardSection";
import StatusSection from "./sections/StatusSection";
import DocumentsSection from "./sections/DocumentsSection";
import ChallanSection from "./sections/ChallanSection";
import PaymentSection from "./sections/PaymentSection";
import AdmitCardSection from "./sections/AdmitCardSection";
import ResultSection from "./sections/ResultSection";
import InterviewSection from "./sections/InterviewSection";
import OfferLetterSection from "./sections/OfferLetterSection";
import AdmissionFeeSection from "./sections/AdmissionFeeSection";
import JoiningSection from "./sections/JoiningSection";
import ReapplicationSection from "./sections/ReapplicationSection";
import SettingsSection from "./sections/SettingsSection";

function mapApiUser(apiUser: PortalLoginResponse["user"]): PortalUser {
  return {
    ...apiUser,
    status: apiUser.status as PortalUser["status"],
  } as PortalUser;
}

const VALID_SECTIONS: SectionKey[] = [
  "dashboard", "status", "documents", "challan", "payment",
  "admit", "result", "interview", "offer", "admission_fee",
  "joining", "reapply", "settings",
];

export default function Portal() {
  const { section } = useParams<{ section?: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [user, setUser] = useState<PortalUser | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [uploadedDocs, setUploadedDocs] = useState<Record<string, string>>({});

  // Derive active section from URL; unknown sections fall back to dashboard
  const active: SectionKey = VALID_SECTIONS.includes(section as SectionKey)
    ? (section as SectionKey)
    : "dashboard";

  function handleSelect(key: SectionKey) {
    navigate(`/portal/${key}`);
  }

  const refreshUser = useCallback(async () => {
    try {
      const apiUser = await portalMe();
      setUser(mapApiUser(apiUser));
    } catch {
      clearToken();
      setUser(null);
    }
  }, []);

  // Hydrate: if we have a stored token try to load the user
  useEffect(() => {
    const token = getToken();
    if (token) {
      portalMe()
        .then((apiUser) => setUser(mapApiUser(apiUser)))
        .catch(() => clearToken())
        .finally(() => setHydrated(true));
    } else {
      setHydrated(true);
    }
  }, []);

  // Handle the redirect back from a payment gateway (?payment=success|failed)
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const payment = sp.get("payment");
    if (!payment) return;
    const fee = sp.get("fee");
    window.history.replaceState({}, "", window.location.pathname);
    if (payment === "success") {
      toast({
        title: "✅ Payment successful",
        description: "Your fee payment has been confirmed.",
      });
      void refreshUser();
    } else {
      toast({
        title: "Payment not completed",
        description: "Your payment wasn't completed. You can try again or pay at the bank.",
        variant: "destructive",
      });
    }
    if (fee === "admission") navigate("/portal/admission_fee");
    else if (fee === "application") navigate("/portal/payment");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleLogin(loginResponse: PortalLoginResponse) {
    setToken(loginResponse.token);
    setUser(mapApiUser(loginResponse.user));
    navigate("/portal/dashboard");
  }

  function handleLogout() {
    clearToken();
    setUser(null);
    navigate("/portal");
    setUploadedDocs({});
  }

  if (!hydrated) return null;

  if (!user) {
    return (
      <>
        <Helmet>
          <title>Candidate Portal — Sign In | Cadet College Murree</title>
          <meta name="description" content="Sign in to the CCM Candidate Portal to track your application, view results, and download admission documents." />
        </Helmet>
        <LoginPage onLogin={handleLogin} />
      </>
    );
  }

  return (
    <>
      <Helmet>
        <title>Candidate Portal | Cadet College Murree</title>
        <meta name="description" content="Cadet College Murree candidate portal — application status, documents, fee challan, admit card, results, and offer letter." />
      </Helmet>

      <div className="bg-[#faf7ee] min-h-[calc(100vh-200px)] py-4 lg:py-8 px-3 lg:px-4 pb-24 lg:pb-8">
        <div className="max-w-7xl mx-auto flex flex-col lg:flex-row gap-6">
          <Sidebar user={user} active={active} onSelect={handleSelect} onLogout={handleLogout} />

          <main className="flex-1 min-w-0">
            <MobilePortalHeader user={user} />
            <div className="bg-card border border-border rounded-2xl p-4 md:p-8 shadow-sm">
              <AnimatePresence mode="wait">
                <motion.div key={active}>
                  {active === "dashboard"  && <DashboardSection user={user} onNavigate={handleSelect} />}
                  {active === "status"     && <StatusSection user={user} />}
                  {active === "documents"  && <DocumentsSection user={user} uploaded={uploadedDocs} setUploaded={setUploadedDocs} onRefresh={refreshUser} />}
                  {active === "challan"    && (user.application_fee_enabled !== false ? <ChallanSection user={user} /> : <DashboardSection user={user} onNavigate={handleSelect} />)}
                  {active === "payment"    && (user.application_fee_enabled !== false ? <PaymentSection user={user} onRefresh={refreshUser} /> : <DashboardSection user={user} onNavigate={handleSelect} />)}
                  {active === "admit"      && <AdmitCardSection user={user} />}
                  {active === "result"     && <ResultSection user={user} />}
                  {active === "interview"  && <InterviewSection user={user} />}
                  {active === "offer"         && <OfferLetterSection user={user} onRefresh={refreshUser} />}
                  {active === "admission_fee" && <AdmissionFeeSection user={user} onRefresh={refreshUser} />}
                  {active === "joining"       && <JoiningSection user={user} />}
                  {active === "reapply"    && <ReapplicationSection user={user} onNavigate={handleSelect} />}
                  {active === "settings"   && <SettingsSection user={user} onPasswordChange={() => void refreshUser()} />}
                </motion.div>
              </AnimatePresence>
            </div>
          </main>
        </div>
      </div>

      <MobileBottomNav user={user} active={active} onSelect={handleSelect} onLogout={handleLogout} />
    </>
  );
}
