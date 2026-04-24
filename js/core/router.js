import { state } from './state.js';
import { loadOverview }   from '../pages/overview.js';
import { loadLogin }      from '../pages/login.js';
import { loadFriends }    from '../pages/friends.js';
import { loadIndividual } from '../pages/individual.js';
import { loadTorneo }     from '../pages/torneo.js';
import { loadVersus }     from '../pages/versus.js';

const routes = {
  overview:   loadOverview,
  login:      loadLogin,
  friends:    loadFriends,
  individual: loadIndividual,
  torneo:     loadTorneo,
  versus:     loadVersus
};

const pagesWithSidebar = ['overview', 'individual', 'friends', 'torneo', 'versus'];

export function initRouter() {
  window.navigate = navigate;

  window.navigateFromSidebar = function(page) {
    closeSidebar();
    navigate(page);
  };

  window.toggleSidebar = function() {
    document.getElementById('sidebar').classList.toggle('open');
    document.getElementById('sidebarOverlay').classList.toggle('open');
  };

  window.closeSidebar = function() {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebarOverlay').classList.remove('open');
  };
}

export function navigate(page) {
  if (!routes[page]) {
    console.warn(`Página no encontrada: ${page}`);
    return;
  }

  state.ui.currentPage = page;

  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));

  const el = document.querySelector(`.page[data-page="${page}"]`);
  if (el) el.classList.add('active');

  const hasSidebar = pagesWithSidebar.includes(page);
  document.getElementById('sidebar').style.display    = hasSidebar ? '' : 'none';
  document.getElementById('topbar').style.display     = hasSidebar ? '' : 'none';
  document.querySelector('.main-wrap').classList.toggle('with-sidebar', hasSidebar);

  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.page === page);
  });

  if (hasSidebar && state.currentUser) {
    document.getElementById('sidebarUser').innerHTML = `
      <img src="${state.currentUser.avatar}" class="sidebar-avatar">
      <div>
        <div class="sidebar-uname">${state.currentUser.name}</div>
        <div class="sidebar-umeta">${state.currentUser.handle}</div>
      </div>
    `;
  }

  routes[page]();
}