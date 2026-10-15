const $ = s => document.querySelector(s);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const initials = v => String(v || '?').trim().split(/\s+/).slice(0,2).map(s => s[0]?.toUpperCase() || '').join('');
const dateText = v => new Date(String(v).slice(0,10)+'T12:00:00').toLocaleDateString('ru-RU',{day:'numeric',month:'short'});
const timeText = v => new Date(v).toLocaleString('ru-RU',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
const plural=(n,one,few,many)=>`${n} ${n%100>=11&&n%100<=14?many:n%10===1?one:n%10>=2&&n%10<=4?few:many}`;
const duration = v => `${Math.floor((Number(v)||0)/60)}:${String(Math.floor((Number(v)||0)%60)).padStart(2,'0')}`;
const S = {metric:'votes',syncing:false,online:true,finishing:false,preview:false,user:null,communities:[],communityId:null,data:null,view:'overview',history:null,logs:null,filter:'all',menu:false,current:null,playing:false};
const nav = [
  ['overview','Главная','<path d="M3 9 12 3l9 6v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9Z"/><path d="M9 21v-8h6v8"/>'],
  ['playlist','Плейлист','<path d="M4 7h12M4 12h12M4 17h8"/><circle cx="18" cy="17" r="3"/><path d="M21 17V7"/>'],
  ['library','Медиатека','<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="12" cy="12" r="4"/>'],
  ['favorites','Избранное','<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>'],
  ['history','История','<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>'],
  ['members','Участники','<circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2"/><circle cx="18" cy="9" r="2"/><path d="M16 14a5 5 0 0 1 5 5v1"/>'],
  ['moderation','Модерация','<path d="m12 3 8 4v5c0 5-3 8-8 10-5-2-8-5-8-10V7l8-4Z"/><path d="m9 12 2 2 4-4"/>'],
  ['settings','Настройки','<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.05.05-1.9 1.9-.05-.05A1.7 1.7 0 0 0 16 18.45a1.7 1.7 0 0 0-1 .89V21h-3v-1.66a1.7 1.7 0 0 0-1-.89 1.7 1.7 0 0 0-1.88.34l-.05.05-1.9-1.9.05-.05A1.7 1.7 0 0 0 7.55 15a1.7 1.7 0 0 0-.89-1H5v-3h1.66a1.7 1.7 0 0 0 .89-1 1.7 1.7 0 0 0-.34-1.88l-.05-.05 1.9-1.9.05.05A1.7 1.7 0 0 0 11 6.55a1.7 1.7 0 0 0 1-.89V4h3v1.66a1.7 1.7 0 0 0 1 .89 1.7 1.7 0 0 0 1.88-.34l.05-.05 1.9 1.9-.05.05A1.7 1.7 0 0 0 19.45 10a1.7 1.7 0 0 0 .89 1H22v3h-1.66a1.7 1.7 0 0 0-.94 1Z"/>']
];
const icon = p => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
function toast(message,bad=false){const e=document.createElement('div');e.className='toast'+(bad?' error':'');e.textContent=message;$('#toast-root').append(e);setTimeout(()=>e.remove(),4000)}
const request=(path,options)=>VolnaAPI.request(path,options);
const post=(path,data)=>VolnaAPI.post(path,data);
function approved(){return (S.data?.tracks||[]).filter(t=>t.status==='approved'&&(!t.queue_state||t.queue_state==='queued'))}
function allPlayable(){return (S.data?.tracks||[]).filter(t=>t.status==='approved'&&t.queue_state!=='removed')}
function selectedCommunity(){return S.communities.find(c=>c.id===S.communityId)}
function communityPath(tail=''){return `/api/communities/${encodeURIComponent(S.communityId)}${tail?'/'+tail:''}`}
async function boot(preferred){
  try{const b=await request('/api/bootstrap');S.user=b.user;S.communities=b.communities;
    const existing=preferred||S.communityId||localStorage.getItem('volna-community');
    S.communityId=S.communities.find(c=>c.id===existing)?.id||S.communities[0]?.id||null;
    if(S.communityId){localStorage.setItem('volna-community',S.communityId);S.data=await request(communityPath())}else S.data=null;
    render();const invite=new URLSearchParams(location.search).get('invite');if(invite){history.replaceState({},'',location.pathname);modal('join',invite)}
  }catch(e){if(e.message.includes('войдите'))renderGuest();else{$('#page').innerHTML=`<div class="onboarding"><div class="onboard-hero"><h1>Не удалось открыть плейлист</h1><p>${esc(e.message)}</p><button class="button button-lime" data-action="retry">Повторить</button></div></div>`;toast(e.message,true)}}
}
function renderGuest(){
  $('#main-nav').innerHTML='';$('#community-switcher').innerHTML='';$('#profile-button').innerHTML='';$('#top-avatar').textContent='♫';
  $('#page').innerHTML=`<div class="onboarding"><section class="onboard-hero"><div class="eyebrow">МУЗЫКА ВАШЕГО СООБЩЕСТВА</div><h1>Одна группа.<br>Один общий ритм.</h1><p>Войдите, чтобы создавать сообщества, предлагать треки и голосовать за музыку недели.</p><a class="button button-lime" href="/signin-with-chatgpt?return_to=${encodeURIComponent(location.pathname+location.search)}" target="_top">Войти и начать ↗</a><div class="onboard-art"><div class="vinyl"></div></div></section>${features()}</div>`;
}
function features(){return `<div class="onboard-features"><div class="feature"><span class="feature-icon">✳</span><strong>Предлагайте треки</strong><p>Выбирайте из мини-библиотеки или загружайте собственные аудиофайлы.</p></div><div class="feature"><span class="feature-icon">↗</span><strong>Голосуйте вместе</strong><p>Каждый голос меняет рейтинг и порядок очереди в реальном времени.</p></div><div class="feature"><span class="feature-icon">◴</span><strong>Новая неделя — новый старт</strong><p>Голоса обновляются по понедельникам, история решений сохраняется.</p></div></div>`}
function render(){
  $('#top-date').textContent=new Date().toLocaleDateString('ru-RU',{day:'numeric',month:'long',year:'numeric'});
  $('#top-avatar').textContent=initials(S.user?.display_name);$('#profile-button').innerHTML=`<span class="mini-avatar">${esc(initials(S.user?.display_name))}</span><span>${esc(S.user?.display_name)}<small>Мой профиль</small></span>`;
  $('#community-switcher').innerHTML=S.communityId?`<button class="community-select" data-action="community-menu"><span class="community-symbol">${esc(initials(S.data.community.name))}</span><span class="community-select-text"><strong>${esc(S.data.community.name)}</strong><small>${esc(S.data.community.faculty||'Сообщество')}</small></span><span class="chevron">⌄</span></button>${S.menu?`<div class="community-menu">${S.communities.map(c=>`<button data-action="switch-community" data-id="${esc(c.id)}">${esc(c.name)}</button>`).join('')}<button data-action="create">＋ Создать сообщество</button><button data-action="join">↗ Войти по коду</button></div>`:''}`:`<button class="community-select" data-action="create"><span class="community-symbol">＋</span><span class="community-select-text"><strong>Новое сообщество</strong><small>Создайте свою волну</small></span></button>`;
  $('#main-nav').innerHTML=S.communityId?nav.filter(([v])=>v!=='moderation'||['owner','moderator'].includes(S.data.community.role)).map(([v,label,path])=>`<button class="nav-item ${S.view===v?'active':''}" data-view="${v}">${icon(path)}<span>${label}</span>${v==='moderation'&&S.data.pending_count?`<span class="nav-badge">${S.data.pending_count}</span>`:''}</button>`).join(''):`<button class="nav-item active" data-action="create">＋ Создать сообщество</button><button class="nav-item" data-action="join">↗ Войти по коду</button>`;
  $('#breadcrumb').textContent=S.communityId?`${S.data.community.name}  /  ${nav.find(x=>x[0]===S.view)?.[1]||'Главная'}`:'Начните свою волну';
  if(!S.communityId)renderOnboarding();else if(S.view==='overview')renderOverview();else if(S.view==='playlist')renderPlaylist();else if(S.view==='library')renderLibrary();else if(S.view==='favorites')renderFavorites();else if(S.view==='history')renderHistory();else if(S.view==='members')renderMembers();else if(S.view==='moderation')renderModeration();else renderSettings();
  renderPlayer();
}
function renderOnboarding(){
  $('#page').innerHTML=`<div class="onboarding"><section class="onboard-hero"><div class="eyebrow">ПЛЕЙЛИСТ, КОТОРЫЙ СОЗДАЁТЕ ВЫ</div><h1>У вашей группы<br>появится свой звук.</h1><p>Пригласите одногруппников, собирайте композиции вместе и выбирайте, что прозвучит следующим.</p><div class="onboard-actions"><button class="button button-lime" data-action="create">＋ Создать сообщество</button><button class="button button-light" data-action="join">Войти по приглашению</button></div><div class="onboard-art"><div class="vinyl"></div></div></section>${features()}</div>`;
}
const ART_COLORS={dawn:'#75542c',city:'#674296',orbit:'#276b74',rain:'#42652e',night:'#8e3e63',sea:'#9a7431'};
function cover(t,large=false){const key=t.library_key||t.key||'upload';return `<span class="${large?'now-art':'cover'} art-${esc(key)}" style="--art-color:${ART_COLORS[key]||'#33554b'}"><span class="art-orbits"><i></i><i></i><i></i><i></i></span><span class="art-wave">ıııııı</span></span>`}
function trackRow(t,i){
  const queued=t.status==='approved'&&(!t.queue_state||t.queue_state==='queued');
  const playable=t.status==='approved'&&t.queue_state!=='removed';
  const labels={pending:'На проверке',rejected:'Отклонён',banned:'Заблокирован',played:'Прослушан',removed:'Убран из очереди'};
  return `<div class="track-row ${S.current===t.id?'current-track':''}"><span class="rank">${S.current===t.id&&S.playing?'ııı':String(i+1).padStart(2,'0')}</span>${cover(t)}<span class="track-name"><strong>${esc(t.title)}</strong><small>${esc(t.artist)} · ${esc(t.contributor||'')}</small></span><span class="track-tag">${queued?esc(t.genre||'Музыка'):esc(labels[t.status==='approved'?t.queue_state:t.status]||'')}</span><span class="vote-group">${queued?`<button class="vote-btn ${Number(t.my_vote)===1?'selected':''}" data-action="vote" data-id="${esc(t.id)}" data-value="1" aria-label="Поддержать ${esc(t.title)}" aria-pressed="${Number(t.my_vote)===1}">↑</button><span class="score" title="Голоса: ${Number(t.vote_score??t.score)||0}. Поправка за треки автора сегодня: −${Number(t.penalty)||0}">${Number(t.score)>0?'+':''}${Number(t.score)||0}</span><button class="vote-btn down ${Number(t.my_vote)===-1?'selected':''}" data-action="vote" data-id="${esc(t.id)}" data-value="-1" aria-label="Против ${esc(t.title)}" aria-pressed="${Number(t.my_vote)===-1}">↓</button>`:'<span class="muted">—</span>'}</span><span class="row-controls">${playable?`<button class="favorite-button ${t.is_favorite?'selected':''}" data-action="favorite" data-id="${esc(t.id)}" aria-label="${t.is_favorite?'Убрать из избранного':'В избранное'}" aria-pressed="${!!t.is_favorite}">${t.is_favorite?'♥':'♡'}</button><button class="play-row" data-action="play" data-id="${esc(t.id)}" aria-label="Воспроизвести ${esc(t.title)}">▶</button>`:''}</span></div>`;
}
function trackList(tracks,limit){const list=limit?tracks.slice(0,limit):tracks;return list.length?`<div class="track-list">${list.map((t,i)=>trackRow(t,i)).join('')}</div>`:`<div class="empty-list"><span class="emoji">♫</span><strong>Пока ни одного трека</strong><p>Добавьте музыку из медиатеки или загрузите свой файл.</p><button class="button button-lime" data-action="suggest">＋ Предложить трек</button></div>`}
function renderOverview(){
  const d=S.data,c=d.community,tracks=approved(),stats=d.stats||{};
  const activity=d.dashboard?.activity||[];
  const series=activity.slice(-7),total=series.reduce((sum,x)=>sum+Number(x[S.metric]||0),0),max=Math.max(4,...series.map(x=>Number(x[S.metric]||0)));
  const genres=d.dashboard?.genres||[],genreTotal=genres.reduce((n,g)=>n+g.count,0);
  const colors=['#b9ed7d','#8f7adb','#79bdb2','#db9e74','#d9c76c','#7198d6'];
  const contributors=d.dashboard?.contributors||[];
  $('#page').innerHTML=`<div class="page-heading"><div><div class="eyebrow">НА ОДНОЙ ВОЛНЕ</div><h1>Твой музыкальный <em>дом.</em></h1><p>${esc(c.name)} · Здесь звучит выбор каждого</p></div><button class="button button-light" data-action="invite">${icon('<path d="M12 16V3m-4 4 4-4 4 4M4 14v6h16v-6"/>')} Пригласить друзей</button></div>
  <div class="stats-grid"><div class="stat-card"><span class="stat-icon lime">♫</span><span class="stat-label">Треков в очереди</span><strong>${stats.queued??tracks.length}</strong><span class="metric-change">Общий музыкальный выбор</span></div><div class="stat-card"><span class="stat-icon pink">${icon('<circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2M17 5a3 3 0 0 1 0 6m0 3a5 5 0 0 1 4 5"/>')}</span><span class="stat-label">Участников</span><strong>${stats.members??d.members.length}</strong><span class="metric-change">Разные вкусы. Один плейлист.</span></div><div class="stat-card"><span class="stat-icon blue">↗</span><span class="stat-label">Голосов в этой ротации</span><strong>${stats.votes??0}</strong><span class="metric-change">Каждый голос имеет значение</span></div></div>
  <div class="dashboard-grid"><div class="main-column"><section class="panel dashboard-main"><div class="dashboard-heading"><div><span class="section-kicker">ПУЛЬС СООБЩЕСТВА</span><h2>Музыка в цифрах</h2></div><span class="week-chip">Последние 7 дней</span></div><div class="chart-summary"><div><strong>${total}</strong><span>${S.metric==='votes'?'изменений голосов':'треков завершено'}</span></div><div class="home-tabs"><button data-metric="votes" class="${S.metric==='votes'?'active':''}">Голоса</button><button data-metric="plays" class="${S.metric==='plays'?'active':''}">Прослушивания</button></div></div><div class="activity-chart" role="img" aria-label="${S.metric==='votes'?'Голосования':'Прослушивания'} за 7 дней: ${series.map(x=>`${x.date}: ${x[S.metric]||0}`).join(', ')}"><div class="chart-grid-lines"><span>${max}</span><span>${Math.round(max/2)}</span><span>0</span></div><div class="chart-columns">${series.map((x,i)=>`<div class="chart-day ${i===series.length-1?'today':''}"><div class="chart-bar-space"><div class="chart-bar" style="--height:${Math.max(2,100*Number(x[S.metric]||0)/max)}%;height:${Math.max(2,100*Number(x[S.metric]||0)/max)}%"><span>${x[S.metric]||0}</span></div></div><span>${new Date(x.date+'T12:00:00').toLocaleDateString('ru-RU',{weekday:'short'})}</span></div>`).join('')}</div></div><div class="chart-legend"><span><i></i> ${S.metric==='votes'?'Голоса участников':'Завершённые треки'}</span><span>Обновляется автоматически</span></div><div class="dashboard-bottom"><div class="genre-chart"><span class="section-kicker">ЗВУЧАНИЕ ГРУППЫ</span><h3>Наш музыкальный вкус</h3><div class="genre-strip">${genres.map((g,i)=>`<span title="${esc(g.name)}: ${g.count}" style="width:${100*g.count/(genreTotal||1)}%;background:${colors[i%colors.length]}"></span>`).join('')}</div>${genres.length?`<div class="genre-labels">${genres.slice(0,6).map((g,i)=>`<span><i style="background:${colors[i%colors.length]}"></i>${esc(g.name)}<b>${Math.round(100*g.count/(genreTotal||1))}%</b></span>`).join('')}</div>`:'<p class="muted">Жанры появятся после добавления треков.</p>'}</div><div class="participation"><span class="section-kicker">ЧЕСТНАЯ ОЧЕРЕДЬ</span><h3>Место для каждого</h3><p>За каждый прозвучавший сегодня трек автора рейтинг его следующих композиций уменьшается на 2 балла.</p><button class="link-button" data-view="playlist">Влиять на очередь →</button></div></div></section><section class="panel home-ranking"><div class="panel-head"><div><span class="section-kicker">ВЫБРАЛИ ВМЕСТЕ</span><h2>Следующие на волне</h2></div><button class="link-button" data-view="playlist">Весь плейлист →</button></div>${trackList(tracks,4)}</section></div><aside class="dashboard-aside side-column"><section class="panel community-card"><span class="section-kicker">ТВОЁ СООБЩЕСТВО</span><div class="community-card-art">${icon('<path d="M4 9v6m4-10v14m4-17v20m4-17v14m4-10v6"/>')}</div><h2>${esc(c.name)}</h2><p>${esc(c.description||'Собираем саундтрек наших дней.')}</p><div class="member-stack">${d.members.slice(0,4).map(x=>`<span class="mini-avatar" title="${esc(x.display_name)}">${esc(initials(x.display_name))}</span>`).join('')}<span>${d.members.length} вместе</span></div><button class="button button-lime" data-action="invite">Пригласить в сообщество ↗</button></section><section class="panel"><div class="panel-head"><div><span class="section-kicker">ЗАДАЮТ НАСТРОЕНИЕ</span><h2>На нашей волне</h2></div></div>${contributors.length?contributors.slice(0,4).map((x,i)=>`<div class="leader-row"><span class="mini-avatar">${esc(initials(x.name))}</span><span><strong>${esc(x.name)}</strong><small>${plural(x.tracks,'предложение','предложения','предложений')}</small></span><span class="leader-rank">${String(i+1).padStart(2,'0')}</span></div>`).join(''):'<p class="muted">Предложите первый трек — начните историю сообщества.</p>'}<button class="link-button" data-view="members">Все участники →</button></section></aside></div>`;
}
function renderPlaylist(){
  const all=S.data.tracks,tracks=S.filter==='approved'?approved():S.filter==='mine'?all.filter(t=>t.created_by===S.user.id):S.filter==='played'?all.filter(t=>t.queue_state==='played'):all.filter(t=>t.queue_state!=='removed'&&t.status!=='banned');
  $('#page').innerHTML=`<div class="page-heading"><div><div class="eyebrow">ТВОЙ ГОЛОС МЕНЯЕТ ОЧЕРЕДЬ</div><h1>Наш <em>плейлист.</em></h1><p>Общий саундтрек сообщества · ротация с ${esc(dateText(S.data.week_key))}</p></div><button class="button button-light" data-action="play-top">▶ Слушать очередь</button></div><button class="propose-banner" data-action="suggest"><span class="propose-icon">＋</span><span class="propose-copy"><strong>Предложить трек</strong><span>Тот самый, который должны услышать все. Из медиатеки или с твоего устройства.</span></span><span class="propose-arrow">↗</span></button><div class="filter-row"><button class="filter-chip ${S.filter==='all'?'active':''}" data-filter="all">Все треки</button><button class="filter-chip ${S.filter==='approved'?'active':''}" data-filter="approved">В очереди <b>${approved().length}</b></button><button class="filter-chip ${S.filter==='mine'?'active':''}" data-filter="mine">Мои предложения</button><button class="filter-chip ${S.filter==='played'?'active':''}" data-filter="played">Прослушанные</button></div><section class="panel playlist-panel"><div class="panel-head"><div><h2>${plural(tracks.length,'композиция','композиции','композиций')}</h2><div class="muted">↑ поддержать · ↓ против · нажать снова, чтобы снять голос</div></div><span class="live-badge">ЖИВАЯ ОЧЕРЕДЬ</span></div>${trackList(tracks)}</section><p class="playlist-note">Рейтинг = голоса − 2 × число треков автора, прозвучавших сегодня. При равном рейтинге первым будет трек, предложенный раньше.</p>`;
}
function renderFavorites(){
  const tracks=allPlayable().filter(t=>t.is_favorite);
  $('#page').innerHTML=`<div class="page-heading"><div><div class="eyebrow">ТВОЯ КОЛЛЕКЦИЯ</div><h1>Любимые <em>треки.</em></h1><p>Всё, что заставляет сердце биться в такт.</p></div></div><section class="favorites-banner"><span>♥</span><div><h2>Моя коллекция</h2><p>${plural(tracks.length,'композиция','композиции','композиций')} из этого сообщества</p></div></section><section class="panel"><div class="panel-head"><h2>Избранное</h2></div>${tracks.length?trackList(tracks):'<div class="small-empty">Нажмите ♡ рядом с треком, чтобы сохранить его здесь.</div>'}</section>`;
}
function renderLibrary(){
  const used=new Set(S.data.tracks.filter(t=>t.status!=='rejected').map(t=>t.library_key));
  $('#page').innerHTML=`<div class="page-heading"><div><div class="eyebrow">НОВОЕ ЗВУЧАНИЕ</div><h1>Твоя <em>медиатека.</em></h1><p>Добавьте композицию из подборки или загрузите свою</p></div><button class="button button-primary" data-action="upload">⇧ Загрузить файл</button></div><div class="content-grid"><div class="library-grid">${S.data.library.filter(t=>!S.search||`${t.title} ${t.artist} ${t.genre}`.toLowerCase().includes(S.search.toLowerCase())).map(t=>`<article class="library-card"><div class="library-art">${cover(t,true)}<span class="library-art-label">VOLNA STUDIO</span></div><h3>${esc(t.title)}</h3><p>${esc(t.artist)} · ${esc(t.genre)} · ${duration(t.duration)}</p><button class="button ${used.has(t.key)?'button-light':'button-lime'} button-sm" data-action="add-library" data-key="${esc(t.key)}" ${used.has(t.key)?'disabled':''}>${used.has(t.key)?'✓ Уже в плейлисте':'＋ Предложить трек'}</button></article>`).join('')}</div><aside><div class="note-box"><strong>♫ О библиотеке</strong>Эти шесть мини-композиций созданы для демонстрации сайта и воспроизводятся прямо в браузере. Свои MP3, WAV и другие аудиофайлы можно загрузить в хранилище сообщества.</div><div class="note-box" style="margin-top:12px"><strong>Как это работает</strong>Предложенные участниками треки сначала проверяет создатель или модератор. После одобрения они появятся в общей очереди.</div></aside></div>`;
}
async function view(v){S.view=v;S.filter='all';S.menu=false;$('#sidebar').classList.remove('open');if(v==='history'){try{S.history=await request(communityPath('history'))}catch(e){toast(e.message,true)}}if(v==='moderation'){try{S.logs=await request(communityPath('moderation'))}catch(e){toast(e.message,true)}}render();window.scrollTo({top:0,behavior:'smooth'})}
function renderHistory(){
  const h=S.history||{weeks:[],votes:[],plays:[]};
  $('#page').innerHTML=`<div class="page-heading"><div><div class="eyebrow">ПАМЯТЬ СООБЩЕСТВА</div><h1>История голосований</h1><p>Каждый голос сохраняется, а рейтинг начинается заново по понедельникам</p></div></div><div class="content-grid"><div><section class="panel"><div class="panel-head"><h2>Последние голоса</h2><span class="week-chip">◷ ${h.votes.length} событий</span></div>${h.votes.length?`<div class="history-list">${h.votes.map(v=>`<div class="history-item"><span class="history-icon">${Number(v.new_value)>0?'↑':Number(v.new_value)<0?'↓':'×'}</span><span><strong>${esc(v.display_name)} ${Number(v.new_value)===0?'снял(а) голос':Number(v.new_value)>0?'поддержал(а)':'проголосовал(а) против'} «${esc(v.title)}»</strong><small>${esc(v.artist)} · неделя ${esc(dateText(v.week_key))}</small></span><time>${esc(timeText(v.created_at))}</time></div>`).join('')}</div>`:'<div class="small-empty">Пока никто не голосовал. Станьте первым!</div>'}</section><section class="panel" style="margin-top:17px"><div class="panel-head"><h2>История воспроизведения</h2></div>${h.plays.length?`<div class="history-list">${h.plays.map(v=>`<div class="history-item"><span class="history-icon">♫</span><span><strong>${esc(v.title)}</strong><small>Включил(а) ${esc(v.display_name)}</small></span><time>${esc(timeText(v.played_at))}</time></div>`).join('')}</div>`:'<div class="small-empty">Пока ничего не воспроизводили.</div>'}</section></div><aside><section class="panel"><div class="panel-head"><h2>Ротация по неделям</h2></div>${h.weeks.length?h.weeks.map(w=>`<div class="history-item"><span class="history-icon">◷</span><span><strong>С ${esc(dateText(w.week_key))}</strong><small>${Number(w.voters)} голосующих · ${Number(w.ballots)} активных голосов</small></span></div>`).join(''):'<div class="small-empty">Итоги появятся после голосования.</div>'}</section><div class="note-box" style="margin-top:15px"><strong>Новая неделя</strong>В понедельник счётчик голосов для очереди обнуляется автоматически. Все предыдущие решения остаются в истории.</div></aside></div>`;
}
function roleLabel(role){return role==='owner'?'Создатель':role==='moderator'?'Модератор':'Участник'}
function renderMembers(){
  const d=S.data;
  $('#page').innerHTML=`<div class="page-heading"><div><div class="eyebrow">ЛЮДИ НА ОДНОЙ ВОЛНЕ</div><h1>Участники</h1><p>${d.members.length} участников помогают создавать общий плейлист</p></div><button class="button button-primary" data-action="invite">↗ Пригласить</button></div><div class="content-grid"><section class="panel"><div class="panel-head"><h2>Наша команда</h2></div><div class="people-list">${d.members.map(x=>`<div class="person-row"><span class="mini-avatar">${esc(initials(x.display_name))}</span><span class="person-main"><strong>${esc(x.display_name)}${x.id===S.user.id?' · вы':''}</strong><small>В сообществе с ${esc(dateText(x.joined_at))}</small></span><span class="role-pill ${esc(x.role)}">${roleLabel(x.role)}</span>${d.community.role==='owner'&&x.role!=='owner'?`<button class="button button-light button-sm" data-action="toggle-role" data-id="${esc(x.id)}" data-role="${x.role==='member'?'moderator':'member'}">${x.role==='member'?'Назначить модератором':'Снять роль'}</button>`:''}</div>`).join('')}</div></section><aside><section class="panel"><div class="panel-head"><h2>Пригласить друзей</h2></div><p class="muted">Поделитесь кодом или ссылкой с участниками группы.</p><div class="invite-code">${esc(d.community.invite_code)}</div><button class="button button-lime" style="width:100%" data-action="copy-invite">Скопировать ссылку</button></section></aside></div>`;
}
function renderModeration(){
  const tracks=S.data.tracks,logs=S.logs?.logs||[];
  const list=(items,mode)=>items.length?items.map(t=>`<div class="moderation-row">${cover(t)}<span class="moderation-track"><strong>${esc(t.title)}</strong><small>${esc(t.artist)} · ${esc(t.contributor)}</small></span><span class="moderation-actions">${mode==='pending'?`<button class="button button-lime button-sm" data-action="moderate" data-id="${esc(t.id)}" data-status="approved">Одобрить</button><button class="button button-danger button-sm" data-action="moderate" data-id="${esc(t.id)}" data-status="rejected">Отклонить</button>`:mode==='active'?`<button class="button button-light button-sm" data-action="moderate" data-id="${esc(t.id)}" data-status="remove">Убрать</button><button class="button button-danger button-sm" data-action="moderate" data-id="${esc(t.id)}" data-status="banned">Запретить</button>`:`<button class="button button-light button-sm" data-action="moderate" data-id="${esc(t.id)}" data-status="restore">Восстановить</button>`}</span></div>`).join(''):'<div class="small-empty">Здесь всё спокойно.</div>';
  const pending=tracks.filter(t=>t.status==='pending'),hidden=tracks.filter(t=>['rejected','banned'].includes(t.status)||t.queue_state==='removed');
  const actions={approve:'Одобрен',reject:'Отклонён',approved:'Одобрен',rejected:'Отклонён',banned:'Заблокирован',ban:'Заблокирован',remove:'Убран из очереди',restore:'Восстановлен',rotation:'Ротация'};
  $('#page').innerHTML=`<div class="page-heading"><div><div class="eyebrow">ЗАБОТА О СООБЩЕСТВЕ</div><h1>Модерация</h1><p>Проверяйте предложения и управляйте общим звучанием.</p></div><button class="button button-light" data-action="rotation">↻ Новая ротация</button></div><div class="content-grid"><div><section class="panel"><div class="panel-head"><h2>На проверке</h2><span class="week-chip">${pending.length}</span></div>${list(pending,'pending')}</section><section class="panel spaced-panel"><div class="panel-head"><h2>В очереди</h2></div>${list(approved(),'active')}</section><section class="panel spaced-panel"><div class="panel-head"><h2>Убраны и заблокированы</h2></div>${list(hidden,'hidden')}</section></div><aside><section class="panel"><div class="panel-head"><h2>Журнал действий</h2></div>${logs.length?logs.map(l=>`<div class="history-item"><span class="history-icon">${l.action==='approved'?'✓':'↻'}</span><span><strong>${esc(l.display_name)}</strong><small>${esc(actions[l.action]||l.action)}: ${esc(l.details)}</small><small>${esc(timeText(l.created_at))}</small></span></div>`).join(''):'<div class="small-empty">Действий пока нет.</div>'}</section><div class="note-box spaced-panel"><strong>Автомодерация</strong>Название и исполнитель проверяются по настроенному списку стоп-слов. Подозрительные загрузки отправляются на ручную проверку.</div></aside></div>`;
}
function renderSettings(){const c=S.data.community;
  $('#page').innerHTML=`<div class="page-heading"><div><div class="eyebrow">ЛИЧНОЕ ПРОСТРАНСТВО</div><h1>Настройки</h1><p>Ваш профиль и информация о сообществе</p></div></div><section class="panel settings-card"><div class="panel-head"><h2>Мой профиль</h2></div><form id="profile-form"><div class="field"><label for="display-name">Как вас видят другие участники</label><input id="display-name" name="display_name" value="${esc(S.user.display_name)}" minlength="2" maxlength="60" required></div><button class="button button-primary" type="submit">Сохранить имя</button></form><div class="divider"></div><div class="panel-head"><h2>Сообщество</h2></div><div class="field"><label>Название</label><input value="${esc(c.name)}" readonly></div><div class="field"><label>Факультет или группа</label><input value="${esc(c.faculty)}" readonly></div><div class="field"><label>Код приглашения</label><input value="${esc(c.invite_code)}" readonly></div><button class="button button-light" data-action="copy-invite">Скопировать ссылку-приглашение</button><div class="divider"></div><a class="button button-light" href="/signout-with-chatgpt?return_to=%2F" target="_top">Выйти из аккаунта</a></section>`;
}
function modal(type,prefill=''){
  S.modalFocus=document.activeElement;
  if(type==='invite'){
    const link=`${location.origin}/?invite=${encodeURIComponent(S.data.community.invite_code)}`;
    const qr=qrcode(0,'M');qr.addData(link);qr.make();
    $('#modal-root').innerHTML=`<div class="modal-backdrop" data-action="close-modal"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div class="modal-head"><div><div class="eyebrow">МУЗЫКА ОБЪЕДИНЯЕТ</div><h2 id="modal-title">Пригласить друзей</h2></div><button class="modal-close" data-action="close-modal" aria-label="Закрыть">×</button></div><div class="modal-body invite-modal"><p class="muted">Отсканируйте QR-код или введите код сообщества на сайте.</p><div class="invite-qr">${qr.createSvgTag({cellSize:4,margin:16,scalable:true})}</div><div class="invite-code">${esc(S.data.community.invite_code)}</div><button class="button button-lime" data-action="copy-invite">Скопировать ссылку</button>${location.hostname.endsWith('.chatgpt.site')?'<p class="side-tip">Для входа в закрытый сайт участнику также нужен доступ к нему.</p>':''}</div></div></div>`;
    $('#modal-root button')?.focus();return;
  }
  if(type==='suggest'||type==='rotation'){
    $('#modal-root').innerHTML=`<div class="modal-backdrop" data-action="close-modal"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div class="modal-head"><div><div class="eyebrow">${type==='suggest'?'ДОБАВЬ СВОЁ ЗВУЧАНИЕ':'НОВЫЙ МУЗЫКАЛЬНЫЙ КРУГ'}</div><h2 id="modal-title">${type==='suggest'?'Предложить трек':'Начать новую ротацию?'}</h2></div><button class="modal-close" data-action="close-modal" aria-label="Закрыть">×</button></div><div class="modal-body">${type==='suggest'?`<button class="suggest-option" data-action="open-library"><span>◉</span><span><strong>Выбрать из медиатеки</strong><small>Шесть авторских мини-композиций</small></span><b>→</b></button><button class="suggest-option" data-action="upload"><span>⇧</span><span><strong>Загрузить свой файл</strong><small>MP3, WAV и другие форматы · до 15 МБ</small></span><b>→</b></button>`:`<p class="muted">Одобренные прослушанные треки вернутся в очередь, и голосование начнётся с нуля. История сохранится. Убранные и заблокированные композиции останутся вне очереди.</p><div class="modal-actions"><button class="button button-light" data-action="close-modal">Отмена</button><button class="button button-lime" data-action="confirm-rotation">Начать ротацию</button></div>`}</div></div></div>`;
    $('#modal-root button')?.focus();return;
  }
  const titles={create:['Новое сообщество','Соберите группу вокруг музыки. Позже вы сможете пригласить участников по коду.'],join:['Войти по приглашению','Введите шестизначный код, который вам отправили.'],upload:['Загрузить композицию','Аудиофайл сохранится в хранилище сообщества. Максимум 15 МБ.']};
  const [title,sub]=titles[type];
  const fields=type==='create'?`<div class="field"><label for="community-name">Название сообщества *</label><input id="community-name" name="name" placeholder="Например, Дизайн 2026" minlength="3" maxlength="70" required autofocus></div><div class="field"><label for="faculty">Группа или факультет</label><input id="faculty" name="faculty" placeholder="Например, Факультет дизайна" maxlength="90"></div><div class="field"><label for="description">О вашем сообществе</label><textarea id="description" name="description" placeholder="Пара слов о вашей группе" maxlength="260"></textarea></div>`:type==='join'?`<div class="field"><label for="join-code">Код приглашения *</label><input id="join-code" name="code" value="${esc(prefill)}" placeholder="Например, ABC123" minlength="6" maxlength="12" required autofocus style="text-transform:uppercase;letter-spacing:3px;font-weight:800"></div>`:`<div class="field"><label for="upload-title">Название</label><input id="upload-title" name="title" placeholder="Определим по имени файла" maxlength="100"></div><div class="field"><label for="upload-artist">Исполнитель</label><input id="upload-artist" name="artist" placeholder="Исполнитель или группа" maxlength="80"></div><div class="field"><label for="upload-genre">Жанр</label><input id="upload-genre" name="genre" placeholder="Например, инди" maxlength="50"></div><div class="field"><label>Аудиофайл *</label><div class="file-drop"><strong>♫ Выберите файл</strong><input name="file" type="file" accept=".mp3,.wav,.ogg,.m4a,.aac,.webm,.flac,audio/*" required><small>MP3, WAV, OGG, M4A, AAC, WebM или FLAC</small></div></div>`;
  $('#modal-root').innerHTML=`<div class="modal-backdrop" data-action="close-modal"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div class="modal-head"><div><h2 id="modal-title">${title}</h2><p>${sub}</p></div><button class="modal-close" type="button" data-action="close-modal" aria-label="Закрыть">×</button></div><form id="modal-form" data-type="${type}" class="modal-body">${fields}<div class="modal-actions"><button class="button button-light" type="button" data-action="close-modal">Отмена</button><button class="button button-primary" type="submit">${type==='create'?'Создать сообщество':type==='join'?'Войти':'Загрузить трек'} →</button></div></form></div></div>`;
  $('#modal-root input[autofocus]')?.focus();
}
function closeModal(){$('#modal-root').innerHTML='';S.modalFocus?.focus?.()}
async function refresh(){if(S.communityId)S.data=await request(communityPath());render()}
async function doVote(id,value){const t=S.data.tracks.find(x=>x.id===id);if(!t)return;const next=Number(t.my_vote)===value?0:value;await post(communityPath(`tracks/${id}/vote`),{value:next});await refresh()}
async function doModerate(id,status){await post(communityPath(`tracks/${id}/moderate`),['remove','restore'].includes(status)?{action:status}:{status});S.logs=await request(communityPath('moderation'));await refresh();toast('Очередь обновлена')}
async function copyInvite(){const link=`${location.origin}/?invite=${encodeURIComponent(S.data.community.invite_code)}`;try{await navigator.clipboard.writeText(link);toast('Ссылка-приглашение скопирована')}catch{toast(`Код приглашения: ${S.data.community.invite_code}`)}}
const audioController=new AudioController({onTick:updateProgress,onEnded:completeTrack,onError:message=>{S.playing=false;renderPlayer();toast(message,true)}});
function stopAudio(){audioController.stop();S.playing=false}
async function playTrack(id){
  const t=allPlayable().find(x=>x.id===id);if(!t)return;
  const cid=S.communityId;S.preview=t.queue_state==='played';S.current=id;S.playing=true;
  try{
    await audioController.load({...t},communityPath(`tracks/${id}/audio`));
    if(!S.preview){const playback=await post(communityPath(`tracks/${id}/play`),{});if(S.communityId===cid&&S.current===id)audioController.track.queue_version=playback.queue_version??t.queue_version}
    renderPlayer();
  }catch(error){stopAudio();renderPlayer();toast(error.message||'Не удалось запустить воспроизведение',true)}
}
function pausePlayer(){audioController.pause();S.playing=false;renderPlayer()}
async function resumePlayer(){if(!S.current){await playTop();return}try{await audioController.play();S.playing=true;renderPlayer()}catch{toast('Не удалось продолжить воспроизведение',true)}}
async function playTop(){if(approved().length)await playTrack(approved()[0].id);else toast('Очередь пуста. Предложите новый трек или начните ротацию.')}
async function completeTrack(track){
  if(S.finishing||!track)return;S.playing=false;
  if(S.preview){audioController.stop();S.current=null;renderPlayer();return}
  S.finishing=true;
  try{
    const result=await post(communityPath(`tracks/${track.id}/complete`),{queue_version:track.queue_version});
    audioController.stop();S.current=null;await refresh();
    if(result.next_track){const id=typeof result.next_track==='string'?result.next_track:result.next_track.id;await playTrack(id)}
    else toast('Вы прослушали всю очередь. Самое время добавить что-то новое.');
  }catch(error){toast('Не удалось обновить очередь: '+error.message,true);renderPlayer()}
  finally{S.finishing=false}
}
function nextTrack(){const list=approved().filter(x=>x.id!==S.current);if(list.length)playTrack(list[0].id);else toast('Других треков в очереди пока нет')}
function prevTrack(){if(audioController.track)audioController.seek(0)}
function currentSeconds(){return audioController.seconds}
function renderMusicIsland(){
  if(!S.communityId){$('#music-island').innerHTML='';return}
  const t=allPlayable().find(x=>x.id===S.current)||approved()[0];
  $('#music-island').innerHTML=`<section class="music-island"><div class="island-art">${t?cover(t):'<span class="empty-art">♫</span>'}</div><div class="island-copy"><span class="section-kicker">${S.current?(S.preview?'ЛИЧНОЕ ПРОСЛУШИВАНИЕ':S.playing?'СЕЙЧАС НА ВОЛНЕ':'НА ПАУЗЕ'):'ТВОЙ МУЗЫКАЛЬНЫЙ ОСТРОВОК'}</span><strong>${esc(t?.title||'Здесь начинается музыка')}</strong><small>${esc(t?.artist||'Предложи первый трек в плейлист')}</small></div><div class="island-wave ${S.playing?'playing':''}" aria-hidden="true">${Array.from({length:25},(_,i)=>`<i style="--bar:${[12,22,34,18,42,28,16,36,48,24,14,32,20][i%13]}px;--delay:${i*.06}s"></i>`).join('')}</div><div class="island-controls"><button class="icon-button" data-action="prev" aria-label="В начало трека">⏮</button><button class="big-play" data-action="toggle-play" aria-label="${S.playing?'Пауза':'Слушать'}">${S.playing?'❚❚':'▶'}</button><button class="icon-button" data-action="next" aria-label="Следующий по рейтингу">⏭</button></div><button class="island-queue" data-view="playlist">${icon('<path d="M3 6h12M3 11h12M3 16h8m7-5v9m-3-3 3 3 3-3"/>')}<span>${approved().length} в очереди</span></button></section>`;
}
function renderPlayer(){
  renderMusicIsland();
  const t=audioController.track;if(!t){$('#player').classList.add('hidden');return}$('#player').classList.remove('hidden');
  const fav=S.data?.tracks.find(x=>x.id===t.id)?.is_favorite;
  $('#player').innerHTML=`<div class="player-song">${cover(t)}<span class="track-name"><strong>${esc(t.title)}</strong><small>${esc(t.artist)}</small></span><button class="favorite-button ${fav?'selected':''}" data-action="favorite" data-id="${esc(t.id)}" aria-label="${fav?'Убрать из избранного':'В избранное'}">${fav?'♥':'♡'}</button></div><div class="player-controls"><div class="control-buttons"><button data-action="prev" aria-label="В начало трека">⏮</button><button class="big-play" data-action="toggle-play" aria-label="${S.playing?'Пауза':'Воспроизвести'}">${S.playing?'❚❚':'▶'}</button><button data-action="next" aria-label="Следующий трек">⏭</button></div><div class="progress-wrap"><span id="elapsed">${duration(currentSeconds())}</span><input id="seek" type="range" min="0" max="${audioController.duration}" step=".1" value="${currentSeconds()}" aria-label="Позиция воспроизведения"><span id="track-duration">${duration(audioController.duration)}</span></div></div><div class="player-right"><button class="icon-button" data-view="playlist" aria-label="Открыть очередь">☷</button><span aria-hidden="true">◖))</span><input id="volume" type="range" min="0" max="1" step="0.01" value="${audioController.volume}" aria-label="Громкость"></div>`;
  updateProgress();
}
function updateProgress(){
  if(!audioController.track)return;
  const seconds=currentSeconds();
  if($('#elapsed'))$('#elapsed').textContent=duration(seconds);
  if($('#track-duration'))$('#track-duration').textContent=duration(audioController.duration);
  if($('#seek')&&document.activeElement!==$('#seek')){$('#seek').value=seconds;$('#seek').max=audioController.duration}
}
async function poll(){
  if(!S.communityId||S.syncing||document.hidden||S.finishing)return;
  const cid=S.communityId;S.syncing=true;
  try{
    const data=await request(communityPath());
    if(cid!==S.communityId)return;
    const changed=JSON.stringify(data)!==JSON.stringify(S.data);S.online=true;
    if(changed){S.data=data;
      const active=S.data.tracks.find(t=>t.id===S.current);
      if(S.current&&(!active||active.status!=='approved'||active.queue_state==='removed'||(!S.preview&&active.queue_state==='played'))){stopAudio();S.current=null;toast('Очередь обновлена другим участником')}
      if(S.view==='history')S.history=await request(communityPath('history'));
      if(S.view==='moderation')S.logs=await request(communityPath('moderation'));
      if(S.view!=='settings'&&!document.activeElement?.matches('input,textarea,select'))render();
    }
  }catch{S.online=false}
  finally{S.syncing=false;const badge=$('#connection-state');if(badge){badge.textContent=S.online?'LIVE':'ПОДКЛЮЧЕНИЕ…';badge.classList.toggle('offline',!S.online)}}
}
setInterval(poll,2000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)poll()});
document.addEventListener('click',async event=>{
  const button=event.target.closest('[data-action],[data-view],[data-filter],[data-metric]');if(!button)return;
  const {action,id,key,status,role,value,view:targetView,filter,metric}=button.dataset;
  if(metric){S.metric=metric;renderOverview();return}
  if(action==='close-modal'){if(button.classList.contains('modal-backdrop')&&event.target!==button)return;closeModal();return}
  if(targetView){closeModal();view(targetView);return}if(filter){S.filter=filter;renderPlaylist();return}
  try{
    if(['create','join','upload','suggest','rotation','invite'].includes(action))modal(action);
    else if(action==='open-library'){closeModal();view('library')}
    else if(action==='favorite'){const t=S.data.tracks.find(x=>x.id===id);if(t){await post(communityPath(`tracks/${id}/favorite`),{value:!t.is_favorite});await refresh()}}
    else if(action==='confirm-rotation'){button.disabled=true;await post(communityPath('rotation'),{});closeModal();stopAudio();S.current=null;S.logs=await request(communityPath('moderation'));await refresh();toast('Новая ротация началась')}
    else if(action==='community-menu'){S.menu=!S.menu;render()}
    else if(action==='switch-community'){S.communityId=id;localStorage.setItem('volna-community',id);S.data=await request(communityPath());S.view='overview';S.menu=false;stopAudio();S.current=null;render()}
    else if(action==='vote')await doVote(id,Number(value));
    else if(action==='add-library'){const result=await post(communityPath('tracks/library'),{key});await refresh();toast(result.status==='pending'?'Трек отправлен на модерацию':'Трек добавлен в плейлист')}
    else if(action==='moderate')await doModerate(id,status);
    else if(action==='copy-invite')await copyInvite();
    else if(action==='play')await playTrack(id);
    else if(action==='play-top')await playTop();
    else if(action==='toggle-play'){if(S.playing)pausePlayer();else await resumePlayer()}
    else if(action==='next')nextTrack();else if(action==='prev')prevTrack();
    else if(action==='toggle-role'){await post(communityPath(`members/${id}/role`),{role});await refresh();toast('Роль участника обновлена')}
    else if(action==='retry')boot();
  }catch(e){toast(e.message,true)}
});
document.addEventListener('submit',async event=>{
  if(event.target.id==='modal-form'){
    event.preventDefault();const form=event.target,type=form.dataset.type,button=form.querySelector('[type=submit]');button.disabled=true;
    try{let result;
      if(type==='create')result=await post('/api/communities',Object.fromEntries(new FormData(form)));
      else if(type==='join')result=await post('/api/join',Object.fromEntries(new FormData(form)));
      else{result=await request(communityPath('tracks/upload'),{method:'POST',body:new FormData(form)});await refresh();toast(result.status==='pending'?'Файл загружен и ждёт модерации':'Файл добавлен в плейлист')}
      closeModal();if(type!=='upload'){S.view='overview';await boot(result.id);toast(type==='create'?'Сообщество создано':'Добро пожаловать в сообщество')}
    }catch(e){toast(e.message,true)}finally{button.disabled=false}
  }
  if(event.target.id==='profile-form'){
    event.preventDefault();const form=event.target;try{const data=await request('/api/profile',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify(Object.fromEntries(new FormData(form)))});S.user.display_name=data.display_name;await refresh();toast('Имя сохранено')}catch(e){toast(e.message,true)}
  }
});
document.addEventListener('input',e=>{if(e.target.id==='volume')audioController.setVolume(e.target.value);if(e.target.id==='seek')audioController.seek(e.target.value)});
document.addEventListener('change',e=>{if(e.target.name==='file'&&e.target.files[0]){const clean=e.target.files[0].name.replace(/\.[^.]+$/,'').replace(/_+/g,' ').replace(/^\d+[.\s-]+/,'');const parts=clean.split(/\s+[-–—]\s+/);if(!$('#upload-title').value)$('#upload-title').value=parts.length>1?parts.slice(1).join(' — '):clean;if(!$('#upload-artist').value&&parts.length>1)$('#upload-artist').value=parts[0]}});
$('#top-avatar').addEventListener('click',()=>{if(S.communityId)view('settings')});
$('#profile-button').addEventListener('click',()=>{if(S.communityId)view('settings')});
$('#mobile-menu').addEventListener('click',()=>$('#sidebar').classList.toggle('open'));
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal();if(e.key==='Tab'&&$('#modal-root .modal')){const nodes=[...$('#modal-root .modal').querySelectorAll('button,input,textarea,a[href]')].filter(x=>!x.disabled);const first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}}});
boot();
