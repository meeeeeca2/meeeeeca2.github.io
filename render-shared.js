/* ════════════════════════════════════════════════════════════════════
   render-shared.js — Type M 블록 렌더링 공유 모듈 (E13)

   포폴(script.js)과 에디터 미리보기(preview-stub.html)가 단일 소스 공유.
   순수 렌더 함수/헬퍼/상수만 포함 — 앱 흐름/DOM 전역/라우팅 비의존.

   로드 순서: render-shared.js → script.js (index.html)
              render-shared.js 단독 (preview-stub.html)
═══════════════════════════════════════════════════════════════════════ */

/* ─────────────────────────────────────────
   공유 상수
───────────────────────────────────────── */
const CARD_DIR   = 'card_page';

/* ════════════════════════════════════════════════════════════════════
   Type M 블록 렌더링 시스템 (editor 의 build*Inner 함수 미러링)

   설계 원칙:
   - 컨테이너 (m-columns, m-img-row) 폭: 항상 1200px (16×75px) 고정
     → col.w / row-w = n 은 sum 무관 항상 n×75px 시각 (L31 - 시각 일관성)
   - .ed-block 의 has(.ed-columns/.ed-img-row) 1200px breakout 패턴은
     portfolio 측에서는 .m-columns/.m-img-row 자체에 직접 적용 (block 단위 wrapper 없음)
   - 마이그레이션: img-row 데이터 → columns 데이터 (in-memory)
═══════════════════════════════════════════════════════════════════════ */

const M_IMG_UNIT_PX     = 75;
const M_GRID_UNITS      = 16;
const M_IMG_BREAKOUT_PX = 760;
const LIST_TYPES_M      = new Set(['ul', 'ol']);

/** img-row → columns 마이그레이션 (in-memory, recursive) */
function migrateImgRowToColumns(blocks) {
  if (!Array.isArray(blocks)) return [];
  return blocks.map(block => {
    if (!block || typeof block !== 'object') return block;
    if (block.type !== 'img-row') return block;
    return {
      id: block.id,
      type: 'columns',
      align: block.align || 'center',
      items: (block.items || []).map(item => ({
        w: clampMW(item.w),
        userSized: true, // img-row 시절 사용자가 설정한 너비
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

function clampMW(w) {
  return Math.max(1, Math.min(M_GRID_UNITS, Math.round(Number(w) || 8)));
}

/** YouTube URL / ID 에서 11자리 video ID 추출 (editor.js 와 동일 패턴) */
function extractYoutubeId(input) {
  if (!input) return null;
  input = String(input).trim();
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

function escHtmlM(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Type-M 콘텐츠 삽입 후: 코드 블록 하이라이트 + 복사 버튼 와이어링 */
function highlightAndWireCode(root) {
  if (!root) return;
  root.querySelectorAll('pre.m-code > code').forEach(codeEl => {
    if (codeEl.dataset.hl) return;
    const langCls = [...codeEl.classList].find(c => c.startsWith('language-'));
    if (typeof hljs !== 'undefined' && langCls && langCls !== 'language-plaintext') {
      try { hljs.highlightElement(codeEl); } catch (e) {}
    }
    codeEl.dataset.hl = '1';
  });
  root.querySelectorAll('.m-code-copy').forEach(btn => {
    if (btn.dataset.wired) return;
    btn.dataset.wired = '1';
    btn.addEventListener('click', () => {
      const codeEl = btn.parentElement.querySelector('pre.m-code code');
      if (!codeEl || !navigator.clipboard) return;
      navigator.clipboard.writeText(codeEl.textContent).then(() => {
        btn.textContent = '복사됨';
        btn.classList.add('copied');
        setTimeout(() => { btn.textContent = '복사'; btn.classList.remove('copied'); }, 1500);
      }).catch(() => {});
    });
  });
}

/** 목록 items 정규화 (문자열→{text,level:0}, 첫0, level≤직전+1) — editor normalizeListItems 와 동일 규칙 */
function normalizeListItemsM(items) {
  const arr = Array.isArray(items) ? items : [];
  let prev = -1;
  return arr.map((it, i) => {
    const text  = typeof it === 'string' ? it : (it?.text ?? '');
    let level   = (it && Number.isFinite(it.level)) ? Math.max(0, Math.min(4, Math.floor(it.level))) : 0;
    level = (i === 0) ? 0 : Math.min(level, prev + 1);
    prev = level;
    return { text, level };
  });
}

/** 플랫+level → 중첩 <ul>/<ol> HTML (editor renderListTree 와 동일 구조 → 시각 일치) */
function buildNestedListHtml(items, tag, styleAttr) {
  if (!items.length) return `<${tag} class="m-${tag}"${styleAttr}></${tag}>`;
  let out = `<${tag} class="m-${tag}"${styleAttr}>`;
  let depth = 0;
  items.forEach((item, i) => {
    const L = item.level;
    if (i === 0) {
      out += `<li>${escHtmlM(item.text)}`;
    } else if (L > depth) {
      out += `<${tag}><li>${escHtmlM(item.text)}`;   // 검증상 +1 → 직전 li 안에 하위 리스트
    } else if (L === depth) {
      out += `</li><li>${escHtmlM(item.text)}`;
    } else {
      out += `</li>`;
      for (let d = depth; d > L; d--) out += `</${tag}></li>`;
      out += `<li>${escHtmlM(item.text)}`;
    }
    depth = L;
  });
  out += `</li>`;
  for (let d = depth; d > 0; d--) out += `</${tag}></li>`;
  out += `</${tag}>`;
  return out;
}

/** 블록 렌더링 디스패처 */
function renderMBlock(block, cardId, opts = {}) {
  if (!block || typeof block !== 'object') return '';
  const isNested = !!opts.isNested;

  // 스타일 누적 (textColor / bgColor)
  const styleParts = [];
  if (block.textColor) styleParts.push(`color:${escHtmlM(block.textColor)}`);
  if (block.bgColor)   styleParts.push(`background:${escHtmlM(block.bgColor)}`);
  const styleAttr = styleParts.length ? ` style="${styleParts.join(';')}"` : '';

  switch (block.type) {
    case 'divider':
      return `<hr class="m-divider">`;

    case 'h1': case 'h2': case 'h3':
      return `<${block.type} class="m-${block.type}"${styleAttr}>${block.text || ''}</${block.type}>`;

    case 'p':
      return `<p class="m-p"${styleAttr}>${block.text || ''}</p>`;

    case 'quote':
      return `<blockquote class="m-quote"${styleAttr}>${block.text || ''}</blockquote>`;

    case 'callout': {
      const emoji = escHtmlM(block.emoji || '💡');
      return `
        <div class="m-callout"${styleAttr}>
          <span class="m-callout-emoji">${emoji}</span>
          <div class="m-callout-text">${block.text || ''}</div>
        </div>`;
    }

    case 'ul': case 'ol': {
      const tag   = block.type;
      const items = normalizeListItemsM(block.items);
      return buildNestedListHtml(items, tag, styleAttr);
    }

    case 'code': {
      const lang = escHtmlM(block.lang || 'plaintext');
      const wrapCls = block.wrap ? ' wrap' : '';
      const langCls = (block.lang && block.lang !== 'plaintext') ? `language-${lang}` : '';
      return `<div class="m-code-wrap">`
        + `<button class="m-code-copy" type="button" aria-label="코드 복사">복사</button>`
        + `<pre class="m-code${wrapCls}"${styleAttr} data-lang="${lang}"><code class="${langCls}">${escHtmlM(block.code || '')}</code></pre>`
        + `</div>`;
    }

    case 'youtube': {
      const vid = extractYoutubeId(block.url);
      if (!vid) return `<div class="m-youtube m-youtube-empty">YouTube URL 없음</div>`;
      return `
        <div class="m-youtube">
          <iframe
            src="https://www.youtube.com/embed/${vid}"
            title="YouTube video"
            frameborder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowfullscreen
            loading="lazy"></iframe>
        </div>`;
    }

    case 'img':
      return renderMImg(block, cardId, isNested);

    case 'img-row':
      // 정상 마이그레이션 후엔 도달 안 함. 안전망 — columns 로 변환 후 재호출
      return renderMBlock(migrateImgRowToColumns([block])[0], cardId, opts);

    case 'columns':
      if (isNested) {
        console.warn('[m-columns] 중첩 columns 감지 — 스킵', block.id);
        return '';
      }
      return renderMColumns(block, cardId);

    default:
      return '';
  }
}

/** 단일 이미지 / 컬럼 내부 이미지 */
function renderMImg(block, cardId, isNested) {
  if (!block.src) return '';
  const w     = clampMW(block.w);
  const align = block.align || 'center';
  const caption = block.caption || '';
  // 자연 치수가 있으면 aspect-ratio 로 로드 전 공간 예약 (layout shift 방지 — 원자적 prepend 의 전제)
  const aspectStyle = (block.nw && block.nh) ? ` style="aspect-ratio:${block.nw}/${block.nh}"` : '';

  if (isNested) {
    // 컬럼 내부 이미지 — 부모 컬럼 폭 100% 채움 (col-item 패턴)
    const captionHidden = ''; // 컬럼 내부에서는 col.w 기준이지만 여기선 모를 수도 — 부모에서 처리
    return `
      <figure class="m-figure m-figure-col-item" data-align="${escHtmlM(align)}" data-w="${w}">
        <img src="${CARD_DIR}/${cardId}/${escHtmlM(block.src)}"
             alt="${escHtmlM(caption)}" loading="lazy" decoding="async"${aspectStyle}>
        ${caption ? `<figcaption class="m-img-caption">${escHtmlM(caption)}</figcaption>` : ''}
      </figure>`;
  }

  // 단일 img — w 기반 절대 폭, breakout 자동 처리
  const isBreakout = w * M_IMG_UNIT_PX > M_IMG_BREAKOUT_PX;
  const cls = ['m-figure'];
  if (isBreakout) cls.push('m-figure-breakout');
  const captionHidden = w <= 2 ? ' caption-hidden' : '';
  return `
    <figure class="${cls.join(' ')}" data-align="${escHtmlM(align)}" data-w="${w}" style="--img-w:${w * M_IMG_UNIT_PX}px">
      <img src="${CARD_DIR}/${cardId}/${escHtmlM(block.src)}"
           alt="${escHtmlM(caption)}" loading="lazy" decoding="async"${aspectStyle}>
      ${caption ? `<figcaption class="m-img-caption${captionHidden}">${escHtmlM(caption)}</figcaption>` : ''}
    </figure>`;
}

/** 컬럼 컨테이너 — 1200px 고정 (totalW=16 멘탈 모델, L31) */
function renderMColumns(block, cardId) {
  if (!Array.isArray(block.items) || block.items.length === 0) return '';
  const colCount    = block.items.length;
  const colGapPx    = 12;
  const totalW      = M_GRID_UNITS; // 항상 16 (editor 와 통일 — L31 fix)
  const actualTotal = block.items.reduce((s, c) => s + (c?.w || 8), 0) || M_GRID_UNITS;
  const totalGap    = (colCount - 1) * colGapPx;

  const colsHtml = block.items.map(col => {
    if (!col || typeof col !== 'object') return '';
    const w        = col.w || 8;
    const pct      = (w / totalW * 100).toFixed(4);
    const gapShare = (totalGap * w / totalW).toFixed(4);
    // col 내부 블록 렌더링 — nested=true (columns 안엔 columns X)
    const innerHtml = (col.blocks || [])
      .filter(b => b && b.type !== 'columns')
      .map(b => {
        // 컬럼 내부 이미지는 col.w ≤ 2 일 때 caption 숨김 처리
        if (b.type === 'img' && w <= 2 && b.caption) {
          const r = renderMBlock(b, cardId, { isNested: true });
          return r.replace('m-img-caption"', 'm-img-caption caption-hidden"');
        }
        return renderMBlock(b, cardId, { isNested: true });
      })
      .join('');
    return `<div class="m-column" data-w="${w}" style="width:calc(${pct}% - ${gapShare}px)">${innerHtml}</div>`;
  }).join('');

  const align = escHtmlM(block.align || 'center');
  return `<div class="m-columns" data-align="${align}" data-cols-total="${actualTotal}" style="--cols-total:${actualTotal}">${colsHtml}</div>`;
}

/* ════════════════════════════════════════════════════════════════════
   모바일 / touch device 이미지 캡션 hybrid 동작 (B12~B14 복구)

   B12. 캡션 tap 토글: 한 번 tap → 보임 / 다시 tap → 닫힘
   B13. 자동 표시: 페이지 로드 직후엔 안 보이고, 스크롤로 이미지가
        화면 안으로 들어올 때 자동 표시 (60% 진입)
   B14. 자동 숨김: 1.5초 후 부드럽게 사라짐

   설계 패턴:
   - L19 (첫 fire 함정): IntersectionObserver 의 initial fire 는 skip
     → 페이지 로드 직후 자동 표시 방지
   - L20 (sticky hover): @media (hover: hover) 분리는 CSS 측에서,
     JS 는 매칭으로 touch 여부 판단
   - L21 (observer root): root = #cardPopupScroll (실제 스크롤 element)
═══════════════════════════════════════════════════════════════════════ */
const _captionTimers = new WeakMap();

function setupMImgCaptions(containerEl, scrollEl) {
  const figures = containerEl.querySelectorAll('.m-figure');
  if (figures.length === 0) return;

  // touch device 만 대상 — desktop 은 CSS @media (hover: hover) 의 :hover 로 처리
  const isTouchDevice = !window.matchMedia('(hover: hover)').matches;
  if (!isTouchDevice) return;

  // B12: tap 토글
  figures.forEach(fig => {
    fig.addEventListener('click', () => {
      fig.classList.toggle('caption-shown');
      // 사용자 명시적 tap = 자동 숨김 timer 취소 (덮어쓰기 방지)
      const t = _captionTimers.get(fig);
      if (t) { clearTimeout(t); _captionTimers.delete(fig); }
    });
  });

  // B13 + B14: IntersectionObserver 자동 표시 + 1.5초 자동 숨김
  // L19 fix: 첫 fire 는 페이지 로드 직후 발생하므로 skip
  let initialFireDone = false;
  const observer = new IntersectionObserver((entries) => {
    if (!initialFireDone) {
      initialFireDone = true;
      return;
    }
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const fig = entry.target;
      // 사용자가 이미 tap 으로 표시 중이면 자동 표시 / 자동 숨김 skip
      if (fig.classList.contains('caption-shown')) return;

      fig.classList.add('caption-shown');
      // 기존 timer 있으면 정리 후 새로 설정
      const oldT = _captionTimers.get(fig);
      if (oldT) clearTimeout(oldT);
      const timer = setTimeout(() => {
        fig.classList.remove('caption-shown');
        _captionTimers.delete(fig);
      }, 1500);
      _captionTimers.set(fig, timer);
    });
  }, {
    root: scrollEl,
    threshold: 0.6,
  });

  figures.forEach(fig => observer.observe(fig));
}
