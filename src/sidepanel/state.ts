export let pageText = '';
export let currentTabId: number | null = null;
export let currentHostname = '';
export let ready = false;

export function setPageText(v: string): void {
  pageText = v;
}
export function setCurrentTabId(v: number | null): void {
  currentTabId = v;
}
export function setCurrentHostname(v: string): void {
  currentHostname = v;
}
export function setReady(v: boolean): void {
  ready = v;
}
