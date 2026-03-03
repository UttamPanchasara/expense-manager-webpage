/** @type {ExpenseAPI|null} */
let api = null;
let scanner = null;
let currentOffset = 0;
const PAGE_SIZE = 20;
let hasMore = true;

// ── DOM ──
const scanScreen = document.getElementById('scan-screen');
const dashboardScreen = document.getElementById('dashboard-screen');
const startScanBtn = document.getElementById('start-scan-btn');
const scanReader = document.getElementById('scan-reader');
const scanStatus = document.getElementById('scan-status');
const manualToggle = document.getElementById('manual-toggle');
const manualInput = document.getElementById('manual-input');
const urlInput = document.getElementById('url-input');
const manualConnectBtn = document.getElementById('manual-connect-btn');
const manualError = document.getElementById('manual-error');
const disconnectBtn = document.getElementById('disconnect-btn');
const serverInfo = document.getElementById('server-info');
const expensesBody = document.getElementById('expenses-body');
const expensesEmpty = document.getElementById('expenses-empty');
const loadMoreBtn = document.getElementById('load-more-btn');
const categoriesList = document.getElementById('categories-list');
const accountsList = document.getElementById('accounts-list');

// ── Events ──
startScanBtn.addEventListener('click', startScanner);
manualToggle.addEventListener('click', toggleManualInput);
manualConnectBtn.addEventListener('click', handleManualConnect);
urlInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleManualConnect(); });
disconnectBtn.addEventListener('click', handleDisconnect);
loadMoreBtn.addEventListener('click', loadMoreExpenses);

// ── Scanner ──

async function startScanner() {
  startScanBtn.classList.add('hidden');
  scanReader.classList.remove('hidden');
  scanStatus.textContent = 'Point your camera at the QR code on your phone.';

  scanner = new Html5Qrcode('scan-reader');

  try {
    await scanner.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 250, height: 250 } },
      onScanSuccess,
    );
  } catch (err) {
    // If rear camera fails, try any camera
    try {
      await scanner.start(
        { facingMode: 'user' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        onScanSuccess,
      );
    } catch (err2) {
      scanStatus.textContent = 'Camera access denied. Use manual input below.';
      scanReader.classList.add('hidden');
      startScanBtn.classList.remove('hidden');
      manualInput.classList.remove('hidden');
    }
  }
}

async function onScanSuccess(decodedText) {
  // Stop scanner immediately to prevent duplicate scans
  await stopScanner();
  scanStatus.textContent = 'Connecting...';

  try {
    await connectWithUrl(decodedText);
  } catch (e) {
    console.error('[WebCompanion] Connection failed:', e);
    scanStatus.textContent = e.message;
    startScanBtn.classList.remove('hidden');
  }
}

async function stopScanner() {
  if (scanner) {
    try { await scanner.stop(); } catch (_) {}
    scanner = null;
  }
  scanReader.classList.add('hidden');
}

// ── Manual fallback ──

function toggleManualInput() {
  manualInput.classList.toggle('hidden');
}

async function handleManualConnect() {
  const raw = urlInput.value.trim();
  if (!raw) return;

  manualError.classList.add('hidden');
  manualConnectBtn.disabled = true;
  manualConnectBtn.textContent = 'Connecting...';

  try {
    await connectWithUrl(raw);
  } catch (e) {
    manualError.textContent = e.message;
    manualError.classList.remove('hidden');
  } finally {
    manualConnectBtn.disabled = false;
    manualConnectBtn.textContent = 'Connect';
  }
}

// ── Connect ──

async function connectWithUrl(rawUrl) {
  console.log('[WebCompanion] Scanned/entered URL:', rawUrl);

  const { baseUrl, token } = ExpenseAPI.parseConnectionUrl(rawUrl);
  console.log('[WebCompanion] Connecting to:', baseUrl);

  api = new ExpenseAPI(baseUrl, token);

  try {
    await api.handshake();
  } catch (e) {
    api = null;
    if (e.message === 'Failed to fetch') {
      throw new Error(
        'Cannot reach server at ' + baseUrl + '.\n' +
        'Make sure your phone and computer are on the same Wi-Fi, ' +
        'and the server is running in the app.'
      );
    }
    throw e;
  }

  serverInfo.textContent = baseUrl;
  showScreen('dashboard');
  await loadDashboard();
}

function handleDisconnect() {
  stopScanner();
  api = null;
  currentOffset = 0;
  hasMore = true;
  expensesBody.innerHTML = '';
  categoriesList.innerHTML = '';
  accountsList.innerHTML = '';
  urlInput.value = '';
  manualInput.classList.add('hidden');
  manualError.classList.add('hidden');
  startScanBtn.classList.remove('hidden');
  scanStatus.textContent = '';
  showScreen('scan');
}

// ── Dashboard ──

async function loadDashboard() {
  try {
    const [catRes, accRes] = await Promise.all([
      api.getCategories(),
      api.getAccounts(),
    ]);
    renderCategories(catRes.data);
    renderAccounts(accRes.data);
    await loadExpenses();
  } catch (e) {
    alert('Failed to load data: ' + e.message);
  }
}

// ── Expenses ──

async function loadExpenses() {
  try {
    const res = await api.getExpenses(PAGE_SIZE, currentOffset);
    const items = res.data || [];

    if (items.length === 0 && currentOffset === 0) {
      expensesEmpty.classList.remove('hidden');
      loadMoreBtn.classList.add('hidden');
      return;
    }

    expensesEmpty.classList.add('hidden');
    items.forEach((exp) => expensesBody.appendChild(buildExpenseRow(exp)));
    currentOffset += items.length;
    hasMore = items.length === PAGE_SIZE;
    loadMoreBtn.classList.toggle('hidden', !hasMore);
  } catch (e) {
    alert('Failed to load expenses: ' + e.message);
  }
}

async function loadMoreExpenses() {
  loadMoreBtn.disabled = true;
  loadMoreBtn.textContent = 'Loading...';
  await loadExpenses();
  loadMoreBtn.disabled = false;
  loadMoreBtn.textContent = 'Load More';
}

function buildExpenseRow(exp) {
  const tr = document.createElement('tr');
  tr.className = 'border-b border-white/5 hover:bg-white/[0.02] transition';

  const isIncome = exp.type === 'income';
  const amountClass = isIncome ? 'text-emerald-400' : 'text-red-400';
  const sign = isIncome ? '+' : '-';
  const catColor = exp.color
    ? '#' + (exp.color & 0xffffff).toString(16).padStart(6, '0')
    : '#7B61FF';

  tr.innerHTML = `
    <td class="py-3 px-4">
      <div class="text-sm text-gray-300">${esc(exp.date || '')}</div>
    </td>
    <td class="py-3 px-4">
      <div class="flex items-center gap-2">
        <span class="w-2.5 h-2.5 rounded-full flex-shrink-0" style="background:${catColor}"></span>
        <span class="text-sm text-gray-300">${esc(exp.category_name || 'Uncategorized')}</span>
      </div>
    </td>
    <td class="py-3 px-4">
      <div class="text-sm text-white">${esc(exp.description || '\u2014')}</div>
      ${exp.place ? `<div class="text-xs text-gray-500">${esc(exp.place)}</div>` : ''}
    </td>
    <td class="py-3 px-4 text-right">
      <span class="text-sm font-medium ${amountClass}">${sign}${fmtAmt(exp.amount)}</span>
    </td>
    <td class="py-3 px-4">
      <span class="text-xs text-gray-500">${esc(exp.account_name || '')}</span>
    </td>
    <td class="py-3 px-4">
      <span class="text-xs text-gray-500">${esc(exp.payment_mode || '')}</span>
    </td>
  `;
  return tr;
}

// ── Categories ──

function renderCategories(categories) {
  categoriesList.innerHTML = '';
  if (!categories || categories.length === 0) {
    categoriesList.innerHTML = '<p class="text-gray-500 text-sm">No categories</p>';
    return;
  }
  categories.forEach((cat) => {
    const color = cat.color
      ? '#' + (cat.color & 0xffffff).toString(16).padStart(6, '0')
      : '#7B61FF';
    const div = document.createElement('div');
    div.className = 'flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5';
    div.innerHTML = `
      <span class="w-2.5 h-2.5 rounded-full flex-shrink-0" style="background:${color}"></span>
      <span class="text-sm text-gray-300">${esc(cat.name)}</span>
      <span class="text-xs text-gray-600 ml-auto">${esc(cat.type || 'expense')}</span>
    `;
    categoriesList.appendChild(div);
  });
}

// ── Accounts ──

function renderAccounts(accounts) {
  accountsList.innerHTML = '';
  if (!accounts || accounts.length === 0) {
    accountsList.innerHTML = '<p class="text-gray-500 text-sm">No accounts</p>';
    return;
  }
  accounts.forEach((acc) => {
    const div = document.createElement('div');
    div.className = 'flex items-center justify-between px-3 py-2 rounded-lg bg-white/5';
    div.innerHTML = `
      <div>
        <span class="text-sm text-gray-300">${esc(acc.name)}</span>
        <span class="text-xs text-gray-600 ml-2">${esc(acc.type || '')}</span>
      </div>
    `;
    accountsList.appendChild(div);
  });
}

// ── Helpers ──

function showScreen(name) {
  scanScreen.classList.toggle('hidden', name !== 'scan');
  dashboardScreen.classList.toggle('hidden', name !== 'dashboard');
  disconnectBtn.classList.toggle('hidden', name !== 'dashboard');
}

function fmtAmt(val) {
  if (val == null) return '0.00';
  return Number(val).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function esc(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}
