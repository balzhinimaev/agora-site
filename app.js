(() => {
  'use strict';

  const main = document.querySelector('#main');
  const nav = document.querySelector('#primary-nav');
  const menu = document.querySelector('.menu-toggle');
  const toast = document.querySelector('#toast');
  const storageKey = 'agora.library.v1';
  const botUrl = 'https://t.me/burlearn_bot';
  const kinds = { article: 'Статья', school: 'Школа', reading: 'Первоисточник', path: 'Маршрут' };
  let catalog = null;
  let maps = {};
  let toastTimer;
  let storageAvailable = true;
  let currentRoute = {};
  let local = readLocal();

  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const normal = value => String(value ?? '').toLocaleLowerCase('ru').replace(/ё/g, 'е').normalize('NFKC').trim();
  const urlId = value => encodeURIComponent(String(value));
  const bookmark = '<svg width="16" height="18" viewBox="0 0 20 22" fill="none" aria-hidden="true"><path d="M4 2h12v18l-6-4-6 4V2Z" stroke="currentColor" stroke-width="1.5"/></svg>';
  const searchIcon = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" stroke-width="1.5"/><path d="m15.5 15.5 5 5" stroke="currentColor" stroke-width="1.5"/></svg>';
  const arrow = '<span aria-hidden="true">↗</span>';
  const rightArrow = '<span aria-hidden="true">→</span>';

  function readLocal() {
    try {
      const value = JSON.parse(localStorage.getItem(storageKey) || '{}');
      return {
        saved: Array.isArray(value.saved) ? value.saved.filter(item => item && Object.hasOwn(kinds, item.kind) && typeof item.id === 'string').filter((item, index, all) => all.findIndex(other => other.kind === item.kind && other.id === item.id) === index) : [],
        read: Array.isArray(value.read) ? [...new Set(value.read.filter(item => typeof item === 'string'))] : []
      };
    } catch { storageAvailable = false; return { saved: [], read: [] }; }
  }

  function persist() {
    try { localStorage.setItem(storageKey, JSON.stringify(local)); storageAvailable = true; return true; }
    catch { storageAvailable = false; announce('Браузер не разрешил сохранение. Отметки доступны только до закрытия страницы.'); return false; }
  }

  function announce(message) {
    clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.add('visible');
    toastTimer = setTimeout(() => toast.classList.remove('visible'), 4800);
  }

  function safeSource(value) {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && !url.username && !url.password ? url.href : '';
    } catch { return ''; }
  }

  function external(value, label, className = 'text-link') {
    const href = safeSource(value);
    return href ? `<a class="${escape(className)}" href="${escape(href)}" target="_blank" rel="noopener noreferrer">${escape(label)} ${arrow}<span class="sr-only"> (в новой вкладке)</span></a>` : `<span class="muted">${escape(label)} — ссылка недоступна</span>`;
  }

  function telegram(kind, id, label = 'Обсудить в Telegram', className = 'button') {
    const payload = `${kind}_${id}`;
    const href = kind && id && /^[A-Za-z0-9_-]{1,64}$/.test(payload) ? `${botUrl}?start=${payload}` : botUrl;
    return external(href, label, className);
  }

  function routeLink(kind, id, path) {
    return `#/${kind}/${urlId(id)}${path ? `?path=${urlId(path)}` : ''}`;
  }

  function hasItem(kind, id) { return Object.hasOwn(maps, kind) && maps[kind].has(id); }
  function itemTitle(kind, id) { return hasItem(kind, id) ? maps[kind].get(id).title : ''; }
  function isSaved(kind, id) { return local.saved.some(item => item.kind === kind && item.id === id); }
  function isRead(kind, id) { return local.read.includes(`${kind}:${id}`); }
  function sectionTitle(id) { return catalog.sections.find(section => section.id === id)?.title || 'Библиотека'; }
  function groupTitle(id) { return catalog.schoolGroups.find(group => group.id === id)?.title || 'Философская школа'; }
  function articleMinutes(article) { return Math.max(3, Math.ceil([article.explanation, article.distinction, article.objection, article.example, article.reading].join(' ').split(/\s+/).length / 120) + 1); }
  function pathProgress(path) { return path.ids.filter(id => isRead('article', id)).length; }
  function findArticles(ids) { return ids.map(id => maps.article.get(id)).filter(Boolean); }

  function saveButton(kind, id, compact = false) {
    const saved = isSaved(kind, id);
    const title = itemTitle(kind, id);
    return `<button type="button" class="${compact ? 'save-icon' : 'button secondary small'}" data-action="save" data-kind="${escape(kind)}" data-id="${escape(id)}" aria-pressed="${saved}" aria-label="${escape(saved ? `Убрать из сохранённого: ${title}` : `Сохранить: ${title}`)}">${bookmark}${compact ? '' : `<span>${saved ? 'Сохранено' : 'Сохранить'}</span>`}</button>`;
  }

  function readButton(kind, id) {
    const read = isRead(kind, id);
    return `<button class="button secondary small" type="button" data-action="read" data-kind="${escape(kind)}" data-id="${escape(id)}" aria-pressed="${read}">${read ? 'Прочитано ✓' : 'Отметить прочитанным'}</button>`;
  }

  function crumbs(items) {
    return `<nav class="breadcrumbs" aria-label="Хлебные крошки"><a href="#/">Главная</a>${items.map(item => `<span aria-hidden="true">/</span>${item.href ? `<a href="${escape(item.href)}">${escape(item.title)}</a>` : `<span aria-current="page">${escape(item.title)}</span>`}`).join('')}</nav>`;
  }

  function pageHead(title, lead, eyebrow, items = [{ title }]) {
    return `<header class="page-header">${crumbs(items)}${eyebrow ? `<span class="eyebrow">${escape(eyebrow)}</span>` : ''}<h1>${escape(title)}</h1>${lead ? `<p class="lead">${escape(lead)}</p>` : ''}</header>`;
  }

  function searchForm(query = '') {
    return `<form class="search-bar" role="search" action="./"><label class="sr-only" for="site-query">Поиск по статьям, школам, понятиям и первоисточникам</label>${searchIcon}<input id="site-query" name="q" type="search" value="${escape(query)}" placeholder="Вопрос, имя или понятие…" maxlength="180" autocomplete="off"><button type="submit">Найти</button></form>`;
  }

  function empty(title, description, actions = '<a class="button secondary" href="#/library">Открыть библиотеку →</a>') {
    return `<div class="empty-state"><h2>${escape(title)}</h2><p>${escape(description)}</p><div class="actions">${actions}</div></div>`;
  }

  function localNote() {
    return `<div class="local-note">Ваши закладки и отметки о чтении — только в этом браузере, на этом устройстве. Они не синхронизируются с Telegram. Очистка данных сайта удалит их.</div>${!storageAvailable ? '<p class="storage-warning" role="status">Постоянное сохранение недоступно. Сейчас отметки сохраняются лишь до закрытия этой страницы.</p>' : ''}`;
  }

  function articleCard(article, path) {
    return `<article class="card${isRead('article', article.id) ? ' is-read' : ''}"><div class="card-top"><span class="eyebrow">${escape(sectionTitle(article.section))}</span>${saveButton('article', article.id, true)}</div><h3><a href="${routeLink('article', article.id, path)}">${escape(article.title)}</a></h3><p class="card-description">${escape(article.question)}</p><div class="card-foot"><span>${isRead('article', article.id) ? 'Прочитано ✓' : `${articleMinutes(article)} мин · вопрос + разбор`}</span><a href="${routeLink('article', article.id, path)}" aria-label="${escape(`Читать: ${article.title}`)}">Читать ${rightArrow}</a></div></article>`;
  }

  function schoolCard(school) {
    return `<article class="card"><div class="card-top"><span class="eyebrow">${escape(groupTitle(school.group))}</span>${saveButton('school', school.id, true)}</div><h3><a href="${routeLink('school', school.id)}">${escape(school.title)}</a></h3><p class="card-description">${escape(school.question)}</p><div class="card-foot"><span>${escape(school.thinkers.slice(0, 2).join(' · '))}</span><a href="${routeLink('school', school.id)}" aria-label="${escape(`Изучить: ${school.title}`)}">${rightArrow}</a></div></article>`;
  }

  function pathCard(path, index = catalog.paths.indexOf(path)) {
    const count = pathProgress(path);
    return `<article class="card path-card"><div class="card-top"><span class="path-number">${String(index + 1).padStart(2, '0')}</span>${saveButton('path', path.id, true)}</div><h3><a href="${routeLink('path', path.id)}">${escape(path.title)}</a></h3><p class="card-description">${escape(path.goal)}</p>${count ? `<div class="path-progress"><span>Прочитано ${count} из ${path.ids.length}</span><progress value="${count}" max="${path.ids.length}" aria-label="${escape(`Прогресс маршрута ${path.title}`)}"></progress></div>` : ''}<div class="card-foot"><span>${path.ids.length} материалов · свой темп</span><a href="${routeLink('path', path.id)}">${count ? 'Продолжить' : 'Посмотреть'} ${rightArrow}</a></div></article>`;
  }

  function readingCard(reading) {
    return `<article class="card reading-card"><div class="card-top"><span class="eyebrow">Читаем первоисточник</span>${saveButton('reading', reading.id, true)}</div><span class="reading-author">${escape(reading.author)} · ${escape(reading.work)}</span><h3><a href="${routeLink('reading', reading.id)}">${escape(reading.title)}</a></h3><p class="card-description">${escape(reading.context)}</p><div class="card-foot"><span>${isRead('reading', reading.id) ? 'Прочитано ✓' : 'Фрагмент с пояснениями'}</span><a href="${routeLink('reading', reading.id)}" aria-label="${escape(`Читать: ${reading.title}`)}">Читать ${rightArrow}</a></div></article>`;
  }

  function comparisonCard(comparison) {
    return `<article class="card comparison-card"><div class="card-top"><span class="eyebrow">Один вопрос · разные основания</span></div><h3><a href="${routeLink('comparison', comparison.id)}">${escape(comparison.title)}</a></h3><p class="card-description">${escape(comparison.question)}</p><div class="card-foot"><span>${comparison.voices.length} подхода</span><a href="${routeLink('comparison', comparison.id)}">Сопоставить ${rightArrow}</a></div></article>`;
  }

  function botPanel() {
    return `<section class="bot-panel" aria-labelledby="bot-panel-title"><div><span class="eyebrow">От чтения — к разговору</span><h2 id="bot-panel-title">Мысль становится яснее,<br>когда ей возражают.</h2><p>В Telegram можно обсудить свой ответ с ИИ-собеседником, разобрать довод и вернуться к тому, что осталось непонятным.</p></div><div class="bot-side">${telegram('', '', 'Продолжить в Telegram')}<p class="small-note">На сайте — открытые материалы и ваши закладки.<br>Личные диалоги остаются в боте.</p></div></section>`;
  }

  const heroArt = `<svg viewBox="0 0 470 440" fill="none" aria-hidden="true"><circle cx="247" cy="218" r="175" stroke="#c5cbb8"/><path d="M36 317 429 91M29 349h407M246 25v372" stroke="#c5cbb8" stroke-dasharray="3 6"/><circle cx="371" cy="123" r="43" fill="#aa4c31"/><path d="M110 350V194a111 111 0 0 1 222 0v156" fill="#e5decf" stroke="#586547" stroke-width="1.4"/><path d="M139 350V194a82 82 0 0 1 164 0v156" fill="#f5f2e9" stroke="#586547" stroke-width="1.4"/><path d="M169 350V196a52 52 0 0 1 104 0v154" fill="#dde2cf" stroke="#586547" stroke-width="1.4"/><path d="M169 349V196a52 52 0 0 1 104 0v154" stroke="#586547" stroke-width="1.4"/><path d="M182 350V196a39 39 0 0 1 39-39v193" fill="#697654"/><path d="M221 157a39 39 0 0 1 39 39v154h-39V157Z" fill="#dde2cf"/><path d="M110 195h29m-23-37 29 10m-10-44 23 20m7-43 15 27m25-41 4 29m36-29-5 29m34-16-14 27m32-4-20 22m35 15-29 10m35 25h-30" stroke="#879075"/><path d="m273 286 96 64H221l52-64Z" fill="#c8ceb8"/><path d="M93 350h256v14H93z" fill="#e5decf" stroke="#586547" stroke-width="1.3"/><path d="M75 365h292v14H75zM57 380h328v14H57z" fill="#eee8dc" stroke="#586547" stroke-width="1.3"/><path d="M29 395h400" stroke="#586547" stroke-width="1.4"/><path d="M55 90h28m-14-14v28M403 287h16m-8-8v16" stroke="#a9472e"/><circle cx="58" cy="218" r="5" fill="#586547"/><circle cx="247" cy="43" r="3" fill="#586547"/><path d="m343 404 67 0" stroke="#a9472e"/><text x="391" y="425" fill="#65695e" font-size="10" font-family="Georgia,serif">I.</text></svg>`;
  const featureArt = `<svg viewBox="0 0 220 210" fill="none" aria-hidden="true"><circle cx="110" cy="90" r="68" stroke="#899374"/><path d="M49 170c18-18 44-25 61-20V63C83 49 63 51 36 42v108c22 8 46 9 74 28M110 63c27-14 47-12 74-21v108c-22 8-46 9-74 28V63Z" fill="#f5f2e9" stroke="#586547" stroke-width="1.5"/><path d="M49 60c21 8 33 7 48 14m-48 3c21 8 33 7 48 14m-48 3c21 8 33 7 48 14m-48 3c21 8 33 7 48 14m26-51c15-7 27-6 48-14m-48 31c15-7 27-6 48-14m-48 31c15-7 27-6 48-14m-48 31c15-7 27-6 48-14" stroke="#b4b9a3"/><circle cx="178" cy="34" r="17" fill="#a9472e"/><path d="M27 187h166" stroke="#586547"/><path d="M22 20h16m-8-8v16" stroke="#a9472e"/></svg>`;

  function home() {
    const featured = findArticles(['stoicism', 'freewill', 'knowledge']);
    const beginners = maps.path.get('begin') || catalog.paths[0];
    const questions = [
      { label: 'Как жить хорошо?', note: 'Счастье, желания и характер', path: beginners },
      { label: 'Откуда я знаю, что прав?', note: 'Знание, сомнение и доводы', path: maps.path.get('truth') || catalog.paths[1] },
      { label: 'Что делает меня собой?', note: 'Личность, сознание и свобода', path: maps.path.get('self') || catalog.paths[2] }
    ].filter(item => item.path);
    return `<div class="shell"><section class="hero" aria-labelledby="hero-title"><div><span class="eyebrow">Философия. Не только для философов.</span><h1 id="hero-title">Большие вопросы.<br>Ваш собственный<br><em>ответ.</em></h1><p class="hero-intro">Как жить, во что верить, что считать справедливым? Разбираемся вместе с философами — через ясные объяснения, живые примеры и вопросы к себе.</p><div class="actions"><a class="button accent-button" href="#/paths">Найти точку входа ${rightArrow}</a>${telegram('', '', 'Открыть Telegram', 'button secondary')}</div><p class="hero-footnote">Без подготовки. Без спешки. Без единственного верного ответа.</p></div><div class="hero-art">${heroArt}<div class="art-caption"><span>ἀγορά</span> Пространство для разных мыслей</div></div></section>
    <div class="index-strip"><span class="index-intro">Небольшая библиотека.<br>Большой разговор.</span><a class="index-item" href="#/library"><strong>${catalog.articles.length}</strong><span>материалов<br>для размышления</span></a><a class="index-item" href="#/schools"><strong>${catalog.schools.length}</strong><span>философских<br>школ</span></a><a class="index-item" href="#/paths"><strong>${catalog.paths.length}</strong><span>маршрутов<br>через идеи</span></a><a class="index-item" href="#/glossary"><strong>${catalog.glossary.length}</strong><span>понятий<br>простым языком</span></a></div>
    <section class="section" aria-labelledby="question-heading"><div class="section-head"><div><span class="eyebrow">01 / Начните с любопытства</span><h2 id="question-heading">Какой вопрос — ваш?</h2></div><a class="text-link" href="#/paths">Все маршруты ${rightArrow}</a></div><div class="question-grid">${questions.map((item, index) => `<a class="question-card" href="${routeLink('path', item.path.id)}"><span class="question-number">0${index + 1}</span><h3>${escape(item.label)}</h3><div class="card-foot"><span>${escape(item.note)}</span><span class="arrow-circle" aria-hidden="true">↗</span></div></a>`).join('')}</div></section>
    ${beginners ? `<section class="section split-feature" aria-labelledby="start-heading"><div class="feature-art">${featureArt}</div><div class="feature-copy"><span class="eyebrow">Если пока не знаете, с чего начать</span><h2 id="start-heading">Не нужно начинать<br>с Канта.</h2><p>Начните с собственного довода. Затем — Сократ, Эпикур, стоики и Аристотель: разные способы спросить о хорошей жизни.</p><a class="text-link" href="${routeLink('path', beginners.id)}">${beginners.ids.length} шагов в философию ${rightArrow}</a></div></section>` : ''}
    <section class="section" aria-labelledby="editor-heading"><div class="section-head"><div><span class="eyebrow">02 / Есть над чем подумать</span><h2 id="editor-heading">Идеи ближе, чем кажется.</h2></div><a class="text-link" href="#/library">Вся библиотека ${rightArrow}</a></div><div class="grid">${featured.map(item => articleCard(item)).join('')}</div></section>
    <div class="in-page-search"><p>Уже есть вопрос? Найдите для него собеседника.</p>${searchForm()}</div>
    <section class="section" aria-labelledby="reading-heading"><div class="section-head"><div><span class="eyebrow">03 / Вслушаться в текст</span><h2 id="reading-heading">Слова, с которых всё началось.</h2></div><a class="text-link" href="#/readings">Читать первоисточники ${rightArrow}</a></div><div class="grid">${catalog.readings.slice(0, 3).map(readingCard).join('')}</div></section>${botPanel()}</div>`;
  }

  function library(params) {
    const section = params.get('section') || '';
    const sort = params.get('sort') || 'editorial';
    let articles = catalog.articles.filter(article => !section || article.section === section);
    if (sort === 'title') articles = [...articles].sort((a, b) => a.title.localeCompare(b.title, 'ru'));
    if (sort === 'unread') articles = articles.filter(article => !isRead('article', article.id));
    const filters = [{ id: '', title: 'Все темы' }, ...catalog.sections];
    const href = id => `#/library${id ? `?section=${urlId(id)}` : ''}`;
    return `<div class="shell">${pageHead('Библиотека идей', 'Один материал — один вопрос, важное различие и повод проверить свою мысль. Выберите тему или следуйте любопытству.', 'Читать и размышлять')}${searchForm()}<p class="search-context">Единый поиск по статьям, школам, понятиям и первоисточникам.</p><div class="library-layout page-body"><aside class="filter-panel" aria-label="Темы библиотеки"><h2>Темы</h2><nav class="filter-links" aria-label="Фильтр по теме">${filters.map(item => `<a href="${href(item.id)}" aria-current="${section === item.id}">${escape(item.title)}<span>${item.id ? catalog.articles.filter(article => article.section === item.id).length : catalog.articles.length}</span></a>`).join('')}</nav><div class="filter-select"><label for="section-filter">Тема</label><select id="section-filter" data-filter="section">${filters.map(item => `<option value="${escape(item.id)}"${section === item.id ? ' selected' : ''}>${escape(item.title)}</option>`).join('')}</select></div></aside><div><div class="results-heading"><h2>${escape(section ? sectionTitle(section) : 'Все материалы')} · ${articles.length}</h2><label class="sr-only" for="sort-order">Порядок материалов</label><select id="sort-order" data-filter="sort"><option value="editorial"${sort === 'editorial' ? ' selected' : ''}>Порядок редакции</option><option value="title"${sort === 'title' ? ' selected' : ''}>По алфавиту</option><option value="unread"${sort === 'unread' ? ' selected' : ''}>Только непрочитанное</option></select></div>${articles.length ? `<div class="grid">${articles.map(item => articleCard(item)).join('')}</div>` : empty('Здесь пока пусто', 'В выбранной теме нет материалов с таким фильтром.', '<a class="button secondary" href="#/library">Показать всё →</a>')}</div></div></div>`;
  }

  function exercise(article) {
    const task = maps.exercise.get(article.id);
    if (!task) return '';
    return `<section class="exercise" id="practice" aria-labelledby="exercise-title"><span class="eyebrow">Проверить понимание</span><h2 id="exercise-title">А теперь — ваш ход.</h2><form data-exercise="${escape(article.id)}"><fieldset><legend>${escape(task.question)}</legend><div class="exercise-options">${task.options.map((option, index) => `<label class="choice"><input type="radio" name="answer" value="${index}" required><span>${escape(option)}<span class="choice-result" data-feedback="${index}" hidden></span></span></label>`).join('')}</div></fieldset><div class="exercise-actions"><button type="submit" class="button small">Разобрать ответ ${rightArrow}</button><button type="button" class="button secondary small" data-action="reset-exercise">Начать заново</button></div><div class="exercise-feedback" role="status" aria-live="polite"></div><p class="small-note">Это проверка понимания конкретного довода, а не тест на «правильное» мировоззрение. Результат не отправляется в Telegram.</p></form></section>`;
  }

  function sourceBox(reading, sources) {
    return `<section class="source-box" id="sources"><h2>Куда читать дальше</h2><p>${escape(reading)}</p><div class="source-links">${sources.map(source => external(source.url, source.title)).join('')}</div><p class="source-note">Внешние источники могут быть на других языках. Пересказ, учебный пример и историческая цитата — не одно и то же.</p></section>`;
  }

  function relatedArticles(ids, title = 'Рядом с этой мыслью') {
    const articles = findArticles(ids);
    return articles.length ? `<section class="related-section"><h2>${escape(title)}</h2><div class="grid">${articles.slice(0, 6).map(item => articleCard(item)).join('')}</div></section>` : '';
  }

  function aside(toc, kind, id, extra = '') {
    return `<aside class="detail-aside"><div class="aside-inner"><div class="aside-block"><h2>В этом материале</h2>${toc.map(([key, title]) => `<a href="${routeLink(kind, id)}" data-jump="${escape(key)}">${escape(title)}</a>`).join('')}</div>${extra}<div class="aside-block"><h2>Есть своя мысль?</h2><p>Попробуйте её объяснить. ИИ-собеседник в боте поможет продолжить разбор.</p>${telegram(kind, id, 'Обсудить в боте', 'button secondary small')}</div><div class="aside-block"><p>Отметки о чтении и закладки хранятся только в этом браузере. Telegram — отдельно.</p></div></div></aside>`;
  }

  function detailHeader(item, kind, eyebrow, parents, metadata = '') {
    return `<header class="page-header article-header">${crumbs([...parents, { title: item.title }])}<span class="eyebrow">${escape(eyebrow)}</span><h1>${escape(item.title)}</h1>${metadata ? `<div class="article-meta">${metadata}</div>` : ''}<div class="article-tools">${saveButton(kind, item.id)}${kind !== 'path' ? readButton(kind, item.id) : ''}<button type="button" class="button secondary small" data-action="share">Ссылка на материал ${arrow}</button></div></header>`;
  }

  function pathNavigation(article, requested) {
    const path = maps.path.get(requested);
    if (!path || !path.ids.includes(article.id)) return '';
    const index = path.ids.indexOf(article.id);
    const previous = maps.article.get(path.ids[index - 1]);
    const next = maps.article.get(path.ids[index + 1]);
    return `<nav class="path-navigation" aria-label="Навигация по маршруту"><span class="eyebrow">Шаг ${index + 1} из ${path.ids.length} · ${escape(path.title)}</span><div class="path-next-prev">${previous ? `<a href="${routeLink('article', previous.id, path.id)}"><small>← Предыдущий шаг</small><span>${escape(previous.title)}</span></a>` : `<a href="${routeLink('path', path.id)}"><small>← Весь маршрут</small><span>${escape(path.title)}</span></a>`}${next ? `<a href="${routeLink('article', next.id, path.id)}"><small>Следующий шаг →</small><span>${escape(next.title)}</span></a>` : `<a href="${routeLink('path', path.id)}"><small>Маршрут прочитан?</small><span>Вернуться к шагам →</span></a>`}</div></nav>`;
  }

  function articlePage(article, params) {
    const relatedSchools = catalog.schools.filter(school => school.articleIds.includes(article.id));
    const relatedPaths = catalog.paths.filter(path => path.ids.includes(article.id));
    const relatedReadings = catalog.readings.filter(reading => reading.articleIds.includes(article.id));
    const comparisons = catalog.comparisons.filter(comparison => comparison.articles.includes(article.id));
    const selectedPath = maps.path.get(params.get('path'));
    const parents = selectedPath?.ids.includes(article.id) ? [{ title: 'Маршруты', href: '#/paths' }, { title: selectedPath.title, href: routeLink('path', selectedPath.id) }] : [{ title: 'Библиотека', href: '#/library' }, { title: sectionTitle(article.section), href: `#/library?section=${urlId(article.section)}` }];
    const extra = relatedPaths.length ? `<div class="aside-block"><h2>В маршрутах</h2>${relatedPaths.map(path => `<a href="${routeLink('path', path.id)}">${escape(path.title)} →</a>`).join('')}</div>` : '';
    const toc = [['explanation', 'Основная мысль'], ['distinction', 'Важное различие'], ['objection', 'С чем можно спорить'], ['example', 'В обычной жизни'], ['sources', 'Источники']];
    if (maps.exercise.has(article.id)) toc.push(['practice', 'Проверить понимание']);
    return `<div class="shell">${detailHeader(article, 'article', sectionTitle(article.section), parents, `<span>${articleMinutes(article)} минуты на чтение</span><span class="dot"></span><span>Авторский учебный разбор</span>`)}<div class="detail-layout"><article class="prose"><p class="article-question">${escape(article.question)}</p><section id="explanation"><h2>Основная мысль</h2><p>${escape(article.explanation)}</p></section><section class="note-panel" id="distinction"><h2>Важное различие</h2><p>${escape(article.distinction)}</p></section><section id="objection"><h2>С чем можно спорить</h2><p>${escape(article.objection)}</p></section><section class="example-panel" id="example"><span class="eyebrow">В обычной жизни</span><p>${escape(article.example)}</p></section>${sourceBox(article.reading, [{ url: article.url, title: 'Открыть рекомендованный источник' }])}${exercise(article)}<div class="actions">${readButton('article', article.id)}${telegram('article', article.id, 'Обсудить этот вопрос', 'button small')}</div>${pathNavigation(article, params.get('path'))}${relatedPaths.length ? `<section class="path-navigation"><h2>Продолжить по маршруту</h2><div class="actions">${relatedPaths.slice(0, 3).map(path => `<a class="text-link" href="${routeLink('path', path.id)}">${escape(path.title)} ${rightArrow}</a>`).join('')}</div></section>` : ''}</article>${aside(toc, 'article', article.id, extra)}</div>${relatedSchools.length ? `<section class="related-section"><h2>Школы за этими идеями</h2><div class="grid">${relatedSchools.slice(0, 3).map(schoolCard).join('')}</div></section>` : ''}${relatedReadings.length ? `<section class="related-section"><h2>Почитать самого философа</h2><div class="grid">${relatedReadings.map(readingCard).join('')}</div></section>` : ''}${comparisons.length ? `<section class="related-section"><h2>Поставить рядом другой ответ</h2><div class="grid">${comparisons.slice(0, 3).map(comparisonCard).join('')}</div></section>` : ''}</div>`;
  }

  function schoolsPage(params) {
    const group = params.get('group') || '';
    const schools = catalog.schools.filter(school => !group || school.group === group);
    return `<div class="shell">${pageHead('Разные способы видеть мир', 'Школа — не ярлык и не набор советов. Это традиция вопросов и доводов, с которой можно согласиться, поспорить или остаться в сомнении.', 'Карта философских школ', [{ title: 'Школы' }])}<nav class="filter-row" aria-label="Периоды и традиции">${[{ id: '', title: 'Все традиции' }, ...catalog.schoolGroups].map(item => `<a class="filter-chip" href="#/schools${item.id ? `?group=${urlId(item.id)}` : ''}" aria-current="${group === item.id}">${escape(item.title)}</a>`).join('')}</nav><div class="page-body">${schools.length ? `<div class="grid">${schools.map(schoolCard).join('')}</div>` : empty('Такой группы пока нет', 'Выберите другую традицию.', '<a class="button secondary" href="#/schools">Все школы →</a>')}</div></div>`;
  }

  function schoolPage(school) {
    const related = school.relatedIds.map(id => maps.school.get(id)).filter(Boolean);
    return `<div class="shell">${detailHeader(school, 'school', groupTitle(school.group), [{ title: 'Школы', href: '#/schools' }], `<span>${escape(school.period)}</span>`)}<div class="detail-layout"><article class="prose"><p class="article-question">${escape(school.question)}</p><section><span class="eyebrow">Имена, с которых можно начать</span><p>${escape(school.thinkers.join(' · '))}</p></section><section id="ideas"><h2>Основные идеи</h2>${school.ideas.map((idea, index) => `<p><span class="idea-number">0${index + 1}</span>${escape(idea)}</p>`).join('')}</section><section id="argument"><h2>Как устроен довод</h2><p>${escape(school.argument)}</p></section><section class="note-panel" id="distinction"><h2>Не перепутать</h2><p>${escape(school.distinction)}</p></section><section id="objection"><h2>Трудный вопрос к школе</h2><p>${escape(school.objection)}</p></section><section class="example-panel" id="example"><span class="eyebrow">Мысленный пример</span><p>${escape(school.example)}</p></section>${sourceBox(school.reading, school.sources)}<div class="actions">${readButton('school', school.id)}${telegram('school', school.id, 'Обсудить эту школу', 'button small')}</div></article>${aside([['ideas', 'Основные идеи'], ['argument', 'Как устроен довод'], ['distinction', 'Не перепутать'], ['objection', 'Трудный вопрос'], ['sources', 'Первоисточники']], 'school', school.id)}</div>${relatedArticles(school.articleIds, 'Разобраться подробнее')}${related.length ? `<section class="related-section"><h2>Родство и разногласия</h2><div class="grid">${related.map(schoolCard).join('')}</div></section>` : ''}</div>`;
  }

  function pathsPage() {
    return `<div class="shell">${pageHead('Не учебный план. Ваш маршрут.', 'Несколько связанных материалов в осмысленном порядке. Начните с вопроса, который вам близок, и читайте в своём темпе.', 'От одной идеи к другой', [{ title: 'Маршруты' }])}<div class="page-body"><div class="grid">${catalog.paths.map((path, index) => pathCard(path, index)).join('')}</div>${localNote()}</div></div>`;
  }

  function pathPage(path) {
    const read = pathProgress(path);
    const next = path.ids.find(id => !isRead('article', id)) || path.ids[0];
    return `<div class="shell">${detailHeader(path, 'path', `${path.ids.length} материалов · маршрут чтения`, [{ title: 'Маршруты', href: '#/paths' }])}<div class="detail-layout"><div><p class="article-question">${escape(path.goal)}</p><div class="path-progress"><span>Прочитано ${read} из ${path.ids.length} в этом браузере</span><progress value="${read}" max="${path.ids.length}" aria-label="Прогресс чтения"></progress></div><div class="actions"><a class="button accent-button" href="${routeLink('article', next, path.id)}">${read === path.ids.length ? 'Вернуться к началу' : read ? 'Продолжить чтение' : 'Начать с первого вопроса'} ${rightArrow}</a></div>${localNote()}<ol class="path-list">${findArticles(path.ids).map((article, index) => `<li><span class="step-number" aria-hidden="true">${String(index + 1).padStart(2, '0')}</span><div class="step-content"><h2><a href="${routeLink('article', article.id, path.id)}">${escape(article.title)}</a>${isRead('article', article.id) ? '<span class="step-read">Прочитано ✓</span>' : ''}</h2><p>${escape(article.question)}</p></div><a class="arrow-circle" href="${routeLink('article', article.id, path.id)}" aria-label="${escape(`Шаг ${index + 1}: ${article.title}`)}">→</a></li>`).join('')}</ol><p class="search-context">Порядок предложен редакцией. Это не обязательная последовательность и не утверждение о прямом историческом влиянии.</p></div><aside class="detail-aside"><div class="aside-inner"><div class="aside-block"><h2>Как читать</h2><p>Сначала попробуйте ответить на вопрос сами. После чтения найдите довод, с которым не согласны. Проверьте его на своём примере.</p></div><div class="aside-block"><h2>Другой формат</h2><p>Этот маршрут доступен и в боте. Прогресс сайта туда не переносится.</p>${telegram('path', path.id, 'Открыть маршрут в боте', 'button secondary small')}</div></div></aside></div></div>`;
  }

  function readingsPage() {
    return `<div class="shell">${pageHead('Встретиться с самим текстом', 'Небольшие фрагменты философских сочинений: с контекстом, пояснением трудных мест и вопросом, который можно унести с собой.', 'Медленное чтение', [{ title: 'Первоисточники' }])}<div class="page-body"><div class="grid">${catalog.readings.map(readingCard).join('')}</div><p class="start-point">Текст не обязан сразу стать понятным. Иногда хорошее начало — заметить, где именно вы перестали соглашаться.</p><div class="local-note">У каждого фрагмента указаны произведение, место в тексте, источник и происхождение перевода. Рабочие переводы «Агоры» и редакционные пояснения явно разделены.</div></div></div>`;
  }

  function readingPage(reading) {
    return `<div class="shell">${detailHeader(reading, 'reading', `${reading.author} · ${reading.work}`, [{ title: 'Первоисточники', href: '#/readings' }], `<span>${escape(reading.location)}</span>`)}<div class="detail-layout"><article class="prose"><section id="context"><h2>Прежде чем читать</h2><p>${escape(reading.context)}</p></section><section id="excerpt"><h2>Сам текст</h2><blockquote class="reading-excerpt"><p>${escape(reading.excerpt)}</p><p class="reading-attribution">${escape(reading.author)}. ${escape(reading.work)}<br>${escape(reading.location)}</p></blockquote><div class="translation-note"><strong>О переводе.</strong> ${escape(reading.translationNote)}<br>${external(reading.sourceUrl, 'Источник фрагмента')}</div></section><section id="phrases"><h2>Остановимся на словах</h2><p class="source-note">Ниже — пояснения редакции, а не продолжение цитаты.</p><dl>${reading.phrases.map(phrase => `<div class="phrase"><dt>«${escape(phrase.text)}»</dt><dd>${escape(phrase.explanation)}</dd></div>`).join('')}</dl></section><section id="argument"><h2>Как движется мысль</h2><p>${escape(reading.argument)}</p></section><section class="thought-prompt" id="question"><span class="eyebrow">Вопрос к себе</span><h2>Продолжите мысль.</h2><p>${escape(reading.question)}</p><p class="starter">${escape(reading.starter)}</p>${telegram('reading', reading.id, 'Обсудить фрагмент', 'button small')}<p class="small-note">Разговор откроется в Telegram. На этой странице ваши ответы не записываются.</p></section><div class="actions">${readButton('reading', reading.id)}${saveButton('reading', reading.id)}</div></article>${aside([['context', 'Контекст'], ['excerpt', 'Текст и перевод'], ['phrases', 'Пояснения'], ['argument', 'Движение мысли'], ['question', 'Вопрос к себе']], 'reading', reading.id)}</div>${relatedArticles(reading.articleIds, 'Идеи вокруг этого текста')}</div>`;
  }

  function termEntry(term) {
    return `<article class="term" id="term-${escape(term.id)}"><h2>${escape(term.title)}</h2><p>${escape(term.definition)}</p><p class="term-example">${escape(term.example)}</p>${maps.article.has(term.article) ? `<a class="text-link" href="${routeLink('article', term.article)}">Разобраться на примере ${rightArrow}</a>` : ''}</article>`;
  }

  function glossaryPage(params) {
    const selected = params.get('term');
    const terms = selected ? catalog.glossary.filter(term => term.id === selected) : [...catalog.glossary].sort((a, b) => a.title.localeCompare(b.title, 'ru'));
    return `<div class="shell">${pageHead('Слова, за которыми стоят идеи', 'Короткие определения не закрывают вопрос. Они помогают точнее понять, о чём именно мы спорим.', 'Словарь понятий', [{ title: 'Словарь' }])}${searchForm()}<div class="page-body">${selected ? '<p class="search-context"><a class="text-link" href="#/glossary">← Все понятия</a></p>' : ''}${terms.length ? `<div class="dictionary">${terms.map(termEntry).join('')}</div>` : empty('Такое понятие не найдено', 'Попробуйте общий поиск или откройте весь словарь.', '<a class="button secondary" href="#/glossary">Все понятия →</a>')}</div></div>`;
  }

  function comparisonsPage() {
    return `<div class="shell">${pageHead('Один случай. Разные основания.', 'Два подхода могут прийти к одному ответу — и всё же расходиться в главном. Сравнивайте не только решения, но и доводы за ними.', 'Философия в сопоставлении', [{ title: 'Сравнить подходы' }])}<div class="page-body"><div class="grid two">${catalog.comparisons.map(comparisonCard).join('')}</div><p class="search-context">Это современные учебные примеры, не исторические диалоги и не предсказание того, как поступил бы философ.</p></div></div>`;
  }

  function comparisonPage(comparison) {
    return `<div class="shell">${pageHead(comparison.title, comparison.question, 'Сравнить основания', [{ title: 'Сравнить подходы', href: '#/comparisons' }, { title: comparison.title }])}<div class="prose page-body"><p class="comparison-scene">${escape(comparison.scene)}</p><div class="voices">${comparison.voices.map(voice => `<section class="voice"><h2>${escape(voice.name)}</h2><p>${escape(voice.text)}</p></section>`).join('')}</div><section><h2>Что общего</h2><p>${escape(comparison.common)}</p></section><section class="note-panel"><h2>В чём различие</h2><p>${escape(comparison.difference)}</p></section><section><h2>Не упустить из виду</h2><p>${escape(comparison.caution)}</p></section><section class="thought-prompt"><span class="eyebrow">Ваша очередь</span><p>${escape(comparison.prompt)}</p>${telegram('', '', 'Продолжить разговор', 'button small')}</section></div>${relatedArticles(comparison.articles, 'Вернуться к основаниям')}</div>`;
  }

  function searchPage(params) {
    const query = (params.get('q') || '').trim().slice(0, 180);
    const words = normal(query).split(/\s+/).filter(Boolean);
    const matches = values => words.every(word => normal(values.flat().join(' ')).includes(word));
    const groups = words.length ? [
      { title: 'Статьи', kind: 'article', items: catalog.articles.filter(item => matches([item.title, item.question, item.keywords, item.explanation, item.distinction, item.objection, sectionTitle(item.section)])), description: item => item.question },
      { title: 'Школы', kind: 'school', items: catalog.schools.filter(item => matches([item.title, item.question, item.keywords, item.thinkers, item.ideas, item.argument])), description: item => item.question },
      { title: 'Понятия', kind: 'term', items: catalog.glossary.filter(item => matches([item.title, item.definition, item.example])), description: item => item.definition },
      { title: 'Первоисточники', kind: 'reading', items: catalog.readings.filter(item => matches([item.title, item.author, item.work, item.excerpt, item.context, item.argument, item.question])), description: item => `${item.author} · ${item.work}. ${item.context}` },
      { title: 'Маршруты', kind: 'path', items: catalog.paths.filter(item => matches([item.title, item.goal])), description: item => item.goal }
    ] : [];
    const count = groups.reduce((sum, group) => sum + group.items.length, 0);
    return `<div class="shell">${pageHead('Найдите нить мысли', 'Ищите по вопросу, имени философа или понятию. Поиск объединяет всю библиотеку.', 'Поиск по Агоре', [{ title: 'Поиск' }])}${searchForm(query)}<div class="page-body">${words.length ? `<p class="search-context" role="status">По запросу «${escape(query)}» найдено: ${count}</p>${count ? groups.filter(group => group.items.length).map(group => `<section class="search-group"><h2>${escape(group.title)} <span class="muted">/ ${group.items.length}</span></h2>${group.items.map(item => `<a class="search-result" href="${group.kind === 'term' ? `#/glossary?term=${urlId(item.id)}` : routeLink(group.kind, item.id)}"><h3>${escape(item.title)} ${rightArrow}</h3><p>${escape(group.description(item))}</p></a>`).join('')}</section>`).join('') : empty('Пока ни одной зацепки', 'Попробуйте более короткое слово, другую формулировку или имя философа. Например: «свобода», «Юм», «знание».', '<a class="button secondary" href="#/library">Посмотреть темы →</a>')}` : `<div class="filter-row" aria-label="Примеры запросов">${['Свобода', 'Счастье', 'Сократ', 'Сознание', 'Справедливость'].map(word => `<a class="filter-chip" href="#/search?q=${urlId(word)}">${escape(word)} ${arrow}</a>`).join('')}</div>${empty('С чего начнётся поиск?', 'Можно ввести даже то, в чём вы пока не уверены. Или заглянуть в словарь: иногда не хватает не ответа, а точного слова.', '<a class="button secondary" href="#/glossary">Открыть словарь →</a>')}`}</div></div>`;
  }

  function savedPage(params) {
    const view = params.get('view') === 'read' ? 'read' : 'saved';
    const items = view === 'read' ? local.read.map(value => { const colon = value.indexOf(':'); return { kind: value.slice(0, colon), id: value.slice(colon + 1) }; }).filter(item => hasItem(item.kind, item.id)) : local.saved.filter(item => hasItem(item.kind, item.id));
    const renderers = { article: articleCard, school: schoolCard, reading: readingCard, path: pathCard };
    return `<div class="shell">${pageHead('Ваша полка', 'Мысли, к которым хочется вернуться. Сохраняйте материалы и отмечайте прочитанное — без регистрации.', 'Личное пространство на этом устройстве', [{ title: 'Сохранённое' }])}${localNote()}<nav class="filter-row" aria-label="Содержимое вашей полки"><a class="filter-chip" href="#/saved" aria-current="${view === 'saved'}">Сохранено · ${local.saved.length}</a><a class="filter-chip" href="#/saved?view=read" aria-current="${view === 'read'}">Прочитано · ${local.read.length}</a></nav><div class="page-body">${items.length ? `<div class="grid">${items.map(item => renderers[item.kind]?.(maps[item.kind].get(item.id)) || '').join('')}</div>` : empty(view === 'saved' ? 'Здесь появятся ваши находки' : 'Первый вопрос ещё впереди', view === 'saved' ? 'Нажмите на значок закладки у статьи, школы, маршрута или первоисточника. Материал останется на этой полке.' : 'Откройте материал и нажмите «Отметить прочитанным». Эта отметка поможет продолжить маршрут.', '<a class="button accent-button" href="#/library">Выбрать материал →</a><a class="button secondary" href="#/paths">Начать с маршрута</a>')}</div></div>`;
  }

  function aboutPage() {
    return `<div class="shell">${pageHead('Место для мысли', 'Агора — открытая философская библиотека и собеседник в Telegram.', 'О проекте', [{ title: 'О материалах и данных' }])}<div class="about-prose"><h2>Не заменять мысль готовым ответом</h2><p>Мы объясняем философские идеи по-русски, разбираем доводы и приводим примеры из обычной жизни. У каждого подхода есть свои трудности. Учебные пересказы и современные примеры не выдаются за исторические цитаты или единодушие исследователей.</p><h2>Можно проверить источник</h2><p>В статьях и профилях школ есть ссылки для дальнейшего чтения. Первоисточники сопровождаются указанием произведения, места фрагмента и происхождения перевода. Пояснения редакции отделены от самого текста.</p><h2>Чтение здесь, разговор — в Telegram</h2><p>На сайте нет чата с ИИ и доступа к вашим разговорам с ботом. Кнопки обсуждения открывают Telegram и передают только идентификатор выбранного материала, не вашу историю чтения или ответы.</p><h2>Что сохраняет этот сайт</h2><p>Закладки и отметки о чтении записываются в локальное хранилище этого браузера. Аккаунта, синхронизации с Telegram и переноса между устройствами здесь нет. Если браузер запрещает хранение, отметки доступны только до закрытия страницы. Очистить их можно в настройках данных сайта вашего браузера.</p><p>Ответы на упражнения проверяются на этой странице. Они не отправляются в бот и не сохраняются после ухода со страницы. На сайте нет рекламных трекеров и внешних шрифтов; файлы страницы и открытая библиотека загружаются с того же сайта.</p><div class="actions"><a class="button secondary" href="#/library">В библиотеку ${rightArrow}</a>${telegram('', '', 'В Telegram')}</div></div></div>`;
  }

  function notFound() {
    return `<div class="shell">${pageHead('Кажется, мысль свернула не туда', 'Такой страницы нет. Возможно, ссылка неполная или материал был переименован.', '404 / Страница не найдена', [{ title: 'Страница не найдена' }])}<div class="page-body">${searchForm()}${empty('Найдём другой путь', 'Библиотека и маршруты доступны по ссылкам ниже.', '<a class="button accent-button" href="#/library">Библиотека →</a><a class="button secondary" href="#/paths">Маршруты →</a>')}</div></div>`;
  }

  function readRoute() {
    try {
      const hash = location.hash.slice(1) || '/';
      const divider = hash.indexOf('?');
      const path = divider >= 0 ? hash.slice(0, divider) : hash;
      const params = new URLSearchParams(divider >= 0 ? hash.slice(divider + 1) : '');
      const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
      return { page: parts[0] || 'home', id: parts[1], params, valid: parts.length <= 2 };
    } catch { return { page: 'missing', params: new URLSearchParams(), valid: false }; }
  }

  function render(options = {}) {
    if (!catalog) return;
    currentRoute = readRoute();
    const { page, id, params, valid } = currentRoute;
    let html;
    let title;
    const pages = { home: () => home(), library: () => library(params), schools: () => schoolsPage(params), paths: pathsPage, readings: readingsPage, glossary: () => glossaryPage(params), comparisons: comparisonsPage, search: () => searchPage(params), saved: () => savedPage(params), about: aboutPage };
    const details = { article: articlePage, school: schoolPage, path: pathPage, reading: readingPage, comparison: comparisonPage };
    const titles = { home: 'Место для мысли', library: 'Библиотека идей', schools: 'Философские школы', paths: 'Маршруты', readings: 'Первоисточники', glossary: 'Словарь', comparisons: 'Сравнить подходы', search: 'Поиск', saved: 'Ваша полка', about: 'О проекте' };
    if (valid && Object.hasOwn(pages, page) && !id) { html = pages[page](); title = titles[page]; }
    else if (valid && Object.hasOwn(details, page) && hasItem(page, id)) { const item = maps[page].get(id); html = details[page](item, params); title = item.title; }
    else { html = notFound(); title = 'Страница не найдена'; }
    main.innerHTML = html;
    document.title = `${title} — Агора`;
    nav.querySelectorAll('[data-nav]').forEach(link => {
      const active = ({ article: 'library', school: 'schools', path: 'paths', reading: 'readings' }[page] || page) === link.dataset.nav;
      if (active) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
    });
    closeMenu();
    updateCount();
    if (!options.keepScroll) { window.scrollTo({ top: 0, behavior: 'instant' }); if (!options.initial) main.focus({ preventScroll: true }); }
  }

  function updateCount() {
    const count = document.querySelector('#saved-count');
    count.textContent = String(local.saved.length);
    count.hidden = !local.saved.length;
  }

  function closeMenu() {
    nav.classList.remove('open');
    menu.setAttribute('aria-expanded', 'false');
    menu.setAttribute('aria-label', 'Открыть меню');
  }

  function refreshControls(kind, id) {
    document.querySelectorAll('[data-action="save"]').forEach(button => {
      if (button.dataset.kind !== kind || button.dataset.id !== id) return;
      const saved = isSaved(kind, id);
      button.setAttribute('aria-pressed', String(saved));
      button.setAttribute('aria-label', `${saved ? 'Убрать из сохранённого' : 'Сохранить'}: ${itemTitle(kind, id)}`);
      const label = button.querySelector('span');
      if (label) label.textContent = saved ? 'Сохранено' : 'Сохранить';
    });
    document.querySelectorAll('[data-action="read"]').forEach(button => {
      if (button.dataset.kind !== kind || button.dataset.id !== id) return;
      const read = isRead(kind, id);
      button.setAttribute('aria-pressed', String(read));
      button.textContent = read ? 'Прочитано ✓' : 'Отметить прочитанным';
    });
    updateCount();
  }

  document.addEventListener('click', async event => {
    const skip = event.target.closest('.skip-link');
    if (skip) { event.preventDefault(); main.focus(); return; }
    const jump = event.target.closest('[data-jump]');
    if (jump) {
      event.preventDefault();
      const section = document.getElementById(jump.dataset.jump);
      if (section) { section.setAttribute('tabindex', '-1'); section.scrollIntoView({ behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' }); section.focus({ preventScroll: true }); }
      return;
    }
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const { action, kind, id } = button.dataset;
    if (action === 'retry') { await load(); return; }
    if (action === 'share') {
      const permalink = `${location.origin}${location.pathname}${location.hash || '#/'}`;
      try { await navigator.clipboard.writeText(permalink); announce('Ссылка на материал скопирована.'); }
      catch { announce('Не удалось скопировать автоматически. Скопируйте ссылку из адресной строки.'); }
      return;
    }
    if (action === 'reset-exercise') {
      const form = button.closest('form');
      form.reset();
      form.querySelectorAll('.choice').forEach(choice => choice.classList.remove('correct-answer', 'wrong-answer'));
      form.querySelectorAll('[data-feedback]').forEach(feedback => { feedback.textContent = ''; feedback.hidden = true; });
      form.querySelector('.exercise-feedback').textContent = '';
      form.querySelector('input').focus();
      return;
    }
    if (!hasItem(kind, id)) return;
    if (action === 'save') {
      const saved = isSaved(kind, id);
      local.saved = saved ? local.saved.filter(item => item.kind !== kind || item.id !== id) : [...local.saved, { kind, id }];
      const persisted = persist();
      refreshControls(kind, id);
      if (currentRoute.page === 'saved') { render({ keepScroll: true }); main.focus({ preventScroll: true }); }
      if (persisted) announce(saved ? 'Материал убран с вашей полки.' : 'Сохранено в этом браузере. Ваша полка — в разделе «Сохранённое».');
    }
    if (action === 'read') {
      const read = isRead(kind, id);
      local.read = read ? local.read.filter(key => key !== `${kind}:${id}`) : [...local.read, `${kind}:${id}`];
      const persisted = persist();
      refreshControls(kind, id);
      if (persisted) announce(read ? 'Отметка о чтении снята.' : 'Отмечено как прочитанное в этом браузере.');
    }
  });

  document.addEventListener('submit', event => {
    if (event.target.matches('.search-bar')) {
      event.preventDefault();
      const query = event.target.querySelector('[name=q]').value.trim().slice(0, 180);
      const target = `#/search${query ? `?q=${urlId(query)}` : ''}`;
      if (location.hash === target) render(); else location.hash = target;
      return;
    }
    const form = event.target.closest('[data-exercise]');
    if (!form) return;
    event.preventDefault();
    const task = maps.exercise.get(form.dataset.exercise);
    const chosen = form.querySelector('input[name=answer]:checked');
    if (!task || !chosen) { form.querySelector('input')?.focus(); return; }
    const answer = Number(chosen.value);
    if (!Number.isInteger(answer) || answer < 0 || answer >= task.options.length) return;
    form.querySelectorAll('.choice').forEach((choice, index) => {
      choice.classList.toggle('correct-answer', index === task.correct);
      choice.classList.toggle('wrong-answer', index === answer && index !== task.correct);
      const feedback = choice.querySelector('[data-feedback]');
      feedback.textContent = `${index === task.correct ? 'Точный ответ. ' : index === answer ? 'Ваш выбор. ' : ''}${task.feedback[index] || ''}`;
      feedback.hidden = false;
    });
    const feedback = form.querySelector('.exercise-feedback');
    feedback.textContent = `${answer === task.correct ? 'Да, вы уловили различие.' : 'Здесь важно другое различие.'} ${task.feedback[answer] || ''} Пояснения ко всем вариантам показаны под ними; точный ответ отмечен отдельно.`;
  });

  document.addEventListener('change', event => {
    const filter = event.target.closest('[data-filter]');
    if (!filter) return;
    const params = new URLSearchParams(currentRoute.params);
    if (filter.value && filter.value !== 'editorial') params.set(filter.dataset.filter, filter.value); else params.delete(filter.dataset.filter);
    location.hash = `#/library${params.size ? `?${params.toString()}` : ''}`;
  });

  menu.addEventListener('click', () => {
    const expanded = menu.getAttribute('aria-expanded') !== 'true';
    menu.setAttribute('aria-expanded', String(expanded));
    menu.setAttribute('aria-label', expanded ? 'Закрыть меню' : 'Открыть меню');
    nav.classList.toggle('open', expanded);
  });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && nav.classList.contains('open')) { closeMenu(); menu.focus(); } });
  document.addEventListener('click', event => { if (nav.classList.contains('open') && !event.target.closest('.site-header')) closeMenu(); });
  window.addEventListener('hashchange', () => render());
  window.addEventListener('storage', event => {
    if (event.key !== storageKey && event.key !== null) return;
    local = readLocal();
    if (catalog) { pruneLocal(); render({ keepScroll: true }); }
  });

  function pruneLocal() {
    local.saved = local.saved.filter(item => hasItem(item.kind, item.id));
    local.read = local.read.filter(key => { const colon = key.indexOf(':'); return hasItem(key.slice(0, colon), key.slice(colon + 1)); });
  }

  async function load() {
    main.innerHTML = '<div class="shell loading" role="status"><span class="eyebrow">Агора</span><h1>Открываем библиотеку…</h1><p>Собираем мысли, вопросы и книги на одной странице.</p></div>';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch('./knowledge.json', { signal: controller.signal, credentials: 'same-origin' });
      if (!response.ok) throw new Error('Catalog unavailable');
      const data = await response.json();
      for (const key of ['sections', 'articles', 'schools', 'schoolGroups', 'paths', 'glossary', 'readings', 'comparisons', 'exercises']) {
        if (!Array.isArray(data[key])) throw new Error('Incomplete catalog');
      }
      catalog = data;
      maps = { article: new Map(data.articles.map(item => [item.id, item])), school: new Map(data.schools.map(item => [item.id, item])), path: new Map(data.paths.map(item => [item.id, item])), reading: new Map(data.readings.map(item => [item.id, item])), comparison: new Map(data.comparisons.map(item => [item.id, item])), exercise: new Map(data.exercises.map(item => [item.articleId, item])) };
      pruneLocal();
      if (!location.hash && location.search) {
        const query = new URLSearchParams(location.search).get('q');
        if (query) history.replaceState(null, '', `${location.pathname}${location.search}#/search?q=${urlId(query.slice(0, 180))}`);
      }
      render({ initial: true });
    } catch {
      catalog = null;
      main.innerHTML = `<div class="shell">${pageHead('Не удалось открыть библиотеку', 'Возможно, пропала связь или сайт обновляется. Ваши локальные закладки не затронуты.', 'Небольшая пауза', [{ title: 'Ошибка загрузки' }])}<div class="page-body">${empty('Попробуем ещё раз?', 'Проверьте подключение и повторите загрузку. Пока материалы можно читать и обсуждать в Telegram.', `<button class="button accent-button" type="button" data-action="retry">Повторить загрузку</button>${telegram('', '', 'Открыть Telegram', 'button secondary')}`)}</div></div>`;
    } finally { clearTimeout(timeout); }
  }

  load();
})();
