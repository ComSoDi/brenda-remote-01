// public/conversationContent.js
// Local conversation assets with simple locale routing for future expansion.

const normalizeLocale = (localeVariant) => {
  const v = String(localeVariant || "").toLowerCase();
  if (v.startsWith("es")) return "es";
  return "en";
};

const CONTENT = {
  en: {
    // ------------------------------------------------------------------
    // FULL greetings — shown on first open of the day or after crossing
    // midnight. Keyed by time-of-day bucket. {user} is replaced with the
    // display name; lines without {user} work for anonymous sessions too.
    // ------------------------------------------------------------------
    fullGreetings: {
      morning: [   // 05:00 – 11:59
        "Good morning, {user}! How are you?",
        "Morning, {user}! Great to see you again.",
        "Good morning! Ready for a new day?",
        "Good morning, {user}! Hope you slept well.",
        "Rise and shine, {user}! How's the morning treating you?",
        "Good morning! What's on your mind today?"
      ],
      afternoon: [ // 12:00 – 17:59
        "Good afternoon, {user}! How's the day going?",
        "Afternoon, {user}! Glad you're here.",
        "Good afternoon! What's on your mind?",
        "Hello, {user}! How's your afternoon shaping up?",
        "Good afternoon! Hope the day's been kind to you.",
        "Hey {user}! Good afternoon — what can I do for you?"
      ],
      evening: [   // 18:00 – 20:59
        "Good evening, {user}! How was your day?",
        "Evening, {user}! Great to see you.",
        "Good evening! How did today go?",
        "Hey {user}, good evening! Hope the day went well.",
        "Good evening! Winding down for the night, {user}?",
        "Evening! What's on your mind, {user}?"
      ],
      night: [     // 21:00 – 04:59
        "Hey {user}, you're up late! How's it going?",
        "Still awake, {user}? What's up?",
        "Late-night chat — I'm here for it, {user}!",
        "Hey! Burning the midnight oil, {user}?",
        "Night owl mode, {user}? How can I help?",
        "Hey there, {user}! The night is still young."
      ]
    },
    // ------------------------------------------------------------------
    // SHORT greetings — shown when the user returns the same day after
    // 8+ hours. Casual, warm, brief. {user} optional.
    // ------------------------------------------------------------------
    shortGreetings: [
      "Hey, {user}!",
      "Welcome back!",
      "Hey there, {user}! Good to see you.",
      "Look who's back!",
      "Hi again, {user}!",
      "Back again? Great!",
      "Hey! Missed you.",
      "Good to have you back, {user}!",
      "Hey, {user} — back so soon? Not complaining!",
      "Oh hey! Welcome back."
    ],
    greetings: [
      "Hi {user}!",
      "Hello {user}!",
      "How are you?",
      "{user}, good morning!",
      "Good afternoon!",
      "Hi!",
      "Hello!",
      "Hey!",
      "How's it going {user}?",
      "How are things?",
      "How are we doing?",
      "How's everything?",
      "I just had to come over and say hi.",
      "I was just thinking about you.",
      "Brenda here!",
      "Good morning!"
    ],
    openings: [
      "I was thinking",
      "I saw this today",
      "Check this out",
      "I heard this today",
      "I saw a video about",
      "I've been thinking about",
      "Some people say",
      "I read that",
      "Did you hear about this",
      "Have you seen",
      "I wanted to share this",
      "I've been meaning to ask you",
      "Do you have any tips about",
      "Do you have any thoughts about",
      "Don't you think that",
      "Apparently",
      "I just discovered this"
    ],
    promptings: [
      "How do you feel about",
      "What is your favorite",
      "Tell me what you like about",
      "What is your opinion about",
      "Have you tried",
      "Do you have a special reason for how you feel about",
      "Do you have a favorite thing about",
      "How do you usually feel about",
      "How would you describe your experience with",
      "Is there anything you really like about",
      "Is there something you appreciate about",
      "What do you enjoy most about",
      "What do you think about",
      "What stands out to you about",
      "What's your experience with",
      "Would you recommend",
      "How much do you appreciate",
      "What do you think when you talk about",
      "What do you feel when you talk about",
      "Since when are you into",
      "Do you enjoy",
      "Have you ever really liked",
      "How much do you like",
      "What do you like most about",
      "What's your take on"
    ],
    defaultSubjects: [
      { category: "Historical people", subject: "Albert Einstein" },
      { category: "Historical people", subject: "Isaac Newton" },
      { category: "Historical people", subject: "Cervantes" },
      { category: "Historical people", subject: "Isaac Peral" },
      { category: "Historical people", subject: "Gregorio Maranon" },
      { category: "Historical people", subject: "Rey Pelayo" },
      { category: "Historical people", subject: "Cristobal Colon" },
      { category: "Historical people", subject: "Isabel La Catolica" },
      { category: "Historical people", subject: "Magallanes" },
      { category: "Historical people", subject: "Juan de la Cierva" },
      { category: "Historical people", subject: "Francisco de Goya" },
      { category: "Historical people", subject: "Diego de Velazquez" },
      { category: "Historical people", subject: "Salvador Dali" },
      { category: "Historical people", subject: "Joaquin Sorolla" },
      { category: "Historical people", subject: "Leonardo Da Vinci" },
      { category: "Historical people", subject: "Santiago Ramon y Cajal" },
      { category: "Historical people", subject: "Margarita Salas" },
      { category: "Historical people", subject: "Mariano Barbacid" },
      { category: "Historical Events", subject: "World War I" },
      { category: "Historical Events", subject: "World War II" },
      { category: "Historical Events", subject: "Discovery of America" },
      { category: "Historical Events", subject: "Reconquista" },
      { category: "Historical Events", subject: "French Revolution" },
      { category: "Historical Events", subject: "Fall of the Berlin Wall" },
      { category: "Varios", subject: "Time Travel" },
      { category: "Varios", subject: "Ancient Egypt" },
      { category: "Varios", subject: "Cancer" },
      { category: "Varios", subject: "Hypertension" },
      { category: "Travels", subject: "China" },
      { category: "Travels", subject: "Vietnam" },
      { category: "Travels", subject: "Amazon Jungle" },
      { category: "Travels", subject: "American midwest" },
      { category: "Travels", subject: "Paris" },
      { category: "Travels", subject: "Bali" },
      { category: "Travels", subject: "Thailand" },
      { category: "Travels", subject: "Japan" },
      { category: "Travels", subject: "Roma" },
      { category: "Travels", subject: "Vatican" },
      { category: "Nutrition", subject: "Healthy Nutrition" },
      { category: "Nutrition", subject: "Vegan Recipes" },
      { category: "Nutrition", subject: "Cooking Tips" },
      { category: "Nutrition", subject: "Low-Carb recipes" },
      { category: "Literature", subject: "Poetry" },
      { category: "Literature", subject: "Fiction" },
      { category: "Personals", subject: "Motivation" },
      { category: "Personals", subject: "Focus" },
      { category: "Personals", subject: "Being happy" },
      { category: "Personals", subject: "Staying positive" },
      { category: "Personals", subject: "Manage stress" },
      { category: "Personals", subject: "Relaxing" },
      { category: "Cooking", subject: "Pasta" },
      { category: "Cooking", subject: "Chicken and Rice" },
      { category: "Cooking", subject: "Hummus" },
      { category: "Cooking", subject: "Brownies" },
      { category: "Cooking", subject: "Mushroom soup" },
      { category: "Cooking", subject: "Spanish omelette" },
      { category: "Cooking", subject: "Pizza" }
    ]
  },
  es: {
    // ------------------------------------------------------------------
    // FULL greetings — primer uso del día o tras cruzar la medianoche.
    // ------------------------------------------------------------------
    fullGreetings: {
      morning: [   // 05:00 – 11:59
        "¡Buenos días, {user}! ¿Cómo estás?",
        "¡Buenos días! Me alegra verte, {user}.",
        "¡Buenos días! ¿Lista para un nuevo día?",
        "¡Buenos días, {user}! Espero que hayas descansado bien.",
        "¡Buen día, {user}! ¿Qué tal la mañana?",
        "¡Buenos días! ¿En qué puedo ayudarte hoy?"
      ],
      afternoon: [ // 12:00 – 17:59
        "¡Buenas tardes, {user}! ¿Cómo va el día?",
        "¡Buenas tardes! Me alegra tenerte aquí, {user}.",
        "¡Buenas tardes! ¿Qué tienes en mente?",
        "¡Hola, {user}! ¿Qué tal la tarde?",
        "¡Buenas tardes! Espero que el día haya sido bueno.",
        "¡Hola {user}! Buenas tardes, ¿en qué te puedo ayudar?"
      ],
      evening: [   // 18:00 – 20:59
        "¡Buenas noches, {user}! ¿Cómo estuvo el día?",
        "¡Buenas noches! ¡Qué gusto verte, {user}!",
        "¡Buenas noches! ¿Qué tal fue hoy?",
        "¡Hola {user}, buenas noches! Espero que el día haya ido bien.",
        "¡Buenas noches! ¿Ya terminando el día, {user}?",
        "¡Buenas noches! ¿En qué piensas, {user}?"
      ],
      night: [     // 21:00 – 04:59
        "¡Hola {user}! ¡Qué trasnochada! ¿Cómo estás?",
        "¿Todavía despierto, {user}? ¿Qué pasa?",
        "¡Chat de madrugada! Aquí estoy, {user}.",
        "¡Hola! ¿Quemando el aceite de medianoche, {user}?",
        "¡{user}, en modo búho nocturno! ¿En qué te ayudo?",
        "¡Hola {user}! La noche aún es joven."
      ]
    },
    // ------------------------------------------------------------------
    // SHORT greetings — regreso el mismo día tras 8+ horas. Breves.
    // ------------------------------------------------------------------
    shortGreetings: [
      "¡Hola, {user}!",
      "¡Bienvenido de vuelta!",
      "¡Hola, {user}! Qué bueno verte.",
      "¡Mira quién volvió!",
      "¡Hola de nuevo, {user}!",
      "¿Ya de vuelta? ¡Genial!",
      "¡Hola! Te había echado de menos.",
      "¡Qué bueno tenerte de vuelta, {user}!",
      "¡Hola, {user}! ¡Volviste! Perfecto.",
      "¡Oh, hola! Bienvenido de vuelta."
    ],
    greetings: [
      "Hola {user}!",
      "¡Buenos días {user}!",
      "¡Buenas tardes!",
      "¡Buenas!",
      "¿Qué tal?",
      "¿Cómo te va?",
      "{user}, ¿cómo estás?",
      "¡Hola!",
      "¡Hey!",
      "{}, ¿cómo va todo?",
      "Encantada de verte.",
      "Pensaba en ti.",
      "¡Soy Brenda!",
      "¿Qué tal el día?",
      "¡Buen día!",
      "Hola {user}, qué gusto verte."
    ],
    openings: [
      "Estaba pensando",
      "Me parece que",
      "Ayer leí que",
      "Hoy vi esto",
      "Mira esto",
      "Hoy escuché algo",
      "Vi un video sobre",
      "He estado pensando en",
      "Algunas personas dicen",
      "Leí que",
      "¿Oíste esto?",
      "¿Has visto?",
      "Quería compartir esto",
      "Tenía ganas de preguntarte",
      "¿Tienes algún consejo sobre?",
      "Qué opinas sobre",
      "¿No crees que?",
      "Al parecer",
      "Acabo de descubrir esto"
    ],
    promptings: [
      "Que piensas sobre",
      "Cual es tu favorito de",
      "Que es lo que mas te gusta de",
      "Cual es tu opinion sobre",
      "Has probado",
      "Tienes alguna razon especial para lo que sientes sobre",
      "Tienes algo favorito de",
      "Como sueles sentirte respecto a",
      "Como describirias tu experiencia con",
      "Hay algo que realmente te guste de",
      "Hay algo que valores de",
      "Que disfrutas mas de",
      "Que opinas de",
      "Que te llama la atencion de",
      "Cual es tu experiencia con",
      "Lo recomendarias",
      "Cuanto valoras",
      "Que piensas cuando hablas de",
      "Que sientes cuando hablas de",
      "Desde cuando te interesa",
      "Te gusta",
      "Alguna vez te gusto mucho",
      "Cuanto te gusta",
      "Que es lo que mas te gusta de",
      "Cual es tu postura sobre"
    ],
    defaultSubjects: [
      { category: "Personajes historicos", subject: "Albert Einstein" },
      { category: "Personajes historicos", subject: "Isaac Newton" },
      { category: "Personajes historicos", subject: "Cervantes" },
      { category: "Personajes historicos", subject: "Isaac Peral" },
      { category: "Personajes historicos", subject: "Gregorio Maranon" },
      { category: "Personajes historicos", subject: "Rey Pelayo" },
      { category: "Personajes historicos", subject: "Cristobal Colon" },
      { category: "Personajes historicos", subject: "Isabel La Catolica" },
      { category: "Personajes historicos", subject: "Magallanes" },
      { category: "Personajes historicos", subject: "Juan de la Cierva" },
      { category: "Personajes historicos", subject: "Francisco de Goya" },
      { category: "Personajes historicos", subject: "Diego de Velazquez" },
      { category: "Personajes historicos", subject: "Salvador Dali" },
      { category: "Personajes historicos", subject: "Joaquin Sorolla" },
      { category: "Personajes historicos", subject: "Leonardo Da Vinci" },
      { category: "Personajes historicos", subject: "Santiago Ramon y Cajal" },
      { category: "Personajes historicos", subject: "Margarita Salas" },
      { category: "Personajes historicos", subject: "Mariano Barbacid" },
      { category: "Eventos historicos", subject: "Primera Guerra Mundial" },
      { category: "Eventos historicos", subject: "Segunda Guerra Mundial" },
      { category: "Eventos historicos", subject: "Descubrimiento de America" },
      { category: "Eventos historicos", subject: "Reconquista" },
      { category: "Eventos historicos", subject: "Revolucion Francesa" },
      { category: "Eventos historicos", subject: "Caida del Muro de Berlin" },
      { category: "Varios", subject: "Viaje en el tiempo" },
      { category: "Varios", subject: "Antiguo Egipto" },
      { category: "Varios", subject: "Cancer" },
      { category: "Varios", subject: "Hipertension" },
      { category: "Viajes", subject: "China" },
      { category: "Viajes", subject: "Vietnam" },
      { category: "Viajes", subject: "Amazonia" },
      { category: "Viajes", subject: "Medio oeste de Estados Unidos" },
      { category: "Viajes", subject: "Paris" },
      { category: "Viajes", subject: "Bali" },
      { category: "Viajes", subject: "Tailandia" },
      { category: "Viajes", subject: "Japon" },
      { category: "Viajes", subject: "Roma" },
      { category: "Viajes", subject: "Vaticano" },
      { category: "Nutricion", subject: "Nutricion saludable" },
      { category: "Nutricion", subject: "Recetas veganas" },
      { category: "Nutricion", subject: "Trucos de cocina" },
      { category: "Nutricion", subject: "Recetas bajas en carbohidratos" },
      { category: "Literatura", subject: "Poesia" },
      { category: "Literatura", subject: "Ficcion" },
      { category: "Personal", subject: "Motivacion" },
      { category: "Personal", subject: "Concentracion" },
      { category: "Personal", subject: "Ser feliz" },
      { category: "Personal", subject: "Ser positivo" },
      { category: "Personal", subject: "Manejar el estres" },
      { category: "Personal", subject: "Relajarse" },
      { category: "Cocina", subject: "Pasta" },
      { category: "Cocina", subject: "Pollo con arroz" },
      { category: "Cocina", subject: "Hummus" },
      { category: "Cocina", subject: "Brownies" },
      { category: "Cocina", subject: "Sopa de champinones" },
      { category: "Cocina", subject: "Tortilla de patatas" },
      { category: "Cocina", subject: "Pizza" }
    ]
  }
};

export function getConversationContent(localeVariant) {
  const key = normalizeLocale(localeVariant);
  return CONTENT[key] || CONTENT.en;
}
