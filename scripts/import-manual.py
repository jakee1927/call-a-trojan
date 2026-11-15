# Converts data/manual/community.csv into:
#  - data/pages/manual--*.json   (type=official rows only, grouped by URL: USC-says sources)
#  - data/seed-questions/community.json (r/USC + r/TransferStudents questions; never sources)
# Community answer_or_tip text is NOT imported as an answer anywhere.
import csv, json, os, re
from collections import OrderedDict

rows = list(csv.DictReader(open("data/manual/community.csv")))
official = [r for r in rows if r["type"].strip() == "official"]
community = [r for r in rows if r["type"].strip() in ("question", "tip")]

TITLES = {
    "https://arr.usc.edu/registration-services/": "Registration Services: roadmap, holds and deadlines (USC Registrar)",
    "https://arr.usc.edu/web-registration/": "Web Registration guide: myCourseBin, R/D sections, dropping (USC Registrar)",
    "https://arr.usc.edu/registration-calendar/": "Spring 2027 registration calendar (USC Registrar)",
    "https://arr.usc.edu/degree-progress/": "Degree Progress and STARS; OASIS retired (USC Registrar)",
    "https://classes.usc.edu/home": "Schedule of Classes (classes.usc.edu)",
    "https://classes.usc.edu/term/20271/catalogue": "Spring 2027 class catalogue (classes.usc.edu)",
    "https://classes.usc.edu/": "Schedule of Classes: seats and waitlists (classes.usc.edu)",
}
groups = OrderedDict()
for r in official:
    groups.setdefault(r["url"].strip(), []).append(r)

os.makedirs("data/pages", exist_ok=True)
for url, rs in groups.items():
    slug = re.sub(r"[^a-z0-9]+", "-", url.split("//", 1)[1].lower()).strip("-")[:60]
    pid = f"manual--{slug}"
    aud = sorted({r["audience"].strip() for r in rs} | {"current"})
    text = "\n\n".join(f"Q: {r['question'].strip()}\nA: {r['answer_or_tip'].strip()}" for r in rs)
    text = "Paraphrased from the official page by hand (Nov 2026).\n\n" + text
    page = {
        "id": pid,
        "url": url,
        "title": TITLES.get(url, url),
        "area": "academics",
        "audiences": aud,
        "topics": sorted({r["topic"].strip() for r in rs}),
        "fetched_at": "2026-11-14T19:00:00-08:00",
        "text": text,
    }
    json.dump(page, open(f"data/pages/{pid}.json", "w"), indent=2)
    print("page", pid, len(rs), "facts")

seeds = []
for r in community:
    ans = r["usc_site_answers_it"].strip()
    seeds.append({
        "question": r["question"].strip(),
        "audience": r["audience"].strip() if r["audience"].strip() in ("current", "incoming", "applicant") else "current",
        "expected_route": "both" if ans == "partly" else ("ai" if ans == "yes" else "trojan"),
        "why": f"Real recurring student question ({r['source'].strip()}, paraphrased); usc.edu answers it: {ans}.",
        "source_ids": [],
        "origin": "community",
        "topic": r["topic"].strip(),
    })
json.dump(seeds, open("data/seed-questions/community.json", "w"), indent=2)
print("seeds", len(seeds))
