# Classroom Jeopardy — Version 2

A teacher-hosted Jeopardy-style classroom quiz game. Version 2 is designed for GitHub Pages and can also run locally on Windows.

## Version 2 additions

- Built-in quizzes loaded from `quizzes/quiz-list.json`
- **Import quiz** button for private, browser-only quizzes
- Persistent imported quiz library using IndexedDB
- Import a single JSON quiz or an extracted quiz folder containing images
- Remove one imported quiz or clear the imported library
- Direct link to the **Classroom Jeopardy Quiz Maker GPT**
- Relative file paths suitable for GitHub Pages project sites
- `.nojekyll` included for straightforward static hosting

Imported quizzes are stored only in the browser on the device where they are imported. They are not uploaded to GitHub.

## Publish on GitHub Pages

1. Create a GitHub repository, for example `classroom-jeopardy`.
2. Upload the **contents of this folder** to the repository root. `index.html` must be at the root.
3. Open **Settings → Pages**.
4. Under **Build and deployment**, choose:
   - Source: **Deploy from a branch**
   - Branch: **main**
   - Folder: **/(root)**
5. Save. The site will normally appear at:

   `https://YOUR-USERNAME.github.io/classroom-jeopardy/`

The game uses relative paths, so it works from a GitHub project-site subdirectory.

## Add a permanent built-in quiz

1. Place the quiz JSON file in `quizzes/`.
2. Place any image assets under `quizzes/images/` or another subfolder referenced by the JSON.
3. Edit `quizzes/quiz-list.json` and add an entry:

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

The game converts the selected images into browser-stored data and keeps them with the imported quiz.

## Quiz Maker GPT

The game links directly to:

`https://chatgpt.com/g/g-6a6aaee36fe4819199c7e5ba83a6a6a4-classroom-jeopardy-quiz-maker`

## Run locally on Windows

1. Extract the complete folder.
2. Double-click `start-game.bat`.
3. Keep the server window open while playing.
4. Close the server window when finished.

## Important browser-storage note

Imported quizzes are tied to the browser profile and website address. For example, an imported quiz stored while using the local version will not automatically appear on the GitHub Pages version. Clearing site data or using a private/incognito window can remove or isolate the imported library.

## Core quiz format

See:

- `quizzes/QUIZ-FORMAT.md`
- `quizzes/quiz-template.json`
- `quizzes/sample-science.json`
