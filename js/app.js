
(() => {
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const STORAGE_KEY = "studyTogether.v1";
  const todayKey = () => new Date().toLocaleDateString("sv-SE");
  const freshState = () => ({
    tasks: [],
    intention: "오늘도 한 걸음 나아가기",
    sessions: [],
    activeSeconds: 0,
    activeDate: todayKey()
  });

  let state;
  try {
    state = { ...freshState(), ...JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") };
  } catch {
    state = freshState();
  }

  if (!Array.isArray(state.tasks)) state.tasks = [];
  if (!Array.isArray(state.sessions)) state.sessions = [];
  if (state.activeDate !== todayKey()) {
    state.activeSeconds = 0;
    state.activeDate = todayKey();
  }

  const save = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {}
  };

  const escapeHtml = s =>
    String(s).replace(/[&<>"']/g, c => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[c]));

  let toastTimer;

  function toast(message) {
    const el = $("#toast");
    el.textContent = message;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 2800);
  }

  const fmtMinutes = seconds => {
    const m = Math.floor(seconds / 60);
    const h = Math.floor(m / 60);
    return h ? `${h}시간 ${m % 60}분` : `${m}분`;
  };

  const fmtClock = seconds =>
    `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;

  const dateLabel = date => `${date.getMonth() + 1}월 ${date.getDate()}일`;

  function daySeconds(key) {
    return state.sessions
      .filter(s => s.date === key)
      .reduce((sum, s) => sum + s.seconds, 0);
  }

  function todaySeconds() {
    return daySeconds(todayKey()) +
      (state.activeDate === todayKey() ? (state.activeSeconds || 0) : 0);
  }

  function completedToday() {
    return state.sessions.filter(s => s.date === todayKey()).length;
  }

  const titleMap = {
    home: "오늘도, 좋은 집중",
    room: "함께 공부하는 스터디룸",
    timer: "나만의 집중 리듬",
    stats: "조금씩 쌓이는 기록",
    goals: "오늘의 목표와 체크리스트"
  };

  function navigate(view) {
    if (!$("#view-" + view)) view = "home";

    $$(".view").forEach(v =>
      v.classList.toggle("active", v.id === "view-" + view)
    );

    $$(".nav-item").forEach(b =>
      b.classList.toggle("active", b.dataset.view === view)
    );

    $("#page-title").textContent = titleMap[view];
    window.scrollTo({ top: 0, behavior: "smooth" });
    render();
  }

  $$(".nav-item").forEach(b =>
    b.addEventListener("click", () => navigate(b.dataset.view))
  );

  $$("[data-go]").forEach(b =>
    b.addEventListener("click", () => navigate(b.dataset.go))
  );

  $("#header-create").addEventListener("click", () => navigate("room"));
  $("#hero-create").addEventListener("click", () => navigate("room"));

  // 홈 화면에서 혼자 캠스터디 시작
  const heroSolo = $("#hero-solo");
  if (heroSolo) {
    heroSolo.addEventListener("click", async () => {
      navigate("room");
      await startSoloCamera();
    });
  }

  const date = new Date();
  $("#today-label").textContent = date
    .toLocaleDateString("ko-KR", {
      year: "numeric",
      month: "long",
      day: "numeric",
      weekday: "long"
    })
    .toUpperCase();

  $("#date-chip").textContent = dateLabel(date);

  // ------------------------------------------------------------
  // 집중 타이머
  // ------------------------------------------------------------

  let mode = "focus";
  let remaining = 25 * 60;
  let running = false;
  let timerInterval = null;
  let lastTick = 0;

  const durations = {
    focus: 25 * 60,
    short: 5 * 60,
    long: 15 * 60
  };

  function setMode(next) {
    pauseTimer(false);
    mode = next;
    remaining = durations[mode];

    $$(".segment").forEach(b =>
      b.classList.toggle("active", b.dataset.mode === mode)
    );

    $("#timer-mode-label").textContent =
      mode === "focus"
        ? "FOCUS SESSION"
        : mode === "short"
          ? "SHORT BREAK"
          : "LONG BREAK";

    $("#timer-start").textContent = "▶ 시작하기";
    renderTimer();
  }

  function renderTimer() {
    $("#timer-display").textContent = fmtClock(remaining);
    $("#home-timer").textContent = fmtClock(remaining);
    document.title = `${fmtClock(remaining)} · Study Together`;
  }

  function startTimer() {
    if (running) return;

    running = true;
    lastTick = Date.now();
    $("#timer-start").textContent = "Ⅱ 잠시 멈추기";

    timerInterval = setInterval(() => {
      const now = Date.now();
      const elapsed = Math.max(1, Math.floor((now - lastTick) / 1000));
      lastTick = now;

      if (mode === "focus") {
        state.activeSeconds = (state.activeSeconds || 0) + elapsed;
        state.activeDate = todayKey();
      }

      remaining = Math.max(0, remaining - elapsed);
      renderTimer();
      render();

      if (remaining <= 0) {
        pauseTimer(false);

        if (mode === "focus") {
          state.sessions.unshift({
            id: Date.now(),
            date: todayKey(),
            seconds: durations.focus,
            endedAt: new Date().toISOString(),
            mode: "focus"
          });

          state.activeSeconds = 0;
          save();
          toast("집중 세션 완료! 정말 잘했어요 ☕");
          setMode("short");
        } else {
          toast("휴식 시간이 끝났어요. 다시 시작해 볼까요?");
          setMode("focus");
        }

        render();
      } else {
        save();
      }
    }, 500);
  }

  function pauseTimer(showToast = true) {
    if (timerInterval) clearInterval(timerInterval);

    timerInterval = null;
    running = false;

    if ($("#timer-start")) {
      $("#timer-start").textContent = "▶ 계속하기";
    }

    save();

    if (showToast) toast("타이머를 잠시 멈췄어요.");
  }

  $$(".segment").forEach(b =>
    b.addEventListener("click", () => setMode(b.dataset.mode))
  );

  $("#timer-start").addEventListener("click", () =>
    running ? pauseTimer() : startTimer()
  );

  $("#timer-reset").addEventListener("click", () => {
    pauseTimer(false);
    remaining = durations[mode];
    $("#timer-start").textContent = "▶ 시작하기";
    renderTimer();
    toast("타이머를 초기화했어요.");
  });

  // ------------------------------------------------------------
  // 목표 및 체크리스트
  // ------------------------------------------------------------

  function renderTasks() {
    const tasks = state.tasks;
    const done = tasks.filter(t => t.done).length;

    $("#task-count").textContent = `${done}/${tasks.length} 완료`;

    $("#goal-progress-text").textContent = tasks.length
      ? `${Math.round(done / tasks.length * 100)}% 완료했어요. ${
          done === tasks.length
            ? "오늘의 목표를 모두 해냈어요! ✨"
            : "조금만 더 힘내봐요."
        }`
      : "아직 완료한 목표가 없어요.";

    $("#task-list").innerHTML = tasks.length
      ? tasks.map(t => `
          <div class="task-row ${t.done ? "done" : ""}" data-task="${t.id}">
            <button class="task-check" aria-label="${t.done ? "완료 취소" : "완료 표시"}">${t.done ? "✓" : ""}</button>
            <span class="task-text">${escapeHtml(t.text)}</span>
            <button class="delete-task" aria-label="삭제">×</button>
          </div>
        `).join("")
      : '<p class="empty-note">오늘의 첫 번째 할 일을 추가해 보세요.</p>';

    $("#home-goals").textContent = `${done} / ${tasks.length}`;

    $("#home-goal-list").innerHTML = tasks.length
      ? tasks.slice(0, 3).map(t => `
          <div class="compact-task ${t.done ? "done" : ""}">
            <span class="check-dot ${t.done ? "done" : ""}">${t.done ? "✓" : ""}</span>
            <span class="task-name">${escapeHtml(t.text)}</span>
          </div>
        `).join("")
      : '<p class="empty-note">오늘의 목표를 하나 정해볼까요?</p>';

    $("#goal-banner-title").textContent =
      state.intention || "오늘도 한 걸음 나아가기";
  }

  $("#task-form").addEventListener("submit", e => {
    e.preventDefault();

    const input = $("#task-input");
    const text = input.value.trim();

    if (!text) return;

    state.tasks.push({ id: Date.now(), text, done: false });
    input.value = "";
    save();
    render();
    toast("목표를 추가했어요.");
  });

  $("#task-list").addEventListener("click", e => {
    const row = e.target.closest("[data-task]");
    if (!row) return;

    const task = state.tasks.find(t => String(t.id) === row.dataset.task);
    if (!task) return;

    if (e.target.closest(".delete-task")) {
      state.tasks = state.tasks.filter(t => t.id !== task.id);
    } else if (e.target.closest(".task-check")) {
      task.done = !task.done;
    }

    save();
    render();
  });

  $("#clear-completed").addEventListener("click", () => {
    state.tasks = state.tasks.filter(t => !t.done);
    save();
    render();
    toast("완료한 항목을 정리했어요.");
  });

  const intentionDialog = $("#intention-dialog");

  $("#edit-intention").addEventListener("click", () => {
    $("#intention-input").value = state.intention || "";
    intentionDialog.showModal();
  });

  $("#intention-form").addEventListener("submit", e => {
    if (e.submitter && e.submitter.id === "save-intention") {
      state.intention =
        $("#intention-input").value.trim() || "오늘도 한 걸음 나아가기";
      save();
      render();
      $("#room-goal-text").textContent = state.intention || "오늘도 한 걸음 나아가기";
    }
  });

  // ------------------------------------------------------------
  // 공부 통계
  // ------------------------------------------------------------

  function renderStats() {
    const today = todaySeconds();
    const weekKeys = [];

    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      weekKeys.push(d.toLocaleDateString("sv-SE"));
    }

    const week = weekKeys.reduce((s, k) => s + daySeconds(k), 0) +
      (state.activeDate === todayKey() ? (state.activeSeconds || 0) : 0);

    $("#home-study-time").textContent = fmtMinutes(today);
    $("#home-sessions").textContent = `${completedToday()}회`;
    $("#timer-today-total").textContent = fmtMinutes(today);
    $("#stats-today").textContent = fmtMinutes(today);
    $("#stats-week").textContent = fmtMinutes(week);
    $("#stats-count").textContent = `${state.sessions.length}회`;

    const percent = Math.min(100, Math.round(today / (2 * 3600) * 100));

    $("#daily-progress").style.width = percent + "%";
    $("#daily-progress-label").textContent = percent + "%";

    const max = Math.max(
      60,
      ...weekKeys.map(k => daySeconds(k)),
      today
    );

    $("#weekly-chart").innerHTML = weekKeys.map(k => {
      const d = new Date(k + "T12:00:00");
      const sec = daySeconds(k) +
        (k === todayKey() ? (state.activeSeconds || 0) : 0);

      return `
        <div class="bar-column ${k === todayKey() ? "today" : ""}">
          <small>${Math.round(sec / 60)}m</small>
          <div class="bar" style="height:${Math.max(2, sec / max * 76)}%"></div>
          <span>${["일", "월", "화", "수", "목", "금", "토"][d.getDay()]}</span>
        </div>
      `;
    }).join("");

    const sessions = state.sessions.slice(0, 5);

    $("#recent-sessions").innerHTML = sessions.length
      ? sessions.map(s => `
          <div class="session-item">
            <strong>집중 세션</strong>
            <span>${fmtMinutes(s.seconds)}</span>
          </div>
        `).join("")
      : '<p class="empty-note">첫 집중 세션을 시작해 보세요.</p>';

    $("#session-history").innerHTML = state.sessions.length
      ? state.sessions.slice(0, 20).map(s => `
          <div class="history-row">
            <strong>집중 세션</strong>
            <span>${new Date(s.endedAt).toLocaleString("ko-KR", {
              month: "numeric",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit"
            })}</span>
            <span>${fmtMinutes(s.seconds)}</span>
          </div>
        `).join("")
      : '<p class="empty-note">아직 기록이 없어요. 타이머로 첫 집중 세션을 만들어 보세요.</p>';
  }

  function render() {
    renderTasks();
    renderStats();
    renderTimer();
  }

  render();
  
  // ------------------------------------------------------------
  // 스터디룸 공부 시간 기록
  // ------------------------------------------------------------

  let roomStudyRunning = false;
  let roomStudyStartedAt = 0;
  let roomStudyElapsed = 0;
  let roomStudyInterval = null;

  function formatStudyClock(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;

    return [
      String(h).padStart(2, "0"),
      String(m).padStart(2, "0"),
      String(s).padStart(2, "0")
    ].join(":");
  }

  function updateRoomStudyClock() {
    const elapsed = roomStudyElapsed +
      (roomStudyRunning
        ? Math.floor((Date.now() - roomStudyStartedAt) / 1000)
        : 0);

    $("#room-study-clock").textContent = formatStudyClock(elapsed);

    $("#room-study-start").textContent = roomStudyRunning
      ? "Ⅱ 공부 중"
      : elapsed > 0 ? "▶ 공부 계속하기" : "▶ 공부 시작";

    $("#room-study-start").disabled = roomStudyRunning;
    $("#room-study-finish").disabled = !roomStudyRunning;
    $("#room-study-status").textContent = roomStudyRunning
      ? "지금 집중하고 있어요. 천천히 이어가 봐요."
      : elapsed > 0
        ? "잠시 멈췄어요. 준비되면 다시 시작하세요."
        : "공부를 시작할 준비가 되었어요.";
  }

  function startRoomStudy() {
    if (roomStudyRunning) return;

    roomStudyRunning = true;
    roomStudyStartedAt = Date.now();

    updateRoomStudyClock();

    roomStudyInterval = setInterval(updateRoomStudyClock, 1000);
    toast("공부를 시작했어요. 오늘도 화이팅! ☕");
  }

  function finishRoomStudy() {
    if (!roomStudyRunning) return;

    roomStudyElapsed += Math.floor(
      (Date.now() - roomStudyStartedAt) / 1000
    );

    roomStudyRunning = false;
    roomStudyStartedAt = 0;

    clearInterval(roomStudyInterval);
    roomStudyInterval = null;

    const seconds = roomStudyElapsed;

    if (seconds > 0) {
      state.sessions.unshift({
        id: Date.now(),
        date: todayKey(),
        seconds,
        endedAt: new Date().toISOString(),
        mode: "focus"
      });

      state.activeSeconds = 0;
      state.activeDate = todayKey();
      save();
      render();
    }

    roomStudyElapsed = 0;
    updateRoomStudyClock();

    toast("공부 시간을 기록했어요. 캠은 계속 켜져 있어요.");
  }

  $("#room-study-start").addEventListener("click", startRoomStudy);
  $("#room-study-finish").addEventListener("click", finishRoomStudy);

  $("#room-edit-goal").addEventListener("click", () => {
    $("#intention-input").value = state.intention || "";
    $("#intention-dialog").showModal();
  });

  function enterStudyRoom() {
    document.body.classList.add("in-study-room");
    $("#room-goal-text").textContent =
      state.intention || "오늘도 한 걸음 나아가기";
  }

  function exitStudyRoom() {
    document.body.classList.remove("in-study-room");

    if (roomStudyRunning) {
      finishRoomStudy();
    }

    roomStudyElapsed = 0;
    roomStudyRunning = false;
    roomStudyStartedAt = 0;

    clearInterval(roomStudyInterval);
    roomStudyInterval = null;

    updateRoomStudyClock();
    navigate("home");
  }

  
  // ------------------------------------------------------------
  // 캠스터디
  // ------------------------------------------------------------

  let peer = null;
  let localStream = null;
  let screenStream = null;
  let currentCall = null;
  let isHost = false;
  let cameraOn = false;
  let micOn = false;
  let soloMode = false;

  const params = new URLSearchParams(location.search);
  const invitedHost = params.get("host");

  function setRoomStatus(text, live = false) {
    $("#room-status").textContent = text;
    $(".live-dot").textContent = live ? "● 연결됨" : "준비 중";
    $(".live-dot").style.color = live ? "#5c8053" : "";
  }

  function setInvite(url) {
    $("#invite-link").value = url;
  }

  function makePeer() {
    return new Promise((resolve, reject) => {
      if (!window.Peer) {
        reject(new Error("영상 연결 라이브러리를 불러오지 못했어요."));
        return;
      }

      const p = new Peer();
      p.on("open", id => resolve({ p, id }));
      p.on("error", reject);
    });
  }

  // audio=false면 혼자 캠 모드: 카메라만 요청
  // audio=true면 친구 연결용: 카메라와 마이크를 요청
  async function getMedia(audio = true) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error("카메라 기능은 HTTPS 또는 localhost에서 사용할 수 있어요.");
    }

    const hasVideo = localStream &&
      localStream.getVideoTracks().length > 0;

    const hasAudio = localStream &&
      localStream.getAudioTracks().length > 0;

    // 기존 스트림을 재사용할 수 있으면 그대로 사용
    if (hasVideo && (!audio || hasAudio)) {
      cameraOn = localStream.getVideoTracks().some(t => t.enabled);

      if (!audio) {
        localStream.getAudioTracks().forEach(t => {
          t.enabled = false;
        });
        micOn = false;
      } else {
        micOn = localStream.getAudioTracks().some(t => t.enabled);
      }

      updateMediaControls();
      $("#local-video").srcObject = localStream;
      $("#local-video").classList.add("active");
      $("#local-placeholder").style.display = "none";
      return localStream;
    }

    // 마이크가 필요한데 기존 스트림에 오디오가 없으면 새로 요청
    if (localStream) {
      localStream.getTracks().forEach(t => t.stop());
      localStream = null;
    }

    localStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio
    });

    $("#local-video").srcObject = localStream;
    $("#local-video").classList.add("active");
    $("#local-placeholder").style.display = "none";

    cameraOn = true;
    micOn = audio;
    updateMediaControls();

    return localStream;
  }

  function updateMediaControls() {
    $("#camera-toggle").classList.toggle("active", cameraOn);
    $("#mic-toggle").classList.toggle("active", micOn);
  }

  function removeRemoteVideo() {
    const tile = $("#remote-tile");
    if (tile) tile.remove();

    $("#friend-placeholder").style.display = "grid";
  }

  function closeRoomConnection() {
    if (currentCall) {
      currentCall.close();
      currentCall = null;
    }

    if (peer) {
      peer.destroy();
      peer = null;
    }

    isHost = false;
    removeRemoteVideo();
  }

  // 혼자 캠: PeerJS 연결을 만들지 않고 로컬 카메라만 켠다.
  async function startSoloCamera() {
    try {
      // 친구와 연결된 상태에서 혼자 모드로 전환하면 연결을 종료
      closeRoomConnection();

      if (screenStream) {
        screenStream.getTracks().forEach(t => t.stop());
        screenStream = null;
      }

      await getMedia(false);
      enterStudyRoom();
      soloMode = true;
      setInvite("");

      $("#room-heading").textContent = "혼자 집중하기";
      $("#local-video").srcObject = localStream;

      setRoomStatus(
        "혼자 캠스터디 중이에요. 영상은 이 브라우저에서만 표시돼요."
      );

      toast("혼자 캠스터디를 시작했어요 ☕");
    } catch (e) {
      setRoomStatus(e.message || "카메라를 켜지 못했어요.");
      toast(e.message || "브라우저의 카메라 권한을 확인해 주세요.");
    }
  }

  const soloCameraButton = $("#solo-camera");
  if (soloCameraButton) {
    soloCameraButton.addEventListener("click", startSoloCamera);
  }

  function showRemote(stream) {
    let tile = $("#remote-tile");

    if (!tile) {
      tile = document.createElement("div");
      tile.id = "remote-tile";
      tile.className = "video-tile";
      tile.innerHTML =
        '<video id="remote-video" autoplay playsinline class="active"></video>' +
        '<span class="video-name">스터디 친구</span>';

      $("#video-grid").appendChild(tile);
    }

    const video = $("#remote-video");
    video.srcObject = stream;
    video.classList.add("active");
    $("#friend-placeholder").style.display = "none";

    soloMode = false;
    setRoomStatus("친구와 연결됐어요. 함께 집중해 봐요!", true);
    enterStudyRoom();
  }

  function setupPeerEvents(p) {
    p.on("call", call => {
      currentCall = call;

      if (!localStream) {
        call.close();
        setRoomStatus("먼저 카메라를 켜주세요.");
        return;
      }

      call.answer(localStream);
      call.on("stream", showRemote);

      call.on("close", () => {
        removeRemoteVideo();
        setRoomStatus("친구와의 연결이 종료됐어요.");
      });

      call.on("error", err =>
        setRoomStatus("영상 연결 오류: " + err.message)
      );
    });

    p.on("error", err =>
      setRoomStatus("연결 오류: " + (err.type || err.message))
    );
  }

  async function createRoom() {
    try {
      setRoomStatus("카메라와 마이크 권한을 기다리는 중이에요…");

      // 혼자 캠에서 전환해도 마이크가 포함된 스트림을 준비
      await getMedia(true);
      soloMode = false;

      if (peer) peer.destroy();

      const result = await makePeer();
      peer = result.p;
      isHost = true;
      setupPeerEvents(peer);

      const url = new URL(location.href);
      url.searchParams.set("host", result.id);
      url.hash = "room";

      setInvite(url.toString());
      $("#room-heading").textContent =
        $("#room-name").value.trim() || "우리의 공부방";

      setRoomStatus(
        "방이 만들어졌어요! 초대 링크를 친구에게 보내세요.",
        true
      );

      toast("스터디룸을 만들었어요. 초대 링크를 공유해 보세요.");
      enterStudyRoom();
    } catch (e) {
      setRoomStatus(e.message || "스터디룸을 만들지 못했어요.");
      toast(e.message || "카메라 권한을 확인해 주세요.");
    }
  }

  async function joinRoom() {
    const hostId =
      new URLSearchParams(location.search).get("host") ||
      (prompt("친구에게 받은 초대 링크 또는 Peer ID를 입력해 주세요.") || "").trim();

    if (!hostId) {
      toast("초대 링크나 방 ID가 필요해요.");
      return;
    }

    const idMatch = hostId.match(/[?&]host=([^&#]+)/);
    const targetId = decodeURIComponent(
      idMatch ? idMatch[1] : hostId.replace(/^.*#/, "")
    );

    try {
      setRoomStatus("스터디룸에 연결하는 중이에요…");

      await getMedia(true);
      soloMode = false;

      if (peer) peer.destroy();

      const result = await makePeer();
      peer = result.p;
      setupPeerEvents(peer);

      const call = peer.call(targetId, localStream);
      currentCall = call;

      call.on("stream", showRemote);

      call.on("close", () => {
        removeRemoteVideo();
        setRoomStatus("연결이 종료됐어요.");
      });

      call.on("error", e =>
        setRoomStatus("영상 연결 오류: " + e.message)
      );

      setInvite(location.href);
      setRoomStatus("상대방이 연결을 수락할 때까지 기다리는 중이에요…");
    } catch (e) {
      setRoomStatus(e.message || "입장에 실패했어요.");
      toast(e.message || "카메라 권한을 확인해 주세요.");
    }
  }

  $("#create-room").addEventListener("click", createRoom);
  $("#join-room").addEventListener("click", joinRoom);

  $("#copy-invite").addEventListener("click", async () => {
    const val = $("#invite-link").value;

    if (!val) {
      toast("먼저 스터디룸을 만들어 주세요.");
      return;
    }

    try {
      await navigator.clipboard.writeText(val);
      toast("초대 링크를 복사했어요!");
    } catch {
      $("#invite-link").select();
      document.execCommand("copy");
      toast("초대 링크를 복사했어요.");
    }
  });

  $("#camera-toggle").addEventListener("click", () => {
    if (!localStream) {
      toast("먼저 혼자 캠을 켜거나 스터디룸에 입장해 주세요.");
      return;
    }

    cameraOn = !cameraOn;
    localStream.getVideoTracks().forEach(t => {
      t.enabled = cameraOn;
    });

    updateMediaControls();
    toast(cameraOn ? "카메라를 켰어요." : "카메라를 껐어요.");
  });

  $("#mic-toggle").addEventListener("click", async () => {
    if (!localStream) {
      toast("먼저 캠스터디를 시작해 주세요.");
      return;
    }

    if (!localStream.getAudioTracks().length) {
      toast("혼자 캠 모드에서는 마이크를 사용하지 않아요. 친구와 연결하면 사용할 수 있어요.");
      return;
    }

    micOn = !micOn;
    localStream.getAudioTracks().forEach(t => {
      t.enabled = micOn;
    });

    updateMediaControls();
    toast(micOn ? "마이크를 켰어요." : "마이크를 껐어요.");
  });

  $("#screen-toggle").addEventListener("click", async () => {
    try {
      if (!navigator.mediaDevices.getDisplayMedia) {
        throw new Error("이 브라우저에서는 화면 공유를 지원하지 않아요.");
      }

      screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: true
      });

      const track = screenStream.getVideoTracks()[0];

      if (currentCall && currentCall.peerConnection) {
        const sender = currentCall.peerConnection
          .getSenders()
          .find(s => s.track && s.track.kind === "video");

        if (sender) await sender.replaceTrack(track);
      }

      $("#local-video").srcObject = screenStream;

      track.onended = () => {
        if (localStream) $("#local-video").srcObject = localStream;
      };

      toast("화면 공유를 시작했어요.");
    } catch (e) {
      toast(e.message || "화면 공유를 시작하지 못했어요.");
    }
  });

  $("#leave-room").addEventListener("click", () => {
    closeRoomConnection();

    if (localStream) {
      localStream.getTracks().forEach(t => t.stop());
      localStream = null;
    }

    if (screenStream) {
      screenStream.getTracks().forEach(t => t.stop());
      screenStream = null;
    }

    $("#local-video").srcObject = null;
    $("#local-video").classList.remove("active");
    $("#local-placeholder").style.display = "flex";

    cameraOn = false;
    micOn = false;
    soloMode = false;
    updateMediaControls();
    setInvite("");

    $("#room-heading").textContent = "나의 스터디룸";
    setRoomStatus("연결을 종료했어요. 혼자 캠을 켜거나 새 방을 만들어 보세요.");

    toast("카메라와 스터디룸 연결을 종료했어요.");
    document.body.classList.remove("in-study-room");
    navigate("home");
  });

  // 초대 링크로 접속한 경우
  if (invitedHost) {
    navigate("room");
    setInvite(location.href);
    $("#room-heading").textContent = "초대받은 스터디룸";
    setRoomStatus("초대 링크로 도착했어요. 입장 / 연결을 눌러 카메라를 켜세요.");
  }
})();
