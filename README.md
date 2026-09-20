# GRE & IELTS Practice Studio

A combined, unofficial practice app. GRE uses original questions, timed sections, simple section-level difficulty routing and explanations. IELTS Reading and Listening use the locally extracted study archive for answer review and raw scores; Writing Tasks 1 and 2 provide prompts and model responses for self-review. The public edition uses password-protected profiles with synced score history; the local Node edition remains a separate, password-free personal-study server.

## Public GitHub Pages edition

The [public app](https://datawithmursalin-cloud.github.io/GRE-IELTS-Practice-Studio/) is hosted on GitHub Pages, with profile authentication and score history handled by the Supabase `studio-api` Edge Function and a private database schema. Mursalin and Ramisa are built-in profiles; each uses a one-time setup code to choose a password on first sign-in. New participants can create a name and password. Passwords must be at least 10 characters and are stored only as salted PBKDF2 hashes. Signed-in users can change their password, which signs out other devices. There is no email-based password recovery; an administrator must reset a forgotten password.

Names and completed score histories sync across devices under each profile. Old browser-only scores are imported once when that profile first signs in on the same browser. Unfinished GRE work remains local to a browser and does not sync. Clearing site data removes the local session and unfinished work, but not the server-side completed history. The public IELTS set consists of a few original, short Reading, Listening and Writing exercises; Listening uses browser speech synthesis. It is not the larger local IELTS archive or a full IELTS mock test. The public GRE source and answers are downloadable as part of a static site, so this edition cannot keep its question bank secret. The private Manhattan Prep and IELTS Liz material is not published.

## Run locally

Requires Node.js 20 or newer and the supplied IELTS archive for local IELTS content.

1. The archive has been extracted to `local-ielts/IELTS-Study-main/`. This directory and the zip are Git-ignored because the included IELTS Liz content is not licensed for redistribution. If moving to another computer, extract `IELTS-Study-main.zip` to `local-ielts/` there.
2. Run:

```sh
npm start
```

Open <http://localhost:3000>. Select an existing profile or enter a new name, then choose GRE or IELTS. New names are saved in Git-ignored `local-profiles.json` and remain available after a server restart. Run `npm test` for automated checks. The server listens on `127.0.0.1` by default, so it is accessible only from the same computer unless `HOST` is explicitly changed.

## Test structure and question library

The full-length mode follows the current standard GRE General Test: one 30-minute Analyze an Issue task, two Verbal sections (12 questions/18 minutes and 15 questions/23 minutes), and two Quant sections (12 questions/21 minutes and 15 questions/26 minutes). It totals 1 hour 58 minutes. Verbal and Quant may appear in different orders on the real test; this app uses one permitted fixed order. The second section of each measure adjusts difficulty based on the first section's raw accuracy, **not ETS's proprietary algorithm**.

Verbal practice includes Reading Comprehension, Text Completion with one to three blanks, and Sentence Equivalence. Some Reading Comprehension items use multi-select or select-a-sentence formats. Quant practice includes Quantitative Comparison, single-answer multiple choice, multi-select, Numeric Entry, and table-based Data Interpretation across arithmetic, algebra, geometry, and data analysis.

Other modes include Verbal only (27 questions over 41 minutes in two sections), Quant only (27 questions over 47 minutes in two sections), all four scored sections without the essay, a 10-question diagnostic, and a 10–40-question custom drill. The Verbal-only and Quant-only modes each adapt their second section from the first section's accuracy. A practice session can reuse questions across repeated sittings because the original item bank is limited. This app does not equate or report official 130–170 GRE scores. Essay writing is self-reviewed, not automatically scored.

Current format checked against the ETS [test structure](https://www.ets.org/gre/test-takers/general-test/prepare/test-structure.html), [Verbal overview](https://www.ets.org/gre/test-takers/general-test/prepare/content/verbal-reasoning.html), and [Quant overview](https://www.ets.org/gre/test-takers/general-test/prepare/content/quantitative-reasoning.html) in September 2026. For official-style score estimates and calibrated difficulty, use ETS [POWERPREP](https://www.ets.org/gre/test-takers/general-test/prepare/powerprep.html).

## Scores and privacy

Each completed GRE session adds raw Verbal and Quant results; IELTS Reading and Listening add raw question accuracy, and Writing logs only a word count. These are not official scaled scores or bands. In the public edition, completed results are stored centrally by profile and cached in the browser; the UI warns if a save cannot sync. Active GRE sessions and IELTS writing drafts are browser-local. Earlier GRE-only history in a browser can be imported from the history page.

The public edition requires a separate password for each profile. Its server validates session tokens, limits failed logins and new-profile creation, and isolates records by profile. Users can still enter self-reported results by interacting with the public client, so this is not a proctored scoring system. The local Node server remains password-free and should not be exposed to the public internet. Do not use the app for sensitive information.

## Backend question bank and publication

The bank is server-side only; the app has no library browser or bulk-data route. The browser receives one GRE section or one IELTS exercise at a time, without answers or explanations until submission. The authored GRE bank has 43 Verbal questions, 4 Issue prompts, and 8 parameterized Quant generator patterns (up to 299 generated IDs per difficulty). The locally extracted IELTS archive has 169 Reading and 241 Listening questions across 73 exercises, plus 20 Writing prompts. From the 2024 Manhattan Prep EPUB, `scripts/extract_5lb.py` checks option counts and answer-key matches, and currently loads **236 additional Verbal items locally** (48 one-blank Text Completion, 138 Sentence Equivalence, and 50 argument-based Reading Comprehension). It skips 87 Verbal items that did not meet those checks. `scripts/extract_5lb_quant.py` adds **107 text-only Quant multiple-choice items** from 18 math chapters after checking five readable choices and a single-letter answer key; figure-, table-, and image-dependent questions are excluded. These are conservative, automated extractions, not claims of human editorial review or a complete extraction of the book's advertised 1,400+ problems. Run both scripts after restoring the ignored EPUB extraction; they require `beautifulsoup4`. A book's publication date does not mean every question reflects the current exam format.

For a public GitHub deployment, add only original questions or material with explicit redistribution permission. The IELTS Liz dataset, Manhattan Prep book, and its extracted question bank are kept outside Git. Do not copy them into public assets or treat generated numeric variants as independently written questions. A future public question pipeline should record provenance, license, review date, topic, difficulty, correct answer, explanation, and validation status for each item before publication.

## Hosting and content rights

The local Node server manages selected-profile sessions, serves individual exercises, and grades submissions. It does not expose raw private bank files. The GitHub Pages edition uses a smaller original-only question set and grades in the browser, while Supabase handles passwords and synced score history. The database tables are in the private `studio` schema with no browser-role grants; only the Edge Function can access them. The Edge Function has `verify_jwt = false` because login and registration must be public entry points, but it checks profile passwords or its own session tokens on protected routes. Never commit setup codes, database connection strings, or Supabase service-role keys. Updating the Edge Function requires deploying it separately from a GitHub Pages push. Do not publish the IELTS archive, screenshots, linked media, or extracted Electron source without permission from the rights holders.

The books in `GRE Books/` were used only to check question types and topical coverage. Do not commit or redistribute their original questions or PDFs without permission. Several ETS books are older editions, so their timing and retired Argument essay descriptions should not override current ETS information. This tool is independent of ETS and the official IELTS organizations. The archive's `THIRD_PARTY_CONTENT.md` has more on IELTS Liz rights and attribution.
