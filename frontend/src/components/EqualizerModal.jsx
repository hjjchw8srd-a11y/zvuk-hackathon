import { useState, useEffect, useRef, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  SlidersHorizontal,
  RotateCcw,
  Power,
  Volume2,
  Sparkles,
  Music4,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  audioService,
  EQUALIZER_FREQUENCIES,
  EQUALIZER_PRESETS,
} from "@/lib/audioService";

/**
 * Vertical slider with touch/drag support and 0 dB baseline fill
 */
function VerticalBandSlider({
  bandIndex,
  label,
  sub,
  value,
  disabled,
  onChange,
}) {
  const trackRef = useRef(null);
  const isDraggingRef = useRef(false);

  // Convert value (-12 to +12) to percentage from bottom (0% to 100%)
  const percentage = Math.max(0, Math.min(100, ((value + 12) / 24) * 100));

  const updateFromPointer = useCallback(
    (clientY) => {
      if (!trackRef.current || disabled) return;
      const rect = trackRef.current.getBoundingClientRect();
      // clientY = top (highest val = +12) to bottom (lowest val = -12)
      const ratio = 1 - (clientY - rect.top) / rect.height;
      const clampedRatio = Math.max(0, Math.min(1, ratio));
      const val = Math.round((clampedRatio * 24 - 12) * 10) / 10;
      onChange(bandIndex, Math.max(-12, Math.min(12, val)));
    },
    [bandIndex, disabled, onChange]
  );

  const handlePointerDown = (e) => {
    if (disabled) return;
    isDraggingRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    updateFromPointer(e.clientY);
  };

  const handlePointerMove = (e) => {
    if (isDraggingRef.current) {
      updateFromPointer(e.clientY);
    }
  };

  const handlePointerUp = (e) => {
    if (isDraggingRef.current) {
      isDraggingRef.current = false;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {}
    }
  };

  // Zero dB is at 50%
  const isPositive = value > 0;
  const fillBottom = isPositive ? 50 : percentage;
  const fillHeight = isPositive ? percentage - 50 : 50 - percentage;

  const displayDb = value > 0 ? `+${value} dB` : `${value} dB`;

  return (
    <div className="flex flex-col items-center flex-1 min-w-[50px] select-none group">
      {/* Current dB badge */}
      <span
        className={cn(
          "text-[11px] font-bold font-mono px-1.5 py-0.5 rounded mb-2 transition-all tabular-nums",
          disabled
            ? "text-neutral-600 bg-neutral-900 border border-neutral-800"
            : value !== 0
            ? "text-[#a3e635] bg-[#1c231d] border border-[#2e402d] shadow-sm shadow-[#a3e635]/10"
            : "text-neutral-400 bg-neutral-800/80 border border-neutral-700/60"
        )}
      >
        {displayDb}
      </span>

      {/* Interactive Vertical Slider Track */}
      <div
        ref={trackRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className={cn(
          "relative w-7 h-44 rounded-full flex items-center justify-center cursor-pointer transition-colors touch-none",
          disabled
            ? "bg-neutral-900 border border-neutral-800 cursor-not-allowed opacity-50"
            : "bg-[#181818] border border-[#2b2b2b] hover:border-[#3c3c3c]"
        )}
        title={`${label} (${sub}): ${displayDb}`}
      >
        {/* Zero level reference tick in middle */}
        <div className="absolute top-1/2 left-0 right-0 h-[1.5px] -translate-y-1/2 bg-neutral-700/80 z-0 pointer-events-none" />

        {/* Dynamic active fill from 0 dB center */}
        {!disabled && value !== 0 && (
          <div
            className={cn(
              "absolute left-1.5 right-1.5 rounded-full transition-all pointer-events-none",
              isPositive ? "bg-gradient-to-t from-[#65a30d] to-[#a3e635]" : "bg-gradient-to-b from-[#65a30d] to-[#365314]"
            )}
            style={{
              bottom: `${fillBottom}%`,
              height: `${fillHeight}%`,
            }}
          />
        )}

        {/* Center vertical groove line */}
        <div className="w-1 h-full rounded-full bg-neutral-800/70 pointer-events-none" />

        {/* Draggable thumb knob */}
        <div
          className={cn(
            "absolute left-1/2 -translate-x-1/2 w-6 h-6 rounded-full border shadow-md flex items-center justify-center transition-transform pointer-events-none",
            disabled
              ? "bg-neutral-800 border-neutral-700"
              : "bg-white border-[#a3e635] shadow-[#a3e635]/30 group-hover:scale-105 active:scale-95"
          )}
          style={{
            bottom: `calc(${percentage}% - 12px)`,
          }}
        >
          <div
            className={cn(
              "w-2 h-2 rounded-full",
              disabled ? "bg-neutral-600" : "bg-[#171717]"
            )}
          />
        </div>
      </div>

      {/* Frequency label and sub-label */}
      <div className="text-center mt-3">
        <p className="text-xs font-bold text-white tracking-wide">{label}</p>
        <p className="text-[10px] text-neutral-400 mt-0.5">{sub}</p>
      </div>
    </div>
  );
}

export function EqualizerModal({ open, onOpenChange }) {
  const [eqState, setEqState] = useState(() => audioService.getEqualizerState());

  useEffect(() => {
    const unsubscribe = audioService.subscribeEqualizer((newState) => {
      setEqState(newState);
    });
    return () => unsubscribe();
  }, []);

  const handleBandChange = (index, val) => {
    audioService.setBandGain(index, val);
  };

  const handlePresetSelect = (presetName) => {
    audioService.setPreset(presetName);
  };

  const handleToggleEnable = () => {
    audioService.setEqualizerEnabled(!eqState.isEnabled);
  };

  const handleReset = () => {
    audioService.resetEqualizer();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[620px] bg-[#141414] border-[#262626] text-white p-6 shadow-2xl rounded-3xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 pb-4 border-b border-[#242424]">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-[#1c231d] border border-[#2e402d] text-[#a3e635] flex items-center justify-center shadow-lg shadow-[#a3e635]/10">
              <SlidersHorizontal size={22} />
            </div>
            <div>
              <DialogTitle className="text-xl font-bold text-white m-0 tracking-tight flex items-center gap-2">
                Эквалайзер
                {eqState.isEnabled && (
                  <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-[#1c231d] border border-[#2e402d] text-[#a3e635]">
                    Active
                  </span>
                )}
              </DialogTitle>
              <DialogDescription className="text-xs text-neutral-400 m-0 mt-0.5">
                5-полосный аудиофильский фильтр Web Audio API в реальном времени
              </DialogDescription>
            </div>
          </div>

          {/* Master Enable/Disable Toggle */}
          <button
            type="button"
            onClick={handleToggleEnable}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer mr-6 select-none",
              eqState.isEnabled
                ? "bg-[#1c231d] border-[#2e402d] text-[#a3e635] hover:bg-[#243025]"
                : "bg-neutral-800/80 border-neutral-700 text-neutral-400 hover:text-white"
            )}
            title={eqState.isEnabled ? "Выключить эквалайзер" : "Включить эквалайзер"}
          >
            <Power size={14} className={eqState.isEnabled ? "text-[#a3e635]" : "text-neutral-400"} />
            <span>{eqState.isEnabled ? "Включен" : "Выключен"}</span>
          </button>
        </div>

        {/* Presets List */}
        <div className="pt-2">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-400 flex items-center gap-1.5">
              <Sparkles size={12} className="text-[#a3e635]" /> Пресеты звучания
            </p>
            {eqState.activePreset === "Custom" && (
              <span className="text-[11px] text-amber-400 font-medium">
                Пользовательская настройка
              </span>
            )}
          </div>

          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {Object.keys(EQUALIZER_PRESETS).map((key) => {
              const isActive = eqState.activePreset === key && eqState.isEnabled;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => handlePresetSelect(key)}
                  className={cn(
                    "py-2 px-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer text-center truncate select-none",
                    isActive
                      ? "bg-[#a3e635] text-black border-[#a3e635] shadow-md shadow-[#a3e635]/20 font-bold"
                      : "bg-[#1a1a1a] border-[#292929] text-neutral-300 hover:text-white hover:bg-[#222222] hover:border-[#383838]"
                  )}
                >
                  {key}
                </button>
              );
            })}
          </div>
        </div>

        {/* Sliders Container with dB scale */}
        <div className="relative bg-[#101010] border border-[#222222] rounded-3xl p-5 my-2">
          {/* Reference dB scale on left side */}
          <div className="absolute left-3 top-12 bottom-16 flex flex-col justify-between text-[9px] font-mono text-neutral-600 pointer-events-none select-none">
            <span>+12 dB</span>
            <span>+6 dB</span>
            <span className="text-neutral-500 font-bold">0 dB</span>
            <span>-6 dB</span>
            <span>-12 dB</span>
          </div>

          {/* 5 Vertical Sliders */}
          <div className="flex items-center justify-around pl-10 pr-2">
            {EQUALIZER_FREQUENCIES.map((freq, idx) => (
              <VerticalBandSlider
                key={freq.freq}
                bandIndex={idx}
                label={freq.label}
                sub={freq.sub}
                value={eqState.bands[idx] ?? 0}
                disabled={!eqState.isEnabled}
                onChange={handleBandChange}
              />
            ))}
          </div>
        </div>

        {/* Footer: Reset Button & Hint */}
        <div className="flex items-center justify-between pt-2 border-t border-[#242424] text-xs">
          <div className="flex items-center gap-1.5 text-neutral-500">
            <Music4 size={14} className="text-[#a3e635]" />
            <span>Плавная регулировка без щелчков и задержек</span>
          </div>

          <button
            type="button"
            onClick={handleReset}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white transition-colors cursor-pointer font-medium select-none"
            title="Сбросить все полосы в 0 dB"
          >
            <RotateCcw size={13} />
            <span>Сброс</span>
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default EqualizerModal;
