type Props = {
  checked?: boolean;
  label: string;
};

export function Checkbox({ checked = false, label }: Props) {
  return (
    <label className="flex items-center gap-3 text-[14px] text-warm-ivory/85">
      <span
        aria-hidden
        className={
          "flex h-[18px] w-[18px] items-center justify-center rounded-[3px] border transition-colors duration-300 ease-atmospheric " +
          (checked
            ? "border-warm-ivory/80 bg-transparent"
            : "border-warm-ivory/40")
        }
      >
        {checked ? (
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-warm-ivory"
          >
            <path d="M5 12l5 5L20 7" />
          </svg>
        ) : null}
      </span>
      <span>{label}</span>
    </label>
  );
}
