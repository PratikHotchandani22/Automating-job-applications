export {};

declare global {
  interface Window {
    chrome?: any;
  }
  // eslint-disable-next-line no-var
  var chrome: any;
}
