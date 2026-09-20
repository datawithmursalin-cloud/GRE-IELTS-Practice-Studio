"""Extract text-only, answer-key-checked Quant multiple-choice items from a local EPUB.

Output remains in local-gre/ and must not be published. Questions that rely on
figures, tables, equations rendered as images, or incomplete choices are skipped.
"""

import json
import re
from pathlib import Path

from bs4 import BeautifulSoup


ROOT = Path(__file__).resolve().parents[1]
EPUB = ROOT / "local-gre/manhattan-5lb/OEBPS"
OUTPUT = ROOT / "local-gre/manhattan-5lb-quant-checked.json"
CHAPTERS = [36, 39, 42, 45, 48, 51, 54, 57, 60, 63, 66, 69, 72, 75, 81, 84, 87, 90]
NUMBER = re.compile(r"^\s*(\d+)\.\s*(.+)", re.S)
ANSWER = re.compile(r"^\s*(\d+)\.\(([A-E])\)\.")
OPTION_IMAGES = ["image-2MLOXGLT.jpg", "image-SQ8KF26R.jpg", "image-UDPM23Y9.jpg", "image-C88Q4AEE.jpg", "image-C7UX3HL9.jpg"]
CONTEXT = re.compile(r"\b(?:figure|diagram|graph|chart|table|above|below|shown|pictured|drawn)\b", re.I)
FLATTENED_SUBSCRIPT = re.compile(r"\b(?:Sn|An|an)(?:\s*[−-]\s*\d+)?\b")


def clean(tag):
    return " ".join(tag.get_text(" ", strip=True).split())


def document(number):
    return BeautifulSoup((EPUB / f"content{number:04d}.xhtml").read_text(encoding="utf-8"), "html.parser")


def answer_map(number):
    answers = {}
    for paragraph in document(number + 1).body.find_all("p"):
        text = clean(paragraph)
        match = ANSWER.match(text)
        if match:
            answers[int(match.group(1))] = (ord(match.group(2)) - ord("A"), text)
    return answers


def choices_after(paragraph):
    choices = []
    node = paragraph.find_next_sibling()
    while node is not None and len(choices) < 5:
        if node.name == "br":
            node = node.find_next_sibling()
            continue
        if node.name != "p":
            break
        images = node.find_all("img")
        if len(images) != 1 or images[0].get("src", "").split("/")[-1] != OPTION_IMAGES[len(choices)]:
            break
        choices.append(clean(node))
        node = node.find_next_sibling()
    return choices


def preceding_illustration(paragraph):
    node = paragraph.find_previous_sibling()
    while node is not None and node.name == "br":
        node = node.find_previous_sibling()
    return node is not None and node.name == "img"


def extract():
    accepted = []
    chapter_counts = {}
    for chapter in CHAPTERS:
        source = document(chapter)
        title = clean(source.title)
        keys = answer_map(chapter)
        count = 0
        for paragraph in source.body.find_all("p", recursive=False):
            match = NUMBER.match(clean(paragraph))
            if not match or paragraph.find("img"):
                continue
            number, prompt = int(match.group(1)), match.group(2)
            entry = keys.get(number)
            if not entry or CONTEXT.search(prompt) or FLATTENED_SUBSCRIPT.search(prompt) or preceding_illustration(paragraph) or len(prompt) < 25:
                continue
            options = choices_after(paragraph)
            if len(options) != 5 or len(set(options)) != 5 or not all(options):
                continue
            answer, explanation = entry
            accepted.append({"sourceId": f"5lb-quant-{chapter}-{number}", "level": "medium", "type": "Multiple choice", "topic": title, "prompt": prompt, "options": options, "answer": answer, "explanation": explanation, "origin": f"Manhattan Prep 5 lb (2024), {title}"})
            count += 1
        chapter_counts[title] = count
    assert len({item["sourceId"] for item in accepted}) == len(accepted)
    OUTPUT.write_text(json.dumps({"format": "private-gre-quant-bank-v1", "source": "Manhattan Prep 5 lb (2024)", "items": accepted}, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"total": len(accepted), "byChapter": chapter_counts, "output": str(OUTPUT)}, indent=2))


if __name__ == "__main__":
    extract()
