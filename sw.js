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

// 解压并缓存 ZIP
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

// 路由映射表
const routeMapping = {
  '/': 'index.html',
  '/ideas': 'ideas.html',
  '/add': 'add.html',
  '/admin': 'admin.html'
};

// 拦截 fetch，处理路由映射
self.addEventListener('fetch', event => {
  console.log('Service Worker 拦截:', event.request.url);

  const url = new URL(event.request.url);

  // 跳过 ZIP 文件请求
  if (url.href.includes('flow.zip')) {
    return;
  }

  // 检查是否是我们定义的路径
  if (routeMapping.hasOwnProperty(url.pathname)) {
    const mappedFile = routeMapping[url.pathname];
    const mappedUrl = new URL(mappedFile, self.registration.scope).href;

    event.respondWith(
      caches.match(mappedUrl)
        .then(response => {
          if (response) {
            console.log(`路径 ${url.pathname} 映射到缓存文件 ${mappedFile}`);
            return response;
          } else {
            console.warn(`缓存未找到: ${mappedFile}，尝试网络请求`);
            return fetch(event.request);
          }
        })
        .catch(err => {
          console.error('Fetch 失败:', err);
          return fetch(event.request);
        })
    );
  } else {
    // 普通请求优先缓存
    event.respondWith(
      caches.match(event.request)
        .then(response => {
          if (response) {
            console.log('命中缓存:', event.request.url);
            return response;
          }
          console.log('缓存未命中，尝试网络请求:', event.request.url);
          return fetch(event.request);
        })
        .catch(err => {
          console.error('Fetch 失败:', err);
          return fetch(event.request);
        })
    );
  }
});

// 向所有页面广播消息
function sendMessageToClients(message) {
  self.clients.matchAll().then(clients => {
    clients.forEach(client => {
      client.postMessage({ status: message });
    });
  });
}
