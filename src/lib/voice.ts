// Talk instead of type: the iPhone's own speech recognition (Web Speech API, free, no keyboard needed).
// Words show up live while you talk.

interface SpeechResultLike {
  isFinal: boolean
  0: { transcript: string }
}
interface SpeechEventLike {
  resultIndex: number
  results: ArrayLike<SpeechResultLike>
}
interface Recognizer {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((e: SpeechEventLike) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
}
type RecognizerCtor = new () => Recognizer

const Ctor = (): RecognizerCtor | undefined => {
  const w = window as unknown as { SpeechRecognition?: RecognizerCtor; webkitSpeechRecognition?: RecognizerCtor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition
}

export const voiceSupported = () => typeof window !== 'undefined' && !!Ctor()

/**
 * Start listening. onText gets everything heard so far (finished phrases + the phrase in progress).
 * Returns stop(). Each finished phrase ends with ", " so foods come out as a list.
 */
export function listen(opts: { onText: (heard: string) => void; onEnd: () => void; onError: (message: string) => void }): () => void {
  const R = Ctor()
  if (!R) {
    opts.onError("Voice isn't available here. Tap the text box and use the microphone on the keyboard.")
    opts.onEnd()
    return () => undefined
  }
  const r = new R()
  r.lang = navigator.language || 'en-US'
  r.continuous = true
  r.interimResults = true
  let done = ''
  r.onresult = (e) => {
    let interim = ''
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const res = e.results[i]
      const t = res[0].transcript.trim()
      if (!t) continue
      if (res.isFinal) done += (done ? ', ' : '') + t
      else interim += (interim ? ' ' : '') + t
    }
    opts.onText(interim ? `${done}${done ? ', ' : ''}${interim}` : done)
  }
  r.onerror = (e) => {
    if (e.error === 'no-speech' || e.error === 'aborted') return
    opts.onError(
      e.error === 'not-allowed' || e.error === 'service-not-allowed'
        ? 'Crisp needs permission to use the microphone. Allow it when asked, or turn on Speech Recognition in iPhone Settings → Privacy & Security.'
        : "Voice didn't work just now. Try again, or type it.",
    )
  }
  r.onend = () => opts.onEnd()
  try {
    r.start()
  } catch {
    opts.onError("Voice didn't start. Try again, or type it.")
    opts.onEnd()
  }
  return () => {
    try {
      r.stop()
    } catch {
      /* already stopped */
    }
  }
}
