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
    { id: 'events',         label: 'Events',         icon: 'fa-ticket',         href: 'admin-events.html' },
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
    if (path.includes('admin-events'))            return 'events';
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

  // === Phone and tablet navigation ===
  // Below 1024px the sidebar is a slide-in drawer (hidden until the menu button is tapped) instead of a fixed column
  // that covers the page. Look, colours and links are unchanged; desktop is untouched.
  const MOBILE_CSS = `
    .admin-topbar, .admin-nav-backdrop, .admin-sidebar-close { display: none; }
    /* A wide table inside the page no longer stretches the whole page sideways: it scrolls inside its own card. */
    main.flex-1 { min-width: 0; }
    @media (max-width: 1023.98px) {
      .admin-topbar { display: flex; align-items: center; gap: .75rem; position: sticky; top: 0; z-index: 35; background: #fff; border-bottom: 1px solid #e5e7eb; padding: .5rem .75rem; }
      .admin-menu-btn { display: inline-flex; align-items: center; justify-content: center; width: 44px; height: 44px; flex: none; border: 1px solid #e5e7eb; border-radius: .5rem; background: #fff; color: #374151; font-size: 1.1rem; cursor: pointer; }
      .admin-topbar-brand { display: flex; align-items: center; gap: .6rem; min-width: 0; color: #111827; font-weight: 700; text-decoration: none; }
      .admin-topbar-brand img { width: 32px; height: 32px; border-radius: .5rem; object-fit: cover; flex: none; }
      .admin-topbar-brand span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      #admin-sidebar { top: 0; left: 0; width: 18rem; max-width: 86vw; z-index: 70; transform: translateX(-100%); visibility: hidden; transition: transform .25s ease, visibility .25s; -webkit-overflow-scrolling: touch; overscroll-behavior: contain; }
      body.admin-nav-open #admin-sidebar { transform: none; visibility: visible; box-shadow: 0 0 40px rgba(15, 23, 42, .3); }
      .admin-nav-backdrop { display: block; position: fixed; inset: 0; z-index: 65; background: rgba(15, 23, 42, .45); opacity: 0; pointer-events: none; transition: opacity .2s ease; }
      body.admin-nav-open .admin-nav-backdrop { opacity: 1; pointer-events: auto; }
      body.admin-nav-open { overflow: hidden; }
      .admin-sidebar-close { display: inline-flex; align-items: center; justify-content: center; position: absolute; top: .6rem; right: .6rem; width: 40px; height: 40px; border: 0; border-radius: .5rem; background: transparent; color: #6b7280; font-size: 1.1rem; cursor: pointer; }
      #admin-sidebar .admin-sidebar-head { position: relative; padding-right: 3.5rem; }
      /* The content area uses the full width (it was pushed right by the sidebar's 16rem margin). */
      main.ml-64 { margin-left: 0 !important; min-width: 0; max-width: 100%; }
    }
    @media (max-width: 639.98px) {
      main.ml-64 { padding: 1rem !important; }
      /* Filter and action rows: controls share the row neatly instead of staggering at their desktop widths. */
      main .flex.flex-wrap > select, main .flex.flex-wrap > input[type="date"], main .flex.flex-wrap > input[type="number"] { flex: 1 1 calc(50% - .5rem); min-width: 0; width: 100% !important; max-width: 100%; }
      main .flex.flex-wrap > input[type="search"], main .flex.flex-wrap > input[type="text"], main .flex.flex-wrap > input[type="email"] { flex: 1 1 100%; min-width: 0; width: 100% !important; max-width: 100%; }
      main .flex.flex-wrap > button, main .flex.flex-wrap > a.btn { flex: 1 1 auto; }
      main select, main input, main textarea { max-width: 100%; }
      main .grid > * { min-width: 0; }
      /* Page headers and title-plus-actions rows wrap instead of squeezing the title beside the buttons. */
      main header.flex, main .flex.justify-between { flex-wrap: wrap; row-gap: .6rem; }
      main .flex > input:not([type="checkbox"]):not([type="radio"]) { min-width: 0; }
      main .flex:not(.flex-wrap) > select { min-width: 0; max-width: 55%; }
      /* Wide tables become one labelled card per row on phones (labels come from the column headings). */
      table.admin-stack { display: block; width: 100% !important; min-width: 0 !important; }
      table.admin-stack thead { display: none; }
      table.admin-stack tbody { display: block; }
      table.admin-stack tr { display: block; margin: .75rem 0; padding: .35rem .85rem; border: 1px solid #e5e7eb; border-radius: .75rem; background: #fff; }
      table.admin-stack tr[hidden], table.admin-stack tr.hidden { display: none !important; }
      table.admin-stack td { display: block; padding: .5rem 0 !important; border: 0 !important; border-bottom: 1px solid #f1f5f9 !important; white-space: normal !important; overflow-wrap: anywhere; text-align: left !important; }
      table.admin-stack td:last-child { border-bottom: 0 !important; }
      table.admin-stack td::before { content: attr(data-label); display: block; margin-bottom: .2rem; font-size: .68rem; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; color: #6b7280; }
      table.admin-stack td[data-label=""]::before, table.admin-stack td[colspan]::before { display: none; }
      table.admin-stack td > * { min-width: 0; max-width: 100%; }
      table.admin-stack td .flex { flex-wrap: wrap; }
      .overflow-x-auto:has(> table.admin-stack) { overflow-x: visible; }
    }
  `;

  function setNav(open) {
    document.body.classList.toggle('admin-nav-open', open);
    const btn = document.getElementById('admin-menu-btn');
    if (btn) { btn.setAttribute('aria-expanded', open ? 'true' : 'false'); btn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu'); }
  }

  // Label every cell of a wide table with its column heading, and mark the table so the phone CSS can stack its rows.
  function labelTables() {
    document.querySelectorAll('main table').forEach((table) => {
      const heads = [...table.querySelectorAll('thead th')];
      if (heads.length < 4) return;
      table.classList.add('admin-stack');
      const names = heads.map((h) => (h.innerText || h.textContent || '').trim());
      table.querySelectorAll('tbody tr').forEach((row) => {
        if (row.dataset.labelled === String(row.children.length)) return;
        [...row.children].forEach((cell, i) => {
          if (cell.tagName === 'TD' && !cell.hasAttribute('data-label')) cell.setAttribute('data-label', cell.hasAttribute('colspan') ? '' : (names[i] || ''));
        });
        row.dataset.labelled = String(row.children.length);
      });
    });
  }

  function watchTables() {
    let queued = false;
    const run = () => { queued = false; labelTables(); };
    new MutationObserver(() => { if (!queued) { queued = true; requestAnimationFrame(run); } }).observe(document.body, { childList: true, subtree: true });
    labelTables();
  }

  function installMobileNav(host) {
    if (document.getElementById('admin-mobile-style')) return;
    const style = document.createElement('style');
    style.id = 'admin-mobile-style';
    style.textContent = MOBILE_CSS;
    document.head.appendChild(style);

    const bar = document.createElement('div');
    bar.className = 'admin-topbar';
    bar.id = 'admin-topbar';
    bar.innerHTML = `
      <button type="button" id="admin-menu-btn" class="admin-menu-btn" aria-label="Open menu" aria-controls="admin-sidebar" aria-expanded="false"><i class="fas fa-bars"></i></button>
      <a href="index.html" class="admin-topbar-brand"><img src="Assets/45.png" alt=""><span>Admin Panel</span></a>`;
    document.body.prepend(bar);

    const backdrop = document.createElement('div');
    backdrop.className = 'admin-nav-backdrop';
    backdrop.id = 'admin-nav-backdrop';
    document.body.appendChild(backdrop);

    const head = host.firstElementChild;
    if (head) {
      head.classList.add('admin-sidebar-head');
      const close = document.createElement('button');
      close.type = 'button';
      close.className = 'admin-sidebar-close';
      close.setAttribute('aria-label', 'Close menu');
      close.innerHTML = '<i class="fas fa-times"></i>';
      head.appendChild(close);
      close.addEventListener('click', () => setNav(false));
    }

    document.getElementById('admin-menu-btn').addEventListener('click', () => setNav(!document.body.classList.contains('admin-nav-open')));
    backdrop.addEventListener('click', () => setNav(false));
    host.addEventListener('click', (e) => { if (e.target.closest('a[href]')) setNav(false); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setNav(false); });
    window.addEventListener('resize', () => { if (window.innerWidth >= 1024) setNav(false); });
    watchTables();
  }

  function init() {
    const host = document.getElementById('admin-sidebar');
    if (host) {
      renderSidebar(host);
      installMobileNav(host);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Expose for debugging
  window.AdminSidebar = { render: renderSidebar };
})();
