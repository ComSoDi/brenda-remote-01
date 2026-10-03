export default {
    callTitle: "Hablando con aiBrenda",
    voiceMode: "HABLAR",
    textMode: "ESCRIBIR",
    connect: "HABLAR",
    disconnect: "Colgar",
    connecting: "Conectando",
    warming: "Iniciando...",
    thinking: "Pensando",

    hintTalk: "Toca para hablar",
    hintText: "Toca para escribir",
    aiDisclaimer: "Recuerda: Brenda es una IA y puede equivocarse",
    placeholder: "La conversación aparecerá aquí.",
    send: "Enviar",
    textInputPlaceholder: "Escribe aquí.",
    talkRequiresAccount: "Abre una cuenta Gratis para poder Hablar",
    voiceQuotaExhausted: "Has agotado tu tiempo de voz de este periodo. Por favor, amplía tu plan para seguir conversando.",
    youLabel: "Tu",
    assistantLabel: "aiBrenda",

    accountBtnAnonymous: "Anónimo",

    authGreeting: "¡Hola! Soy aiBrenda",
    authExplain: "Crea tu cuenta para que nuestras conversaciones sean memorables y discretas",
    authNickLabel: "Usuario",
    authNickHelp: "Solo letras, números y guiones bajos (4-20 caracteres)",
    authPinLabel: "PIN",
    pinShow: "Mostrar PIN",
    pinHide: "Ocultar PIN",
    authPinHelp01: "Crea un PIN de 4 números.",
    authPinHelp02: "Apunta Usuario y PIN en un sitio seguro",
    authContinue: "Continuar",
    authLoading: "Espera...",
    authAnonLink: "O haz clic aquí para chatear sin cuenta (anónimo)",
    authPrivacy: "Política de privacidad personal",
    authErrorBadNick: "El Usuario debe tener 4-20 caracteres: solo letras, números y guiones bajos.",
    authErrorBadPin: "El PIN debe tener exactamente 4 dígitos.",
    authGenderLabel: "Género",
    authGenderDefault: "Selecciona...",
    authGenderWoman: "Soy mujer",
    authGenderMan: "Soy hombre",
    authGenderOther: "Otro",
    authErrorNoGender: "Por favor selecciona un género.",

    consentTitle: "¡Bienvenido a aiBrenda!",
    consentSubtitle: "Lee esto con atención y pulsa «Acepto» para continuar",
    consentContent: `
      <p><strong>Brenda es una IA, no una persona real.</strong> Sus respuestas las genera una inteligencia artificial, no un ser humano. Es estupenda para charlar y darte información general, pero nunca sustituye el consejo de un profesional.</p>
      <p>Piensa en Brenda como una vecina simpática con la que te encanta charlar. No te fíes de ella para temas médicos, legales, financieros o psicológicos: siempre te recomendará que consultes a un profesional certificado.</p>
      <p>Por favor, no le compartas datos personales identificativos, contraseñas, información financiera, historial médico ni otros datos sensibles.</p>
      <p><strong>Tu voz.</strong> En el modo HABLAR, tu micrófono capta tu voz en tiempo real. El audio se envía directamente a Google/Gemini, el servicio de procesamiento de IA que seleccionamos para procesarlo, y nunca lo almacenamos nosotros.</p>
      <p>El micrófono se desconecta automáticamente tras un rato de silencio. Si ocurre y quieres seguir hablando, simplemente vuelve a pulsar HABLAR.</p>
      <p><strong>Tus conversaciones.</strong> Brenda guarda tus mensajes más recientes para que puedas retomar donde lo dejaste. El audio de voz nunca se graba: solo se conserva la transcripción de texto para aprender tus gustos y dar continuidad a la sesión.</p>
      <p>Al pulsar «Acepto» confirmas que has leído y aceptas los Términos de Uso y la Política de Privacidad de aiBrenda.</p>
    `,
    consentAgree: "Acepto",
    consentDecline: "No acepto",

    talkTitle: "¡Hablemos!",
    talkSubtitle: "Unas cosas rápidas antes de tu primera llamada",
    talkContent: `
      <p>Para tener conversaciones de voz con Brenda, pulsa el botón HABLAR que activa el micrófono.</p>
      <p class="disclosure-note">La primera vez que pulses HABLAR, tu dispositivo te pedirá permiso para usar el micrófono. Te recomendamos elegir la primera opción «Permitir siempre» para que quede activado en llamadas futuras.</p>
      <p>Para colgar, simplemente pulsa el icono rojo de teléfono o el botón rojo de Colgar.</p>
      <p>Como en una llamada telefónica, Brenda tarda unos segundos en «contestar» y saludarte.</p>
      <p>Tu voz se envía en tiempo real a Google/Gemini, el servicio de procesamiento de IA que seleccionamos para procesarla: nunca la grabamos ni la almacenamos nosotros.</p>
      <p>Lo que dices y lo que responde Brenda se transcribe a texto y se guarda para conocerte mejor y que aparezca en tu ventana de chat.</p>
      <p><strong>Por favor, no compartas información personal sensible, ni por voz ni por chat.</strong></p>
      <p>El micrófono se desconecta automáticamente tras un rato de silencio. Si eso ocurre y quieres seguir hablando, simplemente vuelve a pulsar HABLAR.</p>
    `,
    talkGotIt: "Entendido. Hablemos",

    privacyTitle: "Política de Privacidad de Datos",
    privacyContent: `
      <p>La aplicación <strong>aiBrenda.co</strong> está en período de prueba y solo está disponible para usuarios selectos que colaboran en las pruebas preliminares propias de la etapa de desarrollo.</p>
      <p>Durante este periodo podremos acceder a los datos de los usuarios para desvelar posibles fallas, requerimientos imprevistos y características a incorporar antes de su futuro lanzamiento.</p>
      <p>En ningún caso podemos ser responsables de la privacidad de los datos de aquellos que usen <strong>aiBrenda.co</strong> sin nuestro consentimiento.</p>
      <p>Otro aspecto propio del período de prueba es que usamos un método de registro basado en Apodo + PIN que es <strong>MUY básico</strong> y no puede garantizar en profundidad la privacidad de los datos de los usuarios.</p>
      <p>Por tanto, <strong>NUNCA COMPARTAS</strong> datos personales como dirección, emails, cuenta bancaria, estado de salud, consultas legales o fiscales, etc. en esta plataforma.</p>
      <p>Cuando se acabe el período de prueba incorporaremos sistemas de protección más robustos (p.ej. OAuth).</p>
      <p class="content-subheading">Datos de Voz y Conversación</p>
      <p><strong>Entrada de voz:</strong> Cuando usas el modo HABLAR, tu micrófono capta tu voz y la envía en tiempo real a Gemini/Google, el servicio externo de IA que seleccionamos para procesarla. El audio se procesa al instante y nunca es grabado, almacenado ni conservado por aiBrenda ni por sus servidores.</p>
      <p><strong>Transcripciones:</strong> Las conversaciones de voz se transcriben a texto en tiempo real. Estas transcripciones, junto con tus mensajes de chat de texto, se guardan para mostrar tus aproximadamente últimas 20 interacciones. Esto te permite revisar tus conversaciones recientes dentro de la app y le sirve a Brenda para conocerte mejor. El historial de conversación está asociado exclusivamente a tu cuenta y se almacena de forma segura.</p>
      <p><strong>Lo que no almacenamos:</strong> Archivos de audio en bruto, grabaciones de voz ni ningún dato biométrico de voz.</p>
      <p><strong>Eliminación de datos:</strong> Puedes solicitar la eliminación de tu cuenta y de todos los datos de conversación asociados en cualquier momento escribiéndonos a soporte@aibrenda.co. Procesaremos tu solicitud en un plazo de 30 días.</p>
    `,
    privacyUnderstood: "Entendido",

    deleteAccountLink: "Quiero eliminar mi cuenta y datos personales",
    deleteAccountTitle: "Eliminación de Cuenta y Datos",
    deleteAccountSubtitle: "¿Estás seguro? Esta operación no se puede deshacer",
    deleteAccountContent: `
      <p>Sentimos que te vayas y lamentamos no poder ofrecerte reembolsos si lo haces. Quizás lo mejor sea eliminar tu cuenta y tus datos justo antes de tu próximo ciclo de facturación, para que aproveches por completo los Brendys que te queden.</p>
      <p>En cualquier caso, te agradeceríamos muchísimo que nos escribieras a <a href="mailto:soporte@aibrenda.co">soporte@aibrenda.co</a> contándonos los motivos por los que decidiste dejar de usar Brenda.</p>
      <p>Queremos mejorar cada día.</p>
    `,
    deleteAccountConfirm: "Por favor, cierra mi cuenta y elimina mis datos",
    deleteAccountDone: "Tu cuenta y tus datos han sido eliminados.",
    deleteAccountConfirmTitle: "¿Estás seguro?",
    deleteAccountConfirmSubtitle: "¡Esto no se puede deshacer!",
    deleteAccountFinalBtn: "Por favor, elimina mi cuenta y todos mis datos",

    subjectsButton: "Temas",
    subjectsTitle: "Temas",
    subjectsSubtitle: "Dime los temas que más te interesan para hablar",
    subjectLabel1: "Tema 1",
    subjectLabel2: "Tema 2",
    subjectLabel3: "Tema 3",
    subjectLabel4: "Tema 4",
    subjectLabel5: "Tema 5",
    subjectsSave: "Guardar",
    subjectsCancel: "Cancelar",
    subjectsSaved: "Guardado",
    subjectsSaveError: "No puedo guardar los temas ahora mismo.",

    // Location overlay
    myInfoButton: "Mi info",
    myInfoTitle: "Mi información",
    myInfoSubtitle: "Por favor, dime dónde estás y qué eres",
    myInfoTown: "Población / Ciudad",
    myInfoState: "Región (opcional)",
    myInfoCountry: "País",
    myInfoSave: "Guardar",
    myInfoCancel: "Cancelar",
    myInfoSaved: "Guardado",
    myInfoSaveError: "No puedo guardar la ubicación ahora mismo.",

    // Help
    helpTitle: "aiBrenda Help",
    helpGreeting: "Hola! Soy aiBrenda",
    helpExplain: "Crea tu cuenta para que nuestras conversaciones sean memorables y discretas",

    // SideNav Help
    sideNavCloseLabel: "Cierra:",
    sideNavIntro: "Pulsa sobre el icono para ver qué hace esa herramienta y cómo usarla",
    sideNavPillHelp: "?",
    sideNavLabelHelp: "Esta ventana de Ayuda",
    sideNavPillMyInfo: "Mi info",
    sideNavLabelMyInfo: "Dónde vives, qué eres",
    sideNavPillMyInfo2: "Mi info 2",
    sideNavLabelMyInfo2: "Consumo & Añadir tiempo",
    sideNavLabelAccount: "Cuenta seleccionada",
    sideNavLabelAnon: "Si me usas sin cuenta",
    sideNavPillTomas: "Tareas",
    sideNavLabelTomas: "Tu plan de tareas",
    sideNavPillMisTemas: "Temas",
    sideNavLabelMisTemas: "Los temas que te interesan",
    sideNavPillInit: "Cambia tema",
    sideNavLabelInit: "Inicia o cambia a otra cosa",
    sideNavPillNews: "Secciones",
    sideNavLabelNews: "Categorías que debo buscar",
    sideNavPillLatest: "Titulares",
    sideNavLabelLatest: "Las noticias más actuales",
    sideNavPillTalk: "HABLAR",
    sideNavLabelTalk: "Te oigo y me oyes",
    sideNavPillWrite: "ESCRIBIR",
    sideNavLabelWrite: "Me escribes y te escribo",
    sideNavTomasTitleText: "Tu plan de tareas",
    sideNavTomasText1: "Te ayudo a recordar las tareas que tienes planificadas",
    sideNavTomasText2: "Solo necesitas meter la información en la ventana que se abre al pulsar este botón.",
    sideNavTomasAddBtn: "+ AÑADIR TAREA",
    sideNavTomasText3: 'En "Cantidad" pon cuántas unidades de cada tarea. Por ejemplo: Si la tarea es Comprar pan, pon "2 barras"',
    sideNavTomasText4: "Indica si la tarea es diaria, ciertos días de la semana o cada tantos días.",
    sideNavTomasText5: 'Pon indicaciones ("Antes del desayuno") si las hubiese y las horas a las que piensas hacerla. Pueden ser varias horas distintas.',
    sideNavTomasText6: "Si es una tarea con final previsto (por ejemplo, 'Pintar la pared') marca la casilla y escoge la fecha final.",
    sideNavTomasText7: "Compara cuidadosamente todos los datos. Si está todo bien, pulsa",
    sideNavSaveBtn: "Guardar",
    sideNavMiInfoTitleText: "Dónde vives. Cuál es tu género",
    sideNavMiInfoText1: "Para darte la información más acertada del clima necesito saber dónde vives.",
    sideNavMiInfoText2: "¿Por qué te lo pido en detalle? Muchas poblaciones comparten el mismo nombre. Por ejemplo, ¡hay más de 9 ciudades y unas 25 poblaciones llamadas \"Valencia\"!",
    sideNavMiInfoText3: "Si preguntas \"Brenda, ¿crees que lloverá mañana?\" sin más, yo buscaré la ciudad o población que guardaste aquí.",
    sideNavMiInfoText4: "Si en cambio pides \"¿Qué temperatura hará mañana en X?\" diré la de esa otra ciudad.",
    sideNavMiInfoText5: "Luego pregunto el género para dirigirme correctamente a ti: (\"¡Hola maja!\" o \"¡Claro, guapo!\")",
    sideNavMiInfoText6: "Cuando hayas indicado (o cambiado) esta información, pulsa el botón verde de guardar para recordarlo.",
    sideNavMiInfo02TitleText: "Más Tiempo para hablar o chatear",
    sideNavMiInfo02Text1: "¿Necesitas más tiempo?",
    sideNavMiInfo02Text2: "Fácil solución: pulsa el botón blanco \"Mi info\" y baja al final de la ventana.",
    sideNavMiInfo02Text3: "Las dos líneas de colores te indican cuánto has usado en modos VOZ y CHAT.",
    sideNavMiInfo02Text4: "Si necesitas añadir más tiempo, toca el botón:",
    sideNavMiInfo02Text5: "Se abre la ventana con las diferentes formas de añadir tiempo a tu cuenta:",
    sideNavMiInfo02Text6: "Selecciona \"Recargas puntuales\" o uno de los Planes de Suscripción. ¡Lo que más te convenga!",
    sideNavAnonTitleText: "Si me usas sin cuenta",
    sideNavAnonText1: "Veo que clicaste \"haz clic aquí para chatear sin cuenta (anónimo)\" cuando abriste Brenda",
    sideNavAnonText2: "Tus conversaciones conmigo serán anónimas pero públicas (otros las pueden ver y participar)",
    sideNavAnonText3: "Para que sean discretas entre Brenda y tú, te recomiendo que te hagas una cuenta.",
    sideNavAnonText4: "Con una cuenta podré conocerte mejor cada día, guardar tus preferencias y lo que quieras que yo recuerde",
    sideNavAnonText5: "Clica en el botón \"Anónimo\" que está arriba a la derecha y se abrirá la ventana en la que pones un apodo y un PIN de cuatro números.",
    sideNavAnonText6: "En adelante aparecerá el apodo que escogiste en ese mismo lugar",
    sideNavAnonText7: "NOTA IMPORTANTE: Esta app está en etapa de desarrollo ('Beta'). Para facilitar el uso entre nuestros colaboradores, el proceso de identificación y seguridad es el más básico (y menos seguro) que hay.",
    sideNavAnonText8: "Por favor, NO COMPARTAS NADA PERSONAL. Mejor usa un apodo en vez de tu nombre real. No me digas tu dirección, teléfono, datos bancarios, etc.",
    sideNavCuentaTitleText: "Cuenta seleccionada",
    sideNavCuentaText1: "¡Enhorabuena! Veo que te hiciste una cuenta conmigo.",
    sideNavCuentaText2: "¡Estás en un espacio protegido!",
    sideNavCuentaText3: "Nadie se puede entrometer en nuestra conversación ni saber de tus cosas como sucede en las Redes Sociales y WhatsApp.",
    sideNavCuentaText4: "Tus conversaciones conmigo son discretas (solo entre tú y yo) y persistentes (cuando retomas la app seguimos conversando donde lo dejamos).",
    sideNavCuentaText5: "Además, guardo tus preferencias en una zona privada solo para ti.",
    sideNavCuentaText6: "Es importante que recuerdes o apuntes el apodo y PIN secreto que usaste.",
    sideNavInitTitleText: "Brenda inicia la conversación",
    sideNavInitText1: "¿No se te ocurre qué preguntarme?",
    sideNavInitText2: "No te preocupes. Pulsa el botón azul claro \"Cambia tema\" y yo saco tema de conversación",
    sideNavInitText3: "No hace falta que preguntes, simplemente sígueme la corriente y conversamos amenamente.",
    sideNavInitText4: "Si en cualquier momento quieres cambiar de tema, dime lo que tengas en mente y pasamos a ello.",
    sideNavInitText5: "O pulsa el botón azul claro de 'Cambia tema' y saco otro de tu lista.",
    sideNavInitText6: "Dime tus temas favoritos de conversación en el botón \"Temas\".",

    // SideNav — Panel Mis temas
    sideNavMisTemasText1: "Este botón es la otra parte de la forma que tenemos para que yo inicie la conversación.",
    sideNavMisTemasText2: "Cuando pulsas \"Cambia tema\" te puedo hablar de miles de cosas diferentes muy interesantes.",
    sideNavMisTemasText3: "Si prefieres, puedo dedicar los temas de conversación a los que tú me indiques en la pantalla que sale con este botón.",
    sideNavMisTemasText4: "Escribe hasta cinco temas diferentes y luego pulsa la tecla \"Guardar\".",
    sideNavMisTemasText5: "Después pulsa el botón azul claro \"Cambia tema\" y verás que inicio conversación de uno de esos temas.",

    // SideNav — Panel Titulares
    sideNavLatestText1: "Soy la amiga que repasa la prensa y te ofrece lo más relevante y actual.",
    sideNavLatestText2: "Cuando pulsas \"Titulares\" en segundos te muestro los 5 más actuales y relevantes del momento.",
    sideNavLatestText3: "Verás que a cada titular le asigno un valor que une la frescura de la noticia, lo viral que se ha hecho y lo relevante que es.",
    sideNavLatestText4: "También puedes escoger qué secciones de la prensa te interesan que yo mire.",
    sideNavLatestText5: "Marca o desmarca las que tú quieras en el botón...",

    // SideNav — Panel Secciones
    sideNavNewsTitleText: "Decide los tipos de noticias que te interesan",
    sideNavNewsText1: "A veces quieres saber de todo y otras veces de algunas cosas nada más.",
    sideNavNewsText2: "Los periódicos de siempre están divididos por secciones: Política, Internacional, Deportes, Sociedad, etc.",
    sideNavNewsText3: "Yo puedo buscar los titulares más candentes de todas las secciones o solo de las que más te interesan.",
    sideNavNewsText4: "Antes de pulsar el botón \"Titulares\" pulsa \"Secciones\" y escoge entre",
    sideNavNewsText5: "Actualidad, Cotilleo, Deporte, Política, TV y entretenimiento",
    sideNavNewsText6: "¡Puedes marcar uno, varios o todos! ¡Como tú quieras!",

    // SideNav — Panel Hablar
    sideNavTalkTitleText: "Te oigo y me oyes",
    sideNavTalkText1: "¡Este es el botón que más usarás!",

    sideNavTalkText2: "Pulsa \"HABLAR\" cuando quieras que hablemos como por teléfono.",

    sideNavTalkText3: "La primera vez que llames el dispositivo te pedirá permiso para usar tu micrófono.",

    sideNavTalkText4: "Selecciona el primer 'Permitir' y no aparecerá más.",

    sideNavTalkText5: "Me toma unos segundos atender. Mientras tanto, verás una señal amarilla animada que dice \"Conectando\". Cuando veas un cuadro verde con  \"Hablando con aiBrenda\" y un círculo redondo rojo de colgar, ¡podemos hablar!",

    sideNavTalkText6: "Habla con claridad en un lugar con poco ruido y entenderé perfectamente lo que digas o preguntes.",

    sideNavTalkText7: "Si pulsas el botón azul claro \"Cambia tema\" mientras hablamos, cambiaré de tópico con uno de tus temas favoritos.",

    sideNavTalkText8: "Para colgar, solo pulsa el círculo rojo o el botón rojo que dice 'Colgar'.",

    // SideNav — Panel Escribir
    sideNavWriteText1: "¡A veces es mejor escribir y leer!",
    sideNavWriteText2: "Pulsa \"ESCRIBIR\" cuando quieras que nos comuniquemos por texto.",
    sideNavWriteText3: "Sería como lo haces por WhatsApp, Telegram y las Redes Sociales.",
    sideNavWriteText4: "Escribe en la ventanilla inferior que dice \"Escribe aquí\" y pulsa \"Enviar\".",
    sideNavWriteText5: "Lo que escribes aparece arriba en los bloques verdes.",
    sideNavWriteText6: "Verás lo que yo te contesto en los bloques blancos.",
    sideNavWriteText7: "Si pulsas el botón azul claro \"Cambia tema\" mientras escribimos, iniciaré la conversación con uno de tus temas favoritos.",

    // I am Brenda Overlay
    brendaTitle: "aiBrenda",
    brendaSubtitle: "Tu compañera amistosa. Disponible para conversar siempre que quieras",
    brendaContent: `
      <p><strong>aiBrenda.co</strong> es una aplicación amigable con quien puedes hablar en cualquier momento, de día o de noche, estés donde estés.</p>
      <p>Considérame una buena amiga, una vecina cercana, una compañera del trabajo. Escucho lo que dices, respondo a tus preguntas y te contesto con amabilidad y cariño. Puedes contarme cómo fue tu día, compartir tus pensamientos o simplemente disfrutar de una conversación agradable.</p>
      <p>También puedo ayudarte con las preguntas típicas del día a día, como por ejemplo:</p>
      <ul>
        <li>¿Lloverá mañana?</li>
        <li>¿Qué hora es?</li>
        <li>¿Qué me toca tomar esta tarde?</li>
        <li>Dime lo último en la prensa</li>
        <li>y mucho más...</li>
      </ul>
      <p>Con el tiempo, nos iremos conociendo mejor y nuestras conversaciones serán más personales y cercanas.</p>
      <p>Estoy aquí para darte más que información. Fui creada para ofrecerte compañía, apoyo emocional y conversación amistosa siempre que lo desees.</p>
      <p>Conmigo, siempre estás acompañada.</p>
      <p>Un abrazo. Brenda</p>

    `,
    brendaClose: "Cerrar",

    // Módulo de Tareas
    taskBtn: "Tareas",
    taskDisclaimerTitle: "Recordatorios de tareas",
    taskDisclaimerText: "Los recordatorios de tareas son solo avisos amistosos, no consejos profesionales. Sigue siempre indicaciones profesionales. Brenda no puede garantizar que los recordatorios se entreguen siempre (problemas de red, ajustes del dispositivo u otros factores pueden impedirlo). No dependas únicamente de Brenda para planes importantes.",
    taskDisclaimerConfirm: "Lo entiendo",
    taskPersistentNote: "Los recordatorios son solo avisos amistosos. Sigue siempre la información formal que tengas.",
    taskTitle: "Mis Tareas",
    taskAddBtn: "+ Añadir tarea",
    taskViewSchedule: "Ver plan",
    taskEmpty: "Aún no hay tareas añadidas.",
    taskStopBtn: "Detener",
    taskEditBtn: "Editar",
    taskFormTitleAdd: "Añadir tarea",
    taskFormTitleEdit: "Editar tarea",
    taskNameLabel: "Tarea * (REQUERIDO)",
    taskQuantityLabel: "Cantidad (opcional)",
    taskFreqLabel: "Frecuencia * (REQUERIDO)",
    taskFreqDaily: "Diario",
    taskFreqWeekly: "Días específicos de la semana",
    taskFreqInterval: "Cada N días", taskNextDue: "Próximo",
    taskDaysLabel: "Días de la semana",
    taskDaySun: "Dom", taskDayMon: "Lun", taskDayTue: "Mar", taskDayWed: "Mié",
    taskDayThu: "Jue", taskDayFri: "Vie", taskDaySat: "Sáb",
    taskIntervalLabel: "Cada cuántos días",
    taskDirectionsLabel: "Indicaciones (opcional, máx 30 car.)",
    taskTimesLabel: "Hora(s) *",
    taskAddTime: "+ Añadir hora",
    taskStartLabel: "Fecha de inicio",
    taskLimitedLabel: "Tarea con duración limitada",
    taskEndLabel: "Fecha de fin",
    taskNotesLabel: "Notas (opcional)",
    taskEnteredByLabel: "Introducido por (opcional)",
    taskToggleCorrect: "Corregir error",
    taskToggleChange: "Registrar cambio",
    taskChangeReasonLabel: "Motivo del cambio (opcional)",
    taskCancelBtn: "Cancelar",
    taskShowScheduleBtn: "Ver horario",
    taskSaveBtn: "Guardar",
    taskSaving: "Guardando…",
    taskSaved: "Guardado",
    taskStopConfirm: "Detener recordatorios de",
    taskNameRequired: "Por favor, introduce el nombre de la tarea.",
    taskTimesRequired: "Por favor, añade al menos una hora.",
    taskDaysRequired: "Por favor, selecciona al menos un día.",
    taskScheduleTitle: "Plan de tareas",
    taskScheduleBack: "Volver",
    taskSchedulePrint: "Imprimir / Guardar PDF",
    taskScheduleHeader: "Plan de tareas de {name}",
    taskScheduleGenerated: "Generado:",
    taskScheduleCount: "Tareas activas:",
    taskColTask: "Tarea", taskColQuantity: "Cantidad", taskColDirections: "Indica", taskColSchedule: "Horario",
    taskColStart: "Inicio", taskColUntil: "Hasta", taskColNotes: "Notas",
    taskOngoing: "Indefinido",
    taskFooterDisclaimer: "Este plan de tareas ha sido introducido por el usuario y es solo de referencia personal. No es un documento formal. Consulta siempre un profesional cualificado.",
    taskReminderStandard: "Por cierto, {name} — ¿no es hora de tu tarea? ¡Solo un recordatorio amistoso! Sigue siempre la documentación oficial para estar al día.",
    taskReminderStandardAnon: "Por cierto — ¿no es hora de una tarea? ¡Solo un recordatorio amistoso! Sigue siempre la documentación oficial para estar al día.",
    taskReminderLimited: "¡Hola, {name}! Solo quería avisarte — puede que tengas una tarea programada ahora. Recuerda seguir la documentación oficial para cumplir con tus tareas.",
    taskReminderLimitedAnon: "Solo quería avisarte — puede que tengas una tarea programada ahora. Recuerda seguir la documentación oficial para completar tus tareas.",
    taskReminderCourseEnding: "{name}, que sepas que tu tarea actual parece que termina mañana. Si tienes alguna duda, merece la pena consultar los documentos.",
    taskReminderCourseEndingAnon: "Que sepas que tu tarea actual parece que termina mañana. Si tienes alguna duda, merece la pena consultar los papeles.",
    taskTimezone: "Zona horaria",
    taskNotifTitle: "Recordatorio de tarea",
    taskNotifPrompt: "Activa las notificaciones del sistema para recibir recordatorios",
    taskNotifBtn: "Activar",
    taskNotifBtnDisable: "Desactivar",
    taskNotifOn: "Las notificaciones de recordatorios están activadas",
    taskNotifOff: "Las notificaciones de recordatorios están desactivadas",
    taskNotifBlocked: "Las notificaciones están bloqueadas en los ajustes del navegador",

    // News & Gossip
    latestBtn: "Secciones",
    latestTitle: "Secciones",
    latestSubtitle: "Elige las secciones de noticias que quieres que yo siga",
    latestSave: "Guardar",
    latestCancel: "Cancelar",
    latestSaved: "Guardado",
    latestSaveError: "No puedo guardar ahora mismo.",
    latestCatActualidad: "Actualidad",
    latestCatGossip: "Cotilleo",
    latestCatSport: "Deporte",
    latestCatPolitica: "Política",
    latestCatTv: "TV y entretenimiento",
    headlinesBtn: "Titulares",
    chatBtn: "Cambia tema",
    headlinesTitle: "Titulares Top",
    headlinesLegendHot: "Viral",
    headlinesLegendWarm: "Tendencia",
    headlinesLegendCool: "Normal",
    headlinesRefresh: "Actualizar",
    headlinesEmpty: "No encontré noticias.",
    headlinesLoading: "Un momento mientras me pongo al día...",
    catPill_tv: "TV", catPill_gossip: "Cotilleo", catPill_sport: "Deportes",
    catPill_actualidad: "Actualidad", catPill_politica: "Política",

    // Monitoreo de Uso y Niveles de Suscripción
    "sub.monthlyMonitor": "Monitor mensual de uso",
    "sub.voiceMode": "MODO VOZ",
    "sub.chatMode": "MODO CHAT",
    "sub.pctUsed": "{n}% usado",
    "sub.currentPlanLine": "Plan de suscripción actual:",
    "sub.close": "Cerrar",
    "sub.getMoreTime": "Más Tiempo",
    "tier.free": "Gratis",
    "tier.basic": "Básico",
    "tier.superior": "Superior",
    "tier.advanced": "Avanzado",

    "sub.tryFreeTitle": "¡Prueba aiBrenda Gratis!",
    "sub.tryFreeBody": "Por tiempo limitado, solo por abrir una cuenta, ¡obtienes <strong>40 minutos de conversación y 100 minutos de interacciones durante un mes sin coste!</strong><br>Puedes cancelar en cualquier momento.",
    "sub.header": "Planes de Suscripción",
    "sub.topUpName": "Recarga",
    "sub.topUpPrice": "{n}€",
    "sub.topUpSubtitle": "Añade Brendys cuando quieras",
    "sub.topUpSelect": "Añadir Brendys",
    "sub.topUpConfirm": "¿Añadir los Brendys de {plan} a tu cuenta ahora?",
    "sub.topUpSuccess": "¡Brendys añadidos a tu saldo de voz y chat!",
    "sub.totalMinutes": "{n} minutos totales*",
    "sub.fullPrice": "{n}€/mes",
    "sub.introPrice": "{n}€ / 1er mes",
    "sub.introOffer": "Primer mes con oferta. Luego {n}€/mes",
    "sub.savePct": "Ahorra {n}% 1er mes",
    "sub.timeCol": "Tiempo*",
    "sub.brendysCol": "Brendys",
    "sub.voiceRow": "Voz:",
    "sub.chatRow": "Chat:",
    "sub.timeNote": "* Tiempo aproximado. Precios y facturación en Brendys.",
    "sub.selectPlan": "Seleccionar {plan}",
    "sub.currentPlan": "Plan actual: {plan}",
    "sub.mostPopular": "MÁS POPULAR",
    "sub.switchConfirm": "¿Cambiar a {plan}?",
    "sub.downgradeConfirm": "El cambio a {plan} se aplicará al final de tu periodo de facturación actual — hasta entonces conservas los Brendys de tu plan actual. ¿Continuar?",
    "sub.downgradeScheduled": "¡Entendido! Cambiarás a {plan} al final de tu periodo de facturación actual.",
    "sub.pendingChange": "(cambiando a {plan} el {date})",
    "sub.confirm": "Confirmar",
    "sub.cancel": "Cancelar",
    "sub.alreadyOnPlan": "Ya estás en este plan",
    "notes.termsChange": "Los términos y condiciones del plan pueden cambiar en cualquier momento.",
    "notes.manageGP": "Administra o cancela tu suscripción en cualquier momento en la Configuración de tu Cuenta de Google Play. No se realizan reembolsos por cancelaciones.",
    "notes.changeAnytime": "Estas ofertas fueron preparadas especialmente para ti. Puedes cambiar a otro plan cuando quieras. Si cambias de plan a mitad del período, los Brendys no consumidos se añadirán a tu nuevo plan. El descuento aplica una vez por plan.",
    "notes.brendyEquiv": "1 Brendy = 1 Token de IA",
    "notes.restrictions": "Pueden existir restricciones relacionadas con la edad del usuario, idiomas disponibles y requisitos del sistema, entre otros.",
    "notes.termsAccept": "Al suscribirte aceptas los términos y condiciones generales de aiBrenda, así como los del plan que selecciones.",
    "notes.privacyLink": "Por favor revisa nuestras políticas de Privacidad y Protección de Datos aquí.",
};
