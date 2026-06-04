declare module '*.jsx' {
  const value: any;
  export default value;
}

declare global {
  interface Window {
    __SUVEDA_MOUNTED?: boolean;
    __mapLibreMap?: any;
    MapScreen?: any;
    MapLibreMap?: any;
    MapMarker?: any;
    MapPopup?: any;
    MapControls?: any;
    askHuve?: any;
  }
}

export {};