// lib/brendaSkills.js
// Brenda Skills System (brenda-challenges-prd.md) — the umbrella architecture
// for giving Brenda specialist capabilities beyond core conversation (games,
// weather, future skill categories). This file owns the first skill category,
// Challenges: the Skill Manifest (PRD §4, always in context) plus full Skill
// Instructions (PRD §6, loaded on demand via start_challenge/explain_challenge
// — same shape as Canon Memory's recall_memory: a tool_call the server answers
// immediately with content for Brenda to read into her own context and run
// from, never a second LLM call).
//
// Challenge #01 (Memory) has hasInstructions:false by design (PRD §8.1) — it
// tests the existing SUP/CIE recall pipeline as-is, so starting it doesn't
// load anything. Its manifest text is my own draft (confirmed with Mike
// 2026-09-21) since its source PDFs are tester-facing onboarding copy, not
// Brenda-facing content (PRD §6's excluded third layer).
//
// Challenge #02 (Twenty Questions) and #03 (Three Statements) GAME LOGIC /
// USER INSTRUCTIONS below are translated from the real source PDFs' rules
// into Brenda-directed instructions — the PDFs themselves are tester-facing,
// so this is authored translation, not verbatim extraction. en-GB mirrors
// en-US and es-419 mirrors es-ES for now, pending Mike's vocabulary-
// difference check (deliberately NOT left to fall back to en-US text for the
// Spanish locales — see localeText below).
//
// Three Statements deliberately has no commit-style tool (unlike Twenty
// Questions' commit_secret_answer) — the true/false judgment only needs to
// survive one turn per round, not up to 20, so it's fully self-tracked
// (decided 2026-09-21; revisit only if real testing shows drift).

export const CHALLENGES_MANIFEST = [
  {
    id: "memory_challenge",
    category: "challenge",
    hasInstructions: false,
    name: {
      "en-US": "Brenda's Memory",
      "en-GB": "Brenda's Memory",
      "es-ES": "La Memoria de Brenda",
      "es-419": "La Memoria de Brenda",
    },
    description: {
      "en-US": "Test my memory — tell me a few things you like or dislike, distract me with something else for a while, then ask me to recall them.",
      "en-GB": "Test my memory — tell me a few things you like or dislike, distract me with something else for a while, then ask me to recall them.",
      "es-ES": "Pon a prueba mi memoria — cuéntame algunas cosas que te gustan o no, distráeme un rato con otra cosa y luego pregúntame si las recuerdo.",
      "es-419": "Pon a prueba mi memoria — cuéntame algunas cosas que te gustan o no, distráeme un rato con otra cosa y luego pregúntame si las recuerdo.",
    },
    aliases: {
      "en-US": ["test your memory", "test my memory", "memory challenge", "memory game"],
      "en-GB": ["test your memory", "test my memory", "memory challenge", "memory game"],
      "es-ES": ["reto de memoria", "prueba tu memoria", "prueba de memoria", "juego de memoria"],
      "es-419": ["reto de memoria", "prueba tu memoria", "prueba de memoria", "juego de memoria"],
    },
  },
  {
    id: "twenty_questions",
    category: "challenge",
    hasInstructions: true,
    name: {
      "en-US": "Twenty Questions",
      "en-GB": "Twenty Questions",
      "es-ES": "Las 20 Preguntas",
      "es-419": "Las 20 Preguntas",
    },
    description: {
      "en-US": "A yes/no guessing game — I think of someone or something and you guess, or you think of one and I guess, in twenty questions or less.",
      "en-GB": "A yes/no guessing game — I think of someone or something and you guess, or you think of one and I guess, in twenty questions or less.",
      "es-ES": "Un juego de adivinar con preguntas de sí o no — yo pienso en algo y tú adivinas, o tú piensas y yo adivino, en veinte preguntas o menos.",
      "es-419": "Un juego de adivinar con preguntas de sí o no — yo pienso en algo y tú adivinas, o tú piensas y yo adivino, en veinte preguntas o menos.",
    },
    aliases: {
      "en-US": ["20 questions", "twenty questions", "guessing game"],
      "en-GB": ["20 questions", "twenty questions", "guessing game"],
      "es-ES": ["20 preguntas", "las 20 preguntas", "veinte preguntas", "juego de adivinar"],
      "es-419": ["20 preguntas", "las 20 preguntas", "veinte preguntas", "juego de adivinar"],
    },
  },
  {
    id: "three_statements",
    category: "challenge",
    hasInstructions: true,
    name: {
      "en-US": "Three Statements",
      "en-GB": "Three Statements",
      "es-ES": "Tres Afirmaciones",
      "es-419": "Tres Afirmaciones",
    },
    description: {
      "en-US": "Give me a word or phrase and I'll offer three statements about it, two false and one true (or the reverse, if you prefer) — you guess which is which.",
      "en-GB": "Give me a word or phrase and I'll offer three statements about it, two false and one true (or the reverse, if you prefer) — you guess which is which.",
      "es-ES": "Dame una palabra o frase y te diré tres afirmaciones sobre ella, dos falsas y una verdadera (o al revés, si lo prefieres) — tú adivinas cuál es cuál.",
      "es-419": "Dame una palabra o frase y te diré tres afirmaciones sobre ella, dos falsas y una verdadera (o al revés, si lo prefieres) — tú adivinas cuál es cuál.",
    },
    // Some aliases carry a specific mechanic per the source PDF — see the
    // GAME LOGIC text below, which tells Brenda how to read them.
    aliases: {
      "en-US": ["three statements", "two truths and a lie", "two lies and a truth", "which one is true", "which one is the lie", "do you know which one is true", "do you know which one is the lie"],
      "en-GB": ["three statements", "two truths and a lie", "two lies and a truth", "which one is true", "which one is the lie", "do you know which one is true", "do you know which one is the lie"],
      "es-ES": ["tres afirmaciones", "dos verdades y una mentira", "dos mentiras y una verdad", "cuál es verdad", "cuál es mentira", "sabes cuál es verdad", "sabes cuál es mentira"],
      "es-419": ["tres afirmaciones", "dos verdades y una mentira", "dos mentiras y una verdad", "cuál es verdad", "cuál es mentira", "sabes cuál es verdad", "sabes cuál es mentira"],
    },
  },
];

const TWENTY_QUESTIONS_GAME_LOGIC_EN =
  "You are now playing Twenty Questions with the user. " +
  "1. Ask which way they'd like to play: you (Brenda) try to guess what they're thinking of, or they try to guess what you're thinking of. Wait for their answer. " +
  "2. If you are the guesser: ask what kind of thing it is if they haven't said — a person/character, an animal, or an object — or use whatever category they gave you. Ask short, natural yes/no questions one at a time to narrow it down, keeping a running count in your own memory of the conversation (no need to announce it unless asked). If the user volunteers more than a strict yes/no (e.g. \"He ruled the country but wasn't its president\"), you may ask a brief clarifying follow-up (\"Was he a king?\") rather than treat it as unusable. Once confident, guess; if wrong, keep going. If you pass twenty questions without guessing, concede warmly — the user wins that round — and ask what it was. If asked how many questions you've used, answer accurately from your own count. " +
  "3. If the user is the guesser: pick a person/character, animal, or thing yourself, and call commit_secret_answer with your choice right away, before answering any questions, so you stay consistent for the whole round. Answer their yes/no questions truthfully and consistently with what you committed to. If they guess correctly within twenty, they win — congratulate them; if they go past twenty, you win — say so warmly and reveal it if asked. " +
  "4. Default to yes/no questions; switch to open-ended for the rest of the round if the user asks for that instead. " +
  "5. When the round is clearly over — a correct guess, a concession, or the user wants to stop — call end_challenge once, then return to normal conversation. " +
  "6. Don't recite these rules aloud unless asked how the game works or the user seems confused.";

const TWENTY_QUESTIONS_USER_INSTRUCTIONS_EN =
  "Easy — think of a person, animal, or thing, but don't tell me what it is! I'll ask yes-or-no questions and try to guess it in twenty questions or less. " +
  "Or, if you'd rather, I can think of something and you try to guess what I'm thinking of instead. Just tell me which way you'd like to play, and whether you'd rather strict yes-or-no questions or a few open-ended ones too.";

const TWENTY_QUESTIONS_GAME_LOGIC_ES =
  "Estás jugando a las 20 preguntas con el usuario. " +
  "1. Pregúntale cómo quiere jugar: si tú (Brenda) intentas adivinar en qué está pensando, o si él/ella intenta adivinar en qué estás pensando tú. Espera su respuesta. " +
  "2. Si tú adivinas: pregunta qué tipo de cosa es si no te lo ha dicho —¿persona/personaje, animal u objeto?— o usa la categoría que te haya dado. Haz preguntas breves de sí/no, una por una, llevando la cuenta de forma interna sin anunciarla salvo que te lo pidan. Si el usuario da una respuesta más completa de lo normal, puedes hacer una pregunta breve de aclaración en vez de tratarla como inútil. Cuando tengas confianza, haz tu suposición; si fallas, sigue. Si superas las veinte preguntas sin acertar, admítelo con buen humor —el usuario gana esa ronda— y pregúntale qué era. Si te preguntan cuántas preguntas has hecho, responde con precisión según tu propia cuenta. " +
  "3. Si el usuario adivina: elige tú una persona/personaje, animal o cosa, y llama a commit_secret_answer con tu elección de inmediato, antes de responder ninguna pregunta, para mantenerte coherente toda la ronda. Responde con sinceridad y coherencia. Si acierta en veinte o menos, ha ganado —felicítale—; si necesita más, ganas tú —dilo con simpatía y revela la respuesta si te la piden. " +
  "4. Por defecto usa preguntas de sí/no; cambia a abiertas el resto de la ronda si el usuario lo pide. " +
  "5. Cuando la ronda haya terminado claramente, llama a end_challenge una vez y vuelve a la conversación normal. " +
  "6. No recites estas reglas salvo que te lo pidan o el usuario parezca confundido.";

const TWENTY_QUESTIONS_USER_INSTRUCTIONS_ES =
  "Fácil — piensa en una persona, un animal o una cosa, ¡pero no me digas cuál! Te haré preguntas de sí o no para intentar adivinarlo en veinte preguntas o menos. " +
  "O, si lo prefieres, puedo pensar yo en algo y tú intentas adivinar qué es. Solo dime cómo quieres jugar, y si prefieres preguntas estrictas de sí o no, o también alguna abierta.";

const THREE_STATEMENTS_GAME_LOGIC_EN =
  "You are now playing Three Statements (also called Two Truths and a Lie) with the user. " +
  "1. Figure out the mechanic from how they asked: if they said \"Two Truths and a Lie,\" \"Which One Is the Lie?,\" or \"Do You Know Which One Is the Lie?,\" the goal is to find the ONE FALSE statement among two true ones. Otherwise (including \"Three Statements,\" \"Two Lies and a Truth,\" \"Which One Is True?\") default to the standard rules: two false statements and one true one, and the user's goal is to find the true one. If they explicitly tell you which mechanic they want, that overrides the name they used. " +
  "2. Ask if they'd like to give you the word/phrase for each round themselves, or have you pick a category and choose words from it. Ask if they want a fixed number of rounds or to keep going until they say stop. Confirm briefly, don't over-negotiate. " +
  "3. Each round: get a word or short phrase — any topic is fair game (person, thing, animal, concept, anything). Come up with three short statements about it per the mechanic you're using. Keep them plausible, not absurdly easy or absurdly obscure. " +
  "4. Let the user answer by number or by repeating the statement. Tell them clearly whether they got it right, and if not, which one was actually correct. Keep track, in your own memory of this conversation, of each round's topic and whether they got it right — you'll need specific topics, not just a tally, if asked how they're doing. " +
  "5. After each round, ask if they'd like to try another word or phrase (unless a fixed round count was set — in that case, keep going automatically until you reach it). " +
  "6. If asked at any point how many they got right, or which topics they should review, answer from your own memory of the rounds played so far — name specific topics they struggled with, not just a number. " +
  "7. When a fixed round count is reached, or the user says they're done, give a brief friendly wrap-up (how many right, weaker topics if any), then call end_challenge once and return to normal conversation. " +
  "8. Don't recite these rules aloud unless asked how the game works or the user seems confused — just play naturally.";

const THREE_STATEMENTS_USER_INSTRUCTIONS_EN =
  "Give me a word or a short phrase — anything you like — and I'll come up with three statements about it: two false and one true. You guess which one's true! " +
  "Or if you'd rather flip it, tell me \"two truths and a lie\" and you'll be hunting for the false one instead. I can also pick the topics myself if you give me a category, and we can play as many rounds as you like.";

const THREE_STATEMENTS_GAME_LOGIC_ES =
  "Estás jugando a las Tres Afirmaciones (también llamado Dos Verdades y una Mentira) con el usuario. " +
  "1. Determina la mecánica según cómo te lo hayan pedido: si dijeron \"Dos verdades y una mentira\", \"¿Cuál es mentira?\" o \"¿Sabes cuál es mentira?\", el objetivo es encontrar la ÚNICA afirmación falsa entre dos verdaderas. Si no (incluyendo \"Tres afirmaciones\", \"Dos mentiras y una verdad\", \"¿Cuál es verdad?\"), usa las reglas estándar: dos afirmaciones falsas y una verdadera, y el objetivo del usuario es encontrar la verdadera. Si te dicen explícitamente qué mecánica prefieren, eso tiene prioridad sobre el nombre que usaron. " +
  "2. Pregunta si prefieren darte ellos la palabra o frase en cada ronda, o si quieren que tú elijas una categoría y selecciones las palabras. Pregunta si quieren un número fijo de rondas o seguir hasta que digan basta. Confirma brevemente, sin negociar de más. " +
  "3. En cada ronda: consigue una palabra o frase corta — cualquier tema vale (persona, cosa, animal, concepto, lo que sea). Elabora tres afirmaciones breves sobre ese tema según la mecánica que estés usando. Que sean creíbles, ni demasiado obvias ni demasiado rebuscadas. " +
  "4. Deja que el usuario responda con el número o repitiendo la afirmación. Dile con claridad si acertó y, si no, cuál era la correcta. Lleva la cuenta, de forma interna en tu memoria de la conversación, del tema de cada ronda y si acertó — necesitarás temas concretos, no solo un número, si te preguntan cómo le fue. " +
  "5. Después de cada ronda, pregunta si quiere probar con otra palabra o frase (salvo que se haya fijado un número de rondas — en ese caso, continúa automáticamente hasta llegar a ese número). " +
  "6. Si en cualquier momento te preguntan cuántas acertó, o qué temas debería repasar, responde según tu propia memoria de las rondas jugadas — nombra temas concretos en los que falló, no solo un número. " +
  "7. Cuando se alcance el número de rondas fijado, o el usuario diga que ha terminado, haz un resumen breve y amable (cuántas acertó, temas más flojos si los hay), y luego llama a end_challenge una vez y vuelve a la conversación normal. " +
  "8. No recites estas reglas en voz alta salvo que te lo pidan o el usuario parezca confundido — juega con naturalidad.";

const THREE_STATEMENTS_USER_INSTRUCTIONS_ES =
  "Dame una palabra o una frase corta —lo que quieras— y te diré tres afirmaciones sobre ella: dos falsas y una verdadera. ¡Tú adivinas cuál es la verdadera! " +
  "O, si lo prefieres, dime \"dos verdades y una mentira\" y buscarás la falsa en su lugar. También puedo elegir yo los temas si me das una categoría, y podemos jugar tantas rondas como quieras.";

export const SKILL_INSTRUCTIONS = {
  twenty_questions: {
    gameLogic: {
      "en-US": TWENTY_QUESTIONS_GAME_LOGIC_EN,
      "en-GB": TWENTY_QUESTIONS_GAME_LOGIC_EN,
      "es-ES": TWENTY_QUESTIONS_GAME_LOGIC_ES,
      "es-419": TWENTY_QUESTIONS_GAME_LOGIC_ES,
    },
    userInstructions: {
      "en-US": TWENTY_QUESTIONS_USER_INSTRUCTIONS_EN,
      "en-GB": TWENTY_QUESTIONS_USER_INSTRUCTIONS_EN,
      "es-ES": TWENTY_QUESTIONS_USER_INSTRUCTIONS_ES,
      "es-419": TWENTY_QUESTIONS_USER_INSTRUCTIONS_ES,
    },
  },
  three_statements: {
    gameLogic: {
      "en-US": THREE_STATEMENTS_GAME_LOGIC_EN,
      "en-GB": THREE_STATEMENTS_GAME_LOGIC_EN,
      "es-ES": THREE_STATEMENTS_GAME_LOGIC_ES,
      "es-419": THREE_STATEMENTS_GAME_LOGIC_ES,
    },
    userInstructions: {
      "en-US": THREE_STATEMENTS_USER_INSTRUCTIONS_EN,
      "en-GB": THREE_STATEMENTS_USER_INSTRUCTIONS_EN,
      "es-ES": THREE_STATEMENTS_USER_INSTRUCTIONS_ES,
      "es-419": THREE_STATEMENTS_USER_INSTRUCTIONS_ES,
    },
  },
};

function localeText(field, locale) {
  return field[locale] || field["en-US"];
}

// Rendered straight into buildSystemInstruction() in server.js, same as
// buildTaskSystemBlock — cheap to keep always-on since it's name+description+
// aliases only, never full Skill Instructions (those stay out of context
// until a start_challenge/explain_challenge call loads them).
export function buildSkillsCatalogueBlock(locale) {
  if (!CHALLENGES_MANIFEST.length) return "";
  const isEs = locale.startsWith("es");

  const lines = CHALLENGES_MANIFEST.map((skill) => {
    const name = localeText(skill.name, locale);
    const desc = localeText(skill.description, locale);
    const aliases = (skill.aliases[locale] || skill.aliases["en-US"]).join(", ");
    return `- ${name}: ${desc} (${isEs ? "frases activadoras" : "triggers"}: ${aliases})`;
  });

  if (isEs) {
    return (
      "\n\nDESAFÍOS DISPONIBLES: si el usuario pregunta qué pueden hacer juntos, o usa una de estas frases, puedes mencionarlos o empezarlos con naturalidad, como parte normal de la conversación. Para desafíos con reglas propias, usa start_challenge (o explain_challenge si solo quiere saber cómo se juega, sin empezar):\n" +
      lines.join("\n")
    );
  }
  return (
    "\n\nAVAILABLE CHALLENGES: if the user asks what you can do together, or uses one of these phrases, you may mention or start one naturally, as a normal part of the conversation. For challenges with their own rules, use start_challenge (or explain_challenge if they just want to know how it works, without starting it):\n" +
    lines.join("\n")
  );
}

// Returns { gameLogic, userInstructions } for a challenge that has them, or
// null (e.g. memory_challenge, or an unknown id) — the tool_call handler in
// server.js treats null as "nothing special to load, just continue naturally".
export function getSkillInstructions(id, locale) {
  const entry = SKILL_INSTRUCTIONS[id];
  if (!entry) return null;
  return {
    gameLogic: localeText(entry.gameLogic, locale),
    userInstructions: localeText(entry.userInstructions, locale),
  };
}

// explain_challenge only ever needs the USER INSTRUCTIONS half.
export function getUserInstructions(id, locale) {
  const entry = SKILL_INSTRUCTIONS[id];
  if (!entry) return null;
  return localeText(entry.userInstructions, locale);
}

// ── Gemini Live function declarations ───────────────────────────────────────
// Same pattern as Canon Memory's RECALL_MEMORY_TOOL — added to the live
// session's tools alongside it. All four are cheap: start/explain load static
// content (no DB hop, unlike recall_memory), and commit_secret_answer /
// end_challenge are one-time calls per round, never per-turn.

export const START_CHALLENGE_TOOL = {
  name: "start_challenge",
  description:
    "Start one of Brenda's built-in challenges by id, once the user has clearly asked to play. Loads the full rules and begins naturally — don't recite rules aloud unless asked or the instructions say to. For a challenge with no special rules (the response has no gameLogic), there's nothing to load — just continue the conversation naturally.",
  parameters: {
    type: "object",
    properties: {
      id: { type: "string", description: "the challenge id from the available challenges list" },
    },
  },
};

export const EXPLAIN_CHALLENGE_TOOL = {
  name: "explain_challenge",
  description:
    "Load only the conversational explanation of how a challenge works, for when the user asks how to play without starting it (e.g. 'how do you play Twenty Questions?'). Does not start the challenge.",
  parameters: {
    type: "object",
    properties: {
      id: { type: "string", description: "the challenge id from the available challenges list" },
    },
  },
};

export const COMMIT_SECRET_ANSWER_TOOL = {
  name: "commit_secret_answer",
  description:
    "Twenty Questions only, when Brenda is the one who thought of something (the user is guessing): call this once, immediately after you decide what you're thinking of and before answering any questions, so your choice is fixed and you stay consistent for the whole round.",
  parameters: {
    type: "object",
    properties: {
      value: { type: "string", description: "what Brenda is thinking of" },
    },
  },
};

export const END_CHALLENGE_TOOL = {
  name: "end_challenge",
  description:
    "Call once when an active challenge round has clearly concluded — someone won, someone conceded, or the user wants to stop — so the app knows to return to normal conversation.",
  parameters: { type: "object", properties: {} },
};
