// 채팅에서 전원 동의를 받은 카드만 합의 보드에 표시합니다.
const agreementMembers = ["민준"];
let agreementViewer = "민준";
const agreementInitials = { "민준": "민" };
function agreementAvatars(card) {
  return '<div class="agreement-people" aria-label="팀원 확인 현황">' + agreementMembers.map(name => {
    const confirmed = card.members.includes(name);
    return '<span class="agreement-person ' + (confirmed ? 'is-confirmed' : 'is-waiting') + ' person-' + agreementMembers.indexOf(name) + '" title="' + esc(name) + (confirmed ? ' · 확인 완료' : ' · 확인 대기') + '"><span>' + esc(agreementInitials[name]) + '</span>' + (confirmed ? '<i aria-hidden="true">✓</i>' : '') + '</span>';
  }).join('') + '</div>';
}
function agreementDate(date) { return date.slice(5).replace('-', '/'); }
function renderAgreementMessage(card) {
  const agreed = card.members.length === agreementMembers.length;
  const mine = card.members.includes(agreementViewer);
  const waiting = agreementMembers.filter(name => !card.members.includes(name));
  return '<article class="chat-agreement ' + (agreed ? 'is-complete' : '') + '" data-card-id="' + card.id + '"><div class="agreement-card-heading"><span class="agreement-tag">합의 카드 · ' + esc(card.type) + '</span>' + (agreed ? '<span class="agreement-success-tag">전원 확인 완료</span>' : '<span class="agreement-byline">민준이 만듦 · ' + esc(card.time) + '</span>') + '</div><h3>' + esc(card.title) + (agreed ? ' · 담당 ' + card.assignees.map(esc).join(' · ') + ' · ' + esc(agreementDate(card.date)) + '까지' : '') + '</h3>' + (agreed ? '' : '<p class="agreement-body">' + esc(card.text) + '</p><div class="agreement-meta"><span>담당 ' + card.assignees.map(esc).join(' · ') + '</span><span title="' + esc(card.date) + '">마감 ' + esc(agreementDate(card.date)) + '까지</span></div>') + '<div class="agreement-confirmation">' + agreementAvatars(card) + '<span class="agreement-progress"><b>' + card.members.length + '/' + agreementMembers.length + '명 확인</b>' + (agreed ? ' · 합의 보드에 고정됨 →' : ' · ' + waiting.map(esc).join(', ') + ' 확인 대기') + '</span>' + (agreed ? '' : '<button type="button" class="agreement-confirm ' + (mine ? 'is-checked' : '') + '" data-confirm-agreement="' + card.id + '" ' + (mine ? 'disabled' : '') + ' title="위 일정과 약속을 이해했으며 이행하는 데 동의합니다">' + (mine ? '내가 확인함 ✓' : '확인') + '</button>') + '</div></article>' + (agreed ? '<div class="agreement-pin-notice">♧ ' + esc(card.confirmedBy) + '의 확인으로 ‘' + esc(card.title) + '’ 카드가 합의 보드에 올라갔어요.</div>' : '');
}
function initBoard() {
  const cards = [];
  let selectedFilter = "전체";
  const dialog = $("#agreement-dialog");
  const form = $("#agreement-form");
  const assignees = () => Array.from(form.querySelectorAll('[name="assignee"]:checked')).map(input => input.value);
  function preview() {
    const people = assignees();
    $("#assignee-chips").innerHTML = people.map(name => '<span class="assignee-chip"><span>' + esc(name.slice(0,1)) + '</span>' + esc(name) + '</span>').join('');
    $("#agreement-preview-title").textContent = ($( "#agreement-title").value.trim() || "제목") + ' · 담당 ' + (people.join(' · ') || '미지정') + ' · ' + ($("#agreement-date").value || '마감일 미정') + '까지';
  }
  function renderBoard() {
    const confirmed = cards.filter(card => card.members.length === agreementMembers.length);
    const visible = confirmed.filter(card => selectedFilter === '전체' || card.type === selectedFilter);
    $("#board-count").textContent = String(confirmed.length);
    $("#board-cards").innerHTML = visible.length ? [...visible].reverse().map(card => '<article class="card pinned-agreement ' + (card.justPinned ? 'is-new' : '') + '"><div class="agreement-card-heading"><span class="agreement-tag">' + esc(card.type) + '</span>' + (card.justPinned ? '<span class="agreement-success-tag">방금 고정</span>' : '') + '</div><h3>' + esc(card.title) + '</h3><p>' + esc(card.text) + '</p><div class="agreement-meta"><span>담당 ' + card.assignees.map(esc).join(' · ') + '</span><span title="' + esc(card.date) + '">' + esc(agreementDate(card.date)) + '까지</span></div><div class="confirmed">✓ ' + agreementMembers.length + '명 모두 확인</div></article>').join('') : '<p class="empty">' + (confirmed.length ? '이 종류의 합의가 없어요.' : '팀원 모두가 확인한 카드가 이곳에 고정돼요.') + '</p>';
    document.querySelectorAll('.filter').forEach(button => {
      const selected = button.dataset.filter === selectedFilter;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
  }
  $("#create-card").addEventListener('click', () => {
    form.reset();
    $("#assignee-picker").hidden = true;
    $("#assignee-add").setAttribute('aria-expanded', 'false');
    preview();
    dialog.showModal();
  });
  $("#agreement-cancel").addEventListener('click', () => dialog.close());
  $("#assignee-add").addEventListener('click', () => {
    const picker = $("#assignee-picker");
    picker.hidden = !picker.hidden;
    $("#assignee-add").setAttribute('aria-expanded', String(!picker.hidden));
  });
  form.addEventListener('input', preview);
  form.addEventListener('change', preview);
  form.addEventListener('submit', event => {
    event.preventDefault();
    for (const id of ['#agreement-title', '#agreement-text']) $(id).value = $(id).value.trim();
    if (!form.reportValidity()) return;
    if (!assignees().length) { toast('담당자를 한 명 이상 선택해 주세요.'); return; }
    const card = {id: cards.length, type: form.querySelector('[name="agreement-type"]:checked').value, title: $("#agreement-title").value, text: $("#agreement-text").value, date: $("#agreement-date").value, assignees: assignees(), members: [], time: new Date().toLocaleTimeString("ko-KR", {hour: "2-digit", minute: "2-digit", hour12: false})};
    cards.push(card);
    chats[channel].push({agreement: card});
    renderMessages();
    dialog.close();
    toast('채팅에 카드를 올렸어요. 팀원 모두의 동의를 기다려요.');
  });
  $("#agreement-viewer").addEventListener('change', event => {
    if (!agreementMembers.includes(event.target.value)) return;
    agreementViewer = event.target.value;
    renderMessages();
  });
  document.addEventListener('click', event => {
    const confirmButton = event.target.closest('button[data-confirm-agreement]');
    if (confirmButton) {
      const card = cards[Number(confirmButton.dataset.confirmAgreement)];
      if (!card || card.members.includes(agreementViewer) || card.members.length === agreementMembers.length) return;
      card.members.push(agreementViewer);
      const agreed = card.members.length === agreementMembers.length;
      if (agreed) {
        cards.forEach(item => { item.justPinned = false; });
        card.justPinned = true;
        card.confirmedBy = agreementViewer;
        selectedFilter = '전체';
      }
      renderMessages();
      renderBoard();
      if (agreed) toast(agreementMembers.length + '명 모두 확인했어요. 합의 보드에 카드를 고정했어요.');
      return;
    }
    const button = event.target.closest('button[data-filter]');
    if (!button) return;
    selectedFilter = button.dataset.filter;
    renderBoard();
  });
  renderBoard();
}
