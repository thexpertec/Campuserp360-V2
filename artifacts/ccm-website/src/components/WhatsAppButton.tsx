import { useEffect, useState } from "react";
import { useLocation } from "wouter";

export default function WhatsAppButton() {
  const [ctaVisible, setCtaVisible] = useState(false);
  const [location] = useLocation();
  const onPortal = location.startsWith("/portal");

  useEffect(() => {
    const initial = document.body.dataset.ctaVisible === "true";
    setCtaVisible(initial);

    const handler = (e: Event) => {
      setCtaVisible((e as CustomEvent<boolean>).detail);
    };
    window.addEventListener("sticky-cta-visibility", handler);
    return () => window.removeEventListener("sticky-cta-visibility", handler);
  }, []);

  if (onPortal) return null;

  return (
    <a
      href="https://wa.me/923041111024"
      target="_blank"
      rel="noopener noreferrer"
      data-testid="whatsapp-float-button"
      aria-label="Chat with Cadet College Murree on WhatsApp"
      className={`fixed right-4 sm:right-6 z-50 w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all duration-300 hover:scale-110 active:scale-95 ${
        ctaVisible ? "bottom-24 sm:bottom-24" : "bottom-6"
      }`}
      style={{ backgroundColor: "#25D366" }}
    >
      <svg
        viewBox="0 0 32 32"
        fill="white"
        xmlns="http://www.w3.org/2000/svg"
        className="w-7 h-7"
        aria-hidden="true"
      >
        <path d="M16 1C7.716 1 1 7.716 1 16c0 2.628.678 5.1 1.862 7.258L1 31l7.956-1.838A14.913 14.913 0 0016 31c8.284 0 15-6.716 15-15S24.284 1 16 1zm0 27.2a12.154 12.154 0 01-6.21-1.702l-.446-.266-4.72 1.09 1.114-4.6-.29-.47A12.175 12.175 0 013.8 16C3.8 9.267 9.267 3.8 16 3.8S28.2 9.267 28.2 16 22.733 28.2 16 28.2zm6.672-9.082c-.366-.184-2.163-1.066-2.498-1.188-.334-.122-.578-.183-.82.183-.244.366-.944 1.188-1.157 1.432-.213.244-.427.275-.793.092-.366-.183-1.548-.57-2.948-1.82-1.09-.972-1.827-2.173-2.04-2.54-.213-.366-.023-.564.16-.747.164-.164.366-.427.549-.64.183-.213.244-.366.366-.61.122-.244.06-.458-.03-.64-.092-.184-.82-1.982-1.124-2.714-.296-.71-.598-.614-.82-.626-.213-.01-.458-.013-.703-.013-.244 0-.64.091-.976.457-.335.366-1.28 1.25-1.28 3.048s1.31 3.537 1.494 3.781c.183.244 2.578 3.933 6.248 5.516.874.378 1.555.603 2.087.77.877.28 1.675.24 2.306.145.703-.104 2.163-.884 2.468-1.737.305-.854.305-1.586.213-1.737-.091-.152-.335-.244-.7-.428z"/>
      </svg>
    </a>
  );
}
