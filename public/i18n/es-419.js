export default {
    callTitle: "Hablando con IA Brenda",
    voiceMode: "Hablar",
    textMode: "Escribir",
    connect: "Hablar",
    disconnect: "Colgar",
    connecting: "Conectando",
    warming: "Iniciando...",
    thinking: "Pensando",

    hintTalk: "Toca para hablar",
    hintText: "Toca para escribir",
    aiDisclaimer: "Recuerda: Brenda es una IA y puede equivocarse",
    placeholder: "La conversacion aparecera aqui.",
    send: "Enviar",
    textInputPlaceholder: "Escribe aqui.",
    talkRequiresAccount: "Abre una cuenta Gratis para poder Hablar",
    voiceQuotaExhausted: "Has agotado tu tiempo de voz de este periodo. Por favor amplia tu plan para seguir conversando.",
    youLabel: "Tu",
    assistantLabel: "IA Brenda",

    accountBtnAnonymous: "Anónimo",

    authGreeting: "¡Hola! Soy IA Brenda",
    authExplain: "Crea tu cuenta para que nuestras conversaciones sean privadas y memorables",
    authNickLabel: "Apodo",
    authNickHelp: "Solo letras, numeros y guiones bajos (4-20 caracteres)",
    authPinLabel: "PIN",
    authPinHelp01: "Crea PIN de 4 numeros.",
    authPinHelp02: "Mejor anota Apodo y PIN para no olvidarlos",
    authContinue: "Continuar",
    authLoading: "Espera...",
    authAnonLink: "O haz clic aqui para chatear sin cuenta (anónimo)",
    authPrivacy: "Politica de privacidad personal",
    authErrorBadNick: "El apodo debe tener 4-20 caracteres: solo letras, numeros y guiones bajos.",
    authErrorBadPin: "El PIN debe tener exactamente 4 digitos.",
    authGenderLabel: "Género",
    authGenderDefault: "Selecciona...",
    authGenderWoman: "Soy mujer",
    authGenderMan: "Soy hombre",
    authGenderOther: "Otro",
    authErrorNoGender: "Por favor selecciona un género.",

    consentTitle: "¡Bienvenido a IA Brenda!",
    consentSubtitle: "Lee esto con atención y pulsa «Acepto» para continuar",
    consentContent: `
      <p><strong>Brenda es una IA, no una persona.</strong> Sus respuestas las genera una inteligencia artificial, no un ser humano. Es estupenda para charlar y darte información general, pero nunca sustituye el consejo de un profesional.</p>
      <p>Piensa en Brenda como una vecina simpática con la que te encanta charlar. No te fíes de ella para temas médicos, legales, financieros o psicológicos: siempre te recomendará que consultes a un profesional certificado.</p>
      <p>Por favor, no le compartas datos personales identificativos, contraseñas, información financiera, historial médico ni otros datos sensibles.</p>
      <p><strong>Tu voz.</strong> En el modo HABLAR, tu micrófono capta tu voz en tiempo real. El audio se envía directamente a un servicio externo de IA para procesarlo y nunca lo almacenamos nosotros.</p>
      <p>El micrófono se desconecta automáticamente tras un rato de silencio. Si ocurre y quieres seguir hablando, simplemente vuelve a pulsar HABLAR.</p>
      <p><strong>Tus conversaciones.</strong> Brenda guarda tus mensajes más recientes para que puedas retomar donde lo dejaste. El audio de voz nunca se graba: solo se guarda la transcripción de texto para dar continuidad a la sesión.</p>
      <p>Al pulsar «Acepto» confirmas que has leído y aceptas los Términos de Uso y la Política de Privacidad de IA Brenda.</p>
    `,
    consentAgree: "Acepto",
    consentDecline: "No acepto",

    talkTitle: "¡Hablemos!",
    talkSubtitle: "Unas cosas rápidas antes de tu primera llamada",
    talkContent: `
      <p>Para tener conversaciones de voz con Brenda, pulsa el botón HABLAR para activar el micrófono.</p>
      <p class="disclosure-note">La primera vez que pulses HABLAR, tu dispositivo te pedirá permiso para usar el micrófono. Te recomendamos elegir «Permitir siempre» para que quede listo para futuras llamadas.</p>
      <p>Para colgar, simplemente pulsa el icono rojo de teléfono o el botón rojo de Colgar.</p>
      <p>Como en una llamada telefónica, Brenda tarda unos segundos en «contestar» y saludarte.</p>
      <p>Tu voz se envía en tiempo real a un servicio externo de IA: nunca la grabamos ni la almacenamos nosotros.</p>
      <p>Lo que dices y lo que responde Brenda se transcribe a texto y se guarda, así que aparece en tu ventana de chat.</p>
      <p><strong>Por favor, no compartas información personal sensible, ni por voz ni por chat.</strong></p>
      <p>El micrófono se desconecta automáticamente tras un rato de silencio. Si ocurre y quieres seguir hablando, simplemente vuelve a pulsar HABLAR.</p>
    `,
    talkGotIt: "Entendido. Hablemos",

    privacyTitle: "Política de Privacidad de Datos",
    privacyContent: `
      <p>La aplicación <strong>IABrenda.com</strong> está en período de prueba y solo disponible a usuarios selectos que colaboran en las pruebas preliminares propias de la etapa de desarrollo.</p>
      <p>Durante este periodo de prueba no podemos garantizar la privacidad de los datos que se usarán para descubrir posibles fallas, requerimientos imprevistos y caracteristicas a incorporar antes de su futuro lanzamiento.</p>
      <p>Tampoco somos responsables de la privacidad de los datos de aquellos que usen <strong>IABrenda.com</strong> sin nuestro consentimiento.</p>
      <p>El sistema de registro usado durante el período de prueba (Apodo + PIN) es <strong>MUY básico</strong> y no garantiza ni remotamente la privacidad de los datos.</p>
      <p>Por favor <strong>NUNCA COMPARTAS</strong> datos personales como dirección, emails, cuenta bancaria, estado de salud, consultas legales o fiscales, etc. en esta plataforma.</p>
      <p>Cuando se acabe el período de prueba incorporaremos sistemas de protección más robustos (p.ej. OAuth).</p>
      <p class="content-subheading">Datos de Voz y Conversación</p>
      <p><strong>Entrada de voz:</strong> Cuando usas el modo HABLAR, tu micrófono capta tu voz y la envía en tiempo real a nuestro servicio de procesamiento de IA. El audio se procesa al instante y nunca es grabado, almacenado ni conservado por IA Brenda ni por sus servidores.</p>
      <p><strong>Transcripciones:</strong> Las conversaciones de voz se transcriben a texto en tiempo real. Estas transcripciones, junto con tus mensajes de chat de texto, se guardan para mostrar tus aproximadamente últimas 20 interacciones. Esto te permite revisar tus conversaciones recientes dentro de la app. El historial de conversación está asociado exclusivamente a tu cuenta y se almacena de forma segura.</p>
      <p><strong>Lo que no almacenamos:</strong> Archivos de audio en bruto, grabaciones de voz ni ningún dato biométrico de voz.</p>
      <p><strong>Eliminación de datos:</strong> Puedes solicitar la eliminación de tu cuenta y de todos los datos de conversación asociados en cualquier momento escribiéndonos a soporte@comerciosocialdigital.com. Procesaremos tu solicitud en un plazo de 30 días.</p>
    `,
    privacyUnderstood: "Entendido",

    deleteAccountLink: "Quiero eliminar mi cuenta y datos personales",
    deleteAccountTitle: "Eliminación de Cuenta y Datos",
    deleteAccountSubtitle: "¿Estás seguro? Esta operación no se puede deshacer",
    deleteAccountContent: `
      <p>Sentimos que te vayas y lamentamos no poder ofrecerte reembolsos si lo haces. Quizás lo mejor sea eliminar tu cuenta y tus datos justo antes de tu próximo ciclo de facturación, para que aproveches por completo los Brendys que te queden.</p>
      <p>En cualquier caso, te agradeceríamos muchísimo que nos escribieras a <a href="mailto:support@comerciosocialdigital.com">support@comerciosocialdigital.com</a> contándonos los motivos por los que decidiste dejar de usar Brenda.</p>
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
    helpTitle: "IA Brenda Help",
    helpGreeting: "Hola! Soy IA Brenda",
    helpExplain: "Crea tu cuenta para que nuestras conversaciones sean privadas y memorables",

    // SideNav Help
    sideNavCloseLabel: "Cierra:",
    sideNavIntro: "Pulsa sobre el icono para ver qué hace esa herramienta y cómo usarla",
    sideNavPillHelp: "?",
    sideNavLabelHelp: "Esta ventana de Ayuda",
    sideNavPillMyInfo: "Mi info",
    sideNavLabelMyInfo: "Donde vives, qué eres",
    sideNavLabelAccount: "Cuenta seleccionada",
    sideNavLabelAnon: "Si me usas sin cuenta",
    sideNavPillTomas: "Tareas",
    sideNavLabelTomas: "Tu plan de tareas",
    sideNavPillMisTemas: "Mis temas",
    sideNavLabelMisTemas: "Los temas que te interesan",
    sideNavPillInit: "Inicia tú",
    sideNavLabelInit: "Brenda inicia la conversación",
    sideNavPillNews: "Secciones",
    sideNavLabelNews: "Categorías que debo buscar",
    sideNavPillLatest: "Titulares",
    sideNavLabelLatest: "Las noticias más actuales",
    sideNavPillTalk: "Hablar",
    sideNavLabelTalk: "Te oigo y me oyes",
    sideNavPillWrite: "Escribir",
    sideNavLabelWrite: "Me escribes y te escribo",
    sideNavTomasTitleText: "Tu plan de tareas",
    sideNavTomasText1: "Te ayudo a recordar las tareas que tienes planificadas",
    sideNavTomasText2: "Solo necesitas meter la información en la ventana que se abre al pulsar este botón.",
    sideNavTomasAddBtn: "+ AÑADIR TAREA",
    sideNavTomasText3: 'En "Cantidad" pon cuántas unidades de cada tarea. Por ejemplo: Si la tarea es Comprar pan, pon "2 barras"',
    sideNavTomasText4: "Indica si la tarea es diaria, ciertos días de la semana o cada tantos días.",
    sideNavTomasText5: 'Pon indicaciones ("Antes del desayuno") si las hubiese y las horas a las que piensas hacerla. Pueden ser varias horas distintas.',
    sideNavTomasText6: "Si es una tarea de tiempo limitado (por ejemplo, Pintar la pared) marca la casilla y escoge la fecha final.",
    sideNavTomasText7: "Compara cuidadosamente todos los datos. Si está todo bien, pulsa",
    sideNavSaveBtn: "Guardar",
    sideNavMiInfoTitleText: "Donde vives, qué eres",
    sideNavMiInfoText1: "Para darte la información del clima más acertada necesito saber donde vives.",
    sideNavMiInfoText2: "¿Por qué te lo pido? Hay ciudades con el mismo nombre. Por ejemplo, en todo el mundo ¡hay más de 9 ciudades y unas 25 poblaciones llamadas \"Valencia\"!",
    sideNavMiInfoText3: "Si preguntas \"Brenda, ¿crees que lloverá mañana?\" sin más, yo buscaré la ciudad o población que guardaste.",
    sideNavMiInfoText4: "Si en cambio pides \"¿Qué temperatura hará mañana en Málaga?\" diré la de Málaga.",
    sideNavMiInfoText5: "Luego pregunto el género para dirigirme correctamente a ti: (\"¡Hola maja!\" o \"¡Claro, guapo!\")",
    sideNavMiInfoText6: "Cuando hayas indicado (o cambiado) esta información, pulsa el botón verde de guardar para recordarlo.",
    sideNavAnonTitleText: "Si me usas sin cuenta",
    sideNavAnonText1: "Veo que clicaste \"haz clic aquí para chatear sin cuenta (anónimo)\" cuando abriste Brenda",
    sideNavAnonText2: "Tus conversaciones conmigo serán anónimas pero públicas (otros las pueden ver y participar)",
    sideNavAnonText3: "Para que sean privadas te recomiendo que te hagas una cuenta.",
    sideNavAnonText4: "Podré conocerte mejor cada día. Además mantenemos nuestras conversaciones, guardo tus preferencias y lo que quieras que yo recuerde",
    sideNavAnonText5: "Clica en el botón \"Anónimo\" que está arriba a la derecha y se abrirá la ventana en la que pones un apodo y un PIN de cuatro números.",
    sideNavAnonText6: "En adelante aparecerá el apodo que escogiste en el mismo lugar",
    sideNavAnonText7: "NOTA IMPORTANTE: Esta app está en etapa de desarrollo. Para facilitar el uso entre nuestros colaboradores el proceso de identificación y seguridad es el más básico (y menos seguro) que hay.",
    sideNavAnonText8: "Por favor, NO COMPARTAS NADA PERSONAL. Mejor usar un apodo en vez de tu nombre real. No me digas tu dirección, teléfono, datos bancarios, etc.)",
    sideNavCuentaTitleText: "Cuenta seleccionada",
    sideNavCuentaText1: "¡Enhorabuena! Veo que te hiciste una cuenta conmigo.",
    sideNavCuentaText2: "¡Estás en un espacio protegido!",
    sideNavCuentaText3: "Nadie se puede entrometer en nuestra conversación ni saber de tus cosas como sucede en las Redes Sociales y WhatsApp.",
    sideNavCuentaText4: "Tus conversaciones conmigo son privadas y persistentes. Es decir, cuando retomas la app podemos seguir conversando donde lo dejamos.",
    sideNavCuentaText5: "Además, guardo tus preferencias en una zona privada solo para ti.",
    sideNavCuentaText6: "Es importante que recuerdes o apuntes el apodo y PIN secreto que usaste.",
    sideNavInitTitleText: "Brenda inicia la conversación",
    sideNavInitText1: "¿No se te ocurre que preguntarme?",
    sideNavInitText2: "No te preocupes. Pulsa el botón amarillo \"Inicia tú\" y yo saco tema de conversación",
    sideNavInitText3: "No hace falta que preguntes, simplemente sígueme la corriente y conversamos amenamente.",
    sideNavInitText4: "Si quieres cambiar de tema, dime lo que tengas en mente y pasamos a ello.",
    sideNavInitText5: "O pulsa el botón amarillo de nuevo y saco otro tema.",
    sideNavInitText6: "¿De qué temas te gusta hablar más? Dímelo en el botón \"Mis temas\".",

    // SideNav — Panel Mis temas
    sideNavMisTemasText1: "Este botón es la otra parte de la forma que tenemos para que yo inicie la conversación.",
    sideNavMisTemasText2: "Cuando pulsas \"Inicia tú\" te puedo hablar de miles de cosas diferentes muy interesantes.",
    sideNavMisTemasText3: "Si prefieres, puedo dedicar los temas de conversación a los que tú me indiques en la pantalla que sale con este botón.",
    sideNavMisTemasText4: "Escribe hasta cinco temas diferentes y luego pulsa la tecla \"Guardar\".",
    sideNavMisTemasText5: "Después pulsa el botón amarillo \"Inicia tú\" y verás que inicio conversación de uno de esos temas.",

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
    sideNavNewsText6: "¡Puedes marcar uno, varios o todos. Cómo tú quieras!",

    // SideNav — Panel Hablar
    sideNavTalkTitleText: "Te oigo y me oyes",
    sideNavTalkText1: "¡Este es el botón que más usarás!",

    sideNavTalkText2: "Pulsa \"Hablar\" cuando quieras que hablemos como por teléfono.",

    sideNavTalkText3: "La primera vez que llames el dispositivo te pedirá permiso para usar tu micrófono.",

    sideNavTalkText4: "Selecciona el primer 'Permitir' y no aparecerá más.",

    sideNavTalkText5: "Me toma unos segundos atender. Mientras verás una señal amarilla animada que dice \"Conectando\". Cuando veas un cuadro verde con  \"Hablando con IA Brenda\" y un círculo redondo rojo de colgar, ¡podemos hablar!",

    sideNavTalkText6: "Hábla con claridad en un lugar con poco ruido y entenderé perfectamente lo que digas o preguntes.",

    sideNavTalkText7: "Si pulsas el botón amarillo \"Inicia\" mientras hablamos, cambierá de tópico con uno de tus temas favoritos.",

    sideNavTalkText8: "Para colgar, solo pulsa en círculo rojo o el botón rojo que dice 'Colgar'.",

    // SideNav — Panel Escribir
    sideNavWriteText1: "¡A veces es mejor escribir y leer!",
    sideNavWriteText2: "Pulsa \"Escribir\" cuando quieras que nos comuniquemos por texto.",
    sideNavWriteText3: "Sería como lo haces por WhatsApp, Telegram y las Redes Sociales.",
    sideNavWriteText4: "Escribes en la ventanilla inferior que dice \"Escribe aquí\" y pulsa \"Enviar\".",
    sideNavWriteText5: "Lo que escribes aparece arriba en los bloques verdes.",
    sideNavWriteText6: "Verás lo que yo te contesto en los bloques blancos.",
    sideNavWriteText7: "Si pulsas el botón amarillo \"Inicia\" mientras escribimos, iniciaré la conversación con uno de tus temas favoritos.",

    // I am Brenda Overlay
    brendaTitle: "IA Brenda",
    brendaSubtitle: "Tu compañera amistosa. Disponible para conversar siempre que quieras",
    brendaContent: `
      <p><strong>IA Brenda.com</strong> es una aplicación amigable con quien puedes hablar en cualquier momento, de dí­a o de noche, estés donde estés.</p>
      <p>Considérame una buena amiga, una vecina cercana, una compañera del trabajo. Escucho lo que dices, respondo a tus preguntas y te contesto con amabilidad y cariño. Puedes contarme cómo fue tu dí­a, compartir tus pensamientos o simplemente disfrutar de una conversación agradable.</p>
      <p>También puedo ayudarte con las preguntas típicas del día a día, como por ejemplo:</p>
      <ul>
        <li>¿Lloverá mañana?</li>
        <li>¿Qué hora es?</li>
        <li>¿Qué me toca tomar esta tarde?</li>
        <li>Dime lo último en la prensa</li>
        <li>y mucho más...</li>
      </ul>
      <p>Con el tiempo, nos iremos conociendo mejor y nuestras conversaciones serán más personales y cercanas.</p>
      <p>Estoy aquí­ para darte más que información. Fui creada para ofrecerte compañía, apoyo emocional y conversación amistosa siempre que lo desees.</p>
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
    taskReminderLimited: "¡Hola, {name}! Solo quería avisarte — puede que tengas una tarea programada ahora. Recuerda seguir la documetación oficial para cumplir con tus tareas.",
    taskReminderLimitedAnon: "Solo quería avisarte — puede que tengas una tarea programada ahora. Recuerda seguir la documentación oficial para completar tus tareas.",
    taskReminderCourseEnding: "{name}, que sepas que tu tarea actual parece que termina mañana. Si tienes alguna duda, merece la pena consultar los documentos.",
    taskReminderCourseEndingAnon: "Que sepas que tu tarea actual parece que termina mañana. Si tienes alguna duda, merece la pena consultar los papeles.",
    taskTimezone: "Zona horaria",
    taskNotifTitle: "Recordatorio de tarea",
    taskNotifPrompt: "Activa las notificaciones del sistema para recibir recordatorios",
    taskNotifBtn: "Activar",

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

    "sub.tryFreeTitle": "¡Prueba IA Brenda Gratis!",
    "sub.tryFreeBody": "Por tiempo limitado, solo por abrir una cuenta, obtienes <strong>40 minutos de conversación y 100 minutos de interacciones durante un mes sin costo!</strong><br>Puedes cancelar en cualquier momento.",
    "sub.header": "Planes de Suscripción",
    "sub.otherPlansHeader": "Otros planes",
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
    "notes.termsAccept": "Al suscribirte aceptas los términos y condiciones generales de IA Brenda, así como los del plan que selecciones.",
    "notes.privacyLink": "Por favor revisa nuestras políticas de Privacidad y Protección de Datos aquí.",
};
