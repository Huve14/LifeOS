/* eslint-disable @typescript-eslint/no-explicit-any */
declare module '*.jsx' {
  const value: any;
  export default value;
}

import type { LifeOS } from './lifeos';

declare global {
  interface Window {
    __SUVEDA_MOUNTED?: boolean;
    __mapLibreMap?: any;
    __lifeos?: LifeOS;
    /** Set while a recording, upload or call is in flight. */
    __lifeosBusy?: boolean;
    /** A service worker update arrived while busy; reload once it clears. */
    __lifeosPendingReload?: boolean;
    VideoJournalScreen?: any;
    DailyPromptScreen?: any;
    TripBoardScreen?: any;
    CallScreen?: any;
    __suvedaPhotos?: {
      upload: (file: File, onProgress?: (pct: number) => void) => Promise<string | null>;
      list: () => Promise<string[]>;
      del: (url: string) => Promise<boolean>;
    };
    MapScreen?: any;
    MemoryPhotoGrid?: any;
    MapLibreMap?: any;
    MapMarker?: any;
    MapPopup?: any;
    MapControls?: any;
    askHuve?: any;
    AnimatedIcon?: any;
    AnimatedNavContainer?: any;
    GlassCalendar?: any;
  }
}

export {};