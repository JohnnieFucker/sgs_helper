const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

for (const entry of ['../shared-store.cjs', './release-app-shell/shared-store.js']) {
    const { createSharedStore, createJsonConfig } = require(entry);
    test(`${entry} 清理旧密码并保留其他数据`, () => {
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sgs-personal-test-'));
        try {
            const file = path.join(directory, 'shared.json');
            const preserved = { xiaochaoSettings: { theme: 'dark' }, unrelated: [1, 2] };
            fs.writeFileSync(file, JSON.stringify({ ...preserved,
                credentials: [{ account: 'test', password: 'test-secret' }],
                credentialsByScope: { official: [] }, credentialsInitialized: true,
                credentialScopesInitialized: { official: true }
            }));
            const store = createSharedStore(file);
            assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), preserved);
            assert.equal(store.getCredentials, undefined);
            assert.equal(store.setCredentials, undefined);
            store.setSetting('theme', 'light');
            assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')),
                { ...preserved, xiaochaoSettings: { theme: 'light' } });
            const before = fs.statSync(file).mtimeMs;
            createSharedStore(file);
            assert.equal(fs.statSync(file).mtimeMs, before);
            if (createJsonConfig) {
                const configFile = path.join(directory, 'config.json');
                fs.writeFileSync(configFile, JSON.stringify({ userlist: ['test-secret'], width: 1400 }));
                createJsonConfig(configFile);
                assert.deepEqual(JSON.parse(fs.readFileSync(configFile, 'utf8')), { width: 1400 });
            }
        } finally {
            fs.rmSync(directory, { recursive: true, force: true });
        }
    });
}
