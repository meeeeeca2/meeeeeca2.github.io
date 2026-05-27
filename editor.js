/* ────────────────────────────────────────────
   Card Editor — Type M
   로컬 블록 에디터: content.json 저장 + cards.json 자동 업데이트
──────────────────────────────────────────── */

/* ── 상수 ── */
const CARD_DIR = 'card_page';

/* ── 블록 타입 정의 ── */
const BLOCK_TYPES = [
  { type: 'p',       label: '본문',        desc: '일반 텍스트',       icon: '¶'  },
  { type: 'h1',      label: '제목 1',      desc: '큰 섹션 제목',      icon: 'H1' },
  { type: 'h2',      label: '제목 2',      desc: '중간 섹션 제목',    icon: 'H2' },
  { type: 'h3',      label: '제목 3',      desc: '소제목',            icon: 'H3' },
  { type: 'callout', label: '콜아웃',      desc: '강조 박스',         icon: '💡' },
  { type: 'quote',   label: '인용',        desc: '인용구',            icon: '"'  },
  { type: 'ul',      label: '글머리 목록', desc: '순서 없는 목록',    icon: '•'  },
  { type: 'ol',      label: '번호 목록',   desc: '순서 있는 목록',    icon: '1.' },
  { type: 'code',    label: '코드',        desc: '코드 스니펫',       icon: '<>' },
  { type: 'youtube', label: 'YouTube',    desc: 'YouTube 영상 삽입', icon: '▶'  },
  { type: 'img',     label: '이미지',      desc: '이미지 업로드',     icon: '🖼' },
  { type: 'divider', label: '구분선',      desc: '수평 구분선',       icon: '—'  },
];

const TEXT_TYPES         = new Set(['p', 'h1', 'h2', 'h3', 'quote']);
const LIST_TYPES         = new Set(['ul', 'ol']);
const INLINE_COLOR_TYPES = new Set(['p', 'h1', 'h2', 'h3', 'quote', 'callout']); // 인라인 포맷 + 블록색 지원

/* ── 색상 팔레트 (텍스트색 + 배경색) ── */
const COLORS = [
  { id: 'default', label: '기본',   text: null,      bg: null },
  { id: 'gray',    label: '회색',   text: '#9B9A97', bg: 'rgba(155,154,151,.25)' },
  { id: 'brown',   label: '갈색',   text: '#774C3A', bg: 'rgba(119,76,58,.25)'  },
  { id: 'orange',  label: '주황색', text: '#D9730D', bg: 'rgba(217,115,13,.25)' },
  { id: 'yellow',  label: '노란색', text: '#DFAB01', bg: 'rgba(223,171,1,.25)'  },
  { id: 'green',   label: '초록색', text: '#0F7B6C', bg: 'rgba(15,123,108,.25)' },
  { id: 'blue',    label: '파란색', text: '#0B6E99', bg: 'rgba(11,110,153,.25)' },
  { id: 'purple',  label: '보라색', text: '#6940A5', bg: 'rgba(105,64,165,.25)' },
  { id: 'pink',    label: '분홍색', text: '#AD1A72', bg: 'rgba(173,26,114,.25)' },
  { id: 'red',     label: '빨간색', text: '#E03E3E', bg: 'rgba(224,62,62,.25)'  },
];

/* ── 전역 상태 ── */
let currentCard  = null;   // { id, meta: {title, tags, description, thumb}, blocks: [] }
let allCards     = [];     // cards.json 전체
let paletteState = null;   // { mode: 'change'|'add', blockId?: string, anchorEl }
let dragSrcId          = null;   // 드래그 중인 블록 id (메인 에디터용)
let dragSrcRowId       = null;   // 드래그 중인 행 항목의 행 id (Phase 2)
let dragSrcItemIdx     = null;   // 드래그 중인 행 항목의 인덱스 (Phase 2)
let dragSrcColsBlockId = null;   // 드래그 중인 컬럼 이미지의 columns block id
let dragSrcColIdx      = null;   // 드래그 중인 컬럼 이미지의 컬럼 인덱스
let dragSrcColBlockId  = null;   // 드래그 중인 컬럼 이미지의 block id
let sidebarDragId    = null;   // 드래그 중인 카드 id (사이드바 리오더용)
let ctxMenuBlockId   = null;   // 컨텍스트 메뉴가 열려 있는 블록 id
let _subCloseTimer   = null;   // 서브메뉴 닫기 지연 타이머
let savedRange       = null;   // 인라인 색상 적용 전 Selection 저장
let _toolbarTimer    = null;   // 인라인 툴바 업데이트 디바운스

/* ════════════════════════════════════════════
   초기화
════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', async () => {
  await loadAllCards();
  renderSidebar();
  setupTopbar();
  setupPalette();
  initBlockCtxMenu();
  initMoreMenu();
  setupInlineToolbar();
  setupGlobalEvents();
  setupGlobalImgKeyboard();
});

async function loadAllCards() {
  try {
    const res = await fetch('cards.json?t=' + Date.now());
    const data = await res.json();
    allCards = data.cards || [];
  } catch {
    allCards = [];
  }
}

/* ════════════════════════════════════════════
   사이드바
════════════════════════════════════════════ */
function renderSidebar() {
  const list = document.getElementById('edCardList');
  list.innerHTML = '';

  if (allCards.length === 0) {
    list.innerHTML = '<li class="ed-card-placeholder">카드가 없습니다</li>';
    return;
  }

  allCards.forEach(card => {
    const li = document.createElement('li');
    li.className = 'ed-card-item' + (currentCard?.id === card.id ? ' active' : '');
    li.dataset.id = card.id;
    li.draggable  = true;

    const typeClass = (card.type || 'b').toLowerCase();
    li.innerHTML = `
      <span class="ed-sidebar-drag-handle" title="드래그하여 순서 변경">⠿</span>
      <span class="ed-card-item-title">${escHtml(card.title || card.id)}</span>
      <span class="ed-type-badge ${typeClass}">${card.type || 'B'}</span>
      <button class="ed-card-del-btn" title="카드 삭제">✕</button>
      <span class="ed-del-confirm">
        <span class="ed-del-confirm-msg">삭제할까요?</span>
        <button class="ed-del-ok">삭제</button>
        <button class="ed-del-cancel">취소</button>
      </span>
    `;
    li.title = card.id;
    li.addEventListener('click', () => loadCard(card.id));

    // 삭제 버튼 이벤트
    li.querySelector('.ed-card-del-btn').addEventListener('click', e => {
      e.stopPropagation();
      li.classList.add('confirming');
    });
    li.querySelector('.ed-del-cancel').addEventListener('click', e => {
      e.stopPropagation();
      li.classList.remove('confirming');
    });
    li.querySelector('.ed-del-ok').addEventListener('click', async e => {
      e.stopPropagation();
      await deleteCard(card.id);
    });

    setupSidebarItemDrag(li, card.id);
    list.appendChild(li);
  });
}

/* ════════════════════════════════════════════
   사이드바 카드 목록 Drag & Drop 리오더
════════════════════════════════════════════ */
function setupSidebarItemDrag(li, cardId) {

  li.addEventListener('dragstart', e => {
    // 블록 에디터 드래그와 구분
    sidebarDragId = cardId;
    dragSrcId     = null;   // 블록 드래그 초기화 (혼선 방지)
    li.classList.add('sidebar-dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', 'sidebar:' + cardId);
  });

  li.addEventListener('dragend', () => {
    sidebarDragId = null;
    li.classList.remove('sidebar-dragging');
    document.querySelectorAll('.ed-card-item').forEach(el =>
      el.classList.remove('drop-above', 'drop-below')
    );
  });

  li.addEventListener('dragover', e => {
    // 사이드바 드래그일 때만 처리
    if (!sidebarDragId || sidebarDragId === cardId) return;
    e.preventDefault();
    e.stopPropagation();

    // 기존 인디케이터 초기화
    document.querySelectorAll('.ed-card-item').forEach(el =>
      el.classList.remove('drop-above', 'drop-below')
    );
    // 마우스 위치 기반으로 위/아래 구분
    const rect = li.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    li.classList.add(e.clientY < midY ? 'drop-above' : 'drop-below');
  });

  li.addEventListener('dragleave', e => {
    if (!li.contains(e.relatedTarget)) {
      li.classList.remove('drop-above', 'drop-below');
    }
  });

  li.addEventListener('drop', async e => {
    if (!sidebarDragId || sidebarDragId === cardId) return;
    e.preventDefault();
    e.stopPropagation();

    const isAbove = li.classList.contains('drop-above');
    li.classList.remove('drop-above', 'drop-below');

    const fromIdx = allCards.findIndex(c => c.id === sidebarDragId);
    let   toIdx   = allCards.findIndex(c => c.id === cardId);
    if (fromIdx === -1 || toIdx === -1) return;

    // 배열 리오더
    const [moved] = allCards.splice(fromIdx, 1);
    toIdx = allCards.findIndex(c => c.id === cardId); // 제거 후 재계산
    allCards.splice(isAbove ? toIdx : toIdx + 1, 0, moved);

    // 사이드바 재렌더링
    renderSidebar();

    // 서버에 새 순서 저장
    await saveCardOrder();
  });
}

async function saveCardOrder() {
  try {
    const res = await fetch('/editor/reorder', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ order: allCards.map(c => c.id) }),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error);
    showToast('카드 순서 저장됨 ✓', 'success');
  } catch (err) {
    showToast('순서 저장 실패: ' + err.message, 'error');
  }
}

async function deleteCard(cardId) {
  // 메모리에서 먼저 제거 (저장 여부 무관)
  const idx = allCards.findIndex(c => c.id === cardId);
  if (idx !== -1) allCards.splice(idx, 1);

  // 현재 편집 중인 카드가 삭제된 경우 → 에디터 초기화
  if (currentCard?.id === cardId) {
    currentCard = null;
    document.getElementById('edCardId').textContent = '← 왼쪽에서 카드를 선택하세요';
    document.getElementById('edTitle').value         = '';
    document.getElementById('edTags').value          = '';
    document.getElementById('edDesc').value          = '';
    document.getElementById('edBlocks').innerHTML    = '';
    setEditorEnabled(false);
  }

  renderSidebar();

  // 서버에 삭제 요청 (아직 저장 안 된 카드는 cards.json에 없으므로 조용히 무시)
  try {
    const res  = await fetch('/editor/delete', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ id: cardId }),
    });
    const data = await res.json();
    // "해당 카드를 찾을 수 없습니다" = 저장 전 카드 → 정상 케이스로 처리
    if (!data.ok && data.error !== '해당 카드를 찾을 수 없습니다') {
      throw new Error(data.error);
    }
    showToast(`"${cardId}" 삭제 완료`, 'success');
  } catch (err) {
    showToast('삭제 중 오류: ' + err.message, 'error');
  }
}

/* ════════════════════════════════════════════
   카드 로드 / 생성
════════════════════════════════════════════ */
async function loadCard(id) {
  const cardMeta = allCards.find(c => c.id === id);

  try {
    const res = await fetch(`${CARD_DIR}/${id}/content.json?t=` + Date.now());
    if (res.ok) {
      const content = await res.json();
      let rawBlocks = content.blocks?.length ? content.blocks : [makeBlock('p')];

      // img-row → columns 자동 마이그레이션 (in-memory)
      const hasImgRow = rawBlocks.some(b => b.type === 'img-row');
      if (hasImgRow) {
        // 오늘 백업 없으면 서버에 백업 요청 (fire-and-forget)
        fetch('/editor/backup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id }),
        }).catch(() => {});
        rawBlocks = migrateImgRowToColumns(rawBlocks);
      }

      currentCard = {
        id,
        meta: content.meta || {
          title: cardMeta?.title || id,
          tags: [],
          description: '',
          thumb: ''
        },
        blocks: rawBlocks,
      };
    } else {
      throw new Error('no content.json');
    }
  } catch {
    // 신규 카드 또는 Type A/B → M 전환
    currentCard = {
      id,
      meta: {
        title: cardMeta?.title || id,
        tags: cardMeta?.tags || [],
        description: cardMeta?.description || '',
        thumb: '',
      },
      blocks: [makeBlock('h1', { text: cardMeta?.title || '' }), makeBlock('p')],
    };
  }

  renderEditor();
  setEditorEnabled(true);
  applyEditorFullWidth(currentCard.meta.fullWidth || false);

  // 사이드바 active 갱신
  document.querySelectorAll('.ed-card-item').forEach(el => {
    el.classList.toggle('active', el.dataset.id === id);
  });
}

function createNewCard(rawId) {
  const id = rawId.trim().replace(/\s+/g, '_');
  if (!id) return;

  // 이미 있으면 그냥 불러오기
  if (allCards.find(c => c.id === id)) {
    loadCard(id);
    return;
  }

  currentCard = {
    id,
    meta: { title: '', tags: [], description: '', thumb: '' },
    blocks: [makeBlock('h1'), makeBlock('p')],
  };

  // allCards 맨 앞에 임시 항목 추가 (아직 cards.json에는 없음)
  allCards.unshift({ id, title: id, type: 'M' });

  renderEditor();
  setEditorEnabled(true);
  applyEditorFullWidth(false);  // 신규 카드는 항상 기본(off) 상태로 시작
  renderSidebar();  // 삭제 버튼 등 모든 기능 포함된 항목으로 렌더링

  // 제목 입력창에 포커스
  setTimeout(() => document.getElementById('edTitle')?.focus(), 50);
}

/* ════════════════════════════════════════════
   에디터 렌더링
════════════════════════════════════════════ */
function renderEditor() {
  if (!currentCard) return;
  const { id, meta, blocks } = currentCard;

  document.getElementById('edCardId').textContent  = id;
  document.getElementById('edTitle').value          = meta.title || '';
  document.getElementById('edTags').value           = (meta.tags || []).join(', ');
  document.getElementById('edDesc').value           = meta.description || '';

  const container = document.getElementById('edBlocks');
  container.innerHTML = '';
  blocks.forEach(block => container.appendChild(makeBlockEl(block)));
}

function setEditorEnabled(enabled) {
  ['edTitle', 'edTags', 'edDesc', 'edSaveBtn', 'edAddBlockBtn', 'edMoreBtn'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.disabled = !enabled;
  });
  // 에디터 비활성화 시 전체너비 모드 해제
  if (!enabled) {
    applyEditorFullWidth(false);
    document.getElementById('edMoreMenu')?.classList.add('hidden');
  }
}

/* ════════════════════════════════════════════
   블록 데이터 팩토리
════════════════════════════════════════════ */
function makeBlock(type, data = {}) {
  const id = 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  if (type === 'divider')   return { id, type };
  if (type === 'img')       return { id, type, src: '',   caption: '', w: 16, align: 'center', ...data };
  if (type === 'img-row')   return { id, type, align: 'center', items: [], ...data };
  if (type === 'columns')   return { id, type, align: 'center', items: [], ...data };
  if (type === 'code')      return { id, type, lang: 'plaintext', code: '', ...data };
  if (type === 'youtube')   return { id, type, url: '', caption: '', ...data };
  if (LIST_TYPES.has(type)) return { id, type, items: [''],            ...data };
  if (type === 'callout')   return { id, type, emoji: '💡', text: '', ...data };
  return { id, type, text: '', ...data };
}

/* ════════════════════════════════════════════
   블록 → DOM 변환
════════════════════════════════════════════ */
function makeBlockEl(block) {
  const wrap = document.createElement('div');
  wrap.className = `ed-block ed-block-${block.type}`;
  wrap.dataset.blockId   = block.id;
  wrap.dataset.blockType = block.type;
  wrap.draggable = true;

  // ed-block-toolbar (✕↑↓) 완전 제거 — 모든 액션은 ⠿ 클릭 메뉴 통합
  wrap.innerHTML = `
    <div class="ed-drag-zone" title="드래그하여 순서 변경 / 클릭하여 메뉴 열기">
      <span class="ed-drag-handle">⠿</span>
    </div>
    <div class="ed-block-inner"></div>
  `;

  const inner = wrap.querySelector('.ed-block-inner');
  buildBlockInner(inner, block);

  // 블록 레벨 색상 적용
  // .ed-text / .ed-callout-text 에 직접 적용 (CSS 명시적 color 규칙이 inherited를 덮어쓰기 때문)
  if (block.textColor) {
    const tEl = inner.querySelector('.ed-text, .ed-callout-text');
    if (tEl) tEl.style.color = block.textColor;
    else     inner.style.color = block.textColor;
  }
  if (block.bgColor)   inner.style.backgroundColor = block.bgColor;

  // ⠿ 클릭 → 컨텍스트 메뉴 열기 (drag-zone 전체 또는 ⠿ 아이콘 클릭 모두 대응)
  wrap.querySelector('.ed-drag-zone').addEventListener('click', e => {
    e.preventDefault();
    e.stopPropagation();
    const menu = document.getElementById('edBlockCtxMenu');
    if (ctxMenuBlockId === block.id && !menu.classList.contains('hidden')) {
      closeBlockCtxMenu();
    } else {
      openBlockCtxMenu(block.id, wrap.querySelector('.ed-drag-handle'));
    }
  });

  setupBlockDrag(wrap, block.id);
  return wrap;
}

/* 블록 내부 컨텐츠 빌드 (타입별) */
function buildBlockInner(inner, block, isNested = false, parentCtx = null) {
  if (block.type === 'divider') {
    inner.innerHTML = '<hr class="ed-divider-line">';
    return;
  }
  if (block.type === 'img') {
    if (isNested) buildColImgInner(inner, block, parentCtx);
    else          buildImgInner(inner, block);
    return;
  }
  if (block.type === 'img-row') {
    buildImgRowInner(inner, block);
    return;
  }
  if (block.type === 'columns') {
    if (isNested) {
      console.warn('[columns] 중첩 columns 감지 — 렌더링 스킵', block.id);
      return;
    }
    buildColumnsInner(inner, block);
    return;
  }
  if (block.type === 'code') {
    buildCodeInner(inner, block);
    return;
  }
  if (block.type === 'youtube') {
    buildYoutubeInner(inner, block);
    return;
  }
  if (LIST_TYPES.has(block.type)) {
    buildListInner(inner, block);
    return;
  }
  if (block.type === 'callout') {
    buildCalloutInner(inner, block);
    return;
  }
  // text types: p, h1, h2, h3, quote
  buildTextInner(inner, block);
}

/* ── 텍스트 블록 ── */
function buildTextInner(inner, block) {
  const PLACEHOLDERS = {
    h1: '제목 1',
    h2: '제목 2',
    h3: '제목 3',
    p:  '내용을 입력하세요...  ( / 로 블록 타입 변경)',
    quote: '인용구를 입력하세요...',
  };
  const el = document.createElement('div');
  el.className           = 'ed-text';
  el.contentEditable     = 'true';
  el.dataset.placeholder = PLACEHOLDERS[block.type] || '';
  el.innerHTML           = block.text || '';  // innerHTML: 인라인 포맷 마크업 보존

  el.addEventListener('input', () => {
    // 텍스트가 없으면 완전히 비워 :empty 셀렉터가 작동하도록 보장 (placeholder용)
    if (!el.textContent.trim()) { el.innerHTML = ''; el.textContent = ''; }
    syncText(block.id, el.innerHTML);
  });
  el.addEventListener('keydown', e => onTextKeydown(e, block.id, el));

  inner.appendChild(el);
}

/* ── 콜아웃 블록 ── */
function buildCalloutInner(inner, block) {
  const wrap = document.createElement('div');
  wrap.className = 'ed-callout-wrap';

  // 이모지 (plain text 유지)
  const emojiEl = document.createElement('span');
  emojiEl.className       = 'ed-callout-emoji';
  emojiEl.contentEditable = 'true';
  emojiEl.dataset.placeholder = '💡';
  emojiEl.textContent     = block.emoji || '💡';
  emojiEl.addEventListener('input', e => {
    syncField(block.id, 'emoji', e.target.textContent.trim() || '💡');
  });

  // 텍스트 (innerHTML: 인라인 포맷 마크업 보존)
  const textEl = document.createElement('div');
  textEl.className       = 'ed-callout-text';
  textEl.contentEditable = 'true';
  textEl.dataset.placeholder = '콜아웃 내용을 입력하세요...';
  textEl.innerHTML       = block.text || '';
  textEl.addEventListener('input', () => {
    if (!textEl.textContent.trim()) { textEl.innerHTML = ''; textEl.textContent = ''; }
    syncText(block.id, textEl.innerHTML);
  });
  textEl.addEventListener('keydown', e => onTextKeydown(e, block.id, textEl));

  wrap.appendChild(emojiEl);
  wrap.appendChild(textEl);
  inner.appendChild(wrap);
}

/* ── 리스트 블록 ── */
function buildListInner(inner, block) {
  const tag  = block.type === 'ul' ? 'ul' : 'ol';
  const list = document.createElement(tag);
  list.className = 'ed-list';

  const items = block.items?.length ? block.items : [''];
  items.forEach(item => appendListItem(list, item, block.id));

  inner.appendChild(list);
}

function appendListItem(listEl, text, blockId) {
  const li = document.createElement('li');
  li.contentEditable = 'true';
  li.textContent     = text;

  li.addEventListener('input', () => syncListItems(blockId, listEl));

  li.addEventListener('keydown', e => {
    if (e.isComposing) return;  // 한글 IME 조합 중에는 무시
    if (e.key === 'Enter') {
      e.preventDefault();
      const newLi = document.createElement('li');
      newLi.contentEditable = 'true';
      newLi.textContent = '';
      li.after(newLi);
      syncListItems(blockId, listEl);
      newLi.focus();
    } else if (e.key === 'Backspace' && li.textContent === '' && listEl.children.length > 1) {
      e.preventDefault();
      const prev = li.previousElementSibling;
      li.remove();
      syncListItems(blockId, listEl);
      if (prev) { prev.focus(); caretToEnd(prev); }
    } else if (e.key === 'Backspace' && li.textContent === '' && listEl.children.length === 1) {
      // 마지막 항목에서 빈 상태로 Backspace → 블록 p로 변환
      e.preventDefault();
      changeBlockType(blockId, 'p');
    }
  });

  listEl.appendChild(li);
}

/* ─────────────────────────────────────────────
   컬럼 블록 (columns) — Phase 1
───────────────────────────────────────────── */
function buildColumnsInner(inner, block) {
  const container = document.createElement('div');
  container.className = 'ed-columns';
  container.dataset.align = block.align || 'center';

  // gap 보정 공식 (script.js renderMBlock 'columns' 와 동일)
  const colCount    = (block.items || []).length;
  const colGapPx    = 12; // .ed-columns gap
  // 문제8 fix: 항상 16 기준 (setupColImgHandles colWidth() 와 일치 → 저장/로드 후 크기 유지)
  const totalW      = 16;
  const actualTotal = (block.items || []).reduce((s, c) => s + (c?.w || 8), 0) || 16;
  const totalGap    = (colCount - 1) * colGapPx;

  // breakout CSS 용 (img-row 패턴): data-cols-total + --cols-total (실제 합 기준)
  container.dataset.colsTotal = actualTotal;
  container.style.setProperty('--cols-total', actualTotal);

  (block.items || []).forEach((col, colIdx) => {
    const colEl = document.createElement('div');
    colEl.className  = 'ed-column';
    colEl.dataset.colIdx = colIdx;
    const w        = col.w || 8;
    const pct      = (w / totalW * 100).toFixed(4);
    const gapShare = (totalGap * w / totalW).toFixed(4);
    colEl.style.width = `calc(${pct}% - ${gapShare}px)`;

    (col.blocks || []).forEach(innerBlock => {
      if (innerBlock.type === 'columns') {
        console.warn('[columns] 중첩 columns 감지 — 스킵', innerBlock.id);
        return;
      }
      const wrap = document.createElement('div');
      wrap.className        = `ed-inner-block ed-inner-block-${innerBlock.type}`;
      wrap.dataset.blockId  = innerBlock.id;
      wrap.dataset.blockType = innerBlock.type;

      if (innerBlock.textColor) {
        const tEl = wrap.querySelector?.('.ed-text, .ed-callout-text');
        if (tEl) tEl.style.color = innerBlock.textColor;
        else     wrap.style.color = innerBlock.textColor;
      }
      if (innerBlock.bgColor) wrap.style.backgroundColor = innerBlock.bgColor;

      buildBlockInner(wrap, innerBlock, true, { colsBlockId: block.id, colIdx, colW: col.w || 8 });
      colEl.appendChild(wrap);
    });

    container.appendChild(colEl);
  });

  inner.appendChild(container);
}

/* 컬럼 내부 이미지 블록 — 핸들(컬럼 너비 조절) + 툴바(교체·더보기) 포함 */
function buildColImgInner(inner, block, parentCtx = null) {
  const wrap = document.createElement('div');
  wrap.className = 'ed-img-block';

  if (block.src) {
    const w     = clampImgW(block.w);
    const align = block.align || 'center';

    // 컬럼 컨텍스트에서는 col.w 기준으로 캡션 숨김 판단
    const colW = parentCtx?.colW ?? w;

    const figure = document.createElement('figure');
    figure.className = 'ed-img-figure ed-img-col-item';
    figure.style.setProperty('--img-w', '100%');
    figure.dataset.align = align;
    figure.dataset.w     = w;

    figure.innerHTML = `
      <img class="ed-img-img" src="${CARD_DIR}/${currentCard.id}/${escHtml(block.src)}"
           alt="${escHtml(block.caption || '')}" loading="lazy" decoding="async">

      <div class="ed-img-handle ed-img-handle-l" data-side="left"><div class="ed-img-handle-grip"></div></div>
      <div class="ed-img-handle ed-img-handle-r" data-side="right"><div class="ed-img-handle-grip"></div></div>

      <div class="ed-img-toolbar">
        <button class="ed-img-tb-btn ed-img-tb-replace" title="이미지 교체">🔄</button>
        <button class="ed-img-tb-btn ed-img-tb-more" title="더보기">⋯</button>
      </div>

      <div class="ed-img-caption-overlay${colW <= 2 ? ' caption-hidden' : ''}"
           contenteditable="true"
           data-placeholder="캡션을 입력하세요...">${escHtml(block.caption || '')}</div>
    `;

    wrap.appendChild(figure);

    if (parentCtx) {
      setupColImgHandles(figure, parentCtx.colsBlockId, parentCtx.colIdx);
      figure.querySelector('.ed-img-tb-replace').addEventListener('click', () => {
        pickImageForColItem(parentCtx.colsBlockId, parentCtx.colIdx, block.id, figure);
      });

      // ── 문제9 fix: colImg 드래그 ──
      figure.draggable = true;
      figure.addEventListener('dragstart', e => {
        e.stopPropagation();
        dragSrcColsBlockId = parentCtx.colsBlockId;
        dragSrcColIdx      = parentCtx.colIdx;
        dragSrcColBlockId  = block.id;
        dragSrcRowId   = null;
        dragSrcItemIdx = null;
        dragSrcId      = null;
        figure.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', `colimg:${parentCtx.colsBlockId}:${parentCtx.colIdx}:${block.id}`);
        applyTransparentDragImage(e, figure);
      });
      figure.addEventListener('dragend', e => {
        e.stopPropagation();
        figure.classList.remove('dragging');
        clearAllDropIndicators();
        dragSrcColsBlockId = null;
        dragSrcColIdx      = null;
        dragSrcColBlockId  = null;
      });

      // 다른 colImg 위로 drag: 좌(컬럼 이전) / 우(컬럼 이후) 인디케이터
      figure.addEventListener('dragover', e => {
        if (e.dataTransfer?.types?.includes('Files')) return;
        e.preventDefault();
        e.stopPropagation();
        const src = getDragSrc();
        if (!src) return;
        // 자기 자신 무시
        if (src.type === 'colImg' && src.colsBlockId === parentCtx.colsBlockId && src.colIdx === parentCtx.colIdx) return;
        clearAllDropIndicators();
        const rect = figure.getBoundingClientRect();
        figure.classList.add((e.clientX - rect.left) / rect.width < 0.5 ? 'drop-left' : 'drop-right');
      });
      figure.addEventListener('dragleave', e => {
        if (!figure.contains(e.relatedTarget)) figure.classList.remove('drop-left', 'drop-right');
      });
      figure.addEventListener('drop', e => {
        if (e.dataTransfer?.types?.includes('Files')) return;
        e.preventDefault();
        e.stopPropagation();
        const src = getDragSrc();
        if (!src) return;
        const wantsLeft = figure.classList.contains('drop-left');
        clearAllDropIndicators();

        const targetColsBlockId = parentCtx.colsBlockId;
        const targetColIdx      = parentCtx.colIdx;

        if (src.type === 'colImg') {
          // ── 같은 columns 블록 내 컬럼 재배치 ──
          if (src.colsBlockId === targetColsBlockId) {
            const colsBlock = findBlock(targetColsBlockId);
            if (!colsBlock?.items) return;
            const adjacent = wantsLeft ? targetColIdx - 1 : targetColIdx + 1;
            if (src.colIdx === targetColIdx || src.colIdx === adjacent) return;
            const [moved] = colsBlock.items.splice(src.colIdx, 1);
            let tIdx = src.colIdx < targetColIdx ? targetColIdx - 1 : targetColIdx;
            colsBlock.items.splice(wantsLeft ? tIdx : tIdx + 1, 0, moved);
            rerenderCardBlocks();
            return;
          }
          // ── 다른 columns 블록으로 이동 ──
          const srcItem = extractSourceItem(src);
          if (!srcItem) return;
          // 그리드 영역 사전 체크 (데이터 손실 방지 — insertColIntoTarget 와 동일 기준)
          const targetCheck = findBlock(targetColsBlockId);
          if (targetCheck?.items) {
            const sum = targetCheck.items.reduce((s, c) => s + clampImgW(c.w), 0);
            const adjW = clampImgW(targetCheck.items[targetColIdx]?.w || 0);
            const maxAvail = (IMG_GRID_UNITS - sum) + Math.max(0, adjW - MIN_COL_W);
            if (maxAvail < MIN_COL_W) {
              showToast('컬럼을 더 추가할 공간이 부족합니다 (그리드 영역 초과)', 'error');
              return;
            }
          }
          removeSourceFromOrigin(src);
          const targetColsBlock = findBlock(targetColsBlockId);
          if (!targetColsBlock?.items) { rerenderCardBlocks(); return; }
          insertColIntoTarget(targetColsBlock, targetColIdx, wantsLeft, srcItem);
          rerenderCardBlocks();
          return;
        }

        // ── 메인 블록 / rowItem → 컬럼으로 이동 ──
        const srcItem = extractSourceItem(src);
        if (!srcItem) return;
        const targetCheck = findBlock(targetColsBlockId);
        if (targetCheck?.items) {
          const sum = targetCheck.items.reduce((s, c) => s + clampImgW(c.w), 0);
          const adjW = clampImgW(targetCheck.items[targetColIdx]?.w || 0);
          const maxAvail = (IMG_GRID_UNITS - sum) + Math.max(0, adjW - MIN_COL_W);
          if (maxAvail < MIN_COL_W) {
            showToast('컬럼을 더 추가할 공간이 부족합니다 (그리드 영역 초과)', 'error');
            return;
          }
        }
        removeSourceFromOrigin(src);
        const targetColsBlock = findBlock(targetColsBlockId);
        if (!targetColsBlock?.items) { rerenderCardBlocks(); return; }
        insertColIntoTarget(targetColsBlock, targetColIdx, wantsLeft, srcItem);
        rerenderCardBlocks();
      });
    }

    setupImgCaption(figure, block.id);
    setupImgHoverFocus(figure);

    const ctx = parentCtx
      ? { type: 'colImg', blockId: block.id, colsBlockId: parentCtx.colsBlockId, colIdx: parentCtx.colIdx }
      : { type: 'single', blockId: block.id };
    setupImgMoreAndSelect(figure, ctx);

  } else {
    wrap.innerHTML = `
      <div class="ed-img-dropzone ed-img-col-dropzone" style="height:80px;pointer-events:none;">
        <span class="ed-img-dz-icon">🖼</span>
      </div>
    `;
  }

  inner.appendChild(wrap);
}

/* 컬럼 내 이미지 핸들 — 드래그로 해당 컬럼의 col.w 조절 */
function setupColImgHandles(figure, colsBlockId, colIdx) {
  figure.querySelectorAll('.ed-img-handle').forEach(handle => {
    handle.addEventListener('mousedown', e => {
      e.preventDefault();
      e.stopPropagation();

      const colsBlock = findBlock(colsBlockId);
      if (!colsBlock?.items) return;

      const side   = handle.dataset.side;
      const startX = e.clientX;
      const colEl  = figure.closest('.ed-column');
      if (!colEl) return;
      const colsEl     = colEl.parentElement;
      const containerW = colsEl?.offsetWidth || 800;
      const pxPerUnit  = containerW / 16;

      // 시작 상태 스냅샷
      const startWs = colsBlock.items.map(c => clampImgW(c.w));
      const userSet = colsBlock.items.map(c => !!c.userSized);
      const startW  = startWs[colIdx];

      // 자기 제외 분류: 다른 user-set / auto
      const otherUserTotal = startWs.reduce((s, w, i) =>
        (i !== colIdx && userSet[i]) ? s + w : s, 0);
      const autoIndices = startWs.map((_, i) => i).filter(i => i !== colIdx && !userSet[i]);
      const autoCount   = autoIndices.length;
      const autoStart   = autoIndices.reduce((s, i) => s + startWs[i], 0);

      // ── newW 범위 산정 ──
      // 통일된 규칙: 다른 user-set 컬럼은 절대 건드리지 않음
      //   - 자기 + 다른 user-set 합 + auto×1 ≤ 16  (auto 최소 1 보장)
      //   - auto 가 0 개라도 동일 공식 → maxNewW = 16 - otherUserTotal
      //   - 즉 user-set 만 있는 grid 가 꽉 차 있으면 자기는 startW 이상 못 키움
      //         축소는 자유 (총합이 16 미만이 되어 grid 여유 공간 생김 → justify-content: center 로 가운데 정렬)
      const maxNewW = Math.max(1, 16 - otherUserTotal - autoCount);
      const minNewW = 1;

      const totalW   = 16;
      const totalGap = (colsBlock.items.length - 1) * 12;
      function colWidth(w) {
        const pct      = (w / totalW * 100).toFixed(4);
        const gapShare = (totalGap * w / totalW).toFixed(4);
        return `calc(${pct}% - ${gapShare}px)`;
      }

      figure.classList.add('ed-img-resizing');
      const allColEls = Array.from(colsEl.querySelectorAll(':scope > .ed-column'));
      let   currentWs = [...startWs];

      function applyToDOM(newWs) {
        newWs.forEach((w, i) => {
          if (currentWs[i] !== w) {
            currentWs[i] = w;
            colsBlock.items[i].w = w;
            const ce = allColEls[i];
            if (ce) {
              ce.style.width = colWidth(w);
              const fe = ce.querySelector('.ed-img-col-item');
              if (fe) updateCaptionVisibility(fe, w);
            }
          }
        });
      }

      function onMove(ev) {
        const dx     = ev.clientX - startX;
        const signed = side === 'right' ? dx : -dx;
        const deltaU = Math.round(signed / pxPerUnit);
        let   newW   = Math.max(minNewW, Math.min(maxNewW, startW + deltaU));

        const newWs = [...startWs];
        newWs[colIdx] = newW;

        if (autoCount > 0) {
          // auto 컬럼들이 비례 흡수/방출. 다른 user-set 은 절대 건드리지 않음
          const autoTarget = 16 - newW - otherUserTotal;
          if (autoStart === 0) {
            const each = Math.max(1, Math.floor(autoTarget / autoCount));
            autoIndices.forEach(i => { newWs[i] = each; });
          } else {
            autoIndices.forEach(i => {
              newWs[i] = Math.max(1, Math.round(startWs[i] / autoStart * autoTarget));
            });
          }
          // 정합 보정 — auto 만 ±
          let sum  = newWs.reduce((s, w) => s + w, 0);
          let diff = 16 - sum;
          let iter = 0;
          while (diff !== 0 && iter < autoCount * 8) {
            const idx = autoIndices[iter % autoCount];
            if (diff > 0 && newWs[idx] < 16) { newWs[idx] += 1; diff -= 1; }
            else if (diff < 0 && newWs[idx] > 1) { newWs[idx] -= 1; diff += 1; }
            iter++;
          }
        }
        // autoCount === 0: 자기만 변경. 다른 user-set 은 그대로 (합이 16 미만이면 grid 여유)

        applyToDOM(newWs);
      }

      function onUp() {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup',   onUp);
        figure.classList.remove('ed-img-resizing');
        if (currentWs[colIdx] !== startW) {
          // 사용자가 직접 드래그한 컬럼만 userSized=true 마킹
          // (auto 들은 자동 분배된 것이므로 status 그대로 = auto 유지)
          colsBlock.items[colIdx].userSized = true;
          showToast('컬럼 크기 변경 — ⌘S로 저장하세요', 'success');
        }
      }

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup',   onUp);
    });
  });
}

/* ── 이미지 블록 ── */
/* ── 이미지 그리드 상수 ── */
const IMG_GRID_UNITS   = 16;            // 16 칸 그리드
const IMG_UNIT_PX      = 75;            // 1 칸 = 75px (총 1200px)
const IMG_MIN_W        = 1;             // 최소 1 칸
const IMG_MAX_W        = IMG_GRID_UNITS; // 최대 16 칸
const IMG_BREAKOUT_PX  = 760;           // 이 폭 초과 시 컨테이너 breakout
const IMG_ROW_MAX      = 8;             // 행 내 항목 최대 (그리드 16칸의 1/2)
const MIN_COL_W        = 2;             // 컬럼 최소 너비 (1단위=75px 는 콘텐츠 식별 불가, 2단위=150px 부터 의미)
                                        // → 그리드 영역 기반 제한 (수량 제한 X, 시각적 유효성 기준)
const IMG_ROW_GAP      = 6;             // 행 항목 간 간격 (px)

/* drag 소스 정보를 standardize 한 형태로 반환 */
function getDragSrc() {
  if (dragSrcColsBlockId !== null && dragSrcColIdx !== null) {
    return { type: 'colImg', colsBlockId: dragSrcColsBlockId, colIdx: dragSrcColIdx, blockId: dragSrcColBlockId };
  }
  if (dragSrcRowId !== null && dragSrcItemIdx !== null) {
    return { type: 'rowItem', rowId: dragSrcRowId, itemIdx: dragSrcItemIdx };
  }
  if (dragSrcId) return { type: 'block', blockId: dragSrcId };
  return null;
}

/* drag 소스로부터 단일 img-item 객체 추출 (행에서 빼낼 때 데이터까지 정리) */
function extractSourceItem(src) {
  if (!src) return null;
  if (src.type === 'block') {
    const b = findBlock(src.blockId);
    if (b?.type === 'img') {
      return { src: b.src, caption: b.caption || '', w: clampImgW(b.w) };
    }
    return null;
  }
  if (src.type === 'rowItem') {
    const row = findBlock(src.rowId);
    if (row?.type !== 'img-row') return null;
    const item = row.items?.[src.itemIdx];
    return item ? { src: item.src, caption: item.caption || '', w: clampImgW(item.w) } : null;
  }
  if (src.type === 'colImg') {
    const colsBlock = findBlock(src.colsBlockId);
    const col       = colsBlock?.items?.[src.colIdx];
    const b         = col?.blocks?.find(x => x.id === src.blockId);
    // 문제9 fix: 컬럼에서 추출 시 col.w 사용 (시각적 크기 유지)
    // b.w 는 항상 16(마이그레이션 기본값)이라 무시
    return b?.src ? { src: b.src, caption: b.caption || '', w: clampImgW(col.w || 8) } : null;
  }
  return null;
}

/* drag 소스 원본 위치에서 제거 (block 인 경우 currentCard.blocks 에서, rowItem 인 경우 행 items 에서) */
function removeSourceFromOrigin(src) {
  if (!src) return;
  if (src.type === 'block') {
    const idx = currentCard.blocks.findIndex(b => b.id === src.blockId);
    if (idx !== -1) currentCard.blocks.splice(idx, 1);
  } else if (src.type === 'rowItem') {
    const row = findBlock(src.rowId);
    if (!row?.items) return;
    row.items.splice(src.itemIdx, 1);
    // 행이 1개만 남으면 → 단일 img 로 자동 복원 (해당 항목의 w 유지)
    if (row.items.length === 1) {
      const only = row.items[0];
      const rowIdx = currentCard.blocks.findIndex(b => b.id === src.rowId);
      if (rowIdx !== -1) {
        const singleImg = makeBlock('img', {
          src: only.src,
          caption: only.caption,
          w: clampImgW(only.w),
          align: 'center'
        });
        currentCard.blocks.splice(rowIdx, 1, singleImg);
      }
    } else if (row.items.length === 0) {
      // 빈 행은 제거
      const rowIdx = currentCard.blocks.findIndex(b => b.id === src.rowId);
      if (rowIdx !== -1) currentCard.blocks.splice(rowIdx, 1);
    } else {
      // 남은 항목들 w 재분배
      row.items = redistributeRowWidths(row.items);
    }
  } else if (src.type === 'colImg') {
    // 컬럼에서 이미지 제거
    const colsBlock = findBlock(src.colsBlockId);
    if (!colsBlock) return;
    const col = colsBlock.items?.[src.colIdx];
    if (!col) return;
    const bIdx = col.blocks.findIndex(b => b.id === src.blockId);
    if (bIdx !== -1) col.blocks.splice(bIdx, 1);

    // 컬럼이 비면 컬럼 자체 제거 후 남은 columns 정리
    if (col.blocks.length === 0) {
      colsBlock.items.splice(src.colIdx, 1);
      if (colsBlock.items.length === 1) {
        // 컬럼 1개만 남음 → 단일 img 블록으로 복원
        const onlyCol = colsBlock.items[0];
        const onlyImg = onlyCol.blocks.find(b => b.type === 'img');
        const colsIdx = currentCard.blocks.findIndex(b => b.id === src.colsBlockId);
        if (colsIdx !== -1 && onlyImg) {
          const single = makeBlock('img', { src: onlyImg.src, caption: onlyImg.caption || '', w: clampImgW(onlyImg.w), align: 'center' });
          currentCard.blocks.splice(colsIdx, 1, single);
        }
      } else if (colsBlock.items.length === 0) {
        // 빈 columns 블록 제거
        const colsIdx = currentCard.blocks.findIndex(b => b.id === src.colsBlockId);
        if (colsIdx !== -1) currentCard.blocks.splice(colsIdx, 1);
      } else {
        // 남은 컬럼 너비 재분배 — userSized 컬럼은 유지, auto 컬럼만 자동 분배
        colsBlock.items = redistributeColWidths(colsBlock.items);
      }
    }
  }
}

/* 두 단일 img 를 합쳐 img-row 생성 (target 위치에) */
function mergeImgsIntoRow(targetBlockId, side, srcItem) {
  const tIdx = currentCard.blocks.findIndex(b => b.id === targetBlockId);
  if (tIdx === -1) return null;
  const target = currentCard.blocks[tIdx];
  if (target.type !== 'img') return null;

  const targetItem = { src: target.src, caption: target.caption || '', w: clampImgW(target.w) };
  const items = side === 'left' ? [srcItem, targetItem] : [targetItem, srcItem];
  const newRow = makeBlock('img-row', { align: 'center', items: redistributeRowWidths(items) });
  currentCard.blocks.splice(tIdx, 1, newRow);
  return newRow;
}

/* 기존 img-row 에 단일 src 항목 추가 (특정 itemIdx 의 좌/우) */
function addToRow(rowId, targetItemIdx, side, srcItem) {
  const row = findBlock(rowId);
  if (row?.type !== 'img-row') return null;
  if (row.items.length >= IMG_ROW_MAX) {
    showToast(`행 최대 ${IMG_ROW_MAX}장까지 가능합니다`, 'error');
    return null;
  }
  const insertAt = side === 'left' ? targetItemIdx : targetItemIdx + 1;
  row.items.splice(insertAt, 0, srcItem);
  row.items = redistributeRowWidths(row.items);
  return row;
}

/* 행 width 비례 재분배: 합이 16 초과면 비례 축소, 16 이하면 유지 */
function redistributeRowWidths(items) {
  if (!items || items.length === 0) return items;
  const total = items.reduce((s, it) => s + clampImgW(it.w), 0);
  if (total <= IMG_GRID_UNITS) {
    return items.map(it => ({ ...it, w: clampImgW(it.w) }));
  }
  // 비례 축소
  const scaled = items.map(it => ({
    ...it,
    w: Math.max(IMG_MIN_W, Math.round(clampImgW(it.w) / total * IMG_GRID_UNITS))
  }));
  // 정합 보정: 합이 정확히 IMG_GRID_UNITS 가 되도록
  let sum  = scaled.reduce((s, it) => s + it.w, 0);
  let diff = IMG_GRID_UNITS - sum;
  let i    = 0;
  while (diff !== 0 && i < scaled.length * 4) {
    const idx = i % scaled.length;
    if (diff > 0 && scaled[idx].w < IMG_GRID_UNITS) { scaled[idx].w += 1; diff -= 1; }
    else if (diff < 0 && scaled[idx].w > IMG_MIN_W) { scaled[idx].w -= 1; diff += 1; }
    i++;
  }
  return scaled;
}

/* 컬럼 드롭 시 새 컬럼을 target에 삽입 — push-pull-adjacent 패턴
   - desiredW 만큼 인접 컬럼(targetColIdx)에서 공간을 양보 받음
   - 인접 컬럼이 1까지 줄어도 부족하면 새 컬럼도 자기 크기를 줄여 fit
   - 다른 컬럼들은 절대 건드리지 않음
*/
function insertColIntoTarget(targetColsBlock, targetColIdx, wantsLeft, srcItem) {
  const items = targetColsBlock.items;
  const insertAt = wantsLeft ? targetColIdx : targetColIdx + 1;
  const desiredW = clampImgW(srcItem.w || 8);

  // 그리드 영역 기반 제한 (수량 X, MIN_COL_W=2 기반)
  // → 새 컬럼이 들어가려면 자기와 인접 모두 MIN_COL_W 이상 유지 가능해야 함
  const fullSum   = items.reduce((s, c) => s + clampImgW(c.w), 0);
  const remaining = IMG_GRID_UNITS - fullSum; // 그리드 잔여 영역
  const adjacentCol = items[targetColIdx];
  const adjShrinkable = adjacentCol
    ? Math.max(0, clampImgW(adjacentCol.w) - MIN_COL_W)
    : 0;
  // 새 컬럼이 가질 수 있는 최대 너비 = 잔여 + 인접에서 양보 가능한 양
  const maxAvailable = remaining + adjShrinkable;

  if (maxAvailable < MIN_COL_W) {
    showToast('컬럼을 더 추가할 공간이 부족합니다 (그리드 영역 초과)', 'error');
    return false;
  }

  const actualNewW = Math.max(MIN_COL_W, Math.min(desiredW, maxAvailable));
  // 인접 컬럼에서 가져온 양 = overflow
  const overflowFromBudget = Math.max(0, fullSum + actualNewW - IMG_GRID_UNITS);
  if (overflowFromBudget > 0 && adjacentCol) {
    adjacentCol.w = clampImgW(adjacentCol.w) - overflowFromBudget;
  }

  const newCol = {
    w: actualNewW,
    userSized: true,
    blocks: [makeBlock('img', { src: srcItem.src, caption: srcItem.caption, w: 16, align: 'center' })],
  };
  items.splice(insertAt, 0, newCol);
  targetColsBlock.items = redistributeColWidths(items);
  return true;
}

/* 컬럼 너비 재분배 — userSized 컬럼은 너비 유지, 나머지(auto)만 비례 분배해 총합=16 맞춤
   - userSized: 사용자가 직접 드래그하여 너비 설정한 컬럼 (col.userSized === true)
   - auto: 그 외 (자동 분배 대상)
   - userSized 합이 이미 16 이상이면 user 도 비례 축소 */
function redistributeColWidths(items) {
  if (!items || items.length === 0) return items;
  const TOTAL = IMG_GRID_UNITS;
  const userTotal = items.reduce((s, it) => s + (it.userSized ? clampImgW(it.w) : 0), 0);
  const autoItems = items.filter(it => !it.userSized);

  // Case A: 모두 user-set → 합이 16 넘으면 비례 축소
  if (autoItems.length === 0) {
    if (userTotal <= TOTAL) return items.map(it => ({ ...it, w: clampImgW(it.w) }));
    return items.map(it => ({
      ...it,
      w: Math.max(IMG_MIN_W, Math.round(clampImgW(it.w) / userTotal * TOTAL))
    }));
  }

  // Case B: auto 컬럼 존재
  // 각 auto 최소 MIN_COL_W 보장 (시각적 유효 너비)
  const target    = Math.max(autoItems.length * MIN_COL_W, TOTAL - userTotal);
  const autoTotal = autoItems.reduce((s, it) => s + clampImgW(it.w), 0);

  const result = items.map(it => {
    if (it.userSized) return { ...it, w: clampImgW(it.w) };
    if (autoTotal === 0) {
      return { ...it, w: Math.max(MIN_COL_W, Math.floor(target / autoItems.length)) };
    }
    return { ...it, w: Math.max(MIN_COL_W, Math.round(clampImgW(it.w) / autoTotal * target)) };
  });

  // 정합 보정: auto 컬럼만 ± 조정해 총합 = 16
  let sum  = result.reduce((s, it) => s + it.w, 0);
  let diff = TOTAL - sum;
  let i    = 0;
  while (diff !== 0 && i < result.length * 8) {
    const idx = i % result.length;
    if (!result[idx].userSized) {
      if (diff > 0 && result[idx].w < IMG_GRID_UNITS) { result[idx].w += 1; diff -= 1; }
      else if (diff < 0 && result[idx].w > MIN_COL_W) { result[idx].w -= 1; diff += 1; }
    }
    i++;
  }
  return result;
}

function buildImgInner(inner, block) {
  const wrap = document.createElement('div');
  wrap.className = 'ed-img-block';

  if (block.src) {
    const w     = clampImgW(block.w);
    const align = block.align || 'center';

    const figure = document.createElement('figure');
    figure.className = 'ed-img-figure';
    figure.style.setProperty('--img-w', `${w * IMG_UNIT_PX}px`);
    figure.dataset.align = align;
    figure.dataset.w     = w;
    if (w * IMG_UNIT_PX > IMG_BREAKOUT_PX) figure.classList.add('ed-img-breakout');

    figure.innerHTML = `
      <img class="ed-img-img" src="${CARD_DIR}/${currentCard.id}/${escHtml(block.src)}" alt="${escHtml(block.caption || '')}" loading="lazy" decoding="async">

      <div class="ed-img-handle ed-img-handle-l" data-side="left"><div class="ed-img-handle-grip"></div></div>
      <div class="ed-img-handle ed-img-handle-r" data-side="right"><div class="ed-img-handle-grip"></div></div>

      <div class="ed-img-toolbar">
        <button class="ed-img-tb-btn" data-align="left"   title="왼쪽 정렬">⬅</button>
        <button class="ed-img-tb-btn" data-align="center" title="가운데 정렬">◼</button>
        <button class="ed-img-tb-btn" data-align="right"  title="오른쪽 정렬">➡</button>
        <span class="ed-img-tb-sep"></span>
        <button class="ed-img-tb-btn ed-img-tb-replace" title="이미지 교체">🔄</button>
        <button class="ed-img-tb-btn ed-img-tb-more" title="더보기">⋯</button>
      </div>

      <div class="ed-img-caption-overlay${w <= 2 ? ' caption-hidden' : ''}" contenteditable="true" data-placeholder="캡션을 입력하세요...">${escHtml(block.caption || '')}</div>
    `;

    wrap.appendChild(figure);

    setupImgHandles(figure, block.id);
    setupImgToolbar(figure, block.id);
    setupImgCaption(figure, block.id);
    setupImgHoverFocus(figure);
    setupImgMoreAndSelect(figure, { type: 'single', blockId: block.id });

    figure.querySelector('.ed-img-tb-replace').addEventListener('click', () => pickImage(block.id, wrap));
  } else {
    // 빈 드롭존 (캡션은 업로드 후 표시)
    wrap.innerHTML = `
      <div class="ed-img-dropzone" tabindex="0">
        <span class="ed-img-dz-icon">🖼</span>
        <p>클릭하거나 이미지를 드롭하세요</p>
        <p class="ed-img-hint">Ctrl+V 로 클립보드 이미지 붙여넣기도 가능합니다</p>
      </div>
    `;
    wrap.querySelector('.ed-img-dropzone').addEventListener('click', () => pickImage(block.id, wrap));
  }

  setupDropZone(wrap, block.id);
  inner.appendChild(wrap);
}

function clampImgW(w) {
  const n = Number.isFinite(w) ? Math.round(w) : IMG_MAX_W;
  return Math.max(IMG_MIN_W, Math.min(IMG_MAX_W, n));
}

/* ── 이미지: 좌/우 핸들 드래그로 width 조절 ── */
function setupImgHandles(figure, blockId) {
  figure.querySelectorAll('.ed-img-handle').forEach(handle => {
    handle.addEventListener('mousedown', e => {
      e.preventDefault();
      e.stopPropagation();

      const b = findBlock(blockId);
      if (!b) return;

      const side       = handle.dataset.side; // 'left' | 'right'
      const startX     = e.clientX;
      const startW     = clampImgW(b.w);
      const startPx    = startW * IMG_UNIT_PX;
      let   currentW   = startW;

      figure.classList.add('ed-img-resizing');

      function onMove(ev) {
        const dx       = ev.clientX - startX;
        // 좌측 핸들: 오른쪽으로 끌면 커짐 (실제론 width 증가 = dx * -1 효과)
        const signed   = side === 'right' ? dx : -dx;
        // 가운데 정렬 가정 → 양쪽이 동시에 움직이므로 ×2 (체감 자연스러움)
        // align=left/right 일 때는 한쪽만 → ×1 — 단순화 위해 항상 ×2 처리
        const newPx    = Math.max(IMG_UNIT_PX, Math.min(IMG_MAX_W * IMG_UNIT_PX, startPx + signed * 2));
        const newW     = clampImgW(Math.round(newPx / IMG_UNIT_PX));
        if (newW !== currentW) {
          currentW = newW;
          figure.style.setProperty('--img-w', `${newW * IMG_UNIT_PX}px`);
          figure.dataset.w = newW;
          figure.classList.toggle('ed-img-breakout', newW * IMG_UNIT_PX > IMG_BREAKOUT_PX);
          updateImgToolbarState(figure, { w: newW, align: b.align });
          updateCaptionVisibility(figure, newW);
        }
      }

      function onUp() {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup',   onUp);
        figure.classList.remove('ed-img-resizing');
        if (currentW !== startW) {
          b.w = currentW;
          updateImgToolbarState(figure, b);
          updateCaptionVisibility(figure, currentW);
          showToast('이미지 크기 변경 — ⌘S로 저장하세요', 'success');
        }
      }

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup',   onUp);
    });
  });
}

/* ── 이미지: floating toolbar (정렬) ── */
function setupImgToolbar(figure, blockId) {
  const b = findBlock(blockId);
  if (!b) return;
  updateImgToolbarState(figure, b);

  figure.querySelectorAll('.ed-img-tb-btn[data-align]').forEach(btn => {
    btn.addEventListener('mousedown', e => e.preventDefault()); // selection/blur 방지
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const newAlign = btn.dataset.align;
      const blk = findBlock(blockId);
      if (!blk) return;
      blk.align = newAlign;
      figure.dataset.align = newAlign;
      updateImgToolbarState(figure, blk);
      showToast('정렬 변경 — ⌘S로 저장하세요', 'success');
    });
  });
}

function updateImgToolbarState(figure, block) {
  const w        = clampImgW(block.w);
  const align    = block.align || 'center';
  // breakout(컨테이너 초과) 또는 w=16 일 땐 정렬 의미 없음 → 정렬 버튼 자체를 숨김 (Notion 방식)
  const hideAligns = (w * IMG_UNIT_PX) > IMG_BREAKOUT_PX || w >= IMG_MAX_W;
  const toolbar = figure.querySelector('.ed-img-toolbar');
  if (toolbar) toolbar.classList.toggle('aligns-hidden', hideAligns);
  figure.querySelectorAll('.ed-img-tb-btn[data-align]').forEach(btn => {
    btn.classList.toggle('active', !hideAligns && btn.dataset.align === align);
    btn.disabled = hideAligns;
  });
}

/* w ≤ 2 일 때 캡션 UI 숨김 (데이터는 보존) */
function updateCaptionVisibility(figure, w) {
  const cap = figure.querySelector('.ed-img-caption-overlay');
  if (cap) cap.classList.toggle('caption-hidden', w <= 2);
}

/* ─────────────────────────────────────────────
   이미지 행 (img-row) — Phase 2
───────────────────────────────────────────── */
function buildImgRowInner(inner, block) {
  const row = document.createElement('div');
  row.className = 'ed-img-row';
  row.dataset.align    = block.align || 'center';
  row.dataset.rowId    = block.id;
  row.style.setProperty('--row-count', block.items.length);
  row.style.setProperty('--row-gap',   IMG_ROW_GAP + 'px');

  block.items.forEach((item, idx) => {
    const fig = createImgRowItem(block.id, idx, item);
    row.appendChild(fig);
  });

  // 행 합을 data-row-total + CSS var 로 노출 (width 계산 / breakout 분기에 사용)
  const totalW = block.items.reduce((s, it) => s + clampImgW(it.w), 0);
  row.dataset.rowTotal = totalW;
  row.style.setProperty('--row-total', totalW);

  inner.appendChild(row);
}

/* 행 내 한 항목 (figure) 생성 — Phase 1 figure 와 시각/구조 거의 동일하지만
   width 는 flex-basis 로, toolbar 에서 align 버튼 제외, replace 만 노출 */
function createImgRowItem(rowId, itemIdx, item) {
  const w = clampImgW(item.w);
  const figure = document.createElement('figure');
  figure.className = 'ed-img-figure ed-img-row-item';
  figure.dataset.rowId   = rowId;
  figure.dataset.itemIdx = itemIdx;
  figure.dataset.w       = w;
  figure.style.setProperty('--row-w', w);

  figure.innerHTML = `
    <img class="ed-img-img" src="${CARD_DIR}/${currentCard.id}/${escHtml(item.src)}" alt="${escHtml(item.caption || '')}" loading="lazy" decoding="async">

    <div class="ed-img-handle ed-img-handle-l" data-side="left"><div class="ed-img-handle-grip"></div></div>
    <div class="ed-img-handle ed-img-handle-r" data-side="right"><div class="ed-img-handle-grip"></div></div>

    <div class="ed-img-toolbar">
      <button class="ed-img-tb-btn ed-img-tb-replace" title="이미지 교체">🔄</button>
      <button class="ed-img-tb-btn ed-img-tb-more" title="더보기">⋯</button>
    </div>

    <div class="ed-img-caption-overlay${w <= 2 ? ' caption-hidden' : ''}" contenteditable="true" data-placeholder="캡션...">${escHtml(item.caption || '')}</div>
  `;

  // 캡션 동기화
  const cap = figure.querySelector('.ed-img-caption-overlay');
  cap.addEventListener('input', () => {
    const b = findBlock(rowId);
    if (b?.items?.[itemIdx]) b.items[itemIdx].caption = cap.textContent;
    if (!cap.textContent.trim()) cap.textContent = '';
  });
  cap.addEventListener('mousedown', e => e.stopPropagation());

  // 교체 버튼 (행 내 단일 항목 src 변경)
  figure.querySelector('.ed-img-tb-replace').addEventListener('click', () => {
    pickImageForRowItem(rowId, itemIdx, figure);
  });

  // 핸들 push-pull
  setupRowItemHandles(figure, rowId, itemIdx);

  // 행 항목 자체 drag&drop (Sprint B)
  setupRowItemDrag(figure, rowId, itemIdx);

  setupImgHoverFocus(figure);
  setupImgMoreAndSelect(figure, { type: 'rowItem', rowId, itemIdx });
  return figure;
}

/* 행 항목 figure 의 drag&drop 시스템 (항목 단위로 행 안/밖 이동 + 같은 행 reorder) */
function setupRowItemDrag(figure, rowId, itemIdx) {
  figure.draggable = true;

  figure.addEventListener('dragstart', e => {
    e.stopPropagation(); // 부모 .ed-block 의 dragstart 차단
    dragSrcRowId   = rowId;
    dragSrcItemIdx = itemIdx;
    dragSrcId      = null;
    figure.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', `rowitem:${rowId}:${itemIdx}`);
    applyTransparentDragImage(e, figure);
  });

  figure.addEventListener('dragend', e => {
    e.stopPropagation();
    figure.classList.remove('dragging');
    clearAllDropIndicators();
    dragSrcRowId   = null;
    dragSrcItemIdx = null;
  });

  figure.addEventListener('dragover', e => {
    if (e.dataTransfer?.types?.includes('Files')) return;
    e.preventDefault();
    e.stopPropagation();
    const src = getDragSrc();
    if (!src) return;
    // 자기 자신 무시
    if (src.type === 'rowItem' && src.rowId === rowId && src.itemIdx === itemIdx) return;

    clearAllDropIndicators();
    const rect = figure.getBoundingClientRect();
    const xRel = (e.clientX - rect.left) / rect.width;
    figure.classList.add(xRel < 0.5 ? 'drop-left' : 'drop-right');
  });

  figure.addEventListener('dragleave', e => {
    if (!figure.contains(e.relatedTarget)) {
      figure.classList.remove('drop-left', 'drop-right');
    }
  });

  figure.addEventListener('drop', e => {
    if (e.dataTransfer?.types?.includes('Files')) return;
    e.preventDefault();
    e.stopPropagation();
    const src = getDragSrc();
    if (!src) return;

    const wantsLeft = figure.classList.contains('drop-left');
    clearAllDropIndicators();
    const side = wantsLeft ? 'left' : 'right';

    // ─── 같은 행 내 reorder: items 재배치만 (자동 해체 우회) ───
    if (src.type === 'rowItem' && src.rowId === rowId) {
      // 자기 자신 옆 drop = 무의미
      const adjacent = side === 'left' ? itemIdx - 1 : itemIdx + 1;
      if (src.itemIdx === itemIdx || src.itemIdx === adjacent) return;

      const row = findBlock(rowId);
      if (!row?.items) return;
      const [moved] = row.items.splice(src.itemIdx, 1);
      // 앞쪽이 빠졌으면 target 인덱스 1 감소
      let tIdx = (src.itemIdx < itemIdx) ? itemIdx - 1 : itemIdx;
      const insertAt = side === 'left' ? tIdx : tIdx + 1;
      row.items.splice(insertAt, 0, moved);
      // 행 width 합은 변하지 않으므로 재분배 불필요
      rerenderCardBlocks();
      return;
    }

    // ─── 다른 소스에서 이 행으로 추가 ───
    const srcItem = extractSourceItem(src);
    if (!srcItem) return;

    removeSourceFromOrigin(src);

    const targetRow = findBlock(rowId);
    if (!targetRow || targetRow.type !== 'img-row') {
      // target 행 자체가 사라진 경우 — 단일 img 로 만들어 적당 위치에 삽입할 수도 있으나
      // (드문 케이스) 안전 우선: 카드 재렌더링만
      rerenderCardBlocks();
      return;
    }
    addToRow(rowId, itemIdx, side, srcItem);
    rerenderCardBlocks();
  });
}

/* 컬럼 내 이미지 교체 */
function pickImageForColItem(colsBlockId, colIdx, blockId, figureEl) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.style.display = 'none';
  document.body.appendChild(input);
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    document.body.removeChild(input);
    if (!file) return;
    figureEl.classList.add('ed-img-uploading');
    try {
      const b64 = await fileToBase64(file);
      const res = await fetch('/editor/upload', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ cardId: currentCard.id, filename: file.name, data: b64 }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || '업로드 실패');
      const colsBlock = findBlock(colsBlockId);
      const col = colsBlock?.items?.[colIdx];
      const b = col?.blocks.find(x => x.id === blockId);
      if (b) {
        b.src = data.path;
        figureEl.querySelector('img').src = `${CARD_DIR}/${currentCard.id}/${data.path}?t=${Date.now()}`;
        showToast('이미지 교체됨 — ⌘S로 저장하세요', 'success');
      }
    } catch (err) {
      showToast('업로드 실패: ' + err.message, 'error');
    } finally {
      figureEl.classList.remove('ed-img-uploading');
    }
  });
  input.click();
}

/* 행 내 항목의 src 교체 (단일 img pickImage 의 row item 버전) */
function pickImageForRowItem(rowId, itemIdx, figureEl) {
  const input = document.createElement('input');
  input.type   = 'file';
  input.accept = 'image/*';
  input.style.display = 'none';
  document.body.appendChild(input);
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    document.body.removeChild(input);
    if (!file) return;
    figureEl.classList.add('ed-img-uploading');
    try {
      const b64 = await fileToBase64(file);
      const res = await fetch('/editor/upload', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ cardId: currentCard.id, filename: file.name, data: b64 }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || '업로드 실패');
      const b = findBlock(rowId);
      if (b?.items?.[itemIdx]) {
        b.items[itemIdx].src = data.path;
        figureEl.querySelector('img').src = `${CARD_DIR}/${currentCard.id}/${data.path}?t=${Date.now()}`;
        showToast('이미지 교체됨 — ⌘S로 저장하세요', 'success');
      }
    } catch (err) {
      showToast('업로드 실패: ' + err.message, 'error');
    } finally {
      figureEl.classList.remove('ed-img-uploading');
    }
  });
  input.click();
}

/* 행 내 항목 핸들 — Sprint C 에서 push-pull 구현. 일단 stub */
function setupRowItemHandles(figure, rowId, itemIdx) {
  figure.querySelectorAll('.ed-img-handle').forEach(handle => {
    handle.addEventListener('mousedown', e => {
      e.preventDefault();
      e.stopPropagation();
      const side  = handle.dataset.side; // 'left' | 'right'
      const block = findBlock(rowId);
      if (!block?.items) return;

      // push-pull 대상: side='right' → 인접 우측 / side='left' → 인접 좌측
      // 양 끝 항목의 바깥 핸들 (neighbor 가 범위 밖) → 반대쪽 인접 항목으로 fallback
      let neighborIdx = side === 'right' ? itemIdx + 1 : itemIdx - 1;
      if (neighborIdx < 0 || neighborIdx >= block.items.length) {
        neighborIdx = side === 'right' ? itemIdx - 1 : itemIdx + 1;
        if (neighborIdx < 0 || neighborIdx >= block.items.length) return; // 행 1개뿐 (이론상 자동 해체됨)
      }

      const startX        = e.clientX;
      const startW        = clampImgW(block.items[itemIdx].w);
      const startNeighbor = clampImgW(block.items[neighborIdx].w);
      // pxPerUnit = 75px 고정 (row width 가 합에 따라 변하므로 row 폭 기반 계산이 부정확)
      const pxPerUnit     = IMG_UNIT_PX;
      let   currentW      = startW;
      let   currentNb     = startNeighbor;

      figure.classList.add('ed-img-resizing');
      figure.parentElement.classList.add('is-resizing'); // row 자체에도 → CSS transition 단축

      // 다른 모든 항목 (자기 제외) 의 시작 합 — 변하지 않음
      const otherSumStart = block.items.reduce(
        (s, it, i) => i === itemIdx ? s : s + clampImgW(it.w), 0
      );

      function onMove(ev) {
        const dx     = ev.clientX - startX;
        const signed = side === 'right' ? dx : -dx;
        const deltaU = Math.round(signed / pxPerUnit);
        let   newW   = Math.max(IMG_MIN_W, Math.min(IMG_MAX_W, startW + deltaU));

        let newNb = startNeighbor;
        // ── 합 분기 ──
        // (newW + otherSumStart) 가 16 이하면 자기만 변경, neighbor 그대로
        // 초과하면 neighbor 에서 보정 (push-pull)
        const tentativeTotal = newW + otherSumStart;
        if (tentativeTotal > IMG_GRID_UNITS) {
          const excess = tentativeTotal - IMG_GRID_UNITS;
          newNb = startNeighbor - excess;
          if (newNb < IMG_MIN_W) {
            const adj = IMG_MIN_W - newNb;
            newW  -= adj;
            newNb  = IMG_MIN_W;
          }
        }
        if (newW !== currentW || newNb !== currentNb) {
          currentW  = newW;
          currentNb = newNb;
          figure.style.setProperty('--row-w', newW);
          figure.dataset.w = newW;
          updateCaptionVisibility(figure, newW);
          const nbFig = figure.parentElement.children[neighborIdx];
          if (newNb !== startNeighbor) {
            nbFig.style.setProperty('--row-w', newNb);
            nbFig.dataset.w = newNb;
          } else {
            nbFig.style.setProperty('--row-w', startNeighbor);
            nbFig.dataset.w = startNeighbor;
          }
          updateCaptionVisibility(nbFig, Number(nbFig.dataset.w));
          // 행 합 갱신 (breakout/wide CSS 분기에 사용)
          const rowEl = figure.parentElement;
          const newTotal = Array.from(rowEl.children).reduce((s, el) => s + Number(el.dataset.w || 0), 0);
          rowEl.dataset.rowTotal = newTotal;
          rowEl.style.setProperty('--row-total', newTotal);
        }
      }

      function onUp() {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup',   onUp);
        figure.classList.remove('ed-img-resizing');
        figure.parentElement.classList.remove('is-resizing');
        if (currentW !== startW) {
          block.items[itemIdx].w     = currentW;
          block.items[neighborIdx].w = currentNb;
          showToast('행 항목 크기 변경 — ⌘S로 저장하세요', 'success');
        }
      }

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup',   onUp);
    });
  });
}

/* ── 이미지: hover/focus 시 .is-hovered/.is-focused 클래스 토글 (CSS :hover/:focus 보조) ── */
function setupImgHoverFocus(figure) {
  figure.addEventListener('mouseenter', () => figure.classList.add('is-hovered'));
  figure.addEventListener('mouseleave', () => figure.classList.remove('is-hovered'));
  figure.addEventListener('focusin',  () => figure.classList.add('is-focused'));
  figure.addEventListener('focusout', () => figure.classList.remove('is-focused'));
}

/* ─────────────────────────────────────────────
   이미지 더보기 메뉴 (⋯) + 선택 상태 + Backspace 삭제 — E4
───────────────────────────────────────────── */

/* 현재 선택된 이미지 figure (전역, 단일 선택만 지원) */
let selectedImgFigure = null;

/* 이미지 figure 의 ··· 메뉴 + 선택 상태 + 키보드 삭제 셋업
   - figure: .ed-img-figure (단일 img 또는 행 항목)
   - context: { type: 'single', blockId } 또는 { type: 'rowItem', rowId, itemIdx } */
function setupImgMoreAndSelect(figure, ctx) {
  // 1) ⋯ 버튼 → 메뉴 popup
  const moreBtn = figure.querySelector('.ed-img-tb-more');
  if (moreBtn) {
    moreBtn.addEventListener('mousedown', e => e.preventDefault());
    moreBtn.addEventListener('click', e => {
      e.stopPropagation();
      openImgMoreMenu(figure, moreBtn, ctx);
    });
  }

  // 2) 이미지 클릭 → 선택 상태 표시 (캡션 / 핸들 / 툴바 영역 제외)
  figure.addEventListener('click', e => {
    // 캡션 / 핸들 / 툴바 클릭은 선택 동작 X
    if (e.target.closest('.ed-img-caption-overlay, .ed-img-handle, .ed-img-toolbar')) return;
    selectImgFigure(figure);
  });
}

function selectImgFigure(figure) {
  if (selectedImgFigure === figure) return;
  if (selectedImgFigure) selectedImgFigure.classList.remove('is-selected');
  selectedImgFigure = figure;
  figure.classList.add('is-selected');
}

function clearImgSelection() {
  if (selectedImgFigure) {
    selectedImgFigure.classList.remove('is-selected');
    selectedImgFigure = null;
  }
}

/* ⋯ 메뉴 popup 생성 / 표시 (toolbar 아래 드롭다운) */
function openImgMoreMenu(figure, anchorBtn, ctx) {
  closeImgMoreMenu();
  const menu = document.createElement('div');
  menu.className = 'ed-img-more-menu';
  menu.innerHTML = `
    <button class="ed-img-mm-item" data-act="duplicate">📋 복제</button>
    <button class="ed-img-mm-item" data-act="delete">🗑 삭제</button>
  `;
  document.body.appendChild(menu);

  // 위치: anchor 버튼 아래 (또는 아래 공간 부족 시 위로)
  // 메뉴 위치는 항상 viewport 안에 clamp (전체너비 ON 등 large figure 시 button 위치가 극단적이어도 안전)
  menu.style.position = 'fixed';
  menu.style.top      = '0px'; // 임시 (offsetHeight 측정 위해 일단 표시)
  menu.style.left     = '0px';
  const r  = anchorBtn.getBoundingClientRect();
  const mw = menu.offsetWidth;
  const mh = menu.offsetHeight;
  const pad = 8;

  // 수직: 아래 우선, 공간 부족 시 위로
  let top;
  if (r.bottom + 4 + mh + pad <= window.innerHeight) {
    top = r.bottom + 4;
  } else if (r.top - 4 - mh >= pad) {
    top = r.top - 4 - mh;
  } else {
    // 위/아래 둘 다 부족 — viewport 안에 clamp
    top = Math.max(pad, Math.min(r.bottom + 4, window.innerHeight - mh - pad));
  }

  // 수평: 버튼 우측 정렬 기본 (right edge align). overflow 시 좌측 정렬
  // ⋯ 버튼이 figure 우상단에 있으니 우측 정렬이 자연스러움
  let left = r.right - mw;
  if (left < pad) left = r.left;
  if (left + mw > window.innerWidth - pad) left = window.innerWidth - mw - pad;
  if (left < pad) left = pad;

  menu.style.top  = top  + 'px';
  menu.style.left = left + 'px';

  // 항목 클릭
  menu.querySelectorAll('.ed-img-mm-item').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const act = btn.dataset.act;
      closeImgMoreMenu();
      if (act === 'duplicate') duplicateImgByCtx(ctx);
      else if (act === 'delete') deleteImgByCtx(ctx);
    });
  });

  // 외부 클릭 시 닫기
  setTimeout(() => {
    document.addEventListener('click', closeImgMoreMenu, { once: true });
  }, 0);
}

function closeImgMoreMenu() {
  document.querySelectorAll('.ed-img-more-menu').forEach(m => m.remove());
}

/* 복제 — 단일 img / 행 항목 양쪽 지원. 복제 후 새 figure 에 강조 애니메이션 */
function duplicateImgByCtx(ctx) {
  if (!ctx) return;
  if (ctx.type === 'single') {
    const b = findBlock(ctx.blockId);
    if (!b || b.type !== 'img') return;
    const copy = makeBlock('img', { src: b.src, caption: b.caption || '', w: clampImgW(b.w), align: b.align || 'center' });
    const idx  = currentCard.blocks.findIndex(x => x.id === ctx.blockId);
    if (idx === -1) return;
    currentCard.blocks.splice(idx + 1, 0, copy);
    rerenderCardBlocks();
    showToast('복제됨 — ⌘S로 저장하세요', 'success');
    // 새 figure 강조
    setTimeout(() => {
      const fig = document.querySelector(`[data-block-id="${copy.id}"] .ed-img-figure:not(.ed-img-row-item)`);
      flashJustDuplicated(fig);
    }, 0);
  } else if (ctx.type === 'rowItem') {
    const row = findBlock(ctx.rowId);
    if (!row || row.type !== 'img-row') return;
    if (row.items.length >= IMG_ROW_MAX) {
      showToast(`행 최대 ${IMG_ROW_MAX}장까지 가능합니다`, 'error');
      return;
    }
    const src = row.items[ctx.itemIdx];
    if (!src) return;
    const copy = { src: src.src, caption: src.caption || '', w: clampImgW(src.w) };
    const newIdx = ctx.itemIdx + 1;
    row.items.splice(newIdx, 0, copy);
    row.items = redistributeRowWidths(row.items);
    rerenderCardBlocks();
    showToast('복제됨 — ⌘S로 저장하세요', 'success');
    setTimeout(() => {
      const fig = document.querySelector(`.ed-img-row[data-row-id="${row.id}"] .ed-img-row-item[data-item-idx="${newIdx}"]`);
      flashJustDuplicated(fig);
    }, 0);
  } else if (ctx.type === 'colImg') {
    const colsBlock = findBlock(ctx.colsBlockId);
    if (!colsBlock) return;
    const col = colsBlock.items?.[ctx.colIdx];
    if (!col) return;
    const b = col.blocks.find(x => x.id === ctx.blockId);
    if (!b || b.type !== 'img') return;

    // 그리드 영역 기반 체크 (수량 제한 X) — insertColIntoTarget 와 동일 기준
    const sum  = colsBlock.items.reduce((s, c) => s + clampImgW(c.w), 0);
    const adjW = clampImgW(col.w || 8);
    const adjShrinkable = Math.max(0, adjW - MIN_COL_W);
    const maxAvailable  = (IMG_GRID_UNITS - sum) + adjShrinkable;
    if (maxAvailable < MIN_COL_W) {
      showToast('컬럼을 더 추가할 공간이 부족합니다 (그리드 영역 초과)', 'error');
      return;
    }

    const copy = makeBlock('img', { src: b.src, caption: b.caption || '', w: 16, align: b.align || 'center' });

    // 새 컬럼 너비 = min(원본, 가용) — MIN_COL_W 이상 보장
    const newColW = Math.max(MIN_COL_W, Math.min(adjW, maxAvailable));
    const overflow = Math.max(0, sum + newColW - IMG_GRID_UNITS);
    if (overflow > 0) {
      // 인접(원본) 컬럼에서 양보
      col.w = adjW - overflow;
    }

    const newCol = { w: newColW, blocks: [copy] };
    colsBlock.items.splice(ctx.colIdx + 1, 0, newCol);
    colsBlock.items = redistributeColWidths(colsBlock.items);

    rerenderCardBlocks();
    showToast('복제됨 — ⌘S로 저장하세요', 'success');

    // 새 컬럼 figure 에 flash 애니메이션 (img-row 복제와 동일 패턴)
    setTimeout(() => {
      const colsEl  = document.querySelector(`[data-block-id="${ctx.colsBlockId}"]`);
      const newColEl = colsEl?.querySelectorAll('.ed-column')?.[ctx.colIdx + 1];
      const fig     = newColEl?.querySelector('.ed-img-col-item');
      if (fig) flashJustDuplicated(fig);
    }, 0);
  }
}

/* 복제 강조 애니메이션 적용 + 500ms 후 클래스 제거 */
function flashJustDuplicated(figure) {
  if (!figure) return;
  figure.classList.add('just-duplicated');
  setTimeout(() => figure.classList.remove('just-duplicated'), 600);
}

/* 삭제 — 단일 img / 행 항목 양쪽 지원 */
function deleteImgByCtx(ctx) {
  if (!ctx) return;
  if (ctx.type === 'single') {
    const idx = currentCard.blocks.findIndex(b => b.id === ctx.blockId);
    if (idx === -1) return;
    currentCard.blocks.splice(idx, 1);
    rerenderCardBlocks();
    showToast('삭제됨 — ⌘S로 저장하세요', 'success');
  } else if (ctx.type === 'rowItem') {
    removeSourceFromOrigin({ type: 'rowItem', rowId: ctx.rowId, itemIdx: ctx.itemIdx });
    rerenderCardBlocks();
    showToast('삭제됨 — ⌘S로 저장하세요', 'success');
  } else if (ctx.type === 'colImg') {
    // 컬럼에서 이미지 삭제 — removeSourceFromOrigin 의 colImg 분기 재사용 (컬럼 정리 + redistribute 포함)
    removeSourceFromOrigin({ type: 'colImg', colsBlockId: ctx.colsBlockId, colIdx: ctx.colIdx, blockId: ctx.blockId });
    rerenderCardBlocks();
    showToast('삭제됨 — ⌘S로 저장하세요', 'success');
  }
  clearImgSelection();
}

/* 전역: 외부 클릭 시 선택 해제 + Backspace/Delete 키로 선택 이미지 삭제 */
function setupGlobalImgKeyboard() {
  document.addEventListener('click', e => {
    // 이미지 영역 또는 더보기 메뉴 클릭이 아니면 선택 해제
    if (!e.target.closest('.ed-img-figure, .ed-img-more-menu')) {
      clearImgSelection();
    }
  }, true);

  document.addEventListener('keydown', e => {
    if (e.key !== 'Backspace' && e.key !== 'Delete') return;
    if (!selectedImgFigure) return;
    // contenteditable / input 에 focus 중이면 텍스트 편집 우선
    const ae = document.activeElement;
    if (ae && (ae.isContentEditable || ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA')) return;
    e.preventDefault();
    // figure 에서 ctx 복원 (문제7 fix: colImg 케이스 추가)
    const fig = selectedImgFigure;
    let ctx;
    if (fig.classList.contains('ed-img-row-item')) {
      ctx = { type: 'rowItem', rowId: fig.dataset.rowId, itemIdx: Number(fig.dataset.itemIdx) };
    } else if (fig.classList.contains('ed-img-col-item')) {
      const colEl = fig.closest('.ed-column');
      ctx = {
        type:        'colImg',
        blockId:     fig.closest('.ed-inner-block')?.dataset.blockId,
        colsBlockId: colEl?.closest('.ed-block')?.dataset.blockId,
        colIdx:      Number(colEl?.dataset.colIdx ?? -1),
      };
    } else {
      ctx = { type: 'single', blockId: fig.closest('.ed-block')?.dataset.blockId };
    }
    deleteImgByCtx(ctx);
  });
}

/* ── 이미지: 하단 캡션 overlay ── */
function setupImgCaption(figure, blockId) {
  const caption = figure.querySelector('.ed-img-caption-overlay');
  if (!caption) return;
  caption.addEventListener('input', () => {
    syncField(blockId, 'caption', caption.textContent);
    // 빈 상태에선 placeholder 동작을 위해 텍스트 완전 비움
    if (!caption.textContent.trim()) caption.textContent = '';
  });
  // 캡션 영역 클릭 시 이벤트 버블 방지 (figure 클릭 → 다른 동작 막기)
  caption.addEventListener('mousedown', e => e.stopPropagation());
}

/* ── YouTube 블록 ── */
function extractYoutubeId(input) {
  if (!input) return null;
  input = input.trim();
  // 11자리 ID 그대로
  if (/^[a-zA-Z0-9_-]{11}$/.test(input)) return input;
  // youtu.be/ID
  const short = input.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
  if (short) return short[1];
  // youtube.com/watch?v=ID 또는 /embed/ID
  const long = input.match(/[?&/](?:v[=/])([a-zA-Z0-9_-]{11})/);
  if (long) return long[1];
  return null;
}

function buildYoutubeInner(inner, block) {
  const wrap = document.createElement('div');
  wrap.className = 'ed-yt-block';

  const vid = extractYoutubeId(block.url);

  if (vid) {
    // ── 미리보기 상태 ──
    wrap.innerHTML = `
      <div class="ed-yt-preview">
        <div class="ed-yt-ratio">
          <iframe src="https://www.youtube.com/embed/${vid}"
            frameborder="0" allowfullscreen
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture">
          </iframe>
        </div>
        <button class="ed-yt-change-btn">URL 변경</button>
      </div>
      <input type="text" class="ed-img-caption-input"
        placeholder="캡션 (선택사항)"
        value="${escHtml(block.caption || '')}">
    `;
    wrap.querySelector('.ed-yt-change-btn').addEventListener('click', () => {
      syncField(block.id, 'url', '');
      const oldEl = document.querySelector(`[data-block-id="${block.id}"]`);
      if (oldEl) oldEl.replaceWith(makeBlockEl(block));
    });
  } else {
    // ── 입력 상태 ──
    wrap.innerHTML = `
      <div class="ed-yt-input-wrap">
        <span class="ed-yt-icon">▶</span>
        <input type="text" class="ed-yt-url-input"
          placeholder="YouTube URL 또는 영상 ID를 붙여넣으세요"
          value="${escHtml(block.url || '')}">
        <button class="ed-yt-apply-btn">적용</button>
      </div>
      <input type="text" class="ed-img-caption-input"
        placeholder="캡션 (선택사항)"
        value="${escHtml(block.caption || '')}">
    `;
    const urlInput = wrap.querySelector('.ed-yt-url-input');
    const apply = () => {
      const val = urlInput.value.trim();
      syncField(block.id, 'url', val);
      const oldEl = document.querySelector(`[data-block-id="${block.id}"]`);
      if (oldEl) oldEl.replaceWith(makeBlockEl(block));
    };
    wrap.querySelector('.ed-yt-apply-btn').addEventListener('click', apply);
    urlInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); apply(); }
    });
  }

  wrap.querySelector('.ed-img-caption-input').addEventListener('input', e => {
    syncField(block.id, 'caption', e.target.value);
  });

  inner.appendChild(wrap);
}

/* ── 코드 블록 ── */
const CODE_LANGS = [
  'plaintext', 'javascript', 'typescript', 'html', 'css',
  'python', 'java', 'kotlin', 'swift', 'json', 'bash', 'sql',
];

function buildCodeInner(inner, block) {
  const wrap = document.createElement('div');
  wrap.className = 'ed-code-block';

  // 언어 선택
  const header = document.createElement('div');
  header.className = 'ed-code-header';

  const sel = document.createElement('select');
  sel.className = 'ed-code-lang';
  CODE_LANGS.forEach(l => {
    const opt = document.createElement('option');
    opt.value = l; opt.textContent = l;
    if (l === (block.lang || 'plaintext')) opt.selected = true;
    sel.appendChild(opt);
  });
  sel.addEventListener('change', () => syncField(block.id, 'lang', sel.value));
  header.appendChild(sel);
  wrap.appendChild(header);

  // 코드 입력 영역
  const ta = document.createElement('textarea');
  ta.className    = 'ed-code-textarea';
  ta.value        = block.code || '';
  ta.spellcheck   = false;
  ta.autocomplete = 'off';
  ta.placeholder  = '코드를 입력하세요...';

  ta.addEventListener('input', () => {
    syncField(block.id, 'code', ta.value);
    resizeCodeTextarea(ta);
  });

  // Tab → 공백 2칸 삽입 (포커스 이탈 방지)
  ta.addEventListener('keydown', e => {
    if (e.key === 'Tab') {
      if (e.isComposing) return;  // 한글 IME 조합 중에는 무시
      e.preventDefault();
      const s = ta.selectionStart, end = ta.selectionEnd;
      ta.value = ta.value.slice(0, s) + '  ' + ta.value.slice(end);
      ta.selectionStart = ta.selectionEnd = s + 2;
      syncField(block.id, 'code', ta.value);
      resizeCodeTextarea(ta);
    }
  });

  wrap.appendChild(ta);
  inner.appendChild(wrap);

  // 초기 높이 조정 (DOM에 삽입된 후)
  requestAnimationFrame(() => resizeCodeTextarea(ta));
}

function resizeCodeTextarea(ta) {
  ta.style.height = 'auto';
  ta.style.height = Math.max(72, ta.scrollHeight) + 'px';
}

/* ════════════════════════════════════════════
   블록 데이터 동기화 (DOM → 상태)
════════════════════════════════════════════ */
function syncText(blockId, text) {
  const b = findBlock(blockId);
  if (b) b.text = text;
}
function syncField(blockId, field, value) {
  const b = findBlock(blockId);
  if (b) b[field] = value;
}
function syncListItems(blockId, listEl) {
  const b = findBlock(blockId);
  if (b) b.items = Array.from(listEl.querySelectorAll('li')).map(li => li.textContent);
}
function findBlock(id, blocks) {
  const list = blocks || currentCard?.blocks || [];
  for (const b of list) {
    if (b.id === id) return b;
    if (b.type === 'columns') {
      for (const col of b.items || []) {
        const found = findBlock(id, col.blocks || []);
        if (found) return found;
      }
    }
  }
  return null;
}

/* img-row → columns in-memory 자동 마이그레이션 (카드 로드 시, 저장 X) */
function migrateImgRowToColumns(blocks) {
  return blocks.map(block => {
    if (block.type !== 'img-row') return block;
    return {
      id: block.id,
      type: 'columns',
      align: block.align || 'center',
      items: (block.items || []).map(item => ({
        w: clampImgW(item.w),
        userSized: true, // img-row 시절 사용자가 설정한 너비 → user-set 으로 간주
        blocks: [{
          id: 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
          type: 'img',
          src: item.src || '',
          caption: item.caption || '',
          w: 16,
          align: 'center',
        }],
      })),
    };
  });
}

/* ════════════════════════════════════════════
   텍스트 키보드 이벤트
════════════════════════════════════════════ */
function onTextKeydown(e, blockId, el) {
  // 한글 IME 조합 중에는 특수키 처리 무시 (중복 입력 방지)
  if (e.isComposing) return;

  // Enter → 새 p 블록 추가
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    insertBlockAfter(blockId, 'p');
    return;
  }

  // Backspace on empty → 블록 삭제 (마지막 1개는 유지)
  if (e.key === 'Backspace' && el.textContent === '') {
    e.preventDefault();
    if (currentCard.blocks.length > 1) {
      const idx = currentCard.blocks.findIndex(b => b.id === blockId);
      deleteBlock(blockId);
      // 이전 블록 포커스
      const container  = document.getElementById('edBlocks');
      const blockEls   = container.querySelectorAll('.ed-block');
      const targetEl   = blockEls[Math.max(0, idx - 1)];
      targetEl?.querySelector('[contenteditable]')?.focus();
    }
    return;
  }

  // '/' 를 빈 블록에서 입력 → 팔레트 열기
  if (e.key === '/' && el.textContent === '') {
    e.preventDefault();
    showPalette({ mode: 'change', blockId, anchorEl: el });
  }
}

/* ════════════════════════════════════════════
   블록 CRUD
════════════════════════════════════════════ */
function insertBlockAfter(afterId, type, data = {}) {
  const idx = currentCard.blocks.findIndex(b => b.id === afterId);
  const newBlock = makeBlock(type, data);
  currentCard.blocks.splice(idx + 1, 0, newBlock);

  const container = document.getElementById('edBlocks');
  const afterEl   = container.querySelector(`[data-block-id="${afterId}"]`);
  const newEl     = makeBlockEl(newBlock);
  afterEl ? afterEl.after(newEl) : container.appendChild(newEl);

  // 새 블록 첫 번째 contenteditable에 포커스
  newEl.querySelector('[contenteditable]')?.focus();
  return newBlock;
}

function deleteBlock(blockId) {
  const idx = currentCard.blocks.findIndex(b => b.id === blockId);
  if (idx === -1) return;
  currentCard.blocks.splice(idx, 1);

  document.querySelector(`[data-block-id="${blockId}"]`)?.remove();

  // 블록이 모두 사라지면 기본 p 추가
  if (currentCard.blocks.length === 0) {
    const nb = makeBlock('p');
    currentCard.blocks.push(nb);
    document.getElementById('edBlocks').appendChild(makeBlockEl(nb));
  }
}

function moveBlock(blockId, dir) {
  const idx    = currentCard.blocks.findIndex(b => b.id === blockId);
  const newIdx = idx + dir;
  if (newIdx < 0 || newIdx >= currentCard.blocks.length) return;

  [currentCard.blocks[idx], currentCard.blocks[newIdx]] =
  [currentCard.blocks[newIdx], currentCard.blocks[idx]];

  const container = document.getElementById('edBlocks');
  const els       = [...container.querySelectorAll('.ed-block')];
  const el        = els[idx];
  const target    = els[newIdx];
  dir < 0 ? container.insertBefore(el, target) : container.insertBefore(target, el);
}

function changeBlockType(blockId, newType) {
  const b = findBlock(blockId);
  if (!b) return;

  // b.text는 HTML일 수 있음 — 텍스트→텍스트 전환은 HTML 유지, 그 외는 plain text 사용
  const oldHtml  = b.text || '';
  const oldPlain = stripHtml(b.text || '') || b.code || '';
  const oldItems = b.items;
  b.type = newType;

  // 데이터 마이그레이션
  if (TEXT_TYPES.has(newType)) {
    b.text = oldHtml;  // HTML 포맷 보존
    delete b.items; delete b.src; delete b.caption; delete b.emoji; delete b.code; delete b.lang;
  } else if (LIST_TYPES.has(newType)) {
    b.items = oldItems || (oldPlain ? [oldPlain] : ['']);  // plain text로 변환
    delete b.text; delete b.src; delete b.caption; delete b.emoji; delete b.code; delete b.lang;
  } else if (newType === 'callout') {
    b.emoji = '💡'; b.text = oldHtml;  // HTML 포맷 보존
    delete b.items; delete b.src; delete b.caption; delete b.code; delete b.lang;
  } else if (newType === 'code') {
    b.lang = b.lang || 'plaintext';
    b.code = oldItems ? oldItems.join('\n') : oldPlain;  // plain text로 변환
    delete b.text; delete b.items; delete b.src; delete b.caption; delete b.emoji;
  } else if (newType === 'youtube') {
    b.url = ''; b.caption = '';
    delete b.text; delete b.items; delete b.src; delete b.emoji; delete b.code; delete b.lang;
  } else if (newType === 'img') {
    b.src = ''; b.caption = '';
    delete b.text; delete b.items; delete b.emoji; delete b.code; delete b.lang; delete b.url;
  } else if (newType === 'divider') {
    delete b.text; delete b.items; delete b.src; delete b.caption; delete b.emoji; delete b.code; delete b.lang; delete b.url;
  }

  // DOM 재렌더링
  const oldEl = document.querySelector(`[data-block-id="${blockId}"]`);
  if (oldEl) {
    const newEl = makeBlockEl(b);
    oldEl.replaceWith(newEl);
    newEl.querySelector('[contenteditable]')?.focus();
  }
  hidePalette();
  closeBlockCtxMenu();
}

function addBlockAtEnd(type) {
  if (!currentCard) return;
  const nb = makeBlock(type);
  currentCard.blocks.push(nb);
  const el = makeBlockEl(nb);
  document.getElementById('edBlocks').appendChild(el);
  el.querySelector('[contenteditable]')?.focus();
  el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  hidePalette();
}

/* ════════════════════════════════════════════
   블록 컨텍스트 메뉴
════════════════════════════════════════════ */
function initBlockCtxMenu() {
  const mainMenu   = document.getElementById('edBlockCtxMenu');
  const convertBtn = document.getElementById('edCtxConvert');
  const colorBtn   = document.getElementById('edCtxColor');
  const convertSub = document.getElementById('edBlockSubMenu');
  const colorSub   = document.getElementById('edBlockColorSub');

  // ── 서브메뉴 호버 시스템 (전환 / 색 공용) ──
  function cancelClose() {
    if (_subCloseTimer) { clearTimeout(_subCloseTimer); _subCloseTimer = null; }
  }
  function scheduleClose() {
    _subCloseTimer = setTimeout(() => { closeSubMenu(); closeColorSub(); }, 180);
  }

  convertBtn.addEventListener('mouseenter', () => {
    cancelClose(); closeColorSub(); openSubMenu();
  });
  colorBtn.addEventListener('mouseenter', () => {
    cancelClose(); closeSubMenu(); openColorSub();
  });

  [mainMenu, convertSub, colorSub].forEach(el => {
    el.addEventListener('mouseenter', cancelClose);
    el.addEventListener('mouseleave', e => {
      const into = e.relatedTarget;
      if ([mainMenu, convertSub, colorSub].some(m => m.contains(into))) return;
      scheduleClose();
    });
  });

  // YouTube URL 변경
  document.getElementById('edCtxYoutubeUrl').addEventListener('click', () => {
    if (ctxMenuBlockId) {
      const b = findBlock(ctxMenuBlockId);
      if (b) {
        b.url = '';
        const oldEl = document.querySelector(`[data-block-id="${ctxMenuBlockId}"]`);
        if (oldEl) oldEl.replaceWith(makeBlockEl(b));
      }
    }
    closeBlockCtxMenu();
  });

  // 복제
  document.getElementById('edCtxDuplicate').addEventListener('click', () => {
    if (ctxMenuBlockId) duplicateBlock(ctxMenuBlockId);
    closeBlockCtxMenu();
  });

  // 위로 이동
  document.getElementById('edCtxMoveUp').addEventListener('click', () => {
    if (ctxMenuBlockId) moveBlock(ctxMenuBlockId, -1);
    closeBlockCtxMenu();
  });

  // 아래로 이동
  document.getElementById('edCtxMoveDown').addEventListener('click', () => {
    if (ctxMenuBlockId) moveBlock(ctxMenuBlockId,  1);
    closeBlockCtxMenu();
  });

  // 삭제
  document.getElementById('edCtxDelete').addEventListener('click', () => {
    if (ctxMenuBlockId) deleteBlock(ctxMenuBlockId);
    closeBlockCtxMenu();
  });
}

function openBlockCtxMenu(blockId, anchorEl) {
  ctxMenuBlockId = blockId;
  const menu = document.getElementById('edBlockCtxMenu');
  const rect = anchorEl.getBoundingClientRect();

  const b = findBlock(blockId);

  // img / divider / youtube 블록은 전환 메뉴 숨김
  const NO_CONVERT = new Set(['img', 'divider', 'youtube']);
  const convertBtn  = document.getElementById('edCtxConvert');
  const convertSep  = document.getElementById('edCtxConvertSep');
  const hideConvert = NO_CONVERT.has(b?.type);
  convertBtn.style.display = hideConvert ? 'none' : '';
  convertSep.style.display = hideConvert ? 'none' : '';

  // 색 메뉴: 텍스트 계열 블록만 표시
  const colorBtn  = document.getElementById('edCtxColor');
  const colorSep  = document.getElementById('edCtxColorSep');
  const showColor = INLINE_COLOR_TYPES.has(b?.type);
  colorBtn.style.display = showColor ? '' : 'none';
  colorSep.style.display = showColor ? '' : 'none';

  // YouTube 전용 "URL 변경" 버튼 표시/숨김
  const ytBtn = document.getElementById('edCtxYoutubeUrl');
  const ytSep = document.getElementById('edCtxYoutubeUrlSep');
  const isYoutube = b?.type === 'youtube';
  ytBtn.style.display = isYoutube ? '' : 'none';
  ytSep.style.display = isYoutube ? '' : 'none';

  // 초기 위치: 핸들 오른쪽
  let left = rect.right + 6;
  let top  = rect.top - 4;

  menu.classList.remove('hidden');

  // 화면 밖으로 나가는 경우 보정
  const mw = menu.offsetWidth;
  const mh = menu.offsetHeight;
  if (left + mw > window.innerWidth - 8)  left = rect.left - mw - 4;
  if (top  + mh > window.innerHeight - 8) top  = window.innerHeight - mh - 8;

  menu.style.left = Math.max(8, left) + 'px';
  menu.style.top  = Math.max(8, top)  + 'px';

  closeSubMenu();
}

function closeBlockCtxMenu() {
  ctxMenuBlockId = null;
  document.getElementById('edBlockCtxMenu').classList.add('hidden');
  closeSubMenu();
  closeColorSub();
}

function openSubMenu() {
  if (!ctxMenuBlockId) return;
  const b       = findBlock(ctxMenuBlockId);
  const mainMenu = document.getElementById('edBlockCtxMenu');
  const sub      = document.getElementById('edBlockSubMenu');

  // 현재 블록이 텍스트 계열이면 img / divider 제외
  const TEXT_LIKE = new Set(['p', 'h1', 'h2', 'h3', 'quote', 'ul', 'ol', 'callout', 'code']);
  const isTextBlock = TEXT_LIKE.has(b?.type);

  // 서브메뉴 내용 구성
  sub.innerHTML = '';
  BLOCK_TYPES.forEach(bt => {
    // 텍스트 블록 → 이미지·YouTube·구분선 전환 비노출 (내용 손실 방지)
    if (isTextBlock && (bt.type === 'img' || bt.type === 'divider' || bt.type === 'youtube')) return;

    const isCurrent = b?.type === bt.type;
    const btn = document.createElement('button');
    btn.className = 'ed-ctx-item' + (isCurrent ? ' ed-ctx-item-current' : '');
    btn.innerHTML = `
      <span class="ed-ctx-icon">${isCurrent ? '✓' : bt.icon}</span>
      <span class="ed-ctx-label">${bt.label}</span>
      <span class="ed-ctx-desc">${bt.desc}</span>
    `;
    btn.addEventListener('click', () => {
      changeBlockType(ctxMenuBlockId, bt.type);
      closeBlockCtxMenu();
    });
    sub.appendChild(btn);
  });

  // 위치: 메인 메뉴 오른쪽
  const mr = mainMenu.getBoundingClientRect();
  let left = mr.right + 2;
  let top  = mr.top;

  sub.classList.remove('hidden');

  const sw = sub.offsetWidth;
  const sh = sub.offsetHeight;
  if (left + sw > window.innerWidth - 8) left = mr.left - sw - 2;
  if (top  + sh > window.innerHeight - 8) top  = window.innerHeight - sh - 8;

  sub.style.left = Math.max(8, left) + 'px';
  sub.style.top  = Math.max(8, top)  + 'px';
}

function closeSubMenu() {
  if (_subCloseTimer) { clearTimeout(_subCloseTimer); _subCloseTimer = null; }
  document.getElementById('edBlockSubMenu').classList.add('hidden');
}

/* ── 블록 색상 서브메뉴 ── */
function openColorSub() {
  if (!ctxMenuBlockId) return;
  const b        = findBlock(ctxMenuBlockId);
  const mainMenu = document.getElementById('edBlockCtxMenu');
  const sub      = document.getElementById('edBlockColorSub');

  sub.innerHTML = '';

  // ── 텍스트 색 섹션 ──
  const textTitle = document.createElement('div');
  textTitle.className   = 'ed-color-sub-title';
  textTitle.textContent = '텍스트 색';
  sub.appendChild(textTitle);

  COLORS.forEach(c => {
    const isActive = (b?.textColor ?? null) === c.text;
    const btn = document.createElement('button');
    btn.className = 'ed-ctx-item' + (isActive ? ' ed-ctx-item-current' : '');

    const sample = document.createElement('span');
    sample.className = 'ed-ctx-color-sample ed-ctx-color-a';
    sample.textContent = 'A';
    if (c.text) sample.style.color = c.text;

    const lbl   = document.createElement('span');
    lbl.className   = 'ed-ctx-label';
    lbl.textContent = c.label + ' 텍스트';

    btn.appendChild(sample);
    btn.appendChild(lbl);
    if (isActive) {
      const chk = document.createElement('span');
      chk.className   = 'ed-ctx-color-check';
      chk.textContent = '✓';
      btn.appendChild(chk);
    }

    btn.addEventListener('click', () => {
      applyBlockColor(ctxMenuBlockId, 'textColor', c.text);
      closeBlockCtxMenu();
    });
    sub.appendChild(btn);
  });

  // ── 구분선 ──
  const sep = document.createElement('div');
  sep.className = 'ed-ctx-sep';
  sub.appendChild(sep);

  // ── 배경 색 섹션 ──
  const bgTitle = document.createElement('div');
  bgTitle.className   = 'ed-color-sub-title';
  bgTitle.textContent = '배경 색';
  sub.appendChild(bgTitle);

  COLORS.forEach(c => {
    const isActive = (b?.bgColor ?? null) === c.bg;
    const btn = document.createElement('button');
    btn.className = 'ed-ctx-item' + (isActive ? ' ed-ctx-item-current' : '');

    const sample = document.createElement('span');
    sample.className = 'ed-ctx-color-sample ed-ctx-color-sq';
    if (c.bg) sample.style.background = c.bg;
    if (!c.bg) sample.classList.add('ed-ctx-color-sq-default');

    const lbl   = document.createElement('span');
    lbl.className   = 'ed-ctx-label';
    lbl.textContent = c.label + ' 배경';

    btn.appendChild(sample);
    btn.appendChild(lbl);
    if (isActive) {
      const chk = document.createElement('span');
      chk.className   = 'ed-ctx-color-check';
      chk.textContent = '✓';
      btn.appendChild(chk);
    }

    btn.addEventListener('click', () => {
      applyBlockColor(ctxMenuBlockId, 'bgColor', c.bg);
      closeBlockCtxMenu();
    });
    sub.appendChild(btn);
  });

  // ── 위치 계산 (전환 서브메뉴와 동일 패턴) ──
  const mr = mainMenu.getBoundingClientRect();
  let left = mr.right + 2;
  let top  = mr.top;

  sub.classList.remove('hidden');

  const sw = sub.offsetWidth;
  const sh = sub.offsetHeight;
  if (left + sw > window.innerWidth  - 8) left = mr.left - sw - 2;
  if (top  + sh > window.innerHeight - 8) top  = window.innerHeight - sh - 8;

  sub.style.left = Math.max(8, left) + 'px';
  sub.style.top  = Math.max(8, top)  + 'px';
}

function closeColorSub() {
  document.getElementById('edBlockColorSub').classList.add('hidden');
}

function applyBlockColor(blockId, field, value) {
  const b = findBlock(blockId);
  if (!b) return;

  // 같은 값 재클릭 → 해제(토글)
  if (b[field] === value || (!value && !b[field])) {
    delete b[field];
  } else {
    if (value) b[field] = value;
    else delete b[field];
  }

  // DOM에 즉시 반영
  const blockEl = document.querySelector(`[data-block-id="${blockId}"]`);
  if (blockEl) {
    const inner  = blockEl.querySelector('.ed-block-inner');
    const textEl = blockEl.querySelector('.ed-text, .ed-callout-text');

    if (field === 'textColor') {
      // .ed-text / .ed-callout-text 에 직접 적용 (CSS color 규칙 우선순위 때문)
      if (textEl) {
        textEl.style.color = b.textColor || '';
        // 블록 색이 통일 적용되도록 기존 인라인 색상 제거
        if (b.textColor) {
          stripInlineColors(textEl);
          syncBlockHtml(blockId, textEl);
        }
      }
    } else if (field === 'bgColor') {
      if (inner) inner.style.backgroundColor = b.bgColor || '';
    }
  }
  showToast('색상 적용됨 — ⌘S로 저장하세요', 'success');
}

/* contenteditable 내부의 인라인 텍스트 색상 제거 */
function stripInlineColors(el) {
  // <span style="color:..."> 등 인라인 color 속성 제거
  el.querySelectorAll('[style]').forEach(node => {
    node.style.color = '';
    if (!node.getAttribute('style') || !node.getAttribute('style').trim()) {
      node.removeAttribute('style');
    }
  });
  // execCommand foreColor 가 생성하는 <font color="..."> 제거
  el.querySelectorAll('font[color]').forEach(node => {
    node.removeAttribute('color');
  });
}

function duplicateBlock(blockId) {
  const b = findBlock(blockId);
  if (!b) return;

  // 딥 카피 + 새 ID 부여
  const copy = JSON.parse(JSON.stringify(b));
  copy.id = 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

  const idx = currentCard.blocks.findIndex(bl => bl.id === blockId);
  currentCard.blocks.splice(idx + 1, 0, copy);

  const container = document.getElementById('edBlocks');
  const origEl    = container.querySelector(`[data-block-id="${blockId}"]`);
  const newEl     = makeBlockEl(copy);
  origEl ? origEl.after(newEl) : container.appendChild(newEl);

  newEl.querySelector('[contenteditable]')?.focus();
  // 복제된 블록 강조 애니메이션 (사용자가 "어디에 추가됐는지" 즉시 인지)
  flashJustDuplicated(newEl);
  showToast('블록이 복제되었습니다', 'success');
}

/* ════════════════════════════════════════════
   커맨드 팔레트
════════════════════════════════════════════ */
function setupPalette() {
  const list = document.getElementById('edPaletteList');
  BLOCK_TYPES.forEach(bt => {
    const btn = document.createElement('button');
    btn.className    = 'ed-palette-item';
    btn.dataset.type = bt.type;
    btn.innerHTML = `
      <span class="ed-palette-icon">${bt.icon}</span>
      <span class="ed-palette-label">${bt.label}</span>
      <span class="ed-palette-desc">${bt.desc}</span>
    `;
    btn.addEventListener('click', () => {
      if (paletteState?.mode === 'change') {
        changeBlockType(paletteState.blockId, bt.type);
      } else {
        addBlockAtEnd(bt.type);
      }
    });
    list.appendChild(btn);
  });
}

function showPalette({ mode, blockId, anchorEl }) {
  paletteState = { mode, blockId, anchorEl };
  const palette = document.getElementById('edPalette');
  const rect    = anchorEl.getBoundingClientRect();

  // 화면 하단 여유 체크
  const spaceBelow = window.innerHeight - rect.bottom;
  if (spaceBelow > 260) {
    palette.style.top    = (rect.bottom + 4) + 'px';
    palette.style.bottom = 'auto';
  } else {
    palette.style.bottom = (window.innerHeight - rect.top + 4) + 'px';
    palette.style.top    = 'auto';
  }
  palette.style.left = Math.max(8, rect.left) + 'px';
  palette.classList.remove('hidden');
}

function hidePalette() {
  paletteState = null;
  document.getElementById('edPalette').classList.add('hidden');
}

/* ════════════════════════════════════════════
   이미지 업로드
════════════════════════════════════════════ */
function pickImage(blockId, container) {
  const input = document.createElement('input');
  input.type   = 'file';
  input.accept = 'image/*';
  input.addEventListener('change', async () => {
    if (input.files[0]) await uploadImage(input.files[0], blockId, container);
  });
  input.click();
}

function setupDropZone(container, blockId) {
  container.addEventListener('dragover', e => {
    // 블록 자체의 드래그앤드롭과 혼선 방지: 파일 드롭일 때만
    if (e.dataTransfer?.types?.includes('Files')) {
      e.preventDefault();
      e.stopPropagation();
      container.querySelector('.ed-img-dropzone')?.classList.add('drag-over');
    }
  });
  container.addEventListener('dragleave', e => {
    if (!container.contains(e.relatedTarget)) {
      container.querySelector('.ed-img-dropzone')?.classList.remove('drag-over');
    }
  });
  container.addEventListener('drop', async e => {
    const file = e.dataTransfer?.files?.[0];
    if (file?.type.startsWith('image/')) {
      e.preventDefault();
      e.stopPropagation();
      container.querySelector('.ed-img-dropzone')?.classList.remove('drag-over');
      await uploadImage(file, blockId, container);
    }
  });
}

async function uploadImage(file, blockId, containerEl) {
  if (!currentCard) return;
  containerEl.classList.add('ed-img-uploading');

  try {
    const b64  = await fileToBase64(file);
    const res  = await fetch('/editor/upload', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ cardId: currentCard.id, filename: file.name, data: b64 }),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || '업로드 실패');

    const b = findBlock(blockId);
    if (b) {
      b.src = data.path;
      // 첫 번째 이미지를 썸네일로
      if (!currentCard.meta.thumb) currentCard.meta.thumb = data.path;

      // 해당 블록 DOM 재렌더링
      const oldEl = document.querySelector(`[data-block-id="${blockId}"]`);
      if (oldEl) oldEl.replaceWith(makeBlockEl(b));
    }
    showToast('이미지 업로드 완료', 'success');
  } catch (err) {
    showToast('업로드 실패: ' + err.message, 'error');
    containerEl.classList.remove('ed-img-uploading');
  }
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader    = new FileReader();
    reader.onload   = e => resolve(e.target.result);
    reader.onerror  = reject;
    reader.readAsDataURL(file);
  });
}

/* ════════════════════════════════════════════
   드래그 앤 드롭 리오더 (블록 순서 변경)
════════════════════════════════════════════ */
function setupBlockDrag(wrap, blockId) {
  wrap.addEventListener('dragstart', e => {
    dragSrcId      = blockId;
    dragSrcRowId   = null;
    dragSrcItemIdx = null;
    wrap.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', blockId); // Firefox 필수
    applyTransparentDragImage(e, wrap);
  });

  wrap.addEventListener('dragend', () => {
    wrap.classList.remove('dragging');
    clearAllDropIndicators();
    dragSrcId      = null;
    dragSrcRowId   = null;
    dragSrcItemIdx = null;
  });

  wrap.addEventListener('dragover', e => {
    if (e.dataTransfer?.types?.includes('Files')) return;
    e.preventDefault();
    const src = getDragSrc();
    if (!src) return;
    if (src.type === 'block' && src.blockId === blockId) return;

    clearAllDropIndicators();

    const block = findBlock(blockId);
    const isImgLike = block?.type === 'img' || block?.type === 'img-row';

    // src 가 img-row 블록 자체면 좌/우 합치기 불가 → 가운데(above/below)만
    const srcBlock     = src.type === 'block' ? findBlock(src.blockId) : null;
    const srcIsImgRow  = srcBlock?.type === 'img-row';
    const allowSideMerge = isImgLike && !srcIsImgRow;

    // 단일 img 의 경우 figure rect 기준으로 좌/우 영역 판단 (이미지 좌우 여백에 가짜 인디케이터 X)
    if (allowSideMerge && block.type === 'img') {
      const figure = wrap.querySelector('.ed-img-figure:not(.ed-img-row-item)');
      if (figure) {
        const r = figure.getBoundingClientRect();
        const xRel = (e.clientX - r.left) / r.width;
        // figure 내부 좌/우 25% 영역만 합치기 인디케이터
        if (xRel >= 0 && xRel <= 1) {
          if (xRel < 0.25) { figure.classList.add('drop-left');  return; }
          if (xRel > 0.75) { figure.classList.add('drop-right'); return; }
        }
      }
    }
    // img-row 블록의 좌/우 합치기는 행 항목 figure 의 dragover 가 처리 (별도)
    // 그 외(가운데 / 비-이미지 / src=img-row) → above/below
    const rect = wrap.getBoundingClientRect();
    wrap.classList.add(e.clientY < rect.top + rect.height / 2 ? 'drop-above' : 'drop-below');
  });

  wrap.addEventListener('dragleave', e => {
    if (!wrap.contains(e.relatedTarget)) {
      wrap.classList.remove('drop-above', 'drop-below', 'drop-left', 'drop-right');
    }
  });

  wrap.addEventListener('drop', e => {
    if (e.dataTransfer?.types?.includes('Files')) return;
    e.preventDefault();
    const src = getDragSrc();
    if (!src) return;

    // drop 의도: figure 의 drop-left/right 또는 wrap 의 drop-above/below
    const singleFig  = wrap.querySelector('.ed-img-figure:not(.ed-img-row-item)');
    const wantsLeft  = singleFig?.classList.contains('drop-left')  || false;
    const wantsRight = singleFig?.classList.contains('drop-right') || false;
    const wantsAbove = wrap.classList.contains('drop-above');
    const wantsBelow = wrap.classList.contains('drop-below');
    clearAllDropIndicators();

    const targetBlock = findBlock(blockId);
    if (!targetBlock) return;

    // ── 좌/우 drop = 행 합치기/추가 ──
    if ((wantsLeft || wantsRight) && (targetBlock.type === 'img' || targetBlock.type === 'img-row')) {
      const side    = wantsLeft ? 'left' : 'right';
      const srcItem = extractSourceItem(src);
      if (!srcItem) return;

      // 자기 자신의 단일 블록 -> 자기 자신 좌/우 drop 은 무의미
      if (src.type === 'block' && src.blockId === blockId) return;

      // 1) 원본에서 제거
      removeSourceFromOrigin(src);

      // 2) target 에 합치기 / 추가
      //    (제거 후 currentCard.blocks 가 재배치되었을 수 있으므로 target 다시 조회)
      const t = findBlock(blockId);
      if (!t) {
        // target 이 사라진 케이스 (예외): 무시하고 재렌더링
        rerenderCardBlocks();
        return;
      }
      if (t.type === 'img') {
        mergeImgsIntoRow(blockId, side, srcItem);
      } else if (t.type === 'img-row') {
        // wrap 의 좌/우 25% drop 은 행 전체의 좌/우 = 0번째 좌 / 마지막+1
        const targetIdx = side === 'left' ? 0 : t.items.length - 1;
        addToRow(blockId, targetIdx, side, srcItem);
      }
      rerenderCardBlocks();
      return;
    }

    // ── 가운데 (above/below) drop = 기존 블록 reorder ──
    if (!wantsAbove && !wantsBelow) return;
    if (src.type === 'block') {
      if (src.blockId === blockId) return;
      const fromIdx = currentCard.blocks.findIndex(b => b.id === src.blockId);
      if (fromIdx === -1) return;
      const [moved] = currentCard.blocks.splice(fromIdx, 1);
      let toIdx = currentCard.blocks.findIndex(b => b.id === blockId);
      if (toIdx === -1) { currentCard.blocks.splice(fromIdx, 0, moved); return; }
      currentCard.blocks.splice(wantsAbove ? toIdx : toIdx + 1, 0, moved);
      rerenderCardBlocks();
    } else if (src.type === 'rowItem') {
      // 행 항목을 일반 블록 사이로 drop → 단일 img 블록으로 추출 후 삽입
      const srcItem = extractSourceItem(src);
      if (!srcItem) return;
      removeSourceFromOrigin(src);
      const newImg = makeBlock('img', { src: srcItem.src, caption: srcItem.caption, w: clampImgW(srcItem.w), align: 'center' });
      let toIdx = currentCard.blocks.findIndex(b => b.id === blockId);
      if (toIdx === -1) return;
      currentCard.blocks.splice(wantsAbove ? toIdx : toIdx + 1, 0, newImg);
      rerenderCardBlocks();
    } else if (src.type === 'colImg') {
      // 컬럼 이미지를 메인 블록으로 꺼내기 → 단일 img 블록으로 추출 후 삽입
      const srcItem = extractSourceItem(src);
      if (!srcItem) return;
      removeSourceFromOrigin(src);
      const newImg = makeBlock('img', { src: srcItem.src, caption: srcItem.caption, w: clampImgW(srcItem.w), align: 'center' });
      let toIdx = currentCard.blocks.findIndex(b => b.id === blockId);
      if (toIdx === -1) return;
      currentCard.blocks.splice(wantsAbove ? toIdx : toIdx + 1, 0, newImg);
      rerenderCardBlocks();
    }
  });
}

/* drag 시 마우스 따라다니는 ghost 를 50% 투명으로 보이게 처리
   - HTML5 native drag API 가 드래그 요소에 자동 투명도를 적용하므로 inline opacity 가 묻힘
   - 해결: native ghost 를 1x1 투명 이미지로 대체해 완전히 숨기고
            우리가 직접 ghost div 를 만들어 마우스 따라가게 (= "forceFallback" 패턴)
   - 결과: ghost = 50% 투명 (마우스 따라감) / 원본 = .dragging .9 = 90% 가시 (드롭 가이드라인 잘 보임) */
const TRANSPARENT_1PX_GIF = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

function applyTransparentDragImage(e, sourceEl) {
  // 1) native ghost 숨김 (1x1 투명 이미지로 대체)
  try {
    const img = new Image();
    img.src = TRANSPARENT_1PX_GIF;
    e.dataTransfer.setDragImage(img, 0, 0);
  } catch (_) {}

  // 2) 수동 ghost 생성 — sourceEl 복제 + 50% 투명 + 마우스 따라가기
  const rect    = sourceEl.getBoundingClientRect();
  const offsetX = e.clientX - rect.left;
  const offsetY = e.clientY - rect.top;

  const ghost = sourceEl.cloneNode(true);
  ghost.style.position      = 'fixed';
  ghost.style.left          = rect.left + 'px';
  ghost.style.top           = rect.top  + 'px';
  ghost.style.opacity       = '0.5';
  ghost.style.pointerEvents = 'none';
  ghost.style.zIndex        = '99999';
  ghost.style.margin        = '0';
  ghost.style.transition    = 'none';
  // 신규 fix: .ed-img-figure.ed-img-col-item { width: 100% !important } 같은
  // CSS !important 가 inline style.width 를 덮어쓰는 문제 → setProperty 로 !important 우선 적용
  ghost.style.setProperty('width',     rect.width  + 'px', 'important');
  ghost.style.setProperty('max-width', rect.width  + 'px', 'important');
  ghost.style.setProperty('height',    rect.height + 'px', 'important');
  ghost.style.setProperty('flex',      'none', 'important'); // flex-basis 등도 무효화 (img-row 대응)
  // 복제본의 .dragging 클래스 제거 (혹시 적용되어 있다면)
  ghost.classList.remove('dragging');
  document.body.appendChild(ghost);

  // 3) 마우스 따라가기 (dragover 이벤트의 clientX/Y 사용)
  function followMouse(ev) {
    if (ev.clientX === 0 && ev.clientY === 0) return; // 일부 브라우저 끝에서 0,0
    ghost.style.left = (ev.clientX - offsetX) + 'px';
    ghost.style.top  = (ev.clientY - offsetY) + 'px';
  }
  document.addEventListener('dragover', followMouse);

  // 4) dragend 시 정리
  function cleanup() {
    ghost.remove();
    document.removeEventListener('dragover', followMouse);
    sourceEl.removeEventListener('dragend', cleanup);
  }
  sourceEl.addEventListener('dragend', cleanup);
}

/* 모든 drop 인디케이터 일괄 초기화 */
function clearAllDropIndicators() {
  document.querySelectorAll('.ed-block, .ed-img-row-item, .ed-img-figure, .ed-img-col-item').forEach(el =>
    el.classList.remove('drop-above', 'drop-below', 'drop-left', 'drop-right'));
}

/* 카드의 모든 블록을 DOM 에 재렌더링 (drag&drop 후 전체 갱신용) */
function rerenderCardBlocks() {
  const container = document.getElementById('edBlocks');
  if (!container || !currentCard) return;
  container.innerHTML = '';
  currentCard.blocks.forEach(b => container.appendChild(makeBlockEl(b)));
}

/* ════════════════════════════════════════════
   페이지 설정 메뉴 (··· 버튼)
════════════════════════════════════════════ */
function initMoreMenu() {
  const btn  = document.getElementById('edMoreBtn');
  const menu = document.getElementById('edMoreMenu');

  btn.addEventListener('click', e => {
    e.stopPropagation();
    if (menu.classList.contains('hidden')) {
      // 현재 상태 반영 후 위치 설정
      updateMoreMenuState();
      const rect = btn.getBoundingClientRect();
      menu.style.right = (window.innerWidth - rect.right) + 'px';
      menu.style.top   = (rect.bottom + 6) + 'px';
      menu.classList.remove('hidden');
    } else {
      menu.classList.add('hidden');
    }
  });

  // 전체 너비 토글
  document.getElementById('edMoreFullwidth').addEventListener('click', async () => {
    if (!currentCard) return;
    currentCard.meta.fullWidth = !(currentCard.meta.fullWidth || false);
    applyEditorFullWidth(currentCard.meta.fullWidth);
    updateMoreMenuState();
    await autoSaveFullWidth();
    menu.classList.add('hidden');
  });
}

function updateMoreMenuState() {
  const on = currentCard?.meta?.fullWidth || false;
  document.getElementById('edMoreFullwidthToggle').classList.toggle('on', on);
}

function applyEditorFullWidth(enabled) {
  document.getElementById('edScroll').classList.toggle('ed-fullwidth', enabled);
}

async function autoSaveFullWidth() {
  if (!currentCard) return;
  try {
    // 현재 입력값 동기화 후 저장
    currentCard.meta.title       = document.getElementById('edTitle').value;
    currentCard.meta.tags        = document.getElementById('edTags').value
      .split(',').map(t => t.trim()).filter(Boolean);
    currentCard.meta.description = document.getElementById('edDesc').value;

    const content = { version: 1, meta: currentCard.meta, blocks: currentCard.blocks };
    const res  = await fetch('/editor/save', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ id: currentCard.id, content }),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error);
    showToast('전체 너비 설정 저장됨 ✓', 'success');
  } catch (err) {
    // 저장 실패 시 토글 상태 원복 (화면↔데이터 불일치 방지)
    if (currentCard) {
      currentCard.meta.fullWidth = !currentCard.meta.fullWidth;
      applyEditorFullWidth(currentCard.meta.fullWidth);
      updateMoreMenuState();
    }
    showToast('저장 실패: ' + err.message, 'error');
  }
}

/* ════════════════════════════════════════════
   인라인 포맷팅 툴바 (경로2: 텍스트 선택)
════════════════════════════════════════════ */
function setupInlineToolbar() {
  const toolbar     = document.getElementById('edInlineToolbar');
  const colorPicker = document.getElementById('edInlineColorPicker');

  // 툴바 / 피커 클릭 시 포커스 이탈 방지
  toolbar.addEventListener('mousedown',     e => e.preventDefault());
  colorPicker.addEventListener('mousedown', e => e.preventDefault());

  // 색상 피커 초기 구성
  buildInlineColorPicker(colorPicker);

  // 버튼 핸들러
  toolbar.querySelectorAll('.ed-it-btn[data-cmd]').forEach(btn => {
    const cmd = btn.dataset.cmd;
    if (cmd === 'color') {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        saveRange();
        toggleInlineColorPicker(btn);
      });
    } else {
      btn.addEventListener('click', () => applyInlineFormat(cmd));
    }
  });

  // selectionchange → 툴바 위치 업데이트 (디바운스)
  document.addEventListener('selectionchange', () => {
    clearTimeout(_toolbarTimer);
    _toolbarTimer = setTimeout(updateInlineToolbar, 60);
  });

  // 외부 클릭 → 색상 피커 닫기 (setupGlobalEvents에서 처리, 여기선 등록 생략)
}

/* 선택 영역이 텍스트 블록 내부인지 확인 → 블록 정보 반환 */
function getActiveInlineBlock() {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || !sel.rangeCount) return null;

  const node      = sel.getRangeAt(0).commonAncestorContainer;
  const el        = node.nodeType === 3 ? node.parentElement : node;
  const contentEl = el?.closest?.('[contenteditable="true"]');
  if (!contentEl) return null;

  const blockEl  = contentEl.closest('.ed-block');
  if (!blockEl)  return null;

  const blockType = blockEl.dataset.blockType;
  if (!INLINE_COLOR_TYPES.has(blockType)) return null;

  return { blockEl, contentEl, blockType, blockId: blockEl.dataset.blockId };
}

/* 툴바 표시 / 위치 계산 */
function updateInlineToolbar() {
  const toolbar = document.getElementById('edInlineToolbar');
  const info    = getActiveInlineBlock();

  if (!info) {
    toolbar.classList.add('hidden');
    return;
  }

  const sel   = window.getSelection();
  const range = sel.getRangeAt(0);
  const rect  = range.getBoundingClientRect();
  if (!rect.width && !rect.height) { toolbar.classList.add('hidden'); return; }

  toolbar.classList.remove('hidden');

  const tw   = toolbar.offsetWidth;
  const th   = toolbar.offsetHeight;
  let   left = rect.left + (rect.width - tw) / 2;
  left = Math.max(8, Math.min(left, window.innerWidth - tw - 8));
  let top = rect.top - th - 10;
  if (top < 8) top = rect.bottom + 8;

  toolbar.style.left = left + 'px';
  toolbar.style.top  = top  + 'px';

  // ── 버튼 active 상태 업데이트 ──
  const STATE_CMDS = {
    bold: 'bold', italic: 'italic',
    underline: 'underline', strikeThrough: 'strikeThrough'
  };
  toolbar.querySelectorAll('.ed-it-btn[data-cmd]').forEach(btn => {
    const cmd = btn.dataset.cmd;
    if (STATE_CMDS[cmd]) {
      btn.classList.toggle('active', document.queryCommandState(cmd));
    }
  });

  // ── A 버튼: 텍스트 색 → 'A' 글자 색 + 하단 bar / 배경 색 → 'A' 글자 배경 ──
  const aEl     = document.getElementById('edItColorA');
  const colorBar = document.getElementById('edItColorBar');

  // 텍스트 색상 (foreColor)
  const fgRaw = document.queryCommandValue('foreColor');
  // 브라우저 기본값(흑색 또는 투명)은 "미설정"으로 처리
  const isDefaultFg = !fgRaw || fgRaw === 'rgb(0, 0, 0)' || fgRaw === 'rgba(0, 0, 0, 0)';
  const fgColor = isDefaultFg ? '' : fgRaw;
  if (aEl)      aEl.style.color           = fgColor || '';
  if (colorBar) colorBar.style.backgroundColor = fgColor;

  // 배경 색상 (hiliteColor → backColor 순으로 시도)
  let bgRaw = '';
  try { bgRaw = document.queryCommandValue('hiliteColor'); } catch (_) {}
  if (!bgRaw) { try { bgRaw = document.queryCommandValue('backColor'); } catch (_) {} }
  const isDefaultBg = !bgRaw || bgRaw === 'rgba(0, 0, 0, 0)' || bgRaw === 'rgb(255, 255, 255)';
  if (aEl) aEl.style.backgroundColor = isDefaultBg ? '' : bgRaw;
}

/* 인라인 포맷 적용 */
function applyInlineFormat(cmd) {
  const info = getActiveInlineBlock();
  if (!info) return;

  if (cmd === 'inlineCode') {
    wrapSelectionWith('code');
  } else {
    document.execCommand(cmd, false, null);
  }
  syncBlockHtml(info.blockId, info.contentEl);
}

/* 선택 영역을 tag로 감싸기 */
function wrapSelectionWith(tag) {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || !sel.rangeCount) return;
  const range = sel.getRangeAt(0);
  const el    = document.createElement(tag);
  try {
    range.surroundContents(el);
  } catch {
    el.appendChild(range.extractContents());
    range.insertNode(el);
  }
}

/* Selection 저장 / 복원 (색상 피커 클릭 전 보존용) */
function saveRange() {
  const sel = window.getSelection();
  if (sel && sel.rangeCount) savedRange = sel.getRangeAt(0).cloneRange();
}
function restoreRange() {
  if (!savedRange) return false;
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(savedRange);
  return true;
}

/* 블록 HTML 동기화 */
function syncBlockHtml(blockId, contentEl) {
  const b = findBlock(blockId);
  if (b) b.text = contentEl.innerHTML;
}

/* ── 인라인 색상 피커 구성 ── */
const RECENT_KEY = 'ed_recent_colors'; // { text: colorVal|null, bg: colorVal|null }

function buildInlineColorPicker(container) {
  container.innerHTML = '';
  const recent = getRecentColors();

  // 최근 사용 (text + bg 각 1개씩, 사용 이력 있을 때만)
  if (recent.text || recent.bg) {
    const recTitle = document.createElement('div');
    recTitle.className   = 'ed-cp-title';
    recTitle.textContent = '최근 사용';
    container.appendChild(recTitle);

    const recRow = document.createElement('div');
    recRow.className = 'ed-cp-row';

    if (recent.text !== undefined) {
      const tc = COLORS.find(c => c.text === recent.text);
      if (tc) recRow.appendChild(makeInlineSwatch(tc, 'text'));
    }
    if (recent.bg !== undefined) {
      const bc = COLORS.find(c => c.bg === recent.bg);
      if (bc) recRow.appendChild(makeInlineSwatch(bc, 'bg'));
    }
    container.appendChild(recRow);

    const sep0 = document.createElement('div');
    sep0.className = 'ed-cp-sep';
    container.appendChild(sep0);
  }

  // 텍스트 색상
  const textTitle = document.createElement('div');
  textTitle.className   = 'ed-cp-title';
  textTitle.textContent = '텍스트 색상';
  container.appendChild(textTitle);

  const textGrid = document.createElement('div');
  textGrid.className = 'ed-cp-grid';
  COLORS.forEach(c => textGrid.appendChild(makeInlineSwatch(c, 'text')));
  container.appendChild(textGrid);

  const sep1 = document.createElement('div');
  sep1.className = 'ed-cp-sep';
  container.appendChild(sep1);

  // 배경 색상
  const bgTitle = document.createElement('div');
  bgTitle.className   = 'ed-cp-title';
  bgTitle.textContent = '배경 색상';
  container.appendChild(bgTitle);

  const bgGrid = document.createElement('div');
  bgGrid.className = 'ed-cp-grid';
  COLORS.forEach(c => bgGrid.appendChild(makeInlineSwatch(c, 'bg')));
  container.appendChild(bgGrid);
}

function makeInlineSwatch(colorDef, mode) {
  const btn = document.createElement('button');
  btn.className = 'ed-cp-swatch';
  btn.title     = colorDef.label + (mode === 'text' ? ' 텍스트' : ' 배경');

  if (mode === 'text') {
    const a = document.createElement('span');
    a.className   = 'ed-cp-a';
    a.textContent = 'A';
    if (colorDef.text) a.style.color = colorDef.text;
    if (!colorDef.text) a.classList.add('ed-cp-a-default');
    btn.appendChild(a);
  } else {
    btn.classList.add('ed-cp-sq');
    if (colorDef.bg) btn.style.background = colorDef.bg;
    else             btn.classList.add('ed-cp-sq-default');
  }

  btn.addEventListener('mousedown', e => e.preventDefault());
  btn.addEventListener('click', () => {
    applyInlineColor(mode, mode === 'text' ? colorDef.text : colorDef.bg);
    document.getElementById('edInlineColorPicker').classList.add('hidden');
  });
  return btn;
}

function toggleInlineColorPicker(anchorBtn) {
  const picker  = document.getElementById('edInlineColorPicker');
  const toolbar = document.getElementById('edInlineToolbar');

  if (!picker.classList.contains('hidden')) {
    picker.classList.add('hidden');
    return;
  }

  buildInlineColorPicker(picker);  // 최근 사용 반영하여 재구성

  // 화면 밖 위치로 숨긴 채 DOM에 올려 크기 측정
  picker.style.visibility = 'hidden';
  picker.style.left = '0px';
  picker.style.top  = '0px';
  picker.classList.remove('hidden');

  const tr = toolbar.getBoundingClientRect();
  const pw = picker.offsetWidth;
  const ph = picker.offsetHeight;

  let left = tr.left;
  let top  = tr.bottom + 6;

  // 화면 밖 보정 (동기)
  if (left + pw > window.innerWidth  - 8) left = Math.max(8, window.innerWidth  - pw - 8);
  if (top  + ph > window.innerHeight - 8) top  = tr.top - ph - 6;

  picker.style.left       = Math.max(8, left) + 'px';
  picker.style.top        = Math.max(8, top)  + 'px';
  picker.style.visibility = '';
}

function applyInlineColor(mode, value) {
  if (!restoreRange()) return;

  // execCommand 직전에 selection 상태로 blockId 파악 (restoreRange 직후이므로 유효)
  const sel0     = window.getSelection();
  const node0    = sel0?.rangeCount ? sel0.getRangeAt(0).commonAncestorContainer : null;
  const el0      = node0 ? (node0.nodeType === 3 ? node0.parentElement : node0) : null;
  const contEl   = el0?.closest?.('[contenteditable="true"]');
  const blockId0 = contEl?.closest?.('.ed-block')?.dataset?.blockId;

  if (mode === 'text') {
    if (value) document.execCommand('foreColor',   false, value);
    else       document.execCommand('removeFormat', false, null);
  } else {
    if (value) {
      try       { document.execCommand('hiliteColor', false, value); }
      catch (e) { document.execCommand('backColor',   false, value); }
    } else {
      // 배경색 제거: 흰색으로 덮은 후 removeFormat
      try       { document.execCommand('hiliteColor', false, 'transparent'); }
      catch (e) { document.execCommand('backColor',   false, 'transparent'); }
    }
  }

  // execCommand 후 selection이 변했을 수 있으므로 이전에 기록해둔 contentEl 사용
  if (blockId0 && contEl) syncBlockHtml(blockId0, contEl);

  saveRecentColor(mode, value);

  // color bar indicator 업데이트
  if (mode === 'text') {
    const bar = document.getElementById('edItColorBar');
    if (bar) bar.style.backgroundColor = value || '';
  }
}

function saveRecentColor(mode, value) {
  if (!value || value === 'transparent') return;  // null/제거 조작은 기록 안 함
  try {
    const data = JSON.parse(localStorage.getItem(RECENT_KEY) || '{}');
    data[mode] = value;
    localStorage.setItem(RECENT_KEY, JSON.stringify(data));
  } catch {}
}

function getRecentColors() {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '{}'); }
  catch { return {}; }
}

/* ── 유틸: HTML → plain text ── */
function stripHtml(html) {
  const d = document.createElement('div');
  d.innerHTML = html;
  return d.textContent || '';
}

/* ════════════════════════════════════════════
   Topbar & 전역 이벤트 설정
════════════════════════════════════════════ */
function setupTopbar() {
  // 저장 버튼
  document.getElementById('edSaveBtn').addEventListener('click', saveCard);

  // 새 카드 버튼
  document.getElementById('edNewCard').addEventListener('click', openNewCardModal);

  // 모달 확인
  document.getElementById('edNewCardConfirm').addEventListener('click', () => {
    const id = document.getElementById('edNewCardId').value.trim();
    if (id) { createNewCard(id); closeNewCardModal(); }
  });
  document.getElementById('edNewCardCancel').addEventListener('click', closeNewCardModal);
  document.getElementById('edNewCardId').addEventListener('keydown', e => {
    if (e.key === 'Enter')  document.getElementById('edNewCardConfirm').click();
    if (e.key === 'Escape') closeNewCardModal();
  });

  // 메타 입력 → 상태 동기화
  document.getElementById('edTitle').addEventListener('input', e => {
    if (currentCard) currentCard.meta.title = e.target.value;
  });
  document.getElementById('edTags').addEventListener('input', e => {
    if (currentCard) currentCard.meta.tags = e.target.value.split(',').map(t => t.trim()).filter(Boolean);
  });
  document.getElementById('edDesc').addEventListener('input', e => {
    if (currentCard) currentCard.meta.description = e.target.value;
  });

  // 블록 추가 버튼
  document.getElementById('edAddBlockBtn').addEventListener('click', e => {
    if (paletteState && !document.getElementById('edPalette').classList.contains('hidden')) {
      hidePalette();
      return;
    }
    showPalette({ mode: 'add', anchorEl: e.currentTarget });
  });
}

function setupGlobalEvents() {
  // Ctrl/Cmd + S → 저장
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); saveCard(); }
    if (e.key === 'Escape') {
      hidePalette();
      closeBlockCtxMenu();
      document.getElementById('edMoreMenu').classList.add('hidden');
    }
  });

  // 팔레트 / 컨텍스트 메뉴 / 더보기 메뉴 / 색상 피커 외부 클릭 → 닫기
  document.addEventListener('click', e => {
    if (!document.getElementById('edPalette').contains(e.target) &&
        e.target.id !== 'edAddBlockBtn') {
      hidePalette();
    }
    const ctxMenu   = document.getElementById('edBlockCtxMenu');
    const subMenu   = document.getElementById('edBlockSubMenu');
    const colorSub  = document.getElementById('edBlockColorSub');
    if (!ctxMenu.contains(e.target) && !subMenu.contains(e.target) &&
        !colorSub.contains(e.target) &&
        !e.target.closest('.ed-drag-handle')) {
      closeBlockCtxMenu();
    }
    const moreMenu = document.getElementById('edMoreMenu');
    if (!moreMenu.contains(e.target) && e.target.id !== 'edMoreBtn') {
      moreMenu.classList.add('hidden');
    }
    // 인라인 색상 피커 닫기
    const inlinePicker = document.getElementById('edInlineColorPicker');
    const toolbar      = document.getElementById('edInlineToolbar');
    if (!inlinePicker.contains(e.target) && !toolbar.contains(e.target)) {
      inlinePicker.classList.add('hidden');
    }
  });

  // 전역 Ctrl+V 이미지 붙여넣기
  document.addEventListener('paste', async e => {
    if (!currentCard) return;
    const items = e.clipboardData?.items || [];
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        // 새 img 블록을 맨 끝에 추가
        const nb = makeBlock('img');
        currentCard.blocks.push(nb);
        const container = document.getElementById('edBlocks');
        const newEl     = makeBlockEl(nb);
        container.appendChild(newEl);
        newEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        const imgWrap = newEl.querySelector('.ed-img-block');
        await uploadImage(file, nb.id, imgWrap);
        break;
      }
    }
  });
}

/* ── 모달 열기/닫기 ── */
function openNewCardModal() {
  document.getElementById('edNewCardModal').classList.remove('hidden');
  document.getElementById('edNewCardId').value = '';
  setTimeout(() => document.getElementById('edNewCardId').focus(), 50);
}
function closeNewCardModal() {
  document.getElementById('edNewCardModal').classList.add('hidden');
}

/* ════════════════════════════════════════════
   저장
════════════════════════════════════════════ */
async function saveCard() {
  if (!currentCard) { showToast('저장할 카드가 없습니다', 'error'); return; }

  const btn = document.getElementById('edSaveBtn');
  btn.textContent = '저장 중...';
  btn.disabled    = true;

  try {
    // 현재 메타 최신화
    currentCard.meta.title       = document.getElementById('edTitle').value;
    currentCard.meta.tags        = document.getElementById('edTags').value
      .split(',').map(t => t.trim()).filter(Boolean);
    currentCard.meta.description = document.getElementById('edDesc').value;

    const content = {
      version: 1,
      meta:    currentCard.meta,
      blocks:  currentCard.blocks,
    };

    const res  = await fetch('/editor/save', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ id: currentCard.id, content }),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || '서버 오류');

    showToast('저장 완료 ✓', 'success');
    btn.textContent = '저장됨 ✓';

    // 사이드바 갱신
    await loadAllCards();
    renderSidebar();

    setTimeout(() => { btn.textContent = '저장 (⌘S)'; btn.disabled = false; }, 2000);

  } catch (err) {
    showToast('저장 실패: ' + err.message, 'error');
    btn.textContent = '저장 (⌘S)';
    btn.disabled    = false;
  }
}

/* ════════════════════════════════════════════
   토스트 알림
════════════════════════════════════════════ */
let _toastTimer = null;
function showToast(msg, type = '') {
  const el = document.getElementById('edToast');
  el.textContent = msg;
  el.className   = 'ed-toast' + (type ? ' ' + type : '');
  if (_toastTimer) clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.add('hidden'), 2800);
}

/* ════════════════════════════════════════════
   유틸
════════════════════════════════════════════ */
function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function caretToEnd(el) {
  const range = document.createRange();
  const sel   = window.getSelection();
  range.selectNodeContents(el);
  range.collapse(false);
  sel?.removeAllRanges();
  sel?.addRange(range);
}
