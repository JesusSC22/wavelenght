import React, { useMemo, useRef, useState, useEffect } from "react";

// WAVELENGTH (modo coop, 2 jugadores) — flujo con vista secreta
// Flujo:
// 1) El dial está oculto (seer_ready).
// 2) Jugador A pulsa "Mostrar objetivo" (seer_view) y solo él ve el abanico.
// 3) A oculta y da la pista en voz alta → Jugador B adivina (guess).
// 4) Revelar y puntuar (result). Al final: summary.

/********************** Utilidades y tests ligeros ************************/ 
function shuffle(array) {
  const a = array.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function clamp01(x) { return Math.max(0, Math.min(1, x)); }

// 0..1 (izq→der) a radianes (π..0)
export function valueToAngleRadians(value) {
  return Math.PI * (1 - value);
}

export function polarToCartesian(cx, cy, r, angleRad) {
  return { x: cx + r * Math.cos(angleRad), y: cy - r * Math.sin(angleRad) };
}

export function wedgePath(cx, cy, r, a1, a2) {
  const p1 = polarToCartesian(cx, cy, r, a1);
  const p2 = polarToCartesian(cx, cy, r, a2);
  const largeArcFlag = Math.abs(a1 - a2) > Math.PI ? 1 : 0;
  return `M ${cx} ${cy} L ${p1.x} ${p1.y} A ${r} ${r} 0 ${largeArcFlag} 0 ${p2.x} ${p2.y} Z`;
}

// Triángulo con base "cuerda" (bordes rectos como en la referencia)
export function triangleChordPath(cx, cy, r, a1, a2) {
  const p1 = polarToCartesian(cx, cy, r, a1);
  const p2 = polarToCartesian(cx, cy, r, a2);
  return `M ${cx} ${cy} L ${p1.x} ${p1.y} L ${p2.x} ${p2.y} Z`;
}

// Regla de puntuación cooperativa
export function computePoints(diff) {
  if (diff <= 0.05) return 4;
  if (diff <= 0.1) return 3;
  if (diff <= 0.18) return 2;
  if (diff <= 0.25) return 1;
  return 0;
}

// Tests ligeros (no rompen en prod)
(function runDevTests(){
  try {
    console.assert(Math.abs(valueToAngleRadians(0) - Math.PI) < 1e-9, 'valueToAngleRadians(0) = π');
    console.assert(Math.abs(valueToAngleRadians(1) - 0) < 1e-9, 'valueToAngleRadians(1) = 0');
    console.assert(clamp01(-1) === 0 && clamp01(2) === 1 && clamp01(0.5) === 0.5, 'clamp01');

    // Puntuación (bordes e interiores)
    console.assert(computePoints(0.00) === 4, 'pts 0.00');
    console.assert(computePoints(0.05) === 4 && computePoints(0.051) === 3, 'umbral 0.05');
    console.assert(computePoints(0.10) === 3 && computePoints(0.1001) === 2, 'umbral 0.10');
    console.assert(computePoints(0.18) === 2 && computePoints(0.1801) === 1, 'umbral 0.18');
    console.assert(computePoints(0.25) === 1 && computePoints(0.2501) === 0, 'umbral 0.25');

    // Paths
    const t = triangleChordPath(0,0,10, Math.PI, Math.PI/2);
    console.assert(t.startsWith('M '), 'triangle path');

    // Shuffle tests (no muta y conserva longitud)
    const orig = [1,2,3,4,5];
    const copy = orig.slice();
    const sh = shuffle(orig);
    console.assert(orig.join(',') === copy.join(','), 'shuffle no muta el array original');
    console.assert(sh.length === orig.length, 'shuffle conserva longitud');
  } catch (_) {}
})();

/***************************** Datos *************************************/
const DEFAULT_CATEGORIES = [
  { left: "Clásico", right: "Moderno" },
  { left: "Dulce", right: "Salado" },
  { left: "Natural", right: "Artificial" },
  { left: "Arriesgado", right: "Seguro" },
  { left: "Minimalista", right: "Recargado" },
  { left: "Rápido", right: "Lento" },
  { left: "Popular", right: "De nicho" },
  { left: "Realista", right: "Abstracto" },
  { left: "Silencioso", right: "Ruidoso" },
  { left: "Barato", right: "Caro" },
  { left: "Vintage", right: "Futurista" },
  { left: "Trabajo", right: "Ocio" },
  { left: "Caliente", right: "Frío" },
  { left: "Tierra", right: "Mar" },
  { left: "Introvertido", right: "Extrovertido" },
  { left: "Sencillo", right: "Complejo" },
  { left: "Montaña", right: "Playa" },
  { left: "Ciencia", right: "Arte" },
  { left: "Optimista", right: "Pesimista" },
  { left: "Espontáneo", right: "Planificado" },
];

const ROUNDS = 5;

function useWindowSize() {
  const [size, set] = useState({ w: 1024, h: 768 });
  useEffect(() => {
    const onResize = () => set({ w: window.innerWidth, h: window.innerHeight });
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return size;
}

/*************************** App principal ******************************/
export default function WavelengthCoop() {
  // fases: start | seer_ready | seer_view | guess | result | summary
  const [phase, setPhase] = useState("start");
  const [round, setRound] = useState(1);
  const [roundsCount, setRoundsCount] = useState(5);
  const [score, setScore] = useState(0);
  const [customCats, setCustomCats] = useState(() => DEFAULT_CATEGORIES);
  const [shuffled, setShuffled] = useState(() => shuffle(DEFAULT_CATEGORIES));
  const [category, setCategory] = useState(shuffled[0]);
  const [guess, setGuess] = useState(0.5);
  const [target, setTarget] = useState(Math.random());
  const [history, setHistory] = useState([]); // [{round, category, guess, target, points, clue}]
  const [clue, setClue] = useState("");
  const [dark, setDark] = useState(false);

  const { w } = useWindowSize();
  const svgWidth = Math.min(720, Math.max(340, Math.floor((w - 64))));
  const radius = Math.floor(svgWidth * 0.48);
  const cx = Math.floor(svgWidth / 2);
  const cy = radius + 8;

  function startGame() {
    const filtered = customCats.filter(c => c.left?.trim() && c.right?.trim());
    const s = shuffle(filtered.length ? filtered : DEFAULT_CATEGORIES);
    setShuffled(s);
    setCategory(s[0]);
    setRoundsCount(Math.min(ROUNDS, s.length));
    setRound(1);
    setScore(0);
    setGuess(0.5);
    setTarget(Math.random());
    setHistory([]);
    setClue("");
    setPhase("seer_ready");
  }

  function nextRound() {
    const next = round + 1;
    if (next > roundsCount) {
      setPhase("summary");
      return;
    }
    setRound(next);
    setCategory(shuffled[next - 1]);
    setGuess(0.5);
    setTarget(Math.random());
    setClue("");
    setPhase("seer_ready");
  }

  function scoreCurrent() {
    const diff = Math.abs(guess - target);
    const pts = computePoints(diff);
    const rec = { round, category, guess, target, points: pts, clue };
    setHistory(h => [...h, rec]);
    setScore(s => s + pts);
    setPhase("result");
  }

  // Colores (acercándonos a la referencia)
  const bandColors = {
    p1: "#f87171", // rojo externo
    p2: "#7ab6ff", // azul
    p3: "#facc15", // amarillo
    p4: "#34d399", // verde centro
  };

  // ancho uniforme por banda (fracción del semicírculo)
  const baseFrac = 0.08; // cada banda ~8% del semicírculo

  const arcs = useMemo(() => {
    const t = target; // 0..1
    const center = valueToAngleRadians(t);
    const mk = (k) => {
      const half = (k * baseFrac * Math.PI) / 2;
      let a1 = center + half;
      let a2 = center - half;
      a1 = Math.min(Math.PI, Math.max(0, a1));
      a2 = Math.min(Math.PI, Math.max(0, a2));
      return { a1, a2 };
    };
    return { p1: mk(4), p2: mk(3), p3: mk(2), p4: mk(1) };
  }, [target, baseFrac]);

  const baseArc = useMemo(() => {
    const a1 = Math.PI, a2 = 0;
    const r = radius;
    const p1 = polarToCartesian(cx, cy, r, a1);
    const p2 = polarToCartesian(cx, cy, r, a2);
    return `M ${p1.x} ${p1.y} A ${r} ${r} 0 0 1 ${p2.x} ${p2.y}`;
  }, [cx, cy, radius]);

  const showTarget = phase === "seer_view" || phase === "result";
  const interactive = phase === "guess"; // solo el Jugador B puede mover

  return (
    <div className={`w-screen min-h-screen ${dark ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'} flex items-center justify-center p-4`}>
      <div className="w-full max-w-4xl mx-auto">
        <header className="flex items-center justify-between mb-4">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Wavelength — xixibubu's version</h1>
          <div className="flex gap-2 items-center">
            <span className={`text-sm md:text-base rounded-full ${dark ? 'bg-slate-800 text-slate-100' : 'bg-white'} shadow px-3 py-1`}>Ronda {Math.min(round, roundsCount)} / {roundsCount}</span>
            <span className={`text-sm md:text-base rounded-full ${dark ? 'bg-slate-800 text-slate-100' : 'bg-white'} shadow px-3 py-1`}>Puntos: {score}</span>
            <button onClick={() => setDark(d => !d)} className={`px-3 py-1 rounded-xl border ${dark ? 'border-slate-700 bg-slate-800' : 'border-slate-300 bg-white'}`}>{dark ? '☀️' : '🌙'}</button>
          </div>
        </header>

        {phase === "start" && (
          <div className={`rounded-2xl shadow p-5 md:p-7 ${dark ? 'bg-slate-800 border border-slate-700' : 'bg-white'}`}>
            <h3 className="text-lg font-semibold mb-2">Categorías personalizadas (edítalas antes de empezar)</h3>
            <EditableCategories value={customCats} onChange={setCustomCats} dark={dark} />

            <div className="flex items-center justify-between mt-6">
              <button onClick={startGame} className="px-4 py-2 rounded-xl bg-slate-900 text-white shadow hover:opacity-90">Empezar</button>
              <span className="text-sm text-slate-500">Rondas: {Math.min(ROUNDS, customCats.length)} (usa la lista actual)</span>
            </div>
          </div>
        )}

        {phase !== "start" && phase !== "summary" && (
          <RoundUI
            phase={phase}
            setPhase={setPhase}
            svgWidth={svgWidth}
            radius={radius}
            cx={cx}
            cy={cy}
            baseArc={baseArc}
            arcs={arcs}
            showTarget={showTarget}
            interactive={interactive}
            category={category}
            clue={clue}
            setClue={setClue}
            guess={guess}
            setGuess={setGuess}
            onScore={scoreCurrent}
            target={target}
            dark={dark}
          />
        )}

        {phase === "result" && (
          <div className="mt-4 flex justify-end">
            <button onClick={() => setPhase("summary")} className="px-4 py-2 rounded-xl bg-slate-900 text-white shadow hover:opacity-90">Ir al resumen</button>
            <button onClick={nextRound} className="px-4 py-2 rounded-xl bg-slate-900 text-white shadow hover:opacity-90 ml-2">Siguiente ronda</button>
          </div>
        )}

        {phase === "summary" && (
          <Summary score={score} history={history} onRestart={() => setPhase("start")} dark={dark} />
        )}

        <footer className="text-center text-xs text-slate-400 mt-6">Hecho para 2 jugadores · Cooperativo · Vista secreta · Inspirado en Wavelength</footer>
      </div>
    </div>
  );
}

/*************************** UI de la ronda ******************************/
function RoundUI({ phase, setPhase, svgWidth, radius, cx, cy, baseArc, arcs, showTarget, interactive, category, clue, setClue, guess, setGuess, onScore, target, dark }) {
  function handlePointerMove(clientX, clientY, bounds) {
    const rect = bounds;
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const dx = x - cx;
    const dy = (rect.height - y) - (rect.height - cy);
    const angle = Math.atan2(dy, dx);
    const angleClamped = Math.max(0, Math.min(Math.PI, angle));
    const val = 1 - angleClamped / Math.PI;
    setGuess(clamp01(val));
  }

  const bandColors = { p1: "#f87171", p2: "#7ab6ff", p3: "#facc15", p4: "#34d399" };

  return (
    <div className={`rounded-2xl shadow p-5 md:p-7 ${dark ? 'bg-slate-800 border border-slate-700' : 'bg-white'}`}>
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 mb-4">
        <div className="text-lg md:text-xl font-semibold">
          <span className="inline-flex items-center gap-2">
            <span className="px-3 py-1 rounded-full bg-slate-100">{category.left}</span>
            <span className="text-slate-400">↔</span>
            <span className="px-3 py-1 rounded-full bg-slate-100">{category.right}</span>
          </span>
        </div>
        <div className="w-full md:w-96">
          <input
            type="text"
            placeholder={phase === 'seer_view' ? 'No digas la pista todavía…' : 'Pista (opcional, sugerida leer en voz alta)'}
            value={clue}
            onChange={(e) => setClue(e.target.value)}
            disabled={phase === 'seer_view'}
            className={`w-full px-3 py-2 rounded-xl ${dark ? 'bg-slate-900 border-slate-700 text-slate-100 placeholder-slate-400' : 'bg-slate-50 border-slate-200'} border focus:outline-none focus:ring-2 ${dark ? 'focus:ring-slate-600' : 'focus:ring-slate-300'} disabled:opacity-50`}
          />
        </div>
      </div>

      {/* Dial */}
      <div className="w-full flex items-center justify-center select-none">
        <Dial
          width={svgWidth}
          radius={radius}
          cx={cx}
          cy={cy}
          bandColors={bandColors}
          baseArc={baseArc}
          arcs={arcs}
          showTarget={showTarget}
          guess={guess}
          onDragMove={(x,y,b) => handlePointerMove(x,y,b)}
          interactive={interactive}
          hiddenOverlay={phase === 'seer_ready'}
          dark={dark}
        />
      </div>

      {/* Controles según fase */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-3 mt-5">
        {phase === 'seer_ready' && (
          <React.Fragment>
            <span className="text-sm text-slate-600">Jugador A: pulsa «Mostrar objetivo», míralo, luego ocúltalo.</span>
            <button onClick={() => setPhase('seer_view')} className="px-4 py-2 rounded-xl bg-indigo-600 text-white shadow hover:opacity-90">Mostrar objetivo (Jugador A)</button>
          </React.Fragment>
        )}

        {phase === 'seer_view' && (
          <React.Fragment>
            <span className="text-sm text-slate-600">Solo Jugador A debería mirar ahora mismo.</span>
            <button onClick={() => setPhase('guess')} className="px-4 py-2 rounded-xl bg-slate-900 text-white shadow hover:opacity-90">Ocultar y dar pista</button>
          </React.Fragment>
        )}

        {phase === 'guess' && (
          <React.Fragment>
            <span className="text-sm text-slate-600">Jugador B: mueve el dial y elige una posición.</span>
            <div className="w-full md:w-auto">
              <input type="range" min={0} max={1000} value={Math.round(guess*1000)} onChange={(e)=>setGuess(parseInt(e.target.value,10)/1000)} className="w-full md:w-96" />
              <div className="text-xs text-slate-500 mt-1">También puedes arrastrar el dial.</div>
            </div>
            <button onClick={onScore} className="px-4 py-2 rounded-xl bg-emerald-600 text-white shadow hover:opacity-90">Revelar y puntuar</button>
          </React.Fragment>
        )}

        {phase === 'result' && (
          <span className="text-sm text-slate-600">Resultado mostrado abajo.</span>
        )}
      </div>

      {phase === 'result' && (
        <ResultPanel guess={guess} target={target} category={category} />
      )}
    </div>
  );
}

/******************************* Dial ***********************************/
function Dial({ width, radius, cx, cy, bandColors, baseArc, arcs, showTarget, guess, onDragMove, interactive, hiddenOverlay, dark }) {
  const svgRef = useRef(null);
  const handleDown = (e) => {
    if (!interactive) return; // bloquea interacción si no es la fase de adivinar
    const bounds = svgRef.current.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    onDragMove(clientX, clientY, bounds);
    const move = (ev) => {
      const x = ev.touches ? ev.touches[0].clientX : ev.clientX;
      const y = ev.touches ? ev.touches[0].clientY : ev.clientY;
      onDragMove(x, y, bounds);
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      window.removeEventListener('touchmove', move);
      window.removeEventListener('touchend', up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    window.addEventListener('touchmove', move);
    window.addEventListener('touchend', up);
  };

  const pointerAngle = valueToAngleRadians(guess);
  const tip = polarToCartesian(cx, cy, radius - 6, pointerAngle);

  return (
    <div className={`relative ${interactive ? '' : 'cursor-not-allowed'}`}>
      <svg
        ref={svgRef}
        onMouseDown={handleDown}
        onTouchStart={handleDown}
        className="max-w-full"
        width={width}
        height={radius + 16}
        viewBox={`0 0 ${width} ${radius + 16}`}
      >
        {/* Base */}
        <path d={baseArc} stroke={dark ? '#475569' : '#a4afbd'} strokeWidth={Math.max(8, radius * 0.06)} fill="none" />
        <path d={baseArc} stroke="transparent" strokeWidth={Math.max(42, radius * 0.25)} fill="none" />

        {/* Wedges (mostrar en seer_view y result) */}
        {showTarget && (
          <g opacity={0.95}>
            {/* Dibujamos de afuera→adentro para un escalonado limpio y bordes rectos */}
            <path d={triangleChordPath(cx, cy, radius - 10, arcs.p1.a1, arcs.p1.a2)} fill={bandColors.p1} />
            <path d={triangleChordPath(cx, cy, radius - 14, arcs.p2.a1, arcs.p2.a2)} fill={bandColors.p2} />
            <path d={triangleChordPath(cx, cy, radius - 18, arcs.p3.a1, arcs.p3.a2)} fill={bandColors.p3} />
            <path d={triangleChordPath(cx, cy, radius - 22, arcs.p4.a1, arcs.p4.a2)} fill={bandColors.p4} />
          </g>
        )}

        {/* Puntero */}
        <g>
          <line x1={cx} y1={cy} x2={tip.x} y2={tip.y} stroke="#0f172a" strokeWidth={4} strokeLinecap="round" />
          <circle cx={tip.x} cy={tip.y} r={8} fill="#0f172a" />
        </g>

        {/* Etiquetas */}
        <text x={16} y={20} fill={dark ? '#94a3b8' : '#334155'} fontSize={12}>Izquierda</text>
        <text x={width - 60} y={20} fill={dark ? '#94a3b8' : '#334155'} fontSize={12}>Derecha</text>
      </svg>

      {hiddenOverlay && (
        <div className={`absolute inset-0 ${dark ? 'bg-slate-900/60' : 'bg-slate-200/70'} backdrop-blur-sm rounded-xl flex items-center justify-center ${dark ? 'text-slate-200' : 'text-slate-700'} text-sm`}>
          Oculto. Pulsa «Mostrar objetivo» para que el Jugador A lo vea.
        </div>
      )}

      {!interactive && !hiddenOverlay && !showTarget && (
        <div className="absolute inset-0 pointer-events-none bg-transparent rounded-xl flex items-end justify-center pb-2">
          <div className={`text-xs ${dark ? 'text-slate-400' : 'text-slate-500'}`}>Dial bloqueado (esperando a Jugador B)</div>
        </div>
      )}
    </div>
  );
}

/*************************** Panel de resultado *************************/
function ResultPanel({ guess, target, category }) {
  const diff = Math.abs(guess - target);
  const pts = computePoints(diff);
  const pct = (x) => Math.round(x * 100);
  const label = pts === 4 ? '¡Clavado!' : pts === 3 ? 'Excelente' : pts === 2 ? 'Muy bien' : pts === 1 ? 'Casi' : 'Lejos';
  return (
    <div className="mt-5 p-4 rounded-xl bg-slate-50 border border-slate-200">
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <div className="text-slate-700">Objetivo: <strong>{pct(target)}%</strong> · Adivinaron: <strong>{pct(guess)}%</strong> · Error: <strong>{pct(diff)}%</strong></div>
        <div className="text-lg font-semibold">+{pts} {pts === 1 ? 'punto' : 'puntos'} — {label}</div>
      </div>
    </div>
  );
}

/****************************** Editor + Resumen *************************/
function EditableCategories({ value, onChange, dark }) {
  const [left, setLeft] = useState("");
  const [right, setRight] = useState("");

  function addRow() {
    const L = left.trim();
    const R = right.trim();
    if (!L || !R) return;
    onChange([...value, { left: L, right: R }]);
    setLeft("");
    setRight("");
  }
  function removeAt(idx) { onChange(value.filter((_, i) => i !== idx)); }
  function resetDefaults() { onChange(DEFAULT_CATEGORIES); }
  function shuffleNow() { onChange(shuffle(value)); }

  return (
    <div className={`rounded-xl p-3 ${dark ? 'bg-slate-900 border border-slate-700' : 'bg-slate-50 border border-slate-200'}`}>
      <div className="flex gap-2 mb-3">
        <input className={`flex-1 px-3 py-2 rounded-lg border ${dark ? 'bg-slate-900 border-slate-700 text-slate-100 placeholder-slate-400' : 'border-slate-300'}`} placeholder="Extremo izquierdo (p.ej., Dulce)" value={left} onChange={e=>setLeft(e.target.value)} />
        <input className={`flex-1 px-3 py-2 rounded-lg border ${dark ? 'bg-slate-900 border-slate-700 text-slate-100 placeholder-slate-400' : 'border-slate-300'}`} placeholder="Extremo derecho (p.ej., Salado)" value={right} onChange={e=>setRight(e.target.value)} />
        <button onClick={addRow} className="px-3 py-2 rounded-lg bg-emerald-600 text-white">Añadir</button>
      </div>
      <div className="max-h-64 overflow-auto divide-y divide-slate-200">
        {value.map((c, i) => (
          <div key={i} className="py-2 flex items-center justify-between gap-2">
            <div className="flex-1 text-sm"><span className="font-medium">{c.left}</span> <span className="text-slate-400">↔</span> <span className="font-medium">{c.right}</span></div>
            <button onClick={()=>removeAt(i)} className="text-xs px-2 py-1 rounded bg-slate-200">Quitar</button>
          </div>
        ))}
        {value.length === 0 && <div className="py-2 text-sm text-slate-500">Añade al menos 1 categoría para jugar.</div>}
      </div>
      <div className="flex gap-2 mt-3 text-sm">
        <button onClick={resetDefaults} className="px-3 py-1 rounded bg-slate-200">Restaurar por defecto</button>
        <button onClick={shuffleNow} className="px-3 py-1 rounded bg-slate-200">Mezclar lista</button>
      </div>
    </div>
  );
}

function Summary({ score, history, onRestart, dark }) {
  return (
    <div className={`rounded-2xl shadow p-6 ${dark ? 'bg-slate-800 border border-slate-700' : 'bg-white'}`}>
      <h2 className="text-2xl font-bold mb-2">Resultado final</h2>
      <p className="text-slate-700">Puntuación total: <strong>{score}</strong></p>

      <div className="mt-4">
        <h3 className="font-semibold mb-2">Rondas</h3>
        <div className="divide-y divide-slate-200">
          {history.map((h, i) => (
            <div key={i} className="py-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div className="text-sm text-slate-700">
                <span className="font-medium">{h.category.left}</span> ↔ <span className="font-medium">{h.category.right}</span>
                {h.clue ? <span className="ml-2 text-slate-500">“{h.clue}”</span> : null}
              </div>
              <div className="text-sm text-slate-600">Objetivo {Math.round(h.target*100)}% · Adivinaron {Math.round(h.guess*100)}% → <strong>+{h.points}</strong></div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6 flex gap-2">
        <button onClick={onRestart} className="px-4 py-2 rounded-xl bg-slate-900 text-white shadow hover:opacity-90">Volver a la portada</button>
      </div>
    </div>
  );
}
