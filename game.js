(() => {
  "use strict";

  const BASE_RULES = {
    general: [
      "The team in control chooses a category and value. Control may be awarded by result, randomised each question, or rotated in team order depending on the selected game option.",
      "All teams solve every question on their whiteboards.",
      "Keep boards down while solving. When the host calls “Pens down — boards up”, all teams reveal together.",
      "Do not change or erase an answer until the host says “Clear”.",
      "The team in control is judged first. If it is incorrect, the question goes to a rebound. The answer stays hidden unless the host chooses to reveal it."
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

  // Keep the Version 2 IndexedDB name so previously imported quizzes remain available after upgrading.
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
    questionResolved: false,
    questionPhase: "first",
    reboundCorrectTeamIndices: [],
    reboundResponses: {},
    controlTeamIndex: 0,
    scoreEditTeamIndex: null,
    gameRules: {
      incorrectFirstDeduction: false,
      reboundMode: "single",
      fixedBonus: 100,
      startingControl: "random",
      controlMode: "rotation"
    },
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
    renderTeamSetup(2);
    updateFixedBonusVisibility();
    renderDefaultRules();
    await loadImportedLibrary();
    await loadManifest();
    showScreen("quizScreen");
  }

  function cacheElements() {
    [
      "quizScreen", "teamScreen", "gameScreen", "resultsScreen",
      "quizSelect", "reloadQuizzesButton", "quizLoadMessage", "quizInfo",
      "quizTitle", "quizDescription", "quizCourse", "quizLevel", "quizAuthor",
      "quizDuration", "categoryPreview", "continueButton", "restoreGameButton", "quizAnswerKeyButton",
      "quizSourceBadge", "importQuizButton", "importModal", "chooseJsonButton",
      "chooseFolderButton", "quizFileInput", "quizFolderInput", "importStatus",
      "importedQuizActions", "removeImportedQuizButton", "clearImportedQuizzesButton",
      "teamSetupList", "removeTeamButton", "addTeamButton", "topRemoveTeamButton", "topAddTeamButton", "teamAnswerKeyButton", "backToQuizButton",
      "startGameButton", "startingTeamSelect", "fixedBonusRow", "fixedBonusInput",
      "gameQuizTitle", "board", "scoreboard", "finalRoundButton", "controlTeamSelect",
      "randomControlButton", "rulesButton", "muteButton", "homeButton", "rulesModal", "answerKeyModal", "answerKeyTitle", "answerKeyMeta", "answerKeyContent", "printAnswerKeyButton",
      "rulesContent", "questionModal", "questionCategory", "questionValue", "questionImage",
      "questionPrompt", "answerPanel", "questionAnswer", "revealAnswerButton",
      "returnToBoardButton", "firstAnswerTeam", "firstAttemptPanel", "firstAttemptTeamName",
      "firstCorrectButton", "firstIncorrectButton", "reboundPanel", "reboundTeamGrid",
      "reboundRuleSummary", "selectReboundWinnerButton", "noCorrectReboundButton",
      "questionOutcome", "timerDisplay", "timerControls", "timerStartButton",
      "timerPauseButton", "timerResetButton", "scoreEditModal", "scoreEditTeamName",
      "scoreEditInput", "saveScoreEditButton", "finalModal", "finalStepContent",
      "finalFooter", "winnerBanner", "rankings", "playAgainButton", "chooseAnotherButton",
      "confettiLayer", "toast"
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
    el.quizAnswerKeyButton.addEventListener("click", openAnswerKey);
    el.teamAnswerKeyButton.addEventListener("click", openAnswerKey);
    el.printAnswerKeyButton.addEventListener("click", () => window.print());
    document.querySelectorAll("[data-close-modal='answer-key']").forEach(button => {
      button.addEventListener("click", closeAnswerKey);
    });
    el.restoreGameButton.addEventListener("click", restoreSavedGame);
    el.backToQuizButton.addEventListener("click", () => showScreen("quizScreen"));
    const addTeam = () => renderTeamSetup(getSetupTeamCount() + 1, readTeamSetup());
    const removeTeam = () => renderTeamSetup(getSetupTeamCount() - 1, readTeamSetup());
    el.addTeamButton.addEventListener("click", addTeam);
    el.topAddTeamButton.addEventListener("click", addTeam);
    el.removeTeamButton.addEventListener("click", removeTeam);
    el.topRemoveTeamButton.addEventListener("click", removeTeam);
    el.startGameButton.addEventListener("click", startNewGame);

    document.querySelectorAll("input[name='reboundScoring']").forEach(input => {
      input.addEventListener("change", updateFixedBonusVisibility);
    });

    el.controlTeamSelect.addEventListener("change", () => {
      setControlTeam(Number(el.controlTeamSelect.value), { announce: true });
    });
    el.randomControlButton.addEventListener("click", () => {
      if (!state.teams.length) return;
      setControlTeam(randomIndex(state.teams.length), { announce: true });
    });

    el.rulesButton.addEventListener("click", openRules);
    el.homeButton.addEventListener("click", () => {
      stopTimer();
      stopFinalTimer();
      closeQuestionModal();
      closeScoreEditModal();
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
    el.returnToBoardButton.addEventListener("click", returnToBoard);
    el.firstCorrectButton.addEventListener("click", resolveFirstAttemptCorrect);
    el.firstIncorrectButton.addEventListener("click", beginRebound);
    el.selectReboundWinnerButton.addEventListener("click", resolveRebound);
    el.noCorrectReboundButton.addEventListener("click", resolveNoRebound);
    el.timerStartButton.addEventListener("click", startTimer);
    el.timerPauseButton.addEventListener("click", pauseTimer);
    el.timerResetButton.addEventListener("click", resetTimer);

    document.querySelectorAll("[data-close-modal='score-edit']").forEach(button => {
      button.addEventListener("click", closeScoreEditModal);
    });
    document.querySelectorAll("[data-score-adjust]").forEach(button => {
      button.addEventListener("click", () => adjustScoreEdit(Number(button.dataset.scoreAdjust)));
    });
    el.saveScoreEditButton.addEventListener("click", saveScoreEdit);

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
    el.quizAnswerKeyButton.disabled = true;
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
    el.quizAnswerKeyButton.disabled = true;
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
      el.quizAnswerKeyButton.disabled = false;
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
      name.addEventListener("input", updateStartingTeamOptions);

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
    el.topRemoveTeamButton.disabled = safeCount <= 2;
    el.addTeamButton.disabled = safeCount >= 8;
    el.topAddTeamButton.disabled = safeCount >= 8;
    updateStartingTeamOptions();
  }

  function updateStartingTeamOptions() {
    if (!el.startingTeamSelect) return;
    const previous = el.startingTeamSelect.value || "random";
    const teams = readTeamSetup();
    el.startingTeamSelect.innerHTML = "";

    const randomOption = document.createElement("option");
    randomOption.value = "random";
    randomOption.textContent = "Random team (recommended)";
    el.startingTeamSelect.appendChild(randomOption);

    teams.forEach((team, index) => {
      const option = document.createElement("option");
      option.value = String(index);
      option.textContent = team.name;
      el.startingTeamSelect.appendChild(option);
    });

    el.startingTeamSelect.value = [...el.startingTeamSelect.options].some(option => option.value === previous)
      ? previous
      : "random";
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

  function readGameRulesFromSetup() {
    const incorrectScoring = document.querySelector("input[name='incorrectScoring']:checked")?.value || "none";
    const reboundMode = document.querySelector("input[name='reboundScoring']:checked")?.value || "single";
    const fixedBonus = Math.max(0, Math.floor(Number(el.fixedBonusInput.value) || 0));
    const startingControl = el.startingTeamSelect.value || "random";
    const controlMode = document.querySelector("input[name='controlMode']:checked")?.value || "winner";

    return {
      incorrectFirstDeduction: incorrectScoring === "deduct",
      reboundMode,
      fixedBonus,
      startingControl,
      controlMode
    };
  }

  function updateFixedBonusVisibility() {
    if (!el.fixedBonusRow) return;
    const mode = document.querySelector("input[name='reboundScoring']:checked")?.value || "single";
    el.fixedBonusRow.classList.toggle("hidden", mode !== "fixed");
  }

  function startNewGame() {
    if (!state.quiz) {
      showToast("Choose a quiz first.");
      showScreen("quizScreen");
      return;
    }

    state.teams = readTeamSetup().map(team => ({ ...team, score: 0 }));
    state.gameRules = readGameRulesFromSetup();
    state.controlTeamIndex = state.gameRules.startingControl === "random"
      ? randomIndex(state.teams.length)
      : Math.max(0, Math.min(state.teams.length - 1, Number(state.gameRules.startingControl) || 0));
    state.usedQuestions = {};
    state.currentQuestion = null;
    state.questionResolved = false;
    state.questionPhase = "first";
    state.reboundCorrectTeamIndices = [];
    state.reboundResponses = {};
    resetFinalState();
    localStorage.removeItem(saveKey(state.selectedQuizRef));

    el.gameQuizTitle.textContent = state.quiz.title;
    renderControlToolbar();
    renderBoard();
    renderScoreboard();
    showScreen("gameScreen");
    playSound("start");
    showToast(`${state.teams[state.controlTeamIndex].name} starts in control.`);
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

  function renderControlToolbar() {
    if (!el.controlTeamSelect) return;
    el.controlTeamSelect.innerHTML = "";
    state.teams.forEach((team, index) => {
      const option = document.createElement("option");
      option.value = String(index);
      option.textContent = team.name;
      el.controlTeamSelect.appendChild(option);
    });
    if (state.teams.length) {
      state.controlTeamIndex = Math.max(0, Math.min(state.teams.length - 1, Number(state.controlTeamIndex) || 0));
      el.controlTeamSelect.value = String(state.controlTeamIndex);
    }
  }

  function setControlTeam(teamIndex, options = {}) {
    if (!state.teams.length) return;
    const safeIndex = Math.max(0, Math.min(state.teams.length - 1, Number(teamIndex) || 0));
    state.controlTeamIndex = safeIndex;
    renderControlToolbar();
    renderScoreboard();
    if (options.announce) {
      showToast(`${state.teams[safeIndex].name} is now in control.`);
      playSound("control");
    }
    saveGameState();
  }

  function chooseNextControl(previousControlIndex, reboundWinnerIndex = null) {
    if (!state.teams.length) return 0;
    const previous = Math.max(0, Math.min(state.teams.length - 1, Number(previousControlIndex) || 0));
    const mode = state.gameRules.controlMode || "winner";

    if (mode === "random") {
      return randomIndex(state.teams.length);
    }

    if (mode === "rotation") {
      return (previous + 1) % state.teams.length;
    }

    if (Number.isInteger(reboundWinnerIndex) && state.teams[reboundWinnerIndex]) {
      return reboundWinnerIndex;
    }

    return previous;
  }

  function controlResolutionText(previousControlIndex, nextControlIndex, reboundWinnerIndex = null) {
    const mode = state.gameRules.controlMode || "winner";
    const nextTeam = state.teams[nextControlIndex];
    if (!nextTeam) return "";

    if (mode === "random") {
      return `Random control: ${nextTeam.name} chooses next.`;
    }

    if (mode === "rotation") {
      return `Turn order: ${nextTeam.name} chooses next.`;
    }

    if (Number.isInteger(reboundWinnerIndex) && reboundWinnerIndex !== previousControlIndex) {
      return `${nextTeam.name} takes control.`;
    }

    return `${nextTeam.name} keeps control.`;
  }

  function controlModeLabel(mode) {
    const labels = {
      winner: "Correct team controls next",
      random: "Random control each question",
      rotation: "Take turns in team order"
    };
    return labels[mode] || labels.winner;
  }

  function randomIndex(length) {
    return Math.floor(Math.random() * Math.max(1, length));
  }

  function renderScoreboard(flashIndex = null, positive = true) {
    el.scoreboard.innerHTML = "";
    el.scoreboard.style.setProperty("--team-count", state.teams.length);

    state.teams.forEach((team, index) => {
      const panel = document.createElement("div");
      panel.className = `score-panel${index === state.controlTeamIndex ? " in-control" : ""}`;
      panel.style.setProperty("--team-colour", team.colour);
      panel.dataset.teamIndex = index;

      if (index === flashIndex) {
        panel.classList.add(positive ? "score-flash-positive" : "score-flash-negative");
      }

      const control = document.createElement("span");
      control.className = "score-control-badge";
      control.textContent = index === state.controlTeamIndex ? "★ CONTROL" : "";

      const name = document.createElement("span");
      name.className = "score-team-name";
      name.textContent = team.name;

      const score = document.createElement("span");
      score.className = "score-value";
      score.textContent = formatScore(team.score);

      const edit = document.createElement("button");
      edit.type = "button";
      edit.className = "score-edit-button";
      edit.textContent = "Edit";
      edit.title = `Edit ${team.name} score`;
      edit.setAttribute("aria-label", `Edit ${team.name} score`);
      edit.addEventListener("click", () => openScoreEdit(index));

      panel.append(control, name, score, edit);
      el.scoreboard.appendChild(panel);
    });
  }

  function openScoreEdit(teamIndex) {
    if (!state.teams[teamIndex]) return;
    state.scoreEditTeamIndex = teamIndex;
    const team = state.teams[teamIndex];
    el.scoreEditTeamName.textContent = `${team.name} — current score ${formatScore(team.score)}`;
    el.scoreEditInput.value = String(team.score);
    el.scoreEditModal.classList.remove("hidden");
    window.setTimeout(() => {
      el.scoreEditInput.focus();
      el.scoreEditInput.select();
    }, 0);
  }

  function closeScoreEditModal() {
    if (!el.scoreEditModal) return;
    el.scoreEditModal.classList.add("hidden");
    state.scoreEditTeamIndex = null;
  }

  function adjustScoreEdit(amount) {
    const current = Number(el.scoreEditInput.value) || 0;
    el.scoreEditInput.value = String(current + amount);
  }

  function saveScoreEdit() {
    const teamIndex = state.scoreEditTeamIndex;
    if (teamIndex === null || !state.teams[teamIndex]) return;
    const nextScore = Math.round(Number(el.scoreEditInput.value));
    if (!Number.isFinite(nextScore)) {
      showToast("Enter a valid score.");
      return;
    }

    const team = state.teams[teamIndex];
    const previous = team.score;
    team.score = nextScore;
    closeScoreEditModal();
    renderScoreboard(teamIndex, nextScore >= previous);
    showToast(`${team.name}: ${formatScore(previous)} → ${formatScore(nextScore)}.`);
    saveGameState();
  }

  function openQuestion(categoryIndex, questionIndex, options = {}) {
    const category = state.quiz.categories[categoryIndex];
    const question = category.questions[questionIndex];
    state.currentQuestion = { categoryIndex, questionIndex, category, question };
    state.questionResolved = false;
    state.questionPhase = options.phase || "first";
    state.reboundCorrectTeamIndices = Array.isArray(options.reboundCorrectTeamIndices)
      ? [...options.reboundCorrectTeamIndices]
      : [];
    state.reboundResponses = options.reboundResponses && typeof options.reboundResponses === "object"
      ? { ...options.reboundResponses }
      : Object.fromEntries(state.reboundCorrectTeamIndices.map(index => [String(index), "correct"]));

    const controlTeam = state.teams[state.controlTeamIndex];
    el.questionCategory.textContent = category.name;
    el.questionValue.textContent = formatPoints(question.value);
    el.questionPrompt.textContent = question.prompt;
    el.questionAnswer.textContent = question.answer;
    el.firstAnswerTeam.textContent = controlTeam?.name || "—";
    el.firstAttemptTeamName.textContent = controlTeam?.name || "—";
    el.answerPanel.classList.add("hidden");
    el.revealAnswerButton.classList.remove("hidden");
    el.returnToBoardButton.classList.add("hidden");
    el.questionOutcome.classList.add("hidden");
    el.questionOutcome.textContent = "";
    el.firstAttemptPanel.classList.remove("hidden");
    el.reboundPanel.classList.add("hidden");

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

    setupTimer(Number(question.timerSeconds ?? state.quiz.settings?.questionTimerSeconds ?? 0));
    if (state.questionPhase === "rebound") {
      el.firstAttemptPanel.classList.add("hidden");
      el.reboundPanel.classList.remove("hidden");
      renderReboundPanel();
    }
    el.questionModal.classList.remove("hidden");
    if (!options.silent) playSound("open");
    saveGameState();
  }

  function resolveFirstAttemptCorrect() {
    if (!state.currentQuestion || state.questionResolved || state.questionPhase !== "first") return;
    const value = Number(state.currentQuestion.question.value);
    const previousControlIndex = state.controlTeamIndex;
    const team = state.teams[previousControlIndex];
    team.score += value;

    markCurrentQuestion(team.colour, team.name);
    revealAnswer();
    stopTimer();
    const nextControlIndex = chooseNextControl(previousControlIndex, previousControlIndex);
    state.controlTeamIndex = nextControlIndex;
    state.questionResolved = true;
    state.questionPhase = "resolved";
    el.firstAttemptPanel.classList.add("hidden");
    el.reboundPanel.classList.add("hidden");
    el.returnToBoardButton.classList.remove("hidden");
    const controlText = controlResolutionText(previousControlIndex, nextControlIndex, previousControlIndex);
    showQuestionOutcome(`${team.name} is correct: +${formatPoints(value)}. ${controlText}`, "success");
    renderControlToolbar();
    renderScoreboard(previousControlIndex, true);
    playSound("correct");
    saveGameState();
  }

  function beginRebound() {
    if (!state.currentQuestion || state.questionResolved || state.questionPhase !== "first") return;
    const value = Number(state.currentQuestion.question.value);
    const controlTeam = state.teams[state.controlTeamIndex];

    if (state.gameRules.incorrectFirstDeduction) {
      controlTeam.score -= value;
      renderScoreboard(state.controlTeamIndex, false);
      showToast(`${controlTeam.name} loses ${formatPoints(value)}. Rebound open.`);
    } else {
      renderScoreboard();
      showToast(`${controlTeam.name} is incorrect. No deduction; rebound open.`);
    }

    state.questionPhase = "rebound";
    state.reboundCorrectTeamIndices = [];
    state.reboundResponses = {};
    resetTimer();
    // Give the rebound a fresh full timer, paused and ready for the host to start.
    // Keep the answer hidden on an incorrect first response. The host may reveal it manually.
    el.firstAttemptPanel.classList.add("hidden");
    el.reboundPanel.classList.remove("hidden");
    renderReboundPanel();
    playSound("incorrect");
    saveGameState();
  }

  function renderReboundPanel() {
    el.reboundTeamGrid.innerHTML = "";
    const controlIndex = state.controlTeamIndex;

    state.teams.forEach((team, index) => {
      if (index === controlIndex) return;
      const response = state.reboundResponses[String(index)] || "unanswered";
      const card = document.createElement("div");
      card.className = `rebound-team-response response-${response}`;
      card.style.setProperty("--team-colour", team.colour);

      const name = document.createElement("strong");
      name.className = "rebound-response-team-name";
      name.textContent = team.name;

      const choices = document.createElement("div");
      choices.className = "rebound-response-choices";
      [
        ["correct", "✓", "Correct"],
        ["incorrect", "✕", "Incorrect"]
      ].forEach(([value, symbol, label]) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = `rebound-response-button ${value}${response === value ? " active" : ""}`;
        button.textContent = symbol;
        button.title = `${team.name}: ${label}`;
        button.setAttribute("aria-label", `${team.name}: ${label}. Click again to clear.`);
        button.setAttribute("aria-pressed", response === value ? "true" : "false");
        button.addEventListener("click", () => {
          setReboundResponse(index, response === value ? "unanswered" : value);
        });
        choices.appendChild(button);
      });

      card.append(name, choices);
      el.reboundTeamGrid.appendChild(card);
    });

    const correctTeams = reboundTeamIndices("correct");
    const incorrectTeams = reboundTeamIndices("incorrect");
    const count = correctTeams.length;
    state.reboundCorrectTeamIndices = [...correctTeams];
    el.selectReboundWinnerButton.disabled = count === 0;
    const needsSingleScoringWinner = state.gameRules.reboundMode === "single";
    const needsControlWinner = (state.gameRules.controlMode || "winner") === "winner";
    el.selectReboundWinnerButton.textContent = count > 0
      ? (needsSingleScoringWinner || needsControlWinner
          ? `Resolve rebound · random from ${count} correct`
          : `Resolve rebound · ${count} correct`)
      : "Resolve rebound";
    el.noCorrectReboundButton.disabled = count > 0;
    el.noCorrectReboundButton.textContent = incorrectTeams.length
      ? `No correct rebound (${incorrectTeams.length} marked incorrect)`
      : "No correct rebound";
    el.reboundRuleSummary.textContent = `${reboundModeLabel(state.gameRules.reboundMode)} · ${controlModeLabel(state.gameRules.controlMode || "winner")}`;
  }

  function setReboundResponse(teamIndex, response) {
    if (!state.teams[teamIndex] || teamIndex === state.controlTeamIndex) return;
    if (!["unanswered", "correct", "incorrect"].includes(response)) return;
    if (response === "unanswered") {
      delete state.reboundResponses[String(teamIndex)];
    } else {
      state.reboundResponses[String(teamIndex)] = response;
    }
    state.reboundCorrectTeamIndices = reboundTeamIndices("correct");
    renderReboundPanel();
    saveGameState();
  }

  function reboundTeamIndices(response) {
    return state.teams
      .map((_, index) => index)
      .filter(index => index !== state.controlTeamIndex && state.reboundResponses[String(index)] === response);
  }

  function applyReboundDeductions(value) {
    if (!state.gameRules.incorrectFirstDeduction) return [];
    const deductions = [];
    reboundTeamIndices("incorrect").forEach(index => {
      state.teams[index].score -= value;
      deductions.push(`${state.teams[index].name} −${formatPoints(value)}`);
    });
    return deductions;
  }

  function resolveRebound() {
    if (!state.currentQuestion || state.questionResolved || state.questionPhase !== "rebound") return;
    const correctTeams = reboundTeamIndices("correct");
    if (!correctTeams.length) return;

    const value = Number(state.currentQuestion.question.value);
    const winnerIndex = correctTeams[randomIndex(correctTeams.length)];
    const winner = state.teams[winnerIndex];
    const mode = state.gameRules.reboundMode;
    const scoringNotes = [];
    const deductionNotes = applyReboundDeductions(value);

    if (mode === "single") {
      winner.score += value;
      scoringNotes.push(`${winner.name} +${formatPoints(value)}`);
    } else if (mode === "all-full") {
      correctTeams.forEach(index => {
        state.teams[index].score += value;
        scoringNotes.push(`${state.teams[index].name} +${formatPoints(value)}`);
      });
    } else if (mode === "shared") {
      const share = Math.floor(value / correctTeams.length);
      const remainder = value - share * correctTeams.length;
      correctTeams.forEach(index => {
        const bonus = share + (index === winnerIndex ? remainder : 0);
        state.teams[index].score += bonus;
        scoringNotes.push(`${state.teams[index].name} +${formatPoints(bonus)}`);
      });
    } else if (mode === "fixed") {
      const bonus = Math.max(0, Math.floor(Number(state.gameRules.fixedBonus) || 0));
      correctTeams.forEach(index => {
        state.teams[index].score += bonus;
        scoringNotes.push(`${state.teams[index].name} +${formatPoints(bonus)}`);
      });
    }

    const previousControlIndex = state.controlTeamIndex;
    const nextControlIndex = chooseNextControl(previousControlIndex, winnerIndex);
    state.controlTeamIndex = nextControlIndex;
    state.questionResolved = true;
    state.questionPhase = "resolved";
    markCurrentQuestion(winner.colour, winner.name);
    stopTimer();
    renderControlToolbar();
    renderScoreboard(winnerIndex, true);
    el.reboundPanel.classList.add("hidden");
    el.returnToBoardButton.classList.remove("hidden");

    const scoreText = scoringNotes.length ? ` ${scoringNotes.join(" · ")}.` : "";
    const deductionText = deductionNotes.length ? ` Deductions: ${deductionNotes.join(" · ")}.` : "";
    const controlText = controlResolutionText(previousControlIndex, nextControlIndex, winnerIndex);
    const reboundLead = mode === "single"
      ? `${winner.name} wins the rebound.`
      : (state.gameRules.controlMode || "winner") === "winner"
        ? `Rebound resolved; ${winner.name} is selected from the correct teams for control.`
        : "Rebound resolved.";
    showQuestionOutcome(`${reboundLead}${scoreText}${deductionText} ${controlText}`, "success");
    playSound("rebound");
    saveGameState();
  }

  function resolveNoRebound() {
    if (!state.currentQuestion || state.questionResolved || state.questionPhase !== "rebound") return;
    if (reboundTeamIndices("correct").length) {
      showToast("At least one rebound team is marked correct. Select the rebound winner instead.");
      return;
    }
    const previousControlIndex = state.controlTeamIndex;
    const controlTeam = state.teams[previousControlIndex];
    const value = Number(state.currentQuestion.question.value);
    const deductionNotes = applyReboundDeductions(value);
    const nextControlIndex = chooseNextControl(previousControlIndex, null);
    state.controlTeamIndex = nextControlIndex;
    state.questionResolved = true;
    state.questionPhase = "resolved";
    markCurrentQuestion("#8191a3", "No correct rebound");
    stopTimer();
    el.reboundPanel.classList.add("hidden");
    el.returnToBoardButton.classList.remove("hidden");
    renderControlToolbar();
    renderScoreboard();
    const deductionText = deductionNotes.length ? ` Deductions: ${deductionNotes.join(" · ")}.` : "";
    const controlText = controlResolutionText(previousControlIndex, nextControlIndex, null);
    showQuestionOutcome(`No correct rebound.${deductionText} ${controlText}`, "neutral");
    playSound("close");
    saveGameState();
  }

  function reboundModeLabel(mode) {
    const labels = {
      single: "One winner: full clue value",
      "all-full": "All correct: full clue value",
      shared: "Correct teams share clue value",
      fixed: `All correct: +${formatPoints(state.gameRules.fixedBonus)}`
    };
    return labels[mode] || labels.single;
  }

  function showQuestionOutcome(message, tone = "neutral") {
    el.questionOutcome.textContent = message;
    el.questionOutcome.className = `question-outcome ${tone}`;
  }

  function markCurrentQuestion(colour, teamName) {
    const { categoryIndex, questionIndex } = state.currentQuestion;
    state.usedQuestions[questionKey(categoryIndex, questionIndex)] = { colour, teamName };
  }

  function revealAnswer() {
    if (!el.answerPanel.classList.contains("hidden")) return;
    el.answerPanel.classList.remove("hidden");
    el.revealAnswerButton.classList.add("hidden");
    playSound("reveal");
  }

  function returnToBoard() {
    closeQuestionModal();
    renderControlToolbar();
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
    state.questionPhase = "first";
    state.reboundCorrectTeamIndices = [];
    state.reboundResponses = {};
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
    if (el.teamScreen.classList.contains("active")) {
      state.gameRules = readGameRulesFromSetup();
    }
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

  function currentDefaultRules() {
    const deductionRule = state.gameRules.incorrectFirstDeduction
      ? "If the team in control is incorrect, the clue value is deducted before the rebound. During the rebound, only teams explicitly marked ✕ Incorrect lose the clue value; an unselected board is treated as No Answer and is not penalised."
      : "If the team in control is incorrect, no points are deducted; the question moves to a rebound.";

    const reboundRule = {
      single: "On a rebound, the host marks boards with ✓ Correct or ✕ Incorrect; leaving both unselected means No Answer. One correct team is selected at random to receive the full clue value.",
      "all-full": "On a rebound, every team marked ✓ Correct receives the full clue value.",
      shared: "On a rebound, teams marked ✓ Correct share the clue value; a randomly selected correct team receives any indivisible remainder.",
      fixed: `On a rebound, every team marked ✓ Correct receives a fixed ${formatPoints(state.gameRules.fixedBonus)}-point bonus.`
    }[state.gameRules.reboundMode] || "On a rebound, one correct team is selected at random for the clue value.";

    const controlRule = {
      winner: "Control after each question follows the result: a correct control team keeps control; on a successful rebound, the selected rebound winner takes control; with no correct rebound, the original team keeps control.",
      random: "After every resolved question, control is randomly assigned to any team. The same team may occasionally be selected again.",
      rotation: "After every resolved question, control moves to the next team in setup order and wraps around after the final team."
    }[state.gameRules.controlMode || "winner"];

    return {
      general: [...BASE_RULES.general],
      scoring: [
        "A correct first response earns the full clue value.",
        deductionRule,
        reboundRule,
        controlRule,
        "The starting-control dropdown determines who chooses the first question only.",
        "The host can manually assign control at any time from the Assign control dropdown above the board.",
        "The rebound receives a fresh full question timer, paused and ready for the host to start.",
        "The host can manually edit any team score from the scoreboard if a scoring mistake needs correcting."
      ],
      final: [...BASE_RULES.final]
    };
  }

  function mergedRules() {
    const quizRules = state.quiz?.rules || {};
    const mode = quizRules.mode || "append";
    const defaults = currentDefaultRules();
    const result = {};

    ["general", "scoring", "final"].forEach(section => {
      const custom = Array.isArray(quizRules[section]) ? quizRules[section] : [];
      result[section] = mode === "replace" && custom.length
        ? custom
        : [...defaults[section], ...custom];
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
    state.currentQuestion = null;
    state.questionResolved = false;
    state.questionPhase = "first";
    state.reboundCorrectTeamIndices = [];
    state.reboundResponses = {};
    state.controlTeamIndex = state.gameRules.startingControl === "random"
      ? randomIndex(state.teams.length)
      : Math.max(0, Math.min(state.teams.length - 1, Number(state.gameRules.startingControl) || 0));
    resetFinalState();
    el.gameQuizTitle.textContent = state.quiz.title;
    renderControlToolbar();
    renderBoard();
    renderScoreboard();
    showScreen("gameScreen");
    localStorage.removeItem(saveKey(state.selectedQuizRef));
    showToast(`${state.teams[state.controlTeamIndex].name} starts in control.`);
    saveGameState();
  }

  function chooseAnotherQuiz() {
    stopFinalTimer();
    closeScoreEditModal();
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
    el.quizAnswerKeyButton.disabled = true;
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
      version: "3.2",
      quizId: state.quiz.id,
      quizRef: state.selectedQuizRef,
      quizPath: state.selectedQuizPath,
      quizSource: state.selectedQuizSource,
      teams: state.teams,
      usedQuestions: state.usedQuestions,
      gameRules: state.gameRules,
      controlTeamIndex: state.controlTeamIndex,
      completed,
      finalActive: !el.finalModal.classList.contains("hidden"),
      currentQuestion: state.currentQuestion ? {
        categoryIndex: state.currentQuestion.categoryIndex,
        questionIndex: state.currentQuestion.questionIndex,
        questionResolved: state.questionResolved,
        questionPhase: state.questionPhase,
        reboundCorrectTeamIndices: state.reboundCorrectTeamIndices,
        reboundResponses: state.reboundResponses,
        answerRevealed: !el.answerPanel.classList.contains("hidden"),
        outcomeText: el.questionOutcome.textContent || "",
        outcomeTone: el.questionOutcome.classList.contains("success")
          ? "success"
          : el.questionOutcome.classList.contains("warning") ? "warning" : "neutral",
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
      showToast("No Version 3/3.1/3.2 saved game was found.");
      return;
    }

    try {
      const saved = JSON.parse(raw);
      state.teams = Array.isArray(saved.teams) ? saved.teams : [];
      if (state.teams.length < 2) throw new Error("Saved teams are missing.");
      state.usedQuestions = saved.usedQuestions || {};
      state.gameRules = {
        ...state.gameRules,
        ...(saved.gameRules || {})
      };
      state.controlTeamIndex = Math.max(0, Math.min(
        state.teams.length - 1,
        Number(saved.controlTeamIndex) || 0
      ));
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
        renderControlToolbar();
        renderBoard();
        renderScoreboard();
        showScreen("gameScreen");

        if (saved.currentQuestion) {
          const restored = saved.currentQuestion;
          openQuestion(restored.categoryIndex, restored.questionIndex, {
            silent: true,
            phase: restored.questionPhase || "first",
            reboundCorrectTeamIndices: restored.reboundCorrectTeamIndices || [],
            reboundResponses: restored.reboundResponses || Object.fromEntries((restored.reboundCorrectTeamIndices || []).map(index => [String(index), "correct"]))
          });
          state.questionResolved = Boolean(restored.questionResolved);
          state.questionPhase = restored.questionPhase || (state.questionResolved ? "resolved" : "first");
          state.timerInitial = Number(restored.timerInitial) || state.timerInitial;
          state.timerRemaining = Math.max(0, Number(restored.timerRemaining) || 0);
          updateTimerDisplay();

          if (restored.answerRevealed) {
            el.answerPanel.classList.remove("hidden");
            el.revealAnswerButton.classList.add("hidden");
          }

          if (state.questionPhase === "rebound" && !state.questionResolved) {
            el.firstAttemptPanel.classList.add("hidden");
            el.reboundPanel.classList.remove("hidden");
            renderReboundPanel();
          } else if (state.questionResolved) {
            el.firstAttemptPanel.classList.add("hidden");
            el.reboundPanel.classList.add("hidden");
            el.returnToBoardButton.classList.remove("hidden");
            showQuestionOutcome(restored.outcomeText || "This question has already been scored.", restored.outcomeTone || "neutral");
          }
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
    return `classroom-jeopardy-v3:${encodeURIComponent(quizRef || "unknown")}`;
  }

  function openAnswerKey() {
    if (!state.quiz) {
      showToast("Choose a quiz first.");
      return;
    }
    renderAnswerKey();
    el.answerKeyModal.classList.remove("hidden");
  }

  function closeAnswerKey() {
    el.answerKeyModal.classList.add("hidden");
  }

  function renderAnswerKey() {
    const quiz = state.quiz;
    el.answerKeyTitle.textContent = `${quiz.title} — Answer key`;
    const metaBits = [quiz.course, quiz.recommendedLevel, quiz.author].filter(Boolean);
    el.answerKeyMeta.textContent = metaBits.join(" · ");
    el.answerKeyContent.innerHTML = "";

    quiz.categories.forEach(category => {
      const section = document.createElement("section");
      section.className = "answer-key-category";
      const heading = document.createElement("h3");
      heading.textContent = category.name;
      section.appendChild(heading);

      const table = document.createElement("table");
      table.className = "answer-key-table";
      table.innerHTML = "<thead><tr><th>Value</th><th>Question</th><th>Answer</th></tr></thead>";
      const body = document.createElement("tbody");
      category.questions.forEach(question => {
        const row = document.createElement("tr");
        const value = document.createElement("td");
        value.className = "answer-key-value";
        value.textContent = formatPoints(question.value);
        const prompt = document.createElement("td");
        prompt.textContent = question.prompt;
        if (question.image) {
          const src = resolveImageSource(question.image);
          if (src) {
            const img = document.createElement("img");
            img.className = "answer-key-image";
            img.src = src;
            img.alt = question.imageAlt || "Question image";
            prompt.appendChild(img);
          }
        }
        const answer = document.createElement("td");
        answer.className = "answer-key-answer";
        answer.textContent = question.answer;
        row.append(value, prompt, answer);
        body.appendChild(row);
      });
      table.appendChild(body);
      section.appendChild(table);
      el.answerKeyContent.appendChild(section);
    });

    if (quiz.finalRound) {
      const final = document.createElement("section");
      final.className = "answer-key-category answer-key-final";
      const heading = document.createElement("h3");
      heading.textContent = `Final Round — ${quiz.finalRound.category}`;
      const table = document.createElement("table");
      table.className = "answer-key-table";
      const body = document.createElement("tbody");
      const row = document.createElement("tr");
      const label = document.createElement("td");
      label.className = "answer-key-value";
      label.textContent = "Final";
      const prompt = document.createElement("td");
      prompt.textContent = quiz.finalRound.prompt;
      const answer = document.createElement("td");
      answer.className = "answer-key-answer";
      answer.textContent = quiz.finalRound.answer;
      row.append(label, prompt, answer);
      body.appendChild(row);
      table.appendChild(body);
      final.append(heading, table);
      el.answerKeyContent.appendChild(final);
    }
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
    el.quizAnswerKeyButton.disabled = true;
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
      rebound: [[392, 0.07, 0], [523, 0.07, 0.07], [659, 0.07, 0.14], [880, 0.16, 0.22]],
      control: [[659, 0.08, 0], [880, 0.14, 0.08]],
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
