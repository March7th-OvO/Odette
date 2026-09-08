// Integration regression against the local Wrangler R2 emulator; never targets production.
const assert = require('node:assert/strict');
const base = 'http://127.0.0.1:8787';
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
(async () => {
  const keys = [];
  try {
    for (const name of ['分页测试一.png', '分页测试二.png']) {
      const data = new FormData(); data.append('file', new File([png], name, {type:'image/png'}));
      const result = await fetch(`${base}/api/images`, {method:'POST',body:data});
      assert.equal(result.status,200,await result.clone().text());
      const item = (await result.json()).data; keys.push(item.key);
      assert.equal(item.originalName,name); assert.equal(item.size,png.length);
      assert.deepEqual(Buffer.from(await (await fetch(item.url)).arrayBuffer()),png);
    }
    const first = (await (await fetch(`${base}/api/images?limit=1`)).json()).data;
    assert.equal(first.items.length,1); assert.ok(first.cursor);
    const second = (await (await fetch(`${base}/api/images?limit=1&cursor=${encodeURIComponent(first.cursor)}`)).json()).data;
    assert.equal(second.items.length,1); assert.notEqual(first.items[0].key,second.items[0].key);
    const invalid = new FormData(); invalid.append('file',new File(['<svg/>'],'fake.png',{type:'image/png'}));
    assert.equal((await fetch(`${base}/api/images`,{method:'POST',body:invalid})).status,400);
    const huge = new FormData(); huge.append('file',new File([Buffer.alloc(11*1024*1024)],'big.png',{type:'image/png'}));
    assert.equal((await fetch(`${base}/api/images`,{method:'POST',body:huge})).status,413);
    console.log('PASS: real local R2, Unicode metadata, exact file bytes, cursor pagination, forged MIME and oversized request');
  } finally {
    for (const key of keys) assert.equal((await fetch(`${base}/api/images`,{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({key})})).status,200);
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
