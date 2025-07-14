// Service Worker for Vibe Manager Website
// Version: 1.0.0

const CACHE_NAME = 'vibe-manager-v1.0.0';
const STATIC_CACHE_NAME = 'vibe-manager-static-v1.0.0';
const DYNAMIC_CACHE_NAME = 'vibe-manager-dynamic-v1.0.0';
const IMAGE_CACHE_NAME = 'vibe-manager-images-v1.0.0';

// Assets to cache immediately
const STATIC_ASSETS = [
  '/',
  '/manifest.json',
  '/favicon.ico',
  '/fonts/inter-var.woff2',
  '/fonts/jetbrains-mono.woff2',
  '/_next/static/css/app.css',
  '/_next/static/chunks/framework.js',
  '/_next/static/chunks/main.js',
  '/_next/static/chunks/pages/_app.js',
  '/_next/static/chunks/webpack.js',
];

// Cache strategies
const CACHE_STRATEGIES = {
  static: 'cache-first',
  dynamic: 'network-first',
  images: 'cache-first',
  api: 'network-first',
};

// Cache duration (in seconds)
const CACHE_DURATION = {
  static: 31536000, // 1 year
  dynamic: 86400,   // 1 day
  images: 2592000,  // 30 days
  api: 300,         // 5 minutes
};

// Install event - cache static assets
self.addEventListener('install', (event) => {
  console.log('Service Worker: Installing');
  
  event.waitUntil(
    Promise.all([
      caches.open(STATIC_CACHE_NAME).then((cache) => {
        console.log('Service Worker: Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      }),
      caches.open(DYNAMIC_CACHE_NAME),
      caches.open(IMAGE_CACHE_NAME),
    ])
  );
  
  // Skip waiting to activate immediately
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('Service Worker: Activating');
  
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (
            cacheName !== STATIC_CACHE_NAME &&
            cacheName !== DYNAMIC_CACHE_NAME &&
            cacheName !== IMAGE_CACHE_NAME
          ) {
            console.log('Service Worker: Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  
  // Take control of all clients
  return self.clients.claim();
});

// Fetch event - handle network requests
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }
  
  // Skip cross-origin requests (unless for images)
  if (url.origin !== location.origin && !isImageRequest(request)) {
    return;
  }
  
  event.respondWith(handleRequest(request));
});

// Handle different types of requests
async function handleRequest(request) {
  const url = new URL(request.url);
  
  // API requests
  if (url.pathname.startsWith('/api/')) {
    return handleApiRequest(request);
  }
  
  // Image requests
  if (isImageRequest(request)) {
    return handleImageRequest(request);
  }
  
  // Static assets
  if (isStaticAsset(request)) {
    return handleStaticRequest(request);
  }
  
  // Dynamic pages
  return handleDynamicRequest(request);
}

// Handle API requests with network-first strategy
async function handleApiRequest(request) {
  const cacheName = DYNAMIC_CACHE_NAME;
  
  try {
    // Try network first
    const networkResponse = await fetch(request);
    
    // Cache successful responses
    if (networkResponse.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    // Fallback to cache
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // Return offline response for API requests
    return new Response(
      JSON.stringify({ error: 'Network unavailable' }),
      {
        status: 503,
        statusText: 'Service Unavailable',
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}

// Handle image requests with cache-first strategy
async function handleImageRequest(request) {
  const cacheName = IMAGE_CACHE_NAME;
  
  // Check cache first
  const cachedResponse = await caches.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }
  
  try {
    // Fetch from network
    const networkResponse = await fetch(request);
    
    // Cache successful responses
    if (networkResponse.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    // Return placeholder image for failed requests
    return new Response(
      `<svg width="400" height="300" xmlns="http://www.w3.org/2000/svg">
        <rect width="400" height="300" fill="#f3f4f6"/>
        <text x="200" y="150" text-anchor="middle" font-family="Arial" font-size="16" fill="#6b7280">Image not available</text>
      </svg>`,
      {
        headers: { 'Content-Type': 'image/svg+xml' },
      }
    );
  }
}

// Handle static assets with cache-first strategy
async function handleStaticRequest(request) {
  const cacheName = STATIC_CACHE_NAME;
  
  // Check cache first
  const cachedResponse = await caches.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }
  
  try {
    // Fetch from network
    const networkResponse = await fetch(request);
    
    // Cache successful responses
    if (networkResponse.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    // Return cached fallback if available
    const fallbackResponse = await caches.match('/offline.html');
    return fallbackResponse || new Response('Network Error', { status: 503 });
  }
}

// Handle dynamic pages with network-first strategy
async function handleDynamicRequest(request) {
  const cacheName = DYNAMIC_CACHE_NAME;
  
  try {
    // Try network first
    const networkResponse = await fetch(request);
    
    // Cache successful responses
    if (networkResponse.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    // Fallback to cache
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // Return offline page
    const offlineResponse = await caches.match('/offline.html');
    return offlineResponse || new Response('Page not available offline', { status: 503 });
  }
}

// Helper functions
function isImageRequest(request) {
  return request.destination === 'image' || 
         /\.(jpg|jpeg|png|gif|webp|avif|svg)$/i.test(new URL(request.url).pathname);
}

function isStaticAsset(request) {
  const url = new URL(request.url);
  return url.pathname.startsWith('/_next/static/') ||
         url.pathname.startsWith('/static/') ||
         url.pathname.startsWith('/fonts/') ||
         /\.(js|css|woff2|woff|ttf|eot)$/i.test(url.pathname);
}

// Background sync for failed requests
self.addEventListener('sync', (event) => {
  if (event.tag === 'background-sync') {
    event.waitUntil(handleBackgroundSync());
  }
});

async function handleBackgroundSync() {
  // Retry failed requests when network is available
  const failedRequests = await getFailedRequests();
  
  for (const request of failedRequests) {
    try {
      await fetch(request);
      await removeFailedRequest(request);
    } catch (error) {
      console.log('Background sync failed for:', request.url);
    }
  }
}

async function getFailedRequests() {
  // Implementation depends on your specific needs
  return [];
}

async function removeFailedRequest(request) {
  // Implementation depends on your specific needs
}

// Push notification handling
self.addEventListener('push', (event) => {
  if (!event.data) return;
  
  const data = event.data.json();
  const options = {
    body: data.body,
    icon: '/icon-192x192.png',
    badge: '/icon-192x192.png',
    vibrate: [100, 50, 100],
    data: data.data,
    actions: data.actions,
  };
  
  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Notification click handling
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  const url = event.notification.data?.url || '/';
  
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((clientList) => {
      // Check if there's already a window/tab open with the target URL
      for (const client of clientList) {
        if (client.url === url && 'focus' in client) {
          return client.focus();
        }
      }
      
      // If not, open a new window/tab
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});

// Message handling for manual cache updates
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'CACHE_UPDATE') {
    event.waitUntil(updateCache());
  }
});

async function updateCache() {
  const cacheNames = await caches.keys();
  await Promise.all(
    cacheNames.map(cacheName => caches.delete(cacheName))
  );
  
  // Reinstall with fresh cache
  await installStaticAssets();
}

async function installStaticAssets() {
  const cache = await caches.open(STATIC_CACHE_NAME);
  await cache.addAll(STATIC_ASSETS);
}

// Performance monitoring
self.addEventListener('fetch', (event) => {
  // Skip monitoring for certain requests
  if (event.request.url.includes('google-analytics') || 
      event.request.url.includes('googletagmanager')) {
    return;
  }
  
  // Monitor cache hit rates
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const isCacheHit = !!cachedResponse;
      
      // Log cache performance (in development)
      if (typeof self.performance !== 'undefined') {
        self.performance.mark(`cache-${isCacheHit ? 'hit' : 'miss'}-${event.request.url}`);
      }
      
      return cachedResponse || fetch(event.request);
    })
  );
});

// Cleanup old caches periodically
setInterval(() => {
  cleanupOldCaches();
}, 24 * 60 * 60 * 1000); // Every 24 hours

async function cleanupOldCaches() {
  const cacheNames = await caches.keys();
  const currentCaches = [STATIC_CACHE_NAME, DYNAMIC_CACHE_NAME, IMAGE_CACHE_NAME];
  
  await Promise.all(
    cacheNames.map(cacheName => {
      if (!currentCaches.includes(cacheName)) {
        return caches.delete(cacheName);
      }
    })
  );
}

console.log('Service Worker: Loaded and ready!');