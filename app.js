'use strict';

// 装備マスターと補正値の範囲
const STORAGE_KEY = 'shiren6-rack-v1',
  MIN_BONUS = {
    blue: 5,
    gold: 3
  },
  MAX_BONUS = {
    blue: 10,
    gold: 8
  };
const weapons = [
  '木刀',
  '青銅の太刀',
  'カタナ',
  'どうたぬき',
  '剛剣マンジカブラ',
  '火迅風魔刀',
  '秘剣カブラステギ',
  '金の剣',
  '妖刀かまいたち',
  'ミノタウロスの斧',
  '必中の剣',
  '連撃刀',
  '水斬りの剣',
  '原始の斧',
  'ドラゴンキラー',
  '三日月刀',
  '空の刃',
  '成仏のカマ',
  'ドレインバスター',
  '一ツ目殺し',
  '斬鉄剣',
  '巨大ハリセン',
  '回復の剣',
  '桃まん棒',
  '金食い虫こん棒',
  '鉄塊の大剣',
  'ステーキナイフ',
  'スパークソード',
  '四ツ叉',
  'めでたい熊手',
  'つるはし',
  '黄金のつるはし',
  '木づち',
  '最強ハンマー',
  '罠探りの棒',
  'かつおぶし',
  '山姥包丁',
  '使い捨て刀',
];
const shields = [
  '木甲の盾',
  '青銅甲の盾',
  '鉄甲の盾',
  'おにおおかみ',
  '風魔の盾',
  '螺旋風魔の盾',
  '金の盾',
  'バトルカウンター',
  '見切りの盾',
  'ドラゴンシールド',
  '爆発隠の盾',
  'ミノタウロスの盾',
  'トドよけの盾',
  'ガマラよけの盾',
  'いたずらよけの盾',
  'にぎりよけの盾',
  'オトトの盾',
  'カッパのお皿',
  'ゲイズの盾',
  '魔法よけの盾',
  '不動の盾',
  'ざぶとん',
  '金食い虫の盾',
  '鉄塊の大盾',
  'ステーキプレート',
  '根性の盾',
  '絶好調の盾',
  'サトリの盾',
  'ハラモチの盾',
  'めでたい御守',
  'お告げの盾',
  '山姥の鍋ぶた',
  '使い捨ての盾',
];

// DOM操作と表示用の共通処理
const $ = s => document.querySelector(s),
  $$ = s => [...document.querySelectorAll(s)];
const escapeHTML = s => String(s).replace(/[&<>"']/g, c => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
} [c]));

// 神器の記録値: null = 未収集、"?" = 収集済み・補正未確認、数値 = 最高補正
const createEquipment = (type, name) => ({
  id: type + ':' + name,
  type,
  name,
  normal: false,
  blue: null,
  gold: null
});
const createInitialState = () => ({
  version: 1,
  updatedAt: null,
  items: [...weapons.map(n => createEquipment('weapon', n)), ...shields.map(n =>
    createEquipment('shield', n))]
});
const equipmentIds = new Set(createInitialState().items.map(item => item.id));
const isCollected = v => v !== null;
const countCollectedVariants = i => Number(i.normal) + Number(isCollected(i.blue)) + Number(
  isCollected(i.gold));
function highestBonus(current, incoming) {
  if (current === null) return incoming;
  if (incoming === null) return current;
  if (current === '?') return incoming;
  if (incoming === '?') return current;
  return Math.max(current, incoming);
}

// 保存する収集記録と、現在の画面・ダイアログの状態
let state = createInitialState(),
  type = 'weapon',
  filter = 'all',
  query = '',
  editing = null,
  correction = false,
  pendingImport = null,
  pendingRestore = null,
  toastTimer, storageReady = true;

// バックアップの検証と旧形式の移行
function validateBackup(data) {
  if (!data || data.version !== 1 || !Array.isArray(data.items) || data.items.length < 1 || data
    .items.length > 2000) throw Error('対応するバックアップファイルではありません。');
  const seen = new Set();
  const items = data.items.map(i => {
    if (!i || !['weapon', 'shield'].includes(i.type) || typeof i.name !== 'string' || !i.name
      .trim() || i.name.trim().length > 60 || typeof i.normal !== 'boolean') throw Error(
      '装備データの形式が正しくありません。');
    for (const kind of ['blue', 'gold'])
      if (i[kind] !== null && i[kind] !== '?' && !(Number.isInteger(i[kind]) && i[kind] >=
          MIN_BONUS[kind] && i[kind] <= MAX_BONUS[kind])) throw Error('補正値の範囲が正しくありません。');
    const clean = {
      ...createEquipment(i.type, i.name.trim()),
      normal: i.normal,
      blue: i.blue,
      gold: i.gold
    };
    if (!equipmentIds.has(clean.id)) throw Error('武器38種・盾33種以外の装備は取り込めません。');
    if (seen.has(clean.id)) throw Error('同じ装備が重複しています。');
    seen.add(clean.id);
    return clean;
  });
  return {
    version: 1,
    updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : null,
    // 一部の装備だけを含むバックアップでも、一覧は固定の71種に揃える。
    items: createInitialState().items.map(item => items.find(saved => saved.id === item.id) ?? item)
  };
}

function migrateLegacy(data) {
  const migrated = structuredClone(data);
  let changed = 0;
  if (migrated?.version === 1 && Array.isArray(migrated.items))
    for (const i of migrated.items) {
      if (!i) continue;
      for (const kind of ['blue', 'gold'])
        if (Number.isInteger(i[kind]) && i[kind] >= 0 && i[kind] < MIN_BONUS[kind]) {
          i[kind] = '?';
          changed++;
        }
    }
  return {
    data: validateBackup(migrated),
    changed
  };
}

// ブラウザ保存。読み込みに失敗した場合は元データの上書きを防ぐ
let legacyCount = 0;

function storageWarning(message) {
  storageReady = false;
  $('#storage-warning').style.display = 'block';
  $('#storage-warning').textContent = message;
  $('#save-state').textContent = '● 保存できていません';
}
try {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    const migrated = migrateLegacy(JSON.parse(raw));
    state = migrated.data;
    legacyCount = migrated.changed;
  }
} catch (e) {
  storageWarning('保存済みデータを読み込めませんでした。元データは上書きしていません。バックアップを書き出してから、保存と設定で復元してください。');
}

function save() {
  if (!storageReady) return false;
  try {
    state.updatedAt = new Date().toISOString();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    $('#save-state').textContent = '● このブラウザに保存済み';
    return true;
  } catch (e) {
    storageWarning('ブラウザに保存できません。現在の記録はバックアップ保存で書き出してください。');
    return false;
  }
}

// 変更の保存と、直前の操作を取り消す通知
function toast(message, undo) {
  clearTimeout(toastTimer);
  const el = $('#toast');
  el.replaceChildren(document.createTextNode(message));
  if (undo) {
    const btn = document.createElement('button');
    btn.textContent = '元に戻す';
    btn.onclick = () => {
      undo();
      save();
      render();
      toast('変更を元に戻しました');
    };
    el.append(btn);
  }
  el.style.display = 'block';
  toastTimer = setTimeout(() => el.style.display = 'none', 6000);
}

function mutate(fn, message) {
  const before = JSON.stringify(state);
  fn();
  const ok = save();
  render();
  toast(ok ? message : message + '（未保存）', () => {
    state = JSON.parse(before);
  });
}

// 収集状況・装備一覧の描画
function renderStats() {
  const n = state.items.length,
    total = n * 3;
  const sums = {
    normal: 0,
    blue: 0,
    gold: 0
  };
  state.items.forEach(i => {
    sums.normal += Number(i.normal);
    sums.blue += Number(isCollected(i.blue));
    sums.gold += Number(isCollected(i.gold));
  });
  const sum = sums.normal + sums.blue + sums.gold;
  $('#overview').innerHTML =
    `<div class="stat"><div class="stat-title">装備かけの収集率</div><div class="stat-number">${Math.round(sum/total*100)}<small>% <span style="margin-left:8px">${sum} / ${total}</span></small></div><div class="bar"><i style="width:${sum/total*100}%"></i></div><div class="stat-sub">武器と盾、3つの種類を集めよう</div></div>` +
    [
      ['normal', '通常', ''],
      ['blue', '青神器', 'blue'],
      ['gold', '金神器', 'gold']
    ].map(([k, label, cls]) =>
      `<div class="stat"><div class="stat-title ${cls}"><span><i class="dot"></i>${label}</span></div><div class="stat-number ${cls}">${sums[k]}<small>/ ${n}</small></div><div class="stat-sub">${k==='normal'?'収集済み':`最高補正 +${MAX_BONUS[k]}：${state.items.filter(i=>i[k]===MAX_BONUS[k]).length} 個`}</div></div>`
      ).join('');
  $('#weapon-count').textContent = state.items.filter(i => i.type === 'weapon').length;
  $('#shield-count').textContent = state.items.filter(i => i.type === 'shield').length;
}

function matchesFilter(item) {
  switch (filter) {
    case 'all':
      return true;
    case 'missing':
      return countCollectedVariants(item) < 3;
    case 'improve':
      return item.blue !== MAX_BONUS.blue || item.gold !== MAX_BONUS.gold;
    case 'complete':
      return countCollectedVariants(item) === 3;
    default:
      return false;
  }
}

function renderEquipmentCell(item, kind) {
  const collected = kind === 'normal' ? item.normal : isCollected(item[kind]);
  const isMax = item[kind] === MAX_BONUS[kind];
  const label = {
    normal: '通常',
    blue: '青神器',
    gold: '金神器'
  } [kind];
  let value = '＋';
  let status = '未収集';

  if (collected) {
    value = kind === 'normal' || item[kind] === '?' ? '✓' : '+' + item[kind];
    status = kind === 'normal' ? '収集済み' :
      item[kind] === '?' ? '収集済み 補正未確認' : '最高補正 +' + item[kind];
  }

  const action = kind === 'normal' ? '。タップで切り替え' : '。タップで記録';
  const star = isMax ? '<small class="star">★</small>' : '';
  return `<button class="cell ${kind} ${collected ? 'owned' : ''} ${isMax ? 'max' : ''}"
    data-id="${escapeHTML(item.id)}" data-kind="${kind}"
    aria-label="${escapeHTML(item.name)} ${label} ${status}${action}">
    <span>${label}</span><b>${value}${star}</b>
  </button>`;
}

function renderEquipmentCard(item) {
  const collectedCount = countCollectedVariants(item);
  const complete = collectedCount === 3;
  const cells = ['normal', 'blue', 'gold'].map(kind => renderEquipmentCell(item, kind)).join('');

  return `<article class="item ${complete ? 'complete' : ''}">
    <div class="item-head">
      <span class="item-name">${escapeHTML(item.name)}</span>
      <span class="item-count">${complete ? '✓ ' : ''}${collectedCount} / 3 種</span>
    </div>
    <div class="cells">${cells}</div>
  </article>`;
}

function renderList() {
  const equipmentOfType = state.items.filter(item => item.type === type);
  const normalizedQuery = query.normalize('NFKC').toLowerCase();
  const visibleItems = equipmentOfType.filter(item =>
    item.name.normalize('NFKC').toLowerCase().includes(normalizedQuery)
  ).filter(matchesFilter);

  $('#list-title').textContent = type === 'weapon' ? '武器の手帖' : '盾の手帖';
  $('#list-count').textContent = `${visibleItems.length} / ${equipmentOfType.length} 種`;
  $('#items').innerHTML = visibleItems.length ?
    visibleItems.map(renderEquipmentCard).join('') :
    '<div class="empty">該当する装備はありません。<br>検索や絞り込みを変えてみてください。</div>';
}

function render() {
  renderStats();
  renderList();
  $$('[data-type]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.type === type)));
  $$('[data-filter]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.filter ===
    filter)));
}

// 神器の補正値を記録するダイアログ
function show(id) {
  $(id).showModal();
}

function renderEditor() {
  const i = state.items.find(i => i.id === editing.id),
    kind = editing.kind,
    current = i[kind];
  $('#edit-title').textContent = i.name;
  $('#edit-sub').textContent =
    `${kind==='blue'?'青神器':'金神器'}（+${MIN_BONUS[kind]}〜+${MAX_BONUS[kind]}） · ${correction?'記録の修正':'最高補正を記録'} / 現在：${current===null?'未収集':current==='?'?'収集済み・補正未確認':'+'+current}`;
  $('#numbers').innerHTML = Array.from({
    length: MAX_BONUS[kind] - MIN_BONUS[kind] + 1
  }, (_, offset) => offset + MIN_BONUS[kind]).map(v =>
    `<button data-value="${v}" class="${v===current?'selected':''} ${typeof current==='number'&&v<current?'lower':''}" aria-label="補正値 +${v}${v===MAX_BONUS[kind]?' 最高補正':''}">+${v}${v===MAX_BONUS[kind]?' ★':''}</button>`
    ).join('');
  $('#unknown-btn').textContent = correction ? '未収集に戻す' : '収集済み・補正値はあとで';
  $('#unknown-btn').classList.toggle('danger', correction);
  $('#correction-btn').textContent = correction ? '入手記録に戻る' : '記録を修正する';
  $('#edit-help').textContent = correction ? '選んだ値で記録を置き換えます。誤入力を直すときに使ってください。' :
    '入手した補正値を選ぶと、これまでの最高値だけを残します。';
}

function record(value) {
  if (!editing || !(value === null || value === '?' || Number.isInteger(value) && value >=
      MIN_BONUS[editing.kind] && value <= MAX_BONUS[editing.kind])) {
    toast('補正値が範囲外です');
    return;
  }
  const i = state.items.find(i => i.id === editing.id),
    k = editing.kind,
    next = correction ? value : highestBonus(i[k], value),
    same = next === i[k];
  $('#edit-dialog').close();
  if (same) {
    toast('記録はそのままです。最高値を保持しました');
    return;
  }
  mutate(() => i[k] = next, next === null ? '未収集に戻しました' :
    `${i.name}：${k==='blue'?'青':'金'} ${next==='?'?'収集済み':'+'+next} を記録しました`);
}

// 装備一覧・検索・ダイアログのイベント
$('#items').onclick = e => {
  const b = e.target.closest('[data-kind]');
  if (!b) return;
  const i = state.items.find(i => i.id === b.dataset.id);
  if (b.dataset.kind === 'normal') mutate(() => i.normal = !i.normal, i.normal ? '通常を未収集に戻しました' :
    '通常を収集済みにしました');
  else {
    editing = {
      id: i.id,
      kind: b.dataset.kind
    };
    correction = false;
    renderEditor();
    show('#edit-dialog');
  }
};
$('#numbers').onclick = e => {
  const b = e.target.closest('[data-value]');
  if (b) record(Number(b.dataset.value));
};
$('#unknown-btn').onclick = () => record(correction ? null : '?');
$('#correction-btn').onclick = () => {
  correction = !correction;
  renderEditor();
};
$$('[data-type]').forEach(b => b.onclick = () => {
  type = b.dataset.type;
  render();
});
$$('[data-filter]').forEach(b => b.onclick = () => {
  filter = b.dataset.filter;
  render();
});
$('#search').oninput = e => {
  query = e.target.value;
  renderList();
};
$$('[data-close]').forEach(b => b.onclick = () => b.closest('dialog').close());
$$('dialog').forEach(d => d.addEventListener('click', e => {
  if (e.target === d) {
    const r = d.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r
      .bottom) d.close();
  }
}));
$('#settings-btn').onclick = () => show('#settings-dialog');

// JSONバックアップとCSVの書き出し・復元
function download(content, name, mime) {
  const blob = new Blob([content], {
      type: mime
    }),
    url = URL.createObjectURL(blob),
    a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
const date = () => new Date().toLocaleDateString('sv-SE');
$('#export-json').onclick = () => download(JSON.stringify(state, null, 2), 'shiren6-backup-' +
date() + '.json', 'application/json');
const csvQuote = s => '"' + String(s).replace(/"/g, '""') + '"';
$('#export-csv').onclick = () => {
  const rows = [
    ['種別', '装備名', '通常', '青神器', '金神器'], ...state.items.map(i => [i.type === 'weapon' ? '武器' :
      '盾', i.name, i.normal ? 'TRUE' : 'FALSE', i.blue === null ? '' : i.blue === '?' ? '○' :
      i.blue, i.gold === null ? '' : i.gold === '?' ? '○' : i.gold
    ])
  ];
  download('\ufeff' + rows.map(r => r.map(csvQuote).join(',')).join('\r\n'),
    'shiren6-collection-' + date() + '.csv', 'text/csv;charset=utf-8');
};
$('#restore-btn').onclick = () => $('#restore-file').click();
$('#restore-file').onchange = async e => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    if (file.size > 2000000) throw Error('ファイルが大きすぎます。');
    pendingRestore = validateBackup(JSON.parse(await file.text()));
    $('#restore-preview').innerHTML =
      `<div class="import-preview">${pendingRestore.items.length} 種のバックアップを読み込みました。現在の記録をすべて置き換えます。</div><button class="wide primary" id="confirm-restore">このバックアップで復元する</button>`;
    $('#confirm-restore').onclick = () => {
      storageReady = true;
      $('#storage-warning').style.display = 'none';
      mutate(() => state = pendingRestore, 'バックアップを復元しました');
      $('#restore-preview').replaceChildren();
      pendingRestore = null;
    };
  } catch (err) {
    $('#restore-preview').textContent = err.message;
    $('#restore-preview').className = 'error';
  }
  e.target.value = '';
};

// CSV / TSVの解析と、既存記録を保持する取り込み
function parseRows(text) {
  const delimiter = text.includes('\t') ? '\t' : ',',
    rows = [];
  let row = [],
    cell = '',
    quoted = false;
  const raw = text.replace(/^\ufeff/, '');
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (c === '"') {
      if (quoted && raw[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (quoted || cell === '') quoted = !quoted;
      else cell += c;
    } else if (c === delimiter && !quoted) {
      row.push(cell);
      cell = '';
    } else if ((c === '\n' || c === '\r') && !quoted) {
      if (c === '\r' && raw[i + 1] === '\n') i++;
      row.push(cell);
      if (row.some(c => c.trim())) rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (quoted) throw Error('CSVの引用符が閉じられていません。');
  row.push(cell);
  if (row.some(c => c.trim())) rows.push(row);
  return rows;
}
const isCollectedMarker = s => /^(true|1|○|◯|〇|✓|✔|済|収集済み|有|あり|所持|✅|☑)$/i.test(s.trim());
const isUncollectedMarker = s => /^(false|0|×|✕|未収集|未|なし|無|-|—)?$/i.test(s.trim());

function parseImport(text) {
  const rows = parseRows(text);
  if (rows[0] && ['種別', '種類', 'type'].includes(rows[0][0].trim())) rows.shift();
  if (!rows.length) throw Error('取り込む行がありません。');
  if (rows.length > 2000) throw Error('一度に取り込めるのは2000行までです。');
  return rows.map((r, index) => {
    if (r.length !== 5) throw Error(`${index+1} 行目：5列に並べてください。`);
    const t = r[0].trim(),
      name = r[1].trim();
    if (!['武器', '盾', 'weapon', 'shield'].includes(t) || !name || name.length > 60) throw Error(
      `${index+1} 行目：種別または装備名を確認してください。`);
    if (!isCollectedMarker(r[2]) && !isUncollectedMarker(r[2])) throw Error(
      `${index+1} 行目：通常のチェック値を確認してください。`);
    const item = createEquipment(t === '武器' || t === 'weapon' ? 'weapon' : 'shield', name);
    if (!equipmentIds.has(item.id)) throw Error(
      `${index+1} 行目：武器38種・盾33種に含まれる種別と装備名を指定してください。`);
    item.normal = isCollectedMarker(r[2]);
    for (const [col, k] of [
        [3, 'blue'],
        [4, 'gold']
      ]) {
      const s = r[col].trim();
      if (/^(false|×|✕|未収集|未|なし|無|-|—)?$/i.test(s)) {
        item[k] = null;
      } else if (/^\+?\d+$/.test(s)) {
        const value = Number(s);
        if (value < MIN_BONUS[k] || value > MAX_BONUS[k]) throw Error(
          `${index+1} 行目：${k==='blue'?'青':'金'}は ${MIN_BONUS[k]}〜${MAX_BONUS[k]} の整数を入力してください。`
          );
        item[k] = value;
      } else if (isCollectedMarker(s)) {
        item[k] = '?';
      } else throw Error(`${index+1} 行目：${k==='blue'?'青は 5〜10':'金は 3〜8'}の整数、または ○ を入力してください。`);
    }
    return item;
  });
}

function mergeItems(base, imports) {
  const copy = structuredClone(base);
  for (const i of imports) {
    const old = copy.find(x => x.id === i.id);
    if (!old || !equipmentIds.has(i.id)) throw Error('収録されていない装備は取り込めません。');
    old.normal = old.normal || i.normal;
    old.blue = highestBonus(old.blue, i.blue);
    old.gold = highestBonus(old.gold, i.gold);
  }
  return copy;
}
$('#import-btn').onclick = () => {
  $('#import-preview').replaceChildren();
  pendingImport = null;
  show('#import-dialog');
};
$('#import-text').oninput = () => {
  pendingImport = null;
  $('#import-preview').replaceChildren();
};
$('#csv-file-btn').onclick = () => $('#csv-file').click();
$('#csv-file').onchange = async e => {
  const f = e.target.files[0];
  if (!f) return;
  if (f.size > 2000000) {
    toast('2MB以下のCSVを選んでください');
    return;
  }
  $('#import-text').value = await f.text();
  pendingImport = null;
  $('#import-preview').replaceChildren();
  e.target.value = '';
};
$('#preview-import').onclick = () => {
  try {
    pendingImport = parseImport($('#import-text').value);
    $('#import-preview').innerHTML =
      `<div class="import-preview">${pendingImport.length} 行を確認しました。既存の装備の記録を更新し、最高補正は保持します。</div><button class="primary wide" id="confirm-import">この内容を取り込む</button>`;
    $('#confirm-import').onclick = () => {
      mutate(() => state.items = mergeItems(state.items, pendingImport), 'スプシの記録を取り込みました');
      pendingImport = null;
      $('#import-dialog').close();
    };
  } catch (err) {
    pendingImport = null;
    $('#import-preview').innerHTML = `<p class="error">${escapeHTML(err.message)}</p>`;
  }
};

// 別タブで保存された記録の反映と初期表示
window.addEventListener('storage', e => {
  if (e.key !== STORAGE_KEY || !e.newValue) return;
  try {
    state = validateBackup(JSON.parse(e.newValue));
    render();
    toast('別のタブの記録を反映しました');
  } catch {
    toast('別のタブの記録を読み込めませんでした');
  }
});
render();
if (legacyCount) {
  const saved = save();
  toast(`${legacyCount} 件の範囲外の補正値を「収集済み・補正未確認」に変更しました${saved?'':'（未保存）'}`);
}
