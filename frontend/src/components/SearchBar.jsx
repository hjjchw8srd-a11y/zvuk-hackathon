import { useState, useRef } from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

export function SearchBar({
  value,
  onChange,
  onSearch,
  placeholder = "Найти трек",
  className,
  ...props
}) {
  const [internalValue, setInternalValue] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef(null);

  const query = value !== undefined ? value : internalValue;

  const handleChange = (e) => {
    const val = e.target.value;
    if (value === undefined) setInternalValue(val);
    onChange?.(val);
  };

  const handleClear = () => {
    if (value === undefined) setInternalValue("");
    onChange?.("");
    inputRef.current?.focus();
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      onSearch?.(query);
    }
  };

  const isCentered = !isFocused && !query;

  return (
    <div
      role="search"
      onClick={() => inputRef.current?.focus()}
      className={cn(
        "relative flex items-center w-full h-11 rounded-full bg-[#1a1a1a] hover:bg-[#222222] focus-within:bg-[#222222] transition-colors px-4 cursor-text select-none",
        className
      )}
      {...props}
    >
      {/* По центру в неактивном состоянии (когда поле пустое и нет фокуса) */}
      {isCentered && (
        <div className="absolute inset-0 flex items-center justify-center gap-2 pointer-events-none text-white text-sm">
          <Search className="h-4 w-4 shrink-0 text-white" />
          <span className="font-normal truncate">{placeholder}</span>
        </div>
      )}

      {/* Иконка слева в активном состоянии (фокус или введен текст) */}
      {!isCentered && (
        <Search className="h-4 w-4 shrink-0 text-neutral-400 mr-2.5 pointer-events-none" />
      )}

      {/* Поле ввода */}
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={handleChange}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        onKeyDown={handleKeyDown}
        placeholder={isCentered ? "" : placeholder}
        className={cn(
          "w-full h-full bg-transparent text-white text-sm placeholder-neutral-400 outline-none",
          isCentered && "opacity-0"
        )}
      />

      {/* Кнопка быстрой очистки при наличии текста */}
      {query && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleClear();
          }}
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-neutral-400 hover:text-white hover:bg-neutral-700/60 transition-colors cursor-pointer ml-2"
          title="Очистить"
          aria-label="Очистить поиск"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

export { SearchBar as SearchInput, SearchBar as MusicSearch };
export default SearchBar;
