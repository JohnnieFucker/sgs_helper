import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import vue from '@vitejs/plugin-vue';
import monkey from 'vite-plugin-monkey';

const USERSCRIPT_FILE = resolve(import.meta.dirname, 'dist/userscript/xiaochao.user.js');

/** 保留油猴头注释，把后面的程序收成一行。字符串里的换行不动。 */
function collapseUserscriptBody(source: string): string {
  const headerEnd = source.indexOf('==/UserScript==');
  if (headerEnd < 0) return source;
  const header = source.slice(0, headerEnd + '==/UserScript=='.length);
  const body = source.slice(header.length);
  let out = '';
  let escaped = false;
  let brace = 0;
  const stack: Array<'code' | "'" | '"' | '`'> = ['code'];
  const templateBrace: number[] = [];
  for (let index = 0; index < body.length; index += 1) {
    const char = body[index];
    const mode = stack[stack.length - 1];
    if (char === '\n') continue;
    out += char;
    if (mode === "'" || mode === '"') {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === mode) stack.pop();
      continue;
    }
    if (mode === '`') {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '`') stack.pop();
      else if (char === '$' && body[index + 1] === '{') {
        out += '{';
        index += 1;
        stack.push('code');
        templateBrace.push(brace);
      }
      continue;
    }
    if (char === "'" || char === '"' || char === '`') {
      stack.push(char);
      continue;
    }
    if (char === '{') brace += 1;
    if (char === '}') {
      brace -= 1;
      if (templateBrace.length > 0 && brace === templateBrace[templateBrace.length - 1]) {
        templateBrace.pop();
        stack.pop();
      }
    }
  }
  return `${header}\n\n${out.trim()}\n`;
}

function collapseUserscriptPlugin(): Plugin {
  return {
    name: 'xiaochao-collapse-userscript',
    apply: 'build',
    writeBundle() {
      writeFileSync(USERSCRIPT_FILE, collapseUserscriptBody(readFileSync(USERSCRIPT_FILE, 'utf8')));
    }
  };
}

const xiaochaoVersion = String(
  JSON.parse(readFileSync(resolve(import.meta.dirname, 'package.json'), 'utf8')).version || '0.0.0'
);

export default defineConfig({
  define: {
    __XIAOCHAO_VERSION__: JSON.stringify(xiaochaoVersion)
  },
  plugins: [
    vue(),
    monkey({
      entry: 'src/entries/userscript.ts',
      userscript: {
        name: '三国杀小抄',
        namespace: 'https://95chong.cn/',
        version: xiaochaoVersion,
        description: '三国杀OL辅助插件',
        author: 'many people',
        match: [
          '*://game.4399iw2.com/yxsgs/*',
          '*://my.4399.com/yxsgs/*',
          '*://*.sanguosha.com/*',
          '*://web.kuaiwan.com/kwsgsn/*',
          '*://wan.baidu.com/microend?gameId=19793595*',
          '*://www.7k7k.com/special/sgs/?*',
          '*://playgame.iqiyi.com/login/iframe_page_web/top?game_id=146'
        ],
        exclude: [
          'https://game.4399iw2.com/yxxsgs/*',
          '*://*.sanguosha.com/10/*',
          '*://*.sanguosha.com/10th/*',
          '*://*.sanguosha.com/220/miniGame/*',
          'https://wan.baidu.com/*gameId=19793616*',
          '*://h5.7k7k.com/web/H5GAMES.html?gid=960982bec2f555de44ea43ca8a7ef418/*',
          '*://qqgame.qq.com/webappframe/?appid=10951',
          '*://s118.app1107877410.qqopenapp.com/pc/qqLobby_index.php*'
        ],
        grant: 'none',
        'run-at': 'document-start',
        downloadURL: 'https://xc.95chong.cn/downloads/sgs-xc.user.js',
        updateURL: 'https://xc.95chong.cn/downloads/sgs-xc.user.js'
      },
      build: { fileName: 'xiaochao.user.js' }
    }),
    collapseUserscriptPlugin()
  ],
  build: {
    outDir: 'dist/userscript',
    emptyOutDir: true,
    target: 'chrome100',
    sourcemap: true,
    minify: 'oxc'
  }
});
