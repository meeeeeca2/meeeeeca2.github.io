/* ─────────────────────────────────────────
   설정
───────────────────────────────────────── */
const API        = 'api.php';
const INTRO_DIR  = 'intro';
// CARD_DIR 은 render-shared.js 로 이동 (E13)
const RESUME_DIR = 'resume_page';

/* ─────────────────────────────────────────
   상태
───────────────────────────────────────── */
let allCards          = [];       // cards.json에서 로드
let popupIndices      = [];       // 현재 팝업에 로드된 카드 인덱스 목록
let topObserver       = null;     // (미사용 — 하위 호환 유지)
let bottomObserver    = null;     // (미사용 — 하위 호환 유지)
let isLoadingNext     = false;
let isLoadingPrev     = false;
let popupScrollCheck    = null;   // 팝업 무한스크롤 scroll 핸들러 참조 (cleanup용)
let activePopupScrollEl = null;   // 현재 열린 팝업 스크롤 컨테이너
let popupScrollHandler  = null;   // 팝업 goTop 스크롤 이벤트 핸들러 참조
let navTrackHandler     = null;   // 팝업 nav 활성 카드 추적 scroll 핸들러

/* ─────────────────────────────────────────
   초기화
───────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', async () => {
  initScrollUI();
  initIntroScroll();
  initCardsParallax();
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
    lPm:    document.getElementById('s1LabelPm'),
    lUiux:  document.getElementById('s1LabelUiux'),
    lGui:   document.getElementById('s1LabelGui'),
  };
  const s2 = {
    line1:  document.getElementById('s2Line1'),
    line2:  document.getElementById('s2Line2'),
  };
  const s3 = {
    line1:  document.getElementById('s3Line1'),
    line2:  document.getElementById('s3Line2'),
    line3:  document.getElementById('s3Line3'),
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
    [s1.line1, s1.line2, s1.chart, s1.suffix,
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
        animEl(s2.line1, rev, 0.00, 0.45);
        animEl(s2.line2, rev, 0.22, 0.67);
      } else {
        animEl(s3.line1, rev, 0.00, 0.40);
        animEl(s3.line2, rev, 0.20, 0.60);
        animEl(s3.line3, rev, 0.38, 0.78);
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
   카드 리스트 패럴랙스 Peek
   인트로 스크롤 중 카드 섹션이 하단에서 점진적으로 올라오며 노출.
   ─ 인트로 중(progress 0→1): translateY로 카드를 뷰포트 하단에 핀(pin)
   ─ 인트로 후(soft-landing): transform 을 0으로 서서히 돌리며 자연 스크롤 연결
───────────────────────────────────────── */
function initCardsParallax() {
  const introSection = document.getElementById('intro');
  const cardsSection = document.getElementById('cards');

  function update() {
    const vh          = window.innerHeight;
    const introTop    = introSection.offsetTop;
    const introH      = introSection.offsetHeight;   // 280vh
    const introUsable = introH - vh;                 // scroll range of intro
    const cardsDocY   = introTop + introH;            // absolute doc-Y of cards top
    const scrollY     = window.scrollY;
    const progress    = clamp01((scrollY - introTop) / introUsable);

    // 뷰포트 기준 카드 상단 목표 위치: 85vh → 60vh (progress 0 → 1)
    const targetVY = (0.85 - ss(progress) * 0.25) * vh;

    let translateY, opacity;

    if (scrollY <= introTop + introUsable) {
      // ── 인트로 진행 중: 카드를 targetVY에 핀 ──
      // viewport_Y = cardsDocY + translateY − scrollY = targetVY
      // ∴ translateY = targetVY + scrollY − cardsDocY
      translateY = targetVY + scrollY - cardsDocY;
      opacity    = 0.3 + ss(progress) * 0.7;         // 0.30 → 1.00
    } else {
      // ── 인트로 종료 후: 고정 오프셋 유지 → 슬라이드 텍스트와 함께 자연 스크롤 ──
      // progress=1 시점의 translateY = (0.60*vh) − vh = −0.40*vh (baseTY)
      // translateY 를 고정하면 카드가 문서 흐름과 동일한 속도로 스크롤되어
      // 슬라이드3 텍스트와의 간격이 자연스럽게 유지됨.
      translateY = (0.60 * vh) - vh;                 // ≈ −0.40*vh (고정)
      opacity    = 1;
    }

    cardsSection.style.transform = `translateY(${Math.round(translateY)}px)`;
    cardsSection.style.opacity   = String(opacity);
  }

  window.addEventListener('scroll', update, { passive: true });
  requestAnimationFrame(update);
}

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

  // 카드 썸네일 — Type 별 다른 소스 (cards.json thumb / content.json / 폴더)
  const firstImage = await fetchCardThumb(card);

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
  initPopupNav();
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

  // 무한 스크롤 + 네비게이션 설정
  setupPopupInfiniteScroll();
  updateNavActive(cardIndex);
  setupNavScrollTracking(scrollWrap);
}

function closeCardPopup() {
  const popup      = document.getElementById('cardPopup');
  const scrollWrap = document.getElementById('cardPopupScroll');
  popup.classList.remove('active');
  document.body.classList.remove('popup-open');
  teardownPopupGoTop();
  if (popupScrollCheck) {
    scrollWrap.removeEventListener('scroll', popupScrollCheck);
    popupScrollCheck = null;
  }
  if (navTrackHandler) {
    scrollWrap.removeEventListener('scroll', navTrackHandler);
    navTrackHandler = null;
  }
}

/* ─────────────────────────────────────────
   카드 팝업 — 상단 썸네일 네비게이션
───────────────────────────────────────── */

/** 모든 카드 nav 아이템을 한 번 렌더링 (initCardPopup 에서 1회 호출) */
function initPopupNav() {
  const track   = document.getElementById('cardNavTrack');
  const btnPrev = document.getElementById('cardNavPrev');
  const btnNext = document.getElementById('cardNavNext');
  if (!track) return;

  track.innerHTML = '';

  for (let i = 0; i < allCards.length; i++) {
    const card = allCards[i];
    const item = document.createElement('button');
    item.className = 'popup-nav-item';
    item.dataset.navIndex = i;
    item.setAttribute('aria-label', card.title);
    item.innerHTML = `
      <div class="popup-nav-thumb" id="nav-thumb-${i}">
        <span class="popup-nav-thumb-placeholder">◻</span>
      </div>
    `;
    item.addEventListener('click', () => onNavItemClick(i));
    track.appendChild(item);

    // 썸네일 비동기 로딩 (카드 타입별 다른 소스 — cards.json thumb / content.json / 폴더)
    fetchCardThumb(card).then(url => {
      const thumb = document.getElementById(`nav-thumb-${i}`);
      if (thumb && url) {
        thumb.innerHTML = `<img src="${url}" alt="${escapeHtml(card.title)}" loading="lazy">`;
      }
    });
  }

  // 화살표: 트랙 스크롤에 따라 표시/숨기기
  const updateArrows = () => {
    btnPrev.classList.toggle('hidden', track.scrollLeft <= 2);
    btnNext.classList.toggle('hidden',
      track.scrollLeft + track.clientWidth >= track.scrollWidth - 2);
  };
  track.addEventListener('scroll', updateArrows, { passive: true });
  // ResizeObserver로 track 너비 변동 시에도 화살표 상태 업데이트
  new ResizeObserver(updateArrows).observe(track);

  btnPrev.addEventListener('click', () => track.scrollBy({ left: -220, behavior: 'smooth' }));
  btnNext.addEventListener('click', () => track.scrollBy({ left:  220, behavior: 'smooth' }));

  updateArrows();
}

/** nav 활성 아이템 하이라이트 + 트랙 자동 스크롤 */
function updateNavActive(cardIndex) {
  const track = document.getElementById('cardNavTrack');
  if (!track) return;

  track.querySelectorAll('.popup-nav-item').forEach(item => {
    item.classList.toggle('active', parseInt(item.dataset.navIndex) === cardIndex);
  });

  // 활성 아이템을 트랙 중앙으로 부드럽게 스크롤
  const activeItem = track.querySelector(`.popup-nav-item[data-nav-index="${cardIndex}"]`);
  if (activeItem) {
    const targetLeft = activeItem.offsetLeft - (track.clientWidth / 2) + (activeItem.offsetWidth / 2);
    track.scrollTo({ left: Math.max(0, targetLeft), behavior: 'smooth' });
  }
}

/** 팝업 스크롤에 따라 활성 카드를 자동 감지해 nav 업데이트 */
function setupNavScrollTracking(scrollWrap) {
  const blocksEl = document.getElementById('cardPopupBlocks');

  // 기존 핸들러 정리
  if (navTrackHandler) {
    scrollWrap.removeEventListener('scroll', navTrackHandler);
  }

  navTrackHandler = () => {
    const blocks = blocksEl.querySelectorAll('.card-block');
    if (!blocks.length) return;

    // 뷰포트 상단에서 35% 지점에 걸쳐있는 카드를 '현재 카드'로 판단
    const mid = scrollWrap.scrollTop + scrollWrap.clientHeight * 0.35;
    let activeIdx = parseInt(blocks[0].dataset.cardIndex);

    blocks.forEach(block => {
      if (block.offsetTop <= mid) {
        activeIdx = parseInt(block.dataset.cardIndex);
      }
    });

    updateNavActive(activeIdx);
  };

  scrollWrap.addEventListener('scroll', navTrackHandler, { passive: true });
}

/** nav 아이템 클릭 처리 */
async function onNavItemClick(cardIndex) {
  const scrollWrap = document.getElementById('cardPopupScroll');
  const blocksEl   = document.getElementById('cardPopupBlocks');

  if (popupIndices.includes(cardIndex)) {
    // ── 이미 로드된 카드: 해당 블록 상단으로 스크롤 ──
    const block = blocksEl.querySelector(`.card-block[data-card-index="${cardIndex}"]`);
    if (block) {
      // ── 레이아웃-어웨어 커스텀 스무스 스크롤 ──
      // getBoundingClientRect를 매 프레임 재계산하므로, 이전 카드의 이미지·iframe이
      // 로딩되며 레이아웃이 변해도 타깃 위치를 자동으로 추적한다.
      // (기존: 클릭 시점 1회 계산 → 이후 레이아웃 변화에 취약)
      if (window._navScrollRafId) {
        cancelAnimationFrame(window._navScrollRafId);
        window._navScrollRafId = null;
      }

      const startTime  = performance.now();
      const MAX_MS     = 700;
      const wrapBcrTop = scrollWrap.getBoundingClientRect().top; // wrap 위치는 고정

      const tick = () => {
        if (!block.isConnected) { window._navScrollRafId = null; return; }

        const elapsed = performance.now() - startTime;
        const diff    = block.getBoundingClientRect().top - wrapBcrTop;

        // 타깃에 충분히 가까우면 종료
        if (Math.abs(diff) < 1.5) { window._navScrollRafId = null; return; }

        // 타임아웃: 최종 위치로 즉시 스냅
        if (elapsed >= MAX_MS) {
          scrollWrap.scrollTop += diff;
          window._navScrollRafId = null;
          return;
        }

        // 남은 거리의 18%씩 이동 (지수 감속 → 자연스러운 ease-out)
        scrollWrap.scrollTop += diff * 0.18;
        window._navScrollRafId = requestAnimationFrame(tick);
      };

      window._navScrollRafId = requestAnimationFrame(tick);
    }

  } else {
    // ── 미로드 카드: fade-out → 리셋 → 로드 → fade-in ──
    const navItem = document.querySelector(`.popup-nav-item[data-nav-index="${cardIndex}"]`);
    const thumb   = document.getElementById(`nav-thumb-${cardIndex}`);

    // 1. 현재 콘텐츠 페이드 아웃 + nav 로딩 스피너 동시 시작
    blocksEl.classList.add('fading');
    navItem?.classList.add('nav-loading');
    if (thumb) {
      const overlay = document.createElement('div');
      overlay.className = 'nav-loading-overlay';
      thumb.appendChild(overlay);
    }

    // 2. 페이드 아웃 완료 대기 (CSS transition 0.22s 와 맞춤)
    await new Promise(r => setTimeout(r, 240));

    // 3. 콘텐츠 리셋
    blocksEl.innerHTML = '';
    popupIndices   = [];
    isLoadingNext  = false;
    isLoadingPrev  = false;
    if (popupScrollCheck) {
      scrollWrap.removeEventListener('scroll', popupScrollCheck);
      popupScrollCheck = null;
    }
    if (navTrackHandler) {
      scrollWrap.removeEventListener('scroll', navTrackHandler);
      navTrackHandler = null;
    }
    scrollWrap.scrollTop = 0;

    // 4. 새 카드 로드
    await appendCardBlock(cardIndex, 'end');

    // 5. 스피너 제거 + 페이드 인
    navItem?.classList.remove('nav-loading');
    thumb?.querySelector('.nav-loading-overlay')?.remove();
    blocksEl.classList.remove('fading');

    // 6. 무한 스크롤 + nav 재설정
    setupPopupInfiniteScroll();
    updateNavActive(cardIndex);
    setupNavScrollTracking(scrollWrap);
  }
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

  // 헤더 배경 — 카드 타입별 다른 썸네일 소스 사용
  const firstImage = await fetchCardThumb(card);

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
    // ── 원자적 prepend (B1 튐 해결) ──
    // 기존: spinner 끼움 → 비동기 콘텐츠 로드되며 높이 폭증 → ResizeObserver 가 scrollTop 을
    //       최대 5초간 계속 보정 → 사용자가 위로 스크롤하는 도중 발동하면 뷰포트를 아래로 납치(튐).
    // 변경: 콘텐츠를 먼저 완성(이미지 aspect-ratio 로 높이 확정)한 뒤 삽입 + scrollTop 1회 보정.
    //       삽입 시점에 최종 높이가 확정돼 추가 성장이 없으므로 추격 보정 불필요 → 튐 없음.
    await loadCardBlockBody(card, cardIndex, block);   // 아직 DOM 미삽입 — detached block 의 body 채움

    const scrollWrap   = document.getElementById('cardPopupScroll');
    const scrollBefore = scrollWrap.scrollTop;
    const heightBefore = blocksEl.scrollHeight;

    blocksEl.insertBefore(block, blocksEl.firstChild);
    popupIndices.unshift(cardIndex);

    // 삽입으로 위쪽에 더해진 높이만큼 1회만 보정 → 뷰포트의 기존 콘텐츠 위치 유지
    requestAnimationFrame(() => {
      const newH = blocksEl.scrollHeight;
      scrollWrap.scrollTop = scrollBefore + (newH - heightBefore);
    });
    return; // body 는 이미 로드됨
  }

  // position === 'end' (다음 카드 append — 아래로 늘어나므로 보정 불필요)
  blocksEl.appendChild(block);
  popupIndices.push(cardIndex);
  await loadCardBlockBody(card, cardIndex);
}

async function loadCardBlockBody(card, cardIndex, blockEl) {
  // blockEl 이 주어지면(원자적 prepend: 아직 DOM 미삽입) 그 안의 body 를, 아니면 DOM 에서 id 로 찾는다.
  const bodyEl = blockEl
    ? blockEl.querySelector('.card-block-body')
    : document.getElementById(`block-body-${cardIndex}`);
  if (!bodyEl) return;

  if (card.type === 'M') {
    // Type M: 블록 에디터 콘텐츠 — content.json 로드 후 renderMBlock 으로 렌더링
    try {
      const res = await fetch(`${CARD_DIR}/${card.id}/content.json`, { cache: 'no-cache' });
      if (!res.ok) throw new Error('content.json 없음');
      const content = await res.json();
      // 마이그레이션: img-row → columns (in-memory only, 저장 X)
      const blocks    = migrateImgRowToColumns(content.blocks || []);
      const fullWidth = !!content.meta?.fullWidth;
      bodyEl.innerHTML = `
        <div class="type-m-content${fullWidth ? ' full-width' : ''}">
          ${blocks.map(b => renderMBlock(b, card.id)).join('')}
        </div>
      `;

      // 커버 이미지: meta.cover 있으면 bodyEl 앞(header 아래)에 배너 삽입
      if (content.meta?.cover) {
        // 중복 방지: 이미 삽입된 커버 제거
        const cardBlock = bodyEl.closest('.card-block');
        if (cardBlock) {
          const existing = cardBlock.querySelector('.card-block-cover');
          if (existing) existing.remove();
        }
        bodyEl.insertAdjacentHTML('beforebegin',
          `<div class="card-block-cover"><img src="${CARD_DIR}/${card.id}/${escapeHtml(content.meta.cover)}" alt="" loading="lazy" decoding="async"></div>`
        );
      }
      // 모바일 / touch device — 이미지 캡션 hybrid 동작 (B12~B14)
      const scrollEl = document.getElementById('cardPopupScroll');
      const contentEl = bodyEl.querySelector('.type-m-content');
      if (contentEl && scrollEl) setupMImgCaptions(contentEl, scrollEl);
      if (contentEl) highlightAndWireCode(contentEl);
    } catch (e) {
      bodyEl.innerHTML = `<div class="popup-empty"><p>Type M 컨텐츠를 불러오지 못했습니다.</p></div>`;
    }
    return;
  }

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
      const { files: images, dims } = await fetchImagesData(`${CARD_DIR}/${card.id}`);
      if (images.length === 0) {
        bodyEl.innerHTML = `
          <div class="popup-empty">
            <div class="popup-empty-icon">🖼</div>
            <p>이미지를 <strong>${CARD_DIR}/${card.id}/</strong> 폴더에 추가하면<br>자동으로 표시됩니다.</p>
          </div>`;
      } else {
        bodyEl.innerHTML = `
          <div class="card-block-images">
            ${images.map(f => {
              const d = dims[f];
              const ar = (Array.isArray(d) && d[0] && d[1]) ? ` style="aspect-ratio:${d[0]}/${d[1]}"` : '';
              return `<img src="${CARD_DIR}/${card.id}/${f}" alt="${escapeHtml(f)}" loading="lazy"${ar}>`;
            }).join('')}
          </div>`;
      }
    } catch (e) {
      bodyEl.innerHTML = `<div class="popup-empty"><p>콘텐츠를 불러오지 못했습니다.</p></div>`;
    }
  }
}

/* 팝업 무한 스크롤 (이전/다음 카드 자동 로딩)
 *
 * ── 설계 원칙 ──
 * IntersectionObserver 방식 → 방향 감지 방식 모두 scroll anchoring 등
 * 브라우저 내부 scrollTop 변경에 취약했음.
 *
 * 최종 해결: prevEnabled 플래그 방식.
 *   - prevEnabled: 사용자가 EDGE_PX(300px) 이상 스크롤한 후에만 true
 *   - 이전 카드: prevEnabled=true 이고 위로 스크롤해서 상단 EDGE_PX 이내일 때만 로드
 *     → 팝업 최초 진입 시 브라우저가 scroll anchoring 등으로 scrollTop을 건드려도
 *       prevEnabled=false 이므로 이전 카드가 절대 로드되지 않음
 *   - 다음 카드: 하단 EDGE_PX 이내일 때 로드 (방향 무관)
 */
function setupPopupInfiniteScroll() {
  const scrollWrap = document.getElementById('cardPopupScroll');
  const EDGE_PX    = 300;
  let   lastTop    = scrollWrap.scrollTop;
  let   prevEnabled = false; // 사용자가 실제로 내려간 후에만 이전 카드 로딩 허용

  async function check() {
    const top = scrollWrap.scrollTop;

    // 사용자가 EDGE_PX 이상 내려갔을 때 이전 카드 로딩 허용
    if (!prevEnabled && top >= EDGE_PX) {
      prevEnabled = true;
    }

    const scrolledUp = top < lastTop;
    lastTop = top;

    // ── 이전 카드: prevEnabled 이후, 위로 스크롤 + 상단 EDGE_PX 이내 ──
    if (prevEnabled && scrolledUp && top < EDGE_PX && !isLoadingPrev) {
      const first = popupIndices[0];
      if (first > 0) {
        isLoadingPrev = true;
        await appendCardBlock(first - 1, 'start');
        isLoadingPrev = false;
      }
    }

    // ── 다음 카드: 하단 EDGE_PX 이내 (방향 무관) ──
    const remaining = scrollWrap.scrollHeight - top - scrollWrap.clientHeight;
    if (remaining < EDGE_PX && !isLoadingNext) {
      const last = popupIndices[popupIndices.length - 1];
      if (last < allCards.length - 1) {
        isLoadingNext = true;
        await appendCardBlock(last + 1, 'end');
        isLoadingNext = false;
      }
    }
  }

  // 기존 리스너 정리
  if (popupScrollCheck) {
    scrollWrap.removeEventListener('scroll', popupScrollCheck);
  }
  popupScrollCheck = check;
  scrollWrap.addEventListener('scroll', check, { passive: true });

  // 초기 체크: 첫 카드가 짧아 다음 카드가 필요한 경우 대응
  // (이전 카드는 prevEnabled=false 이므로 로드 안 됨)
  requestAnimationFrame(async () => {
    const remaining = scrollWrap.scrollHeight - scrollWrap.scrollTop - scrollWrap.clientHeight;
    if (remaining < EDGE_PX && !isLoadingNext) {
      const last = popupIndices[popupIndices.length - 1];
      if (last < allCards.length - 1) {
        isLoadingNext = true;
        await appendCardBlock(last + 1, 'end');
        isLoadingNext = false;
      }
    }
  });
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
async function fetchImagesData(folder) {
  // 1순위: 정적 manifest { files:[], dims:{name:[w,h]} }
  try {
    const res = await fetch(`${folder}/files.json`);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.files)) return { files: data.files, dims: data.dims || {} };
    }
  } catch { /* fall through */ }

  // 2순위: api.php (dims 없음 → graceful degradation)
  const res = await fetch(`${API}?folder=${encodeURIComponent(folder)}`);
  if (!res.ok) throw new Error(`API 오류: ${res.status}`);
  const data = await res.json();
  return { files: data.files || [], dims: {} };
}

// 호환 래퍼 — 문자열 배열만 필요한 기존 호출부용 (계약 유지)
async function fetchImages(folder) {
  return (await fetchImagesData(folder)).files;
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

/** 카드 썸네일 URL 결정 — 카드 타입별 다른 소스
 *  우선순위:
 *    1. cards.json 의 thumb 필드 (사용자 명시)
 *    2. Type M: content.json meta.thumb → blocks 내 첫 img 자동 검색
 *    3. Type B: 폴더 첫 이미지
 *    4. Type A 등: null (썸네일 없음)
 */
const _thumbCache = new Map();
async function fetchCardThumb(card) {
  if (_thumbCache.has(card.id)) return _thumbCache.get(card.id);
  const result = await _fetchCardThumb(card);
  _thumbCache.set(card.id, result);
  return result;
}
async function _fetchCardThumb(card) {
  // 1. cards.json 의 thumb 필드 (수동 지정)
  if (card.thumb) {
    return `${CARD_DIR}/${card.id}/${card.thumb}`;
  }
  // 2. Type M: content.json 안에서 찾기
  if (card.type === 'M') {
    try {
      const res = await fetch(`${CARD_DIR}/${card.id}/content.json`, { cache: 'no-cache' });
      if (res.ok) {
        const content = await res.json();
        if (content.meta?.thumb) {
          return `${CARD_DIR}/${card.id}/${content.meta.thumb}`;
        }
        // fallback: blocks 안 첫 img 자동 검색 (컬럼/행 안까지 재귀)
        const firstImgSrc = findFirstImgInBlocks(content.blocks || []);
        if (firstImgSrc) {
          return `${CARD_DIR}/${card.id}/${firstImgSrc}`;
        }
        // 이미지 없음 → 합성 썸네일 생성
        const synth = generateSyntheticThumb(card, content);
        if (synth) return synth;
      }
    } catch (_) { /* fallthrough */ }
    return null;
  }
  // 3. Type B: 폴더 첫 이미지 (기존 동작)
  if (card.type === 'B') {
    return await fetchFirstImage(`${CARD_DIR}/${card.id}`);
  }
  // Type A: 썸네일 없음
  return null;
}

/** content.json blocks 안에서 첫 번째 img src 찾기 (재귀: columns/img-row 안까지) */
function findFirstImgInBlocks(blocks) {
  if (!Array.isArray(blocks)) return null;
  for (const b of blocks) {
    if (!b || typeof b !== 'object') continue;
    if (b.type === 'img' && b.src) return b.src;
    if (b.type === 'img-row' && Array.isArray(b.items)) {
      const first = b.items.find(it => it?.src);
      if (first?.src) return first.src;
    }
    if (b.type === 'columns' && Array.isArray(b.items)) {
      for (const col of b.items) {
        if (col?.blocks) {
          const found = findFirstImgInBlocks(col.blocks);
          if (found) return found;
        }
      }
    }
  }
  return null;
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

/**
 * 인라인 HTML 태그 + 엔티티를 제거하고 평문 텍스트만 추출.
 * block.text 등에 <b>, <a>, <br> 등이 포함될 수 있음 → canvas 용으로 clean.
 * DOM 에 붙이지 않으므로 XSS 안전.
 */
function stripHtmlToText(html) {
  if (!html || typeof html !== 'string') return '';
  const d = document.createElement('div');
  d.innerHTML = html;
  return (d.textContent || '').replace(/\s+/g, ' ').trim();
}

/**
 * content.blocks 에서 썸네일 발췌 후보를 추출.
 * 우선순위: callout → quote → fallback(heading + 첫 p).
 * @param {object} content - content.json 파싱 결과
 * @param {object} card    - cards.json 카드 항목 (card.title 폴백용)
 * @returns {{ kind: 'callout'|'quote'|'fallback', emoji?, text?, title?, body? }}
 */
function extractThumbHighlight(content, card) {
  const blocks = Array.isArray(content?.blocks) ? content.blocks : [];

  // 1순위: 첫 callout
  for (const b of blocks) {
    if (b?.type === 'callout') {
      const text = stripHtmlToText(b.text);
      if (text) return { kind: 'callout', emoji: b.emoji || '💡', text };
    }
  }

  // 2순위: 첫 quote
  for (const b of blocks) {
    if (b?.type === 'quote') {
      const text = stripHtmlToText(b.text);
      if (text) return { kind: 'quote', text };
    }
  }

  // 3순위: fallback — 첫 heading + 첫 p
  let title = '';
  let body = '';
  for (const b of blocks) {
    if (!title && (b?.type === 'h1' || b?.type === 'h2' || b?.type === 'h3')) {
      title = stripHtmlToText(b.text);
    }
    if (!body && b?.type === 'p') {
      body = stripHtmlToText(b.text);
    }
    if (title && body) break;
  }
  if (!title) title = content?.meta?.title || card?.title || '';
  return { kind: 'fallback', title, body };
}

/**
 * canvas 워드랩 유틸 — measureText 기반 줄 분할.
 * @returns {string[]} 분할된 줄 배열
 */
function wrapTextToLines(ctx, text, maxWidth) {
  if (!text) return [];
  const words = text.split(' ');
  const lines = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? current + ' ' + word : word;
    if (ctx.measureText(candidate).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/**
 * 이미지 없는 Type M 카드용 합성 썸네일 생성.
 * offscreen canvas 에 발췌 텍스트를 그려 data URL(PNG) 반환.
 * 실패 시 null 반환(안전 폴백).
 * @param {object} card    - cards.json 카드 항목
 * @param {object} content - content.json 파싱 결과
 * @returns {string|null}
 */
function generateSyntheticThumb(card, content) {
  try {
    // --- 치수 ---
    const LOGICAL_W = 800;
    const LOGICAL_H = Math.round(LOGICAL_W * 3.5 / 4); // 700
    const DPR = Math.min(window.devicePixelRatio || 2, 3);
    const canvas = document.createElement('canvas');
    canvas.width  = LOGICAL_W * DPR;
    canvas.height = LOGICAL_H * DPR;
    const ctx = canvas.getContext('2d');
    ctx.scale(DPR, DPR);

    // --- 테마 색상 (CSS 변수 → 폴백) ---
    const root = document.documentElement;
    const cs = getComputedStyle(root);
    const bgCard  = cs.getPropertyValue('--bg-card').trim()  || '#181818';
    const accent  = cs.getPropertyValue('--accent').trim()   || '#beff00';
    const textCol = cs.getPropertyValue('--text').trim()     || '#f0f0f0';
    const muted   = cs.getPropertyValue('--text-muted').trim()|| '#777';

    // --- 배경 그라데이션 ---
    const grad = ctx.createLinearGradient(0, 0, 0, LOGICAL_H);
    grad.addColorStop(0, bgCard);
    grad.addColorStop(1, '#111111');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);

    // --- 액센트 포인트: 좌상단 작은 바 ---
    ctx.fillStyle = accent;
    ctx.globalAlpha = 0.7;
    ctx.fillRect(40, 40, 36, 4);
    ctx.globalAlpha = 1;

    // --- 발췌 추출 ---
    const highlight = extractThumbHighlight(content, card);

    // 텍스트 렌더 영역: 안전 밴드(상단 40 ~ 하단 80%) 안에서 세로 중앙 배치.
    // 하단 ~20% 는 그리드/헤더의 제목 오버레이+그라데이션 구역이라 비움.
    const PAD_X   = 48;
    const TEXT_W  = LOGICAL_W - PAD_X * 2;
    const TOP_PAD = 40;
    const BOTTOM_LIMIT = Math.round(LOGICAL_H * 0.80); // 하단 20% 제목영역 비움
    const BAND_H  = BOTTOM_LIMIT - TOP_PAD;
    const bodyFont  = cs.fontFamily || "'Noto Sans KR', system-ui, sans-serif";
    ctx.textBaseline = 'top';

    // 측정한 콘텐츠 높이를 안전 밴드 안에서 세로 중앙으로
    const centerStart = (totalH) => Math.max(TOP_PAD, TOP_PAD + (BAND_H - totalH) / 2);
    // MAX_LINES 도달 시 마지막 줄 말줄임
    const ellipsisLast = (lines, i, MAX_LINES) =>
      (i === MAX_LINES - 1 && i < lines.length - 1) ? lines[i].slice(0, -1) + '…' : lines[i];

    if (highlight.kind === 'callout') {
      const EMOJI_H = 84, lineH = 42, MAX_LINES = 5;
      ctx.font = `500 30px ${bodyFont}`;
      const lines = wrapTextToLines(ctx, highlight.text, TEXT_W);
      const shown = Math.min(lines.length, MAX_LINES);
      const totalH = EMOJI_H + shown * lineH;
      let y = centerStart(totalH);

      // 이모지 크게
      ctx.font = `72px ${bodyFont}`;
      ctx.fillText(highlight.emoji, PAD_X, y);
      y += EMOJI_H;

      // 발췌 텍스트
      ctx.font = `500 30px ${bodyFont}`;
      ctx.fillStyle = textCol;
      for (let i = 0; i < shown; i++) {
        ctx.fillText(ellipsisLast(lines, i, MAX_LINES), PAD_X, y);
        y += lineH;
      }

    } else if (highlight.kind === 'quote') {
      const Q_H = 74, lineH = 44, MAX_LINES = 5, xOff = PAD_X + 28;
      ctx.font = `italic 30px ${bodyFont}`;
      const lines = wrapTextToLines(ctx, highlight.text, TEXT_W - 28);
      const shown = Math.min(lines.length, MAX_LINES);
      const totalH = Q_H + shown * lineH;
      const y0 = centerStart(totalH);

      // 좌측 액센트 바 — 블록 전체 높이에 맞춤
      ctx.fillStyle = accent;
      ctx.globalAlpha = 0.9;
      ctx.fillRect(PAD_X, y0 + 4, 5, totalH - 8);
      ctx.globalAlpha = 1;

      // 큰따옴표
      let y = y0;
      ctx.font = `bold 68px Georgia, serif`;
      ctx.fillStyle = accent;
      ctx.globalAlpha = 0.5;
      ctx.fillText('"', PAD_X + 22, y);
      ctx.globalAlpha = 1;
      y += Q_H;

      // 발췌 텍스트
      ctx.font = `italic 30px ${bodyFont}`;
      ctx.fillStyle = textCol;
      for (let i = 0; i < shown; i++) {
        ctx.fillText(ellipsisLast(lines, i, MAX_LINES), xOff, y);
        y += lineH;
      }

    } else if (highlight.title || highlight.body) {
      // fallback: 소제목 + 본문 발췌
      const TITLE_LH = 34, TITLE_GAP = 16, BODY_LH = 40, MAX_TITLE = 2, MAX_BODY = 5;
      ctx.font = `600 24px ${bodyFont}`;
      const titleLines = highlight.title ? wrapTextToLines(ctx, highlight.title, TEXT_W) : [];
      const titleShown = Math.min(titleLines.length, MAX_TITLE);
      ctx.font = `400 28px ${bodyFont}`;
      const bodyLines = highlight.body ? wrapTextToLines(ctx, highlight.body, TEXT_W) : [];
      const bodyShown = Math.min(bodyLines.length, MAX_BODY);
      const totalH = (titleShown ? titleShown * TITLE_LH + TITLE_GAP : 0) + bodyShown * BODY_LH;
      let y = centerStart(totalH);

      if (titleShown) {
        ctx.font = `600 24px ${bodyFont}`;
        ctx.fillStyle = accent;
        for (let i = 0; i < titleShown; i++) {
          ctx.fillText(ellipsisLast(titleLines, i, MAX_TITLE), PAD_X, y);
          y += TITLE_LH;
        }
        y += TITLE_GAP;
      }
      if (bodyShown) {
        ctx.font = `400 28px ${bodyFont}`;
        ctx.fillStyle = textCol;
        for (let i = 0; i < bodyShown; i++) {
          ctx.fillText(ellipsisLast(bodyLines, i, MAX_BODY), PAD_X, y);
          y += BODY_LH;
        }
      }

    } else {
      // 최소 표시 — card.title 만이라도 (중앙)
      ctx.font = `500 24px ${bodyFont}`;
      const lines = wrapTextToLines(ctx, card.title || '', TEXT_W);
      const shown = Math.min(lines.length, 3);
      let y = centerStart(shown * 34);
      ctx.fillStyle = muted;
      for (let i = 0; i < shown; i++) {
        ctx.fillText(ellipsisLast(lines, i, 3), PAD_X, y);
        y += 34;
      }
    }

    return canvas.toDataURL('image/png');
  } catch (e) {
    console.warn('[generateSyntheticThumb] 합성 실패:', e);
    return null;
  }
}

/* ════════════════════════════════════════════════════════════════════
   Type M 블록 렌더링 시스템 → render-shared.js 로 이동 (E13)
   (M_IMG_UNIT_PX, M_GRID_UNITS, M_IMG_BREAKOUT_PX, LIST_TYPES_M,
    migrateImgRowToColumns, clampMW, extractYoutubeId, escHtmlM,
    highlightAndWireCode, normalizeListItemsM, buildNestedListHtml,
    renderMBlock, renderMImg, renderMColumns, setupMImgCaptions,
    _captionTimers, CARD_DIR)
═══════════════════════════════════════════════════════════════════════ */

// (함수들은 render-shared.js 로 이동됨 — E13)
