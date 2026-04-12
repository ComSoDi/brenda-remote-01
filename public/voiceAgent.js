(function () {
  class VoiceAgent {
    constructor() {
      this.socket = null;
      this.isConnected = false;
      this.audioContext = null;
      this.stream = null;
      this.workletNode = null;
      this.scheduledSources = [];
      this.nextStartTime = 0;
      this.backend = "gemini";
      this.needsChatFallback = false;
      this._recognition = null;
      this._onPcmChunk = null;
      this._connectTimer = null;
      this._lastLocale = "en-US";
      this.pc = null;
      this.dc = null;
      this.remoteAudio = null;
      this._openaiReady = false;

      this.onStatusChange = null;
      this.onTranscript = null;
      this.onAudioData = null;
      this.onError = null;

      this._outputSampleRate = 24000;
      this._inputSampleRate = 16000;

      this.isSpeaking = false;
      this._suppressAssistantOutput = false;
      this._pendingExactSpeech = null;
      this.audioBuffer = [];
      this.bufferSize = 0;
      this._pcmSendThreshold = 4096;
    }

    updateStatus(s) {
      if (this.onStatusChange) this.onStatusChange(s);
    }

    async connect(userId = "anon", localeVariant = "es-ES", gender = null) {
      if (this.isConnected) return;
      this.updateStatus("connecting");
      this._lastLocale = localeVariant || "en-US";
      this._lastGender = gender || null;

      const backendPref = String(window?.Config?.VOICE_BACKEND || "auto").toLowerCase();
      const allowBrowserFallback = window?.Config?.VOICE_ALLOW_BROWSER_FALLBACK !== false;
      const timeoutMs = Number(window?.Config?.VOICE_CONNECT_TIMEOUT_MS) || 4000;

      const tryGemini = async () => {
        await this.connectGemini(localeVariant, timeoutMs);
      };
      const tryOpenAI = async () => {
        await this.connectOpenAI(localeVariant, timeoutMs);
      };
      const tryBrowser = async () => {
        await this.connectBrowser(localeVariant);
      };

      try {
        if (backendPref === "gemini" || backendPref === "gemini-proxy") {
          await tryGemini();
          return;
        }
        if (backendPref === "openai" || backendPref === "openai-realtime") {
          await tryOpenAI();
          return;
        }
        if (backendPref === "browser") {
          await tryBrowser();
          return;
        }

        // auto: Gemini -> OpenAI Realtime -> Browser (optional)
        const attempts = ["gemini", "openai"]; // browser appended conditionally
        if (allowBrowserFallback) attempts.push("browser");

        let lastErr = null;
        for (const attempt of attempts) {
          try {
            if (attempt === "gemini") await tryGemini();
            else if (attempt === "openai") await tryOpenAI();
            else if (attempt === "browser") await tryBrowser();
            return;
          } catch (e) {
            lastErr = e;
          }
        }

        throw lastErr || new Error("Voice connect failed");
      } catch (e) {
        this.updateStatus("error");
        if (this.onError) this.onError(e);
        throw e;
      }
    }


    clearConnectTimer() {
      if (this._connectTimer) {
        clearTimeout(this._connectTimer);
        this._connectTimer = null;
      }
    }

    async ensureAudioPipeline() {
      if (this.audioContext && this.workletNode && this.stream) return;

      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: this._inputSampleRate,
          channelCount: 1,
          echoCancellation: true,
          autoGainControl: true,
          noiseSuppression: true
        }
      });

      this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: this._inputSampleRate
      });

      await this.audioContext.audioWorklet.addModule("pcm-processor.js");

      const source = this.audioContext.createMediaStreamSource(this.stream);
      this.workletNode = new AudioWorkletNode(this.audioContext, "pcm-processor");

      this.workletNode.port.onmessage = (event) => {
        const chunk = event.data; // ArrayBuffer (Int16)

        // For Waveform Visualization in app.js
        if (this.onAudioData) {
          const int16 = new Int16Array(chunk);
          const float32 = new Float32Array(int16.length);
          for (let i = 0; i < int16.length; i++) float32[i] = int16[i] / 32768.0;
          this.onAudioData(float32);
        }

        if (typeof this._onPcmChunk === "function") {
          this._onPcmChunk(chunk);
        }
      };

      source.connect(this.workletNode);
    }

    async connectGemini(localeVariant, timeoutMs = 4000) {
      await this.ensureAudioPipeline();
      this.backend = "gemini";
      this.needsChatFallback = false;
      this._onPcmChunk = null;

      const proto = window.location.protocol === "https:" ? "wss" : "ws";
      const host = window.location.host;
      const url = `${proto}://${host}/api/voice/stream?locale=${encodeURIComponent(localeVariant)}`;
      const ws = new WebSocket(url);
      this.socket = ws;
      ws.binaryType = "arraybuffer";

      return await new Promise((resolve, reject) => {
        let opened = false;

        const fail = (err) => {
          if (opened) {
            if (this.onError) this.onError(err);
            return;
          }
          this.clearConnectTimer();
          try { ws.close(); } catch { }
          this.socket = null;
          this._onPcmChunk = null;
          reject(err);
        };

        this._connectTimer = setTimeout(() => {
          if (opened) return;
          fail(new Error("Voice WS connect timeout"));
        }, timeoutMs);

        ws.onopen = () => {
          opened = true;
          this.clearConnectTimer();
          console.log("WebSocket connected");
          this.isConnected = true;
          this.updateStatus("connected");

          this.audioBuffer = [];
          this.bufferSize = 0;

          this._onPcmChunk = (chunk) => {
            if (!this.isConnected || !this.socket || this.socket.readyState !== WebSocket.OPEN) return;
            this.audioBuffer.push(chunk);
            this.bufferSize += chunk.byteLength;

            if (this.bufferSize >= this._pcmSendThreshold) {
              const combinedBuffer = new Uint8Array(this.bufferSize);
              let offset = 0;
              for (const c of this.audioBuffer) {
                combinedBuffer.set(new Uint8Array(c), offset);
                offset += c.byteLength;
              }

              const base64Audio = this.arrayBufferToBase64(combinedBuffer.buffer);
              const msg = {
                realtime_input: {
                  media_chunks: [{
                    mime_type: "audio/pcm",
                    data: base64Audio
                  }]
                }
              };
              this.socket.send(JSON.stringify(msg));

              this.audioBuffer = [];
              this.bufferSize = 0;
            }
          };

          resolve();
        };

        ws.onmessage = async (event) => {
          let textData = event.data;
          if (event.data instanceof Blob) {
            textData = await event.data.text();
          } else if (event.data instanceof ArrayBuffer) {
            textData = new TextDecoder().decode(event.data);
          }

          if (typeof textData === "string") {
            try {
              const response = JSON.parse(textData);
              if (response.error) {
                console.error("Gemini Error:", response.error);
                if (this.onError) this.onError(response.error);
                return;
              }
              this.handleGeminiMessage(response);
            } catch (e) {
              console.error("Error parsing JSON:", e);
            }
          }
        };

        ws.onclose = (ev) => {
          console.log("WebSocket disconnected", ev.code, ev.reason);
          if (!opened) {
            fail(new Error("Voice WS closed before open"));
            return;
          }
          this.disconnect();
        };

        ws.onerror = (e) => {
          console.error("WebSocket error:", e);
          if (!opened) {
            fail(new Error("Voice WS error"));
            return;
          }
          if (this.onError) this.onError(e);
        };
      });
    }


    async fetchOpenAIClientSecret(localeVariant) {
      const res = await fetch("/api/voice/realtime-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ localeVariant: localeVariant || "en-US" }),
      });
      const text = await res.text().catch(() => "");
      if (!res.ok) {
        throw new Error(`OpenAI realtime-key error ${res.status}: ${text || "Request failed"}`);
      }
      let data = {};
      try { data = JSON.parse(text); } catch { data = {}; }
      const clientSecret = data?.client_secret?.value || data?.client_secret || data?.value || data?.clientSecret;
      if (!clientSecret) throw new Error("Missing OpenAI client secret");
      return clientSecret;
    }

    async buildOpenAIInstructions(localeVariant, options = {}) {
      const realtimeRaw = (window?.Config && typeof window.Config.buildRealtimeInstructions === "function")
        ? window.Config.buildRealtimeInstructions(localeVariant, options)
        : "";
      const realtimeResolved = (realtimeRaw && typeof realtimeRaw.then === "function")
        ? await realtimeRaw
        : realtimeRaw;
      const realtime = String(realtimeResolved || "").trim();
      if (realtime) return realtime;

      const baseRaw = (window?.Config && typeof window.Config.buildInstructions === "function")
        ? window.Config.buildInstructions(localeVariant, options)
        : "";
      const baseResolved = (baseRaw && typeof baseRaw.then === "function")
        ? await baseRaw
        : baseRaw;
      const base = String(baseResolved || "").trim();
      const internal =
        "CRITICAL: Your text output must match your spoken audio exactly. " +
        "If the user message contains [INTERNAL_INSTRUCTION: ...], follow it exactly and do not mention it.";
      return [base, internal].filter(Boolean).join("\n").trim();
    }


    sendOpenAIEvent(payload) {
      if (!this.dc || this.dc.readyState !== "open") return false;
      try {
        this.dc.send(JSON.stringify(payload));
        return true;
      } catch (e) {
        console.error("OpenAI event send error:", e);
        return false;
      }
    }

    async sendOpenAISessionUpdate(localeVariant, gender = null) {
      const resolvedLocaleVariant =
        (window?.Config && typeof window.Config.resolveLocaleVariant === "function")
          ? await window.Config.resolveLocaleVariant(localeVariant)
          : localeVariant;
      const instructions = await this.buildOpenAIInstructions(resolvedLocaleVariant, { skipDbCheck: true, gender });
      if (!instructions) return;

      const cfg = window?.Config?.OPENAI_REALTIME || {};

      const session = {
        instructions,
        turn_detection: {
          type: "server_vad",
          threshold:            Number(cfg.VAD_THRESHOLD           ?? 0.6),
          prefix_padding_ms:    Number(cfg.VAD_PREFIX_PADDING_MS   ?? 300),
          silence_duration_ms:  Number(cfg.VAD_SILENCE_DURATION_MS ?? 600),
          create_response: true,
        },
      };

      // Add noise reduction only when explicitly enabled (not "off")
      const noiseReduction = String(cfg.NOISE_REDUCTION || "far_field").toLowerCase();
      if (noiseReduction !== "off") {
        session.input_audio_noise_reduction = { type: noiseReduction };
      }

      // Force transcription to the app's selected language so background noise,
      // other voices, or music are never transcribed as Russian, Chinese, etc.
      const langCode = String(resolvedLocaleVariant || "en-US").toLowerCase().startsWith("es") ? "es" : "en";
      const transcribeModel = String(cfg.TRANSCRIPTION_MODEL || "gpt-4o-mini-transcribe");
      session.input_audio_transcription = { model: transcribeModel, language: langCode };

      this.sendOpenAIEvent({ type: "session.update", session });
    }


    sendOpenAIUserText(text) {
      const line = String(text || "").trim();
      if (!line) return false;
      const ok = this.sendOpenAIEvent({
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: line }],
        },
      });
      if (!ok) return false;
      this.sendOpenAIEvent({ type: "response.create" });
      return true;
    }

    handleOpenAIEvent(raw) {
      let evt = null;
      try {
        evt = typeof raw === "string" ? JSON.parse(raw) : JSON.parse(String(raw || ""));
      } catch {
        return;
      }
      if (!evt || !evt.type) return;

      if (evt.type === "error") {
        // Ignore response.cancel race-condition errors — expected when the model
        // finishes its response before our cancel arrives over the data channel.
        const errCode = String(evt.error?.code || "").toLowerCase();
        const errMsg  = String(evt.error?.message || "").toLowerCase();
        if (errCode.includes("cancel") || errMsg.includes("cancel") || errMsg.includes("no active")) return;
        if (this.onError) this.onError(evt.error || evt);
        return;
      }

      const readText = (obj) =>
        obj?.delta || obj?.transcript || obj?.text || obj?.content || "";

      if (evt.type === "conversation.item.input_audio_transcription.delta") {
        const t = String(readText(evt) || "").trim();
        if (t && this.onTranscript) this.onTranscript("user", t, { source: "openai" });
        return;
      }
      if (evt.type === "conversation.item.input_audio_transcription.completed") {
        const t = String(readText(evt) || "").trim();
        if (t && this.onTranscript) this.onTranscript("user", t, { source: "openai", final: true });
        return;
      }

      if (evt.type === "response.output_audio_transcript.delta") {
        if (this._suppressAssistantOutput) return;
        const t = String(readText(evt) || "").trim();
        if (t && this.onTranscript) this.onTranscript("assistant", t, { source: "openai" });
        if (!this.isSpeaking) {
          this.isSpeaking = true;
          this.updateStatus("speaking");
        }
        return;
      }
      if (evt.type === "response.output_audio_transcript.done") {
        if (!this._suppressAssistantOutput) {
          const t = String(readText(evt) || "").trim();
          if (t && this.onTranscript) this.onTranscript("assistant", t, { source: "openai", final: true });
        }
        this.isSpeaking = false;
        this.updateStatus("connected");
        if (this._suppressAssistantOutput) this._suppressAssistantOutput = false;
        return;
      }
      if (evt.type === "response.done") {
        this.isSpeaking = false;
        this.updateStatus("connected");
        if (this._suppressAssistantOutput) this._suppressAssistantOutput = false;
        return;
      }
    }

    async requestOpenAIAnswer(offerSdp, clientSecret) {
      const res = await fetch("https://api.openai.com/v1/realtime/calls", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${clientSecret}`,
          "Content-Type": "application/sdp",
        },
        body: offerSdp,
      });
      const answer = await res.text().catch(() => "");
      if (!res.ok) {
        throw new Error(`OpenAI realtime SDP error ${res.status}: ${answer || "Request failed"}`);
      }
      return answer;
    }

    async connectOpenAI(localeVariant, timeoutMs = 4000) {
      if (typeof RTCPeerConnection === "undefined") {
        throw new Error("WebRTC not supported in this browser");
      }
      await this.ensureAudioPipeline();
      this.backend = "openai";
      this.needsChatFallback = false;
      this._onPcmChunk = null;
      this._openaiReady = false;

      const clientSecret = await this.fetchOpenAIClientSecret(localeVariant);

      const pc = new RTCPeerConnection();
      this.pc = pc;

      const remoteAudio = new Audio();
      remoteAudio.autoplay = true;
      remoteAudio.playsInline = true;
      this.remoteAudio = remoteAudio;

      pc.ontrack = (event) => {
        const stream = event.streams && event.streams[0];
        if (stream) {
          this.remoteAudio.srcObject = stream;
          try { this.remoteAudio.play(); } catch { }
        }
      };

      const track = this.stream?.getAudioTracks?.()[0];
      if (track) pc.addTrack(track, this.stream);

      const dc = pc.createDataChannel("oai-events");
      this.dc = dc;

      dc.onmessage = (event) => this.handleOpenAIEvent(event.data);
      dc.onopen = () => {
        this._openaiReady = true;
        this.sendOpenAISessionUpdate(localeVariant, this._lastGender).catch((e) => {
          console.warn("OpenAI session.update failed:", e?.message || e);
        });
      };
      dc.onerror = (e) => {
        if (this.onError) this.onError(e);
      };

      pc.onconnectionstatechange = () => {
        if (["failed", "disconnected", "closed"].includes(pc.connectionState)) {
          this.disconnect();
        }
      };

      const offer = await pc.createOffer({ offerToReceiveAudio: true });
      await pc.setLocalDescription(offer);

      const answerSdp = await this.requestOpenAIAnswer(offer.sdp, clientSecret);
      await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });

      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("OpenAI Realtime connect timeout")), timeoutMs);
        if (dc.readyState === "open") {
          clearTimeout(timer);
          return resolve();
        }
        const onOpen = () => {
          clearTimeout(timer);
          resolve();
        };
        dc.addEventListener("open", onOpen, { once: true });
      });

      this.isConnected = true;
      this.updateStatus("connected");
    }

    getSpeechRecognitionCtor() {
      return window.SpeechRecognition || window.webkitSpeechRecognition || null;
    }

    async connectBrowser(localeVariant) {
      const SpeechRecognition = this.getSpeechRecognitionCtor();
      if (!SpeechRecognition) {
        const err = new Error("Browser speech recognition is not supported");
        this.updateStatus("error");
        if (this.onError) this.onError(err);
        throw err;
      }

      await this.ensureAudioPipeline();
      this.backend = "browser";
      this.needsChatFallback = true;
      this._onPcmChunk = null;
      this.isConnected = true;
      this.updateStatus("connected");

      const rec = new SpeechRecognition();
      this._recognition = rec;
      rec.lang = localeVariant || "en-US";
      rec.continuous = true;
      rec.interimResults = false;
      rec.maxAlternatives = 1;

      rec.onresult = (event) => {
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const res = event.results[i];
          if (!res || !res.isFinal) continue;
          const transcript = String(res[0]?.transcript || "").trim();
          if (!transcript) continue;
          if (this.onTranscript) this.onTranscript("user", transcript, { final: true, source: "browser" });
        }
      };

      rec.onerror = (e) => {
        if (this.onError) this.onError(e);
      };

      rec.onend = () => {
        if (this.isConnected && this.backend === "browser") {
          try { rec.start(); } catch { }
        }
      };

      try {
        rec.start();
      } catch (e) {
        if (this.onError) this.onError(e);
        throw e;
      }
    }

    stopSpeechRecognition() {
      if (!this._recognition) return;
      const rec = this._recognition;
      this._recognition = null;
      try { rec.onend = null; } catch { }
      try { rec.stop(); } catch { }
    }

    async speakWithBrowser(text) {
      const line = String(text || "").trim();
      if (!line) return false;
      if (!window.speechSynthesis) return false;

      return await new Promise((resolve) => {
        const utter = new SpeechSynthesisUtterance(line);
        if (this._lastLocale) utter.lang = this._lastLocale;
        utter.onstart = () => {
          this.isSpeaking = true;
          this.updateStatus("speaking");
        };
        utter.onend = () => {
          this.isSpeaking = false;
          this.updateStatus("connected");
          resolve(true);
        };
        utter.onerror = () => {
          this.isSpeaking = false;
          this.updateStatus("connected");
          resolve(false);
        };
        window.speechSynthesis.speak(utter);
      });
    }


    /**
     * Sends text input to Gemini.
     * This allows the app to trigger a response from Brenda via text.
     * @param {string} text - The text to speak.
     * @param {boolean} isInstruction - If true, wraps in a hidden instruction for Gemini.
     */
    async speakText(text, isInstruction = false) {
      if (this.backend === "browser") {
        return await this.speakWithBrowser(text);
      }
      if (this.backend === "openai") {
        const payload = isInstruction
          ? `[INTERNAL_INSTRUCTION: Spontaneously greet the user in a natural, adult-appropriate way. Suggestion: "${text}"]`
          : text;
        return this.sendOpenAIUserText(payload);
      }
      if (!this.isConnected || !this.socket || this.socket.readyState !== WebSocket.OPEN) {
        return false;
      }

      // If it's a greeting or auto-triggered line, wrap it so Gemini doesn't think the USER said it.
      const payload = isInstruction
        ? `[INTERNAL_INSTRUCTION: Spontaneously greet the user in a natural, adult-appropriate way. Suggestion: "${text}"]`
        : text;

      console.log("Sending text to Gemini:", payload);
      const msg = {
        client_content: {
          turns: [
            {
              role: "user",
              parts: [{ text: payload }]
            }
          ],
          turn_complete: true
        }
      };

      try {
        this.socket.send(JSON.stringify(msg));
        return true;
      } catch (e) {
        console.error("Error sending speakText:", e);
        return false;
      }
    }


    async speakExact(text) {
      if (this.backend === "browser") {
        return await this.speakWithBrowser(text);
      }
      const safeText = String(text || "").replace(/"/g, "'");
      if (this.backend === "openai") {
        if (this.remoteAudio?.paused) {
          try { await this.remoteAudio.play(); } catch { }
        }
        const payload = `[INTERNAL_INSTRUCTION: SAY EXACTLY "${safeText}"]`;
        return this.sendOpenAIUserText(payload);
      }
      if (!this.isConnected || !this.socket || this.socket.readyState !== WebSocket.OPEN) {
        return false;
      }

      const payload = `[INTERNAL_INSTRUCTION: SAY EXACTLY "${safeText}"]`;

      const msg = {
        client_content: {
          turns: [
            {
              role: "user",
              parts: [{ text: payload }]
            }
          ],
          turn_complete: true
        }
      };

      try {
        this.socket.send(JSON.stringify(msg));
        return true;
      } catch (e) {
        console.error("Error sending speakExact:", e);
        return false;
      }
    }


    queueExactSpeech(text) {
      const clean = String(text || "").trim();
      if (!clean) return false;
      if (this.backend === "browser" || this.backend === "openai") {
        this.speakExact(clean);
        return true;
      }
      if (!this.isConnected || !this.socket || this.socket.readyState !== WebSocket.OPEN) {
        return false;
      }
      this._pendingExactSpeech = clean;
      if (!this._suppressAssistantOutput) {
        const queued = this._pendingExactSpeech;
        this._pendingExactSpeech = null;
        this.speakExact(queued);
      }
      return true;
    }

    suppressAssistantOutputForNextTurn() {
      if (this.backend === "browser") return;
      this._suppressAssistantOutput = true;
      if (this.backend === "openai") {
        this.sendOpenAIEvent({ type: "response.cancel" });
        this.sendOpenAIEvent({ type: "output_audio_buffer.clear" });
      }
    }


    handleGeminiMessage(response) {
      if (this.backend !== "gemini") return;
      // 1. Interruptions
      if (response.serverContent?.interrupted) {
        this.stopAudioQueue();
        this.updateStatus("connected");
        return;
      }

      const serverContent = response.serverContent || {};
      const readText = (value) => {
        if (typeof value === "string") return value;
        if (value && typeof value.text === "string") return value.text;
        if (value && typeof value.transcript === "string") return value.transcript;
        return "";
      };
      const pushText = (arr, value) => {
        const t = String(readText(value) || "").trim();
        if (!t) return;
        if (t.includes("[INTERNAL_INSTRUCTION:")) return;
        if (!arr.includes(t)) arr.push(t);
      };
      const pullPaths = (obj, paths, out) => {
        for (const path of paths) {
          let cur = obj;
          for (const key of path) {
            cur = cur?.[key];
            if (cur === undefined || cur === null) break;
          }
          if (cur !== undefined && cur !== null) pushText(out, cur);
        }
      };

      // 2. User Transcripts (audio transcription only)
      const userTexts = [];
      pullPaths(response, [
        ["serverContent", "inputAudioTranscription"],
        ["serverContent", "input_audio_transcription"],
        ["serverContent", "inputTranscription"],
        ["serverContent", "input_transcription"],
        ["inputAudioTranscription"],
        ["input_audio_transcription"],
        ["inputTranscription"],
        ["input_transcription"]
      ], userTexts);

      if (this.onTranscript) {
        for (const text of userTexts) {
          console.log("ðŸŽ¤ Received User Transcript:", text);
          this.onTranscript("user", text);
        }
      }

      // 3. Assistant Transcripts (audio transcription only)
      const assistantTexts = [];
      if (!this._suppressAssistantOutput) {
        pullPaths(response, [
          ["serverContent", "outputAudioTranscription"],
          ["serverContent", "output_audio_transcription"],
          ["serverContent", "outputTranscription"],
          ["serverContent", "output_transcription"],
          ["serverContent", "modelTurn", "outputAudioTranscription"],
          ["serverContent", "modelTurn", "output_audio_transcription"],
          ["outputAudioTranscription"],
          ["output_audio_transcription"],
          ["outputTranscription"],
          ["output_transcription"]
        ], assistantTexts);

        if (this.onTranscript) {
          for (const text of assistantTexts) {
            this.onTranscript("assistant", text);
          }
        }
      }

      // 4. Audio output
      if (!this._suppressAssistantOutput && serverContent.modelTurn?.parts) {
        for (const part of serverContent.modelTurn.parts) {
          if (part.inlineData && part.inlineData.mimeType.startsWith('audio/pcm')) {
            this.isSpeaking = true;
            this.updateStatus("speaking");
            this.queueAudio(part.inlineData.data);
          }
        }
      }

      if (response.serverContent?.turnComplete) {
        this.isSpeaking = false;
        this.updateStatus("connected");
        const wasSuppressed = this._suppressAssistantOutput;
        this._suppressAssistantOutput = false;
        if (wasSuppressed && this._pendingExactSpeech) {
          const queued = this._pendingExactSpeech;
          this._pendingExactSpeech = null;
          this.speakExact(queued);
        }
      }
    }

    queueAudio(base64Data) {
      const pcmData = this.base64ToArrayBuffer(base64Data);
      if (this.audioContext) {
        this.playPCM(pcmData);
      }
    }

    playPCM(pcmData) {
      const float32Data = new Float32Array(pcmData.byteLength / 2);
      const dataView = new DataView(pcmData);

      for (let i = 0; i < float32Data.length; i++) {
        const int16 = dataView.getInt16(i * 2, true);
        float32Data[i] = int16 / 32768.0;
      }

      // Gemini output is 24kHz
      const buffer = this.audioContext.createBuffer(1, float32Data.length, 24000);
      buffer.getChannelData(0).set(float32Data);

      const source = this.audioContext.createBufferSource();
      source.buffer = buffer;
      source.connect(this.audioContext.destination);

      const currentTime = this.audioContext.currentTime;
      if (this.nextStartTime < currentTime) {
        this.nextStartTime = currentTime;
      }

      source.start(this.nextStartTime);
      this.nextStartTime += buffer.duration;
      this.scheduledSources.push(source);

      source.onended = () => {
        const index = this.scheduledSources.indexOf(source);
        if (index > -1) {
          this.scheduledSources.splice(index, 1);
        }
        if (this.scheduledSources.length === 0) {
          this.isSpeaking = false;
        }
      };
    }

    stopAudioQueue() {
      this.scheduledSources.forEach(source => {
        try { source.stop(); } catch (e) { }
      });
      this.scheduledSources = [];
      this.nextStartTime = 0;
      this.isSpeaking = false;
      if (this.backend === "openai") {
        this.sendOpenAIEvent({ type: "response.cancel" });
        this.sendOpenAIEvent({ type: "output_audio_buffer.clear" });
      }
      if (this.remoteAudio) {
        try { this.remoteAudio.pause(); } catch { }
      }
      if (window.speechSynthesis) {
        try { window.speechSynthesis.cancel(); } catch { }
      }
    }

    disconnect() {
      this.clearConnectTimer();
      this.stopSpeechRecognition();
      this.stopAudioQueue();
      if (this.stream) {
        this.stream.getTracks().forEach(track => track.stop());
        this.stream = null;
      }
      if (this.workletNode) {
        this.workletNode.disconnect();
        this.workletNode = null;
      }
      if (this.audioContext) {
        this.audioContext.close();
        this.audioContext = null;
      }
      if (this.socket) {
        if (this.socket.readyState === WebSocket.OPEN) this.socket.close();
        this.socket = null;
      }
      if (this.dc) {
        try { this.dc.close(); } catch { }
        this.dc = null;
      }
      if (this.pc) {
        try { this.pc.close(); } catch { }
        this.pc = null;
      }
      if (this.remoteAudio) {
        try { this.remoteAudio.pause(); } catch { }
        try { this.remoteAudio.srcObject = null; } catch { }
        this.remoteAudio = null;
      }
      this.isConnected = false;
      this._onPcmChunk = null;
      this.needsChatFallback = false;
      this._openaiReady = false;
      this._suppressAssistantOutput = false;
      this._pendingExactSpeech = null;
      this.updateStatus("disconnected");
    }

    arrayBufferToBase64(buffer) {
      let binary = '';
      const bytes = new Uint8Array(buffer);
      const len = bytes.byteLength;
      for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      return window.btoa(binary);
    }

    base64ToArrayBuffer(base64) {
      const binaryString = window.atob(base64);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      return bytes.buffer;
    }
  }

  window.VoiceAgent = VoiceAgent;
})();
