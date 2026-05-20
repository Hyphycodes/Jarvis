export function Divider({ inset = false }: { inset?: boolean }) {
  return (
    <hr
      className={
        "border-0 bg-divider h-px " + (inset ? "mx-6 my-6" : "w-full my-6")
      }
    />
  );
}
