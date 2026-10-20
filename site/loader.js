'use strict';
const gameName = "瓷间·世界珍藏";
const expiresAt = Date.parse("2026-10-22T04:00:00Z");
const status = document.getElementById('status');
const gate = document.getElementById('gate');
function expire() {
  document.body.replaceChildren();
  const main = document.createElement('main');
  const heading = document.createElement('h1');
  const note = document.createElement('p');
  heading.textContent = gameName;
  note.textContent = '访问已结束';
  main.append(heading, note);
  document.body.append(main);
}
if (Date.now() >= expiresAt) expire();
else {
  setTimeout(expire, expiresAt - Date.now());
  const keyText = new URLSearchParams(location.hash.slice(1)).get('k');
  if (!keyText) status.textContent = '链接无效';
  else openGame(keyText).catch(() => { status.textContent = '链接无效或暂不可用'; });
}
async function openGame(linkKey) {
  const [manifestResponse, payloadResponse] = await Promise.all([
    fetch('manifest.json', { cache: 'no-store' }),
    fetch('payload.bin', { cache: 'no-store' })
  ]);
  if (!manifestResponse.ok || !payloadResponse.ok) throw Error('unavailable');
  const manifest = await manifestResponse.json();
  const payload = new Uint8Array(await payloadResponse.arrayBuffer());
  const rawKey = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(linkKey));
  const key = await crypto.subtle.importKey('raw', rawKey, 'AES-GCM', false, ['decrypt']);
  const tag = b64(manifest.tag);
  const combined = new Uint8Array(payload.length + tag.length);
  combined.set(payload);
  combined.set(tag, payload.length);
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64(manifest.iv) }, key, combined));
  if (Date.now() >= expiresAt) return expire();
  const urls = {}, texts = {};
  for (const file of manifest.files) {
    const bytes = plain.slice(file.offset, file.offset + file.bytes);
    const ext = file.path.split('.').pop().toLowerCase();
    const mime = { js: 'text/javascript', html: 'text/html', css: 'text/css', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', ttf: 'font/ttf', wav: 'audio/wav', mp3: 'audio/mpeg', txt: 'text/plain' }[ext] || 'application/octet-stream';
    urls[file.path] = URL.createObjectURL(new Blob([bytes], { type: mime }));
    if (['js', 'html', 'css'].includes(ext)) texts[file.path] = new TextDecoder().decode(bytes);
  }
  let html = texts['index.html'];
  if (!html) throw Error('missing entry');
  html = html.replace(/<title>[\s\S]*?<\/title>/i, '<title>' + escapeHtml(gameName) + '</title>');
  html = html.replace(/<link\b[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*>/gi, (whole, file) => {
    const css = texts[file];
    if (!css) throw Error('missing CSS');
    return '<style>' + rewriteCss(css, urls) + '</style>';
  });
  html = rewriteCss(html, urls);
  html = html.replace(/<script\b[^>]*src=["']([^"']+)["'][^>]*><\/script>/gi, (whole, file) => {
    const js = texts[file.split('?')[0]];
    if (!js) throw Error('missing JS ' + file);
    return '<script>' + js.replace(/<\/script/gi, '<\\/script') + '<\/script>';
  });
  const hook = '<script>(' + installAssetMap.toString() + ')(' + JSON.stringify(urls) + ')<\/script>';
  html = html.replace(/<head([^>]*)>/i, '<head$1>' + hook);
  const frame = document.createElement('iframe');
  frame.title = gameName;
  frame.allow = 'autoplay';
  frame.srcdoc = html;
  gate.remove();
  document.body.append(frame);
}
function b64(s) { return Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)); }
function escapeHtml(s) { return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]); }
function rewriteCss(css, urls) {
  return css.replace(/url\(\s*(['"]?)([^)'"\s]+)\1\s*\)/g, (whole, quote, url) => urls[url] ? 'url("' + urls[url] + '")' : whole);
}
function installAssetMap(urls) {
  const nativeFetch = window.fetch.bind(window);
  window.fetch = (input, options) => nativeFetch(typeof input === 'string' && urls[input] ? urls[input] : input, options);
  for (const type of [HTMLImageElement, HTMLMediaElement]) {
    const descriptor = Object.getOwnPropertyDescriptor(type.prototype, 'src');
    if (descriptor && descriptor.set) Object.defineProperty(type.prototype, 'src', {
      configurable: true,
      get() { return descriptor.get.call(this); },
      set(value) { return descriptor.set.call(this, urls[value] || value); }
    });
  }
}
