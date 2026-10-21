import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installCardConfigSource } from '../src/adapters/card-config-source.ts';
import { buildEventLines } from '../src/features/rogue/rogue-map-event-text.ts';

const files = {
  sys_playcard: { abbreviation: [{ Short: 'a', Long: 'id' }], GamePlayCards: { card: [{ a: 101, name: '杀' }] } },
  cha_spell: { GameSpells: { spell: [{ a: 1, c: '测试技能', o: '描述' }] } },
  hd_roguelike: {
    Root: {
      Level: [{ cityID: 101, citycoordinate: '10,20' }],
      General: [{ generalgroup: 2001, generalname: '测试怪物', hp: 4 }],
      Fight: [{ fightID: 2001, Ggroup: 2001, name: '遭遇战', reward: 101 }],
      Adventure: [{ ID: 1101, chapname: '奇遇', effect1: 11011 }],
      Choose: [{ effectID: 11011, getitem: 101 }],
      RewardGroup: [{ reward: 101, rewarddesc: '测试奇遇奖励' }]
    }
  }
};

for (const modern of [true, false]) {
  test(`${modern ? '新版 JSON 配置不依赖 CtrUtil' : '旧版加密配置保留解码流程'}`, async () => {
    const previousFetch = globalThis.fetch;
    let source;
    let decryptions = 0;
    let inflations = 0;
    const extension = modern ? '.json' : '.sgs';
    const configPath = modern ? '/220/miniGame/release/cfg/laya_json_release.cfg' : '/220/h5_2/res/config/Config_w.sgs';
    const loadedUrl = `https://web.sanguosha.com${configPath}?v=test-version`;
    const timers = new Set();
    const environment = {
      useMiniGameResourceMode: modern,
      location: new URL('https://web.sanguosha.com/220/miniGame/release/client/index_110076.php'),
      performance: { getEntriesByType: () => [{ name: loadedUrl, responseEnd: 10 }] },
      setInterval: fn => { timers.add(fn); return fn; },
      clearInterval: fn => timers.delete(fn),
      Laya: {},
      JSZip: { async loadAsync() {
        assert.equal(this, environment.JSZip);
        return { file(name) {
          if (!name.endsWith(extension)) return null;
          const data = files[name.slice(0, -extension.length)] ?? {};
          return { async async() { return new TextEncoder().encode(JSON.stringify(data)).buffer; } };
        } };
      } }
    };
    if (!modern) {
      environment.CtrUtil = { Ctr: { Ofb_Dec(data) {
        assert.equal(this, environment.CtrUtil.Ctr);
        decryptions++;
        return new Uint8Array(data);
      } } };
      environment.Zlib = { Gunzip: class {
        constructor(data) { this.data = data; }
        decompress() { inflations++; return this.data; }
      } };
    }
    globalThis.fetch = async url => {
      assert.equal(url, loadedUrl);
      return { ok: true, arrayBuffer: async () => new ArrayBuffer(0) };
    };
    try {
      source = installCardConfigSource(environment);
      for (let attempt = 0; attempt < 20 && !source.size(); attempt++) {
        await new Promise(resolve => setImmediate(resolve));
      }
      assert.equal(source.getCard(101).name, '杀');
      assert.equal(source.findSpellIdsByName('测试技能')[0], 1);
      const config = source.getRogueMapData();
      assert.ok(config.Rcity[101]);
      assert.ok(buildEventLines(config, 2001).some(line => line.text === '测试怪物'));
      assert.ok(buildEventLines(config, 1101).some(line => line.text === '测试奇遇奖励'));
      assert.equal(decryptions > 0, !modern);
      assert.equal(inflations, decryptions);
      assert.equal(timers.size, 0);
    } finally {
      source?.dispose();
      globalThis.fetch = previousFetch;
    }
  });
}
