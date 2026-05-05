/* ─────────────────────────────────────────
   설정
───────────────────────────────────────── */
const API        = 'api.php';
const INTRO_DIR  = 'intro';
const CARD_DIR   = 'card_page';
const RESUME_DIR = 'resume_page';

/* ─────────────────────────────────────────
   상태
───────────────────────────────────────── */
let allCards          = [];       // cards.json에서 로드
let popupIndices      = [];       // 현재 팝업에 로드된 카드 인덱스 목록
let topObserver       = null;
let bottomObserver    = null;
let isLoadingNext     = false;
let isLoadingPrev     = false;
let activePopupScrollEl = null;   // 현재 열린 팝업 스크롤 컨테이너
let popupScrollHandler  = null;   // 팝업 스크롤 이벤트 핸들러 참조

/* ─────────────────────────────────────────
   초기화
───────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', async () => {
  initScrollUI();
  initIntroScroll();
  await loadAndRenderCards();
  initCardPopup();
  initResumePopup();
  initKeyboard();
});

/* ─────────────────────────────────────────
   스크롤 UI: 진행바 + Go to Top
───────────────────────────────────────── */
function initScrollUI() {
  const progressBar = document.getElementById('scrollProgressBar');
  const goTopBtn    = document.getElementById('goTopBtn');
  const header      = document.getElementById('siteHeader');

  window.addEventListener('scroll', () => {
    const scrollY   = window.scrollY;
    const docH      = document.documentElement.scrollHeight - window.innerHeight;
    const pct       = docH > 0 ? (scrollY / docH) * 100 : 0;

    progressBar.style.width = pct + '%';

    // Go to Top 표시
    goTopBtn.classList.toggle('visible', scrollY > 400);

    // 헤더 배경
    header.classList.toggle('scrolled', scrollY > 60);
  }, { passive: true });

  goTopBtn.addEventListener('click', () => {
    if (activePopupScrollEl) {
      activePopupScrollEl.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });
}

function setupPopupGoTop(scrollEl) {
  const goTopBtn = document.getElementById('goTopBtn');
  activePopupScrollEl = scrollEl;
  popupScrollHandler = () => {
    goTopBtn.classList.toggle('visible', scrollEl.scrollTop > 400);
  };
  scrollEl.addEventListener('scroll', popupScrollHandler, { passive: true });
}

function teardownPopupGoTop() {
  const goTopBtn = document.getElementById('goTopBtn');
  if (activePopupScrollEl && popupScrollHandler) {
    activePopupScrollEl.removeEventListener('scroll', popupScrollHandler);
  }
  activePopupScrollEl = null;
  popupScrollHandler  = null;
  goTopBtn.classList.remove('visible');
}

/* ─────────────────────────────────────────
   인트로 스크롤 애니메이션 (Apple-style)
   슬라이드 1: 페이지 진입 0.3초 후 자동 등장
   슬라이드 2·3: 스크롤 연동 등장
───────────────────────────────────────── */
function initIntroScroll() {
  const section = document.getElementById('intro');
  const slides  = [0, 1, 2].map(i => document.getElementById(`introSlide${i}`));
  const dots    = document.querySelectorAll('.intro-dot');
  const cue     = document.getElementById('introCue');

  // 도넛 세그먼트 (r=66, 둘레=2π×66=414.69)
  const C = 414.69;
  const donutSegs = {
    pm:   { el: slides[0]?.querySelector('.donut-pm'),   len: 207.35, offset: 0       },
    uiux: { el: slides[0]?.querySelector('.donut-uiux'), len: 165.88, offset: -207.35 },
    gui:  { el: slides[0]?.querySelector('.donut-gui'),  len: 41.47,  offset: -373.23 },
  };

  // DOM 참조 캐시
  const s1 = {
    line1:  document.getElementById('s1Line1'),
    line2:  document.getElementById('s1Line2'),
    chart:  document.getElementById('s1Chart'),
    suffix: document.getElementById('s1Suffix'),
    footer: slides[0]?.querySelector('.slide-footer'),
    lPm:    document.getElementById('s1LabelPm'),
    lUiux:  document.getElementById('s1LabelUiux'),
    lGui:   document.getElementById('s1LabelGui'),
  };
  const s2 = {
    line1:  document.getElementById('s2Line1'),
    line2:  document.getElementById('s2Line2'),
    footer: slides[1]?.querySelector('.slide-footer'),
  };
  const s3 = {
    line1:  document.getElementById('s3Line1'),
    line2:  document.getElementById('s3Line2'),
    line3:  document.getElementById('s3Line3'),
    footer: slides[2]?.querySelector('.slide-footer'),
  };

  // 도넛 세그먼트 드로잉 헬퍼
  function drawSeg(seg, p, start, end) {
    if (!seg.el) return;
    const drawn = seg.len * ss(remap(p, start, end));
    seg.el.setAttribute('stroke-dasharray',  `${drawn} ${C - drawn}`);
    seg.el.setAttribute('stroke-dashoffset', seg.offset);
  }

  // ── 슬라이드 1: 페이지 진입 0.3초 후 자동 등장 ──
  slides[0].style.opacity = '1';
  slides[0].style.zIndex  = '3';

  const TR = 'opacity 0.65s cubic-bezier(.4,0,.2,1), transform 0.65s cubic-bezier(.4,0,.2,1)';

  [
    [s1.line1,  300 ],
    [s1.line2,  540 ],
    [s1.chart,  780 ],
    [s1.suffix, 900 ],
    [s1.footer, 1100],
  ].forEach(([el, delay]) => {
    if (!el) return;
    setTimeout(() => {
      el.style.transition = TR;
      el.style.opacity    = '1';
      el.style.transform  = 'translateY(0px)';
    }, delay);
  });

  // 도넛 시간 기반 드로잉 (0.78초부터 1.2초간 순차 드로잉)
  setTimeout(() => {
    const dur = 1200;
    const t0  = performance.now();
    (function tick(now) {
      const p = Math.min(1, (now - t0) / dur);
      drawSeg(donutSegs.pm,   p, 0.00, 0.50);
      drawSeg(donutSegs.uiux, p, 0.35, 0.80);
      drawSeg(donutSegs.gui,  p, 0.65, 1.00);
      if (p < 1) {
        requestAnimationFrame(tick);
      } else {
        // 레이블 순차 등장
        [s1.lPm, s1.lUiux, s1.lGui].forEach((el, i) => {
          if (!el) return;
          setTimeout(() => {
            el.style.transition = 'opacity 0.5s ease';
            el.style.opacity    = '1';
          }, i * 140);
        });
      }
    })(performance.now());
  }, 780);

  // ── 스크롤 핸들러: 슬라이드 1 퇴장 + 슬라이드 2·3 전체 제어 ──
  let slide0ExitStarted = false;

  // 슬라이드 2·3의 페이즈 정의
  const phases23 = [
    { enter: 0.10, reveal: 0.28, hold: 0.48, exit: 0.58 },
    { enter: 0.54, reveal: 0.72, hold: 1.00, exit: 1.00 },
  ];

  function clearS1Transitions() {
    [s1.line1, s1.line2, s1.chart, s1.suffix, s1.footer,
     s1.lPm, s1.lUiux, s1.lGui].forEach(el => {
      if (el) el.style.transition = 'none';
    });
  }

  function update() {
    const usable   = section.offsetHeight - window.innerHeight;
    const progress = clamp01((window.scrollY - section.offsetTop) / usable);

    // 슬라이드 1: 퇴장만 스크롤이 제어 (등장은 자동 재생)
    if (progress <= 0.08) {
      slides[0].style.opacity = '1';
      slides[0].style.zIndex  = '3';
    } else {
      if (!slide0ExitStarted) {
        slide0ExitStarted = true;
        clearS1Transitions(); // CSS 트랜지션 제거 → 스크롤 직접 제어
      }
      slides[0].style.opacity = String(1 - ss(remap(progress, 0.08, 0.20)));
      slides[0].style.zIndex  = '1';
    }

    // 슬라이드 2·3: 전체 스크롤 제어
    let activeIndex = 0;
    phases23.forEach((ph, idx) => {
      const slide = slides[idx + 1];
      let op;
      if      (progress <= ph.enter)  op = 0;
      else if (progress <= ph.reveal) op = ss(remap(progress, ph.enter, ph.reveal));
      else if (progress <= ph.hold)   op = 1;
      else if (progress <  ph.exit)   op = 1 - ss(remap(progress, ph.hold, ph.exit));
      else                            op = 0;

      slide.style.opacity = op;
      slide.style.zIndex  = Math.round(op * 3);
      if (op >= 0.5) activeIndex = idx + 1;

      const rev = ss(remap(progress, ph.enter, ph.reveal));
      if (idx === 0) {
        animEl(s2.line1,  rev, 0.00, 0.45);
        animEl(s2.line2,  rev, 0.22, 0.67);
        animOp(s2.footer, rev, 0.50, 0.85);
      } else {
        animEl(s3.line1,  rev, 0.00, 0.40);
        animEl(s3.line2,  rev, 0.20, 0.60);
        animEl(s3.line3,  rev, 0.38, 0.78);
        animOp(s3.footer, rev, 0.60, 0.90);
      }
    });

    // 활성 닷 업데이트
    if (progress > 0.10 && progress <= 0.54) activeIndex = 1;
    else if (progress > 0.54) activeIndex = 2;
    else activeIndex = 0;
    dots.forEach((d, i) => d.classList.toggle('active', i === activeIndex));

    cue.classList.toggle('hidden', window.scrollY > 80);
  }

  window.addEventListener('scroll', update, { passive: true });
  requestAnimationFrame(update);
}

/* ─────────────────────────────────────────
   애니메이션 유틸 (인트로 전용)
───────────────────────────────────────── */
// translateY + opacity: 슬라이드 내 요소 등장
function animEl(el, rev, start, end) {
  if (!el) return;
  const p = ss(remap(rev, start, end));
  el.style.opacity   = p;
  el.style.transform = `translateY(${(1 - p) * 30}px)`;
}

// opacity only: 푸터·레이블 등 위치고정 요소
function animOp(el, rev, start, end) {
  if (!el) return;
  el.style.opacity = ss(remap(rev, start, end));
}

// remap: 값을 [a,b] 범위에서 0→1로 정규화 (clamped)
function remap(v, a, b) { return clamp01((v - a) / (b - a)); }

// smoothstep (ease in-out)
function ss(t) { return t * t * (3 - 2 * t); }

// clamp 0–1
function clamp01(v) { return Math.max(0, Math.min(1, v)); }

/* ─────────────────────────────────────────
   카드 로드 & 렌더링
───────────────────────────────────────── */
async function loadAndRenderCards() {
  const grid    = document.getElementById('cardsGrid');
  const loading = document.getElementById('cardsLoading');

  try {
    const res = await fetch('cards.json');
    allCards = (await res.json()).cards;
  } catch (e) {
    console.error('cards.json 로드 실패:', e);
    loading.innerHTML = '<p style="color:#666;font-size:13px;">카드 데이터를 불러오지 못했습니다.</p>';
    return;
  }

  loading.remove();

  // IntersectionObserver로 카드 등장 애니메이션
  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('revealed');
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });

  for (let i = 0; i < allCards.length; i++) {
    const cardEl = await buildCardElement(allCards[i], i);
    grid.appendChild(cardEl);

    // 스태거 딜레이
    cardEl.style.transitionDelay = `${(i % 3) * 80}ms`;
    revealObserver.observe(cardEl);
  }
}

async function buildCardElement(card, index) {
  const el = document.createElement('div');
  el.className = 'card-item';
  el.dataset.index = index;

  const firstImage = await fetchFirstImage(`${CARD_DIR}/${card.id}`);

  el.innerHTML = `
    <div class="card-thumb">
      <div class="card-thumb-inner" ${firstImage ? `style="background-image:url('${firstImage}')"` : ''}></div>
      <div class="card-thumb-overlay"></div>
      ${!firstImage ? '<div class="card-thumb-empty">◻</div>' : ''}
    </div>
    <div class="card-meta">
      <h3 class="card-title">${escapeHtml(card.title)}</h3>
      <span class="card-type-badge type-${card.type.toLowerCase()}">Type ${card.type}</span>
    </div>
  `;

  el.addEventListener('click', () => openCardPopup(index));
  return el;
}

/* ─────────────────────────────────────────
   카드 팝업
───────────────────────────────────────── */
function initCardPopup() {
  document.getElementById('cardPopupClose').addEventListener('click', closeCardPopup);
  document.getElementById('cardPopupBackdrop').addEventListener('click', closeCardPopup);
}

async function openCardPopup(cardIndex) {
  const popup      = document.getElementById('cardPopup');
  const blocksEl   = document.getElementById('cardPopupBlocks');
  const scrollWrap = document.getElementById('cardPopupScroll');

  // 초기화
  blocksEl.innerHTML = '';
  popupIndices = [];
  isLoadingNext = false;
  isLoadingPrev = false;
  if (topObserver)    topObserver.disconnect();
  if (bottomObserver) bottomObserver.disconnect();

  // 팝업 열기
  popup.classList.add('active');
  document.body.classList.add('popup-open');
  scrollWrap.scrollTop = 0;
  setupPopupGoTop(scrollWrap);

  // 첫 카드 로드
  await appendCardBlock(cardIndex, 'end');

  // 무한 스크롤 설정
  setupPopupInfiniteScroll();
}

function closeCardPopup() {
  const popup = document.getElementById('cardPopup');
  popup.classList.remove('active');
  document.body.classList.remove('popup-open');
  teardownPopupGoTop();
  if (topObserver)    topObserver.disconnect();
  if (bottomObserver) bottomObserver.disconnect();
}

/* 팝업 내 카드 블록 추가 */
async function appendCardBlock(cardIndex, position) {
  if (popupIndices.includes(cardIndex)) return;

  const card     = allCards[cardIndex];
  const blocksEl = document.getElementById('cardPopupBlocks');

  // 블록 엘리먼트 생성
  const block = document.createElement('div');
  block.className = 'card-block';
  block.dataset.cardIndex = cardIndex;

  const firstImage = await fetchFirstImage(`${CARD_DIR}/${card.id}`);

  block.innerHTML = `
    <div class="card-block-header">
      ${firstImage ? `<div class="card-block-header-bg" style="background-image:url('${firstImage}')"></div>` : ''}
      <h2 class="card-block-title">${escapeHtml(card.title)}</h2>
    </div>
    <div class="card-block-body" id="block-body-${cardIndex}">
      <div class="popup-loading"><div class="spinner"></div></div>
    </div>
  `;

  if (position === 'start') {
    const scrollWrap  = document.getElementById('cardPopupScroll');
    const scrollBefore = scrollWrap.scrollTop;
    const heightBefore = blocksEl.scrollHeight;

    blocksEl.insertBefore(block, blocksEl.firstChild);
    popupIndices.unshift(cardIndex);

    // 스크롤 위치 보정 (prepend 후 뷰포트 유지)
    requestAnimationFrame(() => {
      const heightAfter = blocksEl.scrollHeight;
      scrollWrap.scrollTop = scrollBefore + (heightAfter - heightBefore);
    });
  } else {
    blocksEl.appendChild(block);
    popupIndices.push(cardIndex);
  }

  // 콘텐츠 로드
  await loadCardBlockBody(card, cardIndex);
}

async function loadCardBlockBody(card, cardIndex) {
  const bodyEl = document.getElementById(`block-body-${cardIndex}`);
  if (!bodyEl) return;

  if (card.type === 'A') {
    // Type A: iframe으로 커스텀 HTML 로드
    bodyEl.innerHTML = `
      <div class="card-block-iframe-wrap">
        <iframe
          src="${CARD_DIR}/${card.id}/index.html"
          title="${escapeHtml(card.title)}"
          loading="lazy"
          onload="this.style.minHeight=this.contentWindow.document.body.scrollHeight+'px'"
        ></iframe>
      </div>
    `;
  } else {
    // Type B: 폴더 이미지 자동 순차 표시
    try {
      const images = await fetchImages(`${CARD_DIR}/${card.id}`);
      if (images.length === 0) {
        bodyEl.innerHTML = `
          <div class="popup-empty">
            <div class="popup-empty-icon">🖼</div>
            <p>이미지를 <strong>${CARD_DIR}/${card.id}/</strong> 폴더에 추가하면<br>자동으로 표시됩니다.</p>
          </div>`;
      } else {
        bodyEl.innerHTML = `
          <div class="card-block-images">
            ${images.map(f =>
              `<img src="${CARD_DIR}/${card.id}/${f}" alt="${escapeHtml(f)}" loading="lazy">`
            ).join('')}
          </div>`;
      }
    } catch (e) {
      bodyEl.innerHTML = `<div class="popup-empty"><p>콘텐츠를 불러오지 못했습니다.</p></div>`;
    }
  }
}

/* 팝업 무한 스크롤 (이전/다음 카드 자동 로딩) */
function setupPopupInfiniteScroll() {
  const scrollWrap    = document.getElementById('cardPopupScroll');
  const topSentinel   = document.getElementById('cardTopSentinel');
  const bottomSentinel = document.getElementById('cardBottomSentinel');

  const opts = {
    root: scrollWrap,
    rootMargin: '200px 0px',
    threshold: 0,
  };

  bottomObserver = new IntersectionObserver(async (entries) => {
    if (!entries[0].isIntersecting || isLoadingNext) return;
    const last = popupIndices[popupIndices.length - 1];
    if (last < allCards.length - 1) {
      isLoadingNext = true;
      await appendCardBlock(last + 1, 'end');
      isLoadingNext = false;
    }
  }, opts);

  topObserver = new IntersectionObserver(async (entries) => {
    if (!entries[0].isIntersecting || isLoadingPrev) return;
    const first = popupIndices[0];
    if (first > 0) {
      isLoadingPrev = true;
      await appendCardBlock(first - 1, 'start');
      isLoadingPrev = false;
    }
  }, opts);

  bottomObserver.observe(bottomSentinel);
  topObserver.observe(topSentinel);
}

/* ─────────────────────────────────────────
   이력서 팝업
───────────────────────────────────────── */
let resumeLoaded = false;

function initResumePopup() {
  document.getElementById('resumeBtn').addEventListener('click', openResumePopup);
  document.getElementById('resumePopupClose').addEventListener('click', closeResumePopup);
  document.getElementById('resumePopupBackdrop').addEventListener('click', closeResumePopup);
}

async function openResumePopup() {
  const popup    = document.getElementById('resumePopup');
  const blocksEl = document.getElementById('resumePopupBlocks');

  const scrollWrapResume = document.getElementById('resumePopupScroll');
  popup.classList.add('active');
  document.body.classList.add('popup-open');
  setupPopupGoTop(scrollWrapResume);

  if (!resumeLoaded) {
    resumeLoaded = true;
    try {
      const files  = await fetchImages(RESUME_DIR); // PDF 포함
      const pdfs   = files.filter(f => f.toLowerCase().endsWith('.pdf'));
      const images = files.filter(f => !f.toLowerCase().endsWith('.pdf'));

      if (pdfs.length > 0) {
        // PDF 우선 표시 (첫 번째 PDF를 iframe으로 로드)
        blocksEl.innerHTML = `
          <div class="resume-pdf-wrap">
            <iframe
              class="resume-pdf"
              src="${RESUME_DIR}/${pdfs[0]}"
              title="Resume"
              loading="lazy"
            ></iframe>
          </div>`;
      } else if (images.length > 0) {
        // 이미지 순차 표시
        blocksEl.innerHTML = `
          <div class="resume-block-images">
            ${images.map(f =>
              `<img src="${RESUME_DIR}/${f}" alt="${escapeHtml(f)}" loading="lazy">`
            ).join('')}
          </div>`;
      } else {
        blocksEl.innerHTML = `
          <div class="popup-empty">
            <div class="popup-empty-icon">📄</div>
            <p><strong>${RESUME_DIR}/</strong> 폴더에 PDF 또는 이미지를<br>추가하면 자동으로 표시됩니다.</p>
          </div>`;
      }
    } catch (e) {
      blocksEl.innerHTML = `<div class="popup-empty"><p>이력서를 불러오지 못했습니다.</p></div>`;
    }
  }
}

function closeResumePopup() {
  document.getElementById('resumePopup').classList.remove('active');
  document.body.classList.remove('popup-open');
  teardownPopupGoTop();
}

/* ─────────────────────────────────────────
   키보드 접근성
───────────────────────────────────────── */
function initKeyboard() {
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (document.getElementById('cardPopup').classList.contains('active'))   closeCardPopup();
      if (document.getElementById('resumePopup').classList.contains('active')) closeResumePopup();
    }
  });
}

/* ─────────────────────────────────────────
   유틸리티
───────────────────────────────────────── */

/**
 * 폴더 내 이미지 목록을 반환.
 * 1순위: 폴더 내 files.json (GitHub Pages 등 정적 호스팅)
 * 2순위: api.php (PHP 호스팅 — woobi.co.kr 등)
 */
async function fetchImages(folder) {
  // 1순위: 정적 manifest
  try {
    const res = await fetch(`${folder}/files.json`);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.files)) return data.files;
    }
  } catch { /* fall through */ }

  // 2순위: api.php
  const res = await fetch(`${API}?folder=${encodeURIComponent(folder)}`);
  if (!res.ok) throw new Error(`API 오류: ${res.status}`);
  const data = await res.json();
  return data.files || [];
}

/** 폴더의 첫 번째 이미지 URL을 반환 (썸네일용). 없으면 null. */
async function fetchFirstImage(folder) {
  try {
    const files = await fetchImages(folder);
    return files.length > 0 ? `${folder}/${files[0]}` : null;
  } catch {
    return null;
  }
}

/** XSS 방지 HTML 이스케이프 */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
