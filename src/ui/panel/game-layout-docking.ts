/** 浏览器右侧停靠时为助手留出空间；解除停靠恢复原始游戏视口。 */

interface DockingSnapshot {
  padding: unknown;
  backgroundStyles: Array<[string, string, string]>;
  centerX: string;
  centerXPriority: string;
  layaBrowser: object | undefined;
  layaDescriptors: Map<string, PropertyDescriptor>;
}

let dockingSnapshot: DockingSnapshot | undefined;
let reservedPanelWidth = 0;
let keepAspectRatio = false;
let lastNotifiedSize = '';

/** 缩小游戏视口，并让 Laya 依据实际可用宽高重新排版。 */
export function reserveGameAreaForDockedPanel(panelWidth: number, preserveAspectRatio = false): void {
  const gameBackground = document.getElementById('bgDiv');
  reservedPanelWidth = Math.max(0, Math.round(panelWidth));
  keepAspectRatio = preserveAspectRatio;
  const rootStyle = document.documentElement.style;
  if (!dockingSnapshot) {
    dockingSnapshot = {
      padding: (window as any).padding,
      backgroundStyles: ['width', 'height'].map(property => [
        property,
        gameBackground?.style.getPropertyValue(property) || '',
        gameBackground?.style.getPropertyPriority(property) || ''
      ]),
      centerX: rootStyle.getPropertyValue('--sgs-center-x'),
      centerXPriority: rootStyle.getPropertyPriority('--sgs-center-x'),
      layaBrowser: undefined,
      layaDescriptors: new Map()
    };
  }
  // 游戏运行时可能晚于面板就绪，每次同步都尝试安装尚未接入的 getter。
  const installed = installLayaViewportOverride();
  const { width, height } = getAvailableGameSize();
  (window as any).padding = reservedPanelWidth;
  gameBackground?.style.setProperty('width', `${width}px`, 'important');
  if (keepAspectRatio) gameBackground?.style.setProperty('height', `${height}px`, 'important');
  rootStyle.setProperty('--sgs-center-x', `${width / 2}px`);
  document.documentElement.classList.add('xiaochao-game-viewport--docked');
  const size = `${width}:${height}:${reservedPanelWidth}:${keepAspectRatio}`;
  if (installed || lastNotifiedSize !== size) {
    // resize 的监听器会再次进入此函数，必须先记录尺寸。
    lastNotifiedSize = size;
    requestGameResize();
  }
}

/** 卸载或退出停靠时，恢复原始视口与背景样式。 */
export function restoreFullGameArea(): void {
  if (!dockingSnapshot) return;
  const snapshot = dockingSnapshot;
  dockingSnapshot = undefined;
  reservedPanelWidth = 0;
  keepAspectRatio = false;
  lastNotifiedSize = '';
  if (snapshot.layaBrowser) {
    for (const [property, descriptor] of snapshot.layaDescriptors) {
      Object.defineProperty(snapshot.layaBrowser, property, descriptor);
    }
  }
  (window as any).padding = snapshot.padding;
  const backgroundStyle = document.getElementById('bgDiv')?.style;
  for (const [property, value, priority] of snapshot.backgroundStyles) {
    if (value) backgroundStyle?.setProperty(property, value, priority);
    else backgroundStyle?.removeProperty(property);
  }
  const rootStyle = document.documentElement.style;
  if (snapshot.centerX) rootStyle.setProperty('--sgs-center-x', snapshot.centerX, snapshot.centerXPriority);
  else rootStyle.removeProperty('--sgs-center-x');
  document.documentElement.classList.remove('xiaochao-game-viewport--docked');
  requestGameResize();
}

function getAvailableGameSize(): { width: number; height: number } {
  const availableWidth = Math.max(0, document.documentElement.clientWidth - reservedPanelWidth);
  const availableHeight = Math.max(0, document.documentElement.clientHeight);
  const width = keepAspectRatio ? Math.min(availableWidth, availableHeight * 16 / 9) : availableWidth;
  return { width, height: keepAspectRatio ? width * 9 / 16 : availableHeight };
}

function installLayaViewportOverride(): boolean {
  const snapshot = dockingSnapshot;
  const browser = (window as any).Laya?.Browser;
  if (!snapshot || !browser) return false;
  let installed = false;
  for (const property of keepAspectRatio ? ['clientWidth', 'clientHeight'] : ['clientWidth']) {
    if (snapshot.layaDescriptors.has(property)) continue;
    const descriptor = Object.getOwnPropertyDescriptor(browser, property);
    if (!descriptor?.configurable || typeof descriptor.get !== 'function') continue;
    snapshot.layaBrowser = browser;
    snapshot.layaDescriptors.set(property, descriptor);
    Object.defineProperty(browser, property, {
      ...descriptor,
      get: () => getAvailableGameSize()[property === 'clientWidth' ? 'width' : 'height']
    });
    installed = true;
  }
  return installed;
}

function requestGameResize(): void {
  window.dispatchEvent(new Event('resize'));
  window.dispatchEvent(new Event('SGSresize'));
}
