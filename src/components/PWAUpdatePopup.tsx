import { useEffect, useState } from 'react';
import { safeSessionStorage } from '../storagePolyfill';
import { Sparkles, ArrowRight, X } from 'lucide-react';

export default function PWAUpdatePopup() {
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    const handleUpdateAvailable = (event: Event) => {
      const customEvent = event as CustomEvent<ServiceWorkerRegistration>;
      const reg = customEvent.detail;
      
      console.log('⚡ [PWAUpdatePopup] Update available event received');
      setRegistration(reg);

      // Respect the user's preference to skip prompting again in the current session
      const isDismissed = safeSessionStorage.getItem('pwa_update_dismissed') === 'true';
      if (!isDismissed) {
        setIsVisible(true);
      }
    };

    window.addEventListener('pwa-update-available', handleUpdateAvailable);

    // Check on mount if a waiting service worker is already available in navigator.serviceWorker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistration().then((reg) => {
        if (reg && reg.waiting) {
          console.log('⚡ [PWAUpdatePopup] Found waiting service worker on mount');
          setRegistration(reg);
          const isDismissed = safeSessionStorage.getItem('pwa_update_dismissed') === 'true';
          if (!isDismissed) {
            setIsVisible(true);
          }
        }
      });
    }

    return () => {
      window.removeEventListener('pwa-update-available', handleUpdateAvailable);
    };
  }, []);

  const handleLater = () => {
    setIsVisible(false);
    safeSessionStorage.setItem('pwa_update_dismissed', 'true');
    console.log('⚡ [PWAUpdatePopup] User deferred update. Dismissed for current session.');
  };

  const handleUpdate = () => {
    if (!registration || !registration.waiting) {
      // Fallback reload if worker is lost
      window.location.reload();
      return;
    }

    setIsUpdating(true);
    console.log('⚡ [PWAUpdatePopup] Invoking SKIP_WAITING to activate new version');
    
    // Post SKIP_WAITING message to the waiting worker
    registration.waiting.postMessage({ type: 'SKIP_WAITING' });
  };

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-fade-in">
      <div className="relative bg-white rounded-3xl shadow-2xl max-w-sm w-full overflow-hidden border border-slate-100 flex flex-col p-6 space-y-4">
        
        {/* Decorative subtle icon banner */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
            <Sparkles className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h3 className="text-sm font-extrabold text-slate-900">Update Available</h3>
            <p className="text-[10px] text-indigo-600 font-bold tracking-wider uppercase">New version ready</p>
          </div>
        </div>

        {/* Content body */}
        <div className="space-y-1">
          <p className="text-slate-600 leading-relaxed text-xs">
            A new version of Sparezy is available. Update now to get the latest features and improvements.
          </p>
        </div>

        {/* Buttons section */}
        <div className="flex gap-2.5 pt-1">
          <button
            onClick={handleLater}
            disabled={isUpdating}
            className="flex-1 py-2.5 px-4 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 hover:text-slate-900 font-bold transition text-xs cursor-pointer disabled:opacity-50"
          >
            Later
          </button>
          <button
            onClick={handleUpdate}
            disabled={isUpdating}
            className="flex-1 py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold transition text-xs shadow-sm shadow-indigo-600/10 flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            {isUpdating ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                Updating...
              </>
            ) : (
              <>
                Update Now
                <ArrowRight className="w-3.5 h-3.5" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
