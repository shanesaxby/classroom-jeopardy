(() => {
  "use strict";

  const DEFAULT_RULES = {
    general: [
      "Teams take turns choosing a category and value.",
      "The teacher reads the question and controls the timer.",
      "Teams should wait to be recognised before answering.",
      "After an incorrect response, another team may attempt the same question."
    ],
    scoring: [
      "A correct response adds the value of the selected question.",
      "An incorrect response automatically subtracts the value of the selected question.",
      "If no team answers correctly, the tile is closed with a neutral tick.",
      "The teacher may use either the selected-team controls or the quick scoring buttons."
    ],
    final: [
      "The category is revealed before wagers are entered.",
      "Each team enters a visible wager. A wager cannot exceed the team's current positive score.",
      "The teacher reveals the question and starts the countdown.",
      "A correct response adds the wager; an incorrect response subtracts it."
    ]
  };

  const TEAM_COLOURS = [
    "#20c9e8", "#ffc857", "#ff7f7f", "#9f7aea",
    "#6ee7a2", "#ff9f43", "#7aa7ff", "#f783d8"
  ];

  const DB_NAME = "classroom-jeopardy-v2";
  const DB_VERSION = 1;
  const IMPORTED_QUIZ_STORE = "importedQuizzes";

  const state = {
    manifest: [],
    importedQuizzes: [],
    selectedQuizRef: "",
    selectedQuizPath: "",
    selectedQuizSource: "",
    quizAssets: {},
    quiz: null,
    teams: [],
    usedQuestions: {},
    currentQuestion: null,
    selectedTeamIndex: 0,
    questionResolved: false,
    timer: null,
    timerRemaining: 0,
    timerInitial: 0,
    timerRunning: false,
    muted: false,
    final: {
      step: "category",
      wagers: [],
      results: [],
      timerRemaining: 0,
      timerInitial: 0,
      timerRunning: false
    }
  };

  const el = {};
  let audioContext = null;
  let toastTimer = null;
  let quizDatabase = null;

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    cacheElements();
    bindEvents();
    renderDefaultRules();
    renderTeamSetup(2);
    await loadImportedLibrary();
    await loadManifest();
    showScreen("quizScreen");
  }

  function cacheElements() {
    [
      "quizScreen", "teamScreen", "gameScreen", "resultsScreen",
      "quizSelect", "reloadQuizzesButton", "quizLoadMessage", "quizInfo",
      "quizTitle", "quizDescription", "quizCourse", "quizLevel", "quizAuthor",
      "quizDuration", "categoryPreview", "continueButton", "restoreGameButton",
      "quizSourceBadge", "importQuizButton", "importModal", "chooseJsonButton",
      "chooseFolderButton", "quizFileInput", "quizFolderInput", "importStatus",
      "importedQuizActions", "removeImportedQuizButton", "clearImportedQuizzesButton",
      "teamSetupList", "removeTeamButton", "addTeamButton", "backToQuizButton",
      "startGameButton", "gameQuizTitle", "board", "scoreboard", "finalRoundButton",
      "rulesButton", "muteButton", "homeButton", "rulesModal", "rulesContent",
      "questionModal", "questionCategory", "questionValue", "questionImage",
      "questionPrompt", "answerPanel", "questionAnswer", "revealAnswerButton",
      "noAnswerButton", "returnToBoardButton", "teamSelector", "quickScoreButtons",
      "selectedCorrectButton", "selectedIncorrectButton", "timerDisplay",
      "timerControls", "timerStartButton", "timerPauseButton", "timerResetButton",
      "finalModal", "finalStepContent", "finalFooter", "winnerBanner", "rankings",
      "playAgainButton", "chooseAnotherButton", "confettiLayer", "toast"
    ].forEach(id => { el[id] = document.getElementById(id); });
  }

  function bindEvents() {
    el.quizSelect.addEventListener("change", () => selectQuiz(el.quizSelect.value));
    el.reloadQuizzesButton.addEventListener("click", loadManifest);
    el.importQuizButton.addEventListener("click", openImportModal);
    el.chooseJsonButton.addEventListener("click", () => el.quizFileInput.click());
    el.chooseFolderButton.addEventListener("click", () => el.quizFolderInput.click());
    el.quizFileInput.addEventListener("change", importSingleQuizFile);
    el.quizFolderInput.addEventListener("change", importQuizFolder);
    el.removeImportedQuizButton.addEventListener("click", removeSelectedImportedQuiz);
    el.clearImportedQuizzesButton.addEventListener("click", clearImportedQuizzes);
    document.querySelectorAll("[data-close-modal='import']").forEach(button => {
      button.addEventListener("click", closeImportModal);
    });
    el.continueButton.addEventListener("click", () => showScreen("teamScreen"));
    el.restoreGameButton.addEventListener("click", restoreSavedGame);
    el.backToQuizButton.addEventListener("click", () => showScreen("quizScreen"));
    el.addTeamButton.addEventListener("click", () => renderTeamSetup(getSetupTeamCount() + 1, readTeamSetup()));
    el.removeTeamButton.addEventListener("click", () => renderTeamSetup(getSetupTeamCount() - 1, readTeamSetup()));
    el.startGameButton.addEventListener("click", startNewGame);
    el.rulesButton.addEventListener("click", openRules);
    el.homeButton.addEventListener("click", () => {
      stopTimer();
      stopFinalTimer();
      closeQuestionModal();
      el.finalModal.classList.add("hidden");
      showScreen("quizScreen");
    });
    el.muteButton.addEventListener("click", toggleMute);
    document.querySelectorAll("[data-close-modal='rules']").forEach(button => {
      button.addEventListener("click", () => el.rulesModal.classList.add("hidden"));
    });
    document.querySelectorAll("[data-rule-tab]").forEach(button => {
      button.addEventListener("click", () => activateRulesTab(button.dataset.ruleTab));
    });

    el.revealAnswerButton.addEventListener("click", revealAnswer);
    el.noAnswerButton.addEventListener("click", resolveNoAnswer);
    el.returnToBoardButton.addEventListener("click", returnToBoard);
    el.selectedCorrectButton.addEventListener("click", () => scoreSelectedTeam(true));
    el.selectedIncorrectButton.addEventListener("click", () => scoreSelectedTeam(false));
    el.timerStartButton.addEventListener("click", startTimer);
    el.timerPauseButton.addEventListener("click", pauseTimer);
    el.timerResetButton.addEventListener("click", resetTimer);

    el.finalRoundButton.addEventListener("click", openFinalRound);
    el.playAgainButton.addEventListener("click", playAgain);
    el.chooseAnotherButton.addEventListener("click", chooseAnotherQuiz);

    window.addEventListener("beforeunload", saveGameState);
  }

  async function loadManifest() {
    const preferredRef = state.selectedQuizRef;
    setQuizMessage("Loading quiz library…", "");
    el.quizSelect.disabled = true;
    el.continueButton.disabled = true;
    el.quizInfo.classList.add("hidden");
    el.restoreGameButton.classList.add("hidden");

    let manifestError = "";
    try {
      const response = await fetch(`quizzes/quiz-list.json?cache=${Date.now()}`);
      if (!response.ok) throw new Error(`Quiz list returned ${response.status}.`);
      const data = await response.json();
      if (!Array.isArray(data.quizzes)) throw new Error("quiz-list.json must contain a quizzes array.");
      state.manifest = data.quizzes;
    } catch (error) {
      console.error(error);
      state.manifest = [];
      manifestError = "The built-in quiz list could not be loaded. Imported quizzes are still available. On a computer, launch with start-game.bat; online, publish the complete folder through GitHub Pages.";
    }

    renderQuizOptions(preferredRef);
    const builtInCount = state.manifest.length;
    const importedCount = state.importedQuizzes.length;
    const total = builtInCount + importedCount;

    if (manifestError) {
      setQuizMessage(manifestError, "error");
    } else {
      const importedText = importedCount ? ` and ${importedCount} imported` : "";
      setQuizMessage(`${builtInCount} built-in quiz${builtInCount === 1 ? "" : "zes"}${importedText} available.`, "success");
    }

    el.quizSelect.disabled = total === 0;
    if (preferredRef && optionExists(preferredRef)) {
      el.quizSelect.value = preferredRef;
      await selectQuiz(preferredRef);
    }
  }

  function renderQuizOptions(selectedRef = "") {
    el.quizSelect.innerHTML = '<option value="">Select a quiz…</option>';

    if (state.manifest.length) {
      const group = document.createElement("optgroup");
      group.label = "Built-in quizzes";
      state.manifest.forEach(item => {
        const option = document.createElement("option");
        option.value = `builtin:${item.file}`;
        option.textContent = item.label || item.file;
        group.appendChild(option);
      });
      el.quizSelect.appendChild(group);
    }

    if (state.importedQuizzes.length) {
      const group = document.createElement("optgroup");
      group.label = "Imported quizzes — this browser";
      [...state.importedQuizzes]
        .sort((a, b) => String(a.title).localeCompare(String(b.title)))
        .forEach(record => {
          const option = document.createElement("option");
          option.value = `imported:${record.id}`;
          option.textContent = record.title || record.quiz?.title || record.id;
          group.appendChild(option);
        });
      el.quizSelect.appendChild(group);
    }

    if (selectedRef && optionExists(selectedRef)) el.quizSelect.value = selectedRef;
    el.quizSelect.disabled = state.manifest.length + state.importedQuizzes.length === 0;
  }

  function optionExists(value) {
    return [...el.quizSelect.options].some(option => option.value === value);
  }

  async function selectQuiz(ref) {
    state.selectedQuizRef = ref;
    state.selectedQuizPath = "";
    state.selectedQuizSource = "";
    state.quizAssets = {};
    state.quiz = null;
    el.continueButton.disabled = true;
    el.quizInfo.classList.add("hidden");
    el.restoreGameButton.classList.add("hidden");
    el.importedQuizActions.classList.add("hidden");

    if (!ref) return;

    setQuizMessage("Loading quiz…", "");
    try {
      let quiz;
      if (ref.startsWith("builtin:")) {
        const path = ref.slice("builtin:".length);
        const response = await fetch(`quizzes/${path}?cache=${Date.now()}`);
        if (!response.ok) throw new Error(`Quiz returned ${response.status}.`);
        quiz = await response.json();
        state.selectedQuizPath = path;
        state.selectedQuizSource = "built-in";
      } else if (ref.startsWith("imported:")) {
        const id = ref.slice("imported:".length);
        const record = state.importedQuizzes.find(item => item.id === id);
        if (!record) throw new Error("The imported quiz is no longer stored in this browser.");
        quiz = cloneData(record.quiz);
        state.quizAssets = record.assets || {};
        state.selectedQuizSource = "imported";
      } else {
        throw new Error("Unknown quiz source.");
      }

      validateQuiz(quiz);
      state.quiz = quiz;
      renderQuizInfo(quiz);
      el.continueButton.disabled = false;
      el.importedQuizActions.classList.toggle("hidden", state.selectedQuizSource !== "imported");
      setQuizMessage("Quiz ready.", "success");

      if (localStorage.getItem(saveKey(state.selectedQuizRef))) {
        el.restoreGameButton.classList.remove("hidden");
      }
    } catch (error) {
      console.error(error);
      setQuizMessage(`Could not load this quiz: ${error.message}`, "error");
    }
  }

  function validateQuiz(quiz) {
    if (!quiz || typeof quiz !== "object") throw new Error("Quiz file is not a JSON object.");
    if (!quiz.id || !quiz.title) throw new Error("Quiz needs id and title fields.");
    if (!Array.isArray(quiz.categories) || quiz.categories.length < 1) {
      throw new Error("Quiz needs at least one category.");
    }
    quiz.categories.forEach((category, categoryIndex) => {
      if (!category.name || !Array.isArray(category.questions)) {
        throw new Error(`Category ${categoryIndex + 1} needs a name and questions array.`);
      }
      category.questions.forEach((question, questionIndex) => {
        if (!Number.isFinite(Number(question.value)) || !question.prompt || !question.answer) {
          throw new Error(`Question ${questionIndex + 1} in ${category.name} needs value, prompt and answer.`);
        }
      });
    });
    if (!quiz.finalRound || !quiz.finalRound.category || !quiz.finalRound.prompt || !quiz.finalRound.answer) {
      throw new Error("Quiz needs a finalRound with category, prompt and answer.");
    }
  }

  function renderQuizInfo(quiz) {
    el.quizSourceBadge.textContent = state.selectedQuizSource === "imported" ? "Imported" : "Built-in";
    el.quizSourceBadge.className = `source-pill ${state.selectedQuizSource === "imported" ? "imported" : "built-in"}`;
    el.quizTitle.textContent = quiz.title;
    el.quizDescription.textContent = quiz.description || "No description supplied.";
    el.quizCourse.textContent = quiz.course || "General";
    el.quizLevel.textContent = quiz.recommendedLevel || "All levels";
    el.quizAuthor.textContent = quiz.author || "Not specified";
    el.quizDuration.textContent = quiz.estimatedDuration || "Not specified";
    el.categoryPreview.innerHTML = "";
    quiz.categories.forEach(category => {
      const chip = document.createElement("span");
      chip.className = "category-chip";
      chip.textContent = category.name;
      el.categoryPreview.appendChild(chip);
    });
    el.quizInfo.classList.remove("hidden");
  }

  function setQuizMessage(message, type) {
    el.quizLoadMessage.textContent = message;
    el.quizLoadMessage.className = `status-message ${type || ""}`;
  }

  function renderTeamSetup(count, existing = []) {
    const safeCount = Math.max(2, Math.min(8, count));
    el.teamSetupList.innerHTML = "";

    for (let i = 0; i < safeCount; i += 1) {
      const team = existing[i] || {};
      const row = document.createElement("div");
      row.className = "team-setup-row";
      row.style.setProperty("--team-colour", team.colour || TEAM_COLOURS[i]);

      const number = document.createElement("div");
      number.className = "team-number";
      number.textContent = i + 1;

      const name = document.createElement("input");
      name.className = "team-name-input";
      name.type = "text";
      name.maxLength = 28;
      name.value = team.name || `Team ${i + 1}`;
      name.setAttribute("aria-label", `Team ${i + 1} name`);

      const colour = document.createElement("input");
      colour.className = "team-colour-input";
      colour.type = "color";
      colour.value = team.colour || TEAM_COLOURS[i];
      colour.setAttribute("aria-label", `Team ${i + 1} colour`);
      colour.addEventListener("input", () => row.style.setProperty("--team-colour", colour.value));

      row.append(number, name, colour);
      el.teamSetupList.appendChild(row);
    }

    el.removeTeamButton.disabled = safeCount <= 2;
    el.addTeamButton.disabled = safeCount >= 8;
  }

  function getSetupTeamCount() {
    return el.teamSetupList.querySelectorAll(".team-setup-row").length;
  }

  function readTeamSetup() {
    return [...el.teamSetupList.querySelectorAll(".team-setup-row")].map((row, index) => {
      const name = row.querySelector(".team-name-input").value.trim() || `Team ${index + 1}`;
      const colour = row.querySelector(".team-colour-input").value;
      return { name, colour };
    });
  }

  function startNewGame() {
    if (!state.quiz) {
      showToast("Choose a quiz first.");
      showScreen("quizScreen");
      return;
    }

    state.teams = readTeamSetup().map(team => ({ ...team, score: 0 }));
    state.usedQuestions = {};
    state.currentQuestion = null;
    state.questionResolved = false;
    state.selectedTeamIndex = 0;
    resetFinalState();
    localStorage.removeItem(saveKey(state.selectedQuizRef));

    el.gameQuizTitle.textContent = state.quiz.title;
    renderBoard();
    renderScoreboard();
    showScreen("gameScreen");
    playSound("start");
    saveGameState();
  }

  function renderBoard() {
    const categories = state.quiz.categories;
    const rowCount = Math.max(...categories.map(category => category.questions.length));
    el.board.innerHTML = "";
    el.board.style.gridTemplateColumns = `repeat(${categories.length}, minmax(0, 1fr))`;
    el.board.style.gridTemplateRows = `auto repeat(${rowCount}, minmax(0, 1fr))`;

    categories.forEach(category => {
      const heading = document.createElement("div");
      heading.className = "category-cell";
      heading.textContent = category.name;
      heading.style.fontSize = category.name.length > 22
        ? "clamp(0.67rem, 1.45vw, 1.12rem)"
        : "clamp(0.78rem, 1.75vw, 1.45rem)";
      el.board.appendChild(heading);
    });

    for (let row = 0; row < rowCount; row += 1) {
      categories.forEach((category, categoryIndex) => {
        const question = category.questions[row];
        if (!question) {
          const spacer = document.createElement("div");
          spacer.className = "question-tile used";
          spacer.textContent = "—";
          spacer.disabled = true;
          el.board.appendChild(spacer);
          return;
        }

        const key = questionKey(categoryIndex, row);
        const used = state.usedQuestions[key];
        const tile = document.createElement("button");
        tile.className = `question-tile${used ? " used" : ""}`;
        tile.type = "button";
        tile.dataset.categoryIndex = categoryIndex;
        tile.dataset.questionIndex = row;

        if (used) {
          tile.textContent = "✓";
          tile.disabled = true;
          tile.style.setProperty("--tile-team-colour", used.colour || "#8191a3");
          tile.setAttribute("aria-label", `${category.name} ${question.value}, already used`);
        } else {
          tile.textContent = formatPoints(question.value);
          tile.setAttribute("aria-label", `${category.name} for ${question.value} points`);
          tile.addEventListener("click", () => openQuestion(categoryIndex, row));
        }

        el.board.appendChild(tile);
      });
    }
  }

  function renderScoreboard(flashIndex = null, positive = true) {
    el.scoreboard.innerHTML = "";
    el.scoreboard.style.setProperty("--team-count", state.teams.length);

    state.teams.forEach((team, index) => {
      const panel = document.createElement("div");
      panel.className = "score-panel";
      panel.style.setProperty("--team-colour", team.colour);
      panel.dataset.teamIndex = index;

      if (index === flashIndex) {
        panel.classList.add(positive ? "score-flash-positive" : "score-flash-negative");
      }

      const name = document.createElement("span");
      name.className = "score-team-name";
      name.textContent = team.name;

      const score = document.createElement("span");
      score.className = "score-value";
      score.textContent = formatScore(team.score);

      panel.append(name, score);
      el.scoreboard.appendChild(panel);
    });
  }

  function openQuestion(categoryIndex, questionIndex, options = {}) {
    const category = state.quiz.categories[categoryIndex];
    const question = category.questions[questionIndex];
    state.currentQuestion = { categoryIndex, questionIndex, category, question };
    state.questionResolved = false;
    state.selectedTeamIndex = 0;

    el.questionCategory.textContent = category.name;
    el.questionValue.textContent = formatPoints(question.value);
    el.questionPrompt.textContent = question.prompt;
    el.questionAnswer.textContent = question.answer;
    el.answerPanel.classList.add("hidden");
    el.revealAnswerButton.classList.remove("hidden");
    el.noAnswerButton.classList.remove("hidden");
    el.returnToBoardButton.classList.add("hidden");

    if (question.image) {
      const imageSource = resolveImageSource(question.image);
      if (imageSource) {
        el.questionImage.src = imageSource;
        el.questionImage.alt = question.imageAlt || "Question image";
        el.questionImage.classList.remove("hidden");
      } else {
        el.questionImage.removeAttribute("src");
        el.questionImage.classList.add("hidden");
        showToast("This imported quiz image was not included. Re-import its extracted folder.");
      }
    } else {
      el.questionImage.removeAttribute("src");
      el.questionImage.classList.add("hidden");
    }

    renderQuestionScoringControls();
    setupTimer(Number(question.timerSeconds ?? state.quiz.settings?.questionTimerSeconds ?? 0));
    el.questionModal.classList.remove("hidden");
    if (!options.silent) playSound("open");
    saveGameState();
  }

  function renderQuestionScoringControls() {
    el.teamSelector.innerHTML = "";
    el.quickScoreButtons.innerHTML = "";
    el.quickScoreButtons.style.setProperty("--team-count", state.teams.length);

    state.teams.forEach((team, index) => {
      const selector = document.createElement("button");
      selector.type = "button";
      selector.className = `team-select-button${index === state.selectedTeamIndex ? " selected" : ""}`;
      selector.style.setProperty("--team-colour", team.colour);
      selector.textContent = team.name;
      selector.setAttribute("role", "radio");
      selector.setAttribute("aria-checked", index === state.selectedTeamIndex ? "true" : "false");
      selector.addEventListener("click", () => {
        state.selectedTeamIndex = index;
        renderQuestionScoringControls();
      });
      el.teamSelector.appendChild(selector);

      const quick = document.createElement("div");
      quick.className = "quick-score-team";
      quick.style.setProperty("--team-colour", team.colour);

      const name = document.createElement("span");
      name.className = "quick-score-name";
      name.textContent = team.name;

      const correct = document.createElement("button");
      correct.type = "button";
      correct.className = "quick-score-button correct";
      correct.textContent = "✓";
      correct.title = `Mark ${team.name} correct`;
      correct.disabled = state.questionResolved;
      correct.addEventListener("click", () => scoreTeam(index, true));

      const incorrect = document.createElement("button");
      incorrect.type = "button";
      incorrect.className = "quick-score-button incorrect";
      incorrect.textContent = "✕";
      incorrect.title = `Mark ${team.name} incorrect`;
      incorrect.disabled = state.questionResolved;
      incorrect.addEventListener("click", () => scoreTeam(index, false));

      quick.append(name, correct, incorrect);
      el.quickScoreButtons.appendChild(quick);
    });

    el.selectedCorrectButton.disabled = state.questionResolved;
    el.selectedIncorrectButton.disabled = state.questionResolved;
  }

  function scoreSelectedTeam(correct) {
    scoreTeam(state.selectedTeamIndex, correct);
  }

  function scoreTeam(teamIndex, correct) {
    if (!state.currentQuestion || state.questionResolved) return;
    const value = Number(state.currentQuestion.question.value);
    const team = state.teams[teamIndex];

    if (correct) {
      team.score += value;
      state.questionResolved = true;
      markCurrentQuestion(team.colour, team.name);
      revealAnswer();
      stopTimer();
      el.noAnswerButton.classList.add("hidden");
      el.returnToBoardButton.classList.remove("hidden");
      playSound("correct");
      renderQuestionScoringControls();
      showToast(`${team.name} gains ${formatPoints(value)}.`);
      renderScoreboard(teamIndex, true);
    } else {
      team.score -= value;
      playSound("incorrect");
      showToast(`${team.name} loses ${formatPoints(value)}.`);
      renderScoreboard(teamIndex, false);
    }
    saveGameState();
  }

  function resolveNoAnswer() {
    if (!state.currentQuestion || state.questionResolved) return;
    state.questionResolved = true;
    markCurrentQuestion("#8191a3", "No correct answer");
    revealAnswer();
    stopTimer();
    el.noAnswerButton.classList.add("hidden");
    el.returnToBoardButton.classList.remove("hidden");
    renderQuestionScoringControls();
    playSound("close");
    saveGameState();
  }

  function markCurrentQuestion(colour, teamName) {
    const { categoryIndex, questionIndex } = state.currentQuestion;
    state.usedQuestions[questionKey(categoryIndex, questionIndex)] = { colour, teamName };
  }

  function revealAnswer() {
    el.answerPanel.classList.remove("hidden");
    el.revealAnswerButton.classList.add("hidden");
    playSound("reveal");
  }

  function returnToBoard() {
    closeQuestionModal();
    renderBoard();
    renderScoreboard();
    saveGameState();

    if (allQuestionsUsed()) {
      showToast("All board questions are complete. Final Round is ready.");
    }
  }

  function closeQuestionModal() {
    stopTimer();
    el.questionModal.classList.add("hidden");
    state.currentQuestion = null;
    state.questionResolved = false;
  }

  function allQuestionsUsed() {
    const total = state.quiz.categories.reduce((sum, category) => sum + category.questions.length, 0);
    return Object.keys(state.usedQuestions).length >= total;
  }

  function setupTimer(seconds) {
    stopTimer();
    state.timerInitial = Math.max(0, Math.floor(seconds));
    state.timerRemaining = state.timerInitial;
    state.timerRunning = false;
    el.timerControls.classList.toggle("hidden", state.timerInitial <= 0);
    updateTimerDisplay();
  }

  function startTimer() {
    if (state.timerInitial <= 0 || state.timerRunning || state.timerRemaining <= 0) return;
    ensureAudioContext();
    state.timerRunning = true;
    state.timer = window.setInterval(() => {
      state.timerRemaining -= 1;
      updateTimerDisplay();

      if (state.timerRemaining > 0 && state.timerRemaining <= 5) playSound("tick");
      if (state.timerRemaining <= 0) {
        stopTimer();
        playSound("time");
      }
      saveGameState();
    }, 1000);
  }

  function pauseTimer() {
    stopTimer();
  }

  function resetTimer() {
    stopTimer();
    state.timerRemaining = state.timerInitial;
    updateTimerDisplay();
  }

  function stopTimer() {
    if (state.timer) {
      clearInterval(state.timer);
      state.timer = null;
    }
    state.timerRunning = false;
  }

  function updateTimerDisplay() {
    if (state.timerInitial <= 0) {
      el.timerDisplay.textContent = "No timer";
      el.timerDisplay.classList.remove("urgent");
      return;
    }
    el.timerDisplay.textContent = `${state.timerRemaining}s`;
    el.timerDisplay.classList.toggle("urgent", state.timerRemaining <= 5);
  }

  function openRules() {
    activateRulesTab("general");
    el.rulesModal.classList.remove("hidden");
  }

  function activateRulesTab(tabName) {
    document.querySelectorAll("[data-rule-tab]").forEach(button => {
      const active = button.dataset.ruleTab === tabName;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", active ? "true" : "false");
    });

    const rules = mergedRules();
    const items = rules[tabName] || [];
    el.rulesContent.innerHTML = "";
    const list = document.createElement("ol");
    items.forEach(item => {
      const li = document.createElement("li");
      li.textContent = item;
      list.appendChild(li);
    });
    el.rulesContent.appendChild(list);
  }

  function mergedRules() {
    const quizRules = state.quiz?.rules || {};
    const mode = quizRules.mode || "append";
    const result = {};

    ["general", "scoring", "final"].forEach(section => {
      const custom = Array.isArray(quizRules[section]) ? quizRules[section] : [];
      result[section] = mode === "replace" && custom.length
        ? custom
        : [...DEFAULT_RULES[section], ...custom];
    });
    return result;
  }

  function renderDefaultRules() {
    activateRulesTab("general");
  }

  function openFinalRound() {
    if (!state.quiz) return;
    closeQuestionModal();
    state.final.step = "category";
    state.final.wagers = state.teams.map(() => 0);
    state.final.results = state.teams.map(() => null);
    state.final.timerInitial = Number(state.quiz.finalRound.timerSeconds ?? state.quiz.settings?.finalTimerSeconds ?? 60);
    state.final.timerRemaining = state.final.timerInitial;
    state.final.timerRunning = false;
    renderFinalStep();
    el.finalModal.classList.remove("hidden");
    playSound("final");
    saveGameState();
  }

  function renderFinalStep() {
    stopFinalTimer();
    el.finalStepContent.innerHTML = "";
    el.finalFooter.innerHTML = "";

    switch (state.final.step) {
      case "category":
        renderFinalCategory();
        break;
      case "wagers":
        renderFinalWagers();
        break;
      case "question":
        renderFinalQuestion(false);
        break;
      case "answer":
        renderFinalQuestion(true);
        break;
      case "scoring":
        renderFinalScoring();
        break;
      default:
        renderFinalCategory();
    }
  }

  function renderFinalCategory() {
    const wrapper = document.createElement("div");
    wrapper.className = "final-category";
    wrapper.innerHTML = `
      <div>
        <div class="eyebrow">The category is</div>
        <h3>${escapeHtml(state.quiz.finalRound.category)}</h3>
      </div>
    `;
    el.finalStepContent.appendChild(wrapper);
    addFinalButton("Enter wagers", "primary-button", () => {
      state.final.step = "wagers";
      renderFinalStep();
    });
  }

  function renderFinalWagers() {
    const heading = document.createElement("div");
    heading.innerHTML = `
      <div class="eyebrow">Visible wagers</div>
      <h2>Enter each team's wager</h2>
      <p class="lead">The suggested maximum is the team's current positive score. The host may enter any non-negative amount.</p>
    `;
    el.finalStepContent.appendChild(heading);

    const grid = document.createElement("div");
    grid.className = "wager-grid";

    state.teams.forEach((team, index) => {
      const card = document.createElement("div");
      card.className = "wager-card";
      card.style.setProperty("--team-colour", team.colour);

      const label = document.createElement("label");
      label.htmlFor = `wager-${index}`;
      label.textContent = `${team.name} — score ${formatScore(team.score)}`;

      const input = document.createElement("input");
      input.id = `wager-${index}`;
      input.className = "wager-input";
      const maximumWager = Math.max(0, Number(team.score) || 0);
      input.type = "number";
      input.min = "0";
      input.max = String(maximumWager);
      input.step = "1";
      input.value = String(Math.min(maximumWager, state.final.wagers[index] ?? 0));
      input.addEventListener("input", () => {
        const entered = Math.max(0, Number(input.value) || 0);
        state.final.wagers[index] = Math.min(maximumWager, entered);
        if (entered > maximumWager) input.value = String(maximumWager);
        saveGameState();
      });

      card.append(label, input);
      grid.appendChild(card);
    });

    el.finalStepContent.appendChild(grid);
    addFinalButton("Back", "secondary-button", () => {
      state.final.step = "category";
      renderFinalStep();
    });
    addFinalButton("Reveal question", "primary-button", () => {
      state.final.step = "question";
      state.final.timerRemaining = state.final.timerInitial;
      renderFinalStep();
      playSound("open");
    });
  }

  function renderFinalQuestion(showAnswer) {
    const wrapper = document.createElement("div");
    wrapper.className = "final-question";

    if (state.quiz.finalRound.image) {
      const image = document.createElement("img");
      image.className = "question-image";
      const imageSource = resolveImageSource(state.quiz.finalRound.image);
      if (imageSource) {
        image.src = imageSource;
        image.alt = state.quiz.finalRound.imageAlt || "Final Round image";
        wrapper.appendChild(image);
      }
    }

    const prompt = document.createElement("h3");
    prompt.textContent = state.quiz.finalRound.prompt;
    wrapper.appendChild(prompt);

    const timer = document.createElement("div");
    timer.className = "timer-panel";
    timer.innerHTML = `
      <div id="finalTimerDisplay" class="timer-display">${state.final.timerRemaining}s</div>
      <div class="timer-controls">
        <button id="finalTimerStart" class="mini-button" type="button">Start</button>
        <button id="finalTimerPause" class="mini-button" type="button">Pause</button>
        <button id="finalTimerReset" class="mini-button" type="button">Reset</button>
      </div>
    `;
    wrapper.appendChild(timer);

    if (showAnswer) {
      const answer = document.createElement("div");
      answer.className = "final-answer";
      answer.textContent = state.quiz.finalRound.answer;
      wrapper.appendChild(answer);
    }

    el.finalStepContent.appendChild(wrapper);
    bindFinalTimerButtons();

    if (!showAnswer) {
      addFinalButton("Back to wagers", "secondary-button", () => {
        state.final.step = "wagers";
        renderFinalStep();
      });
      addFinalButton("Reveal answer", "gold-button", () => {
        stopFinalTimer();
        state.final.step = "answer";
        renderFinalStep();
        playSound("reveal");
      });
    } else {
      addFinalButton("Score responses", "primary-button", () => {
        state.final.step = "scoring";
        renderFinalStep();
      });
    }
  }

  function bindFinalTimerButtons() {
    document.getElementById("finalTimerStart")?.addEventListener("click", startFinalTimer);
    document.getElementById("finalTimerPause")?.addEventListener("click", stopFinalTimer);
    document.getElementById("finalTimerReset")?.addEventListener("click", () => {
      stopFinalTimer();
      state.final.timerRemaining = state.final.timerInitial;
      updateFinalTimerDisplay();
    });
  }

  function startFinalTimer() {
    if (state.final.timerRunning || state.final.timerRemaining <= 0) return;
    ensureAudioContext();
    state.final.timerRunning = true;
    playSound("music");
    state.final.timer = window.setInterval(() => {
      state.final.timerRemaining -= 1;
      updateFinalTimerDisplay();
      if (state.final.timerRemaining > 0 && state.final.timerRemaining <= 5) playSound("tick");
      if (state.final.timerRemaining <= 0) {
        stopFinalTimer();
        playSound("time");
      }
      saveGameState();
    }, 1000);
  }

  function stopFinalTimer() {
    if (state.final.timer) {
      clearInterval(state.final.timer);
      state.final.timer = null;
    }
    state.final.timerRunning = false;
  }

  function updateFinalTimerDisplay() {
    const display = document.getElementById("finalTimerDisplay");
    if (!display) return;
    display.textContent = `${state.final.timerRemaining}s`;
    display.classList.toggle("urgent", state.final.timerRemaining <= 5);
  }

  function renderFinalScoring() {
    const heading = document.createElement("div");
    heading.innerHTML = `
      <div class="eyebrow">Final scoring</div>
      <h2>Mark each team's response</h2>
    `;
    el.finalStepContent.appendChild(heading);

    const grid = document.createElement("div");
    grid.className = "final-score-grid";

    state.teams.forEach((team, index) => {
      const row = document.createElement("div");
      row.className = "final-score-row";
      row.style.setProperty("--team-colour", team.colour);

      const summary = document.createElement("div");
      summary.className = "final-team-summary";
      summary.innerHTML = `
        <strong>${escapeHtml(team.name)}</strong>
        <span>Wager: ${formatPoints(state.final.wagers[index] || 0)}</span>
      `;

      const correct = document.createElement("button");
      correct.type = "button";
      correct.className = "final-result-button correct";
      correct.textContent = state.final.results[index] === true ? "✓ Correct" : "Correct";
      correct.addEventListener("click", () => {
        state.final.results[index] = true;
        renderFinalStep();
      });

      const incorrect = document.createElement("button");
      incorrect.type = "button";
      incorrect.className = "final-result-button incorrect";
      incorrect.textContent = state.final.results[index] === false ? "✕ Incorrect" : "Incorrect";
      incorrect.addEventListener("click", () => {
        state.final.results[index] = false;
        renderFinalStep();
      });

      row.append(summary, correct, incorrect);
      grid.appendChild(row);
    });

    el.finalStepContent.appendChild(grid);
    addFinalButton("Back to answer", "secondary-button", () => {
      state.final.step = "answer";
      renderFinalStep();
    });
    const allMarked = state.final.results.every(result => result !== null);
    const finish = addFinalButton("Show final standings", "primary-button", finishGame);
    finish.disabled = !allMarked;
  }

  function addFinalButton(label, className, handler) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.textContent = label;
    button.addEventListener("click", handler);
    el.finalFooter.appendChild(button);
    return button;
  }

  function finishGame() {
    state.teams.forEach((team, index) => {
      const wager = Math.max(0, Number(state.final.wagers[index]) || 0);
      if (state.final.results[index] === true) team.score += wager;
      else team.score -= wager;
    });

    el.finalModal.classList.add("hidden");
    renderResults();
    showScreen("resultsScreen");
    playSound("winner");
    launchConfetti();
    saveGameState(true);
  }

  function renderResults() {
    const ranked = [...state.teams].sort((a, b) => b.score - a.score);
    const topScore = ranked[0]?.score ?? 0;
    const winners = ranked.filter(team => team.score === topScore);
    el.winnerBanner.textContent = winners.length === 1
      ? `${winners[0].name} wins with ${formatScore(winners[0].score)}!`
      : `${winners.map(team => team.name).join(" and ")} tie with ${formatScore(topScore)}!`;

    el.rankings.innerHTML = "";
    ranked.forEach(team => {
      const row = document.createElement("li");
      row.className = "ranking-row";
      row.style.setProperty("--team-colour", team.colour);

      const name = document.createElement("span");
      name.className = "ranking-name";
      name.textContent = team.name;

      const score = document.createElement("span");
      score.className = "ranking-score";
      score.textContent = formatScore(team.score);

      row.append(name, score);
      el.rankings.appendChild(row);
    });
  }

  function launchConfetti() {
    el.confettiLayer.innerHTML = "";
    const colours = state.teams.map(team => team.colour).concat(["#ffc857", "#ffffff", "#20c9e8"]);
    for (let i = 0; i < 90; i += 1) {
      const piece = document.createElement("span");
      piece.className = "confetti-piece";
      piece.style.left = `${Math.random() * 100}%`;
      piece.style.setProperty("--confetti-colour", colours[i % colours.length]);
      piece.style.setProperty("--fall-time", `${2.2 + Math.random() * 2.4}s`);
      piece.style.setProperty("--drift", `${-140 + Math.random() * 280}px`);
      piece.style.setProperty("--rotation", `${Math.random() * 360}deg`);
      piece.style.animationDelay = `${Math.random() * 0.8}s`;
      el.confettiLayer.appendChild(piece);
    }
    window.setTimeout(() => { el.confettiLayer.innerHTML = ""; }, 6000);
  }

  function playAgain() {
    state.teams = state.teams.map(team => ({ ...team, score: 0 }));
    state.usedQuestions = {};
    resetFinalState();
    el.gameQuizTitle.textContent = state.quiz.title;
    renderBoard();
    renderScoreboard();
    showScreen("gameScreen");
    localStorage.removeItem(saveKey(state.selectedQuizRef));
    saveGameState();
  }

  function chooseAnotherQuiz() {
    stopFinalTimer();
    if (state.selectedQuizRef) localStorage.removeItem(saveKey(state.selectedQuizRef));
    state.quiz = null;
    state.selectedQuizRef = "";
    state.selectedQuizPath = "";
    state.selectedQuizSource = "";
    state.quizAssets = {};
    el.quizSelect.value = "";
    el.quizInfo.classList.add("hidden");
    el.importedQuizActions.classList.add("hidden");
    el.continueButton.disabled = true;
    el.restoreGameButton.classList.add("hidden");
    showScreen("quizScreen");
  }

  function resetFinalState() {
    stopFinalTimer();
    state.final = {
      step: "category",
      wagers: [],
      results: [],
      timer: null,
      timerRemaining: 0,
      timerInitial: 0,
      timerRunning: false
    };
  }

  function saveGameState(completed = false) {
    if (!state.quiz || state.teams.length < 2) return;
    const payload = {
      quizId: state.quiz.id,
      quizRef: state.selectedQuizRef,
      quizPath: state.selectedQuizPath,
      quizSource: state.selectedQuizSource,
      teams: state.teams,
      usedQuestions: state.usedQuestions,
      completed,
      finalActive: !el.finalModal.classList.contains("hidden"),
      currentQuestion: state.currentQuestion ? {
        categoryIndex: state.currentQuestion.categoryIndex,
        questionIndex: state.currentQuestion.questionIndex,
        questionResolved: state.questionResolved,
        selectedTeamIndex: state.selectedTeamIndex,
        answerRevealed: !el.answerPanel.classList.contains("hidden"),
        timerRemaining: state.timerRemaining,
        timerInitial: state.timerInitial
      } : null,
      final: {
        step: state.final.step,
        wagers: state.final.wagers,
        results: state.final.results,
        timerRemaining: state.final.timerRemaining,
        timerInitial: state.final.timerInitial
      },
      savedAt: new Date().toISOString()
    };
    localStorage.setItem(saveKey(state.selectedQuizRef), JSON.stringify(payload));
  }

  function restoreSavedGame() {
    if (!state.quiz) return;
    const raw = localStorage.getItem(saveKey(state.selectedQuizRef));
    if (!raw) {
      showToast("No saved game was found.");
      return;
    }

    try {
      const saved = JSON.parse(raw);
      state.teams = saved.teams;
      state.usedQuestions = saved.usedQuestions || {};
      state.final = {
        ...state.final,
        ...(saved.final || {}),
        timer: null,
        timerRunning: false
      };
      el.gameQuizTitle.textContent = state.quiz.title;

      if (saved.completed) {
        renderResults();
        showScreen("resultsScreen");
      } else {
        renderBoard();
        renderScoreboard();
        showScreen("gameScreen");

        if (saved.currentQuestion) {
          const restored = saved.currentQuestion;
          openQuestion(restored.categoryIndex, restored.questionIndex, { silent: true });
          state.selectedTeamIndex = restored.selectedTeamIndex ?? 0;
          state.questionResolved = Boolean(restored.questionResolved);
          state.timerInitial = Number(restored.timerInitial) || state.timerInitial;
          state.timerRemaining = Math.max(0, Number(restored.timerRemaining) || 0);
          updateTimerDisplay();

          if (restored.answerRevealed) {
            el.answerPanel.classList.remove("hidden");
            el.revealAnswerButton.classList.add("hidden");
          }
          if (state.questionResolved) {
            el.noAnswerButton.classList.add("hidden");
            el.returnToBoardButton.classList.remove("hidden");
          }
          renderQuestionScoringControls();
        } else if (saved.finalActive) {
          renderFinalStep();
          el.finalModal.classList.remove("hidden");
        }
      }
      showToast("Saved game restored.");
    } catch (error) {
      console.error(error);
      showToast("The saved game could not be restored.");
    }
  }

  function saveKey(quizRef) {
    return `classroom-jeopardy-v2:${encodeURIComponent(quizRef || "unknown")}`;
  }

  function openImportModal() {
    setImportStatus("", "");
    el.importModal.classList.remove("hidden");
  }

  function closeImportModal() {
    el.importModal.classList.add("hidden");
    el.quizFileInput.value = "";
    el.quizFolderInput.value = "";
  }

  function setImportStatus(message, type = "") {
    el.importStatus.textContent = message;
    el.importStatus.className = `status-message ${type}`;
  }

  async function importSingleQuizFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setImportStatus("Reading and validating quiz…", "");

    try {
      const quiz = JSON.parse(await file.text());
      validateQuiz(quiz);
      const references = collectImageReferences(quiz);
      await storeImportedQuiz({ quiz, assets: {}, filename: file.name });
      const warning = references.length
        ? ` Imported successfully, but ${references.length} referenced image${references.length === 1 ? " was" : "s were"} not included. For image quizzes, extract the GPT package and use “Choose quiz folder”.`
        : "";
      closeImportModal();
      showToast(`Imported “${quiz.title}”.${warning}`);
    } catch (error) {
      console.error(error);
      setImportStatus(`Import failed: ${error.message}`, "error");
    } finally {
      event.target.value = "";
    }
  }

  async function importQuizFolder(event) {
    const files = [...(event.target.files || [])];
    if (!files.length) return;
    setImportStatus("Reading quiz folder and packaging images…", "");

    try {
      const jsonFiles = files.filter(file => {
        const name = file.name.toLowerCase();
        return name.endsWith(".json") && name !== "quiz-list.json" && name !== "quiz-template.json";
      });
      if (!jsonFiles.length) throw new Error("No quiz JSON file was found in that folder.");

      const fileByPath = new Map();
      files.forEach(file => fileByPath.set(normalisePath(file.webkitRelativePath || file.name), file));

      const imported = [];
      const skipped = [];
      for (const jsonFile of jsonFiles) {
        try {
          const quiz = JSON.parse(await jsonFile.text());
          validateQuiz(quiz);
          const jsonPath = normalisePath(jsonFile.webkitRelativePath || jsonFile.name);
          const baseDirectory = jsonPath.includes("/") ? jsonPath.slice(0, jsonPath.lastIndexOf("/") + 1) : "";
          const assets = {};
          const missing = [];

          for (const reference of collectImageReferences(quiz)) {
            if (isSelfContainedImage(reference)) continue;
            const normalisedReference = normalisePath(reference);
            const expectedPath = normalisePath(`${baseDirectory}${normalisedReference}`);
            let assetFile = fileByPath.get(expectedPath);
            if (!assetFile) {
              assetFile = files.find(candidate => {
                const candidatePath = normalisePath(candidate.webkitRelativePath || candidate.name);
                return candidatePath.endsWith(`/${normalisedReference}`) || candidatePath === normalisedReference;
              });
            }
            if (assetFile) assets[normalisedReference] = await readFileAsDataUrl(assetFile);
            else missing.push(reference);
          }

          await storeImportedQuiz({ quiz, assets, filename: jsonFile.name, suppressSelection: true });
          imported.push({ quiz, missing });
        } catch (error) {
          skipped.push(`${jsonFile.name}: ${error.message}`);
        }
      }

      if (!imported.length) throw new Error(skipped.join(" ") || "No valid quiz files were found.");
      const lastQuiz = imported[imported.length - 1].quiz;
      renderQuizOptions(`imported:${lastQuiz.id}`);
      await selectQuiz(`imported:${lastQuiz.id}`);
      closeImportModal();

      const missingCount = imported.reduce((sum, item) => sum + item.missing.length, 0);
      const summary = `${imported.length} quiz${imported.length === 1 ? "" : "zes"} imported${missingCount ? `; ${missingCount} image file${missingCount === 1 ? " was" : "s were"} not found` : " with images included"}.`;
      showToast(summary);
    } catch (error) {
      console.error(error);
      setImportStatus(`Import failed: ${error.message}`, "error");
    } finally {
      event.target.value = "";
    }
  }

  async function storeImportedQuiz({ quiz, assets, filename, suppressSelection = false }) {
    const existing = state.importedQuizzes.find(item => item.id === quiz.id);
    if (existing && !window.confirm(`An imported quiz with the ID “${quiz.id}” already exists. Replace it?`)) {
      throw new Error("Import cancelled because the quiz ID already exists.");
    }

    const record = {
      id: String(quiz.id),
      title: String(quiz.title),
      filename: filename || `${quiz.id}.json`,
      importedAt: new Date().toISOString(),
      quiz: cloneData(quiz),
      assets: assets || {}
    };
    await databasePut(record);
    const index = state.importedQuizzes.findIndex(item => item.id === record.id);
    if (index >= 0) state.importedQuizzes[index] = record;
    else state.importedQuizzes.push(record);

    if (!suppressSelection) {
      const ref = `imported:${record.id}`;
      renderQuizOptions(ref);
      await selectQuiz(ref);
    }
  }

  async function removeSelectedImportedQuiz() {
    if (state.selectedQuizSource !== "imported" || !state.selectedQuizRef) return;
    const id = state.selectedQuizRef.slice("imported:".length);
    const record = state.importedQuizzes.find(item => item.id === id);
    if (!record) return;
    if (!window.confirm(`Remove “${record.title}” from this browser?`)) return;

    await databaseDelete(id);
    localStorage.removeItem(saveKey(state.selectedQuizRef));
    state.importedQuizzes = state.importedQuizzes.filter(item => item.id !== id);
    state.quiz = null;
    state.selectedQuizRef = "";
    state.selectedQuizSource = "";
    state.quizAssets = {};
    renderQuizOptions();
    el.quizInfo.classList.add("hidden");
    el.importedQuizActions.classList.add("hidden");
    el.continueButton.disabled = true;
    el.restoreGameButton.classList.add("hidden");
    setQuizMessage("Imported quiz removed from this browser.", "success");
  }

  async function clearImportedQuizzes() {
    if (!state.importedQuizzes.length) return;
    if (!window.confirm(`Remove all ${state.importedQuizzes.length} imported quizzes from this browser?`)) return;
    state.importedQuizzes.forEach(record => localStorage.removeItem(saveKey(`imported:${record.id}`)));
    await databaseClear();
    const selectedWasImported = state.selectedQuizSource === "imported";
    state.importedQuizzes = [];
    if (selectedWasImported) {
      state.quiz = null;
      state.selectedQuizRef = "";
      state.selectedQuizSource = "";
      state.quizAssets = {};
      el.quizInfo.classList.add("hidden");
      el.continueButton.disabled = true;
      el.restoreGameButton.classList.add("hidden");
    }
    el.importedQuizActions.classList.add("hidden");
    renderQuizOptions();
    setQuizMessage("All imported quizzes were removed from this browser.", "success");
  }

  async function loadImportedLibrary() {
    try {
      quizDatabase = await openDatabase();
      state.importedQuizzes = await databaseGetAll();
    } catch (error) {
      console.error(error);
      state.importedQuizzes = [];
      showToast("Browser storage is unavailable; imported quizzes may not persist.");
    }
  }

  function openDatabase() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) {
        reject(new Error("IndexedDB is not supported by this browser."));
        return;
      }
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(IMPORTED_QUIZ_STORE)) {
          database.createObjectStore(IMPORTED_QUIZ_STORE, { keyPath: "id" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Could not open browser quiz storage."));
    });
  }

  function databaseGetAll() {
    return databaseRequest("readonly", store => store.getAll());
  }

  function databasePut(record) {
    return databaseRequest("readwrite", store => store.put(record));
  }

  function databaseDelete(id) {
    return databaseRequest("readwrite", store => store.delete(id));
  }

  function databaseClear() {
    return databaseRequest("readwrite", store => store.clear());
  }

  function databaseRequest(mode, operation) {
    return new Promise((resolve, reject) => {
      if (!quizDatabase) {
        reject(new Error("Browser quiz storage is not available."));
        return;
      }
      const transaction = quizDatabase.transaction(IMPORTED_QUIZ_STORE, mode);
      const request = operation(transaction.objectStore(IMPORTED_QUIZ_STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Browser storage operation failed."));
      transaction.onerror = () => reject(transaction.error || new Error("Browser storage transaction failed."));
    });
  }

  function collectImageReferences(quiz) {
    const references = new Set();
    quiz.categories.forEach(category => category.questions.forEach(question => {
      if (question.image) references.add(String(question.image));
    }));
    if (quiz.finalRound?.image) references.add(String(quiz.finalRound.image));
    return [...references];
  }

  function resolveImageSource(reference) {
    if (!reference) return "";
    const value = String(reference);
    if (isSelfContainedImage(value)) return value;
    const normalised = normalisePath(value);
    if (state.selectedQuizSource === "imported") {
      return state.quizAssets[normalised] || state.quizAssets[value] || "";
    }
    return `quizzes/${normalised}`;
  }

  function isSelfContainedImage(reference) {
    return /^(data:|blob:|https?:\/\/)/i.test(String(reference));
  }

  function normalisePath(value) {
    const parts = String(value).replaceAll("\\", "/").split("/");
    const output = [];
    parts.forEach(part => {
      if (!part || part === ".") return;
      if (part === "..") output.pop();
      else output.push(part);
    });
    return output.join("/");
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error || new Error(`Could not read ${file.name}.`));
      reader.readAsDataURL(file);
    });
  }

  function cloneData(value) {
    return typeof structuredClone === "function"
      ? structuredClone(value)
      : JSON.parse(JSON.stringify(value));
  }

  function toggleMute() {
    state.muted = !state.muted;
    el.muteButton.setAttribute("aria-pressed", state.muted ? "true" : "false");
    el.muteButton.querySelector("span[aria-hidden='true']").textContent = state.muted ? "🔇" : "🔊";
    el.muteButton.title = state.muted ? "Unmute sounds" : "Mute all sounds";
    if (!state.muted) playSound("tick");
  }

  function ensureAudioContext() {
    if (!audioContext) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) audioContext = new AudioCtx();
    }
    if (audioContext?.state === "suspended") audioContext.resume();
  }

  function playSound(type) {
    if (state.muted) return;
    ensureAudioContext();
    if (!audioContext) return;

    const sounds = {
      open: [[440, 0.08, 0], [660, 0.12, 0.07]],
      reveal: [[523, 0.08, 0], [784, 0.13, 0.08]],
      correct: [[523, 0.08, 0], [659, 0.08, 0.08], [784, 0.18, 0.16]],
      incorrect: [[220, 0.13, 0], [165, 0.24, 0.11]],
      tick: [[880, 0.05, 0]],
      time: [[170, 0.22, 0], [120, 0.35, 0.2]],
      start: [[392, 0.08, 0], [523, 0.09, 0.08], [659, 0.16, 0.17]],
      final: [[294, 0.12, 0], [392, 0.12, 0.1], [587, 0.22, 0.2]],
      winner: [[523, 0.1, 0], [659, 0.1, 0.1], [784, 0.1, 0.2], [1047, 0.35, 0.3]],
      close: [[300, 0.09, 0]],
      music: [[261, 0.08, 0], [329, 0.08, 0.09], [392, 0.12, 0.18]]
    };

    (sounds[type] || sounds.tick).forEach(([frequency, duration, delay]) => {
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.type = type === "incorrect" || type === "time" ? "sawtooth" : "sine";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, audioContext.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(0.12, audioContext.currentTime + delay + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + delay + duration);
      oscillator.connect(gain).connect(audioContext.destination);
      oscillator.start(audioContext.currentTime + delay);
      oscillator.stop(audioContext.currentTime + delay + duration + 0.03);
    });
  }

  function showScreen(screenId) {
    document.querySelectorAll(".screen").forEach(screen => screen.classList.remove("active"));
    el[screenId].classList.add("active");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function showToast(message) {
    el.toast.textContent = message;
    el.toast.classList.remove("hidden");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.toast.classList.add("hidden"), 2600);
  }

  function questionKey(categoryIndex, questionIndex) {
    return `${categoryIndex}:${questionIndex}`;
  }

  function formatPoints(value) {
    return Number(value).toLocaleString("en-AU");
  }

  function formatScore(value) {
    const number = Number(value);
    return number < 0
      ? `−${Math.abs(number).toLocaleString("en-AU")}`
      : number.toLocaleString("en-AU");
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }
})();
