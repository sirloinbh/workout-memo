# #506 Pick values instead of typing them in forms

- Issue: https://github.com/sirloinbh/workout-memo/issues/506
- Branch: feat/506-pickers

## Audit of every input in `frontend/src`

| Field                                                                             | Kind            | Result                                                                                                      |
| --------------------------------------------------------------------------------- | --------------- | ----------------------------------------------------------------------------------------------------------- |
| Exercise name (journal sets, goals, routine exercises)                            | Repeating names | Already a Combobox with earlier names                                                                       |
| Machine, brand, official reference, body part, cardio kind, effort, period, tabs  | Known sets      | Already select, segmented control or combobox                                                               |
| Dates and times (journal, goals, body, cardio, routines)                          | Dates and times | Already native date and time pickers                                                                        |
| Weights, reps, minutes, distances, body measurements                              | Numbers         | Number inputs with the number keypad (typing is the right input; a picker would be slower)                  |
| Journal title                                                                     | Repeating text  | **Changed**: Combobox offering the titles already used in the loaded period; a new title can still be typed |
| Routine name, split name, machine name, notes, backup confirmation phrase, search | Open text       | Stay free text                                                                                              |

## Verification

`npm run check`.
