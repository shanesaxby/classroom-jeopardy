# Classroom Jeopardy quiz file format

Save each quiz as UTF-8 JSON inside the `quizzes` folder.

## Required top-level fields

```json
{
  "id": "unique-short-id",
  "title": "Quiz title",
  "description": "One or two sentences.",
  "course": "Course or subject",
  "recommendedLevel": "Year level",
  "author": "Author name",
  "estimatedDuration": "35–45 minutes",
  "settings": {
    "questionTimerSeconds": 30,
    "finalTimerSeconds": 60
  },
  "rules": {
    "mode": "append",
    "general": ["Optional extra rule."],
    "scoring": ["Optional extra scoring rule."],
    "final": ["Optional extra Final Round rule."]
  },
  "categories": [],
  "finalRound": {}
}
```

`rules.mode` may be:
- `"append"` — use the built-in rules and add the quiz rules.
- `"replace"` — replace a rules section when that section contains custom rules.

## Categories and questions

A quiz may use different board dimensions. The number of category objects becomes
the number of columns. The longest questions array determines the number of rows.

```json
"categories": [
  {
    "name": "Category name",
    "questions": [
      {
        "value": 100,
        "prompt": "Question shown to students",
        "answer": "Answer revealed by the teacher",
        "timerSeconds": 20,
        "image": "images/example.svg",
        "imageAlt": "Accessible description of the image"
      }
    ]
  }
]
```

Required question fields:
- `value`
- `prompt`
- `answer`

Optional question fields:
- `timerSeconds` overrides the quiz's standard question timer.
- `image` is relative to the `quizzes` folder.
- `imageAlt` describes the image.

## Final Round

```json
"finalRound": {
  "category": "Final category",
  "prompt": "Final question",
  "answer": "Final answer",
  "timerSeconds": 60,
  "image": "images/final-image.png",
  "imageAlt": "Accessible description"
}
```

The image fields are optional.

## Adding the quiz to the dropdown

Add an entry to `quizzes/quiz-list.json`:

```json
{
  "file": "your-file-name.json",
  "label": "Name shown in dropdown"
}
```

Use valid JSON: double quotes, no comments, and no trailing comma after the final
item in an array or object.
