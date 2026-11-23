"use client";

const HEX = /^#[0-9a-fA-F]{6}$/;

export function ColorField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const valid = HEX.test(value);
  return (
    <div className="flex items-center gap-2.5">
      <input
        type="color"
        aria-label={`${label} — seletor`}
        value={valid ? value : "#000000"}
        onChange={(e) => onChange(e.target.value.toUpperCase())}
        className="h-10 w-12 flex-none cursor-pointer rounded-lg border border-line-field bg-surface p-1"
      />
      <div className="flex min-w-0 flex-col">
        <label htmlFor={id} className="text-[13px] font-semibold">
          {label}
        </label>
        <input
          id={id}
          value={value}
          maxLength={7}
          onChange={(e) => onChange(e.target.value.trim())}
          aria-invalid={!valid}
          className={`h-8 w-28 rounded-md border px-2 font-mono text-xs ${
            valid ? "border-line-field" : "border-discard text-discard"
          }`}
        />
      </div>
    </div>
  );
}
