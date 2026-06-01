declare module '*.jsx' {
  const value: any;
  export default value;
}

declare global {
  interface Window {
    __SUVEDA_MOUNTED?: boolean;
  }
}

export {};