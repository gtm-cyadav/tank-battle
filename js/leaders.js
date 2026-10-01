// Stage 3A: who the 36 leaders are on screen. The number is the leader's number in the brief's list (section 6), which
// is also the model (models/bNN.glb) and the flag (flags.js).
//   name:  the PARODY name shown everywhere (Chetan's rule, 2026-09-30; plain deadpan text)
//   place: country / era / kingdom exactly as it is
//   group: which heading the picker files the card under
// Taglines, "watching" lines and taunts are Stage 3B and not here.
export const GROUPS = ['Modern', 'Cold War', 'World Wars', 'Empires, 1500-1800s', 'Medieval', 'Ancient', 'The future'];

const L = (name, place, group) => ({ name, place, group });
export const LEADERS = [null,
  L('Adolf Hit-and-Miss', 'Germany, WW2', 2),
  L('Winston Churchill-Out', 'Britain, WW2', 2),
  L('Joseph Stalling', 'Soviet Union, WW2', 2),
  L('Benito Chinsolini', 'Italy, WW2', 2),
  L('Richard Nix-It', 'USA, Cold War', 1),
  L('Donald Trumpet', 'USA, modern', 0),
  L("Vladimir Puttin' Around", 'Russia, modern', 0),
  L('Volodymyr Zel-Hoodie-sky', 'Ukraine, modern', 0),
  L('Saddam Hush-Hush-ein', 'Iraq, 2003', 0),
  L('Kim Jong-Fluff', 'North Korea', 1),
  L('Napoleon Bone-a-Petite', 'France, 1800s', 3),
  L('Julius Caesar Salad', 'Rome, ancient', 5),
  L('Elon Must-Launch', 'Future: Megacorp State', 6),
  L('Marshal Waddle-ington', 'Future: Neo-Antarctica', 6),
  L('Chairbot Beep-a-Lot', 'Future: The AI Council', 6),
  L('Marcus Brute-Force', 'Rome, ancient', 5),
  L('Cleopatra Rugs-to-Riches', 'Egypt, ancient', 5),
  L('Genghis Con-Quest', 'Mongol Empire', 4),
  L('Ashoka Sorry-Ka', 'India, ancient', 5),
  L('Narendra Modi-Fied', 'India, modern', 0),
  L('Imran Khan-Bowled-Over', 'Pakistan, modern', 0),
  L('Xi Jin-Pooh', 'China, modern', 0),
  L('Alexander the Grape', 'Macedon, ancient', 5),
  L('Hannibal Trunk-a-Lot', 'Carthage, ancient', 5),
  L('Erik the Red-Handed', 'Vikings', 4),
  L('Oda Nobu-Naga-Tea', 'Japan, feudal', 4),
  L('Kaiser Wilhelm Two-Stache', 'Germany, WW1', 2),
  L('Joan of Arc-ade', 'France, medieval', 4),
  L('Boudica Hair-Raiser', 'Britain, ancient', 5),      // 29-36: drafts, waiting for Chetan's approval (batch 3)
  L('Shaka Spear-Ka', 'Zulu Kingdom', 3),
  L('Queen Victoria Sponge', 'Britain, Victorian', 3),
  L('Fidel Cigar-stro', 'Cuba, Cold War', 1),
  L('Saladin Sal-a-Doctor', 'Ayyubid Sultanate', 4),
  L('Attila the Hun-gry', 'Hunnic Empire', 5),
  L('Shivaji Hide-and-Seek-Ji', 'Maratha Empire, India', 3),
  L('Akbar Ask-Birbal', 'Mughal Empire, India', 3),
];
export const COUNT = LEADERS.length - 1;
export const nameOf = n => LEADERS[n]?.name || '';
// Stage 4A: the short name on the two-leader bump bubble (the first word of the parody name; a few that would not say who it is are spelled out)
const SHORT = { 14: 'Waddle-ington', 27: 'Kaiser', 31: 'Victoria' };
export const shortName = n => SHORT[n] || nameOf(n).split(' ')[0];
