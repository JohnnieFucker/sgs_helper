import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRogueMapConfigData } from '../src/features/rogue/rogue-map-config-data.ts';
import { installRogueMapController } from '../src/features/rogue/rogue-map-controller.ts';

class Node {
  _children = [];
  graphics = { clear() {}, drawPath() {}, drawLine() {} };
  get numChildren() { return this._children.length; }
  getChildAt(index) { return this._children[index]; }
  addChild(child) { this._children.push(child); return child; }
  removeChild(child) { this._children.splice(this._children.indexOf(child), 1); }
  pos(x, y) { this.x = x; this.y = y; }
  destroy() { this.destroyed = true; }
}

const config = buildRogueMapConfigData({ Root: {
  Level: [{ cityID: 101 }, { cityID: 102 }],
  General: [{ generalgroup: 2001, generalname: '测试怪物' }],
  Fight: [{ fightID: 2001, Ggroup: 2001, name: '遭遇战' }],
  Adventure: [{ ID: 1101, chapname: '奇遇', effect1: 11011 }],
  Choose: [{ effectID: 11011, getitem: 101 }],
  RewardGroup: [{ reward: 101, rewarddesc: '奇遇奖励' }]
} });

for (const modern of [true, false]) {
  test(`${modern ? '新版 CityRoot/allDatas' : '旧版 cityView/allData'} 渲染怪物和奇遇奖励`, () => {
    const previousLaya = globalThis.Laya;
    globalThis.Laya = { Sprite: Node, VBox: Node, Label: Node };
    let controller;
    let tick;
    const root = new Node();
    const city = Object.assign(new Node(), { CityId: 101, HasEvent: true, x: 100, y: 100 });
    const adventure = Object.assign(new Node(), { CityId: 102, HasEvent: true, x: 500, y: 100 });
    root.addChild(city);
    root.addChild(adventure);
    const allData = {
      chapterData: { locations: [{ location: 101, event: 2001 }, { location: 102, event: 1101 }] },
      // 新地图低难度也应渲染，不能等待根本不存在的旧 raidItem。
      seasonData: { difficulty: modern ? 10 : 150 }
    };
    const scene = modern
      ? { CityRoot: root, cityItemDic: {}, pveMgr: { allDatas: allData } }
      : { cityView: root };
    if (!modern) root.GetCityItemById = id => [city, adventure].find(item => item.CityId === id);
    const runtime = { setInterval(fn) { tick = fn; return 1; }, clearInterval() {} };
    try {
      controller = installRogueMapController({ get: () => true, subscribe: () => () => {} }, {
        globalObject: runtime,
        locator: {
          findInLayer: () => modern ? [] : [scene],
          scene: () => scene,
          manager: () => modern ? null : { allData }
        },
        configSource: { get: () => config, dispose() {} }
      });
      assert.equal(runtime.__XIAOCHAO_ROGUE_MAP_DEBUG__.reason, 'mounted');
      const panels = root._children.filter(child => child.name === 'city');
      assert.equal(panels.length, 2);
      const texts = panels.flatMap(panel => panel._children.map(child => child.text));
      assert.ok(texts.includes('测试怪物'));
      assert.ok(texts.includes('奇遇奖励'));
      assert.ok(panels.every(panel => panel.mouseEnabled === false));
      city.HasEvent = false;
      tick();
      assert.equal(root._children.filter(child => child.name === 'city').length, 1);
      adventure.HasEvent = false;
      tick();
      assert.equal(root._children.filter(child => child.name === 'city').length, 0);
      assert.ok(root._children.includes(city));
    } finally {
      controller?.dispose();
      globalThis.Laya = previousLaya;
    }
  });
}
