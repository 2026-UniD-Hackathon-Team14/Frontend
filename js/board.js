// main의 카드 생성 → 채팅 확인 → 전원 확인 시 보드 고정 흐름을 워크스페이스에 연결합니다.
let boardFilter = "전체";
let agreementViewer = currentUser.id;
function agreementCards() {
  return (activeWorkspace()?.cards || []).filter((card) => card.schema === 2);
}
function agreementMembers() {
  return activeWorkspace()?.members || [];
}
function agreementComplete(card) {
  const members = agreementMembers();
  return members.length > 0 && members.every((member) => card.confirmedIds.includes(member.id));
}
function agreementName(id) {
  return agreementMembers().find((member) => member.id === id)?.name || "알 수 없는 팀원";
}
function agreementDate(date) {
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(new Date(date + "T12:00:00"));
}
function agreementAvatars(card) {
  return (
    '<div class="agreement-people" aria-label="팀원 확인 현황">' +
    agreementMembers()
      .map((member, index) => {
        const confirmed = card.confirmedIds.includes(member.id);
        return `<span class="agreement-person ${confirmed ? "is-confirmed" : "is-waiting"} person-${index % 4}" title="${esc(member.name)} · ${confirmed ? "확인 완료" : "확인 대기"}"><span>${esc(Array.from(member.name)[0] || "?")}</span>${confirmed ? '<i aria-hidden="true">✓</i>' : ""}</span>`;
      })
      .join("") +
    "</div>"
  );
}
function renderAgreementMessage(reference) {
  // JSON 저장 후 채팅 객체와 카드 객체가 분리되므로 항상 ID로 원본 카드를 찾습니다.
  const card = agreementCards().find((item) => item.id === reference.id);
  if (!card) return "";
  const agreed = agreementComplete(card);
  const mine = card.confirmedIds.includes(agreementViewer);
  const members = agreementMembers();
  const waiting = members.filter((member) => !card.confirmedIds.includes(member.id));
  const count = members.length - waiting.length;
  return `<article class="chat-agreement ${agreed ? "is-complete" : ""}" data-card-id="${esc(card.id)}">
    <div class="agreement-card-heading"><span class="agreement-tag">합의 카드 · ${esc(card.type)}</span>${agreed ? '<span class="agreement-success-tag">전원 확인 완료</span>' : `<span class="agreement-byline">${esc(card.createdByName)}이 만듦 · ${esc(card.time)}</span>`}</div>
    <h3>${esc(card.title)}</h3><p class="agreement-body">${esc(card.text)}</p>
    <div class="agreement-meta"><span>담당 ${card.assigneeIds.map((id) => esc(agreementName(id))).join(" · ")}</span><span>마감 ${esc(agreementDate(card.date))}</span></div>
    <div class="agreement-confirmation">${agreementAvatars(card)}<span class="agreement-progress"><b>${count}/${members.length}명 확인</b>${agreed ? " · 합의 보드에 고정됨 →" : " · " + waiting.map((member) => esc(member.name)).join(", ") + " 확인 대기"}</span>
    ${agreed ? "" : `<button type="button" class="agreement-confirm ${mine ? "is-checked" : ""}" data-confirm-agreement="${esc(card.id)}" ${mine ? "disabled" : ""}>${mine ? "내가 확인함 ✓" : "확인"}</button>`}</div>
  </article>${agreed ? `<div class="agreement-pin-notice">✓ 팀원 모두가 확인한 ‘${esc(card.title)}’ 카드가 합의 보드에 올라갔어요.</div>` : ""}`;
}
function renderAgreementViewer() {
  const members = agreementMembers();
  if (!members.some((member) => member.id === agreementViewer)) agreementViewer = currentUser.id;
  $("#agreement-viewer").innerHTML = members
    .map((member) => `<option value="${esc(member.id)}">${esc(member.name)}</option>`)
    .join("");
  $("#agreement-viewer").value = agreementViewer;
  $("#agreement-viewer").disabled = !members.length;
  $("#create-card").disabled = !activeWorkspace();
}
function renderBoard() {
  renderAgreementViewer();
  const confirmed = agreementCards().filter(agreementComplete);
  const visible = confirmed.filter((card) => boardFilter === "전체" || card.type === boardFilter);
  $("#board-count").textContent = confirmed.length;
  $("#board-cards").innerHTML = visible.length
    ? [...visible]
        .reverse()
        .map(
          (card) => `<article class="card pinned-agreement ${card.justPinned ? "is-new" : ""}">
    <div class="agreement-card-heading"><span class="agreement-tag">${esc(card.type)}</span>${card.justPinned ? '<span class="agreement-success-tag">방금 고정</span>' : ""}</div>
    <h3>${esc(card.title)}</h3><p>${esc(card.text)}</p><div class="agreement-meta"><span>담당 ${card.assigneeIds.map((id) => esc(agreementName(id))).join(" · ")}</span><span>${esc(agreementDate(card.date))}까지</span></div><div class="confirmed">✓ ${agreementMembers().length}명 모두 확인</div></article>`,
        )
        .join("")
    : '<p class="empty">' +
      (confirmed.length
        ? "이 종류의 합의가 없어요."
        : "팀원 모두가 확인한 카드가 이곳에 고정돼요.") +
      "</p>";
  document.querySelectorAll(".filter").forEach((button) => {
    const selected = button.dataset.filter === boardFilter;
    button.classList.toggle("active", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
}
function initBoard() {
  const dialog = $("#agreement-dialog");
  const form = $("#agreement-form");
  const assignees = () =>
    [...form.querySelectorAll('[name="assignee"]:checked')].map((input) => input.value);
  function preview() {
    const names = assignees().map(agreementName);
    $("#assignee-chips").innerHTML = names
      .map(
        (name) =>
          `<span class="assignee-chip"><span>${esc(Array.from(name)[0])}</span>${esc(name)}</span>`,
      )
      .join("");
    $("#agreement-preview-title").textContent =
      ($("#agreement-title").value.trim() || "제목") +
      " · 담당 " +
      (names.join(" · ") || "미지정") +
      " · " +
      ($("#agreement-date").value || "마감일 미정");
  }
  $("#create-card").addEventListener("click", () => {
    if (!activeWorkspace()) return;
    form.reset();
    $("#assignee-picker").innerHTML = agreementMembers()
      .map(
        (member) =>
          `<label><input type="checkbox" name="assignee" value="${esc(member.id)}" ${member.id === currentUser.id ? "checked" : ""}>${esc(member.name)}</label>`,
      )
      .join("");
    $("#assignee-picker").hidden = true;
    $("#assignee-add").setAttribute("aria-expanded", "false");
    preview();
    dialog.showModal();
  });
  $("#agreement-cancel").addEventListener("click", () => dialog.close());
  $("#assignee-add").addEventListener("click", () => {
    const picker = $("#assignee-picker");
    picker.hidden = !picker.hidden;
    $("#assignee-add").setAttribute("aria-expanded", String(!picker.hidden));
  });
  form.addEventListener("input", preview);
  form.addEventListener("change", preview);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    for (const id of ["#agreement-title", "#agreement-text"]) $(id).value = $(id).value.trim();
    if (!form.reportValidity()) return;
    if (!assignees().length) return toast("담당자를 한 명 이상 선택해 주세요.");
    const workspace = activeWorkspace();
    if (!workspace) return;
    const card = {
      schema: 2,
      id: newId("agreement"),
      type: form.querySelector('[name="agreement-type"]:checked').value,
      title: $("#agreement-title").value,
      text: $("#agreement-text").value,
      date: $("#agreement-date").value,
      assigneeIds: assignees(),
      confirmedIds: [],
      createdByName: currentUser.name,
      time: new Date().toLocaleTimeString("ko-KR", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }),
      justPinned: false,
    };
    workspace.cards.push(card);
    workspace.messages.push({ agreement: { id: card.id } });
    saveState();
    renderMessages();
    renderBoard();
    dialog.close();
    toast("채팅에 카드를 올렸어요. 팀원 모두의 동의를 기다려요.");
  });
  $("#agreement-viewer").addEventListener("change", (event) => {
    if (!agreementMembers().some((member) => member.id === event.target.value)) return;
    agreementViewer = event.target.value;
    renderMessages();
  });
  document.addEventListener("click", (event) => {
    const confirm = event.target.closest("button[data-confirm-agreement]");
    if (confirm) {
      const card = agreementCards().find((item) => item.id === confirm.dataset.confirmAgreement);
      if (
        !card ||
        !agreementMembers().some((member) => member.id === agreementViewer) ||
        card.confirmedIds.includes(agreementViewer)
      )
        return;
      card.confirmedIds.push(agreementViewer);
      const complete = agreementComplete(card);
      if (complete) {
        agreementCards().forEach((item) => (item.justPinned = false));
        card.justPinned = true;
        boardFilter = "전체";
      }
      saveState();
      renderMessages();
      renderBoard();
      if (complete) toast("팀원 모두 확인했어요. 합의 보드에 고정했어요.");
      return;
    }
    const filter = event.target.closest("button[data-filter]");
    if (filter) {
      boardFilter = filter.dataset.filter;
      renderBoard();
    }
  });
  renderBoard();
}
