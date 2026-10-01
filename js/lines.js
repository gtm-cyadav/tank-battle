// Stage 3B (Chetan, 2026-10-01): every line the leaders say. Plain deadpan text. All lines approved by Chetan; the
// reasons behind them are in the project brief (section 15). Lines refer to leaders by NUMBER (the number in the brief's
// list, js/leaders.js), never by name, so renaming a leader later never breaks a line.
//   TAGLINE   shown on the intro card before each round
//   WATCH     the speech bubble on your own screen at the start of each round: [hunter version, hider version]
//   TAUNT     when this leader's tank hits the other tank
//   SURVIVE   when this leader's player survives the timer as the hider
//   PAIRS     matchup lines (one leader or group hits another); SINGLE: lines for one leader against anyone
// Which line shows after a hit (hitLine): the matchup line first, then the single-character line, then the leader's own
// taunt. A matchup line is for ONE direction only (a reversed pair has no line unless it has its own row).
// Nothing here is random and nothing is sent between the phones: the line is worked out from the match both phones share.

export const TAGLINE = [null,
  'Invading Russia in winter again? What could go wrong.',
  'We shall fight them on the beaches. After tea.',
  'In Soviet Russia, tank shoots you.',
  'The trains ran on time. The tanks, less so.',
  'I am not a crook. That was not me shooting.',
  'Best tank ever. Nobody has better tanks. Believe me.',
  "This is not a war. It's a special driving exercise.",
  'Same hoodie for three years. Unlimited stubbornness.',
  'Nothing to see here. Please stop looking in the back.',
  'Best tank in the world. It said so in my own newspaper.',
  'I am not short. The tank is just enormous.',
  'Veni, vidi, vici. Mostly vici, and the vidi was optional.',
  'War is now a monthly subscription. Cancel anytime.',
  'Whoever melted the ice owes us a country.',
  'Your hiding spot has been calculated. Please stay still.',
  'Et tu? Sorry, nothing personal. Just sharp.',
  'Rolled into Rome in a carpet. Rolling into your base in a tank.',
  'Tanks? I prefer a hundred thousand horses.',
  "Won the war, felt terrible, became peaceful. Please don't shoot me.",
  'Speech is three hours. The tank is on time.',
  'Sixer! Wait, wrong sport. Same energy.',
  'Not a tank. A very large, very peaceful bear.',
  'Conquered everything by 32. Now conquering your last life.',
  'Crossed the Alps with elephants. Your walls are not a problem.',
  'Horns are not real. The pillaging is.',
  'Tea first, then chaos.',
  'The spike on the helmet is for hats. Not for tanks.',
  "God told me to win. He didn't say how.",
  'Romans, I am coming. Wi-Fi, no.',
  'One spear. Zero fear. Three minutes.',
  'We are not amused. Please stop hiding.',
  'Ten assassination attempts. Still here. Still smoking.',
  'Sent his enemy a doctor when he was sick. Then went back to winning.',
  'Where my tank rolls, the grass never grows. Grass? Never met her.',
  'Master of hide-and-seek. Mountain forts, zero Wi-Fi.',
  'Nine advisors, one tank. Birbal, fix it.',
];

// [hunter version, hider version] (the figure on your own tank looks at you)
export const WATCH = [null,
  ["I'm watching. Please aim better than my generals.", "I'm watching. Hide well. Winter is not a plan."],
  ["I'm watching. Fight on. Tea is afterwards.", "I'm watching. Never surrender. Hide with dignity."],
  ["I'm watching. Take your time. I certainly will.", "I'm watching. Stall. It is the family trade."],
  ["I'm watching. Chin forward. Shell forward.", "I'm watching. Chin down. Just this once."],
  ["I'm watching. And recording. Allegedly not.", "I'm watching. Do not look for the tapes."],
  ["I'm watching. Nobody aims better. Believe me.", "I'm watching. Nobody hides better. Tremendous."],
  ["I'm watching. From the far end of a very long table.", "I'm watching. From the far end of a very long table."],
  ["I'm watching. Same hoodie. Better aim.", "I'm watching. Same hoodie. Stay stubborn."],
  ["I'm watching. Please do not look in the back.", "I'm watching. There is nothing to find here."],
  ["I'm watching. The newspaper says you will miss.", "I'm watching. The newspaper says you are safe."],
  ["I'm watching. I am not short. Look up.", "I'm watching. Retreat is called a manoeuvre."],
  ["I'm watching. Come, see, shoot.", "I'm watching. Trust nobody. Especially friends."],
  ["I'm watching. Your free trial of aiming has ended.", "I'm watching. Hiding is now a premium feature."],
  ["I'm watching. Stay calm. Stay cool. Keep firing.", "I'm watching. Waddle slowly. Nobody suspects a penguin."],
  ["I am watching. Please aim at the target. Thank you.", "I am watching. Please remain statistically still."],
  ["I'm watching. I have a knife and a plan. Mostly knife.", "I'm watching. Nothing personal. Just nervous."],
  ["I'm watching. Aim like you mean it, darling.", "I'm watching. Stay low. Roll up if needed."],
  ["I'm watching. A hundred thousand horses would be faster.", "I'm watching. The steppe teaches patience. And hay."],
  ["I'm watching. I will say sorry afterwards.", "I'm watching. Please don't shoot me. I have changed."],
  ["I'm watching. The speech starts after the round. Three hours.", "I'm watching. Stay calm. Stay on schedule."],
  ["I'm watching. Keep your eye on the ball. Tank.", "I'm watching. Play a straight bat. Stay hidden."],
  ["I'm watching. Honey first. Then the shell.", "I'm watching. Sit still. Bears hibernate."],
  ["I'm watching. Conquer the lane. Then the world.", "I'm watching. Rest. The world can wait."],
  ["I'm watching. The elephant is also watching.", "I'm watching. Walls are only a small Alp."],
  ["I'm watching. The horns are for show. The raid is not.", "I'm watching. Lie low. We raid at dawn."],
  ["I'm watching. Tea first. Then the shot.", "I'm watching. Sit still. Stillness is a ceremony."],
  ["I'm watching. Moustache forward. Tank forward.", "I'm watching. Keep still. The moustache must not twitch."],
  ["I'm watching. I hear voices. They say fire.", "I'm watching. The voices say stay put."],
  ["I'm watching. The hair is for intimidation.", "I'm watching. Even chariots must hide sometimes."],
  ["I'm watching. One spear. No fear. Aim.", "I'm watching. Shield up. Stay behind it."],
  ["I'm watching. We are not amused by misses.", "I'm watching. We are not amused. We are hidden."],
  ["I'm watching. Ten attempts so far. Do your best.", "I'm watching. Stay hidden. I have experience."],
  ["I'm watching. Aim well. The doctor is on standby.", "I'm watching. Stay safe. The bag has bandages."],
  ["I'm watching. Hungry for a hit.", "I'm watching. The horse skull says stay low."],
  ["I'm watching. Strike fast. Vanish faster.", "I'm watching. This is what forts are for."],
  ["I'm watching. Birbal says aim left. Probably.", "I'm watching. Birbal says hide. Birbal is wise."],
];

// Lines for ONE leader against any opponent. These leaders use the line as their taunt too.
export const SINGLE = {
  13: 'This kill is brought to you by our new subscription tier.',
  15: 'Your defeat was predicted at 97 percent.',
  19: "I'm sorry. You're still out.",
  26: 'Your tea is cold.',
  36: 'Birbal, explain this hit.',
};

export const TAUNT = [null,
  'Hit-and-Miss. Today, only the hit.',
  'Jolly good shot.',
  'Plan fulfilled. Ahead of schedule. For once.',
  'The chin led the way. The shell followed.',
  'Direct hit. The tape of it has a gap. Odd.',
  'Tremendous shot. The best shot. Many people say so.',
  'Direct hit. Special driving exercise: complete.',
  'Direct hit. The ammo arrived. Thank you.',
  'Direct hit. No weapons were used. Ignore the crater.',
  'Direct hit. The newspaper reports a perfect score.',
  'Direct hit. Not bad for a man this tall.',
  'I came. I saw. I hit. Dressing on the side.',
  SINGLE[13],
  'Direct hit. The medals were not for nothing.',
  SINGLE[15],
  'Direct hit. Sorry. It had to be done. Again.',
  'Direct hit. Eyeliner intact. Opponent not.',
  'Direct hit. No horses were needed. Barely.',
  SINGLE[19],
  'Direct hit. A speech will follow. It is long.',
  'Direct hit. Out for a golden duck.',
  'Direct hit. A very peaceful bear. Very peaceful.',
  'Direct hit. Another one for the map.',
  'Direct hit. The elephant did nothing. Moral support.',
  'Direct hit. A tidy raid. No horns involved.',
  SINGLE[26],
  'Direct hit. The moustache approves.',
  'Direct hit. The voices were right again.',
  'Direct hit. Even the hair is proud.',
  'Direct hit. One spear. Zero doubt.',
  'Direct hit. We are mildly amused.',
  'Direct hit. The cigar did not even go out.',
  'Direct hit. A doctor is on the way. Courtesy.',
  'Direct hit. Time for a snack.',
  'Direct hit. Came from the hills. Left for the hills.',
  SINGLE[36],
];

export const SURVIVE = [null,
  'The plan worked. Please mark the date.',
  'Never was so little found by so many.',
  'Stalling worked. The clock did the rest.',
  'The chin was a decoy. Thank you for looking.',
  'I was never here. The tapes agree. Mostly.',
  'Biggest hide ever. Nobody has hidden bigger.',
  'Escaped by horse. Shirtless. Naturally.',
  'Survived the round. No new hoodie required.',
  'Where was I? Nowhere. There is no proof.',
  'Hid so well the newspaper called it a record.',
  'I was not lost. I was strategically elsewhere.',
  'Hid all round. Nobody stabbed me. A good day.',
  'I was not found. Please rate this hide.',
  'Nobody suspects a penguin. Nobody found one.',
  'Search result: nothing. As calculated.',
  'Hid in plain sight. Smiled nervously. It worked.',
  'Rolled up in a carpet. Nobody checked.',
  'Hid under the hay. The horses kept quiet.',
  'Peace worked. Please clap.',
  'Survived the round. The speech starts now. Please sit.',
  "Not out. A true captain's innings.",
  'Hibernated all round. Nobody found the bear.',
  'Not conquered. Not found. Still undefeated.',
  'Crossed the Alps. Hid behind one wall. Easy.',
  'Nobody found the longship. Nobody asked about the silver.',
  'Hid the whole round. The tea stayed warm.',
  'Not found. Moustache and helmet intact.',
  'The voices said hide. I listened.',
  'Nobody found me. The chariot is just resting.',
  'Hid behind the shield. Nobody saw a thing.',
  'We were not found. We are, briefly, amused.',
  'Hidden again. Still smoking. Still here.',
  'Not found. The doctor\'s bag stayed closed.',
  'Nobody found me. I will eat anyway.',
  'Hide-and-seek champion, unbeaten since 1674.',
  'Hidden all round. Birbal wants the credit.',
];

// ---- matchup lines (brief section 7) ----------------------------------------------------------------------------
// Groups of leader numbers (Chetan approved who counts as what, 2026-10-01). The one place they are listed.
const G = {
  china: [22], usaAny: [5, 6], usaModern: [6], pakistan: [21], indiaModern: [20], ukraine: [8], russia: [7],
  russiaNapoleon: [7, 3],            // for the Napoleon pair the Soviet Union counts as Russia (Moscow fits both)
  soviet: [3], germanyWW2: [1], britainWW2: [2], britainAny: [2, 29, 31], brutus: [16], caesar: [12], romeAny: [12, 16],
  cleopatra: [17], napoleon: [11], hannibal: [24], genghis: [18], alexander: [23], ashoka: [19],
  northKorea: [10], cuba: [32], iraq: [9], vikings: [25], joan: [28], boudica: [29], shivaji: [35], akbar: [36],
};
// [who hits, who gets hit, line]. In the brief's order.
export const PAIRS = [
  [G.china, G.usaAny, 'Trade war, but with tanks.'],
  [G.usaModern, G.china, 'Tariffs. Now with shells.'],
  [G.pakistan, G.indiaModern, 'Sixer! Out of the stadium, and out of the game.'],
  [G.indiaModern, G.pakistan, 'Bowled! Middle stump. Again.'],
  [G.ukraine, G.russia, 'The hoodie beats the horse.'],
  [G.soviet, G.germanyWW2, 'General Winter sends his regards.'],
  [G.germanyWW2, G.soviet, 'Winter is coming. Oh no, it arrived early.'],
  [G.britainWW2, G.germanyWW2, "Tea break. You're out."],
  [G.brutus, G.caesar, 'Et tu? Yes, me. Sorry.'],
  [G.caesar, G.brutus, 'I said stay home on the Ides of March.'],
  [G.cleopatra, G.caesar, 'Thanks for the carpet ride.'],
  [G.napoleon, G.russiaNapoleon, 'Moscow was lovely. The walk home, not so much.'],
  [G.russiaNapoleon, G.napoleon, 'General Winter says hello again.'],
  [G.hannibal, G.romeAny, 'The elephants remember.'],
  [G.genghis, G.china, "Nice wall. Didn't help."],
  [G.alexander, G.ashoka, 'Made it to India. Too many mangoes. Turned back.'],
  [G.ashoka, G.alexander, 'Peace, brother. Turn around.'],
  [G.northKorea, G.usaAny, 'My button is bigger. It says so in my newspaper.'],
  [G.usaModern, G.northKorea, 'Rocket Man is grounded.'],
  [G.cuba, G.usaAny, 'Eleventh attempt. You missed.'],
  [G.iraq, G.usaAny, 'Found the weapons? No? Us neither.'],
  [G.vikings, G.britainAny, 'Popped in for tea. Kept the silver.'],
  [G.joan, G.britainAny, 'Sorry about Orléans. Not sorry.'],
  [G.boudica, G.romeAny, 'Rome, meet the chariot.'],
  [G.shivaji, G.akbar, 'Mountain fox beats wise emperor. Sorry, Birbal.'],
];

// The line when leader `from` hits leader `to`: { text, kind: 'pair' | 'single' | 'taunt' }, or null for an unknown leader.
export function hitLine(from, to) {
  if (!TAUNT[from]) return null;
  for (const [a, b, text] of PAIRS) if (a.includes(from) && b.includes(to)) return { text, kind: 'pair' };
  if (SINGLE[from]) return { text: SINGLE[from], kind: 'single' };
  return { text: TAUNT[from], kind: 'taunt' };
}
// The line when leader `n` survives the timer as the hider.
export const surviveLine = n => SURVIVE[n] || null;
// The speech bubble line for leader `n` in this role ('hunter' | 'hider').
export const watchLine = (n, role) => WATCH[n] ? WATCH[n][role === 'hider' ? 1 : 0] : null;
export const tagline = n => TAGLINE[n] || '';

// What the result card quotes, from the match both phones share: `result` is { win: 'host' | 'guest', how: 'hit' | 'time' }
// and `lead` is { host, guest } (leader numbers). The winner speaks: after a hit the hunter's leader (taunt), after the
// timer the hider's leader (survival line). { who: the leader number, tag: 'Direct hit' | 'Survived', text }, or null
// (a surrender has no quote, and an unknown leader has none).
export function quoteFor(result, lead) {
  if (!result || !lead || (result.how !== 'hit' && result.how !== 'time')) return null;
  const winner = result.win, loser = winner === 'host' ? 'guest' : 'host';
  const who = lead[winner], to = lead[loser];
  if (result.how === 'hit') { const l = hitLine(who, to); return l && { who, tag: 'Direct hit', text: l.text, kind: l.kind }; }
  const text = surviveLine(who);
  return text && { who, tag: 'Survived', text, kind: 'survive' };
}

// ---- Stage 4A (Chetan, 2026-10-01): the easter-egg texts ---------------------------------------------------------
// BUMP: what each leader says when the two tanks stay touching (one line each). Cleopatra's and Genghis Khan's are Chetan's
// own, kept exactly as written. The rest are in the brief (section 16) with their approval status.
export const BUMP = [null,
  'Sorry. The map was upside down.',
  'Mind the teacup, old chap.',
  'I am not blocking you. I am stalling.',
  'Mind the chin.',
  'That bump is off the record.',
  'Nobody bumps better. Believe me.',
  'Not a collision. A special parking exercise.',
  'Careful. I only own the one hoodie.',
  'No bump occurred. Inspectors may leave.',
  'My hair took no damage. The newspaper says so.',
  'I am not short. You are simply too close.',
  'Careful who stands this close to a Caesar.',
  'Bump detected. Premium bumps cost extra.',
  'Mind the penguin. He has medals.',
  'I predicted this bump. It was not avoided.',
  'Do not turn your back. Or your turret.',
  'Watch the eyeliner',
  "Move, I'm conquering",
  'I am sorry. Peace be with your bumper.',
  'Please wait. The speech is not over.',
  'Howzat! Was that a no-ball?',
  'Careful. The honey pot is delicate.',
  'Even Persia gave way. Please give way.',
  'Mind the elephant. He bumps back.',
  'Longship bumper. Very sturdy. Sorry.',
  'Mind the tea set. Then mind your manners.',
  'My moustache took the hit. It is fine.',
  'God never said anything about bumping.',
  'Watch the hair. And the wheels.',
  'Shield up. Bump absorbed.',
  'We are not amused by this bump.',
  'Mind the cigar. It survived worse.',
  'A bump! Is anyone hurt? I have a bag.',
  'Hungry and bumping. Bad combination.',
  'Found you. Wait, you found me.',
  'Birbal, explain this bump.',
];
export const bumpLine = n => BUMP[n] || null;
// What the bubble shows when the tanks bump: the hunter's leader first, then the hider's (the same order on both phones).
// lead: { host, guest } leader numbers; hunter: 'host' | 'guest'.
export function bumpPair(lead, hunter) {
  if (!lead || !hunter) return null;
  const a = lead[hunter], b = lead[hunter === 'host' ? 'guest' : 'host'];
  if (!BUMP[a] || !BUMP[b]) return null;
  return [{ who: a, text: BUMP[a] }, { who: b, text: BUMP[b] }];
}
// Bobblehead poke: a random line from your own leader, from the lines they already say (watching, taunt, survival, single,
// bump). No new text; the choice is local to the phone that was tapped.
export function pokeLines(n) {
  if (!TAUNT[n]) return [];
  const all = [...(WATCH[n] || []), TAUNT[n], SURVIVE[n], SINGLE[n], BUMP[n]].filter(Boolean);
  return [...new Set(all)];
}
export function pokeLine(n, last, rand = Math.random) {
  const pool = pokeLines(n);
  if (!pool.length) return null;
  const fresh = pool.filter(t => t !== last);
  return (fresh.length ? fresh : pool)[Math.floor(rand() * (fresh.length || pool.length))];
}
export const CLUCK = 'Cluck.';
export const SORRY = 'Sorry!';
export const REMATCH = 'Best of 3? Make it 5.';
