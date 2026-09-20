"""Extract high-confidence GRE verbal items from a local, user-supplied EPUB.

Output is deliberately under local-gre/ (Git-ignored). Requires beautifulsoup4.
This parser accepts one-blank Text Completion, Sentence Equivalence, and
argument-based Reading Comprehension when options and keys can be checked.
"""

import json
import re
from pathlib import Path

from bs4 import BeautifulSoup


ROOT = Path(__file__).resolve().parents[1]
EPUB = ROOT / "local-gre/manhattan-5lb/OEBPS"
OUTPUT = ROOT / "local-gre/manhattan-5lb-checked.json"
NUMBER = re.compile(r"^\s*(\d+)\.\s*(.+)", re.S)
ARGUMENT_ANSWER = re.compile(r"^\s*(\d+)\.\(([A-E])\)\.")
OPTION_IMAGES = ["image-2MLOXGLT.jpg", "image-SQ8KF26R.jpg", "image-UDPM23Y9.jpg", "image-C88Q4AEE.jpg", "image-C7UX3HL9.jpg"]


def clean(value):
    return " ".join(value.get_text(" ", strip=True).split())


def key(value):
    return re.sub(r"[^a-z0-9]+", "", value.lower())


def paragraphs(file):
    soup = BeautifulSoup((EPUB / file).read_text(encoding="utf-8"), "html.parser")
    return soup.body.find_all("p")


def explanations(file):
    result = {}
    for paragraph in paragraphs(file):
        text = clean(paragraph)
        match = NUMBER.match(text)
        if match:
            result[int(match.group(1))] = match.group(2)
    return result


def extract_completion():
    answer_map = explanations("content0014.xhtml")
    soup = BeautifulSoup((EPUB / "content0013.xhtml").read_text(encoding="utf-8"), "html.parser")
    accepted, skipped = [], []
    for paragraph in soup.body.find_all("p"):
        match = NUMBER.match(clean(paragraph))
        if not match:
            continue
        number, prompt = int(match.group(1)), match.group(2)
        table = paragraph.find_next_sibling("table")
        if table is None:
            skipped.append(number)
            continue
        options = [clean(cell) for row in table.find_all("tr") for cell in row.find_all("td")]
        explanation = answer_map.get(number, "")
        answer_word = explanation.split(".", 1)[0].strip()
        matches = [i for i, value in enumerate(options) if key(value) == key(answer_word)]
        if len(options) != 5 or len(matches) != 1 or not explanation or not prompt:
            skipped.append(number)
            continue
        accepted.append({"sourceId": f"5lb-tc-{number}", "level": "medium", "type": "Text completion", "topic": "Vocabulary", "prompt": prompt, "options": options, "answer": matches[0], "explanation": explanation, "origin": "Manhattan Prep 5 lb (2024), Text Completions"})
    return accepted, skipped


def extract_equivalence():
    answer_map = explanations("content0018.xhtml")
    contents = paragraphs("content0017.xhtml")
    accepted, skipped = [], []
    for i, paragraph in enumerate(contents):
        match = NUMBER.match(clean(paragraph))
        if not match:
            continue
        number, prompt = int(match.group(1)), match.group(2)
        options = [clean(p) for p in contents[i + 1:i + 7]]
        explanation = answer_map.get(number, "")
        answer_terms = [part.strip() for part in explanation.split(".", 1)[0].split(",")]
        matches = [j for j, option in enumerate(options) if any(key(option) == key(term) for term in answer_terms)]
        if len(options) != 6 or len(matches) != 2 or len(set(options)) != 6 or not explanation or not prompt:
            skipped.append(number)
            continue
        accepted.append({"sourceId": f"5lb-se-{number}", "level": "medium", "type": "Sentence equivalence", "topic": "Vocabulary", "prompt": prompt, "options": options, "answer": matches, "explanation": explanation, "origin": "Manhattan Prep 5 lb (2024), Sentence Equivalence"})
    return accepted, skipped


def extract_arguments():
    keys = {}
    markers = {}
    active_number = None
    for paragraph in paragraphs("content0026.xhtml"):
        paragraph_text = clean(paragraph)
        match = ARGUMENT_ANSWER.match(paragraph_text)
        if match:
            active_number = int(match.group(1))
            keys[active_number] = (ord(match.group(2)) - ord("A"), paragraph_text)
        correct_marker = re.match(r"^\(([A-E])\) CORRECT\.", paragraph_text)
        if correct_marker and active_number is not None:
            markers.setdefault(active_number, []).append(ord(correct_marker.group(1)) - ord("A"))

    soup = BeautifulSoup((EPUB / "content0025.xhtml").read_text(encoding="utf-8"), "html.parser")
    blocks = []
    current = None
    for paragraph in soup.body.find_all("p"):
        match = NUMBER.match(clean(paragraph))
        if match:
            current = (int(match.group(1)), [paragraph])
            blocks.append(current)
        elif current is not None:
            current[1].append(paragraph)

    accepted, skipped = [], []
    for number, block in blocks:
        option_paragraphs = [p for p in block if p.find("img")]
        option_images = [p.find("img").get("src", "").split("/")[-1] for p in option_paragraphs]
        key_entry = keys.get(number)
        if not key_entry or markers.get(number) != [key_entry[0]] or option_images != OPTION_IMAGES:
            skipped.append(number)
            continue
        before_options = block[:block.index(option_paragraphs[0])]
        if len(before_options) < 2 or any(p.find("img") for p in before_options):
            skipped.append(number)
            continue
        passage = NUMBER.sub(r"\2", clean(before_options[0]), count=1)
        prompt = " ".join(clean(p) for p in before_options[1:])
        options = [clean(p) for p in option_paragraphs]
        answer, explanation = key_entry
        if len(options) != 5 or len(set(options)) != 5 or not passage or not prompt or not all(options) or re.search(r"boldface|boldfaced|underlined", prompt, re.I):
            skipped.append(number)
            continue
        accepted.append({"sourceId": f"5lb-arg-{number}", "level": "medium", "type": "Reading comprehension", "topic": "Argument", "passage": passage, "prompt": prompt, "options": options, "answer": answer, "explanation": explanation, "origin": "Manhattan Prep 5 lb (2024), Argument-Based Reading Comprehension"})
    return accepted, skipped


def main():
    completion, missed_completion = extract_completion()
    equivalence, missed_equivalence = extract_equivalence()
    arguments, missed_arguments = extract_arguments()
    items = completion + equivalence + arguments
    assert len({item["sourceId"] for item in items}) == len(items)
    assert len({(item.get("passage", ""), item["prompt"], tuple(item["options"])) for item in items}) == len(items)
    OUTPUT.write_text(json.dumps({"format": "private-gre-bank-v1", "source": "Manhattan Prep 5 lb (2024)", "items": items}, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"oneBlankTextCompletion": len(completion), "sentenceEquivalence": len(equivalence), "argumentReadingComprehension": len(arguments), "total": len(items), "skippedTextCompletion": len(missed_completion), "skippedSentenceEquivalence": len(missed_equivalence), "skippedArgumentReadingComprehension": len(missed_arguments), "output": str(OUTPUT)}, indent=2))


if __name__ == "__main__":
    main()
