import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reserveGameAreaForDockedPanel, restoreFullGameArea } from '../src/ui/panel/game-layout-docking.ts';

function style() {
  const values = new Map();
  return {
    getPropertyValue: key => values.get(key)?.[0] || '',
    getPropertyPriority: key => values.get(key)?.[1] || '',
    setProperty: (key, value, priority = '') => values.set(key, [value, priority]),
    removeProperty: key => values.delete(key)
  };
}

test('侧栏预留、16:9 视口、窗口变化与卸载恢复', () => {
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;
  const background = { style: style() };
  const root = { clientWidth: 1400, clientHeight: 790, style: style(), classList: new Set() };
  root.classList.remove = root.classList.delete;
  background.style.setProperty('width', '100%', 'important');
  background.style.setProperty('height', '100%');
  root.style.setProperty('--sgs-center-x', '50%', 'important');
  const browser = {};
  Object.defineProperties(browser, {
    clientWidth: { configurable: true, get: () => root.clientWidth },
    clientHeight: { configurable: true, get: () => root.clientHeight }
  });
  const originalWidth = Object.getOwnPropertyDescriptor(browser, 'clientWidth');
  const originalHeight = Object.getOwnPropertyDescriptor(browser, 'clientHeight');
  let notifications = 0;
  globalThis.document = { documentElement: root, getElementById: () => background };
  globalThis.window = { padding: 12, Laya: { Browser: browser }, dispatchEvent() {
    notifications++;
    // 模拟面板 resize 监听器重新同步，确保没有递归发送 resize。
    reserveGameAreaForDockedPanel(250, true);
  } };
  try {
    for (const [width, height] of [[1400, 790], [2400, 800], [800, 1200], [200, 100]]) {
      root.clientWidth = width;
      root.clientHeight = height;
      reserveGameAreaForDockedPanel(250, true);
      assert.ok(browser.clientWidth <= Math.max(0, width - 250));
      assert.ok(browser.clientHeight <= height);
      assert.ok(Math.abs(browser.clientWidth - browser.clientHeight * 16 / 9) < 0.000001);
      assert.equal(background.style.getPropertyValue('width'), `${browser.clientWidth}px`);
      assert.equal(background.style.getPropertyValue('height'), `${browser.clientHeight}px`);
    }
    const before = notifications;
    reserveGameAreaForDockedPanel(250, true);
    assert.equal(notifications, before);
    globalThis.window.dispatchEvent = () => {};
    restoreFullGameArea();
    assert.deepEqual(Object.getOwnPropertyDescriptor(browser, 'clientWidth'), originalWidth);
    assert.deepEqual(Object.getOwnPropertyDescriptor(browser, 'clientHeight'), originalHeight);
    assert.equal(background.style.getPropertyValue('width'), '100%');
    assert.equal(background.style.getPropertyPriority('width'), 'important');
    assert.equal(background.style.getPropertyValue('height'), '100%');
    assert.equal(root.style.getPropertyValue('--sgs-center-x'), '50%');
    assert.equal(root.style.getPropertyPriority('--sgs-center-x'), 'important');
    assert.equal(globalThis.window.padding, 12);
    // 浏览器的普通停靠不锁定比例，也不覆盖高度。
    root.clientWidth = 1400;
    reserveGameAreaForDockedPanel(250);
    assert.equal(browser.clientWidth, 1150);
    assert.equal(browser.clientHeight, root.clientHeight);
    assert.equal(background.style.getPropertyValue('height'), '100%');
    restoreFullGameArea();
    assert.equal(browser.clientWidth, root.clientWidth);
    assert.equal(browser.clientHeight, root.clientHeight);
    assert.equal(root.classList.has('xiaochao-game-viewport--docked'), false);
  } finally {
    restoreFullGameArea();
    globalThis.window = originalWindow;
    globalThis.document = originalDocument;
  }
});
