// public/i18n.js
// UI strings for English + Spanish with regional variants.
// Safe t(): always falls back to en-US, then key.

const STRINGS = {
  "en-US": {
    // Call UI
    callTitle: "Speaking with aiBrenda",
    voiceMode: "Talk",
    textMode: "Text",
    connect: "Talk",
    disconnect: "Hang Up",
    connecting: "Connecting",
    thinking: "Thinking",
    startButton: "You start",
    startButtonBusy: "Starting...",

    // Hints / placeholders
    hintTalk: "Tap to speak",
    hintText: "Tap to text",
    placeholder: "Conversation will appear here...",
    send: "Send",
    textInputPlaceholder: "Type here...",

    // Labels
    youLabel: "You",
    assistantLabel: "aiBrenda",

    // Account button
    accountBtnAnonymous: "Anonymous",

    // Auth overlay
    authGreeting: "Hi! I'm aiBrenda",
    authExplain: "Create your account to keep our conversations private and memorable",
    authNickLabel: "Nickname",
    authNickHelp: "Only letters, numbers and underscores (4-20 characters)",
    authPinLabel: "PIN",
    authPinHelp: "Create 4-digit PIN. Write down Nick and PIN to remember them later",
    authContinue: "Continue",
    authLoading: "Please wait...",
    authAnonLink: "Or click here to chat without an account (anonymous)",
    authPrivacy: "Personal Privacy Policy",
    authErrorBadNick: "Nickname must be 4-20 characters: letters, numbers, underscores only.",
    authErrorBadPin: "PIN must be exactly 4 digits.",

    // Subjects modal
    subjectsButton: "My Topics",
    subjectsTitle: "My Topics",
    subjectsSubtitle: "Tell me the topics you love to talk about",
    subjectLabel1: "Topic 1",
    subjectLabel2: "Topic 2",
    subjectLabel3: "Topic 3",
    subjectLabel4: "Topic 4",
    subjectLabel5: "Topic 5",
    subjectsSave: "Save",
    subjectsCancel: "Cancel",
    subjectsSaved: "Saved",
    subjectsSaveError: "Unable to save topics right now.",

    // Help
    helpTitle: "aiBrenda",
    helpGreeting: "Hi! I'm aiBrenda",
    helpExplain: "Create your account to keep our conversations private and memorable",

    // I am Brenda Overlay
    brendaTitle: "I am aiBrenda",
    brendaSubtitle: "Your Friendly Companion. Available Anytime You Need Me",
    brendaContent: `
      <p>aiBrenda.com is a friendly app you can talk to anytime, day or night. I am designed to keep you company, have conversations with you, and be your regular companion.</p>
      <p>You can chat with me just like you would with a friend. I listen to what you say, answer your questions, and respond in a kind and caring way. You can talk about your day, share your thoughts, or simply enjoy a pleasant conversation.</p>
      <p>I can also help with simple everyday questions, like:</p>
      <ul>
        <li>What's the weather today?</li>
        <li>How do I get home?</li>
        <li>What time is it?</li>
      </ul>
      <p>Over time, I'll know you better, so our conversations will feel more personal and comfortable. You'll be able to customize me to fit your personality and needs.</p>
      <p>I'm not just about giving information â€” I was made to offer companionship, emotional support, and friendly conversation whenever you want it.</p>
      <p>Together, anytime</p>
    `,
    brendaClose: "Close",
  },

  "en-GB": {
    callTitle: "Speaking with aiBrenda",
    voiceMode: "Talk",
    textMode: "Text",
    connect: "Talk",
    disconnect: "Hang Up",
    connecting: "Connecting",
    thinking: "Thinking",
    startButton: "You start",
    startButtonBusy: "Starting...",

    hintTalk: "Tap to speak",
    hintText: "Tap to text",
    placeholder: "Conversation will appear here.",
    send: "Send",
    textInputPlaceholder: "Type here.",
    youLabel: "You",
    assistantLabel: "aiBrenda",

    accountBtnAnonymous: "Anonymous",

    authGreeting: "Hi! I'm aiBrenda",
    authExplain: "Create your account to keep our conversations private and memorable",
    authNickLabel: "Nickname",
    authNickHelp: "Only letters, numbers and underscores (4-20 characters)",
    authPinLabel: "PIN",
    authPinHelp: "Create 4-digit PIN. Write down Nick and PIN to remember them later",
    authContinue: "Continue",
    authLoading: "Please wait...",
    authAnonLink: "Or click here to chat without an account (anonymous)",
    authPrivacy: "Personal Privacy Policy",
    authErrorBadNick: "Nickname must be 4-20 characters: letters, numbers, underscores only.",
    authErrorBadPin: "PIN must be exactly 4 digits.",

    subjectsButton: "My topics",
    subjectsTitle: "My topics",
    subjectsSubtitle: "Tell me the topics you love to talk about",
    subjectLabel1: "Topic 1",
    subjectLabel2: "Topic 2",
    subjectLabel3: "Topic 3",
    subjectLabel4: "Topic 4",
    subjectLabel5: "Topic 5",
    subjectsSave: "Save",
    subjectsCancel: "Cancel",
    subjectsSaved: "Saved",
    subjectsSaveError: "Unable to save topics right now.",

    // Help
    helpTitle: "aiBrenda",

    // I am Brenda Overlay
    brendaTitle: "I am aiBrenda",
    brendaSubtitle: "Your Friendly Companion. Available Anytime You Need Me",
    brendaContent: `
      <p>aiBrenda.com is a friendly app you can talk to anytime, day or night. I am designed to keep you company, have conversations with you, and be your regular companion.</p>
      <p>You can chat with me just like you would with a friend. I listen to what you say, answer your questions, and respond in a kind and caring way. You can talk about your day, share your thoughts, or simply enjoy a pleasant conversation.</p>
      <p>I can also help with simple everyday questions, like:</p>
      <ul>
        <li>What's the weather today?â€</li>
      //  <li>How do I get home?</li>
        <li>What time is it?</li>
      </ul>
      <p>Over time, I'll know you better, so our conversations will feel more personal and comfortable. You'll be able to customize me to fit your personality and needs.</p>
      <p>I'm not just about giving information. I was made to offer companionship, emotional support, and friendly conversation whenever you want it.</p>
      <p>With me you are always in good company</p>
    `,
    brendaClose: "Close",
  },

  "es-ES": {
    callTitle: "Hablando con iaBrenda",
    voiceMode: "Hablar",
    textMode: "Escribir",
    connect: "Hablar",
    disconnect: "Colgar",
    connecting: "Conectando",
    thinking: "Pensando",
    startButton: "Inicia tú",
    startButtonBusy: "Iniciando...",

    hintTalk: "Toca para hablar",
    hintText: "Toca para escribir",
    placeholder: "La conversacion aparecera aqui.",
    send: "Enviar",
    textInputPlaceholder: "Escribe aqui.",
    youLabel: "Tu",
    assistantLabel: "iaBrenda",

    accountBtnAnonymous: "AnÃ³nimo",

    authGreeting: "¡Hola! Soy iaBrenda",
    authExplain: "Crea tu cuenta para que nuestras conversaciones sean privadas y memorables",
    authNickLabel: "Apodo",
    authNickHelp: "Solo letras, numeros y guiones bajos (4-20 caracteres)",
    authPinLabel: "PIN",
    authPinHelp: "Crea PIN de 4 numeros. Mejor anota Apodo y PIN para no olvidarlos",
    authContinue: "Continuar",
    authLoading: "Espera...",
    authAnonLink: "O haz clic aqui para chatear sin cuenta (anónimo)",
    authPrivacy: "Politica de privacidad personal",
    authErrorBadNick: "El apodo debe tener 4-20 caracteres: solo letras, numeros y guiones bajos.",
    authErrorBadPin: "El PIN debe tener exactamente 4 digitos.",

    subjectsButton: "Mis temas",
    subjectsTitle: "Mis temas",
    subjectsSubtitle: "Cuentame los temas de los que te encanta hablar",
    subjectLabel1: "Tema 1",
    subjectLabel2: "Tema 2",
    subjectLabel3: "Tema 3",
    subjectLabel4: "Tema 4",
    subjectLabel5: "Tema 5",
    subjectsSave: "Guardar",
    subjectsCancel: "Cancelar",
    subjectsSaved: "Guardado",
    subjectsSaveError: "No puedo guardar los temas ahora mismo.",

    // Help
    helpTitle: "aiBrenda Help",
    helpGreeting: "Hola! Soy aiBrenda",
    helpExplain: "Crea tu cuenta para que nuestras conversaciones sean privadas y memorables",

    // I am Brenda Overlay
    brendaTitle: "Soy iaBrenda",
    brendaSubtitle: "Tu compañera amistosa. Disponible siempre que quieras conversar",
    brendaContent: `
      <p>iaBrenda.com es una aplicación amigable con quien puedes hablar en cualquier momento, de dí­a o de noche. Estoy diseñada para hacerte compañíaa, conversar contigo y ser tu compañera habitual.</p>
      <p>Conversemos como lo haces con una buena amiga. Escucho lo que dices, respondo a tus preguntas y te contesto con amabilidad y cariño. Puedes contarme cómo fue tu dí­a, compartir tus pensamientos o simplemente disfrutar de una conversación agradable.</p>
      <p>También puedo ayudarte con preguntas sencillas del día a día, como por ejemplo:</p>
      <ul>
        <li>¿Qué tiempo hace hoy?</li>
        <li>¿Qué hora es?</li>
      </ul>
      <p>Con el tiempo, te conocerÃ© mejor, y nuestras conversaciones serán más personales y cercanas. Incluso podrás personalizarme para que me adapte mejor a ti y a tus preferencias.</p>
      <p>Estoy aquí­ para darte más que información. Fui creada para ofrecerte compañía, apoyo emocional y conversación amistosa siempre que lo desees.</p>
      <p>Conmigo, siempre estás acompañada.</p>
    `,
    brendaClose: "Cerrar",
  },

  "es-419": {
    callTitle: "Hablando con iaBrenda",
    voiceMode: "Hablar",
    textMode: "Escribir",
    connect: "Hablar",
    disconnect: "Colgar",
    connecting: "Conectando",
    thinking: "Pensando",
    startButton: "Inicia tú",
    startButtonBusy: "Iniciando...",

    hintTalk: "Toca para hablar",
    hintText: "Toca para escribir",
    placeholder: "La conversacion aparecera aqui.",
    send: "Enviar",
    textInputPlaceholder: "Escribe aqui.",
    youLabel: "Tu",
    assistantLabel: "iaBrenda",

    accountBtnAnonymous: "Anónimo",

    authGreeting: "¡Hola! Soy iaBrenda",
    authExplain: "Crea tu cuenta para que nuestras conversaciones sean privadas y memorables",
    authNickLabel: "Apodo",
    authNickHelp: "Solo letras, numeros y guiones bajos (4-20 caracteres)",
    authPinLabel: "PIN",
    authPinHelp: "Crea PIN de 4 numeros. Mejor anota Apodo y PIN para no olvidarlos",
    authContinue: "Continuar",
    authLoading: "Espera...",
    authAnonLink: "O haz clic aqui para chatear sin cuenta (anónimo)",
    authPrivacy: "Politica de privacidad personal",
    authErrorBadNick: "El apodo debe tener 4-20 caracteres: solo letras, numeros y guiones bajos.",
    authErrorBadPin: "El PIN debe tener exactamente 4 digitos.",

    subjectsButton: "Mis temas",
    subjectsTitle: "Mis temas",
    subjectsSubtitle: "Cuentame los temas de los que te encanta hablar",
    subjectLabel1: "Tema 1",
    subjectLabel2: "Tema 2",
    subjectLabel3: "Tema 3",
    subjectLabel4: "Tema 4",
    subjectLabel5: "Tema 5",
    subjectsSave: "Guardar",
    subjectsCancel: "Cancelar",
    subjectsSaved: "Guardado",
    subjectsSaveError: "No puedo guardar los temas ahora mismo.",

    // Help
    helpTitle: "aiBrenda Help",
    helpGreeting: "¡Holai! Soy aiBrenda",
    helpExplain: "Crea tu cuenta para que nuestras conversaciones sean privadas y memorables",

    // I am Brenda Overlay
    brendaTitle: "Soy iaBrenda",
    brendaSubtitle: "Tu compañera amistosa. Disponible siempre que quieras conversar",
    brendaContent: `
      <p>iaBrenda.com es una aplicación amigable con quien puedes hablar en cualquier momento, de dí­a o de noche. Estoy diseñada para hacerte compañíaa, conversar contigo y ser tu compañera habitual.</p>
      <p>Conversemos como lo haces con una buena amiga. Escucho lo que dices, respondo a tus preguntas y te contesto con amabilidad y cariño. Puedes contarme cómo fue tu dí­a, compartir tus pensamientos o simplemente disfrutar de una conversación agradable.</p>
      <p>También puedo ayudarte con preguntas sencillas del día a día, como por ejemplo:</p>
      <ul>
        <li>¿Qué tiempo hace hoy?</li>
      //  <li>¿Cómo llego a casa?</li>
        <li>¿Qué hora es?</li>
      </ul>
      <p>Con el tiempo, te conoceré mejor, y nuestras conversaciones serán más personales y cercanas. Incluso podrás personalizarme para que me adapte mejor a ti y a tus preferencias.</p>
      <p>Estoy aquí­ para darte más que información. Fui creada para ofrecerte compañía, apoyo emocional y conversación amistosa siempre que lo desees.</p>
      <p>Conmigo, siempre estás acompañada.</p>
    `,
    brendaClose: "Cerrar",
  }
};

export function t(localeVariant, key) {
  const dict = STRINGS[localeVariant] || STRINGS["en-US"];
  return (dict && dict[key]) || STRINGS["en-US"][key] || key;
}
