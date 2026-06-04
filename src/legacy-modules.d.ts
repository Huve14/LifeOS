declare module '*.jsx' {
  const value: any;
  export default value;
}

declare global {
  interface Window {
    __SUVEDA_MOUNTED?: boolean;
    __mapLibreMap?: any;
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