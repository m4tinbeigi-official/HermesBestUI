/**
 * HermesBestUI - Interactive Chat Project Hub & Messages Accordion
 * Manages projects directly inside the chat section with collapsible project chats and messages.
 */

let _projectHubOpen = false;
let _projectMessagesCache = {}; // sid -> messages array
let _expandedProjectSids = new Set();
let _projectPickerOpen = false;

const PROJECT_PALETTE = [
  '#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6',
  '#06b6d4', '#6366f1', '#14b8a6', '#f97316', '#a855f7'
];

function _esc(s) {
  if (!s) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function _getActiveProjectId() {
  if (typeof _activeProject !== 'undefined' && _activeProject && _activeProject !== 'NO_PROJECT') {
    return _activeProject;
  }
  if (typeof S !== 'undefined' && S.session && S.session.project_id) {
    return S.session.project_id;
  }
  return null;
}

function _getActiveProjectObj() {
  const pid = _getActiveProjectId();
  const list = (typeof _allProjects !== 'undefined' && Array.isArray(_allProjects)) ? _allProjects : [];
  if (pid) {
    const found = list.find(p => p.project_id === pid);
    if (found) return found;
  }
  return null;
}

function _getProjectSessions(projectId) {
  const sessions = (typeof S !== 'undefined' && Array.isArray(S.sessions)) ? S.sessions : [];
  if (!projectId) {
    return sessions;
  }
  return sessions.filter(s => s.project_id === projectId);
}

function updateChatProjectHub() {
  const hub = document.getElementById('chatProjectHub');
  if (!hub) return;

  const currentProj = _getActiveProjectObj();
  const pid = currentProj ? currentProj.project_id : null;
  const sessions = _getProjectSessions(pid);

  const nameEl = document.getElementById('chatProjectName');
  const dotEl = document.getElementById('chatProjectDot');
  const countEl = document.getElementById('chatProjectCountBadge');
  const toggleBtnLabel = document.getElementById('btnToggleProjectChatsLabel');

  if (currentProj) {
    if (nameEl) nameEl.textContent = currentProj.name || 'پروژه';
    if (dotEl) {
      dotEl.style.background = currentProj.color || '#3b82f6';
      dotEl.style.display = 'inline-block';
    }
    if (countEl) countEl.textContent = `${sessions.length} گفتگو`;
    if (toggleBtnLabel) toggleBtnLabel.textContent = `پیام‌ها و چت‌های پروژه (${sessions.length})`;
  } else {
    if (nameEl) nameEl.textContent = 'تمام گفتگوها (عمومی)';
    if (dotEl) dotEl.style.display = 'none';
    if (countEl) countEl.textContent = `${sessions.length} گفتگو`;
    if (toggleBtnLabel) toggleBtnLabel.textContent = `مدیریت چت‌ها (${sessions.length})`;
  }

  if (_projectHubOpen) {
    renderProjectChatsList();
  }
}

function toggleProjectChatsPanel(force) {
  const panel = document.getElementById('chatProjectPanel');
  const btn = document.getElementById('btnToggleProjectChats');
  if (!panel) return;

  _projectHubOpen = typeof force === 'boolean' ? force : !_projectHubOpen;
  panel.style.display = _projectHubOpen ? 'flex' : 'none';
  if (btn) btn.classList.toggle('active', _projectHubOpen);

  if (_projectHubOpen) {
    renderProjectChatsList();
  }
}

function renderProjectChatsList() {
  const container = document.getElementById('chatProjectChatsList');
  if (!container) return;

  const currentProj = _getActiveProjectObj();
  const pid = currentProj ? currentProj.project_id : null;
  const sessions = _getProjectSessions(pid);

  const titleText = document.getElementById('chatProjectPanelTitleText');
  const subText = document.getElementById('chatProjectPanelSub');
  if (titleText) {
    titleText.textContent = currentProj ? `گفتگوهای پروژه ${currentProj.name}` : 'تمام گفتگوهای فعال';
  }
  if (subText) {
    subText.textContent = `شامل ${sessions.length} چت؛ با کلیک روی هر چت پیام‌های آن باز و بسته می‌شوند`;
  }

  if (sessions.length === 0) {
    container.innerHTML = `
      <div class="proj-chats-empty">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="opacity:0.4;margin-bottom:8px">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
        <div>هنوز گفتگویی در این پروژه ثبت نشده است.</div>
        <button type="button" class="sm-btn" style="margin-top:10px;background:var(--accent);color:#fff" onclick="quickCreateProjectSession()">
          + شروع اولین گفتگو در این پروژه
        </button>
      </div>
    `;
    return;
  }

  const currentSid = (typeof S !== 'undefined' && S.session && S.session.session_id) ? S.session.session_id : null;

  container.innerHTML = sessions.map(s => {
    const sid = s.session_id;
    const isExpanded = _expandedProjectSids.has(sid);
    const isActive = (sid === currentSid);
    const count = s.message_count || (s.messages ? s.messages.length : 0) || 0;
    const d = s.updated_at || s.created_at;
    const timeStr = d ? (typeof _formatDate === 'function' ? _formatDate(d) : new Date(d * 1000).toLocaleString('fa-IR')) : '';

    return `
      <div class="proj-chat-card ${isExpanded ? 'expanded' : ''} ${isActive ? 'is-active-session' : ''}" id="projCard_${sid}">
        <div class="proj-chat-card-head" onclick="toggleSingleChatMessages('${sid}')">
          <div class="proj-chat-head-start">
            <span class="proj-chat-chevron" id="projChev_${sid}">${isExpanded ? '▾' : '▸'}</span>
            <span class="proj-chat-icon">💬</span>
            <span class="proj-chat-title" title="${_esc(s.name || 'گفتگوی بدون عنوان')}">${_esc(s.name || 'گفتگوی بدون عنوان')}</span>
            ${isActive ? '<span class="proj-chat-current-badge">چت در حال نمایش</span>' : ''}
          </div>
          <div class="proj-chat-head-end" onclick="event.stopPropagation()">
            <span class="proj-chat-meta-badge">${count} پیام</span>
            <span class="proj-chat-date">${timeStr}</span>
            <button type="button" class="sm-btn proj-chat-switch-btn" onclick="loadSession('${sid}'); toggleProjectChatsPanel(false);" title="انتقال به این گفتگو در صفحه پیام‌ها">
              ادامه در چت ↵
            </button>
          </div>
        </div>
        <div class="proj-chat-msgs-container" id="projMsgs_${sid}" style="${isExpanded ? 'display:block' : 'display:none'}">
          <div class="proj-chat-msgs-loading" id="projMsgsLoading_${sid}">
            <div class="loading-spinner" style="width:14px;height:14px;border-width:2px"></div>
            <span>در حال فراخوانی پیام‌ها...</span>
          </div>
          <div class="proj-chat-msgs-content" id="projMsgsContent_${sid}"></div>
        </div>
      </div>
    `;
  }).join('');

  // Re-populate messages for already expanded cards
  sessions.forEach(s => {
    if (_expandedProjectSids.has(s.session_id)) {
      _loadAndDisplayChatMessages(s.session_id);
    }
  });
}

async function toggleSingleChatMessages(sid, force) {
  const container = document.getElementById(`projMsgs_${sid}`);
  const chev = document.getElementById(`projChev_${sid}`);
  const card = document.getElementById(`projCard_${sid}`);
  if (!container) return;

  const willExpand = typeof force === 'boolean' ? force : (container.style.display === 'none');
  container.style.display = willExpand ? 'block' : 'none';
  if (chev) chev.textContent = willExpand ? '▾' : '▸';
  if (card) card.classList.toggle('expanded', willExpand);

  if (willExpand) {
    _expandedProjectSids.add(sid);
    await _loadAndDisplayChatMessages(sid);
  } else {
    _expandedProjectSids.delete(sid);
  }
}

async function _loadAndDisplayChatMessages(sid) {
  const loading = document.getElementById(`projMsgsLoading_${sid}`);
  const content = document.getElementById(`projMsgsContent_${sid}`);
  if (!content) return;

  // Check if messages already cached in memory
  if (_projectMessagesCache[sid]) {
    if (loading) loading.style.display = 'none';
    _renderMessagesListInto(content, _projectMessagesCache[sid], sid);
    return;
  }

  // Check if current active session
  if (typeof S !== 'undefined' && S.session && S.session.session_id === sid && Array.isArray(S.session.messages)) {
    _projectMessagesCache[sid] = S.session.messages;
    if (loading) loading.style.display = 'none';
    _renderMessagesListInto(content, S.session.messages, sid);
    return;
  }

  // Fetch from API
  try {
    if (loading) loading.style.display = 'flex';
    const res = await api(`/api/sessions/${sid}`);
    const msgs = (res && res.session && Array.isArray(res.session.messages)) ? res.session.messages : [];
    _projectMessagesCache[sid] = msgs;
    if (loading) loading.style.display = 'none';
    _renderMessagesListInto(content, msgs, sid);
  } catch (err) {
    if (loading) loading.style.display = 'none';
    content.innerHTML = `<div style="color:#ef4444;font-size:11.5px;padding:8px 12px">خطا در بارگذاری پیام‌ها: ${err.message || err}</div>`;
  }
}

function _renderMessagesListInto(targetEl, messages, sid) {
  if (!messages || messages.length === 0) {
    targetEl.innerHTML = `
      <div style="color:var(--muted);font-size:12px;padding:12px;text-align:center">
        هنوز پیامی در این گفتگو ارسال نشده است.
      </div>
    `;
    return;
  }

  const renderedHtml = messages.map((m, idx) => {
    const role = m.role || 'user';
    const isUser = (role === 'user');
    let text = '';
    if (typeof m.content === 'string') {
      text = m.content;
    } else if (Array.isArray(m.content)) {
      text = m.content.map(p => (p && typeof p.text === 'string' ? p.text : '')).join('');
    }

    // Strip internal workspace / tool metadata
    text = text.replace(/^\[Workspace::v\d+:[^\]]+\]\s*/i, '').trim();
    if (!text && !m.tool_calls) return '';

    const roleName = isUser ? 'شما' : 'هرمس';
    const mdRendered = (typeof renderMd === 'function' && !isUser) ? renderMd(text) : _esc(text);

    return `
      <div class="proj-msg-bubble ${isUser ? 'user-bubble' : 'assistant-bubble'}">
        <div class="proj-msg-role-tag">${roleName}</div>
        <div class="proj-msg-body">${mdRendered}</div>
      </div>
    `;
  }).filter(Boolean).join('');

  targetEl.innerHTML = `
    <div class="proj-msgs-inner-scroll">
      ${renderedHtml}
    </div>
    <div class="proj-msgs-footer-bar">
      <button type="button" class="sm-btn" onclick="loadSession('${sid}'); toggleProjectChatsPanel(false);" style="background:var(--accent);color:#fff;font-size:11px;padding:3px 10px">
        ادامه این گفتگو ↵
      </button>
      <button type="button" class="sm-btn" onclick="toggleSingleChatMessages('${sid}', false)" style="font-size:11px;padding:3px 8px">
        بستن پیام‌ها ▲
      </button>
    </div>
  `;
}

function toggleAllProjectChatMessages(expand) {
  const currentProj = _getActiveProjectObj();
  const pid = currentProj ? currentProj.project_id : null;
  const sessions = _getProjectSessions(pid);

  sessions.forEach(s => {
    toggleSingleChatMessages(s.session_id, expand);
  });
}

function toggleProjectPickerInChat(e) {
  if (e) e.stopPropagation();
  let menu = document.getElementById('chatProjectPickerDropdown');

  if (menu) {
    menu.remove();
    _projectPickerOpen = false;
    return;
  }

  const badge = document.getElementById('chatProjectBadge');
  if (!badge) return;

  const rect = badge.getBoundingClientRect();
  menu = document.createElement('div');
  menu.id = 'chatProjectPickerDropdown';
  menu.className = 'chat-project-picker-dropdown';
  menu.style.top = `${rect.bottom + 6}px`;
  menu.style.left = `${rect.left}px`;

  const projects = (typeof _allProjects !== 'undefined' && Array.isArray(_allProjects)) ? _allProjects : [];
  const currentPid = _getActiveProjectId();

  menu.innerHTML = `
    <div class="chat-proj-picker-head">انتخاب یا ایجاد پروژه</div>
    <div class="chat-proj-picker-item ${!currentPid ? 'active' : ''}" onclick="selectProjectFromChat(null)">
      <span class="proj-item-dot" style="background:#71717a"></span>
      <span>همه گفتگوها (عمومی)</span>
      ${!currentPid ? '<span class="proj-item-check">✓</span>' : ''}
    </div>
    <div class="chat-proj-picker-divider"></div>
    ${projects.map(p => `
      <div class="chat-proj-picker-item ${p.project_id === currentPid ? 'active' : ''}" onclick="selectProjectFromChat('${p.project_id}')">
        <span class="proj-item-dot" style="background:${p.color || '#3b82f6'}"></span>
        <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${_esc(p.name)}</span>
        ${p.project_id === currentPid ? '<span class="proj-item-check">✓</span>' : ''}
      </div>
    `).join('')}
    <div class="chat-proj-picker-divider"></div>
    <div class="chat-proj-picker-item create-new" onclick="promptCreateNewProjectInChat()">
      <span style="font-size:14px">+</span>
      <span style="font-weight:600">ایجاد پروژه جدید</span>
    </div>
  `;

  document.body.appendChild(menu);
  _projectPickerOpen = true;

  const closeHandler = (ev) => {
    if (!menu.contains(ev.target) && ev.target !== badge && !badge.contains(ev.target)) {
      menu.remove();
      _projectPickerOpen = false;
      document.removeEventListener('click', closeHandler);
    }
  };
  setTimeout(() => document.addEventListener('click', closeHandler), 10);
}

function selectProjectFromChat(projectId) {
  const menu = document.getElementById('chatProjectPickerDropdown');
  if (menu) menu.remove();
  _projectPickerOpen = false;

  if (typeof _setActiveProjectFilter === 'function') {
    _setActiveProjectFilter(projectId);
  }
  updateChatProjectHub();
}

async function promptCreateNewProjectInChat() {
  const menu = document.getElementById('chatProjectPickerDropdown');
  if (menu) menu.remove();
  _projectPickerOpen = false;

  const name = prompt('نام پروژه جدید را وارد کنید:');
  if (!name || !name.trim()) return;

  const cleanName = name.trim();
  const color = PROJECT_PALETTE[Math.floor(Math.random() * PROJECT_PALETTE.length)];

  try {
    const res = await api('/api/projects/create', {
      method: 'POST',
      body: JSON.stringify({ name: cleanName, color })
    });
    if (res && res.ok && res.project) {
      if (typeof _allProjects !== 'undefined' && Array.isArray(_allProjects)) {
        _allProjects.push(res.project);
      }
      if (typeof _setActiveProjectFilter === 'function') {
        _setActiveProjectFilter(res.project.project_id);
      }
      updateChatProjectHub();
      if (typeof newSession === 'function') {
        await newSession({ project_id: res.project.project_id });
      }
    } else {
      alert('خطا در ساخت پروژه: ' + (res.error || 'ناشناخته'));
    }
  } catch (err) {
    alert('خطا در ایجاد پروژه: ' + (err.message || err));
  }
}

async function quickCreateProjectSession() {
  const currentProj = _getActiveProjectObj();
  if (currentProj) {
    if (typeof newSession === 'function') {
      await newSession({ project_id: currentProj.project_id });
    }
    toggleProjectChatsPanel(false);
  } else {
    promptCreateNewProjectInChat();
  }
}

// Global hook: update project hub whenever sessions list or active session updates
window.updateChatProjectHub = updateChatProjectHub;

document.addEventListener('DOMContentLoaded', () => {
  setTimeout(updateChatProjectHub, 500);
});
