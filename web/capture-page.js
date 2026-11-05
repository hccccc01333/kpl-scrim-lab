/* 采集一局：唯一的采集入口。
   营地授权一次 → 每天点「拉取对局」→ 勾选 → 入库。
   手动补一局和采集通道管理收进折叠区。 */
const esc = (v = '') => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const num = (v, d = 0) => Number.isFinite(Number(v)) ? Number(v).toLocaleString('zh-CN', {maximumFractionDigits: d}) : '—';
const CAMP_BATTLE_MODES = {1: '排位', 2: '匹配', 3: '大乱斗', 4: '训练', 5: '人机', 6: '巅峰赛', 7: '锦标赛'};
const modeText = v => v ? (CAMP_BATTLE_MODES[v] || `类型 ${v}`) : '—';
const winText = v => String(v) === '1' ? '蓝方胜' : String(v) === '2' ? '红方胜' : '—';
const formatStamp = value => {
  if (!value) return '—';
  if (typeof value === 'string' && value.includes('T')) {
    const date = new Date(value);
    return isNaN(date) ? value : date.toLocaleString('zh-CN', {month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'});
  }
  return timeText(value);
};
const timeText = value => {
  if (!value) return '—';
  const n = Number(value);
  const date = new Date(Number.isFinite(n) && n < 1e12 ? n * 1000 : value);
  return isNaN(date) ? '—' : date.toLocaleString('zh-CN', {month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'});
};

export async function renderCapture(container, {api, toast, isCurrent, workspace}) {
  let channels = [];
  let busy = false;
  const camp = {auth: {}, config: {players: []}, job: {}, detailsCount: 0, details: [],
                qrTask: null, authStatus: '', authTimer: null, syncTimer: null,
                list: [], checked: {}, checkedCount: 0, listLoading: false, syncStatus: '', listFetchedAt: ''};

  const load = async () => {
    const data = await api('/api/channels');
    channels = data.channels || [];
  };
  const loadCamp = async () => {
    try {
      const status = await api('/api/camp/sync');
      camp.auth = status.auth || {};
      camp.config = status.config || {players: []};
      camp.job = {running: !!status.running, result: status.result, error: status.error};
      camp.detailsCount = status.detailsCount || 0;
      camp.details = status.details || [];
    } catch { camp.auth = {authorized: false}; }
  };

  const draw = () => {
    if (!isCurrent()) return;
    const auth = camp.auth || {};
    const rosterPlayers = (workspace?.profile?.members || [])
      .filter(m => !m.archived && m.campUserId)
      .map(m => ({nickname: m.label || m.name, campUserId: m.campUserId, fromRoster: true}));
    const extraPlayers = (camp.config?.players || [])
      .filter(p => !rosterPlayers.some(r => r.campUserId === p.campUserId))
      .map(p => ({nickname: p.nickname, campUserId: p.campUserId, fromRoster: false}));
    const players = [...rosterPlayers, ...extraPlayers];
    const running = camp.job?.running;
    const detailByChannel = new Map((camp.details || []).filter(d => d.channelId).map(d => [d.channelId, d]));
    const latest = (camp.job?.result?.players || []);
    const autoAttached = camp.job?.result?.autoAttached || [];
    const entries = camp.list || [];
    const importedCount = entries.filter(item => item.imported).length;
    container.innerHTML = `
    <div class="page-heading"><div><span class="page-eyebrow">COLLECT · 采集</span><h1>采集一局</h1>
      <p>营地授权一次；之后每天点「拉取对局」，勾选要入库的比赛即可。手动补一局和通道管理收在下方。</p>
      <div class="page-facts"><span>已授权：${auth.authorized ? esc(auth.nickname || auth.userId || '是') : '未授权'}</span>
        <span>营地选手 ${num(players.length)} 人</span><span>本机对局详情 ${num(camp.detailsCount)} 份</span></div></div>
    <div class="heading-actions"><a class="button" href="#matches">比赛档案</a></div></div>

    <section class="panel"><div class="panel-head"><div><h2>营地自动同步</h2>
      <p>教练微信扫码授权一次 → 拉取对局 → 勾选 → 入库；入库后自动挂到对应的采集通道。</p></div>
      <span class="tag ${auth.authorized ? '' : 'amber'}">${auth.authorized ? '已授权' : '未授权'}</span></div>
      <div class="panel-body">
      ${camp.qrTask ? `<div class="form-grid" style="grid-template-columns:auto minmax(0,1fr);align-items:start">
        <img class="camp-qr" style="width:180px;border:1px solid var(--line);border-radius:8px" src="data:image/png;base64,${esc(camp.qrTask.qrcodeBase64)}" alt="扫码授权二维码">
        <div><p class="helper">用<strong>打过训练赛的教练微信</strong>扫码，并在手机上确认。二维码 3 分钟有效，过期自动刷新。</p>
        <p class="helper" id="camp-auth-status">${esc(camp.authStatus || '等待扫码…')}</p></div></div>`
      : `<div class="channel-actions">
        <button class="button secondary" id="camp-auth-qr">${auth.authorized ? '重新扫码授权' : '扫码授权'}</button>
        ${auth.authorized ? '<button class="button ghost" id="camp-auth-clear">删除凭证</button>' : ''}
        <span class="helper">${auth.authorized
          ? `授权于 ${esc(formatStamp(auth.loginAt))}。登录态失效时这里会提示重新扫码。`
          : '授权一次长期使用；之后每天直接拉取，不需要再扫码。'}</span></div>`}

      <div class="channel-actions" style="margin-top:14px">
        <button class="button primary" id="camp-list-fetch"
          ${!auth.authorized || !players.length || camp.listLoading || running ? 'disabled' : ''}>
          ${camp.listLoading ? '正在拉取对局列表…' : '拉取对局'}</button>
        <button class="button" id="camp-sync-run" ${!camp.checkedCount || running ? 'disabled' : ''}>
          ${running ? '入库进行中…' : `入库所选 ${num(camp.checkedCount)} 局`}</button>
        <span id="camp-sync-status" class="helper">${esc(camp.syncStatus || (running ? '正在拉取，每局约 2 秒…' : ''))}</span></div>

      ${entries.length ? `<div class="table-wrap" style="margin-top:14px"><table><thead><tr>
        <th><input type="checkbox" id="camp-list-all" ${entries.every(item => item.imported || camp.checked[item.gameSeq]) ? 'checked' : ''}></th>
        <th>对局</th><th>模式</th><th>时间</th><th>KDA</th><th>胜负</th><th>选手</th><th>状态</th></tr></thead><tbody>
        ${entries.map(item => {
          const kda = [item.killcnt, item.deadcnt, item.assistcnt].filter(v => v != null).join('/');
          return `<tr><td><input type="checkbox" data-list-check="${esc(item.gameSeq)}" ${camp.checked[item.gameSeq] ? 'checked' : ''} ${item.imported ? 'disabled' : ''}></td>
            <td><strong>${esc(item.gameSeq)}</strong><div class="helper">${esc(item.mapName || '—')}</div></td>
            <td>${esc(modeText(item.battleType))}</td><td>${esc(item.gametime || '—')}</td>
            <td>${esc(kda || '—')}</td><td>${winText(item.winCamp)}</td>
            <td>${esc(item.ownerName || '—')}</td>
            <td>${item.imported ? '<span class="tag">已入库</span>' : '<span class="tag amber">待拉取</span>'}</td></tr>`;
        }).join('')}</tbody></table></div>
        <p class="helper">拉取时间 ${esc(camp.listFetchedAt || '—')} · ${num(entries.length)} 局，其中 ${num(importedCount)} 局已入库。${camp.listHasMore ? '还有更早的对局未显示；需要拉取更早历史时用 tools/camp_sync.py --reset。' : ''}</p>`
      : `<div class="empty" style="margin-top:14px"><strong>还没有拉取对局</strong>${players.length
          ? '点「拉取对局」查看营地选手最近的比赛，勾选后入库。'
          : '先在下方「首次配置」里添加营地选手（一次性），再回来拉取。'}</div>`}

      ${latest.length ? `<div class="table-wrap" style="margin-top:14px"><table><thead><tr><th>选手</th><th>本次结果</th></tr></thead><tbody>
        ${latest.map(item => item.ok
          ? `<tr><td>${esc(item.nickname || item.campUserId)}</td><td>新局 ${num(item.summary?.fetched)} · 入库 ${num(item.summary?.saved)} · 已知 ${num(item.summary?.cached)}${item.summary?.failed ? ` · 失败 ${num(item.summary.failed)}` : ''}</td></tr>`
          : `<tr><td>${esc(item.nickname || item.campUserId)}</td><td><span class="tag amber">失败</span> ${esc(item.error || '')}</td></tr>`).join('')}
        </tbody></table></div>` : ''}
      ${camp.job?.error ? `<div class="notice">${esc(camp.job.error)}</div>` : ''}
      ${(autoAttached || []).length ? `<div class="notice">已自动挂载 ${num(autoAttached.length)} 个通道的营地十人面板；到「比赛档案」或下方通道列表里校对保存。</div>` : ''}

      <details class="recording-check" style="margin-top:14px"><summary>首次配置：粘贴选手的营地分享链接（每位选手一次）</summary>
        <div style="margin-top:12px">
          <p class="helper">选手在营地「战绩」里把分享链接发到微信，复制整条粘进来即可；系统自己识别营地 ID 和昵称，不需要手填。识别后保存到营地选手清单，之后每天「拉取对局」直接出结果。</p>
          <div class="form-grid" style="grid-template-columns:minmax(0,1fr) auto">
            <label class="field">营地分享链接或营地 ID<input id="camp-player-link" placeholder="https://cu.qq.com/… 或 camp.qq.com/…，或 userId= 后的数字"></label>
            <label class="field" style="align-self:end"><button class="button" id="camp-player-add">解析并保存</button></label>
          </div>
          <div id="camp-player-status" class="helper" style="margin-top:6px">${esc(camp.parseStatus || '')}</div>
          ${rosterPlayers.length ? `<p class="helper" style="margin-top:10px"><strong>已从队伍档案带出 ${num(rosterPlayers.length)} 位选手</strong>（在「绑定 / 队伍档案」的选手行里填营地 ID 即可，不用在这里重复加）：
            ${rosterPlayers.map(p => `<span class="tag">${esc(p.nickname)} · ${esc(p.campUserId)}</span>`).join(' ')}</p>` : ''}
          ${extraPlayers.length ? `<div class="table-wrap" style="margin-top:10px"><table><thead><tr><th>额外选手（不在队伍档案）</th><th>营地 ID</th><th></th></tr></thead><tbody>
            ${extraPlayers.map(p => `<tr><td><input class="camp-nick-input" data-camp-rename="${esc(p.campUserId)}" value="${esc(p.nickname || '')}" placeholder="昵称" style="max-width:140px"></td>
              <td>${esc(p.campUserId)}</td>
              <td><button class="button ghost" data-camp-remove="${esc(p.campUserId)}">移除</button></td></tr>`).join('')}
            </tbody></table></div>` : ''}
          <p class="helper" style="margin-top:8px">选手战绩默认对教练不可见时，请其在营地隐私设置里把教练加入白名单或恢复公开。</p>
        </div></details>
      </div></section>

    <section class="panel"><div class="panel-head"><div><h2>采集通道</h2>
      <p>每局一个通道：入库后在这里校对十人数据、审核并保存成比赛记录。</p></div>
      <span class="tag gray">${num(channels.length)} 局</span></div>
      <div class="panel-body">
      ${channels.length ? `<div class="table-wrap"><table><thead><tr><th>对局</th><th>状态</th><th>更新时间</th><th></th></tr></thead><tbody>
        ${channels.slice(0, 12).map(channel => {
          const detail = detailByChannel.get(channel.id);
          const officialId = String(channel.official?.id || '');
          const hasCamp = officialId.startsWith('camp-') || detail;
          const infoLine = detail
            ? `${esc(detail.gametime || '时间未读')} · ${esc(modeText(detail.battleType))} · ${esc(detail.mapName || '地图未读')}`
            : `${esc(channel.match?.date || '日期未填')}${channel.match?.opponent ? ` · 对阵 ${esc(channel.match.opponent)}` : ''}${channel.match?.session ? ` · ${esc(channel.match.session)}` : ''}`;
          const statLine = detail
            ? `KDA ${(detail.kda || []).filter(v => v != null).join('/')} · ${winText(detail.winCamp)}${detail.gameSeq ? ` · 对局 ${esc(detail.gameSeq)}` : ''}`
            : (hasCamp || channel.official?.id ? '营地链接已挂' : '还没有挂营地链接');
          return `<tr>
          <td><strong>${infoLine}</strong><div class="helper">${esc(statLine)}</div></td>
          <td>${channel.review?.status === 'reviewed' ? '<span class="tag">已审核</span>' : '<span class="tag amber">待审核</span>'}
            ${channel.saved?.status === 'saved' ? '<span class="tag">已保存</span>' : ''}</td>
          <td>${timeText(channel.updatedAt)}</td>
          <td><a class="button ghost" href="#channel/${esc(channel.id)}">打开通道 →</a></td></tr>`;
        }).join('')}
        </tbody></table></div>
        ${channels.length > 12 ? `<p class="helper">只显示最近 12 局，共 ${num(channels.length)} 局。</p>` : ''}`
      : '<div class="empty"><strong>还没有采集通道</strong>营地同步入库后这里会自动出现对应通道。</div>'}
      <details class="recording-check" style="margin-top:12px"><summary>手动补一局（列表里没有的比赛）</summary>
        <div style="margin-top:12px">
          <div class="form-grid"><label class="field">比赛日期<input id="channel-date" type="date"></label>
          <label class="field">对手<input id="channel-opponent" placeholder="例如：周三训练对手"></label>
          <label class="field">训练分组<input id="channel-session" placeholder="例如：晚训 · 第 1 组"></label>
          <label class="field">版本<input id="channel-version" placeholder="例如：S42"></label></div>
          <div class="channel-actions"><button class="button" id="channel-create">创建采集通道</button>
          <span class="helper">创建后进入通道，把本局营地回放链接挂上。</span></div>
        </div></details>
      </div></section>`;

    // —— 授权 ——
    const qrButton = container.querySelector('#camp-auth-qr');
    if (qrButton) qrButton.onclick = startCampAuth;
    const clearButton = container.querySelector('#camp-auth-clear');
    if (clearButton) clearButton.onclick = async () => {
      try { await api('/api/camp/auth/clear', 'POST'); await loadCamp(); draw(); toast('凭证已删除'); }
      catch (error) { toast(error.message, true); }
    };
    // —— 首次配置 ——
    const addButton = container.querySelector('#camp-player-add');
    if (addButton) addButton.onclick = addCampPlayer;
    container.querySelectorAll('[data-camp-rename]').forEach(input => {
      input.onchange = () => renameCampPlayer(input.dataset.campRename, input.value);
    });
    container.querySelectorAll('[data-camp-remove]').forEach(button => {
      button.onclick = () => removeCampPlayer(button.dataset.campRemove);
    });
    // —— 拉取与入库 ——
    const fetchButton = container.querySelector('#camp-list-fetch');
    if (fetchButton) fetchButton.onclick = fetchAllLists;
    const syncButton = container.querySelector('#camp-sync-run');
    if (syncButton) syncButton.onclick = runCampSync;
    const selectAll = container.querySelector('#camp-list-all');
    if (selectAll) selectAll.onchange = () => {
      for (const item of camp.list || []) {
        if (item.imported) continue;
        if (selectAll.checked) camp.checked[item.gameSeq] = true;
        else delete camp.checked[item.gameSeq];
      }
      camp.checkedCount = Object.keys(camp.checked).length;
      draw();
    };
    container.querySelectorAll('[data-list-check]').forEach(checkbox => {
      checkbox.onchange = () => {
        if (checkbox.checked) camp.checked[checkbox.dataset.listCheck] = true;
        else delete camp.checked[checkbox.dataset.listCheck];
        camp.checkedCount = Object.keys(camp.checked).length;
        draw();
      };
    });
    // —— 手动建局 ——
    const createButton = container.querySelector('#channel-create');
    if (createButton) createButton.onclick = createChannel;
  };

  // —— 授权（二维码 + 轮询，过期自动刷新） ——
  async function startCampAuth() {
    if (busy) return;
    busy = true;
    try {
      camp.qrTask = await api('/api/camp/auth/qr', 'POST');
      camp.authStatus = '等待扫码…';
      camp.qrRefreshes = 0;
      draw();
      clearInterval(camp.authTimer);
      camp.authTimer = setInterval(async () => {
        try {
          const result = await api('/api/camp/auth/poll?taskId=' + encodeURIComponent(camp.qrTask.taskId));
          const statusEl = container.querySelector('#camp-auth-status');
          if (result.status === 'scanned' && statusEl) statusEl.textContent = '已扫码，等待手机上确认…';
          if (result.status === 'success') {
            clearInterval(camp.authTimer);
            camp.authTimer = null;
            camp.qrTask = null;
            toast(`已授权：${result.nickname || result.userId}`);
            await loadCamp(); draw();
          }
          if (result.status === 'expired' || result.status === 'canceled') {
            clearInterval(camp.authTimer);
            camp.authTimer = null;
            if (result.status === 'canceled') {
              camp.authStatus = '已在手机上取消，可重新扫码。';
              camp.qrTask = null;
              draw();
              return;
            }
            camp.qrRefreshes = (camp.qrRefreshes || 0) + 1;
            if (camp.qrRefreshes <= 3) {
              camp.authStatus = '二维码已过期，正在自动刷新…';
              camp.qrTask = null;
              busy = false;
              await startCampAuth();
              return;
            }
            camp.authStatus = '二维码已多次过期。准备好后再点「扫码授权」。';
            camp.qrTask = null;
            draw();
          }
        } catch { /* keep polling */ }
      }, 2500);
    } catch (error) { toast(error.message, true); }
    finally { busy = false; }
  }

  // —— 主流程：拉取所有已存选手的对局，按 gameSeq 合并 ——
  async function fetchAllLists() {
    const players = camp.config?.players || [];
    if (!players.length) { toast('先在「首次配置」里添加营地选手', true); return; }
    camp.listLoading = true;
    camp.list = [];
    camp.checked = {};
    camp.checkedCount = 0;
    camp.listFetchedAt = '';
    draw();
    const merged = new Map();
    for (const player of players) {
      try {
        const result = await api('/api/camp/list', 'POST', {campUserId: player.campUserId, lastTime: 0});
        for (const entry of result.entries || []) {
          const existing = merged.get(entry.gameSeq);
          if (existing) { existing.owners.push(player.nickname || player.campUserId); continue; }
          merged.set(entry.gameSeq, {...entry,
            owners: [player.nickname || player.campUserId],
            ownerName: player.nickname || `选手 ${player.campUserId.slice(-4)}`,
            ownerCampUserId: player.campUserId});
        }
        if (result.gaming) toast(`${player.nickname || '选手'} 有一局正在进行中，列表不含对局中的比赛`);
      } catch (error) {
        const invisible = String(error.message).includes('隐藏');
        toast(`${player.nickname || '选手'}：${invisible ? '战绩对教练不可见，请其把教练加入白名单或恢复公开' : error.message}`, true);
      }
    }
    camp.list = [...merged.values()].sort((a, b) => Number(b.dtEventTime || 0) - Number(a.dtEventTime || 0));
    camp.listHasMore = false;
    for (const item of camp.list) if (!item.imported) camp.checked[item.gameSeq] = true;
    camp.checkedCount = Object.keys(camp.checked).length;
    camp.listLoading = false;
    camp.listFetchedAt = new Date().toLocaleTimeString('zh-CN', {hour: '2-digit', minute: '2-digit'});
    draw();
  }

  // —— 入库：按选手分组顺序同步，避免后台任务互斥 ——
  async function runCampSync() {
    if (busy) return;
    const groups = new Map();
    for (const item of camp.list || []) {
      if (!camp.checked[item.gameSeq]) continue;
      const entry = {...item};
      delete entry.owners; delete entry.ownerName; delete entry.ownerCampUserId; delete entry.imported;
      const key = item.ownerCampUserId;
      if (!groups.has(key)) groups.set(key, {nickname: item.ownerName || '', entries: []});
      groups.get(key).entries.push(entry);
    }
    if (!groups.size) { toast('请先勾选要拉取的对局', true); return; }
    busy = true;
    camp.syncStatus = `已启动，共 ${[...groups.values()].reduce((sum, g) => sum + g.entries.length, 0)} 局…`;
    draw();
    const pollJob = () => new Promise(resolve => {
      clearInterval(camp.syncTimer);
      camp.syncTimer = setInterval(async () => {
        try {
          const status = await api('/api/camp/sync');
          camp.job = {running: !!status.running, result: status.result, error: status.error};
          camp.detailsCount = status.detailsCount || 0;
          camp.details = status.details || [];
          camp.syncStatus = `正在拉取，本机已有 ${num(camp.detailsCount)} 份对局详情…`;
          draw();
          if (!status.running) {
            clearInterval(camp.syncTimer);
            camp.syncTimer = null;
            resolve(status);
          }
        } catch { /* keep polling */ }
      }, 3000);
    });
    try {
      for (const [campUserId, group] of groups) {
        await api('/api/camp/sync', 'POST', {campUserId, nickname: group.nickname, entries: group.entries});
        const status = await pollJob();
        const failed = (status.result?.players || []).filter(item => !item.ok).length;
        if (failed) toast('同步完成，但有失败项，详见面板', true);
      }
      camp.syncStatus = '';
      camp.checked = {};
      camp.checkedCount = 0;
      camp.list = [];
      camp.listFetchedAt = '';
      await loadCamp(); await load();
      toast('所选对局已入库，通道已自动挂载');
      draw();
    } catch (error) {
      busy = false;
      camp.syncStatus = '';
      if (String(error.message).includes('登录态')) {
        camp.auth = {authorized: false};
        toast('登录态已失效，请重新扫码授权', true);
      } else toast(error.message, true);
      draw();
    }
  }

  async function addCampPlayer() {
    const raw = container.querySelector('#camp-player-link')?.value.trim() || '';
    const statusEl = container.querySelector('#camp-player-status');
    if (!raw) { if (statusEl) statusEl.textContent = '先粘贴选手的营地分享链接，或填营地 ID。'; return; }
    let campUserId = raw;
    let nickname = '';
    try {
      if (raw.includes('://') || raw.includes('cu.qq.com')) {
        const resolved = await api('/api/camp/resolve', 'POST', {url: raw});
        campUserId = resolved.userId;
        nickname = resolved.nickname || '';
        if (resolved.gameSeq) toast('链接里还带了一局对局，入库请用「拉取对局」');
      }
    } catch (error) {
      if (statusEl) statusEl.textContent = `解析失败：${error.message || error}`;
      return;
    }
    if (!/^\d{5,15}$/.test(campUserId)) {
      if (statusEl) statusEl.textContent = '营地 ID 需为 5–15 位数字；确认粘贴的是完整分享链接。';
      return;
    }
    const rosterMember = (workspace?.profile?.members || []).find(m => m.campUserId === campUserId);
    if (rosterMember) {
      if (statusEl) statusEl.textContent = `${rosterMember.label || rosterMember.name} 已在队伍档案里配了营地 ID ${campUserId}，无需重复添加。`;
      return;
    }
    const players = (camp.config?.players || []).filter(p => p.campUserId !== campUserId);
    players.push({nickname: nickname || `选手 ${campUserId.slice(-4)}`, campUserId});
    try {
      camp.config = await api('/api/camp/config', 'POST', {players});
      camp.parseStatus = `已保存：${players.find(p => p.campUserId === campUserId)?.nickname}（营地 ID ${campUserId}）。昵称可在列表里直接改。`;
      draw();
    } catch (error) { toast(error.message, true); }
  }

  async function renameCampPlayer(campUserId, nickname) {
    const players = (camp.config?.players || []).map(p =>
      p.campUserId === campUserId ? {...p, nickname: nickname.trim() || p.nickname} : p);
    try { camp.config = await api('/api/camp/config', 'POST', {players}); } catch (error) { toast(error.message, true); }
  }


  async function removeCampPlayer(campUserId) {
    const players = (camp.config?.players || []).filter(p => p.campUserId !== campUserId);
    try {
      camp.config = await api('/api/camp/config', 'POST', {players});
      draw();
    } catch (error) { toast(error.message, true); }
  }

  async function createChannel() {
    if (busy) return;
    busy = true;
    try {
      const channel = await api('/api/channels', 'POST', {'match': {
        date: container.querySelector('#channel-date').value,
        opponent: container.querySelector('#channel-opponent').value,
        session: container.querySelector('#channel-session').value,
        version: container.querySelector('#channel-version').value,
      }});
      location.hash = '#channel/' + encodeURIComponent(channel.id);
    } catch (error) { toast(error.message, true); }
    finally { busy = false; }
  }

  container.innerHTML = '<div class="loading">正在读取采集状态…</div>';
  try { await load(); await loadCamp(); draw(); }
  catch (error) { if (isCurrent()) container.innerHTML = `<div class="notice">采集状态读取失败：${esc(error.message || error)}</div>`; }
}
