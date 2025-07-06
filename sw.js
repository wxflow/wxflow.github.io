// sw.js

// 引入 JSZip
importScripts('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');

const CACHE_NAME = 'zip-cache';
let ZIP_CACHE = null;

// 监听 install 事件
self.addEventListener('install', event => {
  self.skipWaiting();
});

// 监听激活事件
self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

// 监听消息事件，接收 ZIP 文件
self.addEventListener('message', async (event) => {
  if (event.data && event.data.type === 'ZIP_CACHE') {
    try {
      ZIP_CACHE = event.data.zipBlob;
      await cacheZip(ZIP_CACHE);
      console.log('ZIP 文件已缓存并解压。');
    } catch (err) {
      console.error('解压 ZIP 文件失败:', err);
    }
  }
});

// 核心：解压 ZIP 并缓存
async function cacheZip(zipBlob) {
  const zip = await JSZip.loadAsync(zipBlob);
  const cache = await caches.open(CACHE_NAME);

  const cachePromises = [];

  // 遍历 ZIP 内所有文件
  zip.forEach((relativePath, zipEntry) => {
    if (!zipEntry.dir) {
      cachePromises.push(
        zipEntry.async('blob').then(fileBlob => {
          const url = new URL(relativePath, self.registration.scope).href;
          const response = new Response(fileBlob);
          return cache.put(url, response);
        })
      );
    }
  });

  await Promise.all(cachePromises);
}

// 代理 fetch 请求，优先从缓存读取
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(response => {
      return response || fetch(event.request);
    })
  );
});
