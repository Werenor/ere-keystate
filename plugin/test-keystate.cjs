'use strict';
const assert = require('assert');
const { EventEmitter } = require('events');
const { createManager } = require('./keystate.cjs');
function fixture(options = { native: false }) {
  const win = new EventEmitter(); win.webContents = new EventEmitter(); win.isFocused = () => true;
  const manager = createManager(options); manager.attach(win);
  const send = (code, type = 'keyDown', extra = {}) => {
    let prevented = false;
    win.webContents.emit('before-input-event', { preventDefault() { prevented = true; } }, { code, type, ...extra });
    return prevented;
  };
  return { win, manager, send };
}
const tests = [
  function disabledPassThrough() { const { manager, send } = fixture(); assert(!send('KeyD')); assert(!manager.read().enabled); },
  function holdAndRepeat() {
    const { manager, send } = fixture(); manager.enable(); assert(send('KeyD'));
    assert.deepStrictEqual(manager.read().pressed, ['KeyD']);
    send('KeyD', 'keyDown', { isAutoRepeat: true });
    const next = manager.read(); assert.deepStrictEqual(next.down, ['KeyD']); assert.deepStrictEqual(next.pressed, []);
    send('KeyD', 'keyUp'); const last = manager.read(); assert.deepStrictEqual(last.down, []); assert.deepStrictEqual(last.released, ['KeyD']);
  },
  function shortTapAndSnapshot() {
    const { manager, send } = fixture(); manager.enable(); send('KeyW'); send('KeyW', 'keyUp');
    const peek = manager.read({ consume: false }); assert.deepStrictEqual(peek.pressed, ['KeyW']); assert.deepStrictEqual(peek.released, ['KeyW']);
    peek.down.push('forged'); peek.events[0].code = 'forged';
    assert.strictEqual(manager.read().events[0].code, 'KeyW'); assert.deepStrictEqual(manager.read().pressed, []);
  },
  function multiKeyAndOrder() {
    const { manager, send } = fixture(); manager.enable(); send('KeyA'); send('KeyD'); send('KeyA', 'keyUp');
    const s = manager.read(); assert.deepStrictEqual(s.down, ['KeyD']); assert.deepStrictEqual(s.events.map((e) => e.type), ['keydown', 'keydown', 'keyup']);
  },
  function blurAndRefocus() {
    const { manager, send, win } = fixture(); manager.enable(); send('KeyD'); win.emit('blur');
    let s = manager.read(); assert(!s.focused); assert.deepStrictEqual(s.down, []); assert.deepStrictEqual(s.pressed, []); assert.deepStrictEqual(s.released, ['KeyD']);
    assert(!send('KeyA')); win.emit('focus'); send('KeyA'); assert.deepStrictEqual(manager.read().down, ['KeyA']);
  },
  function shortcutsAndWhitelist() {
    const { manager, send } = fixture(); manager.enable({ keys: ['KeyD'] }); assert(!send('KeyW')); send('KeyD');
    assert(!send('KeyR', 'keyDown', { control: true })); assert.deepStrictEqual(manager.read().down, []);
    manager.disable('reset'); assert(!send('KeyD')); assert.deepStrictEqual(manager.read().pressed, []);
    assert.throws(() => manager.enable({ keys: ['anything'] }), TypeError);
  },
  function missingCodeOnRelease() {
    const { manager, send } = fixture(); manager.enable();
    send('KeyD', 'keyDown', { key: 'd' });
    send('', 'keyUp', { key: 'D' });
    const result = manager.read(); assert.deepStrictEqual(result.down, []); assert.deepStrictEqual(result.released, ['KeyD']);
    send('', 'keyDown', { key: 'ArrowRight' }); send('', 'keyUp', { key: 'ArrowRight' });
    assert.deepStrictEqual(manager.read().down, []);
    // A layout whose printed key differs from its physical code must release the original code.
    send('KeyQ', 'keyDown', { key: 'a' }); send('', 'keyUp', { key: 'a' });
    assert.deepStrictEqual(manager.read().down, []);
    send('KeyA', 'keyDown', { key: 'a' }); send('KeyD', 'keyDown', { key: 'd' }); send('', 'keyUp', { key: 'a' });
    assert.deepStrictEqual(manager.read().down, ['KeyD']);
  },
  function nativeReleaseWithoutKeyUp() {
    const children = [];
    const spawn = () => { const child = new EventEmitter(); child.stdout = new EventEmitter(); child.kill = () => { child.killed = true; }; children.push(child); return child; };
    const now = Date.now; let time = 1000;
    try {
      Date.now = () => time;
      const { manager, send, win } = fixture({ spawn }); manager.enable();
      send('KeyD', 'keyDown', { key: 'd' });
      children[0].stdout.emit('data', Buffer.from('1005|\n')); assert.deepStrictEqual(manager.read().down, ['KeyD']);
      children[0].stdout.emit('data', Buffer.from('1020|\n')); assert.deepStrictEqual(manager.read().down, []);
      time = 1040; send('KeyA', 'keyDown', { key: 'a' });
      children[0].stdout.emit('data', Buffer.from('1060|KeyA\n')); assert.deepStrictEqual(manager.read().down, ['KeyA']);
      win.emit('blur'); assert(children[0].killed); assert.deepStrictEqual(manager.read().down, []);
      win.emit('focus'); assert.strictEqual(children.length, 2);
      children[0].stdout.emit('data', Buffer.from('2000|\n')); // Old generation cannot affect the next worker.
      children[1].emit('error', new Error('helper stopped')); assert.strictEqual(manager.read().enabled, false);
      win.emit('closed'); assert(children[1].killed);
    } finally { Date.now = now; }
  },
  function destroyedWindowCleanup() {
    const { manager, win } = fixture(); manager.enable();
    const contents = win.webContents;
    Object.defineProperty(win, 'webContents', { get() { throw new TypeError('Object has been destroyed'); } });
    assert.doesNotThrow(() => win.emit('closed'));
    assert.strictEqual(contents.listenerCount('before-input-event'), 0);
    assert.strictEqual(manager.read().enabled, false);
  },
  function boundedBacklog() {
    const { manager, send } = fixture(); manager.enable();
    for (let i = 0; i < 400; i++) { send('KeyD'); send('KeyD', 'keyUp'); }
    const s = manager.read(); assert(s.overflow); assert.strictEqual(s.events.length, 256); assert.deepStrictEqual(s.down, []);
  },
  function lifecycle() {
    const { manager, send, win } = fixture(); manager.attach(win); assert.strictEqual(win.webContents.listenerCount('before-input-event'), 1);
    manager.enable(); send('KeyD'); win.webContents.emit('did-start-loading'); assert(!manager.read().enabled);
    manager.enable(); send('KeyD'); win.webContents.emit('render-process-gone'); assert(!manager.read().enabled);
    win.emit('closed'); assert.strictEqual(win.webContents.listenerCount('before-input-event'), 0); assert.strictEqual(win.listenerCount('blur'), 0);
  },
];
for (const test of tests) { test(); console.log('PASS', test.name); }
console.log('PASS', tests.length, 'keystate checks');
