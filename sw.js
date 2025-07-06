// sw.js

importScripts('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');

const CACHE_NAME = 'zip-cache-v1';

// 立即激活
self.addEventListener('install', event => {
  console.log('Service Worker 安装完成');
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  console.log('Service Worker 激活完成');
  event.waitUntil(self.clients.claim());
});

// 监听消息，接收 zip 的 ArrayBuffer
self.addEventListener('message', async (event) => {
  if (event.data && event.data.type === 'ZIP_CACHE') {
    try {
      console.log('收到 ZIP 数据，开始解压...');
      const zipData = event.data.arrayBuffer;
      await cacheZip(zipData);
      console.log('ZIP 解压并缓存完成');
      sendMessageToClients('ZIP 解压并缓存完成');
    } catch (err) {
      console.error('解压 ZIP 文件失败:', err);
      sendMessageToClients('解压 ZIP 文件失败');
    }
  }
});

// 解压并缓存
async function cacheZip(arrayBuffer) {
  const zip = await JSZip.loadAsync(arrayBuffer);
  const cache = await caches.open(CACHE_NAME);

  const cachePromises = [];

  zip.forEach((relativePath, zipEntry) => {
    if (!zipEntry.dir) {
      cachePromises.push(
        zipEntry.async('blob').then(fileBlob => {
          const url = new URL(relativePath, self.registration.scope).href;
          console.log('缓存文件:', url);
          return cache.put(url, new Response(fileBlob));
        })
      );
    }
  });

  await Promise.all(cachePromises);
}

// 拦截 fetch，优先从缓存读取，跳过 ZIP 文件请求
self.addEventListener('fetch', event => {
  console.log('Service Worker 拦截:', event.request.url);
  const url = new URL(event.request.url);

  // 跳过 ZIP 文件请求，直接走网络，不拦截
  if (url.href.includes('flow.zip')) {
    return; // 不处理
  }

  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          console.log('命中缓存:', event.request.url);
          return response;
        }
        return fetch(event.request);
      })
      .catch(err => {
        console.error('Fetch 失败:', err);
        return fetch(event.request); // 如果缓存失败，强制兜底请求
      })
  );
});

// 向所有页面广播消息
function sendMessageToClients(message) {
  self.clients.matchAll().then(clients => {
    clients.forEach(client => {
      client.postMessage({ status: message });
    });
  });
}
