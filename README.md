# Classroom Jeopardy — Version 3.1

A teacher-hosted Jeopardy-style classroom quiz game designed for projection, team whiteboards and GitHub Pages. Version 3.1 keeps the Version 2 quiz library/import system and adds a structured classroom whiteboard workflow, fair rebound selection and manual score correction.

## Version 3.1 additions

### Whiteboard reveal workflow

Version 3.1 is designed around a simple classroom protocol:

1. The team in control chooses a category and value.
2. **All teams solve the question** on their whiteboards.
3. Boards stay down while teams work.
4. The host calls **“Pens down — boards up.”**
5. All teams reveal simultaneously and must not change or erase their answer until the host says **“Clear.”**
6. The team in control is judged first.
7. If that team is wrong, the host marks every correct rebound board in the game.
8. The game randomly selects control from the correct rebound teams.

This removes the need for the teacher to judge which of several boards was raised first.

### Rebound scoring selector

On the team setup screen, choose one of four rebound systems:

- **One correct team gets full points + control** — recommended default.
- **All correct teams get full points**; one is randomly selected for control.
- **Correct teams share the clue value**; one is randomly selected for control and receives any indivisible remainder.
- **All correct teams get a fixed bonus**; one is randomly selected for control.

### Incorrect-answer scoring

Choose:

- **No points deducted** — recommended default for classroom whiteboards.
- **Deduct the clue value** from the team in control.

### Control

- Starting control can be randomly selected or assigned to a nominated team.
- The team in control is highlighted on the scoreboard.
- A correct first answer keeps control.
- A successful rebound transfers control to a randomly selected correct rebound team.
- If nobody has a correct rebound, the original team keeps control.
- The host can manually change control at any time using the control selector above the board.

### Manual score correction

Every team scoreboard panel now has an **Edit** button.

The host can:
- set the score to any value;
- quickly adjust by −500, −100, +100 or +500;
- correct an accidental award or deduction without restarting the game.

## Version 2 features retained

- Built-in quizzes loaded from `quizzes/quiz-list.json`
- **Import quiz** button for private, browser-only quizzes
- Persistent imported quiz library using IndexedDB
- Import a single JSON quiz or an extracted quiz folder containing images
- Remove one imported quiz or clear the imported library
- Direct link to the **Classroom Jeopardy Quiz Maker GPT**
- Relative file paths suitable for GitHub Pages project sites
- `.nojekyll` included for straightforward static hosting
- Local Windows launcher

Imported quizzes are stored only in the browser on the device where they are imported. They are not uploaded to GitHub.

## Publish on GitHub Pages

1. Upload the **contents of this folder** to the repository root. `index.html` must be at the root.
2. Open **Settings → Pages**.
3. Under **Build and deployment**, choose:
   - Source: **Deploy from a branch**
   - Branch: **main**
   - Folder: **/(root)**
4. Save.

For the current repository, the published address is normally:

`https://shanesaxby.github.io/classroom-jeopardy/`

The game uses relative paths, so it works from a GitHub project-site subdirectory.

## Add a permanent built-in quiz

1. Place the quiz JSON file in `quizzes/`.
2. Place any image assets under `quizzes/images/` or another subfolder referenced by the JSON.
3. Edit `quizzes/quiz-list.json` and add an entry such as:

```json
{
  "file": "year-12-electromagnetism.json",
  "label": "Year 12 Physics — Electromagnetism"
}
```

4. Commit and push the changes. GitHub Pages will republish the game.

## Import a private quiz during class

Select **Import quiz** on the quiz-selection screen.

### Text-only quiz

Choose **Choose JSON file**, then select the quiz `.json` file.

### Quiz containing images

1. Extract the ZIP package produced by the Quiz Maker GPT.
2. Choose **Choose quiz folder**.
3. Select the extracted folder containing the quiz JSON and its `images` subfolder.

The game converts selected images into browser-stored data and keeps them with the imported quiz.

## Quiz Maker GPT

The game links directly to:

`https://chatgpt.com/g/g-6a6aaee36fe4819199c7e5ba83a6a6a4-classroom-jeopardy-quiz-maker`

## Run locally on Windows

1. Extract the complete folder.
2. Double-click `start-game.bat`.
3. Keep the server window open while playing.
4. Close the server window when finished.

## Browser storage

Version 3.1 uses a new saved-game key so Version 2 in-progress games are not restored into the new scoring workflow. The existing Version 2 IndexedDB quiz library is deliberately retained, so previously imported quizzes remain available in the same browser/site.

Imported quizzes are tied to the browser profile and website address. An imported quiz stored while using the local version will not automatically appear on the GitHub Pages version.

## Core quiz format

The quiz JSON format is unchanged from Version 2.

See:

- `quizzes/QUIZ-FORMAT.md`
- `quizzes/quiz-template.json`
- `quizzes/sample-science.json`


## Version 3.1 additions

See `VERSION-3.1-NOTES.md` for the classroom-trial changes: visible team count controls, printable answer key, hidden answer during rebound entry, and tri-state rebound marking for deduction mode.
