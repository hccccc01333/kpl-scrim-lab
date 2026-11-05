/* 队伍档案：本队 + 对手战队名录 + 选手身份（职业 ID / 真名）。
   身份标签规则：跨战队显示「战队.选手名」（如 重庆狼队.小胖），本队只显示选手名。
   同一名选手的大小号通过「昵称 → 选手身份」认领归并，不再用一个游戏昵称当身份。
*/
const esc = (value = '') => String(value ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const LANES = ['对抗路', '打野', '中路', '发育路', '游走'];
const LANE_HINT = {对抗路: '开团 / 边线压制', 打野: '节奏 / 资源', 中路: '支援 / 消耗', 发育路: '输出核心', 游走: '视野 / 保人'};

function uid(prefix = 'p') {
  return `${prefix}-` + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3);
}

export async function renderProfile(container, {api, workspace, isCurrent, toast, onSaved}) {
  const [state, identity] = await Promise.all([
    api('/api/state'),
    api('/api/studio/identity').catch(() => ({unbound: [], aliases: {}})),
  ]);
  if (isCurrent && !isCurrent()) return;

  const settings = state.settings || {};
  const teamName = (settings.teamName || '我的训练队').trim();
  const roster = (settings.roster || []).map(p => ({...p, tags: Array.isArray(p.tags) ? [...p.tags] : []}));
  const teams = (settings.teams || []).map(t => ({...t}));
  const aliases = {...(settings.aliases || {})};
  const unbound = identity.unbound || [];
  const overview = workspace?.overview || {};

  const savedIds = new Set((settings.roster || []).map(p => p.id));
  const active = () => roster;
  const aliasesFor = id => Object.keys(aliases).filter(label => aliases[label] === id);
  const teamOptions = () => [teamName, ...teams.map(t => t.name)].filter(Boolean);
  const identityOf = (member) => {
    const team = (member.team || '').trim();
    const name = (member.name || '').trim();
    return team && team !== teamName && name ? `${team}.${name}` : name;
  };

  const laneOf = player => player.position || '';
  const starters = new Map();
  for (const lane of LANES) {
    const found = active().find(p => laneOf(p) === lane);
    if (found) starters.set(lane, found.id);
  }
  const pending = unbound.filter(item => !aliases[item.label]).slice(0, 60);
  const boundCount = Object.keys(aliases).length;

  const progress = (() => {
    let score = 0;
    const items = [];
    const hasTeam = teamName !== '我的训练队';
    items.push({label: '战队名称', ok: hasTeam}); score += hasTeam ? 1 : 0;
    const hasCoach = !!overview.coach;
    items.push({label: '主教练', ok: hasCoach}); score += hasCoach ? 1 : 0;
    const filled = LANES.filter(l => starters.has(l)).length;
    items.push({label: `首发五人（${filled}/5）`, ok: filled === 5}); score += filled === 5 ? 1 : 0;
    const named = active().filter(m => aliasesFor(m.id).length).length;
    items.push({label: `选手已认领（${named}）`, ok: named > 0}); score += named > 0 ? 1 : 0;
    return {score: Math.round(score / 4 * 100), items};
  })();

  const template = () => `
    <div class="page-heading">
      <div>
        <span class="page-eyebrow">PROFILE · 队伍档案</span>
        <h1>${esc(teamName)}</h1>
        <p>先建战队，再建选手身份，最后把数据包里的游戏昵称认领到身份上。大小号因此能合并成同一个人。</p>
        <div class="page-facts">
          <span>教练 ${esc(overview.coach || '未填写')}</span>
          <span>战队 ${1 + teams.length} 支</span>
          <span>选手 ${active().length} 人</span>
          <span>已认领昵称 ${boundCount} 个</span>
          <span>待认领 ${unbound.length} 个</span>
        </div>
      </div>
      <div class="heading-actions">
        <a class="button" href="#players">看选手数据</a>
        <a class="button primary" href="#matches">去比赛档案 →</a>
      </div>
    </div>

    <section class="pf-progress ${progress.score >= 75 ? 'good' : progress.score >= 40 ? 'mid' : 'bad'}">
      <div class="pf-progress-head">
        <b>${progress.score}<small>%</small></b>
        <div>
          <strong>建档进度</strong>
          <div class="pf-progress-items">${progress.items.map(i => `<span class="${i.ok ? 'ok' : ''}">${i.ok ? '✓' : '○'} ${esc(i.label)}</span>`).join('')}</div>
        </div>
      </div>
      <p>${progress.score === 100
        ? '建档完成。之后导入比赛都会自动套用这套身份。'
        : '没填的部分不阻塞导入，但相关分析会缺一块：例如选手没认领昵称，同一个人会被拆成好几个。'}</p>
    </section>

    <div class="pf-grid">
      <section class="pf-card">
        <header><h2>我的战队</h2><p>出现在所有报告抬头与标题</p></header>
        <div class="pf-form">
          <label class="pf-field"><span>战队名称</span><input id="pf-team" maxlength="50" value="${esc(teamName)}" placeholder="如：成都AG超玩会"></label>
          <label class="pf-field"><span>主教练</span><input id="pf-coach" maxlength="30" value="${esc(overview.coach || '')}" placeholder="如：张三"></label>
          <label class="pf-field"><span>赛季 / 阶段</span><input id="pf-season" maxlength="40" value="${esc(overview.season || '')}" placeholder="如：2026 秋季赛 · 常规赛"></label>
          <label class="pf-field"><span>所属俱乐部</span><input id="pf-org" maxlength="60" value="${esc(workspace?.profile?.organization || '')}" placeholder="选填"></label>
        </div>
        <div class="pf-actions"><button class="button primary" id="pf-save-team">保存战队信息</button></div>
      </section>

      <section class="pf-card">
        <header><h2>首发五人</h2><p>按分路对上号，才能做同位置对位</p></header>
        <div class="pf-lanes">
          ${LANES.map(lane => {
            const id = starters.get(lane) || '';
            return `<label class="pf-lane">
              <span class="pf-lane-name">${lane}<small>${LANE_HINT[lane]}</small></span>
              <select data-lane="${lane}">
                <option value="">未指定</option>
                ${active().map(p => `<option value="${esc(p.id)}"${p.id === id ? ' selected' : ''}>${esc(identityOf(p))}</option>`).join('')}
              </select>
            </label>`;
          }).join('')}
        </div>
        <div class="pf-actions"><button class="button" id="pf-save-lanes">保存首发</button></div>
      </section>
    </div>

    <section class="pf-card">
      <header>
        <h2>战队名录</h2>
        <p>把见过的对手战队也建进来；选手可按战队归类，跨战队显示为「战队.选手名」</p>
        <button class="button" id="pf-add-team">＋ 添加战队</button>
      </header>
      <div class="pf-teams">
        <div class="pf-team-row own">
          <span class="pf-team-name">${esc(teamName)}<b>本队</b></span>
          <span class="pf-team-meta">${esc(overview.coach || '教练未填')}</span>
          <span class="pf-team-count">${active().filter(m => (m.team || teamName) === teamName).length} 人</span>
        </div>
        ${teams.length ? teams.map(t => `<div class="pf-team-row" data-team="${esc(t.id)}">
          <input class="pf-team-input" data-team-field="name" value="${esc(t.name)}" maxlength="50" aria-label="战队名称" placeholder="战队名称">
          <input class="pf-team-input short" data-team-field="short" value="${esc(t.short || '')}" maxlength="20" aria-label="简称" placeholder="简称">
          <input class="pf-team-input coach" data-team-field="coach" value="${esc(t.coach || '')}" maxlength="30" aria-label="教练" placeholder="教练">
          <span class="pf-team-count">${active().filter(m => m.team === t.name).length} 人</span>
          <button class="pf-member-remove" type="button" data-remove-team="${esc(t.id)}">删除</button>
        </div>`).join('') : '<div class="pf-empty">还没有其它战队。打过的对手可以在这里建档，之后就能按战队归类选手。</div>'}
      </div>
      ${teams.length ? '<div class="pf-actions"><button class="button" id="pf-save-teams">保存战队名录</button></div>' : ''}
    </section>

    <section class="pf-card">
      <header>
        <h2>选手身份</h2>
        <p>这里填职业 ID 或真名，不是游戏昵称；同一个人的多个昵称在下面认领后合并</p>
        <button class="button" id="pf-add">＋ 添加选手</button>
      </header>
      <div class="pf-roster">
        ${active().length ? active().map(p => `<div class="pf-member" data-id="${esc(p.id)}">
          <div class="pf-member-main">
            <input class="pf-member-name" maxlength="50" value="${esc(p.name)}" aria-label="选手名" placeholder="职业 ID / 真名">
            <span class="pf-member-preview">${esc((p.team || teamName) !== teamName ? identityOf(p) : "")}</span>
          </div>
          <select class="pf-member-team" aria-label="所属战队">
            ${teamOptions().map(t => `<option value="${esc(t)}"${(p.team || teamName) === t ? ' selected' : ''}>${esc(t)}</option>`).join('')}
          </select>
          <select class="pf-member-lane" aria-label="默认分路">
            <option value=""${!p.position ? ' selected' : ''}>未设分路</option>
            ${LANES.map(l => `<option value="${l}"${p.position === l ? ' selected' : ''}>${l}</option>`).join('')}
          </select>
          <input class="pf-member-tags" maxlength="60" value="${esc((p.tags || []).join('，'))}" aria-label="标签" placeholder="标签：首发，小号">
          <input class="pf-member-camp" maxlength="15" inputmode="numeric" value="${esc(p.campUserId || '')}" aria-label="营地 ID" placeholder="营地 ID（选填）">
          <button class="pf-member-remove" type="button" data-remove="${esc(p.id)}" title="移出名单">移出</button>
        </div>`).join('') : '<div class="pf-empty">还没有选手。先添加首发五人，填职业 ID。</div>'}
      </div>
      <div class="pf-actions"><button class="button primary" id="pf-save-roster">保存选手名单</button></div>
    </section>

    <section class="pf-card">
      <header>
        <h2>认领游戏昵称</h2>
        <p>数据包读到的是游戏内昵称。把它认领到某个选手身份上，大小号就会合并统计</p>
        <span class="pf-count">${pending.length} 个待认领</span>
      </header>
      ${pending.length ? `<div class="pf-bind-list">
        ${pending.map(item => `<div class="pf-bind" data-label="${esc(item.label)}">
          <div class="pf-bind-name">
            <strong>${esc(item.label)}</strong>
            <small>${item.matches ? `${item.matches} 场` : ''}${item.heroes?.length ? ` · 常用 ${item.heroes.slice(0, 3).map(esc).join('、')}` : ''}${item.lastDate ? ` · 最近 ${esc(item.lastDate)}` : ''}</small>
          </div>
          <select data-bind="${esc(item.label)}">
            <option value="">选择选手身份…</option>
            ${active().map(p => `<option value="${esc(p.id)}">${esc(identityOf(p))}${p.position ? ` · ${p.position}` : ''}</option>`).join('')}
            <option value="__new__">＋ 新建选手身份…</option>
          </select>
        </div>`).join('')}
      </div>` : '<div class="pf-empty">没有待认领的昵称。导入新比赛后会出现在这里。</div>'}
      <div class="pf-actions">
        <button class="button" id="pf-auto">按同名自动认领</button>
        <button class="button primary" id="pf-save-bind">保存认领结果</button>
      </div>
    </section>
  `;

  const paint = () => { container.innerHTML = template(); };

  const saveSettings = async (patch = {}) => {
    const payload = {
      ...settings,
      teamName: patch.teamName ?? teamName,
      roster: patch.roster ?? roster,
      aliases: patch.aliases ?? aliases,
      teams: patch.teams ?? teams,
    };
    const response = await fetch('/api/settings', {
      method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw Error(result.detail || '保存失败');
  };

  const collectRoster = () => {
    container.querySelectorAll('.pf-member').forEach(row => {
      const player = roster.find(p => p.id === row.dataset.id);
      if (!player) return;
      const nameInput = row.querySelector('.pf-member-name');
      const laneSelect = row.querySelector('.pf-member-lane');
      if (!nameInput || !laneSelect) return;
      player.name = nameInput.value.trim() || player.name;
      player.position = laneSelect.value;
      player.team = row.querySelector('.pf-member-team')?.value || teamName;
      const tags = row.querySelector('.pf-member-tags')?.value || '';
      player.tags = tags.split(/[，,、\s]+/).map(t => t.trim()).filter(Boolean).slice(0, 8);
      player.campUserId = (row.querySelector('.pf-member-camp')?.value || '').trim();
    });
  };

  const collectTeams = () => {
    teams.forEach(team => {
      const row = container.querySelector(`[data-team="${CSS.escape(team.id)}"]`);
      if (!row) return;
      row.querySelectorAll('[data-team-field]').forEach(input => {
        team[input.dataset.teamField] = input.value.trim();
      });
    });
  };

  const openPlayerDialog = (nickname, onDone) => {
    const dialog = document.querySelector('#detail-dialog');
    const title = document.querySelector('#detail-title');
    const body = document.querySelector('#detail-body');
    if (!dialog || !body) return;
    title.textContent = '新建选手身份';
    body.innerHTML = `<div class="pf-new">
      <p class="pf-new-lead">游戏昵称 <b>${esc(nickname)}</b> 会认领到这名选手。多个昵称可以指向同一个身份（大小号）。</p>
      <label class="pf-fix-field"><span>选手名（职业 ID / 真名）</span>
        <input id="np-name" maxlength="50" value="${esc(nickname)}" placeholder="如：小胖"></label>
      <div class="ar-fix-row">
        <label class="pf-fix-field"><span>所属战队</span>
          <select id="np-team">${teamOptions().map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join('')}</select></label>
        <label class="pf-fix-field"><span>位置</span>
          <select id="np-lane"><option value="">未设分路</option>${LANES.map(l => `<option value="${l}">${l}</option>`).join('')}</select></label>
      </div>
      <label class="pf-fix-field"><span>标签（逗号分隔）</span>
        <input id="np-tags" maxlength="60" value="小号" placeholder="首发，替补，小号"></label>
      <div class="pf-actions"><button class="button" id="np-cancel">取消</button><button class="button primary" id="np-save">创建并认领</button></div>
    </div>`;
    dialog.showModal();
    const close = () => dialog.close();
    body.querySelector('#np-cancel').onclick = close;
    body.querySelector('#np-save').onclick = () => {
      const name = body.querySelector('#np-name').value.trim();
      if (!name) return alert('请填写选手名');
      const member = {
        id: uid(), name,
        team: body.querySelector('#np-team').value || teamName,
        position: body.querySelector('#np-lane').value,
        tags: body.querySelector('#np-tags').value.split(/[，,、\s]+/).map(t => t.trim()).filter(Boolean).slice(0, 8),
      };
      roster.push(member);
      aliases[nickname] = member.id;
      close();
      paint();
      toast?.(`已创建 ${identityOf(member)} 并认领「${nickname}」，记得保存`);
      onDone?.();
    };
  };

  paint();

  container.addEventListener('click', async (event) => {
    const btn = event.target.closest('button');
    if (!btn) return;

    if (btn.id === 'pf-save-team') {
      btn.disabled = true;
      try {
        const response = await fetch('/api/studio/profile', {
          method: 'POST', headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({
            teamName: container.querySelector('#pf-team').value.trim(),
            coach: container.querySelector('#pf-coach').value.trim(),
            season: container.querySelector('#pf-season').value.trim(),
            organization: container.querySelector('#pf-org').value.trim(),
          }),
        });
        if (!response.ok) throw Error((await response.json()).detail || '保存失败');
        toast?.('战队信息已保存');
        await onSaved?.();
        location.reload();
      } catch (error) { toast?.(error.message, true); }
      finally { btn.disabled = false; }
      return;
    }

    if (btn.id === 'pf-add-team') {
      const team = {id: uid('team'), name: '', short: '', coach: '', note: ''};
      teams.push(team);
      paint();
      container.querySelector(`[data-team="${CSS.escape(team.id)}"] [data-team-field="name"]`)?.focus();
      return;
    }

    if (btn.dataset.removeTeam) {
      const team = teams.find(t => t.id === btn.dataset.removeTeam);
      if (!team) return;
      const used = active().filter(m => m.team === team.name).length;
      if (used && !confirm(`${team.name} 下还有 ${used} 名选手。删除战队后他们会回到本队，确定继续？`)) return;
      roster.forEach(m => { if (m.team === team.name) m.team = teamName; });
      teams.splice(teams.indexOf(team), 1);
      paint();
      return;
    }

    if (btn.id === 'pf-save-teams') {
      btn.disabled = true;
      try {
        collectTeams();
        if (teams.some(t => !t.name)) throw Error('战队名称不能为空');
        await saveSettings({teams});
        toast?.('战队名录已保存');
        await onSaved?.();
        location.reload();
      } catch (error) { toast?.(error.message, true); }
      finally { btn.disabled = false; }
      return;
    }

    if (btn.id === 'pf-add') {
      roster.push({id: uid(), name: '新选手', team: teamName, position: '', tags: []});
      paint();
      return;
    }

    if (btn.dataset.remove) {
      const id = btn.dataset.remove;
      const member = roster.find(p => p.id === id);
      if (!member) return;
      const bound = aliasesFor(id);
      if (bound.length && !confirm(`${identityOf(member)} 还认领着 ${bound.length} 个昵称（${bound.slice(0, 3).join('、')}）。移出后这些昵称会回到待认领，确定？`)) return;
      bound.forEach(label => { delete aliases[label]; });
      roster.splice(roster.indexOf(member), 1);
      paint();
      toast?.(`已移出 ${identityOf(member)}，保存名单后删除`);
      return;
    }

    if (btn.id === 'pf-save-lanes' || btn.id === 'pf-save-roster') {
      btn.disabled = true;
      try {
        collectRoster();
        const laneAssign = {};
        container.querySelectorAll('[data-lane]').forEach(select => {
          laneAssign[select.dataset.lane] = select.value;
        });
        // 一个选手只占一个分路：先清空被选中选手的旧分路，再写入新分路。
        Object.values(laneAssign).filter(Boolean).forEach(id => {
          const member = roster.find(p => p.id === id);
          if (member) member.position = '';
        });
        Object.entries(laneAssign).forEach(([lane, id]) => {
          if (!id) return;
          const member = roster.find(p => p.id === id);
          if (member) member.position = lane;
        });
        await saveSettings({roster, teams});
        toast?.('选手名单已保存');
        await onSaved?.();
        location.reload();
      } catch (error) { toast?.(error.message, true); }
      finally { btn.disabled = false; }
      return;
    }

    if (btn.id === 'pf-auto') {
      const byName = new Map(active().map(p => [p.name, p.id]));
      let hits = 0;
      pending.forEach(item => {
        const id = byName.get(item.label);
        if (id) { aliases[item.label] = id; hits++; }
      });
      container.querySelectorAll('[data-bind]').forEach(select => {
        const label = select.dataset.bind;
        if (aliases[label]) select.value = aliases[label];
      });
      toast?.(hits ? `已按同名认领 ${hits} 个昵称，记得保存` : '没有同名昵称，需要手动选择');
      return;
    }

    if (btn.id === 'pf-save-bind') {
      btn.disabled = true;
      try {
        collectRoster();
        const next = {};
        let created = false;
        container.querySelectorAll('[data-bind]').forEach(select => {
          const label = select.dataset.bind;
          if (select.value === '__new__') {
            created = true;
            openPlayerDialog(label);
          } else if (select.value) {
            next[label] = select.value;
          } else if (aliases[label]) {
            next[label] = aliases[label];
          }
        });
        if (created) return;
        await saveSettings({roster, aliases: next, teams});
        toast?.('认领结果已保存');
        await onSaved?.();
        location.reload();
      } catch (error) { toast?.(error.message, true); }
      finally { btn.disabled = false; }
    }
  });

  // 选择「新建选手身份」时直接弹表单
  container.addEventListener('change', (event) => {
    const select = event.target.closest('[data-bind]');
    if (select && select.value === '__new__') {
      openPlayerDialog(select.dataset.bind);
      select.value = '';
      return;
    }
    const row = event.target.closest('.pf-member');
    if (row && (event.target.classList.contains('pf-member-name') || event.target.classList.contains('pf-member-team'))) {
      const preview = row.querySelector('.pf-member-preview');
      if (preview) {
        const name = row.querySelector('.pf-member-name')?.value.trim() || '';
        const team = row.querySelector('.pf-member-team')?.value || '';
        preview.textContent = team && team !== teamName && name ? `${team}.${name}` : '';
      }
    }
  });

  container.addEventListener('input', (event) => {
    if (!event.target.classList.contains('pf-member-name')) return;
    const row = event.target.closest('.pf-member');
    const preview = row?.querySelector('.pf-member-preview');
    if (!preview) return;
    const name = event.target.value.trim();
    const team = row.querySelector('.pf-member-team')?.value || '';
    preview.textContent = team && team !== teamName && name ? `${team}.${name}` : '';
  });
}
