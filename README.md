# GRE Practice Studio

A local-first, unofficial GRE-style practice app. It uses original questions, timed sections, simple section-level difficulty routing, explanations, and score history. No account, API key, or package installation is required.

## Run locally

Requires Node.js 20 or newer.

```sh
npm start
```

Open <http://localhost:3000>. Run `npm test` for the automated checks.

## Test structure and question library

The full-length mode follows the current standard GRE General Test: one 30-minute Analyze an Issue task, two Verbal sections (12 questions/18 minutes and 15 questions/23 minutes), and two Quant sections (12 questions/21 minutes and 15 questions/26 minutes). It totals 1 hour 58 minutes. Verbal and Quant may appear in different orders on the real test; this app uses one permitted fixed order. The second section of each measure adjusts difficulty based on the first section's raw accuracy, **not ETS's proprietary algorithm**.

Verbal practice includes Reading Comprehension, Text Completion with one to three blanks, and Sentence Equivalence. Some Reading Comprehension items use multi-select or select-a-sentence formats. Quant practice includes Quantitative Comparison, single-answer multiple choice, multi-select, Numeric Entry, and table-based Data Interpretation across arithmetic, algebra, geometry, and data analysis.

Other modes include Verbal only (27 questions over 41 minutes in two sections), Quant only (27 questions over 47 minutes in two sections), all four scored sections without the essay, a 10-question diagnostic, and a 10–40-question custom drill. The Verbal-only and Quant-only modes each adapt their second section from the first section's accuracy. A practice session can reuse questions across repeated sittings because the original item bank is limited. This app does not equate or report official 130–170 GRE scores. Essay writing is self-reviewed, not automatically scored.

Current format checked against the ETS [test structure](https://www.ets.org/gre/test-takers/general-test/prepare/test-structure.html), [Verbal overview](https://www.ets.org/gre/test-takers/general-test/prepare/content/verbal-reasoning.html), and [Quant overview](https://www.ets.org/gre/test-takers/general-test/prepare/content/quantitative-reasoning.html) in September 2026. For official-style score estimates and calibrated difficulty, use ETS [POWERPREP](https://www.ets.org/gre/test-takers/general-test/prepare/powerprep.html).

## Scores and privacy

Each completed session adds raw Verbal, Quant, and total accuracy to Score History. The history includes a simple progression chart and can be exported as JSON or imported from a prior export. Your active session and history stay in browser local storage; clearing site data deletes them unless you export a backup. Different browsers/devices do **not** sync automatically. The essay text stays in the active session's local browser storage and is **not** included in the history export.

## GitHub Pages

This is a static site: `index.html` and its local assets work on GitHub Pages without a build step. To put it in your own private or public GitHub repository:

1. Create a new GitHub repository and push this project folder. Check `git status` before committing. The `.gitignore` deliberately excludes `GRE Books/`, so purchased/copyrighted PDFs are not uploaded.
2. In the repository's **Settings → Pages**, choose **Deploy from a branch**, select your branch, and use the **/(root)** folder.
3. Open the Pages URL GitHub provides. Export history from the local app and import it on the Pages site if you want to transfer prior scores; these are different browser origins.

The books in `GRE Books/` were used only to check question types and topical coverage. Do not commit or redistribute their original questions or PDFs without permission. Several ETS books in the folder are older editions (for example, the official Verbal and Quant practice-question PDFs carry 2014 copyright notices), so their descriptions of timing and the retired Argument essay should not override the current ETS website.
