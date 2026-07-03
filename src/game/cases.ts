/**
 * The content bank: 15 case files, 5 per tier.
 *
 * SERVER-ONLY import — answers live here. Clients only ever receive the
 * CasePublic projection (see party/index.ts).
 *
 * Every `code`, `brokenOutput` and `fixedOutput` below was captured by
 * actually executing the snippet (Python 3.14) — see GAME.md authoring
 * rules. Tracebacks are verbatim except the path, sanitized to the
 * display filename "crime_scene.py". Do not hand-edit outputs; re-run
 * the snippet instead.
 */

import type { CaseFormat, CaseOption, Tier } from "./protocol";

export interface CaseFile {
  id: string;
  tier: Tier;
  title: string;
  format: CaseFormat;
  /** The buggy snippet, verbatim as executed. */
  code: string;
  /** Exact captured stdout, or the sanitized traceback if it crashed. */
  brokenOutput: string;
  crashed: boolean;
  /** Exact captured stdout of the fixed version. */
  fixedOutput: string;
  /** 1-based line number of the seeded bug in `code`. */
  culpritLine: number;
  /** The corrected line(s), for the reveal. */
  fixedLines: string[];
  explanation: string;
  /** MCQ tiers: exactly 4 candidates. Text tier: null. */
  options: CaseOption[] | null;
  /** MCQ tiers: index into options. Text tier: null. */
  correctOption: number | null;
  /** Text tier: accepted forms (whitespace-insensitive, quote-unified). MCQ: null. */
  acceptedAnswers: string[] | null;
  /** [after 1st wrong attempt, after 2nd wrong attempt] */
  hints: [string, string];
}

export const CASES: CaseFile[] = [
  // ------------------------------------------------------------------
  // ROOKIE
  // ------------------------------------------------------------------
  {
    id: "rookie-missing-ticket",
    tier: "rookie",
    title: "The Case of the Missing Ticket",
    format: "mcq",
    code: `# Case: The class booked movie tickets for guests 1 through 5.
# Each ticket costs 3 tokens. The treasurer says the total
# is short -- one guest was never charged.

ticket_cost = 3
total = 0

for guest in range(1, 5):
    total = total + ticket_cost

print("Guests charged: 1 through 5")
print("Total tokens:", total)`,
    brokenOutput: "Guests charged: 1 through 5\nTotal tokens: 12\n",
    crashed: false,
    fixedOutput: "Guests charged: 1 through 5\nTotal tokens: 15\n",
    culpritLine: 8,
    fixedLines: ["for guest in range(1, 6):"],
    explanation:
      "range(1, 5) produces 1, 2, 3, 4 — the stop value is never included. " +
      "The loop ran four times, so guest 5 was never charged. " +
      "range(1, 6) charges all five.",
    options: [
      { line: 8, text: "for guest in range(2, 6):" },
      { line: 5, text: "ticket_cost = 4" },
      { line: 8, text: "for guest in range(1, 6):" },
      { line: 9, text: "total = total + 1" },
    ],
    correctOption: 2,
    acceptedAnswers: null,
    hints: [
      "The total isn't off by a few tokens — it's off by exactly one ticket. Count how many times the loop actually runs.",
      "Every line checks out except the loop header on line 8. What is the last number range(1, 5) actually produces?",
    ],
  },
  {
    id: "rookie-shrunken-average",
    tier: "rookie",
    title: "The Case of the Shrunken Average",
    format: "mcq",
    code: `# Case: Three judges scored the science-fair volcano.
# The judges worked out the average by hand: 88.33...
# The scoreboard insists on a smaller, suspiciously
# tidy number.

scores = [88, 92, 85]

total = 0
for s in scores:
    total = total + s

average = total // len(scores)

print("Judge scores:", scores)
print("Average:", average)`,
    brokenOutput: "Judge scores: [88, 92, 85]\nAverage: 88\n",
    crashed: false,
    fixedOutput: "Judge scores: [88, 92, 85]\nAverage: 88.33333333333333\n",
    culpritLine: 12,
    fixedLines: ["average = total / len(scores)"],
    explanation:
      "// is floor division — it chops off everything after the decimal " +
      "point. 265 // 3 gives 88, silently discarding the .333… " +
      "A single / divides properly and keeps the decimals.",
    options: [
      { line: 12, text: "average = total / len(scores)" },
      { line: 12, text: "average = total // len(scores) + 0.33" },
      { line: 12, text: "average = round(total // len(scores))" },
      { line: 12, text: "average = total % len(scores)" },
    ],
    correctOption: 0,
    acceptedAnswers: null,
    hints: [
      "88 is almost right — but where did the .33 go? One kind of division throws remainders away.",
      "Line 12. Python has two division operators, and they do not do the same thing.",
    ],
  },
  {
    id: "rookie-broken-announcement",
    tier: "rookie",
    title: "The Case of the Broken Announcement",
    format: "mcq",
    code: `# Case: The morning announcement should congratulate
# the quiz champion with their points. Instead, the
# announcement system crashes before a single word.

champion = "Priya"
points = 97

message = "Champion: " + champion + " with " + points + " points!"

print(message)`,
    brokenOutput:
      'Traceback (most recent call last):\n  File "crime_scene.py", line 8, in <module>\n    message = "Champion: " + champion + " with " + points + " points!"\n              ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~^~~~~~~~\nTypeError: can only concatenate str (not "int") to str\n',
    crashed: true,
    fixedOutput: "Champion: Priya with 97 points!\n",
    culpritLine: 8,
    fixedLines: [
      'message = "Champion: " + champion + " with " + str(points) + " points!"',
    ],
    explanation:
      "You can't glue a number onto text with + in Python. str(points) " +
      'turns 97 into "97" so it joins cleanly. (f-strings do this for ' +
      'free: f"Champion: {champion} with {points} points!")',
    options: [
      { line: 10, text: "print(str(message))" },
      { line: 6, text: "points = int(97)" },
      {
        line: 8,
        text: 'message = "Champion: " + champion + " with points " + points',
      },
      {
        line: 8,
        text: 'message = "Champion: " + champion + " with " + str(points) + " points!"',
      },
    ],
    correctOption: 3,
    acceptedAnswers: null,
    hints: [
      "Read the traceback's last line: Python refused to glue a number onto text. Which value in the message isn't text?",
      "The crash is on line 8, right at '+ points'. points is the number 97 — text can only be joined to text.",
    ],
  },
  {
    id: "rookie-backwards-bargain",
    tier: "rookie",
    title: "The Case of the Backwards Bargain",
    format: "mcq",
    code: `# Case: The council compared samosa prices to find the
# CHEAPEST stall for the school fair. The "winner"
# announced is somehow the most expensive one.

stalls = ["Stall A", "Stall B", "Stall C"]
prices = [25, 15, 20]

best_index = 0
for i in range(1, len(stalls)):
    if prices[i] > prices[best_index]:
        best_index = i

print("Cheapest stall:", stalls[best_index])
print("Price:", prices[best_index], "tokens")`,
    brokenOutput: "Cheapest stall: Stall A\nPrice: 25 tokens\n",
    crashed: false,
    fixedOutput: "Cheapest stall: Stall B\nPrice: 15 tokens\n",
    culpritLine: 10,
    fixedLines: ["if prices[i] < prices[best_index]:"],
    explanation:
      "The comparison points the wrong way: > keeps the pricier stall " +
      "every time, so the loop crowns the most expensive one. Flipping " +
      "it to < keeps the cheaper stall — Stall B at 15 tokens.",
    options: [
      { line: 9, text: "for i in range(0, len(stalls)):" },
      { line: 10, text: "if prices[i] < prices[best_index]:" },
      { line: 10, text: "if prices[i] >= prices[best_index]:" },
      { line: 9, text: "for i in range(len(stalls) - 1):" },
    ],
    correctOption: 1,
    acceptedAnswers: null,
    hints: [
      "The code picked the BIGGEST price, not the smallest. Which line decides which stall wins?",
      "Line 10 keeps a stall when its price is GREATER than the current best. Say that out loud while hunting for the cheapest.",
    ],
  },
  {
    id: "rookie-impatient-counter",
    tier: "rookie",
    title: "The Case of the Impatient Counter",
    format: "mcq",
    code: `# Case: The librarian scanned a pile of 5 returned books
# to count how many were overdue. She scanned the whole
# pile -- three were late -- yet the counter reports zero.

days_late = [0, 3, 0, 7, 2]

def count_overdue(pile):
    overdue = 0
    for days in pile:
        if days > 0:
            overdue = overdue + 1
        return overdue

count = count_overdue(days_late)
print("Books scanned:", len(days_late))
print("Overdue books:", count)`,
    brokenOutput: "Books scanned: 5\nOverdue books: 0\n",
    crashed: false,
    fixedOutput: "Books scanned: 5\nOverdue books: 3\n",
    culpritLine: 12,
    fixedLines: ["    return overdue"],
    explanation:
      "return is indented inside the for-loop, so the function exits " +
      "during the very first iteration — and the first book has 0 days " +
      "late, so it returns 0. Un-indenting return to the function level " +
      "lets the loop finish counting all five books.",
    options: [
      {
        line: 12,
        text: "return overdue",
        note: "un-indented one level, so it runs after the loop finishes",
      },
      { line: 10, text: "if days >= 0:" },
      { line: 8, text: "overdue = 1" },
      { line: 9, text: "for days in pile[1:]:" },
    ],
    correctOption: 0,
    acceptedAnswers: null,
    hints: [
      "The function gave up after looking at exactly one book. What makes a function stop instantly?",
      "Look at the indentation of line 12. At that depth, return happens INSIDE the loop — on the very first book.",
    ],
  },

  // ------------------------------------------------------------------
  // DETECTIVE
  // ------------------------------------------------------------------
  {
    id: "detective-haunted-backpack",
    tier: "detective",
    title: "The Case of the Haunted Backpack",
    format: "mcq",
    code: `# Case: Two students each packed a brand-new bag for the
# field trip. Meera packed ONLY snacks. Yet her bag turned
# up full of Arjun's gear -- and his bag grew a snack.

def pack_bag(item, bag=[]):
    bag.append(item)
    return bag

arjun_bag = pack_bag("compass")
arjun_bag = pack_bag("torch", arjun_bag)

meera_bag = pack_bag("snacks")

print("Arjun's bag:", arjun_bag)
print("Meera's bag:", meera_bag)`,
    brokenOutput:
      "Arjun's bag: ['compass', 'torch', 'snacks']\nMeera's bag: ['compass', 'torch', 'snacks']\n",
    crashed: false,
    fixedOutput: "Arjun's bag: ['compass', 'torch']\nMeera's bag: ['snacks']\n",
    culpritLine: 5,
    fixedLines: [
      "def pack_bag(item, bag=None):",
      "    if bag is None:",
      "        bag = []",
    ],
    explanation:
      "Default argument values are evaluated ONCE, when the function is " +
      "defined — not once per call. Every call that omits bag shares " +
      "that single list, so Meera's 'new' bag was Arjun's all along. " +
      "The Python idiom: default to None and create the list inside.",
    options: [
      { line: 6, text: "bag.insert(0, item)" },
      { line: 7, text: "return bag.copy()" },
      {
        line: 5,
        text: "def pack_bag(item, bag=None):",
        note: "and inside the function: if bag is None: bag = []",
      },
      { line: 5, text: "def pack_bag(item, bag=()):" },
    ],
    correctOption: 2,
    acceptedAnswers: null,
    hints: [
      "Both bags contain the exact same items — as if they are the same bag. When was Meera's bag actually created?",
      "Line 5: the empty list in bag=[] is created once, when Python first reads the def line — not fresh on every call.",
    ],
  },
  {
    id: "detective-one-step-too-far",
    tier: "detective",
    title: "The Case of the One Step Too Far",
    format: "mcq",
    code: `# Case: The weather club computes each day's temperature
# change from the previous day. Monday to Thursday work
# fine. The Friday report never arrives.

temps = [31, 33, 29, 35, 30]

changes = []
for i in range(len(temps)):
    diff = temps[i + 1] - temps[i]
    changes.append(diff)

print("Temperatures:", temps)
print("Daily changes:", changes)`,
    brokenOutput:
      'Traceback (most recent call last):\n  File "crime_scene.py", line 9, in <module>\n    diff = temps[i + 1] - temps[i]\n           ~~~~~^^^^^^^\nIndexError: list index out of range\n',
    crashed: true,
    fixedOutput:
      "Temperatures: [31, 33, 29, 35, 30]\nDaily changes: [2, -4, 6, -5]\n",
    culpritLine: 8,
    fixedLines: ["for i in range(len(temps) - 1):"],
    explanation:
      "Five readings only have four gaps between them. When i reaches 4 " +
      "(the last index), temps[i + 1] asks for a sixth reading that " +
      "doesn't exist. Looping to len(temps) - 1 stops at the last valid " +
      "pair.",
    options: [
      { line: 9, text: "diff = temps[i] - temps[i - 1]" },
      { line: 8, text: "for i in range(len(temps) - 1):" },
      { line: 8, text: "for i in range(len(temps) + 1):" },
      { line: 9, text: "diff = temps[i + 1] - temps[i - 1]" },
    ],
    correctOption: 1,
    acceptedAnswers: null,
    hints: [
      "The traceback says 'list index out of range' on line 9. Which value of i makes temps[i + 1] point past the last day?",
      "There are 5 temperatures but only 4 day-to-day changes. The loop on line 8 runs one time too many.",
    ],
  },
  {
    id: "detective-vanishing-numbers",
    tier: "detective",
    title: "The Case of the Vanishing Numbers",
    format: "mcq",
    code: `# Case: The DJ removes every EVEN clap-count so only odd
# beats remain for the school anthem. After the purge,
# two even numbers are still standing.

beats = [2, 4, 5, 6, 8, 9, 12]

for beat in beats:
    if beat % 2 == 0:
        beats.remove(beat)

print("Remaining beats:", beats)`,
    brokenOutput: "Remaining beats: [4, 5, 8, 9]\n",
    crashed: false,
    fixedOutput: "Remaining beats: [5, 9]\n",
    culpritLine: 7,
    fixedLines: ["for beat in beats[:]:"],
    explanation:
      "Removing items from a list while looping over it shifts everything " +
      "after the removal one place left — so the loop skips the number " +
      "that slid into the gap. That's exactly why 4 and 8 survived. " +
      "Iterating over a copy (beats[:]) lets you remove from the original " +
      "safely.",
    options: [
      { line: 7, text: "for beat in beats[:]:", note: "iterate over a copy" },
      { line: 8, text: "if beat % 2 == 1:" },
      { line: 9, text: "beats.pop(0)" },
      { line: 8, text: "if beat % 2 == 0 and beat > 2:" },
    ],
    correctOption: 0,
    acceptedAnswers: null,
    hints: [
      "Exactly every OTHER even number survived. What happens to your place in a queue when the person ahead of you is removed?",
      "Line 7 walks the very list that line 9 is shrinking. Each removal shifts the rest left — and the loop marches past the shifted one.",
    ],
  },
  {
    id: "detective-silent-sorter",
    tier: "detective",
    title: "The Case of the Silent Sorter",
    format: "mcq",
    code: `# Case: Sports day. The teacher ranks the 100m race times,
# fastest first, to announce the podium. The scoreboard
# crashes the moment the winner is read out.

times = [12.4, 11.8, 13.1, 11.2]

ranking = times.sort()

print("Podium winner time:", ranking[0])
print("Full ranking:", ranking)`,
    brokenOutput:
      'Traceback (most recent call last):\n  File "crime_scene.py", line 9, in <module>\n    print("Podium winner time:", ranking[0])\n                                 ~~~~~~~^^^\nTypeError: \'NoneType\' object is not subscriptable\n',
    crashed: true,
    fixedOutput:
      "Podium winner time: 11.2\nFull ranking: [11.2, 11.8, 12.4, 13.1]\n",
    culpritLine: 7,
    fixedLines: ["ranking = sorted(times)"],
    explanation:
      ".sort() sorts the list in place and returns None — so ranking " +
      "captured None, and ranking[0] blew up. sorted(times) returns a " +
      "NEW sorted list you can store. (Or call times.sort() alone and " +
      "then use times.)",
    options: [
      { line: 7, text: "ranking = times.sorted()" },
      { line: 7, text: "ranking = times.sort(reverse=True)" },
      { line: 9, text: 'print("Podium winner time:", ranking)' },
      { line: 7, text: "ranking = sorted(times)" },
    ],
    correctOption: 3,
    acceptedAnswers: null,
    hints: [
      "The traceback says ranking is None. What does the .sort() METHOD actually hand back?",
      "Line 7: list.sort() sorts in place and returns nothing. You stored the nothing.",
    ],
  },
  {
    id: "detective-unruly-queue",
    tier: "detective",
    title: "The Case of the Unruly Queue",
    format: "mcq",
    code: `# Case: Raffle tickets were logged as text. The draw sorts
# them "smallest number first" -- but ticket 100 has cut
# in front of ticket 4, and ticket 9 is dead last.

tickets = ["9", "100", "23", "4"]

tickets.sort()

print("Draw order:")
for t in tickets:
    print("  ticket", t)`,
    brokenOutput:
      "Draw order:\n  ticket 100\n  ticket 23\n  ticket 4\n  ticket 9\n",
    crashed: false,
    fixedOutput:
      "Draw order:\n  ticket 4\n  ticket 9\n  ticket 23\n  ticket 100\n",
    culpritLine: 7,
    fixedLines: ["tickets.sort(key=int)"],
    explanation:
      "The tickets are strings, so sort() compares them character by " +
      "character, like dictionary words: '100' starts with '1', which " +
      "sorts before '4' and '9'. key=int makes sort compare numeric " +
      "values while keeping the original strings.",
    options: [
      { line: 7, text: "tickets.sort(reverse=True)" },
      { line: 7, text: "tickets.sort(key=int)" },
      { line: 5, text: 'tickets = ["09", "100", "023", "004"]' },
      { line: 7, text: "tickets.sort(key=len)" },
    ],
    correctOption: 1,
    acceptedAnswers: null,
    hints: [
      "'100' came before '4'. That's not number order — that's dictionary order. What TYPE are these tickets?",
      "Line 7 sorts strings character by character ('1' < '2' < '4' < '9'). Tell sort to compare them as integers.",
    ],
  },

  // ------------------------------------------------------------------
  // INSPECTOR
  // ------------------------------------------------------------------
  {
    id: "inspector-copycat-ledger",
    tier: "inspector",
    title: "The Case of the Copycat Ledger",
    format: "text",
    code: `# Case: The treasurer duplicated last month's ledger to
# draft next month's budget. Only the DRAFT was edited.
# Somehow the official ledger rewrote itself to match.

ledger = [500, 250, 125]

draft = ledger
draft.append(999)
draft[0] = 0

print("Draft budget:   ", draft)
print("Official ledger:", ledger)`,
    brokenOutput:
      "Draft budget:    [0, 250, 125, 999]\nOfficial ledger: [0, 250, 125, 999]\n",
    crashed: false,
    fixedOutput:
      "Draft budget:    [0, 250, 125, 999]\nOfficial ledger: [500, 250, 125]\n",
    culpritLine: 7,
    fixedLines: ["draft = ledger.copy()"],
    explanation:
      "Assignment never copies in Python — draft = ledger just gives the " +
      "same list a second name, so every edit shows up under both names. " +
      "ledger.copy() (or list(ledger), or ledger[:]) creates an " +
      "independent duplicate.",
    options: null,
    correctOption: null,
    acceptedAnswers: [
      "draft = ledger.copy()",
      "draft = list(ledger)",
      "draft = ledger[:]",
    ],
    hints: [
      "Two names — but how many actual lists exist in memory? The equals sign on line 7 didn't do what the treasurer thinks.",
      "Line 7 makes draft point at the SAME list as ledger. You need a real copy — lists have a method for exactly that.",
    ],
  },
  {
    id: "inspector-late-witnesses",
    tier: "inspector",
    title: "The Case of the Late Witnesses",
    format: "text",
    code: `# Case: Three witnesses were each assigned a statement
# number at the scene: 1, 2 and 3. Questioned later in
# court, every single witness repeats the LAST number.

statements = []
for n in [1, 2, 3]:
    statements.append(lambda: "I am witness number " + str(n))

for testify in statements:
    print(testify())`,
    brokenOutput:
      "I am witness number 3\nI am witness number 3\nI am witness number 3\n",
    crashed: false,
    fixedOutput:
      "I am witness number 1\nI am witness number 2\nI am witness number 3\n",
    culpritLine: 7,
    fixedLines: [
      'statements.append(lambda n=n: "I am witness number " + str(n))',
    ],
    explanation:
      "A lambda looks its variables up when it is CALLED, not when it is " +
      "created. By the time the witnesses testify, the loop is over and " +
      "n is 3 for everyone. Writing lambda n=n: snapshots the current " +
      "value into a default argument — each witness gets their own copy.",
    options: null,
    correctOption: null,
    acceptedAnswers: [
      "statements.append(lambda n=n: 'I am witness number ' + str(n))",
      "statements.append(lambda n=n: f'I am witness number {n}')",
    ],
    hints: [
      "The lambdas aren't lying — they're reporting n as it is NOW. When does a lambda look up its variables: when created, or when called?",
      "Line 7: the lambda captures the VARIABLE n, not its value at that moment. A default argument (lambda n=n:) freezes the value in.",
    ],
  },
  {
    id: "inspector-impossible-balance",
    tier: "inspector",
    title: "The Case of the Impossible Balance",
    format: "text",
    code: `# Case: The club collected two payments: 0.1 and 0.2
# tokens. Every human on Earth agrees that makes 0.3.
# The auditor disagrees.

payment_a = 0.1
payment_b = 0.2
expected = 0.3

total = payment_a + payment_b

if total == expected:
    print("Books balance perfectly.")
else:
    print("AUDIT FAILED!")
    print("Expected:", expected)
    print("Got:     ", total)`,
    brokenOutput: "AUDIT FAILED!\nExpected: 0.3\nGot:      0.30000000000000004\n",
    crashed: false,
    fixedOutput: "Books balance perfectly.\n",
    culpritLine: 11,
    fixedLines: ["if abs(total - expected) < 1e-9:"],
    explanation:
      "0.1 and 0.2 cannot be stored exactly in binary floating point, so " +
      "their sum is 0.30000000000000004 — microscopically off, and == " +
      "demands exact equality. The professional fix: compare the " +
      "difference against a tiny tolerance: abs(total - expected) < 1e-9.",
    options: null,
    correctOption: null,
    acceptedAnswers: [
      "if abs(total - expected) < 1e-9:",
      "if abs(expected - total) < 1e-9:",
      "if abs(total - expected) <= 1e-9:",
      "if abs(expected - total) <= 1e-9:",
      "if abs(total - expected) < 0.000000001:",
      "if round(total, 2) == expected:",
      "if round(total, 1) == expected:",
      "if round(total, 10) == expected:",
    ],
    hints: [
      "Look at what the computer says it Got. Computers store decimals in binary — and 0.1 in binary is a fraction that never ends.",
      "Line 11: comparing floats with == is the crime. Compare the DIFFERENCE to a tiny tolerance instead — abs() will help.",
    ],
  },
  {
    id: "inspector-crooked-rounding",
    tier: "inspector",
    title: "The Case of the Crooked Rounding",
    format: "text",
    code: `# Case: Prize money is rounded to whole tokens before
# payout. The accountant swears that .5 always rounds UP.
# The ledger tells a different story for 0.5 and 2.5.

payouts = [0.5, 1.5, 2.5, 3.5]

rounded = []
for p in payouts:
    rounded.append(round(p))

print("Raw payouts:    ", payouts)
print("Rounded payouts:", rounded)`,
    brokenOutput:
      "Raw payouts:     [0.5, 1.5, 2.5, 3.5]\nRounded payouts: [0, 2, 2, 4]\n",
    crashed: false,
    fixedOutput:
      "Raw payouts:     [0.5, 1.5, 2.5, 3.5]\nRounded payouts: [1, 2, 3, 4]\n",
    culpritLine: 9,
    fixedLines: ["rounded.append(int(p + 0.5))"],
    explanation:
      "Python's round() uses banker's rounding: exact .5 ties go to the " +
      "nearest EVEN number, so round(0.5) is 0 and round(2.5) is 2. To " +
      "always round .5 up for positive numbers, add 0.5 and truncate: " +
      "int(p + 0.5).",
    options: null,
    correctOption: null,
    acceptedAnswers: [
      "rounded.append(int(p + 0.5))",
      "rounded.append(int(p + .5))",
    ],
    hints: [
      "0.5 became 0, yet 1.5 became 2. round() isn't broken — it rounds .5 ties to the nearest EVEN number. Banks love it.",
      "Line 9: you can't talk round() out of it. Add 0.5 yourself, then chop the decimals off with int().",
    ],
  },
  {
    id: "inspector-negative-square",
    tier: "inspector",
    title: "The Case of the Negative Square",
    format: "text",
    code: `# Case: A drone hovering at altitude -5 (five metres BELOW
# the bridge deck) reports its squared distance from the
# deck. A squared number can never be negative. This one is.

altitude_squared = -5 ** 2

print("Drone altitude squared:", altitude_squared)

if altitude_squared < 0:
    print("SENSOR ERROR: impossible reading!")
else:
    print("Reading accepted.")`,
    brokenOutput:
      "Drone altitude squared: -25\nSENSOR ERROR: impossible reading!\n",
    crashed: false,
    fixedOutput: "Drone altitude squared: 25\nReading accepted.\n",
    culpritLine: 5,
    fixedLines: ["altitude_squared = (-5) ** 2"],
    explanation:
      "Exponentiation binds tighter than the minus sign: -5 ** 2 is read " +
      "as -(5 ** 2) = -25. Parentheses make the negative number stick " +
      "together: (-5) ** 2 squares the whole thing and gives 25.",
    options: null,
    correctOption: null,
    acceptedAnswers: ["altitude_squared = (-5) ** 2"],
    hints: [
      "Read -5 ** 2 the way Python does: which happens first, the minus or the power?",
      "Line 5: ** binds tighter than unary minus, so Python computes -(5 squared). Parentheses will keep the -5 together.",
    ],
  },
];

export function casesForTier(tier: Tier): CaseFile[] {
  const cases = CASES.filter((c) => c.tier === tier);
  if (cases.length === 0) {
    throw new Error(`No cases in the bank for tier "${tier}"`);
  }
  return cases;
}

export function getCase(id: string): CaseFile {
  const found = CASES.find((c) => c.id === id);
  if (!found) {
    throw new Error(`Case "${id}" is not in the bank`);
  }
  return found;
}

/**
 * Bank invariants (GAME.md authoring rules). The server calls this at
 * room creation — a broken bank must never reach a classroom.
 */
export function validateBank(): void {
  for (const c of CASES) {
    const lineCount = c.code.split("\n").length;
    if (lineCount < 10 || lineCount > 16) {
      throw new Error(`${c.id}: snippet is ${lineCount} lines, want 10-16`);
    }
    if (c.culpritLine < 1 || c.culpritLine > lineCount) {
      throw new Error(`${c.id}: culpritLine ${c.culpritLine} out of range`);
    }
    if (c.brokenOutput.length === 0 || c.fixedOutput.length === 0) {
      throw new Error(`${c.id}: missing captured output`);
    }
    if (c.crashed && !c.brokenOutput.includes("Traceback")) {
      throw new Error(`${c.id}: crashed case without a traceback`);
    }
    if (c.fixedLines.length === 0) {
      throw new Error(`${c.id}: missing fixedLines`);
    }
    if (c.format === "mcq") {
      if (!c.options || c.options.length !== 4) {
        throw new Error(`${c.id}: MCQ case needs exactly 4 options`);
      }
      if (
        c.correctOption === null ||
        c.correctOption < 0 ||
        c.correctOption >= 4
      ) {
        throw new Error(`${c.id}: correctOption out of range`);
      }
      const texts = new Set(c.options.map((o) => `${o.line}|${o.text}`));
      if (texts.size !== 4) {
        throw new Error(`${c.id}: duplicate MCQ options`);
      }
      if (c.acceptedAnswers !== null) {
        throw new Error(`${c.id}: MCQ case must not carry acceptedAnswers`);
      }
    } else {
      if (!c.acceptedAnswers || c.acceptedAnswers.length === 0) {
        throw new Error(`${c.id}: text case needs acceptedAnswers`);
      }
      if (c.options !== null || c.correctOption !== null) {
        throw new Error(`${c.id}: text case must not carry MCQ fields`);
      }
    }
  }
  for (const tier of ["rookie", "detective", "inspector"] as const) {
    if (CASES.filter((c) => c.tier === tier).length !== 5) {
      throw new Error(`Bank must hold exactly 5 ${tier} cases`);
    }
  }
}
