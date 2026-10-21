/**
 * 9Router Management & Integration for Hermes WebUI
 */

let _nineRouterTab = 'accounts'; // 'accounts' | 'proxies' | 'usage' | 'models' | 'clitools'
let _nineRouterState = {
  status: null,
  providers: [],
  proxyPools: [],
  models: [],
  usage: null,
  cliTools: null,
  activeAuthSession: null,
  loading: false
};

async function loadNineRouterPanel(force = false) {
  const container = document.getElementById('nineRouterContent');
  if (!container) return;

  if (_nineRouterState.loading && !force) return;
  _nineRouterState.loading = true;

  container.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:center;padding:48px 0;color:var(--muted);gap:10px">
      <svg class="spinner-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/><polyline points="21 3 21 9 15 9"/></svg>
      <span>در حال بررسی وضعیت ۹روتر...</span>
    </div>
  `;

  try {
    const status = await api('/api/9router/status');
    _nineRouterState.status = status;

    const navBadge = document.getElementById('nineRouterNavBadge');
    if (navBadge) {
      if (status && status.running) {
        navBadge.style.display = 'inline-block';
        navBadge.textContent = 'فعال';
        navBadge.style.background = '#10b981';
      } else {
        navBadge.style.display = 'none';
      }
    }

    if (!status || !status.running) {
      renderNineRouterOffline(container, status);
      return;
    }

    // Fetch providers, proxy pools, models, and usage in parallel
    const [providersRes, proxyRes, modelsRes, usageRes, toolsRes] = await Promise.all([
      api('/api/9router/providers').catch(() => ({ connections: [] })),
      api('/api/9router/proxy-pools').catch(() => ({ proxyPools: [] })),
      api('/api/9router/models').catch(() => ({ data: [] })),
      api('/api/9router/usage').catch(() => null),
      api('/api/9router/cli-tools').catch(() => null)
    ]);

    _nineRouterState.providers = providersRes.connections || [];
    _nineRouterState.proxyPools = proxyRes.proxyPools || [];
    _nineRouterState.models = modelsRes.data || [];
    _nineRouterState.usage = usageRes;
    _nineRouterState.cliTools = toolsRes;

    renderNineRouterUI(container);
  } catch (err) {
    container.innerHTML = `
      <div style="padding:20px;border-radius:8px;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);color:var(--text);font-size:13px">
        <div style="font-weight:600;color:#ef4444;margin-bottom:6px">خطا در برقراری ارتباط با سرویس ۹روتر</div>
        <div>${esc(err.message || String(err))}</div>
        <button class="sm-btn" onclick="loadNineRouterPanel(true)" style="margin-top:12px">تلاش مجدد</button>
      </div>
    `;
  } finally {
    _nineRouterState.loading = false;
  }
}

function renderNineRouterOffline(container, status) {
  const isInstalled = status && status.installed;
  container.innerHTML = `
    <div style="padding:28px 20px;border-radius:12px;background:var(--card-bg, var(--surface));border:1px solid var(--border);text-align:center">
      <div style="width:48px;height:48px;border-radius:24px;background:rgba(239,68,68,0.12);display:inline-flex;align-items:center;justify-content:center;color:#ef4444;margin-bottom:12px">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      </div>
      <div style="font-size:16px;font-weight:700;margin-bottom:6px">سرویس ۹روتر در حال اجرا نیست</div>
      <p style="font-size:13px;color:var(--muted);max-width:480px;margin:0 auto 16px;line-height:1.6">
        ${isInstalled 
          ? 'سرویس ۹روتر روی پورت 20128 شناسایی نشد. لطفاً بررسی کنید که دیمن ۹روتر اجرا شده باشد.'
          : 'بسته ۹روتر نصب یا راه‌اندازی نشده است.'}
      </p>
      <div style="display:flex;justify-content:center;gap:10px">
        <button class="sm-btn" onclick="loadNineRouterPanel(true)" style="padding:8px 18px;font-weight:600">بررسی مجدد اتصال</button>
      </div>
    </div>
  `;
}

function renderNineRouterUI(container) {
  const st = _nineRouterState.status || {};
  const isConnected = st.hermesConnected;

  let html = `
    <!-- Top System Card -->
    <div style="padding:16px;border-radius:12px;background:var(--card-bg, var(--surface));border:1px solid var(--border);display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px">
      <div style="display:flex;align-items:center;gap:12px">
        <div style="width:12px;height:12px;border-radius:50%;background:#10b981;box-shadow:0 0 8px rgba(16,185,129,0.6)"></div>
        <div>
          <div style="font-size:14px;font-weight:700;display:flex;align-items:center;gap:8px">
            <span>سرویس ۹روتر فعال</span>
            <span style="font-size:11px;font-family:monospace;padding:1px 6px;border-radius:4px;background:var(--input-bg);color:var(--muted)">127.0.0.1:${st.port || 20128}</span>
          </div>
          <div style="font-size:12px;color:var(--muted);margin-top:2px;display:flex;gap:14px">
            <span>اکانت‌ها: <b>${_nineRouterState.providers.length}</b></span>
            <span>پروکسی‌ها: <b>${_nineRouterState.proxyPools.length}</b></span>
            <span>مدل‌های فعال: <b>${st.activeModels || 0}</b></span>
          </div>
        </div>
      </div>

      <div style="display:flex;align-items:center;gap:8px">
        <button class="sm-btn" onclick="kickstart9Router()" title="رفع خطای 429 و پاکسازی کش سهمیه" style="display:flex;align-items:center;gap:6px;padding:6px 12px;color:#eab308;border-color:rgba(234,179,8,0.3)">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 4v6h-6"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
          <span>پاکسازی سهمیه / ۴۲۹</span>
        </button>
        ${isConnected ? `
          <div style="display:flex;align-items:center;gap:6px;font-size:12px;font-weight:600;color:#10b981;padding:6px 12px;border-radius:6px;background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.25)">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
            <span>هرمس به ۹روتر متصل است</span>
          </div>
        ` : `
          <button class="sm-btn" onclick="connectHermesTo9Router()" style="background:var(--accent);color:#fff;border-color:var(--accent);font-weight:600;padding:6px 12px">
            اتصال هرمس به ۹روتر
          </button>
        `}
      </div>
    </div>

    <!-- Active Model Switcher Banner -->
    <div style="padding:10px 14px;border-radius:8px;background:var(--input-bg);border:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px">
      <div style="display:flex;align-items:center;gap:8px">
        <span style="font-size:12px;font-weight:600;color:var(--muted)">مدل فعال هرمس در ۹روتر:</span>
        <code style="font-size:12px;font-weight:700;color:var(--accent);direction:ltr">${esc(st.hermesActiveModel || 'نامشخص')}</code>
      </div>
      <div style="display:flex;align-items:center;gap:8px">
        <select id="quickModelSelect" dir="ltr" style="padding:5px 8px;font-size:12px;border-radius:6px;background:var(--card-bg, var(--surface));border:1px solid var(--border2);color:var(--text)">
          <optgroup label="مدل‌های محبوب Antigravity">
            <option value="ag/gemini-3.8-flash-medium">ag/gemini-3.8-flash-medium (پیش‌فرض)</option>
            <option value="ag/gemini-3.8-flash-high">ag/gemini-3.8-flash-high</option>
            <option value="ag/claude-sonnet-4-6">ag/claude-sonnet-4-6</option>
            <option value="ag/claude-opus-5-5-high">ag/claude-opus-5-5-high</option>
            <option value="ag/claude-opus-4-6-thinking">ag/claude-opus-4-6-thinking</option>
          </optgroup>
          <optgroup label="سایر مدل‌های فعال ۹روتر">
            ${_nineRouterState.models.slice(0, 40).map(m => `<option value="${esc(m.id)}">${esc(m.id)}</option>`).join('')}
          </optgroup>
        </select>
        <button class="sm-btn" onclick="switchActiveModel()" style="padding:5px 12px;font-weight:600">تغییر مدل</button>
      </div>
    </div>

    <!-- Navigation Tabs -->
    <div style="display:flex;border-bottom:1px solid var(--border);gap:4px;margin-top:4px;overflow-x:auto">
      <button type="button" class="sm-btn" onclick="switchNineRouterTab('accounts')" 
              style="border-bottom-left-radius:0;border-bottom-right-radius:0;border-bottom:none;padding:8px 16px;font-weight:600;background:${_nineRouterTab==='accounts' ? 'var(--card-bg, var(--surface))' : 'transparent'};color:${_nineRouterTab==='accounts' ? 'var(--text)' : 'var(--muted)'};border-color:${_nineRouterTab==='accounts' ? 'var(--border)' : 'transparent'}">
        اکانت‌ها (${_nineRouterState.providers.length})
      </button>
      <button type="button" class="sm-btn" onclick="switchNineRouterTab('proxies')" 
              style="border-bottom-left-radius:0;border-bottom-right-radius:0;border-bottom:none;padding:8px 16px;font-weight:600;background:${_nineRouterTab==='proxies' ? 'var(--card-bg, var(--surface))' : 'transparent'};color:${_nineRouterTab==='proxies' ? 'var(--text)' : 'var(--muted)'};border-color:${_nineRouterTab==='proxies' ? 'var(--border)' : 'transparent'}">
        پروکسی‌ها (${_nineRouterState.proxyPools.length})
      </button>
      <button type="button" class="sm-btn" onclick="switchNineRouterTab('usage')" 
              style="border-bottom-left-radius:0;border-bottom-right-radius:0;border-bottom:none;padding:8px 16px;font-weight:600;background:${_nineRouterTab==='usage' ? 'var(--card-bg, var(--surface))' : 'transparent'};color:${_nineRouterTab==='usage' ? 'var(--text)' : 'var(--muted)'};border-color:${_nineRouterTab==='usage' ? 'var(--border)' : 'transparent'}">
        آمار مصرف و سهمیه
      </button>
      <button type="button" class="sm-btn" onclick="switchNineRouterTab('clitools')" 
              style="border-bottom-left-radius:0;border-bottom-right-radius:0;border-bottom:none;padding:8px 16px;font-weight:600;background:${_nineRouterTab==='clitools' ? 'var(--card-bg, var(--surface))' : 'transparent'};color:${_nineRouterTab==='clitools' ? 'var(--text)' : 'var(--muted)'};border-color:${_nineRouterTab==='clitools' ? 'var(--border)' : 'transparent'}">
        کلاینت‌ها (Claude / OpenCode)
      </button>
    </div>

    <!-- Tab Content -->
    <div id="nineRouterTabContent">
      ${_nineRouterTab === 'accounts' ? renderNineRouterAccountsTab() : 
        _nineRouterTab === 'proxies' ? renderNineRouterProxiesTab() :
        _nineRouterTab === 'usage' ? renderNineRouterUsageTab() :
        renderNineRouterCliToolsTab()}
    </div>
  `;

  container.innerHTML = html;
}

function switchNineRouterTab(tab) {
  _nineRouterTab = tab;
  const container = document.getElementById('nineRouterContent');
  if (container) renderNineRouterUI(container);
}

// ── ACCOUNTS TAB ─────────────────────────────────────────────────────────────

function renderNineRouterAccountsTab() {
  const conns = _nineRouterState.providers;
  const session = _nineRouterState.activeAuthSession;

  let html = `
    <div style="display:flex;flex-direction:column;gap:14px;margin-top:8px">
      <!-- Quick Login Buttons -->
      <div style="padding:14px;border-radius:10px;background:var(--card-bg, var(--surface));border:1px solid var(--border)">
        <div style="font-size:13px;font-weight:700;margin-bottom:10px;display:flex;align-items:center;gap:6px">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
          <span>افزودن و لاگین اکانت جدید در ۹روتر</span>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:8px">
          <button class="sm-btn" onclick="startOAuthFlow('antigravity', 'Google Antigravity')" style="display:flex;align-items:center;gap:6px;padding:8px 14px;font-weight:600">
            <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#3b82f6"></span>
            <span>+ Antigravity (Google / Gemini)</span>
          </button>
          <button class="sm-btn" onclick="startOAuthFlow('claude', 'Claude Code')" style="display:flex;align-items:center;gap:6px;padding:8px 14px;font-weight:600">
            <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#d97706"></span>
            <span>+ Claude Code (Anthropic)</span>
          </button>
          <button class="sm-btn" onclick="startOAuthFlow('codex', 'OpenAI Codex')" style="display:flex;align-items:center;gap:6px;padding:8px 14px;font-weight:600">
            <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#10b981"></span>
            <span>+ OpenAI Codex (ChatGPT Plus / Token)</span>
          </button>
          <button class="sm-btn" onclick="startOAuthFlow('xai', 'xAI Grok')" style="display:flex;align-items:center;gap:6px;padding:8px 14px;font-weight:600">
            <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#8b5cf6"></span>
            <span>+ xAI (Grok)</span>
          </button>
        </div>

        <!-- Active Login Session Card -->
        ${session ? renderActiveAuthSession(session) : ''}
      </div>

      <!-- Accounts List -->
      <div style="display:flex;flex-direction:column;gap:8px">
        <div style="font-size:13px;font-weight:700;display:flex;justify-content:space-between;align-items:center">
          <span>اکانت‌های متصل (${conns.length})</span>
        </div>

        ${conns.length === 0 ? `
          <div style="text-align:center;padding:32px 0;color:var(--muted);font-size:13px;background:var(--card-bg, var(--surface));border:1px dashed var(--border);border-radius:8px">
            هیچ اکانتی هنوز در ۹روتر ثبت نشده است. از دکمه‌های بالا برای افزودن اکانت استفاده کنید.
          </div>
        ` : conns.map((conn, idx) => renderConnectionCard(conn, idx)).join('')}
      </div>
    </div>
  `;
  return html;
}

function renderActiveAuthSession(session) {
  return `
    <div style="margin-top:14px;padding:14px;border-radius:8px;background:var(--input-bg);border:1px solid var(--accent);display:flex;flex-direction:column;gap:10px">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div style="font-size:13px;font-weight:700;color:var(--accent)">
          احراز هویت: ${esc(session.providerTitle || session.provider)}
        </div>
        <button class="icon-btn" onclick="cancelAuthSession()" title="انصراف" style="font-size:12px;padding:2px 8px">✕ انصراف</button>
      </div>

      <div style="font-size:12px;line-height:1.6;color:var(--text)">
        <b>مرحله ۱:</b> روی دکمه زیر کلیک کنید تا صفحه ورود در تب جدید باز شود و وارد اکانت خود شوید:
      </div>

      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <a href="${esc(session.authUrl)}" target="_blank" rel="noopener noreferrer" class="sm-btn" 
           style="background:var(--accent);color:#fff;border-color:var(--accent);font-weight:600;padding:7px 14px;text-decoration:none;display:inline-flex;align-items:center;gap:6px">
          <span>باز کردن صفحه لاگین ↗</span>
        </a>
        <button class="sm-btn" onclick="copyTextToClipboard('${esc(session.authUrl)}')" type="button">کپی لینک ورود</button>
      </div>

      <div style="font-size:12px;line-height:1.6;color:var(--text);margin-top:4px">
        <b>مرحله ۲:</b> پس از تایید دسترسی در مرورگر، آدرس نهایی نوار آدرس مرورگر (Callback URL) یا کد بازگشتی را در کادر زیر جای‌گذاری کنید:
      </div>

      <div style="display:flex;gap:8px;align-items:center">
        <input type="text" id="nineRouterAuthCodeInput" dir="ltr" placeholder="http://localhost:20128/callback?code=... یا کد تایید یا توکن JWT" 
               style="flex:1;padding:8px 10px;font-size:12px;font-family:monospace;border-radius:6px;border:1px solid var(--border2);background:var(--card-bg, var(--surface));color:var(--text)">
        <button class="sm-btn" id="nineRouterCompleteLoginBtn" onclick="submitAuthCode()" style="background:#10b981;color:#fff;border-color:#10b981;font-weight:600;padding:8px 16px">
          تایید و ثبت اکانت
        </button>
      </div>
      <div id="nineRouterAuthStatus" style="font-size:12px"></div>
    </div>
  `;
}

function renderConnectionCard(conn, idx) {
  const provider = conn.provider || 'unknown';
  const name = conn.name || conn.email || conn.displayName || `Connection #${idx + 1}`;
  const isActive = conn.isActive !== false;
  const status = conn.testStatus || 'unknown';
  const isOk = status === 'active';
  const isErr = status === 'error' || status === 'unavailable';

  let providerColor = '#6b7280';
  let providerLabel = provider;
  if (provider === 'antigravity') { providerColor = '#3b82f6'; providerLabel = 'Antigravity'; }
  else if (provider === 'claude') { providerColor = '#d97706'; providerLabel = 'Claude'; }
  else if (provider === 'codex') { providerColor = '#10b981'; providerLabel = 'Codex'; }
  else if (provider === 'xai') { providerColor = '#8b5cf6'; providerLabel = 'xAI'; }
  else if (provider.includes('houshyar24')) { providerColor = '#f59e0b'; providerLabel = 'Houshyar24'; }
  else if (provider.includes('manageit')) { providerColor = '#06b6d4'; providerLabel = 'ManageIt'; }

  return `
    <div style="padding:12px 14px;border-radius:8px;background:var(--card-bg, var(--surface));border:1px solid var(--border);display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px">
      <div style="display:flex;align-items:center;gap:10px;min-width:200px">
        <span style="font-size:11px;font-weight:700;padding:2px 8px;border-radius:4px;background:${providerColor}20;color:${providerColor};border:1px solid ${providerColor}40">
          ${esc(providerLabel)}
        </span>
        <div>
          <div style="font-size:13px;font-weight:600;font-family:monospace;direction:ltr;text-align:start">
            ${esc(name)}
          </div>
          ${conn.email && conn.email !== name ? `
            <div style="font-size:11px;color:var(--muted);direction:ltr;text-align:start">${esc(conn.email)}</div>
          ` : ''}
        </div>
      </div>

      <div style="display:flex;align-items:center;gap:12px">
        <!-- Status indicator -->
        <div style="display:flex;align-items:center;gap:6px;font-size:11px">
          <span style="width:8px;height:8px;border-radius:50%;background:${isOk ? '#10b981' : isErr ? '#ef4444' : '#eab308'}"></span>
          <span style="color:var(--muted)">${isOk ? 'فعال' : isErr ? 'خطا / نامعتبر' : 'بررسی نشده'}</span>
        </div>

        <!-- Active Toggle -->
        <label style="display:inline-flex;align-items:center;gap:4px;font-size:11px;cursor:pointer">
          <input type="checkbox" ${isActive ? 'checked' : ''} onchange="toggleProviderActive('${esc(conn.id)}', this.checked)">
          <span>روشن</span>
        </label>

        <!-- Actions -->
        <button class="sm-btn" onclick="testProviderConnection('${esc(conn.id)}', this)" style="padding:4px 10px;font-size:11px">
          تست
        </button>
        <button class="sm-btn danger" onclick="deleteProviderConnection('${esc(conn.id)}', '${esc(name)}')" style="padding:4px 8px;font-size:11px;color:#ef4444">
          حذف
        </button>
      </div>
    </div>
  `;
}

// ── PROXY POOLS TAB ──────────────────────────────────────────────────────────

let _showAddProxyForm = false;

function renderNineRouterProxiesTab() {
  const pools = _nineRouterState.proxyPools;

  let html = `
    <div style="display:flex;flex-direction:column;gap:14px;margin-top:8px">
      <!-- Header Actions -->
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div style="font-size:13px;font-weight:700">پروکسی‌ها و رله‌های خروجی ۹روتر (${pools.length})</div>
        <button class="sm-btn" onclick="toggleAddProxyForm()" style="background:var(--accent);color:#fff;border-color:var(--accent);font-weight:600;padding:6px 14px">
          ${_showAddProxyForm ? 'بستن فرم' : '+ افزودن پروکسی جدید'}
        </button>
      </div>

      <!-- Add Proxy Form -->
      ${_showAddProxyForm ? `
        <div style="padding:16px;border-radius:10px;background:var(--card-bg, var(--surface));border:1px solid var(--accent);display:flex;flex-direction:column;gap:12px">
          <div style="font-size:13px;font-weight:700;color:var(--accent)">مشخصات پروکسی / رله جدید</div>
          
          <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(220px, 1fr));gap:10px">
            <div>
              <label style="font-size:11px;font-weight:600;display:block;margin-bottom:4px">نام پروکسی</label>
              <input type="text" id="proxyNameInput" placeholder="مثلاً: vercel-relay یا socks5-local" dir="ltr"
                     style="width:100%;padding:8px;font-size:12px;border-radius:6px;border:1px solid var(--border2);background:var(--input-bg);color:var(--text)">
            </div>
            <div>
              <label style="font-size:11px;font-weight:600;display:block;margin-bottom:4px">آدرس پروکسی (URL)</label>
              <input type="text" id="proxyUrlInput" placeholder="https://relay.example.com یا socks5://127.0.0.1:10808" dir="ltr"
                     style="width:100%;padding:8px;font-size:12px;border-radius:6px;border:1px solid var(--border2);background:var(--input-bg);color:var(--text)">
            </div>
            <div>
              <label style="font-size:11px;font-weight:600;display:block;margin-bottom:4px">نوع پروتکل (Type)</label>
              <select id="proxyTypeSelect" style="width:100%;padding:8px;font-size:12px;border-radius:6px;border:1px solid var(--border2);background:var(--input-bg);color:var(--text)">
                <option value="http">HTTP / SOCKS5</option>
                <option value="cloudflare">Cloudflare Worker Relay</option>
                <option value="vercel">Vercel Relay</option>
                <option value="deno">Deno Deploy</option>
                <option value="netlify">Netlify</option>
              </select>
            </div>
          </div>

          <div style="display:flex;align-items:center;gap:14px">
            <label style="display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer">
              <input type="checkbox" id="proxyIsActiveInput" checked>
              <span>فعال باشد</span>
            </label>
            <label style="display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer">
              <input type="checkbox" id="proxyStrictInput">
              <span>Strict Proxy (عدم فال‌بک مستقیم)</span>
            </label>
          </div>

          <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:6px">
            <button class="sm-btn" onclick="toggleAddProxyForm()" type="button">انصراف</button>
            <button class="sm-btn" onclick="submitNewProxyPool()" type="button" style="background:#10b981;color:#fff;border-color:#10b981;font-weight:600;padding:8px 20px">
              ذخیره پروکسی
            </button>
          </div>
        </div>
      ` : ''}

      <!-- Proxy Pools List -->
      <div style="display:flex;flex-direction:column;gap:8px">
        ${pools.length === 0 ? `
          <div style="text-align:center;padding:32px 0;color:var(--muted);font-size:13px;background:var(--card-bg, var(--surface));border:1px dashed var(--border);border-radius:8px">
            هیچ پروکسی یا رله‌ای تعریف نشده است.
          </div>
        ` : pools.map(p => renderProxyPoolCard(p)).join('')}
      </div>
    </div>
  `;
  return html;
}

function renderProxyPoolCard(p) {
  const isOk = p.testStatus === 'active';
  const isErr = p.testStatus === 'error';
  const isActive = p.isActive !== false;

  return `
    <div style="padding:12px 14px;border-radius:8px;background:var(--card-bg, var(--surface));border:1px solid var(--border);display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px">
      <div style="display:flex;align-items:center;gap:10px;min-width:240px">
        <span style="font-size:11px;font-weight:700;padding:2px 8px;border-radius:4px;background:rgba(59,130,246,0.15);color:#3b82f6;border:1px solid rgba(59,130,246,0.3)">
          ${esc(p.type || 'http')}
        </span>
        <div>
          <div style="font-size:13px;font-weight:600;font-family:monospace;direction:ltr;text-align:start">
            ${esc(p.name)}
          </div>
          <div style="font-size:11px;color:var(--muted);direction:ltr;text-align:start;max-width:380px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
            ${esc(p.proxyUrl)}
          </div>
        </div>
      </div>

      <div style="display:flex;align-items:center;gap:12px">
        <div style="display:flex;align-items:center;gap:6px;font-size:11px">
          <span style="width:8px;height:8px;border-radius:50%;background:${isOk ? '#10b981' : isErr ? '#ef4444' : '#eab308'}"></span>
          <span style="color:var(--muted)">${isOk ? 'سالم و فعال' : isErr ? 'خطای اتصال' : 'تست‌نشده'}</span>
        </div>

        <label style="display:inline-flex;align-items:center;gap:4px;font-size:11px;cursor:pointer">
          <input type="checkbox" ${isActive ? 'checked' : ''} onchange="toggleProxyActive('${esc(p.id)}', this.checked)">
          <span>روشن</span>
        </label>

        <button class="sm-btn" onclick="testProxyPool('${esc(p.id)}', this)" style="padding:4px 10px;font-size:11px">
          تست پینگ
        </button>
        <button class="sm-btn danger" onclick="deleteProxyPool('${esc(p.id)}', '${esc(p.name)}')" style="padding:4px 8px;font-size:11px;color:#ef4444">
          حذف
        </button>
      </div>
    </div>
  `;
}

function toggleAddProxyForm() {
  _showAddProxyForm = !_showAddProxyForm;
  const container = document.getElementById('nineRouterContent');
  if (container) renderNineRouterUI(container);
}

// ── USAGE TAB ───────────────────────────────────────────────────────────────

function renderNineRouterUsageTab() {
  const usage = _nineRouterState.usage;
  if (!usage) {
    return `
      <div style="text-align:center;padding:32px 0;color:var(--muted);font-size:13px">
        اطلاعات مصرف در دسترس نیست.
      </div>
    `;
  }

  const byAccount = usage.byAccount || {};
  const accountEntries = Object.entries(byAccount);

  let html = `
    <div style="display:flex;flex-direction:column;gap:14px;margin-top:8px">
      <!-- Summary metrics -->
      <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(180px, 1fr));gap:10px">
        <div style="padding:14px;border-radius:10px;background:var(--card-bg, var(--surface));border:1px solid var(--border)">
          <div style="font-size:11px;color:var(--muted);margin-bottom:4px">تعداد کل درخواست‌ها</div>
          <div style="font-size:20px;font-weight:700;font-family:monospace">${Number(usage.totalRequests || 0).toLocaleString()}</div>
        </div>
        <div style="padding:14px;border-radius:10px;background:var(--card-bg, var(--surface));border:1px solid var(--border)">
          <div style="font-size:11px;color:var(--muted);margin-bottom:4px">توکن‌های پردازش‌شده</div>
          <div style="font-size:20px;font-weight:700;font-family:monospace">${((usage.totalPromptTokens || 0) / 1000000).toFixed(1)}M</div>
        </div>
        <div style="padding:14px;border-radius:10px;background:var(--card-bg, var(--surface));border:1px solid var(--border)">
          <div style="font-size:11px;color:var(--muted);margin-bottom:4px">توکن‌های خروجی (Completion)</div>
          <div style="font-size:20px;font-weight:700;font-family:monospace">${((usage.totalCompletionTokens || 0) / 1000).toFixed(0)}K</div>
        </div>
        <div style="padding:14px;border-radius:10px;background:var(--card-bg, var(--surface));border:1px solid var(--border)">
          <div style="font-size:11px;color:var(--muted);margin-bottom:4px">کش پرامپت (Cached Tokens)</div>
          <div style="font-size:20px;font-weight:700;font-family:monospace;color:#10b981">${((usage.totalCachedTokens || 0) / 1000000).toFixed(1)}M</div>
        </div>
      </div>

      <!-- Account Usage Table -->
      <div style="padding:14px;border-radius:10px;background:var(--card-bg, var(--surface));border:1px solid var(--border)">
        <div style="font-size:13px;font-weight:700;margin-bottom:12px">تفکیک مصرف به تفکیک اکانت‌های متصل</div>
        
        <div style="display:flex;flex-direction:column;gap:8px">
          ${accountEntries.map(([k, acc]) => {
            const accName = acc.accountName || k;
            const reqs = acc.requests || 0;
            const tokens = ((acc.promptTokens || 0) / 1000000).toFixed(1);
            return `
              <div style="padding:10px 12px;border-radius:6px;background:var(--input-bg);display:flex;justify-content:space-between;align-items:center;gap:10px">
                <div style="display:flex;align-items:center;gap:8px">
                  <span style="width:8px;height:8px;border-radius:50%;background:#3b82f6"></span>
                  <span style="font-size:12px;font-weight:600;font-family:monospace;direction:ltr">${esc(accName)}</span>
                </div>
                <div style="display:flex;align-items:center;gap:14px;font-size:12px;font-family:monospace">
                  <span style="color:var(--muted)">درخواست‌ها: <b>${reqs.toLocaleString()}</b></span>
                  <span>حجم توکن: <b>${tokens}M</b></span>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    </div>
  `;
  return html;
}

// ── CLI TOOLS TAB ────────────────────────────────────────────────────────────

function renderNineRouterCliToolsTab() {
  const tools = _nineRouterState.cliTools || {};
  const claude = tools.claude || {};
  const opencode = tools.opencode || {};
  const cline = tools.cline || {};

  return `
    <div style="display:flex;flex-direction:column;gap:14px;margin-top:8px">
      <div style="font-size:12px;color:var(--muted);line-height:1.6">
        با فعال کردن هر کلاینت، کانفیگ محلی آن کلاینت مستقیماً به ۹روتر محلی متصل می‌شود تا از مدل‌های Antigravity/Codex استفاده کند.
      </div>

      <!-- Claude CLI Card -->
      <div style="padding:14px;border-radius:10px;background:var(--card-bg, var(--surface));border:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;gap:12px">
        <div>
          <div style="font-size:13px;font-weight:700">Claude Code CLI</div>
          <div style="font-size:11px;color:var(--muted);margin-top:2px">
            وضعیت: ${claude.installed ? 'نصب شده' : 'نصب نیست'} | 
            اتصال به ۹روتر: <b style="color:${claude.has9Router ? '#10b981' : 'var(--muted)'}">${claude.has9Router ? 'متصل' : 'نامتصل'}</b>
          </div>
        </div>
        <button class="sm-btn" onclick="toggleCliTool('claude', ${claude.has9Router ? "'reset'" : "'apply'"})" 
                style="padding:6px 14px;font-weight:600;background:${claude.has9Router ? 'transparent' : 'var(--accent)'};color:${claude.has9Router ? 'var(--text)' : '#fff'}">
          ${claude.has9Router ? 'قطع اتصال' : 'اتصال به ۹روتر'}
        </button>
      </div>

      <!-- OpenCode Card -->
      <div style="padding:14px;border-radius:10px;background:var(--card-bg, var(--surface));border:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;gap:12px">
        <div>
          <div style="font-size:13px;font-weight:700">OpenCode</div>
          <div style="font-size:11px;color:var(--muted);margin-top:2px">
            وضعیت: ${opencode.installed ? 'نصب شده' : 'نصب نیست'} | 
            اتصال به ۹روتر: <b style="color:${opencode.has9Router ? '#10b981' : 'var(--muted)'}">${opencode.has9Router ? 'متصل' : 'نامتصل'}</b>
          </div>
        </div>
        <button class="sm-btn" onclick="toggleCliTool('opencode', ${opencode.has9Router ? "'reset'" : "'apply'"})" 
                style="padding:6px 14px;font-weight:600;background:${opencode.has9Router ? 'transparent' : 'var(--accent)'};color:${opencode.has9Router ? 'var(--text)' : '#fff'}">
          ${opencode.has9Router ? 'قطع اتصال' : 'اتصال به ۹روتر'}
        </button>
      </div>

      <!-- Cline Card -->
      <div style="padding:14px;border-radius:10px;background:var(--card-bg, var(--surface));border:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;gap:12px">
        <div>
          <div style="font-size:13px;font-weight:700">Cline (VS Code / JetBrains)</div>
          <div style="font-size:11px;color:var(--muted);margin-top:2px">
            وضعیت: ${cline.installed ? 'نصب شده' : 'نصب نیست'} | 
            اتصال به ۹روتر: <b style="color:${cline.has9Router ? '#10b981' : 'var(--muted)'}">${cline.has9Router ? 'متصل' : 'نامتصل'}</b>
          </div>
        </div>
        <button class="sm-btn" onclick="toggleCliTool('cline', ${cline.has9Router ? "'reset'" : "'apply'"})" 
                style="padding:6px 14px;font-weight:600;background:${cline.has9Router ? 'transparent' : 'var(--accent)'};color:${cline.has9Router ? 'var(--text)' : '#fff'}">
          ${cline.has9Router ? 'قطع اتصال' : 'اتصال به ۹روتر'}
        </button>
      </div>
    </div>
  `;
}

// ── ACTIONS ──────────────────────────────────────────────────────────────────

async function kickstart9Router() {
  try {
    showToast('در حال ری‌استارت سرویس و پاکسازی کش سهمیه...');
    const res = await api('/api/9router/kickstart', { method: 'POST' });
    if (res && res.success) {
      showToast('کش سهمیه آزاد شد و ۹روتر ری‌استارت شد!');
      await loadNineRouterPanel(true);
    } else {
      showToast('خطا: ' + (res.error || 'عملیات ناموفق'), 'error');
    }
  } catch (err) {
    showToast('خطا در پاکسازی: ' + err.message, 'error');
  }
}

async function switchActiveModel() {
  const sel = document.getElementById('quickModelSelect');
  const model = sel ? sel.value : '';
  if (!model) return;
  try {
    showToast(`در حال تنظیم مدل فعال به ${model}...`);
    const res = await api('/api/9router/switch-model', {
      method: 'POST',
      body: JSON.stringify({ model })
    });
    if (res && res.success) {
      showToast(`مدل هرمس با موفقیت به ${model} تغییر کرد!`);
      await loadNineRouterPanel(true);
    } else {
      showToast('خطا در تغییر مدل: ' + (res.error || 'ناموفق'), 'error');
    }
  } catch (err) {
    showToast('خطا: ' + err.message, 'error');
  }
}

async function toggleCliTool(tool, action) {
  try {
    showToast(`در حال اعمال تنظیمات ${tool}...`);
    const res = await api('/api/9router/cli-tools/toggle', {
      method: 'POST',
      body: JSON.stringify({ tool, action })
    });
    if (res && (res.success || !res.error)) {
      showToast(`تنظیمات ${tool} با موفقیت ذخیره شد.`);
      await loadNineRouterPanel(true);
    } else {
      showToast('خطا: ' + (res.error || 'ناموفق'), 'error');
    }
  } catch (err) {
    showToast('خطا: ' + err.message, 'error');
  }
}

async function connectHermesTo9Router() {
  try {
    showToast('در حال اتصال هرمس به ۹روتر...');
    const res = await api('/api/9router/connect-hermes', {
      method: 'POST',
      body: JSON.stringify({ model: 'ag/gemini-3.8-flash-medium' })
    });
    if (res && res.success) {
      showToast('هرمس با موفقیت به ۹روتر متصل شد!');
      await loadNineRouterPanel(true);
    } else {
      showToast('خطا در اتصال: ' + (res.error || 'ناشناخته'), 'error');
    }
  } catch (err) {
    showToast('خطا: ' + err.message, 'error');
  }
}

async function startOAuthFlow(provider, title) {
  try {
    showToast(`در حال دریافت لینک ورود ${title}...`);
    const res = await api('/api/9router/oauth/authorize', {
      method: 'POST',
      body: JSON.stringify({ provider })
    });

    if (res && res.authUrl) {
      _nineRouterState.activeAuthSession = {
        provider,
        providerTitle: title,
        authUrl: res.authUrl,
        state: res.state,
        codeVerifier: res.codeVerifier,
        redirectUri: res.redirectUri
      };
      const container = document.getElementById('nineRouterContent');
      if (container) renderNineRouterUI(container);

      // Auto open link
      window.open(res.authUrl, '_blank');
    } else {
      showToast('خطا در دریافت لینک لاگین: ' + (res.error || 'عدم بازگشت آدرس'), 'error');
    }
  } catch (err) {
    showToast('خطا در اتصال: ' + err.message, 'error');
  }
}

function cancelAuthSession() {
  _nineRouterState.activeAuthSession = null;
  const container = document.getElementById('nineRouterContent');
  if (container) renderNineRouterUI(container);
}

async function submitAuthCode() {
  const session = _nineRouterState.activeAuthSession;
  if (!session) return;

  const input = document.getElementById('nineRouterAuthCodeInput');
  const statusEl = document.getElementById('nineRouterAuthStatus');
  const btn = document.getElementById('nineRouterCompleteLoginBtn');
  const val = (input ? input.value : '').trim();

  if (!val) {
    if (statusEl) statusEl.innerHTML = '<span style="color:#ef4444">لطفاً آدرس بازگشتی، کد تایید یا توکن را وارد کنید.</span>';
    return;
  }

  // Parse code or state if callback URL
  let code = val;
  let state = session.state;
  if (val.includes('code=')) {
    try {
      const u = new URL(val);
      code = u.searchParams.get('code') || val;
      state = u.searchParams.get('state') || state;
    } catch {}
  }

  if (statusEl) statusEl.innerHTML = '<span style="color:var(--muted)">در حال تبادل کد و ثبت اکانت در ۹روتر...</span>';
  if (btn) btn.disabled = true;

  try {
    const res = await api('/api/9router/oauth/exchange', {
      method: 'POST',
      body: JSON.stringify({
        provider: session.provider,
        data: {
          code: code,
          state: state,
          codeVerifier: session.codeVerifier,
          redirectUri: session.redirectUri
        }
      })
    });

    if (res && (res.success || res.connection || res.id)) {
      showToast(`اکانت ${session.providerTitle || session.provider} با موفقیت ثبت شد!`);
      _nineRouterState.activeAuthSession = null;
      await loadNineRouterPanel(true);
    } else {
      if (statusEl) statusEl.innerHTML = `<span style="color:#ef4444">خطا: ${esc(res.error || 'عدم ثبت اکانت')}</span>`;
      if (btn) btn.disabled = false;
    }
  } catch (err) {
    if (statusEl) statusEl.innerHTML = `<span style="color:#ef4444">خطا: ${esc(err.message)}</span>`;
    if (btn) btn.disabled = false;
  }
}

async function testProviderConnection(id, btn) {
  const origText = btn.textContent;
  btn.textContent = '...';
  btn.disabled = true;
  try {
    const res = await api('/api/9router/providers/test', {
      method: 'POST',
      body: JSON.stringify({ id })
    });
    if (res && res.valid) {
      showToast('اتصال با موفقیت تایید شد (سالم و فعال)');
      await loadNineRouterPanel(true);
    } else {
      showToast('خطا در تست: ' + (res.error || 'نامعتبر'), 'error');
    }
  } catch (err) {
    showToast('خطا در تست اتصال: ' + err.message, 'error');
  } finally {
    btn.textContent = origText;
    btn.disabled = false;
  }
}

async function toggleProviderActive(id, isActive) {
  try {
    await api('/api/9router/providers/toggle', {
      method: 'POST',
      body: JSON.stringify({ id, isActive })
    });
    showToast(`وضعیت اکانت ${isActive ? 'فعال' : 'غیرفعال'} شد.`);
  } catch (err) {
    showToast('خطا در تغییر وضعیت: ' + err.message, 'error');
  }
}

async function deleteProviderConnection(id, name) {
  if (!confirm(`آیا از حذف اکانت "${name}" از ۹روتر اطمینان دارید؟`)) return;
  try {
    await api(`/api/9router/providers?id=${encodeURIComponent(id)}`, {
      method: 'DELETE'
    });
    showToast('اکانت حذف شد.');
    await loadNineRouterPanel(true);
  } catch (err) {
    showToast('خطا در حذف اکانت: ' + err.message, 'error');
  }
}

async function submitNewProxyPool() {
  const nameInput = document.getElementById('proxyNameInput');
  const urlInput = document.getElementById('proxyUrlInput');
  const typeSelect = document.getElementById('proxyTypeSelect');
  const activeInput = document.getElementById('proxyIsActiveInput');
  const strictInput = document.getElementById('proxyStrictInput');

  const name = (nameInput ? nameInput.value : '').trim();
  const proxyUrl = (urlInput ? urlInput.value : '').trim();
  const type = typeSelect ? typeSelect.value : 'http';
  const isActive = activeInput ? activeInput.checked : true;
  const strictProxy = strictInput ? strictInput.checked : false;

  if (!name || !proxyUrl) {
    showToast('نام و آدرس پروکسی الزامی است.', 'error');
    return;
  }

  try {
    showToast('در حال ثبت پروکسی...');
    const res = await api('/api/9router/proxy-pools', {
      method: 'POST',
      body: JSON.stringify({ name, proxyUrl, type, isActive, strictProxy, noProxy: '' })
    });
    if (res && (res.proxyPool || res.id || res.success !== false)) {
      showToast('پروکسی با موفقیت افزوده شد!');
      _showAddProxyForm = false;
      await loadNineRouterPanel(true);
    } else {
      showToast('خطا در ایجاد پروکسی: ' + (res.error || 'ناشناخته'), 'error');
    }
  } catch (err) {
    showToast('خطا: ' + err.message, 'error');
  }
}

async function testProxyPool(id, btn) {
  const origText = btn.textContent;
  btn.textContent = '...';
  btn.disabled = true;
  try {
    const res = await api('/api/9router/proxy-pools/test', {
      method: 'POST',
      body: JSON.stringify({ id })
    });
    if (res && res.ok) {
      showToast(`پروکسی سالم است! زمان پاسخ: ${res.elapsedMs || 0}ms`);
      await loadNineRouterPanel(true);
    } else {
      showToast('خطا در تست پروکسی: ' + (res.error || res.statusText || 'عدم پاسخ'), 'error');
    }
  } catch (err) {
    showToast('خطا در تست پروکسی: ' + err.message, 'error');
  } finally {
    btn.textContent = origText;
    btn.disabled = false;
  }
}

async function toggleProxyActive(id, isActive) {
  try {
    await api('/api/9router/proxy-pools', {
      method: 'PUT',
      body: JSON.stringify({ id, isActive })
    });
    showToast(`وضعیت پروکسی ${isActive ? 'فعال' : 'غیرفعال'} شد.`);
  } catch (err) {
    showToast('خطا در تغییر وضعیت: ' + err.message, 'error');
  }
}

async function deleteProxyPool(id, name) {
  if (!confirm(`آیا از حذف پروکسی "${name}" اطمینان دارید؟`)) return;
  try {
    await api(`/api/9router/proxy-pools?id=${encodeURIComponent(id)}`, {
      method: 'DELETE'
    });
    showToast('پروکسی حذف شد.');
    await loadNineRouterPanel(true);
  } catch (err) {
    showToast('خطا در حذف: ' + err.message, 'error');
  }
}

function copyTextToClipboard(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text);
    showToast('کپی شد!');
  } else {
    prompt('کپی دستی:', text);
  }
}
