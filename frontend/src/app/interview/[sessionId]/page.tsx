"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Mic,
  MicOff,
  Square,
  Send,
  Volume2,
  AlertCircle,
  CheckCircle2,
  Sparkles,
  ArrowRight,
  RefreshCw,
} from "lucide-react";

interface Category {
  category: string;
  source: string;
  reason: string;
}

interface TranscriptItem {
  speaker: "interviewer" | "candidate";
  text: string;
  category?: string;
  isTransition?: boolean;
  evaluation?: {
    score: number;
    correctness: boolean;
    missing_points: string[];
    model_answer: string;
  };
}

export default function InterviewPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.sessionId as string;

  const [categories, setCategories] = useState<Category[]>([]);
  const [currentCategory, setCurrentCategory] = useState<string>("");
  const [currentQuestion, setCurrentQuestion] = useState<string>("");
  const [status, setStatus] = useState<
    "connecting" | "listening" | "transcribing" | "thinking" | "speaking" | "interrupted" | "completed"
  >("connecting");
  const [transcripts, setTranscripts] = useState<TranscriptItem[]>([]);
  const [textAnswer, setTextAnswer] = useState("");
  const [isMuted, setIsMuted] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Audio & Voice Activity State
  const [isRecordingAnswer, setIsRecordingAnswer] = useState(false);
  const [recordDuration, setRecordDuration] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const audioQueueRef = useRef<string[]>([]);
  const isPlayingRef = useRef<boolean>(false);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const timerRef = useRef<any>(null);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);

  // Scroll to bottom of transcript automatically
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcripts, status]);

  // Audio level monitoring during recording for real-time VU meter
  useEffect(() => {
    if (!isRecordingAnswer || !analyserRef.current) return;

    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    let animId: number;

    const checkAudioLevel = () => {
      if (!analyserRef.current) return;
      analyserRef.current.getByteFrequencyData(dataArray);
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i];
      }
      const avg = sum / dataArray.length;
      const level = Math.min(100, Math.round((avg / 128) * 100));
      setAudioLevel(level);
      animId = requestAnimationFrame(checkAudioLevel);
    };

    animId = requestAnimationFrame(checkAudioLevel);
    return () => {
      cancelAnimationFrame(animId);
      setAudioLevel(0);
    };
  }, [isRecordingAnswer]);

  // Setup WebSocket connection
  useEffect(() => {
    if (!sessionId) return;

    let isCleanedUp = false;
    const wsBaseUrl = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000";
    const ws = new WebSocket(`${wsBaseUrl}/ws/interview/${sessionId}`);
    wsRef.current = ws;

    ws.onopen = () => {
      if (isCleanedUp) return;
      setErrorMessage(null);
      setStatus("listening");
      initMicrophone().catch(console.error);
    };

    ws.onmessage = (event) => {
      if (isCleanedUp) return;
      try {
        const data = JSON.parse(event.data);

        if (data.type === "session_init") {
          setCategories(data.categories || []);
          setCurrentCategory(data.current_category || "");
          setCurrentQuestion(data.current_question || "");
          if (data.current_question) {
            setTranscripts([
              {
                speaker: "interviewer",
                text: data.current_question,
                category: data.current_category,
              },
            ]);
          }
        } else if (data.type === "status") {
          if (data.status === "speaking") {
            setStatus("speaking");
          } else if (data.status === "listening") {
            setStatus("listening");
          } else if (data.status === "transcribing") {
            setStatus("transcribing");
          } else if (data.status === "thinking") {
            setStatus("thinking");
          } else if (data.status === "interrupted") {
            setStatus("interrupted");
            stopAudioPlayback();
          } else if (data.status === "completed") {
            setStatus("completed");
          }
        } else if (data.type === "ping") {
          return;
        } else if (data.type === "transcript") {
          setTranscripts((prev) => {
            if (prev.length > 0 && prev[prev.length - 1].text === data.text) {
              return prev;
            }
            return [
              ...prev,
              { speaker: data.speaker || "candidate", text: data.text },
            ];
          });
        } else if (data.type === "question") {
          setCurrentCategory(data.category || "");
          setCurrentQuestion(data.text);
          setTranscripts((prev) => [
            ...prev,
            {
              speaker: "interviewer",
              text: data.text,
              category: data.category,
            },
          ]);
        } else if (data.type === "transition") {
          setCurrentCategory(data.next_category || "");
          setTranscripts((prev) => [
            ...prev,
            {
              speaker: "interviewer",
              text: data.message,
              category: data.next_category,
              isTransition: true,
            },
          ]);
        } else if (data.type === "evaluation") {
          setTranscripts((prev) => {
            const updated = [...prev];
            if (updated.length > 0) {
              const last = updated[updated.length - 1];
              if (last.speaker === "candidate") {
                last.evaluation = data.evaluation;
              }
            }
            return updated;
          });
        } else if (data.type === "audio_chunk") {
          if (data.data) {
            enqueueAudioChunk(data.data);
          }
        } else if (data.type === "session_summary") {
          setStatus("completed");
        } else if (data.type === "error") {
          setErrorMessage(data.message);
        }
      } catch (err) {
        console.error("WS parse error:", err);
      }
    };

    ws.onerror = (err) => {
      if (isCleanedUp) return;
      if (ws.readyState === WebSocket.CLOSING || ws.readyState === WebSocket.CLOSED) {
        return;
      }
      console.error("WebSocket connection error event:", err);
      setErrorMessage("WebSocket connection error. Please verify the backend server is running.");
    };

    ws.onclose = (event) => {
      if (isCleanedUp) return;
      console.log("WebSocket connection closed", event.code, event.reason);
    };

    return () => {
      isCleanedUp = true;
      ws.close();
      if (timerRef.current) clearInterval(timerRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
      }
      stopAudioPlayback();
    };
  }, [sessionId]);

  // Audio queue manager
  const enqueueAudioChunk = (base64Audio: string) => {
    audioQueueRef.current.push(base64Audio);
    if (!isPlayingRef.current) {
      playNextAudioChunk();
    }
  };

  const playNextAudioChunk = () => {
    if (audioQueueRef.current.length === 0) {
      isPlayingRef.current = false;
      return;
    }

    isPlayingRef.current = true;
    const base64Audio = audioQueueRef.current.shift()!;
    const audioUrl = `data:audio/mp3;base64,${base64Audio}`;

    if (!audioPlayerRef.current) {
      audioPlayerRef.current = new Audio();
    }

    const audio = audioPlayerRef.current;
    audio.src = audioUrl;

    audio.onended = () => {
      playNextAudioChunk();
    };

    audio.onerror = (e) => {
      console.error("Audio playback error:", e);
      playNextAudioChunk();
    };

    audio.play().catch((err) => {
      console.error("Audio play error:", err);
      playNextAudioChunk();
    });
  };

  const stopAudioPlayback = () => {
    audioQueueRef.current = [];
    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
      audioPlayerRef.current.src = "";
    }
    isPlayingRef.current = false;
  };

  // Microphone stream acquisition and VU meter connection
  const initMicrophone = async () => {
    try {
      if (streamRef.current && streamRef.current.active) {
        return streamRef.current;
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;

      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 128;
        const source = ctx.createMediaStreamSource(stream);
        source.connect(analyser);
        audioContextRef.current = ctx;
        analyserRef.current = analyser;
      }
      return stream;
    } catch (err) {
      console.error("Microphone access error:", err);
      setErrorMessage("Could not access microphone. Please allow microphone permissions.");
      return null;
    }
  };

  // Interrupt interviewer speech
  const handleInterrupt = () => {
    stopAudioPlayback();
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "interrupt" }));
    }
    setStatus("interrupted");
  };

  // Toggle physical mute
  const toggleMute = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    if (streamRef.current) {
      streamRef.current.getAudioTracks().forEach((t) => {
        t.enabled = !nextMuted;
      });
    }
  };

  // Start recording candidate answer
  const handleStartRecording = async () => {
    if (isPlayingRef.current) {
      stopAudioPlayback();
    }
    if (status === "speaking") {
      handleInterrupt();
    }

    setErrorMessage(null);
    let stream = streamRef.current;
    if (!stream || !stream.active) {
      stream = await initMicrophone();
      if (!stream) return;
    }

    if (audioContextRef.current && audioContextRef.current.state === "suspended") {
      await audioContextRef.current.resume();
    }

    let mimeType = "audio/webm";
    let ext = "webm";
    if (typeof MediaRecorder !== "undefined") {
      if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
        mimeType = "audio/webm;codecs=opus";
        ext = "webm";
      } else if (MediaRecorder.isTypeSupported("audio/webm")) {
        mimeType = "audio/webm";
        ext = "webm";
      } else if (MediaRecorder.isTypeSupported("audio/mp4")) {
        mimeType = "audio/mp4";
        ext = "mp4";
      }
    }

    audioChunksRef.current = [];
    const mediaRecorder = new MediaRecorder(stream, { mimeType });
    mediaRecorderRef.current = mediaRecorder;

    mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        audioChunksRef.current.push(e.data);
      }
    };

    mediaRecorder.onstop = () => {
      if (audioChunksRef.current.length === 0) {
        console.warn("[Audio] No audio chunks captured");
        setStatus("listening");
        return;
      }

      const blob = new Blob(audioChunksRef.current, { type: mimeType });
      console.log(`[Audio] Final recording: ${blob.size} bytes, type: ${mimeType}`);
      audioChunksRef.current = [];

      const reader = new FileReader();
      reader.readAsDataURL(blob);
      reader.onloadend = () => {
        const base64data = (reader.result as string)?.split(",")[1];
        if (base64data && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          setStatus("transcribing");
          wsRef.current.send(
            JSON.stringify({
              type: "audio_chunk",
              data: base64data,
              filename: `answer.${ext}`,
            })
          );
        } else {
          console.error("Failed to send audio chunk: WS not open or base64 empty");
          setStatus("listening");
        }
      };
    };

    mediaRecorder.start(200);
    setIsRecordingAnswer(true);
    setRecordDuration(0);

    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setRecordDuration((prev) => prev + 1);
    }, 1000);
  };

  // Stop recording and send audio for transcription
  const handleStopAndSubmit = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    setIsRecordingAnswer(false);
  };

  // Cancel recording without submitting
  const handleCancelRecording = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.ondataavailable = null;
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.stop();
    }
    audioChunksRef.current = [];
    setIsRecordingAnswer(false);
    setRecordDuration(0);
  };

  // Send text fallback answer
  const handleSendTextAnswer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!textAnswer.trim()) return;

    if (isPlayingRef.current) {
      stopAudioPlayback();
    }

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: "text_answer",
          text: textAnswer.trim(),
        })
      );
    }
    setTextAnswer("");
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  return (
    <div className="space-y-4 max-w-5xl mx-auto py-2">
      {/* Header & Status Indicator */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-lg bg-[#161616] border border-[#262626]">
        <div>
          <div className="flex items-center space-x-2">
            <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-[#1f1f1f] border border-[#2c2c2c] text-[#888888]">
              session: {sessionId.slice(0, 8)}
            </span>
            {currentCategory && (
              <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-[#1f1f1f] border border-[#2c2c2c] text-[#ededed]">
                round: {currentCategory}
              </span>
            )}
          </div>
          <h2 className="text-base font-mono font-medium text-[#ededed] mt-1">
            Live Technical Interview
          </h2>
        </div>

        {/* Visual Status Badge */}
        <div className="flex items-center space-x-2.5">
          {status === "listening" && (
            <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded bg-[#0070f3]/10 text-[#0070f3] border border-[#0070f3]/30 font-mono text-xs">
              <span className="w-2 h-2 rounded-full bg-[#0070f3] animate-pulse" />
              <span>[LISTENING]</span>
            </div>
          )}
          {status === "transcribing" && (
            <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded bg-[#ff9800]/10 text-[#ff9800] border border-[#ff9800]/30 font-mono text-xs">
              <RefreshCw className="w-3 h-3 animate-spin" />
              <span>[TRANSCRIBING]</span>
            </div>
          )}
          {status === "thinking" && (
            <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded bg-[#242424] text-[#ededed] border border-[#333333] font-mono text-xs">
              <Sparkles className="w-3 h-3 animate-pulse" />
              <span>[EVALUATING]</span>
            </div>
          )}
          {status === "speaking" && (
            <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded bg-[#00c853]/10 text-[#00c853] border border-[#00c853]/30 font-mono text-xs">
              <Volume2 className="w-3 h-3 animate-pulse" />
              <span>[SPEAKING]</span>
            </div>
          )}
          {status === "interrupted" && (
            <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded bg-[#f44336]/10 text-[#f44336] border border-[#f44336]/30 font-mono text-xs">
              <Square className="w-2.5 h-2.5 fill-[#f44336]" />
              <span>[INTERRUPTED]</span>
            </div>
          )}
          {status === "completed" && (
            <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded bg-[#00c853]/10 text-[#00c853] border border-[#00c853]/30 font-mono text-xs">
              <CheckCircle2 className="w-3 h-3" />
              <span>[COMPLETED]</span>
            </div>
          )}

          <button
            onClick={() => router.push(`/summary/${sessionId}`)}
            className="py-1 px-3 rounded bg-[#1f1f1f] hover:bg-[#282828] border border-[#2c2c2c] font-mono text-xs text-[#ededed] transition-colors flex items-center space-x-1.5 cursor-pointer"
          >
            <span>Summary</span>
            <ArrowRight className="w-3 h-3" />
          </button>
        </div>
      </div>

      {errorMessage && (
        <div className="p-3 rounded-lg bg-[#1c1212] border border-[#442222] text-[#f44336] font-mono text-xs flex items-center space-x-2">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
          <span>[error]: {errorMessage}</span>
        </div>
      )}

      {/* Plan Categories Overview Bar */}
      {categories.length > 0 && (
        <div className="p-3 rounded-lg bg-[#161616] border border-[#262626]">
          <p className="text-[10px] font-mono text-[#666666] uppercase tracking-wider mb-2">
            ROUNDS PROGRESSION
          </p>
          <div className="flex flex-wrap gap-1.5">
            {categories.map((cat, idx) => (
              <div
                key={idx}
                className={`px-2.5 py-1 rounded text-xs font-mono border transition-colors ${
                  cat.category === currentCategory
                    ? "bg-[#252525] border-[#444444] text-[#ededed]"
                    : "bg-[#161616] border-[#242424] text-[#666666]"
                }`}
              >
                <span>{cat.category}</span>
                {cat.source && (
                  <span className="ml-1 text-[10px] text-[#555555]">
                    [{cat.source}]
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Live Transcript Stream (Developer Terminal Style) */}
      <div className="h-[430px] overflow-y-auto rounded-lg bg-[#141414] border border-[#262626] p-4 sm:p-5 space-y-4 font-mono text-xs">
        {transcripts.length === 0 ? (
          <div className="h-full flex items-center justify-center text-[#555555]">
            &gt; initializing voice session and speech pipeline...
          </div>
        ) : (
          transcripts.map((t, idx) => (
            <div key={idx}>
              {t.isTransition ? (
                <div className="py-2 text-center text-[#666666] text-[11px] border-y border-[#222222]">
                  --- [transition: {t.text}] ---
                </div>
              ) : t.speaker === "interviewer" ? (
                <div className="space-y-1.5 max-w-[85%]">
                  <div className="flex items-center space-x-2 text-[#888888] text-[11px]">
                    <span className="text-[#0070f3] font-bold">&gt; interviewer</span>
                    {t.category && <span className="text-[#555555]">[{t.category}]</span>}
                  </div>
                  <div className="p-3.5 rounded bg-[#191919] border border-[#262626] text-[#ededed] font-sans text-sm leading-relaxed whitespace-pre-wrap">
                    {t.text}
                  </div>
                </div>
              ) : (
                <div className="space-y-1.5 ml-auto max-w-[85%]">
                  <div className="flex items-center justify-end text-[#888888] text-[11px]">
                    <span className="text-[#00c853] font-bold">$ candidate</span>
                  </div>
                  <div className="p-3.5 rounded bg-[#1c1c1c] border border-[#2e2e2e] text-[#ededed] font-sans text-sm leading-relaxed whitespace-pre-wrap">
                    {t.text}
                  </div>

                  {/* Instant Evaluation Card attached beneath candidate answer */}
                  {t.evaluation && (
                    <div className="mt-2 p-2.5 rounded bg-[#161616] border border-[#282828] text-xs space-y-1.5">
                      <div className="flex items-center justify-between font-mono">
                        <span className="text-[#888888]">eval:score</span>
                        <span
                          className={`font-semibold ${
                            t.evaluation.score >= 7
                              ? "text-[#00c853]"
                              : t.evaluation.score >= 5
                              ? "text-[#ff9800]"
                              : "text-[#f44336]"
                          }`}
                        >
                          [{t.evaluation.score}/10]
                        </span>
                      </div>
                      {t.evaluation.missing_points?.length > 0 && (
                        <div className="text-[#999999] pt-1 border-t border-[#222222] font-sans text-xs">
                          <span className="font-mono text-[#888888] mr-1">[gaps]:</span>
                          {t.evaluation.missing_points.join("; ")}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))
        )}
        <div ref={transcriptEndRef} />
      </div>

      {/* Voice Controls & Speech Capture Action Bar */}
      <div className="p-3.5 rounded-lg bg-[#161616] border border-[#262626] flex flex-col sm:flex-row items-center justify-between gap-3">
        {/* Mic & Recording Controls */}
        <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
          {/* Physical Mute Toggle */}
          <button
            type="button"
            onClick={toggleMute}
            title={isMuted ? "Unmute microphone" : "Mute microphone"}
            className={`p-2.5 rounded-md transition-colors cursor-pointer border ${
              isMuted
                ? "bg-[#1c1212] text-[#f44336] border-[#442222]"
                : "bg-[#1f1f1f] text-[#ededed] border-[#2c2c2c] hover:border-[#383838]"
            }`}
          >
            {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </button>

          {/* If Currently Recording */}
          {isRecordingAnswer ? (
            <div className="flex items-center space-x-2">
              {/* Live Audio Level Meter */}
              <div className="flex items-center space-x-1.5 px-3 py-1.5 rounded bg-[#1b1414] border border-[#552222]">
                <span className="w-2 h-2 rounded-full bg-[#f44336] animate-ping" />
                <span className="font-mono text-xs text-[#f44336] font-medium mr-1.5">
                  REC {formatTime(recordDuration)}
                </span>
                {/* Dynamic 5-bar volume level meter */}
                <div className="flex items-end space-x-0.5 h-3.5 w-10">
                  {[1.2, 0.8, 1.4, 0.9, 1.1].map((mult, i) => {
                    const barHeight = Math.max(3, Math.min(14, Math.round((audioLevel / 100) * 14 * mult)));
                    return (
                      <div
                        key={i}
                        className="flex-1 bg-[#00c853] rounded-xs transition-all duration-75"
                        style={{ height: `${barHeight}px` }}
                      />
                    );
                  })}
                </div>
              </div>

              {/* Stop & Submit Button */}
              <button
                type="button"
                onClick={handleStopAndSubmit}
                className="py-2 px-3.5 rounded-md bg-[#0070f3] hover:bg-[#0060df] text-white font-mono text-xs font-medium flex items-center space-x-1.5 transition-colors cursor-pointer shadow-sm"
              >
                <Square className="w-3.5 h-3.5 fill-white" />
                <span>Submit Answer</span>
              </button>

              {/* Cancel Button */}
              <button
                type="button"
                onClick={handleCancelRecording}
                className="py-2 px-2.5 rounded-md bg-[#1f1f1f] hover:bg-[#282828] border border-[#2c2c2c] text-[#888888] hover:text-[#ededed] font-mono text-xs transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </div>
          ) : (
            /* Idle / Ready to Record State */
            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={handleStartRecording}
                disabled={status === "completed" || isMuted}
                className={`py-2 px-4 rounded-md font-mono text-xs font-medium flex items-center space-x-2 transition-all cursor-pointer ${
                  status === "listening"
                    ? "bg-[#0070f3] hover:bg-[#0060df] text-white shadow-sm ring-2 ring-[#0070f3]/30 animate-pulse"
                    : "bg-[#1f1f1f] hover:bg-[#282828] border border-[#2c2c2c] text-[#ededed]"
                }`}
              >
                <Mic className="w-3.5 h-3.5" />
                <span>Record Answer</span>
              </button>

              {status === "speaking" && (
                <button
                  type="button"
                  onClick={handleInterrupt}
                  className="py-2 px-3 rounded-md bg-[#1a1212] hover:bg-[#251515] border border-[#442222] text-[#f44336] font-mono text-xs transition-colors flex items-center space-x-1.5 cursor-pointer"
                >
                  <Square className="w-3 h-3 fill-[#f44336]" />
                  <span>Interrupt</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Fallback Text Answer Input */}
        <form
          onSubmit={handleSendTextAnswer}
          className="flex items-center space-x-2 w-full sm:w-auto sm:flex-1 max-w-md"
        >
          <input
            type="text"
            value={textAnswer}
            onChange={(e) => setTextAnswer(e.target.value)}
            placeholder="Type answer text..."
            className="flex-1 rounded-md bg-[#121212] border border-[#262626] px-3 py-1.5 text-xs text-[#ededed] placeholder-[#555555] font-sans focus:outline-none focus:border-[#0070f3]"
          />
          <button
            type="submit"
            disabled={!textAnswer.trim()}
            className="py-1.5 px-3 rounded-md bg-[#1f1f1f] hover:bg-[#282828] border border-[#2c2c2c] disabled:opacity-30 text-[#ededed] text-xs font-mono flex items-center justify-center cursor-pointer"
          >
            <Send className="w-3 h-3" />
          </button>
        </form>
      </div>
    </div>
  );
}

