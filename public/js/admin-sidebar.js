/**
 * Disciplined Disciples - Shared Admin Sidebar (D0)
 * Renders the unified sidebar into <aside id="admin-sidebar"></aside>
 *
 * One source of truth for admin navigation. Edit the NAV array below to
 * change items across every admin page at once.
 */
(function () {
  'use strict';

  const NAV = [
    { id: 'dashboard',      label: 'Dashboard',      icon: 'fa-chart-line',     href: 'admin-dashboard.html' },
    { id: 'orders',         label: 'Orders',         icon: 'fa-shopping-bag',   href: 'admin-orders.html' },
    { id: 'products',       label: 'Products',       icon: 'fa-box',            href: 'admin-products.html' },
    { id: 'mentorship',     label: 'Academy',        icon: 'fa-user-graduate',  href: 'admin-mentorship.html' },
    { id: 'blogs',          label: 'Blog',           icon: 'fa-newspaper',      href: 'admin-blogs.html' },
    { id: 'communications', label: 'Communications', icon: 'fa-comments',       href: 'admin-communications.html' },
    { id: 'analytics',      label: 'Analytics',      icon: 'fa-chart-pie',      href: 'admin-analytics.html' },
    { id: 'settings',       label: 'Settings',       icon: 'fa-sliders',        href: 'admin-settings.html' },
  ];

  const BOTTOM = [
    { id: 'activity',          label: 'Activity Log',      icon: 'fa-clipboard-list', href: 'admin-activity.html' },
    { id: 'view-store',        label: 'View Store',        icon: 'fa-store',          href: 'index.html' },
    { id: 'logout',            label: 'Logout',            icon: 'fa-sign-out-alt',   action: 'logout', danger: true },
  ];

  function activeId() {
    const path = (window.location.pathname || '').toLowerCase();
    if (path.includes('admin-orders'))            return 'orders';
    if (path.includes('admin-products'))          return 'products';
    if (path.includes('admin-blogs'))             return 'blogs';
    if (path.includes('admin-communications') ||
        path.includes('admin-customers')   ||
        path.includes('admin-broadcast')   ||
        path.includes('admin-community')   ||
        path.includes('admin-collaborations'))    return 'communications';
    if (path.includes('admin-mentorship'))        return 'mentorship';
    if (path.includes('admin-analytics'))         return 'analytics';
    if (path.includes('admin-settings') ||
        path.includes('admin-book'))              return 'settings';
    if (path.includes('admin-activity'))          return 'activity';
    if (path.includes('admin-dashboard') ||
        path.endsWith('/admin') ||
        path.endsWith('admin'))                   return 'dashboard';
    return '';
  }

  function navHtml() {
    const active = activeId();
    return NAV.map((item) => {
      const isActive = item.id === active;
      const cls = isActive
        ? 'sidebar-link active flex items-center gap-3 px-4 py-3 rounded-lg text-white transition'
        : 'sidebar-link flex items-center gap-3 px-4 py-3 rounded-lg text-gray-700 hover:bg-gray-100 transition';
      const style = isActive ? ' style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);"' : '';
      return `<a href="${item.href}" class="${cls}"${style}><i class="fas ${item.icon} w-5"></i><span>${item.label}</span></a>`;
    }).join('');
  }

  function bottomHtml() {
    return BOTTOM.map((item) => {
      const danger = item.danger ? 'text-red-600 hover:bg-red-50' : 'text-gray-700 hover:bg-gray-100';
      const cls = `sidebar-link flex items-center gap-3 px-4 py-3 rounded-lg ${danger} transition w-full text-left`;
      if (item.action) {
        return `<button type="button" data-sidebar-action="${item.action}" class="${cls}"><i class="fas ${item.icon} w-5"></i><span>${item.label}</span></button>`;
      }
      return `<a href="${item.href}" class="${cls}"><i class="fas ${item.icon} w-5"></i><span>${item.label}</span></a>`;
    }).join('');
  }

  function renderSidebar(host) {
    host.classList.add('w-64', 'bg-white', 'border-r', 'border-gray-200', 'fixed', 'h-full', 'overflow-y-auto', 'z-30');
    host.innerHTML = `
      <div class="p-6 border-b border-gray-200">
        <a href="index.html" class="flex items-center gap-3">
          <img src="Assets/45.png" alt="Logo" class="h-10 w-10 rounded-lg object-cover">
          <div>
            <h1 class="font-bold text-gray-900">Disciplined</h1>
            <p class="text-xs text-gray-500">Admin Panel</p>
          </div>
        </a>
      </div>
      <nav class="p-4 space-y-1">${navHtml()}</nav>
      <div class="border-t border-gray-200 mt-4 p-4 space-y-1">${bottomHtml()}</div>
    `;
    bindActions(host);
  }

  function bindActions(scope) {
    scope.querySelectorAll('[data-sidebar-action="logout"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          if (window.firebase && firebase.auth) {
            await firebase.auth().signOut();
          }
        } catch (err) {
          console.error('[admin-sidebar] signOut failed:', err);
        }
        try { sessionStorage.clear(); } catch (e) { /* ignore */ }
        window.location.replace('login-signup.html');
      });
    });
  }

  function init() {
    const host = document.getElementById('admin-sidebar');
    if (host) renderSidebar(host);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Expose for debugging
  window.AdminSidebar = { render: renderSidebar };
})();
